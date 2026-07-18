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

export async function migrate(db: Client): Promise<void> {
  const schema = await Bun.file(SCHEMA_PATH).text();
  await db.executeMultiple(schema);
}
