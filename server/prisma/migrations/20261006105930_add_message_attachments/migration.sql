-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('IMAGE', 'AUDIO', 'FILE');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachmentMime" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "attachmentType" "AttachmentType",
ADD COLUMN     "attachmentUrl" TEXT;
