-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleMailbox" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "lastHistoryId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleMailboxToken" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleMailboxToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailMessage" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "gmailId" TEXT NOT NULL,
    "threadId" TEXT,
    "fromEmail" TEXT,
    "toEmails" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "internalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "RefreshToken_revokedAt_idx" ON "RefreshToken"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleMailbox_email_key" ON "GoogleMailbox"("email");

-- CreateIndex
CREATE INDEX "GoogleMailbox_email_idx" ON "GoogleMailbox"("email");

-- CreateIndex
CREATE INDEX "GoogleMailboxToken_mailboxId_idx" ON "GoogleMailboxToken"("mailboxId");

-- CreateIndex
CREATE INDEX "GoogleMailboxToken_revokedAt_idx" ON "GoogleMailboxToken"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GmailMessage_mailboxId_gmailId_key" ON "GmailMessage"("mailboxId", "gmailId");

-- CreateIndex
CREATE INDEX "GmailMessage_mailboxId_idx" ON "GmailMessage"("mailboxId");

-- CreateIndex
CREATE INDEX "GmailMessage_fromEmail_idx" ON "GmailMessage"("fromEmail");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleMailboxToken" ADD CONSTRAINT "GoogleMailboxToken_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "GoogleMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailMessage" ADD CONSTRAINT "GmailMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "GoogleMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

