// Before reopening service on a restored backup: copy the account-deletion
// records from the database being replaced into the restored one. On its next
// start the server deletes those accounts again, before it accepts requests,
// so a backup can't bring back an account deleted after it was taken (ADR-0007).
//   node scripts/carry-deletions.ts <current stillwood.db> <restored data dir>
// The restored directory is migrated first if it predates account deletion.
import Database from "better-sqlite3";
import { openDatabase } from "../src/server/db/db.ts";

const [from, toDir] = process.argv.slice(2);
if (!from || !toDir) {
  console.error("usage: node scripts/carry-deletions.ts <current stillwood.db> <restored data dir>");
  process.exit(2);
}
const src = new Database(from, { readonly: true, fileMustExist: true });
const hasTable = src.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'account_deletions'").get();
const rows = hasTable ? (src.prepare("SELECT subject_digest, deleted_at FROM account_deletions").all() as { subject_digest: string; deleted_at: number }[]) : [];
src.close();

const dst = openDatabase(toDir);
const insert = dst.prepare("INSERT OR IGNORE INTO account_deletions (subject_digest, deleted_at) VALUES (?, ?)");
const added = dst.transaction(() => rows.reduce((n, r) => n + insert.run(r.subject_digest, r.deleted_at).changes, 0))();
dst.close();
console.log(JSON.stringify({ records: rows.length, added }));
