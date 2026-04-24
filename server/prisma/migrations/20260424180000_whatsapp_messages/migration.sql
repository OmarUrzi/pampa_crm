-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'meta',
    "waMessageId" TEXT,
    "waChatId" TEXT,
    "fromPhone" TEXT,
    "toPhone" TEXT,
    "bodyText" TEXT,
    "raw" JSONB,
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_provider_waMessageId_key" ON "WhatsAppMessage"("provider", "waMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_waChatId_idx" ON "WhatsAppMessage"("waChatId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_fromPhone_idx" ON "WhatsAppMessage"("fromPhone");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_toPhone_idx" ON "WhatsAppMessage"("toPhone");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_at_idx" ON "WhatsAppMessage"("at");

