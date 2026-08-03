-- CreateEnum
CREATE TYPE "SubscriptionBillingStatus" AS ENUM ('none', 'active', 'past_due', 'cancelled');

-- AlterTable
ALTER TABLE "SoftwareSubscription" ADD COLUMN     "mpPreapprovalPlanId" TEXT,
ADD COLUMN     "mpPreapprovalId" TEXT,
ADD COLUMN     "billingStatus" "SubscriptionBillingStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "lastPaymentAt" TIMESTAMP(3),
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SoftwareSubscription_mpPreapprovalId_idx" ON "SoftwareSubscription"("mpPreapprovalId");

-- CreateIndex
CREATE INDEX "SoftwareSubscription_billingStatus_idx" ON "SoftwareSubscription"("billingStatus");
