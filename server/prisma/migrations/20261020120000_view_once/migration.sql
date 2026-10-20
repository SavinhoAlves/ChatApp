-- AlterTable
ALTER TABLE "Message" ADD COLUMN "viewOnce" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MessageReceipt" ADD COLUMN "openedAt" TIMESTAMP(3);
