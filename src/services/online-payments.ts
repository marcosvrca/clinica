import {
  AppointmentStatus,
  OnlineProvider,
  PaymentStatus,
} from "@prisma/client";
import { prisma } from "../infra/prisma.js";
import { env } from "../config/env.js";
import { cancelPaymentRemindersForAppointment } from "./reminders.js";
import { PaymentError } from "./payments.js";
import { timingSafeEqual } from "node:crypto";
import {
  createProviderCheckout,
  isSandboxExternalId,
  listOnlineProviders,
  sandboxAllowed,
  sandboxPayToken,
  verifyProviderPaidEvent,
  type CheckoutMethod,
} from "./online-providers.js";
import {
  finalizeSubscriptionPayment,
  findSubscriptionByCheckoutRef,
} from "./subscriptions.js";

function tokensMatch(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const paymentInclude = {
  patient: true,
  appointment: { include: { service: true } },
  package: true,
} as const;

function mapOnlinePayment(p: {
  id: string;
  amountCents: number;
  status: PaymentStatus;
  kind: string;
  method: string | null;
  notes: string | null;
  paidAt: Date | null;
  createdAt: Date;
  packageId: string | null;
  provider: OnlineProvider | null;
  externalId: string | null;
  checkoutUrl: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  patient: { id: string; phone: string; name: string | null; email?: string | null };
  appointment: {
    id: string;
    startsAt: Date;
    status: AppointmentStatus;
    patientConfirmedAt: Date | null;
    service: { id: string; name: string };
  } | null;
  package: { id: string; name: string; totalSessions: number } | null;
}) {
  return {
    id: p.id,
    amountCents: p.amountCents,
    status: p.status,
    kind: p.kind,
    method: p.method,
    notes: p.notes,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    packageId: p.packageId,
    provider: p.provider,
    externalId: p.externalId,
    checkoutUrl: p.checkoutUrl,
    pixQrCode: p.pixQrCode,
    pixCopyPaste: p.pixCopyPaste,
    patient: {
      id: p.patient.id,
      phone: p.patient.phone,
      name: p.patient.name,
      email: p.patient.email ?? null,
    },
    appointment: p.appointment
      ? {
          id: p.appointment.id,
          start: p.appointment.startsAt.toISOString(),
          status: p.appointment.status,
          patientConfirmedAt:
            p.appointment.patientConfirmedAt?.toISOString() ?? null,
          service: {
            id: p.appointment.service.id,
            name: p.appointment.service.name,
          },
        }
      : null,
    package: p.package
      ? {
          id: p.package.id,
          name: p.package.name,
          totalSessions: p.package.totalSessions,
        }
      : null,
  };
}

/** Marca pago + confirma sessão ligada. */
export async function finalizeOnlinePayment(input: {
  paymentId: string;
  method: "pix" | "card" | "cash";
  provider?: OnlineProvider | null;
  externalId?: string | null;
  notes?: string;
}) {
  const current = await prisma.payment.findFirst({
    where: { id: input.paymentId },
    include: paymentInclude,
  });
  if (!current) throw new PaymentError("Recebimento não encontrado", 404);
  if (current.status === PaymentStatus.cancelled) {
    throw new PaymentError("Recebimento cancelado", 422);
  }

  if (current.status === PaymentStatus.paid) {
    return {
      payment: mapOnlinePayment(current),
      sessionConfirmed: Boolean(current.appointment?.patientConfirmedAt),
      alreadyPaid: true,
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.update({
      where: { id: current.id },
      data: {
        status: PaymentStatus.paid,
        paidAt: new Date(),
        method: input.method,
        provider: input.provider ?? current.provider,
        externalId: input.externalId ?? current.externalId,
        notes: input.notes ?? current.notes,
      },
      include: paymentInclude,
    });

    let sessionConfirmed = false;
    if (payment.appointmentId) {
      await tx.appointment.update({
        where: { id: payment.appointmentId },
        data: {
          status: AppointmentStatus.confirmed,
          patientConfirmedAt: new Date(),
        },
      });
      sessionConfirmed = true;
    }

    return { payment, sessionConfirmed };
  });

  if (updated.payment.appointmentId) {
    await cancelPaymentRemindersForAppointment(updated.payment.appointmentId);
  }

  // reload appointment confirmation flags
  const fresh = await prisma.payment.findFirst({
    where: { id: updated.payment.id },
    include: paymentInclude,
  });

  return {
    payment: mapOnlinePayment(fresh!),
    sessionConfirmed: updated.sessionConfirmed,
    alreadyPaid: false,
    message: updated.sessionConfirmed
      ? "Pagamento recebido. Sessão confirmada."
      : "Pagamento recebido.",
  };
}

export function getOnlineProvidersStatus() {
  const items = listOnlineProviders();
  return {
    defaultProvider: env().PAYMENTS_DEFAULT_PROVIDER as OnlineProvider,
    items,
    sandboxAllowed: sandboxAllowed(),
    sandboxNote: sandboxAllowed()
      ? "Sem chave de API o checkout roda em sandbox com PIX simulado."
      : "Sandbox desabilitado — configure a chave do provedor.",
  };
}

export async function createOnlineCheckout(input: {
  clinicId: string;
  paymentId: string;
  provider?: OnlineProvider;
  method?: CheckoutMethod;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId, clinicId: input.clinicId },
    include: {
      patient: true,
      appointment: { include: { service: true } },
      package: true,
    },
  });
  if (!payment) throw new PaymentError("Recebimento não encontrado", 404);
  if (payment.status !== PaymentStatus.pending) {
    throw new PaymentError("Só é possível gerar checkout de pendências", 422);
  }

  const provider =
    input.provider ??
    (env().PAYMENTS_DEFAULT_PROVIDER as OnlineProvider);
  const method = input.method ?? "pix";

  const description = payment.appointment
    ? `${payment.appointment.service.name} — ${payment.patient.name ?? payment.patient.phone}`
    : payment.package
      ? `Pacote ${payment.package.name}`
      : `Pagamento ${payment.id.slice(0, 8)}`;

  const base = env().PUBLIC_BASE_URL.replace(/\/$/, "");
  let checkout;
  try {
    checkout = await createProviderCheckout(provider, {
      paymentId: payment.id,
      amountCents: payment.amountCents,
      description,
      patientName: payment.patient.name,
      patientEmail: payment.patient.email,
      patientPhone: payment.patient.phone,
      method,
      successUrl: `${base}/v1/public/payments/${payment.id}/success`,
      cancelUrl: `${base}/v1/public/payments/${payment.id}/checkout?provider=${provider}`,
      notificationUrl: `${base}/v1/public/webhooks/${provider}`,
    });
  } catch (err) {
    throw new PaymentError(
      err instanceof Error ? err.message : "Falha ao criar checkout",
      422,
    );
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      provider: checkout.provider,
      externalId: checkout.externalId,
      checkoutUrl: checkout.checkoutUrl,
      pixQrCode: checkout.pixQrCode,
      pixCopyPaste: checkout.pixCopyPaste,
      method: method === "pix" ? "pix" : "card",
    },
    include: paymentInclude,
  });

  return {
    ...mapOnlinePayment(updated),
    sandbox: checkout.sandbox,
    simulateToken:
      checkout.sandbox && sandboxAllowed()
        ? sandboxPayToken(payment.id)
        : null,
  };
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function assertSharedWebhookSecret(
  headers: Record<string, string | string[] | undefined> | undefined,
) {
  const expected = env().PAYMENTS_WEBHOOK_SECRET.trim();
  if (!expected) {
    if (env().NODE_ENV === "production") {
      throw new PaymentError(
        "PAYMENTS_WEBHOOK_SECRET obrigatório em produção",
        503,
      );
    }
    return;
  }
  const got =
    headerValue(headers, "x-clinic-webhook-secret") ??
    headerValue(headers, "x-webhook-secret");
  if (!got || !tokensMatch(got, expected)) {
    throw new PaymentError("Webhook secret inválido", 401);
  }
}

export async function handleProviderWebhook(input: {
  provider: OnlineProvider;
  body: unknown;
  rawBody?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | undefined>;
}) {
  assertSharedWebhookSecret(input.headers);

  const verified = await verifyProviderPaidEvent({
    provider: input.provider,
    body: input.body,
    rawBody: input.rawBody,
    signatureHeader: headerValue(input.headers, "stripe-signature"),
    query: input.query,
  });

  if (!verified) {
    return { ok: true, ignored: true };
  }

  const payment = await prisma.payment.findFirst({
    where: {
      OR: [{ id: verified.paymentId }, { externalId: verified.externalId }],
    },
  });
  if (payment) {
    const result = await finalizeOnlinePayment({
      paymentId: payment.id,
      method: verified.method,
      provider: input.provider,
      externalId: verified.externalId,
      notes: `Pago via ${input.provider} (webhook)`,
    });

    return {
      ok: true,
      paymentId: result.payment.id,
      sessionConfirmed: result.sessionConfirmed,
      message: result.message,
    };
  }

  const subscription = await findSubscriptionByCheckoutRef({
    id: verified.paymentId,
    externalId: verified.externalId,
  });
  if (!subscription) {
    return { ok: true, ignored: true, reason: "pagamento não encontrado" };
  }

  const subResult = await finalizeSubscriptionPayment({
    subscriptionId: subscription.id,
    method: verified.method,
    provider: input.provider,
    externalId: verified.externalId,
  });

  return {
    ok: true,
    subscriptionId: subResult.subscription.id,
    message: subResult.message ?? "Assinatura confirmada",
  };
}

export async function getPublicCheckout(paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId },
    include: paymentInclude,
  });
  if (!payment) throw new PaymentError("Pagamento não encontrado", 404);
  const canSimulate =
    payment.status === PaymentStatus.pending &&
    sandboxAllowed() &&
    isSandboxExternalId(payment.externalId);
  return {
    ...mapOnlinePayment(payment),
    simulateToken: canSimulate ? sandboxPayToken(payment.id) : null,
  };
}

export async function simulateSandboxPay(input: {
  paymentId: string;
  token: string;
}) {
  if (!sandboxAllowed()) {
    throw new PaymentError("Simulação de pagamento desabilitada", 403);
  }
  if (!tokensMatch(input.token, sandboxPayToken(input.paymentId))) {
    throw new PaymentError("Token de simulação inválido", 401);
  }
  const payment = await prisma.payment.findFirst({
    where: { id: input.paymentId },
  });
  if (!payment) throw new PaymentError("Pagamento não encontrado", 404);
  if (!isSandboxExternalId(payment.externalId)) {
    throw new PaymentError(
      "Simulação só é permitida em checkouts sandbox",
      403,
    );
  }
  return finalizeOnlinePayment({
    paymentId: input.paymentId,
    method: "pix",
    notes: "Pago via sandbox (simulação)",
  });
}
