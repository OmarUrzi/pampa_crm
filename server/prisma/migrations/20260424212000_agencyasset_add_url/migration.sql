-- Hotfix: older DBs created AgencyAsset without `url`.
-- Prisma model includes `url` (optional) for externally-hosted assets.

ALTER TABLE "AgencyAsset"
  ADD COLUMN IF NOT EXISTS "url" TEXT;

