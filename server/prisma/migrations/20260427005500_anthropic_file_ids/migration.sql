-- Add optional Anthropic Files API identifiers to reuse uploaded assets/photos.
ALTER TABLE "AgencyAsset"
ADD COLUMN "anthropicFileId" TEXT,
ADD COLUMN "anthropicFileCreatedAt" TIMESTAMP(3);

ALTER TABLE "ActividadFoto"
ADD COLUMN "anthropicFileId" TEXT,
ADD COLUMN "anthropicFileCreatedAt" TIMESTAMP(3);

-- Best-effort indexes for lookups and cleanup jobs.
CREATE INDEX IF NOT EXISTS "AgencyAsset_anthropicFileId_idx" ON "AgencyAsset" ("anthropicFileId");
CREATE INDEX IF NOT EXISTS "ActividadFoto_anthropicFileId_idx" ON "ActividadFoto" ("anthropicFileId");

