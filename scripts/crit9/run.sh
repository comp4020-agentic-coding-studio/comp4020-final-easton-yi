#!/usr/bin/env bash
# Crit 9 local multiplayer run, isolated (docs/evidence/crit-9-local-multiplayer-report.md).
#   scripts/crit9/run.sh            # from the repo root, after `pnpm build`
# Re-executes itself with an emptied environment inside a new user + network
# namespace that has only loopback, so neither the server, the test runners nor
# the browser can open any connection off this host. Everything mutable lives in
# a fresh /tmp/stillwood-crit9-<run-id>/ that is removed at the end; only
# sanitized summaries are copied to docs/evidence/crit-9-local-multiplayer/<run-id>/.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd -P)"
NODE_BIN="$(dirname "$(command -v node)")"
BROWSERS="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"

if [[ "${CRIT9_INSIDE:-}" != "1" ]]; then
  RUN_ID="${CRIT9_RUN_ID:-$(date +%Y%m%d-%H%M%S)-$RANDOM}"
  [[ "$RUN_ID" =~ ^[0-9A-Za-z-]+$ ]] || { echo "bad run id" >&2; exit 2; }
  [[ -f "$REPO/dist/server/main.js" && -f "$REPO/dist/client/index.html" ]] || { echo "run pnpm build first" >&2; exit 2; }
  # Only these variables cross into the run; FLY_*, tokens and mise env don't.
  exec env -i PATH="$NODE_BIN:/usr/sbin:/usr/bin:/bin" CRIT9_INSIDE=1 CRIT9_RUN_ID="$RUN_ID" \
    CRIT9_REPO="$REPO" PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" LANG=C.UTF-8 TZ="${TZ:-Australia/Sydney}" \
    unshare --map-root-user --net bash "$0"
fi

RUN_ID="$CRIT9_RUN_ID"
cd "$CRIT9_REPO"
RUN_DIR="$(mktemp -d "/tmp/stillwood-crit9-$RUN_ID-XXXX")"
RUN_DIR="$(realpath -e "$RUN_DIR")"
case "$RUN_DIR" in /tmp/stillwood-crit9-"$RUN_ID"-*) ;; *) echo "run dir escaped /tmp: $RUN_DIR" >&2; exit 3 ;; esac
[[ -L "$RUN_DIR" ]] && { echo "run dir is a symlink" >&2; exit 3; }
EVIDENCE="$CRIT9_REPO/docs/evidence/crit-9-local-multiplayer/$RUN_ID"
mkdir -p "$RUN_DIR"/{data,home,tmp,results} "$EVIDENCE"
export HOME="$RUN_DIR/home" TMPDIR="$RUN_DIR/tmp" CRIT9_RUN_DIR="$RUN_DIR" CRIT9_EVIDENCE_DIR="$EVIDENCE"
manifest() { echo "$1" >> "$EVIDENCE/isolation-manifest.txt"; }
: > "$EVIDENCE/isolation-manifest.txt"

# --- network: loopback only, proven by trying to leave
ip link set lo up
manifest "run_id=$RUN_ID"
manifest "git=$(git rev-parse --short HEAD) branch=$(git rev-parse --abbrev-ref HEAD) dirty_paths=$(git status --porcelain | wc -l)"
manifest "node=$(node --version) playwright=$(node node_modules/@playwright/test/cli.js --version)"
manifest "started=$(date -Iseconds)"
manifest "namespace=user+net (unshare --map-root-user --net); interfaces: $(ip -br link | awk '{print $1}' | tr '\n' ' ')"
if curl -sS -m 3 -o /dev/null http://1.1.1.1/ 2>/dev/null; then echo "external IP reachable: abort" >&2; exit 4; fi
if curl -sS -m 3 -o /dev/null https://example.com/ 2>/dev/null; then echo "external name reachable: abort" >&2; exit 4; fi
manifest "egress_probe=http://1.1.1.1 and https://example.com both failed (no route / no DNS)"
manifest "environment=env -i allowlist: PATH, HOME=<run>/home, TMPDIR=<run>/tmp, LANG, TZ, PLAYWRIGHT_BROWSERS_PATH, CRIT9_*"
manifest "run_dir=/tmp/stillwood-crit9-$RUN_ID-XXXX (realpath checked, not a symlink)"

PORT=18990
start_server() {
  env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NODE_ENV=production COOKIE_SECURE=0 \
    DATA_DIR="$RUN_DIR/data" PORT="$PORT" node dist/server/main.js >> "$RUN_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 100); do curl -sf "http://127.0.0.1:$PORT/readyz" >/dev/null && return 0; sleep 0.1; done
  echo "server did not start" >&2; tail -20 "$RUN_DIR/server.log" >&2; exit 5
}
start_server
DB="$(realpath -e "$RUN_DIR/data/stillwood.db")"
case "$DB" in "$RUN_DIR"/data/*) ;; *) echo "database outside run dir: $DB" >&2; kill "$SERVER_PID"; exit 3 ;; esac
OPEN_DB="$(ls -l /proc/$SERVER_PID/fd 2>/dev/null | grep -o '/[^ ]*stillwood.db$' | sort -u | tr '\n' ' ')"
case "$OPEN_DB" in "$RUN_DIR"/data/stillwood.db*) ;; *) echo "server holds another database: $OPEN_DB" >&2; kill "$SERVER_PID"; exit 3 ;; esac
FLYVARS="$(tr '\0' '\n' < /proc/$SERVER_PID/environ | grep -c '^FLY' || true)"
[[ "$FLYVARS" == "0" ]] || { echo "FLY variables reached the server" >&2; kill "$SERVER_PID"; exit 3; }
manifest "server=production build (dist/server/main.js), NODE_ENV=production COOKIE_SECURE=0, pid=$SERVER_PID, origin=http://127.0.0.1:$PORT"
manifest "database=<run>/data/stillwood.db, fresh, migrated at startup; open fds of pid point only there"
manifest "server_env_FLY_vars=0; test hooks off (production)"
manifest "spawned_servers=tests/integration/crit9-multiplayer.test.ts and tests/*restart*/account-deletion tests start their own on 127.0.0.1 with data dirs under <run>/tmp"

export APP_URL="http://127.0.0.1:$PORT" CRIT9_SERVER_LOG="$RUN_DIR/server.log"
status=0
run() { # name, command...
  local name=$1; shift
  echo "=== $name" | tee -a "$RUN_DIR/results/summary.txt"
  if "$@" > "$RUN_DIR/results/$name.log" 2>&1; then echo "exit=0" >> "$RUN_DIR/results/summary.txt"; else echo "exit=$?" >> "$RUN_DIR/results/summary.txt"; status=1; fi
  grep -E "Tests +[0-9]|Test Files|passed|failed|flaky|skipped" "$RUN_DIR/results/$name.log" | tail -4 >> "$RUN_DIR/results/summary.txt" || true
}
VITEST="node node_modules/vitest/vitest.mjs"
PW="node node_modules/@playwright/test/cli.js"
run browser-crit9 $PW test tests/e2e/crit9-multiplayer.spec.ts --reporter=list --output="$RUN_DIR/pw-crit9"
run protocol-crit9 $VITEST run -c vitest.integration.config.ts tests/integration/crit9-multiplayer.test.ts
run existing-contract $VITEST run spec/collaboration.test.ts spec/placement.test.ts spec/versions.test.ts spec/lifecycle.test.ts spec/account-deletion.test.ts
run existing-restart $VITEST run -c vitest.unit.config.ts tests/restart.test.ts tests/lifecycle-restart.test.ts tests/account-deletion.test.ts
run existing-browser $PW test tests/e2e/together.spec.ts tests/e2e/lifecycle.spec.ts tests/e2e/account-deletion.spec.ts --reporter=list --output="$RUN_DIR/pw-existing"

kill "$SERVER_PID"; wait "$SERVER_PID" 2>/dev/null || true
# --- sanitized artifacts: no cookies, tokens or recovery codes ever reach these files
cp "$RUN_DIR/results/summary.txt" "$EVIDENCE/test-summary.txt"
# full runner output per suite (test names, assertions, timings; no credentials are printed by these suites)
mkdir -p "$EVIDENCE/logs"
for f in "$RUN_DIR"/results/*.log; do sed -E 's/\x1b\[[0-9;]*m//g' "$f" > "$EVIDENCE/logs/$(basename "$f")"; done
find "$RUN_DIR"/pw-* -name error-context.md 2>/dev/null | while read -r f; do cp "$f" "$EVIDENCE/logs/$(basename "$(dirname "$f")" | cut -c1-60)-error-context.md"; done
# the main server's placement lines (synthetic IDs only; actor IDs stripped), for matching by command ID
grep -h '"event":"command.place"' "$RUN_DIR/server.log" | sed -E 's/"actorId":"[^"]*",//' > "$EVIDENCE/server-place-lines.jsonl" || true
manifest "server_place_log_lines=$(wc -l < "$EVIDENCE/server-place-lines.jsonl")"
manifest "external_requests_seen_by_browser=$(cat "$EVIDENCE/browser-hosts.txt" 2>/dev/null || echo 'not recorded')"
manifest "teardown: server pid $SERVER_PID stopped; run dir removed after copy"
manifest "finished=$(date -Iseconds) exit=$status"
case "$RUN_DIR" in /tmp/stillwood-crit9-"$RUN_ID"-*) rm -rf "$RUN_DIR" ;; esac
echo "evidence: $EVIDENCE"
exit $status
