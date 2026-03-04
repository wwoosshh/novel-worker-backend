-- ─── Supabase Storage: images bucket ────────────────────
-- Run via Supabase Dashboard SQL Editor (storage schema is not accessible via external pooler)

-- 1. Create public bucket for images (5MB limit, image/* only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policies: anyone can read
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');

-- 3. Authenticated users can upload
DROP POLICY IF EXISTS "Auth users can upload images" ON storage.objects;
CREATE POLICY "Auth users can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'images'
    AND auth.role() = 'authenticated'
  );

-- 4. Authenticated users can update their own uploads
DROP POLICY IF EXISTS "Auth users can update own images" ON storage.objects;
CREATE POLICY "Auth users can update own images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'images'
    AND auth.uid() = owner
  );

-- 5. Authenticated users can delete their own uploads
DROP POLICY IF EXISTS "Auth users can delete own images" ON storage.objects;
CREATE POLICY "Auth users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'images'
    AND auth.uid() = owner
  );
