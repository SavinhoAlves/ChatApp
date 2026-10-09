-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_ownerId_idx" ON "Contact"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_ownerId_contactId_key" ON "Contact"("ownerId", "contactId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: quem já conversa 1:1 com alguém vira contato mútuo (não perde quem já conhecia).
INSERT INTO "Contact" ("id", "ownerId", "contactId")
SELECT gen_random_uuid()::text, p1."userId", p2."userId"
FROM "Participant" p1
JOIN "Participant" p2 ON p1."conversationId" = p2."conversationId" AND p1."userId" <> p2."userId"
JOIN "Conversation" c ON c."id" = p1."conversationId" AND c."type" = 'DIRECT'
ON CONFLICT ("ownerId", "contactId") DO NOTHING;
