-- Add actions jsonb column to macros table for workflow macro support
ALTER TABLE public.macros ADD COLUMN IF NOT EXISTS actions jsonb DEFAULT NULL;
ALTER TABLE public.macros ALTER COLUMN content SET DEFAULT '';
