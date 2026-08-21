-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "ClinicalRecordStatus" AS ENUM ('draft', 'confirmed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('pix', 'card', 'cash');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('session', 'package');

-- CreateEnum
CREATE TYPE "OnlineProvider" AS ENUM ('mercado_pago', 'stripe', 'asaas', 'pagarme');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('rent', 'utilities', 'supplies', 'payroll', 'marketing', 'taxes', 'other');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('admin', 'professional');

-- CreateEnum
CREATE TYPE "SoftwareSubscriptionStatus" AS ENUM ('pending_payment', 'paid', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('confirmation', 'day_before', 'payment');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'sent', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "PatientDocumentKind" AS ENUM ('document', 'attachment', 'photo');

-- CreateEnum
CREATE TYPE "ClinicalFileKind" AS ENUM ('pdf', 'exam', 'report', 'image', 'audio');

-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('google', 'outlook');

-- CreateEnum
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('disconnected', 'pending', 'connected', 'error');

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL DEFAULT 'Psicologia',
    "crp" TEXT,
    "color" TEXT NOT NULL DEFAULT '#14b8a6',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'professional',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftwareSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "planCode" TEXT NOT NULL DEFAULT 'pro_monthly',
    "planName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "SoftwareSubscriptionStatus" NOT NULL DEFAULT 'pending_payment',
    "method" TEXT,
    "provider" "OnlineProvider",
    "externalId" TEXT,
    "checkoutUrl" TEXT,
    "pixQrCode" TEXT,
    "pixCopyPaste" TEXT,
    "paidAt" TIMESTAMP(3),
    "setupTokenHash" TEXT,
    "setupTokenExpiresAt" TIMESTAMP(3),
    "setupEmailSentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "clinicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoftwareSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyHour" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "WeeklyHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 50,
    "priceCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProfessional" (
    "serviceId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,

    CONSTRAINT "ServiceProfessional_pkey" PRIMARY KEY ("serviceId","professionalId")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "cpf" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "profession" TEXT,
    "maritalStatus" TEXT,
    "photoPath" TEXT,
    "zipCode" TEXT,
    "street" TEXT,
    "addressNumber" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "emergencyRelation" TEXT,
    "insuranceName" TEXT,
    "insuranceNumber" TEXT,
    "insurancePlan" TEXT,
    "financialName" TEXT,
    "financialCpf" TEXT,
    "financialPhone" TEXT,
    "financialRelation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "kind" "PatientDocumentKind" NOT NULL DEFAULT 'attachment',
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'confirmed',
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "notes" TEXT,
    "meetLink" TEXT,
    "recurrenceRule" TEXT,
    "recurrenceGroupId" TEXT,
    "googleEventId" TEXT,
    "outlookEventId" TEXT,
    "patientConfirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarBlock" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalRecord" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "ClinicalRecordStatus" NOT NULL DEFAULT 'draft',
    "sessionNotes" TEXT,
    "draftContent" TEXT NOT NULL DEFAULT '',
    "objectives" TEXT,
    "hypotheses" TEXT,
    "recurringThemes" TEXT,
    "nextInterventions" TEXT,
    "importantPoints" TEXT,
    "audioNotes" TEXT,
    "diagnosisCid" TEXT,
    "diagnosisDsm" TEXT,
    "recordingConsent" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalRecordFile" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "kind" "ClinicalFileKind" NOT NULL DEFAULT 'pdf',
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalRecordFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "packageId" TEXT,
    "kind" "PaymentKind" NOT NULL DEFAULT 'session',
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "method" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "provider" "OnlineProvider",
    "externalId" TEXT,
    "checkoutUrl" TEXT,
    "pixQrCode" TEXT,
    "pixCopyPaste" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionPackage" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "usedSessions" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'active',
    "method" "PaymentMethod",
    "notes" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'other',
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL DEFAULT 'confirmation',
    "status" "ReminderStatus" NOT NULL DEFAULT 'pending',
    "message" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "whatsappSentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'disconnected',
    "accountEmail" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");

-- CreateIndex
CREATE INDEX "Professional_clinicId_active_idx" ON "Professional"("clinicId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_professionalId_key" ON "StaffUser"("professionalId");

-- CreateIndex
CREATE INDEX "StaffUser_clinicId_active_idx" ON "StaffUser"("clinicId", "active");

-- CreateIndex
CREATE INDEX "StaffUser_email_idx" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_clinicId_email_key" ON "StaffUser"("clinicId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "SoftwareSubscription_clinicId_key" ON "SoftwareSubscription"("clinicId");

-- CreateIndex
CREATE INDEX "SoftwareSubscription_email_status_idx" ON "SoftwareSubscription"("email", "status");

-- CreateIndex
CREATE INDEX "SoftwareSubscription_provider_externalId_idx" ON "SoftwareSubscription"("provider", "externalId");

-- CreateIndex
CREATE INDEX "SoftwareSubscription_status_createdAt_idx" ON "SoftwareSubscription"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyHour_professionalId_weekday_idx" ON "WeeklyHour"("professionalId", "weekday");

-- CreateIndex
CREATE INDEX "Service_clinicId_active_idx" ON "Service"("clinicId", "active");

-- CreateIndex
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");

-- CreateIndex
CREATE INDEX "Patient_clinicId_cpf_idx" ON "Patient"("clinicId", "cpf");

-- CreateIndex
CREATE INDEX "Patient_clinicId_name_idx" ON "Patient"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_phone_key" ON "Patient"("clinicId", "phone");

-- CreateIndex
CREATE INDEX "PatientDocument_patientId_kind_createdAt_idx" ON "PatientDocument"("patientId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "PatientDocument_clinicId_idx" ON "PatientDocument"("clinicId");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_startsAt_status_idx" ON "Appointment"("clinicId", "startsAt", "status");

-- CreateIndex
CREATE INDEX "Appointment_professionalId_startsAt_status_idx" ON "Appointment"("professionalId", "startsAt", "status");

-- CreateIndex
CREATE INDEX "Appointment_patientId_status_startsAt_idx" ON "Appointment"("patientId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_recurrenceGroupId_idx" ON "Appointment"("recurrenceGroupId");

-- CreateIndex
CREATE INDEX "CalendarBlock_clinicId_startsAt_idx" ON "CalendarBlock"("clinicId", "startsAt");

-- CreateIndex
CREATE INDEX "CalendarBlock_professionalId_startsAt_endsAt_idx" ON "CalendarBlock"("professionalId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalRecord_appointmentId_key" ON "ClinicalRecord"("appointmentId");

-- CreateIndex
CREATE INDEX "ClinicalRecord_clinicId_status_updatedAt_idx" ON "ClinicalRecord"("clinicId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ClinicalRecord_patientId_status_confirmedAt_idx" ON "ClinicalRecord"("patientId", "status", "confirmedAt");

-- CreateIndex
CREATE INDEX "ClinicalRecord_professionalId_updatedAt_idx" ON "ClinicalRecord"("professionalId", "updatedAt");

-- CreateIndex
CREATE INDEX "ClinicalRecord_clinicId_deletedAt_idx" ON "ClinicalRecord"("clinicId", "deletedAt");

-- CreateIndex
CREATE INDEX "ClinicalRecordFile_recordId_kind_createdAt_idx" ON "ClinicalRecordFile"("recordId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalRecordFile_clinicId_idx" ON "ClinicalRecordFile"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_appointmentId_key" ON "Payment"("appointmentId");

-- CreateIndex
CREATE INDEX "Payment_clinicId_status_createdAt_idx" ON "Payment"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_clinicId_paidAt_idx" ON "Payment"("clinicId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_patientId_status_idx" ON "Payment"("patientId", "status");

-- CreateIndex
CREATE INDEX "Payment_packageId_idx" ON "Payment"("packageId");

-- CreateIndex
CREATE INDEX "Payment_clinicId_kind_status_idx" ON "Payment"("clinicId", "kind", "status");

-- CreateIndex
CREATE INDEX "Payment_provider_externalId_idx" ON "Payment"("provider", "externalId");

-- CreateIndex
CREATE INDEX "SessionPackage_clinicId_status_createdAt_idx" ON "SessionPackage"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SessionPackage_patientId_status_idx" ON "SessionPackage"("patientId", "status");

-- CreateIndex
CREATE INDEX "Expense_clinicId_occurredAt_idx" ON "Expense"("clinicId", "occurredAt");

-- CreateIndex
CREATE INDEX "Expense_clinicId_category_occurredAt_idx" ON "Expense"("clinicId", "category", "occurredAt");

-- CreateIndex
CREATE INDEX "Reminder_clinicId_status_scheduledAt_idx" ON "Reminder"("clinicId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Reminder_appointmentId_kind_idx" ON "Reminder"("appointmentId", "kind");

-- CreateIndex
CREATE INDEX "Reminder_status_scheduledAt_idx" ON "Reminder"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CalendarConnection_clinicId_status_idx" ON "CalendarConnection"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_clinicId_provider_key" ON "CalendarConnection"("clinicId", "provider");

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoftwareSubscription" ADD CONSTRAINT "SoftwareSubscription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyHour" ADD CONSTRAINT "WeeklyHour_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProfessional" ADD CONSTRAINT "ServiceProfessional_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProfessional" ADD CONSTRAINT "ServiceProfessional_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalRecordFile" ADD CONSTRAINT "ClinicalRecordFile_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ClinicalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SessionPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPackage" ADD CONSTRAINT "SessionPackage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPackage" ADD CONSTRAINT "SessionPackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

