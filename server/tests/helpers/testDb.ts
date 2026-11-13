import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_DIR } from "../../src/db/paths.js";
import * as schema from "../../src/db/schema.js";

/** A real Postgres running in-process, with the real migrations applied. No server or account needed. */
export async function testDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, close: () => client.close() };
}
