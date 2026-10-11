// Summarises docs/evidence/crit-9-local-multiplayer/<run-id>/timing-samples.csv.
//   node scripts/crit9/summarize-timing.ts <run evidence dir>
// Percentiles are nearest-rank (p = sorted[ceil(p * n) - 1]). Missing receiver
// observations are counted, never dropped or replaced with a latency.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/crit9/summarize-timing.ts <evidence dir>");
const [head, ...lines] = readFileSync(join(dir, "timing-samples.csv"), "utf8").trim().split("\n");
const cols = head!.split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
const num = (v: string | undefined): number | null => (v === undefined || v === "" ? null : Number(v));
const rank = (xs: number[], p: number): number => xs[Math.max(0, Math.ceil(p * xs.length) - 1)]!;
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? { n: s.length, median: rank(s, 0.5), p95: rank(s, 0.95), max: s[s.length - 1]!, over1000: s.filter((x) => x > 1000).length } : { n: 0 };
};

const out: Record<string, unknown>[] = [];
const groups: [string, (r: Record<string, string>) => boolean][] = [
  ["A→B and A→C", (r) => r.sender === "A"],
  ["B→A and B→C", (r) => r.sender === "B"],
  ["C→A and C→B (extra)", (r) => r.sender === "C"],
  ["all", () => true],
];
for (const [name, pick] of groups) {
  const sel = rows.filter(pick);
  const accepted = sel.filter((r) => r.accepted === "true");
  const metrics = { clickToRender: [] as number[], serverToRender: [] as number[], receiptToRender: [] as number[], clickToReceipt: [] as number[] };
  let expected = 0;
  let missing = 0;
  for (const r of accepted) {
    for (const rcv of ["A", "B", "C"].filter((x) => x !== r.sender)) {
      expected++;
      const rend = num(r[`${rcv}_rendered`]);
      const recv = num(r[`${rcv}_received`]);
      if (rend == null) {
        missing++;
        continue;
      }
      metrics.clickToRender.push(rend - num(r.clickAt)!);
      if (num(r.serverAcceptedAt) != null) metrics.serverToRender.push(rend - num(r.serverAcceptedAt)!);
      if (recv != null) {
        metrics.receiptToRender.push(rend - recv);
        metrics.clickToReceipt.push(recv - num(r.clickAt)!);
      }
    }
  }
  out.push({
    group: name,
    attempted: sel.length,
    accepted: accepted.length,
    rejected: sel.length - accepted.length,
    expectedReceiverObservations: expected,
    rendered: expected - missing,
    missingWithin5s: missing,
    clickToRender: stats(metrics.clickToRender),
    serverToRender: stats(metrics.serverToRender),
    clickToReceipt: stats(metrics.clickToReceipt),
    receiptToRender: stats(metrics.receiptToRender),
  });
}
writeFileSync(join(dir, "timing-summary.json"), JSON.stringify(out, null, 2));
const f = (x: number | undefined): string => (x == null ? "–" : x.toFixed(1));
for (const g of out as any[]) {
  console.log(`${g.group}: attempted ${g.attempted}, accepted ${g.accepted}, expected obs ${g.expectedReceiverObservations}, rendered ${g.rendered}, missing ${g.missingWithin5s}`);
  for (const m of ["clickToRender", "serverToRender", "clickToReceipt", "receiptToRender"]) {
    const s = g[m];
    console.log(`  ${m}: n=${s.n} median=${f(s.median)} p95=${f(s.p95)} max=${f(s.max)} >1000=${s.over1000 ?? "–"}`);
  }
}
