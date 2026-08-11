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

async function main() {
  if (!PASSWORD || PASSWORD.length < 8) {
    throw new Error(
      "Defina SEED_PLATFORM_PASSWORD no .env (mín. 8 caracteres).",
    );
  }

  const plan = {
    code: env().SUBSCRIPTION_PLAN_CODE,
    name: env().SUBSCRIPTION_PLAN_NAME,
    amountCents: env().SUBSCRIPTION_AMOUNT_CENTS,
  };

  const clinic = await prisma.clinic.upsert({
    where: { slug: "plataforma-bem-estar" },
    create: {
      name: "Operações Bem Estar",
      slug: "plataforma-bem-estar",
      timezone: "America/Sao_Paulo",
      active: true,
    },
    update: { active: true, name: "Operações Bem Estar" },
  });

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
