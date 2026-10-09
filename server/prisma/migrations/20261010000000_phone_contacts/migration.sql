-- CreateTable
CREATE TABLE "PhoneContact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneContact_phone_idx" ON "PhoneContact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneContact_ownerId_phone_key" ON "PhoneContact"("ownerId", "phone");

-- AddForeignKey
ALTER TABLE "PhoneContact" ADD CONSTRAINT "PhoneContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

