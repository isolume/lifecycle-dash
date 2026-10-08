import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "../lib/db";

async function waitForDatabase(maxAttempts = 20, delayMs = 1500): Promise<void> {
  const pool = getPool();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function run(): Promise<void> {
  await waitForDatabase();

  const pool = getPool();
  const client = await pool.connect();

  try {
    const migrationsDir = join(process.cwd(), "db", "migrations");
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await client.query<{ id: string }>(`SELECT id FROM schema_migrations`);
    const existingIds = new Set(existing.rows.map((row) => row.id));

    for (const file of files) {
      if (existingIds.has(file)) {
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf8");
      const migrationClient = await pool.connect();

      try {
        await migrationClient.query("BEGIN");
        await migrationClient.query(sql);
        await migrationClient.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [file]);
        await migrationClient.query("COMMIT");
        console.log(`Applied migration: ${file}`);
      } catch (error) {
        await migrationClient.query("ROLLBACK");
        throw error;
      } finally {
        migrationClient.release();
      }
    }

    console.log("Migrations complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
