import path from "node:path";
import { fileURLToPath } from "node:url";

/** Where drizzle-kit writes the SQL migrations. */
export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
