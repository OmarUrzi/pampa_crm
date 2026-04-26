-- Hotfix: ensure SlideDeck table exists in prod.
-- Some environments may have missed the original migration that introduced SlideDeck.

CREATE TABLE IF NOT EXISTS "SlideDeck" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'catalogo',
    "title" TEXT,
    "prompt" TEXT NOT NULL,
    "provider" TEXT,
    "deckJson" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlideDeck_pkey" PRIMARY KEY ("id")
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS "SlideDeck_eventoId_idx" ON "SlideDeck"("eventoId");
CREATE INDEX IF NOT EXISTS "SlideDeck_source_idx" ON "SlideDeck"("source");
CREATE INDEX IF NOT EXISTS "SlideDeck_createdAt_idx" ON "SlideDeck"("createdAt");

