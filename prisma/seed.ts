/**
 * Bootstrap limpo: uma clínica + usuária complimentary (sem dados demo).
 * Login: psi.vitoriasousarp@gmail.com / (senha definida abaixo)
 *
 * Não use este seed em produção se já houver dados reais — ele APAGA tudo.
 */
import {
  PrismaClient,
  SoftwareSubscriptionStatus,
  SubscriptionBillingStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadEnv, env } from "../src/config/env.js";

loadEnv();

if (env().NODE_ENV === "production") {
  console.error(
    "[seed] BLOQUEADO: npm run db:seed / prisma/seed não pode rodar com NODE_ENV=production (wipeAll apagaria todos os dados).",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const OWNER_EMAIL =
  process.env.SEED_OWNER_EMAIL?.trim() || "psi.vitoriasousarp@gmail.com";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD?.trim();
const OWNER_NAME = process.env.SEED_OWNER_NAME?.trim() || "Vitória Sousa";

const DEFAULT_HOURS = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
  { weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
]);

async function wipeAll() {
  await prisma.clinicalAuditLog.deleteMany();
  await prisma.clinicalRecordFile.deleteMany();
  await prisma.clinicalRecord.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.sessionPackage.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.calendarBlock.deleteMany();
  await prisma.patientDocument.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.serviceProfessional.deleteMany();
  await prisma.weeklyHour.deleteMany();
  await prisma.calendarConnection.deleteMany();
  await prisma.staffUser.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();
  await prisma.softwareSubscription.deleteMany();
  await prisma.clinic.deleteMany();
}

async function main() {
  if (!OWNER_PASSWORD || OWNER_PASSWORD.length < 8) {
    throw new Error(
      "Defina SEED_OWNER_PASSWORD no .env (mín. 8 caracteres) antes de rodar o seed.",
    );
  }

  console.info("[seed] Limpando banco…");
  await wipeAll();

  const plan = {
    code: "solo_monthly",
    name: "Individual",
    amountCents: env().SUBSCRIPTION_SOLO_AMOUNT_CENTS,
  };

  const clinic = await prisma.clinic.create({
    data: {
      name: "Consultório Vitória Sousa",
      slug: "vitoria-sousa",
      timezone: "America/Sao_Paulo",
      active: true,
    },
  });

  const professional = await prisma.professional.create({
    data: {
      clinicId: clinic.id,
      name: OWNER_NAME,
      specialty: "Psicologia",
      color: "#14b8a6",
      active: true,
    },
  });

  await prisma.weeklyHour.createMany({
    data: DEFAULT_HOURS.map((h) => ({
      ...h,
      professionalId: professional.id,
    })),
  });

  const service = await prisma.service.create({
    data: {
      clinicId: clinic.id,
      name: "Sessão individual (50 min)",
      description: "Atendimento psicológico individual — ajuste o valor em Serviços",
      durationMinutes: 50,
      priceCents: 0,
      active: true,
    },
  });

  await prisma.serviceProfessional.create({
    data: { serviceId: service.id, professionalId: professional.id },
  });

  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 10);
  const user = await prisma.staffUser.create({
    data: {
      clinicId: clinic.id,
      professionalId: professional.id,
      email: OWNER_EMAIL,
      name: OWNER_NAME,
      passwordHash,
      role: "admin",
      active: true,
      passwordSetAt: new Date(),
    },
  });

  await prisma.softwareSubscription.create({
    data: {
      email: OWNER_EMAIL,
      planCode: plan.code,
      planName: plan.name,
      amountCents: plan.amountCents,
      status: SoftwareSubscriptionStatus.completed,
      method: "complimentary",
      externalId: `complimentary_seed_${clinic.id}`,
      paidAt: new Date(),
      completedAt: new Date(),
      clinicId: clinic.id,
      billingStatus: SubscriptionBillingStatus.none,
    },
  });

  console.info("[seed] Pronto.");
  console.info(`  Clínica: ${clinic.name} (${clinic.id})`);
  console.info(`  Usuária: ${user.email} (admin, complimentary)`);
  console.info(`  Defina CLINIC_ID=${clinic.id} no .env / Railway se usar API key do bot.`);
  console.info(
    `  Inclua ${OWNER_EMAIL} em COMPLIMENTARY_SIGNUP_EMAILS para novos checkouts free.`,
  );

  const platformEmail =
    process.env.SEED_PLATFORM_EMAIL?.trim().toLowerCase() ||
    "marcosviniciusrdca2@gmail.com";
  const platformPassword = process.env.SEED_PLATFORM_PASSWORD?.trim();
  const platformName =
    process.env.SEED_PLATFORM_NAME?.trim() || "Marcos Vinicius";

  if (platformPassword && platformPassword.length >= 8) {
    const ops = await prisma.clinic.create({
      data: {
        name: "Operações Bem Estar",
        slug: "plataforma-bem-estar",
        timezone: "America/Sao_Paulo",
        active: true,
      },
    });
    const platformHash = await bcrypt.hash(platformPassword, 10);
    const platformPro = await prisma.professional.create({
      data: {
        clinicId: ops.id,
        name: platformName,
        specialty: "Plataforma",
        color: "#0f766e",
        active: true,
      },
    });
    await prisma.weeklyHour.createMany({
      data: DEFAULT_HOURS.map((h) => ({
        ...h,
        professionalId: platformPro.id,
      })),
    });
    await prisma.staffUser.create({
      data: {
        clinicId: ops.id,
        professionalId: platformPro.id,
        email: platformEmail,
        name: platformName,
        passwordHash: platformHash,
        role: "admin",
        active: true,
        passwordSetAt: new Date(),
      },
    });
    await prisma.softwareSubscription.create({
      data: {
        email: platformEmail,
        planCode: plan.code,
        planName: plan.name,
        amountCents: plan.amountCents,
        status: SoftwareSubscriptionStatus.completed,
        method: "complimentary",
        externalId: `complimentary_platform_${ops.id}`,
        paidAt: new Date(),
        completedAt: new Date(),
        clinicId: ops.id,
        billingStatus: SubscriptionBillingStatus.none,
      },
    });
    console.info(`  Plataforma: ${platformEmail} (PLATFORM_ADMIN_EMAILS)`);
  } else {
    console.info(
      "  (pulei admin da plataforma — defina SEED_PLATFORM_PASSWORD para criar)",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
