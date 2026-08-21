/**
 * Garante usuário admin da plataforma (sem apagar dados).
 * Uso: npx tsx --env-file=.env scripts/ensure-platform-admin.ts
 *
 * Lê SEED_PLATFORM_EMAIL / SEED_PLATFORM_PASSWORD / SEED_PLATFORM_NAME do env.
 */
import {
  PrismaClient,
  SoftwareSubscriptionStatus,
  SubscriptionBillingStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadEnv, env } from "../src/config/env.js";

loadEnv();

const prisma = new PrismaClient();

const EMAIL =
  process.env.SEED_PLATFORM_EMAIL?.trim().toLowerCase() ||
  "marcosviniciusrdca2@gmail.com";
const PASSWORD = process.env.SEED_PLATFORM_PASSWORD?.trim();
const NAME = process.env.SEED_PLATFORM_NAME?.trim() || "Marcos Vinicius";

const DEFAULT_HOURS = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
  { weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
]);

async function main() {
  if (!PASSWORD || PASSWORD.length < 8) {
    throw new Error(
      "Defina SEED_PLATFORM_PASSWORD no .env (mín. 8 caracteres).",
    );
  }

  const plan = {
    code: "solo_monthly",
    name: env().SUBSCRIPTION_SOLO_PLAN_NAME,
    amountCents: env().SUBSCRIPTION_SOLO_AMOUNT_CENTS,
  };

  const clinic = await prisma.clinic.upsert({
    where: { slug: "plataforma-bem-estar" },
    create: {
      name: "Operações mvFlow",
      slug: "plataforma-bem-estar",
      timezone: "America/Sao_Paulo",
      active: true,
    },
    update: { active: true, name: "Operações mvFlow" },
  });

  let professional = await prisma.professional.findFirst({
    where: { clinicId: clinic.id, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!professional) {
    professional = await prisma.professional.create({
      data: {
        clinicId: clinic.id,
        name: NAME,
        specialty: "Plataforma",
        color: "#0f766e",
        active: true,
      },
    });
    await prisma.weeklyHour.createMany({
      data: DEFAULT_HOURS.map((h) => ({
        ...h,
        professionalId: professional!.id,
      })),
    });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const existing = await prisma.staffUser.findFirst({
    where: { email: EMAIL },
  });

  let user;
  if (existing) {
    user = await prisma.staffUser.update({
      where: { id: existing.id },
      data: {
        clinicId: clinic.id,
        professionalId: existing.professionalId ?? professional.id,
        name: NAME,
        passwordHash,
        role: "admin",
        active: true,
        passwordSetAt: new Date(),
        inviteTokenHash: null,
        inviteTokenExpiresAt: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
    });
  } else {
    user = await prisma.staffUser.create({
      data: {
        clinicId: clinic.id,
        professionalId: professional.id,
        email: EMAIL,
        name: NAME,
        passwordHash,
        role: "admin",
        active: true,
        passwordSetAt: new Date(),
      },
    });
  }

  const sub = await prisma.softwareSubscription.findFirst({
    where: { OR: [{ clinicId: clinic.id }, { email: EMAIL }] },
  });

  if (sub) {
    await prisma.softwareSubscription.update({
      where: { id: sub.id },
      data: {
        email: EMAIL,
        clinicId: clinic.id,
        status: SoftwareSubscriptionStatus.completed,
        method: "complimentary",
        billingStatus: SubscriptionBillingStatus.none,
        completedAt: sub.completedAt ?? new Date(),
        paidAt: sub.paidAt ?? new Date(),
        planCode: plan.code,
        planName: plan.name,
        amountCents: plan.amountCents,
      },
    });
  } else {
    await prisma.softwareSubscription.create({
      data: {
        email: EMAIL,
        planCode: plan.code,
        planName: plan.name,
        amountCents: plan.amountCents,
        status: SoftwareSubscriptionStatus.completed,
        method: "complimentary",
        externalId: `complimentary_platform_${clinic.id}`,
        paidAt: new Date(),
        completedAt: new Date(),
        clinicId: clinic.id,
        billingStatus: SubscriptionBillingStatus.none,
      },
    });
  }

  console.info("[platform-admin] OK");
  console.info(`  Clínica: ${clinic.name} (${clinic.id})`);
  console.info(`  Usuário: ${user.email}`);
  console.info(`  Profissional: ${professional.name} (${professional.id})`);
  console.info(
    `  Inclua ${EMAIL} em PLATFORM_ADMIN_EMAILS e COMPLIMENTARY_SIGNUP_EMAILS`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
