-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "pinnedMessageId" TEXT,
ADD COLUMN     "pinnedPreview" TEXT,
ADD COLUMN     "pinnedSenderId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "forwarded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MessageHidden" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageHidden_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "MessageStar" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageStar_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "MessageHidden_userId_idx" ON "MessageHidden"("userId");

-- CreateIndex
CREATE INDEX "MessageStar_userId_createdAt_idx" ON "MessageStar"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageStar" ADD CONSTRAINT "MessageStar_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageStar" ADD CONSTRAINT "MessageStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
