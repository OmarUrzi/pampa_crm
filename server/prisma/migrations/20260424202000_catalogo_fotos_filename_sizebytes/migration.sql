-- Hotfix: previous migration added bytes/mime/size, but schema now expects filename + sizeBytes.
-- Make DB forward-compatible without breaking existing data.

ALTER TABLE "ActividadFoto"
  ADD COLUMN IF NOT EXISTS "filename" TEXT,
  ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER;

-- Backfill from legacy column name if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ActividadFoto' AND column_name = 'size'
  ) THEN
    UPDATE "ActividadFoto"
    SET "sizeBytes" = COALESCE("sizeBytes", "size")
    WHERE "sizeBytes" IS NULL AND "size" IS NOT NULL;
  END IF;
END $$;

-- Optional index for filtering by presence of binary
CREATE INDEX IF NOT EXISTS "ActividadFoto_bytes_idx"
  ON "ActividadFoto"("actividadId")
  WHERE "bytes" IS NOT NULL AND "deletedAt" IS NULL;

