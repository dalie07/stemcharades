import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema.js";

import { MIGRATIONS_DIR } from "./paths.js";

/** Connect to Postgres (Neon) and bring the schema up to date. Throws if it cannot, so the caller can run without it. */
export async function connectDb(url: string) {
  // Neon requires TLS. The pool is small: the free instance has little memory to spare.
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 8000,
    ssl: url.includes("localhost") ? false : { rejectUnauthorized: true },
  });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, close: () => pool.end() };
}
