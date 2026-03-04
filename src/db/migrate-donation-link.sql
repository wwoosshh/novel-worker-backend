-- 작가 응원하기: 후원 링크 필드 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS donation_link text DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS donation_label text DEFAULT NULL;
