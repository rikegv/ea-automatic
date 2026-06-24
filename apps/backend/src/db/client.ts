import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>["db"];

/** Cria o cliente Postgres + Drizzle. `max` baixo: Fase 1A é desenvolvimento local. */
export function createDb(connectionString: string, max = 10) {
  const sql = postgres(connectionString, { max });
  const db = drizzle(sql, { schema });
  return { sql, db };
}
