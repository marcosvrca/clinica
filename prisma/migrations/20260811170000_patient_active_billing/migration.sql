-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Patient" ADD COLUMN "billingPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Patient_clinicId_active_idx" ON "Patient"("clinicId", "active");
