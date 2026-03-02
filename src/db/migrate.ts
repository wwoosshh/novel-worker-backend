/**
 * Run once to apply schema.sql to the Supabase database.
 * Usage: npx ts-node src/db/migrate.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Connecting to database...");
  const client = await pool.connect();

  try {
    const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");
    console.log("Applying schema...");
    await client.query(sql);
    console.log("Schema applied successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
