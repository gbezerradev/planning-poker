import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const migrationPath = process.argv[2];

if (!migrationPath) {
  throw new Error("Informe o caminho do arquivo de migração.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não está configurada.");
}

const sql = await readFile(resolve(migrationPath), "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

try {
  await client.query(sql);
  console.log(`Migração aplicada: ${migrationPath}`);
} finally {
  await client.end();
}
