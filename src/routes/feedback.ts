import express, { type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = express.Router();

/* ─── Schemas ──────────────────────────────────────── */

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
});

const UpdatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
});

const CreateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

/* ─── GET /api/feedback ────────────────────────────── */
router.get("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const posts = await query(
    `SELECT fp.id, fp.title, fp.author_id, fp.created_at, fp.updated_at,
            p.display_name AS author_name, p.username AS author_username,
            (SELECT count(*) FROM feedback_comments fc WHERE fc.post_id = fp.id)::int AS comment_count
     FROM feedback_posts fp
     JOIN profiles p ON p.id = fp.author_id
     ORDER BY fp.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const totalRow = await queryOne<{ count: number }>(
    "SELECT count(*)::int AS count FROM feedback_posts"
  );

  res.json({ data: posts, total: totalRow?.count ?? 0 });
});

/* ─── POST /api/feedback ───────────────────────────── */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = CreatePostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const post = await queryOne(
    `INSERT INTO feedback_posts (author_id, title, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.userId, parsed.data.title, parsed.data.content]
  );

  res.status(201).json({ data: post });
});

/* ─── GET /api/feedback/:postId ────────────────────── */
router.get("/:postId", optionalAuth, async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;

  const post = await queryOne(
    `SELECT fp.*, p.display_name AS author_name, p.username AS author_username
     FROM feedback_posts fp
     JOIN profiles p ON p.id = fp.author_id
     WHERE fp.id = $1`,
    [postId]
  );

  if (!post) return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });

  res.json({ data: post });
});

/* ─── PATCH /api/feedback/:postId ──────────────────── */
router.patch("/:postId", requireAuth, async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;
  const parsed = UpdatePostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM feedback_posts WHERE id = $1",
    [postId]
  );
  if (!existing) return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
  if (existing.author_id !== req.userId) return res.status(403).json({ error: "수정 권한이 없습니다." });

  const updated = await queryOne(
    `UPDATE feedback_posts SET title = $1, content = $2, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [parsed.data.title, parsed.data.content, postId]
  );

  res.json({ data: updated });
});

/* ─── DELETE /api/feedback/:postId ─────────────────── */
router.delete("/:postId", requireAuth, async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;

  const existing = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM feedback_posts WHERE id = $1",
    [postId]
  );
  if (!existing) return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
  if (existing.author_id !== req.userId) return res.status(403).json({ error: "삭제 권한이 없습니다." });

  await query("DELETE FROM feedback_posts WHERE id = $1", [postId]);
  res.json({ message: "게시글이 삭제되었습니다." });
});

/* ─── GET /api/feedback/:postId/comments ───────────── */
router.get("/:postId/comments", optionalAuth, async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;

  const comments = await query(
    `SELECT fc.id, fc.post_id, fc.author_id, fc.content, fc.created_at,
            p.display_name AS author_name, p.username AS author_username
     FROM feedback_comments fc
     JOIN profiles p ON p.id = fc.author_id
     WHERE fc.post_id = $1
     ORDER BY fc.created_at ASC`,
    [postId]
  );

  res.json({ data: comments });
});

/* ─── POST /api/feedback/:postId/comments ──────────── */
router.post("/:postId/comments", requireAuth, async (req: AuthRequest, res: Response) => {
  const { postId } = req.params;
  const parsed = CreateCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const post = await queryOne("SELECT id FROM feedback_posts WHERE id = $1", [postId]);
  if (!post) return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });

  const comment = await queryOne(
    `INSERT INTO feedback_comments (post_id, author_id, content)
     VALUES ($1, $2, $3) RETURNING *`,
    [postId, req.userId, parsed.data.content]
  );

  const full = await queryOne(
    `SELECT fc.id, fc.post_id, fc.author_id, fc.content, fc.created_at,
            p.display_name AS author_name, p.username AS author_username
     FROM feedback_comments fc
     JOIN profiles p ON p.id = fc.author_id
     WHERE fc.id = $1`,
    [(comment as { id: string }).id]
  );

  res.status(201).json({ data: full });
});

/* ─── DELETE /api/feedback/:postId/comments/:commentId */
router.delete("/:postId/comments/:commentId", requireAuth, async (req: AuthRequest, res: Response) => {
  const { postId, commentId } = req.params;

  const comment = await queryOne<{ author_id: string; post_id: string }>(
    "SELECT author_id, post_id FROM feedback_comments WHERE id = $1",
    [commentId]
  );
  if (!comment || comment.post_id !== postId) {
    return res.status(404).json({ error: "댓글을 찾을 수 없습니다." });
  }
  if (comment.author_id !== req.userId) {
    return res.status(403).json({ error: "삭제 권한이 없습니다." });
  }

  await query("DELETE FROM feedback_comments WHERE id = $1", [commentId]);
  res.json({ message: "댓글이 삭제되었습니다." });
});

export default router;
