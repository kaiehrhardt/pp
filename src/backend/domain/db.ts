import { createClient, type Client } from "@libsql/client";

const SCHEMA_PATH = `${import.meta.dir}/schema.sql`;

export function createDb(
  url: string = process.env.TURSO_DATABASE_URL ?? "file:./dev.db",
  authToken: string | undefined = process.env.TURSO_AUTH_TOKEN,
): Client {
  // store.ts's Tier-1 writers write-then-immediately-read to build the broadcast
  // payload; readYourWrites keeps that consistent even against a remote/HTTP client
  // where each execute() is documented as its own logical connection.
  //
  // `timeout` only applies to local `file:` databases (remote Turso ignores it and
  // queues write transactions server-side instead). Without it, SQLite's default
  // busy-timeout is 0 — concurrent local writers fail with SQLITE_BUSY instantly.
  // Deliberately generous here: @libsql/client's local-file Transaction.close() only
  // issues a ROLLBACK, it never actually releases the underlying native connection
  // (confirmed against its source — every failed attempt leaks one), so store.ts's
  // retry loop must lean on SQLite waiting *inside* one connection via this timeout
  // rather than retrying-with-a-new-connection often, or the leak compounds under
  // concurrent load. This only affects local dev/test; production Turso is remote/HTTP
  // and has no such connection to leak.
  return createClient({ url, authToken, readYourWrites: true, timeout: 2000 });
}

// `CREATE TABLE IF NOT EXISTS` (schema.sql) only helps brand-new tables — it's a
// no-op against a `rooms` table that already exists from before a column was added,
// so an already-deployed database needs that column bolted on separately. Checked via
// PRAGMA table_info rather than just trying the ALTER TABLE and swallowing "duplicate
// column", since migrate() runs on every boot and duplicate-column is not a safe error
// to blanket-ignore (it'd also hide a genuine typo in `definition`).
async function ensureColumn(db: Client, table: string, column: string, definition: string): Promise<void> {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((row) => (row as unknown as { name: string }).name === column);
  if (!exists) await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function migrate(db: Client): Promise<void> {
  const schema = await Bun.file(SCHEMA_PATH).text();
  await db.executeMultiple(schema);
  await ensureColumn(db, "rooms", "reactions_thrown", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "rooms", "duels_completed", "INTEGER NOT NULL DEFAULT 0");
}
