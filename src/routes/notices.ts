import express, { type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = express.Router({ mergeParams: true });

const NoticeSchema = z.object({
  title:     z.string().min(1).max(200),
  content:   z.string().min(1).max(10000),
  is_pinned: z.boolean().default(false),
});

async function checkOwnership(novelId: string, userId: string): Promise<boolean> {
  const novel = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [novelId]
  );
  return novel?.author_id === userId;
}

/* ─── GET /api/novels/:novelId/notices ──────────────── */
router.get("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  const { novelId } = req.params;

  const rows = await query(
    "SELECT * FROM notices WHERE novel_id = $1 ORDER BY is_pinned DESC, created_at DESC",
    [novelId]
  );
  res.json({ data: rows });
});

/* ─── GET /api/novels/:novelId/notices/:id ──────────── */
router.get("/:id", optionalAuth, async (req: AuthRequest, res: Response) => {
  const { novelId, id } = req.params;

  const notice = await queryOne(
    `SELECT nt.*, n.title AS novel_title
     FROM notices nt
     JOIN novels n ON n.id = nt.novel_id
     WHERE nt.id = $1 AND nt.novel_id = $2`,
    [id, novelId]
  );
  if (!notice) return res.status(404).json({ error: "공지사항을 찾을 수 없습니다." });

  res.json({ data: notice });
});

/* ─── POST /api/novels/:novelId/notices ─────────────── */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  const parsed = NoticeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const row = await queryOne(
    `INSERT INTO notices (novel_id, title, content, is_pinned)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [novelId, parsed.data.title, parsed.data.content, parsed.data.is_pinned]
  );
  res.status(201).json({ data: row });
});

/* ─── PUT /api/novels/:novelId/notices/:id ──────────── */
router.put("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  const id      = req.params.id      as string;
  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  const parsed = NoticeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const row = await queryOne(
    `UPDATE notices SET title = $1, content = $2, is_pinned = $3, updated_at = NOW()
     WHERE id = $4 AND novel_id = $5 RETURNING *`,
    [parsed.data.title, parsed.data.content, parsed.data.is_pinned, id, novelId]
  );
  if (!row) return res.status(404).json({ error: "공지사항을 찾을 수 없습니다." });
  res.json({ data: row });
});

/* ─── DELETE /api/novels/:novelId/notices/:id ───────── */
router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  const id      = req.params.id      as string;
  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  await query("DELETE FROM notices WHERE id = $1 AND novel_id = $2", [id, novelId]);
  res.json({ message: "삭제되었습니다." });
});

export default router;
