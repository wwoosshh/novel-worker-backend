import express, { type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = express.Router({ mergeParams: true });

const TABLES: Record<string, string> = {
  characters: "db_characters",
  locations:  "db_locations",
  factions:   "db_factions",
  items:      "db_items",
};

const EntrySchema = z.object({
  name:   z.string().min(1).max(100),
  fields: z.record(z.string(), z.string()).default({}),
});

async function checkOwnership(novelId: string, userId: string): Promise<boolean> {
  const novel = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [novelId]
  );
  return novel?.author_id === userId;
}

/* ─── GET /api/novels/:novelId/settings/:type ───── */
router.get("/:type", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  const type    = req.params.type    as string;
  const table   = TABLES[type];
  if (!table) return res.status(400).json({ error: "유효하지 않은 타입입니다." });

  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  const rows = await query(
    `SELECT * FROM ${table} WHERE novel_id = $1 ORDER BY created_at ASC`,
    [novelId]
  );
  res.json({ data: rows });
});

/* ─── POST /api/novels/:novelId/settings/:type ───── */
router.post("/:type", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  const type    = req.params.type    as string;
  const table   = TABLES[type];
  if (!table) return res.status(400).json({ error: "유효하지 않은 타입입니다." });

  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  const parsed = EntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const row = await queryOne(
    `INSERT INTO ${table} (novel_id, name, fields) VALUES ($1, $2, $3) RETURNING *`,
    [novelId, parsed.data.name, JSON.stringify(parsed.data.fields)]
  );
  res.status(201).json({ data: row });
});

/* ─── PUT /api/novels/:novelId/settings/:type/:id ── */
router.put("/:type/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  const type    = req.params.type    as string;
  const id      = req.params.id      as string;
  const table   = TABLES[type];
  if (!table) return res.status(400).json({ error: "유효하지 않은 타입입니다." });

  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  const parsed = EntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const row = await queryOne(
    `UPDATE ${table} SET name = $1, fields = $2 WHERE id = $3 AND novel_id = $4 RETURNING *`,
    [parsed.data.name, JSON.stringify(parsed.data.fields), id, novelId]
  );
  if (!row) return res.status(404).json({ error: "항목을 찾을 수 없습니다." });
  res.json({ data: row });
});

/* ─── DELETE /api/novels/:novelId/settings/:type/:id */
router.delete("/:type/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  const type    = req.params.type    as string;
  const id      = req.params.id      as string;
  const table   = TABLES[type];
  if (!table) return res.status(400).json({ error: "유효하지 않은 타입입니다." });

  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  await query(`DELETE FROM ${table} WHERE id = $1 AND novel_id = $2`, [id, novelId]);
  res.json({ message: "삭제되었습니다." });
});

export default router;
