import { Router, type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = Router();

const UpdateProfileSchema = z.object({
  display_name:          z.string().min(1).max(50).optional(),
  bio:                   z.string().max(500).optional(),
  donation_link:         z.string().url().max(300).nullable().optional(),
  donation_label:        z.string().max(50).nullable().optional(),
  notification_settings: z.record(z.string(), z.boolean()).optional(),
});

/* ─── GET /api/users/me ──────────────────────────── */
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const profile = await queryOne(
    "SELECT * FROM profiles WHERE id = $1",
    [req.userId]
  );
  if (!profile) return res.status(404).json({ error: "프로필을 찾을 수 없습니다." });
  res.json({ data: profile });
});

/* ─── PATCH /api/users/me ────────────────────────── */
router.patch("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updates = parsed.data;
  const fields: string[] = [];
  const params: unknown[] = [];

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      // jsonb 컬럼은 문자열로 직렬화
      params.push(key === "notification_settings" ? JSON.stringify(val) : val);
      fields.push(`${key} = $${params.length}`);
    }
  }
  if (!fields.length) return res.status(400).json({ error: "변경할 내용이 없습니다." });

  params.push(new Date().toISOString(), req.userId);
  fields.push(`updated_at = $${params.length - 1}`);

  const profile = await queryOne(
    `UPDATE profiles SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  res.json({ data: profile });
});

/* ─── GET /api/users/me/calendar ──────────────────── */
router.get("/me/calendar", requireAuth, async (req: AuthRequest, res: Response) => {
  const chapters = await query(
    `SELECT c.id, c.novel_id, c.number, c.title, c.is_public, c.scheduled_at,
            c.created_at, c.updated_at, n.title AS novel_title
     FROM chapters c
     JOIN novels n ON n.id = c.novel_id
     WHERE n.author_id = $1
     ORDER BY COALESCE(c.scheduled_at, c.updated_at) ASC`,
    [req.userId]
  );

  const novels = await query(
    `SELECT id, title FROM novels WHERE author_id = $1 ORDER BY updated_at DESC`,
    [req.userId]
  );

  res.json({ data: chapters, novels });
});

/* ─── GET /api/users/me/subscriptions ───────────── */
router.get("/me/subscriptions", requireAuth, async (req: AuthRequest, res: Response) => {
  const subs = await query(
    `SELECT
       n.id, n.title, n.cover_url, n.genre, n.status, n.chapter_count,
       p.display_name AS author_name,
       (SELECT MAX(ch.number) FROM chapters ch WHERE ch.novel_id = n.id AND ch.is_public = true)
         AS latest_chapter,
       s.created_at AS subscribed_at
     FROM subscriptions s
     JOIN novels n ON n.id = s.novel_id
     JOIN profiles p ON p.id = n.author_id
     WHERE s.user_id = $1
     ORDER BY n.updated_at DESC`,
    [req.userId]
  );
  res.json({ data: subs });
});

/* ─── POST /api/users/me/subscriptions/:novelId ─── */
router.post("/me/subscriptions/:novelId", requireAuth, async (req: AuthRequest, res: Response) => {
  const { novelId } = req.params;

  // Check novel exists
  const novel = await queryOne("SELECT id FROM novels WHERE id = $1 AND is_public = true", [novelId]);
  if (!novel) return res.status(404).json({ error: "소설을 찾을 수 없습니다." });

  await query(
    "INSERT INTO subscriptions (user_id, novel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [req.userId, novelId]
  );
  res.json({ message: "구독했습니다." });
});

/* ─── DELETE /api/users/me/subscriptions/:novelId ── */
router.delete("/me/subscriptions/:novelId", requireAuth, async (req: AuthRequest, res: Response) => {
  await query(
    "DELETE FROM subscriptions WHERE user_id = $1 AND novel_id = $2",
    [req.userId, req.params.novelId]
  );
  res.json({ message: "구독을 취소했습니다." });
});

export default router;
