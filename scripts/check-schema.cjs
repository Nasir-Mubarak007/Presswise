const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://neondb_owner:npg_9HPuesim8qJX@ep-rough-union-za6ulwq7.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
});

(async () => {
  const r = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
  );
  console.log(r.rows.map((x) => x.table_name).join("\n"));
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});