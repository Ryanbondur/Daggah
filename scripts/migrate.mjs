import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim() ?? "";
const files = (await readdir("migrations").catch(() => []))
  .filter((f) => f.endsWith(".sql"))
  .sort();
if (url === "") {
  console.log("migrate: skip (DATABASE_URL unset)");
  process.exit(0);
}
if (files.length === 0) {
  console.log("migrate: nothing to do (no migrations/*.sql)");
  process.exit(0);
}
console.log(`migrate: ${files.length} file(s) under migrations/`);
// The session lock needs a direct connection: DATABASE_URL may go through a
// transaction pooler, which would keep the lock after this script exits.
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED?.trim() || url,
});
await client.connect();
try {
  await client.query("set lock_timeout = '60s'");
  await client.query("select pg_advisory_lock(7272741)");
  await client.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await client.query("select name from schema_migrations")).rows.map((r) => r.name),
  );
  const pending = files.filter((f) => !done.has(f));
  if (pending.length === 0) {
    console.log("migrate: already up to date");
  }
  for (const file of pending) {
    await client.query("begin");
    try {
      await client.query(await readFile(`migrations/${file}`, "utf8"));
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`migrate: applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
