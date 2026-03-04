import express, { type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = express.Router({ mergeParams: true });

const CreateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

/* ─── GET /:chapterId/comments ──────────────────── */
router.get("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  const { chapterId } = req.params;

  const comments = await query(
    `SELECT c.id, c.chapter_id, c.author_id, c.content, c.created_at, c.updated_at,
            p.display_name AS author_name, p.username AS author_username
     FROM comments c
     JOIN profiles p ON p.id = c.author_id
     WHERE c.chapter_id = $1
     ORDER BY c.created_at ASC`,
    [chapterId]
  );

  res.json({ data: comments });
});

/* ─── POST /:chapterId/comments ─────────────────── */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const { chapterId } = req.params;
  const parsed = CreateCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Verify chapter exists
  const chapter = await queryOne("SELECT id FROM chapters WHERE id = $1", [chapterId]);
  if (!chapter) return res.status(404).json({ error: "챕터를 찾을 수 없습니다." });

  const comment = await queryOne(
    `INSERT INTO comments (chapter_id, author_id, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [chapterId, req.userId, parsed.data.content]
  );

  // Fetch with author info
  const full = await queryOne(
    `SELECT c.id, c.chapter_id, c.author_id, c.content, c.created_at, c.updated_at,
            p.display_name AS author_name, p.username AS author_username
     FROM comments c
     JOIN profiles p ON p.id = c.author_id
     WHERE c.id = $1`,
    [(comment as { id: string }).id]
  );

  res.status(201).json({ data: full });
});

/* ─── DELETE /:chapterId/comments/:id ───────────── */
router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const { chapterId, id } = req.params;

  const comment = await queryOne<{ author_id: string; chapter_id: string }>(
    "SELECT author_id, chapter_id FROM comments WHERE id = $1",
    [id]
  );
  if (!comment || comment.chapter_id !== chapterId) {
    return res.status(404).json({ error: "댓글을 찾을 수 없습니다." });
  }

  // Allow delete if comment author OR novel author
  if (comment.author_id !== req.userId) {
    const isNovelAuthor = await queryOne(
      `SELECT 1 FROM chapters ch
       JOIN novels n ON n.id = ch.novel_id
       WHERE ch.id = $1 AND n.author_id = $2`,
      [chapterId, req.userId]
    );
    if (!isNovelAuthor) {
      return res.status(403).json({ error: "삭제 권한이 없습니다." });
    }
  }

  await query("DELETE FROM comments WHERE id = $1", [id]);
  res.json({ message: "댓글이 삭제되었습니다." });
});

export default router;
