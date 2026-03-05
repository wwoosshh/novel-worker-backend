import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

/* ─── Environment variable validation ────────────── */
const REQUIRED_ENV = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "FRONTEND_URL"] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

import novelsRouter   from "./routes/novels";
import chaptersRouter from "./routes/chapters";
import settingsRouter from "./routes/settings";
import macrosRouter   from "./routes/macros";
import noticesRouter  from "./routes/notices";
import commentsRouter from "./routes/comments";
import feedbackRouter from "./routes/feedback";
import usersRouter    from "./routes/users";
import { startScheduler } from "./lib/scheduler";

const app  = express();
const PORT = process.env.PORT || 4000;

/* ─── Middleware ─────────────────────────────────── */
app.use(helmet());
app.use(cors({
  origin: [
    (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    /\.vercel\.app$/,         // any Vercel preview URL
    /^https:\/\/(www\.)?novelworker\.work$/,
  ],
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

/* ─── Routes ─────────────────────────────────────── */
app.get("/health", async (_req, res) => {
  const { ping } = await import("./lib/db");
  const dbOk = await ping();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "connected" : "unreachable",
    ts: new Date().toISOString(),
  });
});

app.use("/api/novels",                        novelsRouter);
app.use("/api/novels/:novelId/chapters",      chaptersRouter);
app.use("/api/novels/:novelId/settings",      settingsRouter);
app.use("/api/novels/:novelId/macros",        macrosRouter);
app.use("/api/novels/:novelId/notices",       noticesRouter);
app.use("/api/novels/:novelId/chapters/:chapterId/comments", commentsRouter);
app.use("/api/feedback",                       feedbackRouter);
app.use("/api/users",                         usersRouter);

/* ─── 404 ────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

/* ─── Global error handler ───────────────────────── */
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  }));
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

/* ─── Start ──────────────────────────────────────── */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Novel Worker API listening on port ${PORT}`);
    startScheduler();
  });
}

export default app;
