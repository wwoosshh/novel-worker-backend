import express, { type Response } from "express";
import { query, queryOne } from "../lib/db";
import { requireAuth, type AuthRequest } from "../lib/auth";
import { z } from "zod";

const router = express.Router({ mergeParams: true });

const MacroSchema = z.object({
  label:    z.string().min(1).max(50),
  content:  z.string().max(5000).optional().default(""),
  shortcut: z.string().max(30).optional(),
  actions:  z.array(z.unknown()).max(50).optional().nullable(),
});

async function checkOwnership(novelId: string, userId: string): Promise<boolean> {
  const novel = await queryOne<{ author_id: string }>(
    "SELECT author_id FROM novels WHERE id = $1",
    [novelId]
  );
  return novel?.author_id === userId;
}

/* ─── GET /api/novels/:novelId/macros ────────────── */
router.get("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  const rows = await query(
    "SELECT * FROM macros WHERE novel_id = $1 ORDER BY created_at ASC",
    [novelId]
  );
  res.json({ data: rows });
});

/* ─── POST /api/novels/:novelId/macros ───────────── */
router.post("/", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  const parsed = MacroSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const actionsJson = parsed.data.actions ? JSON.stringify(parsed.data.actions) : null;

  const row = await queryOne(
    "INSERT INTO macros (novel_id, label, content, shortcut, actions) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [novelId, parsed.data.label, parsed.data.content, parsed.data.shortcut ?? null, actionsJson]
  );
  res.status(201).json({ data: row });
});

/* ─── PUT /api/novels/:novelId/macros/:id ────────── */
router.put("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  const id      = req.params.id      as string;
  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  const parsed = MacroSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const actionsJson = parsed.data.actions ? JSON.stringify(parsed.data.actions) : null;

  const row = await queryOne(
    "UPDATE macros SET label = $1, content = $2, shortcut = $3, actions = $4 WHERE id = $5 AND novel_id = $6 RETURNING *",
    [parsed.data.label, parsed.data.content, parsed.data.shortcut ?? null, actionsJson, id, novelId]
  );
  if (!row) return res.status(404).json({ error: "매크로를 찾을 수 없습니다." });
  res.json({ data: row });
});

/* ─── DELETE /api/novels/:novelId/macros/:id ─────── */
router.delete("/:id", requireAuth, async (req: AuthRequest, res: Response) => {
  const novelId = req.params.novelId as string;
  const id      = req.params.id      as string;
  if (!(await checkOwnership(novelId, req.userId!)))
    return res.status(403).json({ error: "권한이 없습니다." });

  await query("DELETE FROM macros WHERE id = $1 AND novel_id = $2", [id, novelId]);
  res.json({ message: "삭제되었습니다." });
});

export default router;
