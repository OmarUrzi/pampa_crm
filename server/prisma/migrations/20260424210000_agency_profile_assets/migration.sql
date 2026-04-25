-- CreateTable
CREATE TABLE "AgencyProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "tagline" TEXT,
    "description" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyAsset" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "mime" TEXT,
    "bytes" BYTEA,
    "filename" TEXT,
    "sizeBytes" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgencyAsset_kind_idx" ON "AgencyAsset"("kind");

-- CreateIndex
CREATE INDEX "AgencyAsset_deletedAt_idx" ON "AgencyAsset"("deletedAt");

