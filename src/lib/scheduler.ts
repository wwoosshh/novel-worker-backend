import { query } from "./db";

const INTERVAL_MS = 60_000; // 1분

async function publishScheduledChapters() {
  try {
    const rows = await query<{ id: string; novel_id: string }>(
      `UPDATE chapters
       SET is_public = true, scheduled_at = NULL, updated_at = NOW()
       WHERE scheduled_at <= NOW() AND is_public = false
       RETURNING id, novel_id`
    );

    if (rows.length > 0) {
      // 해당 소설들의 updated_at 갱신
      const novelIds = [...new Set(rows.map((r) => r.novel_id))];
      await Promise.all(
        novelIds.map((nid) =>
          query("UPDATE novels SET updated_at = NOW() WHERE id = $1", [nid])
        )
      );
      console.log(`[Scheduler] Published ${rows.length} chapter(s)`);
    }
  } catch (err) {
    console.error("[Scheduler] Error:", (err as Error).message);
  }
}

export function startScheduler() {
  // 서버 시작 즉시 한 번 실행
  publishScheduledChapters();
  setInterval(publishScheduledChapters, INTERVAL_MS);
  console.log("[Scheduler] Started — checking every 60s");
}
