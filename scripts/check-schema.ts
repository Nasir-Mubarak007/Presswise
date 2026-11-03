import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const r = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  );
  console.log(r.rows.map((row) => row.table_name).join("\n"));
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});