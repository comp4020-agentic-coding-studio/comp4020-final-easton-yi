// Consistent online backup of the SQLite database with SQLite's backup API
// (safe while the app is writing in WAL mode; never just copy the .db file).
//   node scripts/backup.ts [dataDir] [outFile]
// On Fly: flyctl ssh console -a comp4020-final-easton-yi -C "node /app/scripts/backup.ts /data /data/backup-$(date +%F).db"
// A backup on the same volume does not protect against losing the volume;
// copy it off the machine (flyctl ssh sftp get) for that.
import Database from "better-sqlite3";
import { join } from "node:path";

const dataDir = process.argv[2] ?? process.env.DATA_DIR ?? ".data";
const out = process.argv[3] ?? join(dataDir, `backup-${new Date().toISOString().slice(0, 10)}.db`);
const db = new Database(join(dataDir, "stillwood.db"), { readonly: true, fileMustExist: true });
await db.backup(out);
const check = new Database(out, { readonly: true });
const integrity = check.pragma("integrity_check", { simple: true });
const works = (check.prepare("SELECT COUNT(*) AS n FROM works").get() as { n: number }).n;
console.log(JSON.stringify({ out, integrity, works }));
check.close();
db.close();
