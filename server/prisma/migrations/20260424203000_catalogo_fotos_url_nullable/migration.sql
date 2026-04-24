-- Make URL nullable to support storing binary photos in DB
-- (multipart upload stores bytes/mime/filename and leaves url = NULL).
ALTER TABLE "ActividadFoto" ALTER COLUMN "url" DROP NOT NULL;

