-- Add scheduled_at column for scheduled chapter publishing
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS scheduled_at timestamptz DEFAULT NULL;

-- Partial index for efficient scheduler queries
CREATE INDEX IF NOT EXISTS chapters_scheduled_idx
  ON public.chapters(scheduled_at)
  WHERE scheduled_at IS NOT NULL AND is_public = false;
