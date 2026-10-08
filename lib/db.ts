import { Pool } from "pg";
import { getEnv } from "./env";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const env = getEnv();

    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      ssl: env.DATABASE_SSL
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    });
  }

  return pool;
}
