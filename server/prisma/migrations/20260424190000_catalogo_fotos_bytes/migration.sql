-- AlterTable
ALTER TABLE "ActividadFoto" ADD COLUMN     "mime" TEXT,
ADD COLUMN     "bytes" BYTEA,
ADD COLUMN     "size" INTEGER;

-- Optional index for filtering by presence of binary
CREATE INDEX "ActividadFoto_bytes_idx" ON "ActividadFoto"("actividadId") WHERE "bytes" IS NOT NULL AND "deletedAt" IS NULL;

