-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttachmentType" ADD VALUE 'VIDEO';
ALTER TYPE "AttachmentType" ADD VALUE 'LOCATION';
ALTER TYPE "AttachmentType" ADD VALUE 'CONTACT';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactUserId" TEXT,
ADD COLUMN     "contactUsername" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "liveUntil" TIMESTAMP(3),
ADD COLUMN     "longitude" DOUBLE PRECISION;
