-- Add optional timestamps for when a file was synced to Anthropic.
ALTER TABLE "AgencyAsset" ADD COLUMN IF NOT EXISTS "anthropicUploadedAt" TIMESTAMP(3);

ALTER TABLE "ActividadFoto" ADD COLUMN IF NOT EXISTS "anthropicUploadedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AgencyAsset_anthropicUploadedAt_idx" ON "AgencyAsset"("anthropicUploadedAt");
CREATE INDEX IF NOT EXISTS "ActividadFoto_anthropicUploadedAt_idx" ON "ActividadFoto"("anthropicUploadedAt");

