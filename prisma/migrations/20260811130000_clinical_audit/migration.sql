-- CreateEnum
CREATE TYPE "ClinicalAuditAction" AS ENUM ('created', 'updated', 'confirmed', 'deleted', 'viewed', 'file_added', 'file_removed');

-- CreateTable
CREATE TABLE "ClinicalAuditLog" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT,
    "staffUserId" TEXT,
    "action" "ClinicalAuditAction" NOT NULL,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_clinicId_createdAt_idx" ON "ClinicalAuditLog"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_recordId_createdAt_idx" ON "ClinicalAuditLog"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_patientId_createdAt_idx" ON "ClinicalAuditLog"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalAuditLog_clinicId_action_createdAt_idx" ON "ClinicalAuditLog"("clinicId", "action", "createdAt");

-- AddForeignKey
ALTER TABLE "ClinicalAuditLog" ADD CONSTRAINT "ClinicalAuditLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalAuditLog" ADD CONSTRAINT "ClinicalAuditLog_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ClinicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;