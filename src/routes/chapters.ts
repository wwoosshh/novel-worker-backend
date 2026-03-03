import express, { type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = express.Router({ mergeParams: true });

const SaveChapterSchema = z.object({
  title:        z.string().min(1).max(200),
  content:      z.record(z.string(), z.unknown()),  // Tiptap JSON
  content_text: z.string().optional(),          // plain text for search
  is_public:    z.boolean().default(false),
});

/* ─── GET /api/novels/:novelId/chapters ──────────── */
router.get("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  const { novelId } = req.params;

  // Check novel access
  const novel = await queryOne<{ author_id: string; is_public: boolean }>(
    "SELECT author_id, is_public FROM novels WHERE id = $1",
    [novelId]
  );
  if (!novel) return res.status(404).json({ error: "소설을 찾을 수 없습니다." });

  const isAuthor = novel.author_id === req.userId;
  const onlyPublic = !isAuthor;

  const chapters = await query(
    `SELECT id, number, title, is_public, is_paid, view_count, created_at, updated_at
     FROM chapters
     WHERE novel_id = $1 ${onlyPublic ? "AND is_public = true" : ""}
     ORDER BY number ASC`,
    [novelId]
  );

  res.json({ data: chapters });
});

/* ─── GET /api/novels/:novelId/chapters/:number ──── */
router.get("/:number", optionalAuth, async (req: AuthRequest, res: Response) => {
  const novelId    = req.params.novelId as string;
  const chapterNum = parseInt(req.params.number as string);

  const novel = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [novelId]
  );
  if (!novel) return res.status(404).json({ error: "소설을 찾을 수 없습니다." });

  const isAuthor = novel.author_id === req.userId;

  const chapter = await queryOne(
    `SELECT c.*, n.title AS novel_title, n.chapter_count AS novel_chapter_count
     FROM chapters c
     JOIN novels n ON n.id = c.novel_id
     WHERE c.novel_id = $1 AND c.number = $2
       ${isAuthor ? "" : "AND c.is_public = true"}`,
    [novelId, chapterNum]
  );

  if (!chapter) return res.status(404).json({ error: "화를 찾을 수 없습니다." });

  // Increment view count only for non-author readers
  if (!isAuthor) {
    query("UPDATE chapters SET view_count = view_count + 1 WHERE id = $1", [(chapter as any).id]).catch(() => {});
  }

  res.json({ data: chapter });
});

/* ─── POST /api/novels/:novelId/chapters ─────────── */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const { novelId } = req.params;

  const novel = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [novelId]
  );
  if (!novel)              return res.status(404).json({ error: "소설을 찾을 수 없습니다." });
  if (novel.author_id !== req.userId) return res.status(403).json({ error: "권한이 없습니다." });

  // Get next number
  const countRow = await queryOne<{ count: string }>(
    "SELECT COUNT(*) AS count FROM chapters WHERE novel_id = $1",
    [novelId]
  );
  const nextNumber = parseInt(countRow?.count ?? "0") + 1;

  const chapter = await queryOne(
    `INSERT INTO chapters (novel_id, number, title, content, is_public)
     VALUES ($1, $2, $3, '{}', false)
     RETURNING *`,
    [novelId, nextNumber, `${nextNumber}화`]
  );

  // Update chapter_count on novel
  await query(
    "UPDATE novels SET chapter_count = chapter_count + 1, updated_at = NOW() WHERE id = $1",
    [novelId]
  );

  res.status(201).json({ data: chapter });
});

/* ─── PUT /api/novels/:novelId/chapters/:id ──────── */
router.put("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const { novelId, id } = req.params;

  const novel = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [novelId]
  );
  if (!novel)              return res.status(404).json({ error: "소설을 찾을 수 없습니다." });
  if (novel.author_id !== req.userId) return res.status(403).json({ error: "권한이 없습니다." });

  const parsed = SaveChapterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { title, content, content_text, is_public } = parsed.data;

  const chapter = await queryOne(
    `UPDATE chapters
     SET title = $1, content = $2, content_text = $3, is_public = $4, updated_at = NOW()
     WHERE id = $5 AND novel_id = $6
     RETURNING *`,
    [title, JSON.stringify(content), content_text ?? null, is_public, id, novelId]
  );

  if (!chapter) return res.status(404).json({ error: "화를 찾을 수 없습니다." });

  // Update novel updated_at
  await query("UPDATE novels SET updated_at = NOW() WHERE id = $1", [novelId]);

  res.json({ data: chapter });
});

/* ─── DELETE /api/novels/:novelId/chapters/:id ───── */
router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const { novelId, id } = req.params;

  const novel = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [novelId]
  );
  if (!novel)              return res.status(404).json({ error: "소설을 찾을 수 없습니다." });
  if (novel.author_id !== req.userId) return res.status(403).json({ error: "권한이 없습니다." });

  await query("DELETE FROM chapters WHERE id = $1 AND novel_id = $2", [id, novelId]);
  await query(
    "UPDATE novels SET chapter_count = GREATEST(chapter_count - 1, 0), updated_at = NOW() WHERE id = $1",
    [novelId]
  );

  res.json({ message: "삭제되었습니다." });
});

export default router;
