import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export interface AuthRequest extends Request {
  userId?: string;
}

/** Middleware: verify Supabase JWT, attach userId to req */
export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "인증이 필요합니다." });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "유효하지 않은 토큰입니다." });
    return;
  }

  req.userId = data.user.id;
  next();
}

/** Optional auth — attaches userId if token present but doesn't block */
export async function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data.user) req.userId = data.user.id;
  }
  next();
}
