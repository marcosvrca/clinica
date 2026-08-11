import { OnlineProvider } from "@prisma/client";
import { env } from "../config/env.js";
import {
  isSandboxExternalId,
  providerWebhookUrl,
  sandboxAllowed,
  type CheckoutResult,
} from "./online-providers.js";
import { randomUUID } from "node:crypto";

export type MpSubscriptionCheckoutInput = {
  subscriptionId: string;
  email: string;
  amountCents: number;
  planName: string;
  planCode: string;
  backUrl: string;
};

function mpToken() {
  return env().MERCADOPAGO_ACCESS_TOKEN.trim();
}

async function mpFetch(path: string, init?: RequestInit) {
  const token = mpToken();
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurada");
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      `Mercado Pago ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function configuredPreapprovalPlanId(planCode: string): string {
  if (planCode === "team_monthly") {
    return (
      env().MERCADOPAGO_PREAPPROVAL_PLAN_ID_TEAM.trim() ||
      env().MERCADOPAGO_PREAPPROVAL_PLAN_ID.trim()
    );
  }
  return (
    env().MERCADOPAGO_PREAPPROVAL_PLAN_ID_SOLO.trim() ||
    env().MERCADOPAGO_PREAPPROVAL_PLAN_ID.trim()
  );
}

/** Cria ou reutiliza o plano mensal de Assinaturas para o planCode. */
export async function ensureMercadoPagoPreapprovalPlan(
  planCode = "solo_monthly",
  amountCents?: number,
  planName?: string,
): Promise<string> {
  const configured = configuredPreapprovalPlanId(planCode);
  if (configured) return configured;

  const amount = Number(
    ((amountCents ?? env().SUBSCRIPTION_SOLO_AMOUNT_CENTS) / 100).toFixed(2),
  );
  const backUrl = env().WEB_BASE_URL.replace(/\/$/, "") + "/assine";
  const data = await mpFetch("/preapproval_plan", {
    method: "POST",
    body: JSON.stringify({
      reason: planName ?? env().SUBSCRIPTION_SOLO_PLAN_NAME,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: amount,
        currency_id: "BRL",
      },
      back_url: backUrl,
      external_reference: planCode,
    }),
  });

  const id = typeof data.id === "string" ? data.id : null;
  if (!id) throw new Error("Mercado Pago: plano sem id");
  const hint =
    planCode === "team_monthly"
      ? "MERCADOPAGO_PREAPPROVAL_PLAN_ID_TEAM"
      : "MERCADOPAGO_PREAPPROVAL_PLAN_ID_SOLO";
  console.info(
    `[mp-subscriptions] preapproval_plan criado id=${id} plan=${planCode} — defina ${hint} no Railway para reutilizar`,
  );
  return id;
}

/**
 * Cria assinatura MP e devolve init_point (checkout de Assinaturas).
 * Sem token + sandboxAllowed → checkout sandbox local (simulação).
 */
export async function createMercadoPagoSubscriptionCheckout(
  input: MpSubscriptionCheckoutInput,
): Promise<
  CheckoutResult & {
    mpPreapprovalPlanId: string | null;
    mpPreapprovalId: string | null;
  }
> {
  const token = mpToken();
  if (!token) {
    if (!sandboxAllowed()) {
      throw new Error(
        "mercado_pago: chave de API não configurada. Defina MERCADOPAGO_ACCESS_TOKEN.",
      );
    }
    const externalId = `sandbox_mp_sub_${input.subscriptionId}_${randomUUID().slice(0, 8)}`;
    return {
      provider: OnlineProvider.mercado_pago,
      externalId,
      checkoutUrl: `${env().PUBLIC_BASE_URL.replace(/\/$/, "")}/assine?paid=${input.subscriptionId}`,
      pixQrCode: null,
      pixCopyPaste: null,
      sandbox: true,
      mpPreapprovalPlanId: null,
      mpPreapprovalId: null,
    };
  }

  const planId = await ensureMercadoPagoPreapprovalPlan(
    input.planCode,
    input.amountCents,
    input.planName,
  );
  const data = await mpFetch("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      preapproval_plan_id: planId,
      reason: `${input.planName} — Bem Estar`,
      external_reference: input.subscriptionId,
      payer_email: input.email,
      back_url: input.backUrl,
      status: "pending",
      notification_url: providerWebhookUrl(OnlineProvider.mercado_pago),
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number((input.amountCents / 100).toFixed(2)),
        currency_id: "BRL",
      },
    }),
  });

  const preapprovalId =
    typeof data.id === "string"
      ? data.id
      : typeof data.id === "number"
        ? String(data.id)
        : null;
  const initPoint =
    (typeof data.init_point === "string" && data.init_point) ||
    (typeof data.sandbox_init_point === "string" && data.sandbox_init_point) ||
    null;

  if (!preapprovalId || !initPoint) {
    throw new Error("Mercado Pago: assinatura sem init_point");
  }

  return {
    provider: OnlineProvider.mercado_pago,
    externalId: preapprovalId,
    checkoutUrl: initPoint,
    pixQrCode: null,
    pixCopyPaste: null,
    sandbox: false,
    mpPreapprovalPlanId: planId,
    mpPreapprovalId: preapprovalId,
  };
}

export async function cancelMercadoPagoPreapproval(preapprovalId: string) {
  await mpFetch(`/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

export type MpPreapprovalSnapshot = {
  id: string;
  status: string;
  externalReference: string | null;
  nextPaymentDate: string | null;
};

export async function fetchMercadoPagoPreapproval(
  id: string,
): Promise<MpPreapprovalSnapshot | null> {
  if (!mpToken()) return null;
  try {
    const data = await mpFetch(`/preapproval/${encodeURIComponent(id)}`);
    return {
      id: String(data.id ?? id),
      status: String(data.status ?? ""),
      externalReference:
        typeof data.external_reference === "string"
          ? data.external_reference
          : null,
      nextPaymentDate:
        typeof data.next_payment_date === "string"
          ? data.next_payment_date
          : null,
    };
  } catch {
    return null;
  }
}

export type MpAuthorizedPaymentSnapshot = {
  id: string;
  status: string;
  preapprovalId: string | null;
  paymentId: string | null;
  externalReference: string | null;
  transactionAmount: number | null;
};

/** Cobrança autorizada da assinatura (renovação). */
export async function fetchMercadoPagoAuthorizedPayment(
  id: string,
): Promise<MpAuthorizedPaymentSnapshot | null> {
  if (!mpToken()) return null;
  try {
    const data = await mpFetch(
      `/authorized_payments/${encodeURIComponent(id)}`,
    );
    const preapprovalId =
      typeof data.preapproval_id === "string"
        ? data.preapproval_id
        : typeof data.preapproval_id === "number"
          ? String(data.preapproval_id)
          : null;
    const payment =
      data.payment && typeof data.payment === "object"
        ? (data.payment as Record<string, unknown>)
        : null;
    const paymentStatus =
      payment && typeof payment.status === "string" ? payment.status : "";
    return {
      id: String(data.id ?? id),
      status: String(data.status ?? paymentStatus ?? ""),
      preapprovalId,
      paymentId: payment?.id != null ? String(payment.id) : null,
      externalReference:
        typeof data.external_reference === "string"
          ? data.external_reference
          : null,
      transactionAmount:
        typeof data.transaction_amount === "number"
          ? data.transaction_amount
          : null,
    };
  } catch {
    return null;
  }
}

export function periodEndFromNow(months = 1) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

export function isSandboxMpSubscription(externalId: string | null | undefined) {
  return isSandboxExternalId(externalId);
}
