import { Router, type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = Router();

const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  bio:          z.string().max(500).optional(),
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
      params.push(val);
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
