import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
});

export default pool;
