-- CreateTable
CREATE TABLE "UserSticker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSticker_userId_createdAt_idx" ON "UserSticker"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSticker_userId_url_key" ON "UserSticker"("userId", "url");

-- AddForeignKey
ALTER TABLE "UserSticker" ADD CONSTRAINT "UserSticker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
