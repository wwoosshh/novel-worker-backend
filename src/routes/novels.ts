import { Router, type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, optionalAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = Router();

/* ─── Schemas ─────────────────────────────────────── */
const CreateNovelSchema = z.object({
  title:    z.string().min(1).max(100),
  synopsis: z.string().max(1000).optional(),
  genre:    z.string().min(1).max(30),
  tags:     z.array(z.string().max(20)).max(10).default([]),
});

const UpdateNovelSchema = CreateNovelSchema.partial().extend({
  status:    z.enum(["ongoing", "completed", "hiatus"]).optional(),
  cover_url: z.string().url().optional(),
  is_public: z.boolean().optional(),
});

/* ─── GET /api/novels — public feed ──────────────── */
router.get("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  const {
    sort   = "popular",
    genre,
    status,
    q,
    limit  = "24",
    offset = "0",
  } = req.query as Record<string, string>;

  const lim    = Math.min(parseInt(limit)  || 24, 100);
  const off    = Math.max(parseInt(offset) || 0, 0);
  const params: unknown[] = [];
  const where: string[] = ["n.is_public = true"];

  if (genre)  { params.push(genre);  where.push(`n.genre = $${params.length}`); }
  if (status) { params.push(status); where.push(`n.status = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(n.title ILIKE $${params.length} OR p.display_name ILIKE $${params.length})`);
  }

  const orderBy =
    sort === "latest"  ? "n.created_at DESC" :
    sort === "updated" ? "n.updated_at DESC" :
    "n.view_count DESC";

  params.push(lim, off);

  const sql = `
    SELECT
      n.id, n.title, n.cover_url, n.genre, n.tags, n.status,
      n.chapter_count, n.view_count, n.created_at, n.updated_at,
      p.display_name AS author_name,
      p.username     AS author_username,
      (SELECT MAX(ch.number) FROM chapters ch WHERE ch.novel_id = n.id AND ch.is_public = true)
        AS latest_chapter
    FROM novels n
    JOIN profiles p ON p.id = n.author_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM novels n
    JOIN profiles p ON p.id = n.author_id
    WHERE ${where.join(" AND ")}
  `;

  const [novels, countRows] = await Promise.all([
    query(sql, params),
    query(countSql, params.slice(0, params.length - 2)),
  ]);

  res.json({ data: novels, total: parseInt((countRows[0] as any).total) });
});

/* ─── GET /api/novels/me/list — author's own novels ── */
router.get("/me/list", requireAuth, async (req: AuthRequest, res: Response) => {
  const novels = await query(
    `SELECT
       n.*,
       (SELECT COUNT(*) FROM subscriptions s WHERE s.novel_id = n.id) AS subscriber_count,
       (SELECT MAX(ch.number) FROM chapters ch WHERE ch.novel_id = n.id) AS latest_chapter
     FROM novels n
     WHERE n.author_id = $1
     ORDER BY n.updated_at DESC`,
    [req.userId]
  );
  res.json({ data: novels });
});

/* ─── GET /api/novels/:id ─────────────────────────── */
router.get("/:id", optionalAuth, async (req: AuthRequest, res: Response) => {
  const novel = await queryOne(
    `SELECT
       n.*,
       p.display_name AS author_name, p.username AS author_username, p.bio AS author_bio
     FROM novels n
     JOIN profiles p ON p.id = n.author_id
     WHERE n.id = $1
       AND (n.is_public = true OR n.author_id = $2)`,
    [req.params.id, req.userId ?? "00000000-0000-0000-0000-000000000000"]
  );

  if (!novel) return res.status(404).json({ error: "소설을 찾을 수 없습니다." });

  // Increment view count (fire-and-forget)
  query("UPDATE novels SET view_count = view_count + 1 WHERE id = $1", [req.params.id]).catch(() => {});

  res.json({ data: novel });
});

/* ─── POST /api/novels ────────────────────────────── */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = CreateNovelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { title, synopsis, genre, tags } = parsed.data;

  const novel = await queryOne(
    `INSERT INTO novels (author_id, title, synopsis, genre, tags)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [req.userId, title, synopsis ?? null, genre, tags]
  );

  res.status(201).json({ data: novel });
});

/* ─── PATCH /api/novels/:id ───────────────────────── */
router.patch("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const existing = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [req.params.id]
  );
  if (!existing) return res.status(404).json({ error: "소설을 찾을 수 없습니다." });
  if (existing.author_id !== req.userId) return res.status(403).json({ error: "권한이 없습니다." });

  const parsed = UpdateNovelSchema.safeParse(req.body);
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

  params.push(new Date().toISOString(), req.params.id);
  fields.push(`updated_at = $${params.length - 1}`);

  const novel = await queryOne(
    `UPDATE novels SET ${fields.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );

  res.json({ data: novel });
});

/* ─── DELETE /api/novels/:id ─────────────────────── */
router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const existing = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [req.params.id]
  );
  if (!existing) return res.status(404).json({ error: "소설을 찾을 수 없습니다." });
  if (existing.author_id !== req.userId) return res.status(403).json({ error: "권한이 없습니다." });

  await query("DELETE FROM novels WHERE id = $1", [req.params.id]);
  res.json({ message: "삭제되었습니다." });
});

export default router;
