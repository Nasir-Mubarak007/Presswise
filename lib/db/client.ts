import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/lib/db/schema";
import { logger } from "@/lib/log/logger";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.error("config.missing", { event: "config.missing", message: `Missing required env var: ${name}` });
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const pool = new Pool({
  connectionString: required("DATABASE_URL"),
  max: 10,
});

pool.on("error", (err) => {
  logger.error("db.pool_error", { event: "db.pool_error", error: err.message });
});

export const db = drizzle({ client: pool, schema });

export async function closeDb() {
  await pool.end();
}