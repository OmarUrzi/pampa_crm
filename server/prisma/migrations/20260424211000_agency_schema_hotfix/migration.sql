-- Hotfix: align DB schema with Prisma models for AgencyProfile/AgencyAsset.
-- The initial migration created different columns and missed the required relation.

-- 1) Ensure AgencyProfile has expected columns.
ALTER TABLE "AgencyProfile"
  ADD COLUMN IF NOT EXISTS "about" TEXT,
  ADD COLUMN IF NOT EXISTS "contact" TEXT,
  ADD COLUMN IF NOT EXISTS "website" TEXT;

-- Back-compat: if older columns exist, keep data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='AgencyProfile' AND column_name='description'
  ) THEN
    -- If about is empty, copy description into about.
    UPDATE "AgencyProfile"
      SET "about" = COALESCE("about", "description")
      WHERE "about" IS NULL AND "description" IS NOT NULL;
  END IF;
END $$;

-- Ensure name is non-null for Prisma model.
UPDATE "AgencyProfile" SET "name" = COALESCE(NULLIF("name", ''), 'Pampa') WHERE "name" IS NULL OR "name" = '';
ALTER TABLE "AgencyProfile" ALTER COLUMN "name" SET NOT NULL;

-- 2) Ensure AgencyAsset has agencyId relation.
ALTER TABLE "AgencyAsset"
  ADD COLUMN IF NOT EXISTS "agencyId" TEXT;

-- Create a default agency row if needed and attach existing assets.
DO $$
DECLARE
  aid TEXT;
BEGIN
  SELECT "id" INTO aid FROM "AgencyProfile" WHERE "deletedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 1;
  IF aid IS NULL THEN
    aid := 'agency_default';
    INSERT INTO "AgencyProfile" ("id","name","createdAt","updatedAt")
    VALUES (aid,'Pampa',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  END IF;

  UPDATE "AgencyAsset"
    SET "agencyId" = aid
    WHERE "agencyId" IS NULL;
END $$;

ALTER TABLE "AgencyAsset" ALTER COLUMN "agencyId" SET NOT NULL;

-- Add FK + indexes (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AgencyAsset_agencyId_fkey'
  ) THEN
    ALTER TABLE "AgencyAsset"
      ADD CONSTRAINT "AgencyAsset_agencyId_fkey"
      FOREIGN KEY ("agencyId") REFERENCES "AgencyProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AgencyAsset_agencyId_idx" ON "AgencyAsset"("agencyId");

