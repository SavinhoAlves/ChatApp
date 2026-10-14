-- CreateTable
CREATE TABLE "Status" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT,
    "background" TEXT,
    "mediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusView" (
    "statusId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusView_pkey" PRIMARY KEY ("statusId","viewerId")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "video" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLogEntry" (
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "CallLogEntry_pkey" PRIMARY KEY ("callId","userId")
);

-- CreateIndex
CREATE INDEX "Status_userId_expiresAt_idx" ON "Status"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Status_expiresAt_idx" ON "Status"("expiresAt");

-- CreateIndex
CREATE INDEX "CallLog_callerId_createdAt_idx" ON "CallLog"("callerId", "createdAt");

-- CreateIndex
CREATE INDEX "CallLogEntry_userId_idx" ON "CallLogEntry"("userId");

-- AddForeignKey
ALTER TABLE "Status" ADD CONSTRAINT "Status_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusView" ADD CONSTRAINT "StatusView_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusView" ADD CONSTRAINT "StatusView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLogEntry" ADD CONSTRAINT "CallLogEntry_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLogEntry" ADD CONSTRAINT "CallLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
