-- CreateTable
CREATE TABLE "SlidesDeck" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT,
    "prompt" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "deckJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlidesDeck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlidesDeck_eventoId_idx" ON "SlidesDeck"("eventoId");

