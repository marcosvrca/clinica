-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN "passwordSetAt" TIMESTAMP(3);
ALTER TABLE "StaffUser" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "inviteTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "StaffUser" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "StaffUser" ADD COLUMN "resetTokenExpiresAt" TIMESTAMP(3);

-- Backfill existing active accounts
UPDATE "StaffUser" SET "passwordSetAt" = "createdAt" WHERE "passwordSetAt" IS NULL AND "active" = true;

-- CreateIndex
CREATE INDEX "StaffUser_inviteTokenHash_idx" ON "StaffUser"("inviteTokenHash");
CREATE INDEX "StaffUser_resetTokenHash_idx" ON "StaffUser"("resetTokenHash");