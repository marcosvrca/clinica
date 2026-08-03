import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  OnlineProvider,
  SoftwareSubscriptionStatus,
  StaffRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { prisma } from "../infra/prisma.js";
import { sendSignupSetupEmail, isEmailConfigured } from "../lib/mailer.js";
import {
  createProviderCheckout,
  isSandboxExternalId,
  sandboxAllowed,
  sandboxPayToken,
  type CheckoutMethod,
} from "./online-providers.js";

export class SubscriptionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "SubscriptionError";
  }
}

function tokensMatch(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function hashSetupToken(token: string) {
  return createHash("sha256")
    .update(`${token}:${env().JWT_SECRET}:signup`)
    .digest("hex");
}

function slugify(input: string) {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "clinica";
}

async function uniqueClinicSlug(name: string) {
  const base = slugify(name);
  for (let i = 0; i < 8; i += 1) {
    const slug = i === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const exists = await prisma.clinic.findUnique({ where: { slug } });
    if (!exists) return slug;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

export function getSubscriptionPlan() {
  return {
    code: env().SUBSCRIPTION_PLAN_CODE,
    name: env().SUBSCRIPTION_PLAN_NAME,
    amountCents: env().SUBSCRIPTION_AMOUNT_CENTS,
    description: env().SUBSCRIPTION_PLAN_DESCRIPTION,
    currency: "BRL" as const,
    interval: "month" as const,
  };
}

function mapSubscription(row: {
  id: string;
  email: string;
  planCode: string;
  planName: string;
  amountCents: number;
  status: SoftwareSubscriptionStatus;
  method: string | null;
  provider: OnlineProvider | null;
  externalId: string | null;
  checkoutUrl: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  paidAt: Date | null;
  setupEmailSentAt: Date | null;
  completedAt: Date | null;
  clinicId: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    email: row.email,
    planCode: row.planCode,
    planName: row.planName,
    amountCents: row.amountCents,
    status: row.status,
    method: row.method,
    provider: row.provider,
    externalId: row.externalId,
    checkoutUrl: row.checkoutUrl,
    pixQrCode: row.pixQrCode,
    pixCopyPaste: row.pixCopyPaste,
    paidAt: row.paidAt?.toISOString() ?? null,
    setupEmailSentAt: row.setupEmailSentAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    clinicId: row.clinicId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function startSubscriptionCheckout(input: {
  email: string;
  method?: CheckoutMethod;
  provider?: OnlineProvider;
}) {
  const email = input.email.toLowerCase().trim();
  const existingUser = await prisma.staffUser.findFirst({
    where: { email, active: true },
  });
  if (existingUser) {
    throw new SubscriptionError(
      "Este e-mail já possui conta. Faça login ou recupere o acesso.",
      409,
    );
  }

  const open = await prisma.softwareSubscription.findFirst({
    where: {
      email,
      status: {
        in: [
          SoftwareSubscriptionStatus.pending_payment,
          SoftwareSubscriptionStatus.paid,
        ],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (open?.status === SoftwareSubscriptionStatus.paid) {
    throw new SubscriptionError(
      "Pagamento já confirmado para este e-mail. Verifique sua caixa de entrada para finalizar o cadastro.",
      409,
    );
  }

  const plan = getSubscriptionPlan();
  const method = input.method ?? "pix";
  const provider =
    input.provider ?? (env().PAYMENTS_DEFAULT_PROVIDER as OnlineProvider);

  const subscription =
    open?.status === SoftwareSubscriptionStatus.pending_payment
      ? open
      : await prisma.softwareSubscription.create({
          data: {
            email,
            planCode: plan.code,
            planName: plan.name,
            amountCents: plan.amountCents,
            status: SoftwareSubscriptionStatus.pending_payment,
            method,
          },
        });

  const base = env().PUBLIC_BASE_URL.replace(/\/$/, "");
  let checkout;
  try {
    checkout = await createProviderCheckout(provider, {
      paymentId: subscription.id,
      amountCents: subscription.amountCents,
      description: `${plan.name} — Bem Estar`,
      patientName: null,
      patientEmail: email,
      patientPhone: "00000000000",
      method,
      successUrl: `${env().WEB_BASE_URL.replace(/\/$/, "")}/assine?paid=${subscription.id}`,
      cancelUrl: `${env().WEB_BASE_URL.replace(/\/$/, "")}/assine?cancel=1`,
      notificationUrl: `${base}/v1/public/webhooks/${provider}`,
    });
  } catch (err) {
    throw new SubscriptionError(
      err instanceof Error ? err.message : "Falha ao criar checkout",
      422,
    );
  }

  const updated = await prisma.softwareSubscription.update({
    where: { id: subscription.id },
    data: {
      provider: checkout.provider,
      externalId: checkout.externalId,
      checkoutUrl: checkout.checkoutUrl,
      pixQrCode: checkout.pixQrCode,
      pixCopyPaste: checkout.pixCopyPaste,
      method: method === "pix" ? "pix" : "card",
    },
  });

  return {
    ...mapSubscription(updated),
    sandbox: checkout.sandbox,
    simulateToken:
      checkout.sandbox && sandboxAllowed()
        ? sandboxPayToken(subscription.id)
        : null,
  };
}

async function issueSetupLink(subscriptionId: string) {
  const token = randomBytes(32).toString("hex");
  const setupTokenHash = hashSetupToken(token);
  const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const updated = await prisma.softwareSubscription.update({
    where: { id: subscriptionId },
    data: {
      setupTokenHash,
      setupTokenExpiresAt,
    },
  });

  const setupUrl = `${env().WEB_BASE_URL.replace(/\/$/, "")}/cadastro?token=${encodeURIComponent(token)}`;

  let emailResult: { skipped: boolean; reason?: string; id?: string | null } = {
    skipped: true,
    reason: "e-mail desabilitado",
  };

  try {
    emailResult = await sendSignupSetupEmail({
      to: updated.email,
      setupUrl,
      planName: updated.planName,
    });
    if (!emailResult.skipped) {
      await prisma.softwareSubscription.update({
        where: { id: subscriptionId },
        data: { setupEmailSentAt: new Date() },
      });
    }
  } catch (err) {
    emailResult = {
      skipped: true,
      reason: err instanceof Error ? err.message : "falha no envio",
    };
  }

  return {
    setupUrl:
      emailResult.skipped || env().NODE_ENV !== "production" ? setupUrl : null,
    emailSent: !emailResult.skipped,
    emailSkippedReason: emailResult.skipped ? emailResult.reason : undefined,
  };
}

/** Confirma pagamento da assinatura e dispara e-mail de finalização. */
export async function finalizeSubscriptionPayment(input: {
  subscriptionId: string;
  method: "pix" | "card";
  provider?: OnlineProvider | null;
  externalId?: string | null;
  notes?: string;
}) {
  const current = await prisma.softwareSubscription.findFirst({
    where: { id: input.subscriptionId },
  });
  if (!current) {
    throw new SubscriptionError("Assinatura não encontrada", 404);
  }
  if (current.status === SoftwareSubscriptionStatus.cancelled) {
    throw new SubscriptionError("Assinatura cancelada", 422);
  }
  if (current.status === SoftwareSubscriptionStatus.completed) {
    return {
      subscription: mapSubscription(current),
      alreadyPaid: true,
      setup: null as Awaited<ReturnType<typeof issueSetupLink>> | null,
    };
  }

  if (current.status === SoftwareSubscriptionStatus.paid) {
    const setup = current.setupTokenHash
      ? null
      : await issueSetupLink(current.id);
    return {
      subscription: mapSubscription(current),
      alreadyPaid: true,
      setup,
    };
  }

  const updated = await prisma.softwareSubscription.update({
    where: { id: current.id },
    data: {
      status: SoftwareSubscriptionStatus.paid,
      paidAt: new Date(),
      method: input.method,
      provider: input.provider ?? current.provider,
      externalId: input.externalId ?? current.externalId,
    },
  });

  const setup = await issueSetupLink(updated.id);
  const fresh = await prisma.softwareSubscription.findFirstOrThrow({
    where: { id: updated.id },
  });

  return {
    subscription: mapSubscription(fresh),
    alreadyPaid: false,
    setup,
    message:
      "Pagamento confirmado. Enviamos o link de cadastro para o e-mail informado.",
  };
}

export async function simulateSubscriptionPay(input: {
  subscriptionId: string;
  token: string;
}) {
  if (!sandboxAllowed()) {
    throw new SubscriptionError("Simulação de pagamento desabilitada", 403);
  }
  if (!tokensMatch(input.token, sandboxPayToken(input.subscriptionId))) {
    throw new SubscriptionError("Token de simulação inválido", 401);
  }
  const row = await prisma.softwareSubscription.findFirst({
    where: { id: input.subscriptionId },
  });
  if (!row) throw new SubscriptionError("Assinatura não encontrada", 404);
  if (!isSandboxExternalId(row.externalId)) {
    throw new SubscriptionError(
      "Simulação só é permitida em checkouts sandbox",
      403,
    );
  }
  return finalizeSubscriptionPayment({
    subscriptionId: input.subscriptionId,
    method: "pix",
  });
}

export async function getSubscriptionStatus(id: string) {
  const row = await prisma.softwareSubscription.findFirst({ where: { id } });
  if (!row) throw new SubscriptionError("Assinatura não encontrada", 404);
  const canSimulate =
    row.status === SoftwareSubscriptionStatus.pending_payment &&
    sandboxAllowed() &&
    isSandboxExternalId(row.externalId);
  return {
    ...mapSubscription(row),
    simulateToken: canSimulate ? sandboxPayToken(row.id) : null,
    emailConfigured: isEmailConfigured(),
  };
}

export async function findSubscriptionByCheckoutRef(ref: {
  id?: string | null;
  externalId?: string | null;
}) {
  if (!ref.id && !ref.externalId) return null;
  return prisma.softwareSubscription.findFirst({
    where: {
      OR: [
        ...(ref.id ? [{ id: ref.id }] : []),
        ...(ref.externalId ? [{ externalId: ref.externalId }] : []),
      ],
    },
  });
}

export async function getSetupContext(token: string) {
  const hash = hashSetupToken(token);
  const row = await prisma.softwareSubscription.findFirst({
    where: { setupTokenHash: hash },
  });
  if (!row) throw new SubscriptionError("Link inválido ou já utilizado", 404);
  if (row.status !== SoftwareSubscriptionStatus.paid) {
    throw new SubscriptionError(
      row.status === SoftwareSubscriptionStatus.completed
        ? "Cadastro já finalizado. Faça login."
        : "Pagamento ainda não confirmado.",
      422,
    );
  }
  if (
    !row.setupTokenExpiresAt ||
    row.setupTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new SubscriptionError("Link expirado. Solicite um novo envio.", 410);
  }
  return {
    email: row.email,
    planName: row.planName,
    amountCents: row.amountCents,
    expiresAt: row.setupTokenExpiresAt.toISOString(),
  };
}

export async function completeSubscriptionSignup(input: {
  token: string;
  fullName: string;
  clinicName: string;
  phone?: string;
  password: string;
  crp?: string;
  specialty?: string;
  timezone?: string;
}) {
  const hash = hashSetupToken(input.token);
  const row = await prisma.softwareSubscription.findFirst({
    where: { setupTokenHash: hash },
  });
  if (!row) throw new SubscriptionError("Link inválido ou já utilizado", 404);
  if (row.status === SoftwareSubscriptionStatus.completed) {
    throw new SubscriptionError("Cadastro já finalizado. Faça login.", 409);
  }
  if (row.status !== SoftwareSubscriptionStatus.paid) {
    throw new SubscriptionError("Pagamento ainda não confirmado.", 422);
  }
  if (
    !row.setupTokenExpiresAt ||
    row.setupTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new SubscriptionError("Link expirado. Solicite um novo envio.", 410);
  }

  const email = row.email;
  const existing = await prisma.staffUser.findFirst({
    where: { email, active: true },
  });
  if (existing) {
    throw new SubscriptionError("Este e-mail já possui conta.", 409);
  }

  const fullName = input.fullName.trim();
  const clinicName = input.clinicName.trim();
  if (fullName.length < 3) {
    throw new SubscriptionError("Informe o nome completo.", 400);
  }
  if (clinicName.length < 2) {
    throw new SubscriptionError("Informe o nome da clínica/consultório.", 400);
  }
  if (input.password.length < 8) {
    throw new SubscriptionError("A senha deve ter pelo menos 8 caracteres.", 400);
  }

  const slug = await uniqueClinicSlug(clinicName);
  const passwordHash = await bcrypt.hash(input.password, 10);
  const phone = input.phone?.replace(/\D/g, "") || null;

  const result = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: {
        name: clinicName,
        slug,
        phone,
        timezone: input.timezone?.trim() || "America/Sao_Paulo",
        active: true,
      },
    });

    const professional = await tx.professional.create({
      data: {
        clinicId: clinic.id,
        name: fullName,
        specialty: input.specialty?.trim() || "Psicologia",
        crp: input.crp?.trim() || null,
        color: "#14b8a6",
        active: true,
      },
    });

    const hours = [1, 2, 3, 4, 5].flatMap((weekday) => [
      {
        professionalId: professional.id,
        weekday,
        startMinute: 8 * 60,
        endMinute: 12 * 60,
      },
      {
        professionalId: professional.id,
        weekday,
        startMinute: 14 * 60,
        endMinute: 18 * 60,
      },
    ]);
    await tx.weeklyHour.createMany({ data: hours });

    const service = await tx.service.create({
      data: {
        clinicId: clinic.id,
        name: "Sessão individual (50 min)",
        description: "Atendimento psicológico individual",
        durationMinutes: 50,
        priceCents: 18000,
        active: true,
      },
    });
    await tx.serviceProfessional.create({
      data: { serviceId: service.id, professionalId: professional.id },
    });

    const user = await tx.staffUser.create({
      data: {
        clinicId: clinic.id,
        professionalId: professional.id,
        email,
        name: fullName,
        passwordHash,
        role: StaffRole.admin,
        active: true,
      },
    });

    await tx.softwareSubscription.update({
      where: { id: row.id },
      data: {
        status: SoftwareSubscriptionStatus.completed,
        completedAt: new Date(),
        clinicId: clinic.id,
        setupTokenHash: null,
        setupTokenExpiresAt: null,
      },
    });

    return { clinic, user, professional };
  });

  return {
    ok: true as const,
    message: "Cadastro concluído. Você já pode entrar no painel.",
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      professionalId: result.user.professionalId,
      clinic: { id: result.clinic.id, name: result.clinic.name },
    },
  };
}
