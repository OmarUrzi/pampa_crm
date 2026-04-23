-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('openai', 'anthropic');

-- CreateTable
CREATE TABLE "AiProviderKey" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderKey_provider_key" ON "AiProviderKey"("provider");

-- CreateIndex
CREATE INDEX "AiProviderKey_provider_idx" ON "AiProviderKey"("provider");

-- CreateIndex
CREATE INDEX "AiProviderKey_revokedAt_idx" ON "AiProviderKey"("revokedAt");
