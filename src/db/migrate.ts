/**
 * DB 스키마를 Supabase에 적용하는 마이그레이션 스크립트
 *
 * 사용법:
 *   npm run migrate
 *
 * 필요한 환경변수 (.env):
 *   MIGRATE_DB_URL — Supabase Session Pooler URL (포트 5432)
 *     Supabase Dashboard → Settings → Database → Connection pooling
 *     → "Session" 탭 → 연결 문자열 복사
 *     형식: postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
 *
 *   DATABASE_URL 은 Transaction Pooler (포트 6543) 로 설정 — 서버 런타임용
 */
import { readFileSync } from "fs";
import { join }         from "path";
import { Pool }         from "pg";
import dotenv           from "dotenv";

dotenv.config();

const url = process.env.MIGRATE_DB_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error("오류: MIGRATE_DB_URL 또는 DATABASE_URL 환경변수가 없습니다.");
  process.exit(1);
}

async function migrate() {
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  console.log("DB 연결 중...");
  const client = await pool.connect();

  try {
    const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");
    console.log("스키마 적용 중...");
    await client.query(sql);
    console.log("스키마 적용 완료!");
  } catch (err) {
    console.error("마이그레이션 실패:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
