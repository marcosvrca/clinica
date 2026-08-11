import { env } from "../config/env.js";
import { prisma } from "../infra/prisma.js";
import { SubscriptionBillingStatus } from "@prisma/client";

export function platformAdminEmails(): Set<string> {
  return new Set(
    env()
      .PLATFORM_ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(email: string) {
  return platformAdminEmails().has(email.toLowerCase().trim());
}

export async function getPlatformOverview() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    clinics,
    staffActive,
    subscriptions,
    patients,
    appointmentsMonth,
    paymentsPaidMonth,
  ] = await Promise.all([
    prisma.clinic.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        softwareSubscription: true,
        _count: {
          select: {
            staffUsers: true,
            patients: true,
            appointments: true,
          },
        },
      },
    }),
    prisma.staffUser.count({ where: { active: true, passwordSetAt: { not: null } } }),
    prisma.softwareSubscription.findMany({
      where: { status: "completed" },
      select: {
        id: true,
        email: true,
        method: true,
        billingStatus: true,
        amountCents: true,
        clinicId: true,
        completedAt: true,
      },
    }),
    prisma.patient.count(),
    prisma.appointment.count({
      where: { startsAt: { gte: monthStart } },
    }),
    prisma.payment.aggregate({
      where: {
        status: "paid",
        paidAt: { gte: monthStart },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);

  const complimentary = subscriptions.filter((s) => s.method === "complimentary").length;
  const paying = subscriptions.filter(
    (s) =>
      s.method !== "complimentary" &&
      s.billingStatus === SubscriptionBillingStatus.active,
  ).length;
  const pastDue = subscriptions.filter(
    (s) => s.billingStatus === SubscriptionBillingStatus.past_due,
  ).length;

  return {
    kpis: {
      clinics: clinics.length,
      staffActive,
      patients,
      appointmentsThisMonth: appointmentsMonth,
      subscriptionsComplimentary: complimentary,
      subscriptionsPaying: paying,
      subscriptionsPastDue: pastDue,
      sessionPaymentsThisMonth: paymentsPaidMonth._count._all,
      sessionRevenueCentsThisMonth: paymentsPaidMonth._sum.amountCents ?? 0,
      planAmountCents: env().SUBSCRIPTION_AMOUNT_CENTS,
    },
    clinics: clinics.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      active: c.active,
      createdAt: c.createdAt.toISOString(),
      staffCount: c._count.staffUsers,
      patientCount: c._count.patients,
      appointmentCount: c._count.appointments,
      billing: c.softwareSubscription
        ? {
            method: c.softwareSubscription.method,
            billingStatus: c.softwareSubscription.billingStatus,
            amountCents: c.softwareSubscription.amountCents,
            email: c.softwareSubscription.email,
          }
        : null,
    })),
  };
}
