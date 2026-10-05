// Structured JSON lines to stdout (OPS-03). One line per semantic event,
// never per pointer move or physics frame. Never pass passwords, cookies,
// recovery codes, raw invite tokens or private geometry here.
export interface LogFields {
  event: string;
  level?: "info" | "warn" | "error";
  actorId?: string | null;
  workId?: string | null;
  commandId?: string;
  correlationId?: string;
  epoch?: number;
  seq?: number;
  outcome?: string;
  code?: string;
  durationMs?: number;
  source?: "server" | "client-reported";
  [key: string]: unknown;
}

const FORBIDDEN = /password|token|cookie|recovery|secret|csrf/i;

export function log(fields: LogFields): void {
  const { level = "info", ...rest } = fields;
  const line: Record<string, unknown> = { time: new Date().toISOString(), level };
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (FORBIDDEN.test(k)) continue; // defence in depth: credentials never reach logs
    line[k] = v;
  }
  if (!line.source) line.source = "server";
  process.stdout.write(JSON.stringify(line) + "\n");
}
