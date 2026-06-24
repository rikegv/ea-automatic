import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const { sql, db } = createDb(url, 1);
  console.log("[migrate] aplicando migrations em ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await sql.end();
  console.log("[migrate] concluído.");
}

main().catch((err) => {
  console.error("[migrate] falhou:", err);
  process.exit(1);
});
