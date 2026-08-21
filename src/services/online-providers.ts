import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { OnlineProvider } from "@prisma/client";
import { env } from "../config/env.js";

export type CheckoutMethod = "pix" | "card";

export type CreateCheckoutInput = {
  paymentId: string;
  amountCents: number;
  description: string;
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string;
  method: CheckoutMethod;
  successUrl: string;
  cancelUrl: string;
  notificationUrl: string;
};

export type CheckoutResult = {
  provider: OnlineProvider;
  externalId: string;
  checkoutUrl: string;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  sandbox: boolean;
};

export type ProviderInfo = {
  id: OnlineProvider;
  label: string;
  configured: boolean;
  supports: CheckoutMethod[];
};

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function sandboxAllowed() {
  const flag = env().PAYMENTS_ALLOW_SANDBOX;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return env().NODE_ENV !== "production";
}

/** URL de notificação com ?secret= para provedores que não enviam header customizado (ex.: Mercado Pago). */
export function providerWebhookUrl(provider: OnlineProvider | string) {
  const base = env().PUBLIC_BASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/v1/public/webhooks/${provider}`);
  const secret = env().PAYMENTS_WEBHOOK_SECRET.trim();
  if (secret) url.searchParams.set("secret", secret);
  return url.toString();
}

export function isSandboxExternalId(externalId: string | null | undefined) {
  return Boolean(externalId?.startsWith("sandbox_"));
}

function requireOrSandbox(
  provider: OnlineProvider,
  hasKey: boolean,
  input: CreateCheckoutInput,
): CheckoutResult | null {
  if (hasKey) return null;
  if (!sandboxAllowed()) {
    throw new Error(
      `${provider}: chave de API não configurada. Defina a variável de ambiente do provedor.`,
    );
  }
  return sandboxCheckout(provider, input);
}

export function listOnlineProviders(): ProviderInfo[] {
  return [
    {
      id: OnlineProvider.mercado_pago,
      label: "Mercado Pago",
      configured: configured(env().MERCADOPAGO_ACCESS_TOKEN),
      supports: ["pix", "card"],
    },
    {
      id: OnlineProvider.stripe,
      label: "Stripe",
      configured: configured(env().STRIPE_SECRET_KEY),
      supports: ["pix", "card"],
    },
    {
      id: OnlineProvider.asaas,
      label: "Asaas",
      configured: configured(env().ASAAS_API_KEY),
      supports: ["pix", "card"],
    },
    {
      id: OnlineProvider.pagarme,
      label: "Pagar.me",
      configured: configured(env().PAGARME_SECRET_KEY),
      supports: ["pix", "card"],
    },
  ];
}

function sandboxCheckout(
  provider: OnlineProvider,
  input: CreateCheckoutInput,
): CheckoutResult {
  const externalId = `sandbox_${provider}_${input.paymentId}_${randomUUID().slice(0, 8)}`;
  const copyPaste = `00020126580014BR.GOV.BCB.PIX0136${input.paymentId}520400005303986540${(
    input.amountCents / 100
  ).toFixed(2)}5802BR5910mvFlow Psi6009SAO PAULO62070503***6304ABCD`;
  return {
    provider,
    externalId,
    checkoutUrl: `${env().PUBLIC_BASE_URL}/v1/public/payments/${input.paymentId}/checkout?provider=${provider}`,
    pixQrCode:
      input.method === "pix"
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(copyPaste)}`
        : null,
    pixCopyPaste: input.method === "pix" ? copyPaste : null,
    sandbox: true,
  };
}

async function mercadoPagoCheckout(
  input: CreateCheckoutInput,
): Promise<CheckoutResult> {
  const token = env().MERCADOPAGO_ACCESS_TOKEN.trim();
  const sandbox = requireOrSandbox(
    OnlineProvider.mercado_pago,
    Boolean(token),
    input,
  );
  if (sandbox) return sandbox;

  const body = {
    external_reference: input.paymentId,
    notification_url: input.notificationUrl,
    items: [
      {
        title: input.description.slice(0, 120),
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number((input.amountCents / 100).toFixed(2)),
      },
    ],
    payer: {
      name: input.patientName ?? undefined,
      email: input.patientEmail ?? undefined,
      phone: { number: input.patientPhone },
    },
    back_urls: {
      success: input.successUrl,
      failure: input.cancelUrl,
      pending: input.successUrl,
    },
    auto_return: "approved",
    ...(input.method === "pix"
      ? { payment_methods: { excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }] } }
      : {}),
  };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
    message?: string;
  };
  if (!res.ok || !data.id) {
    throw new Error(data.message ?? `Mercado Pago: erro ${res.status}`);
  }
  return {
    provider: OnlineProvider.mercado_pago,
    externalId: data.id,
    checkoutUrl: data.init_point ?? data.sandbox_init_point ?? "",
    pixQrCode: null,
    pixCopyPaste: null,
    sandbox: false,
  };
}

async function stripeCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
  const key = env().STRIPE_SECRET_KEY.trim();
  const sandbox = requireOrSandbox(OnlineProvider.stripe, Boolean(key), input);
  if (sandbox) return sandbox;

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${input.successUrl}?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", input.cancelUrl);
  params.set("client_reference_id", input.paymentId);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "brl");
  params.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  params.set("line_items[0][price_data][product_data][name]", input.description.slice(0, 120));
  if (input.patientEmail) params.set("customer_email", input.patientEmail);
  if (input.method === "pix") {
    params.append("payment_method_types[]", "pix");
  } else {
    params.append("payment_method_types[]", "card");
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = (await res.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.id || !data.url) {
    throw new Error(data.error?.message ?? `Stripe: erro ${res.status}`);
  }
  return {
    provider: OnlineProvider.stripe,
    externalId: data.id,
    checkoutUrl: data.url,
    pixQrCode: null,
    pixCopyPaste: null,
    sandbox: false,
  };
}

async function asaasCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
  const key = env().ASAAS_API_KEY.trim();
  const sandbox = requireOrSandbox(OnlineProvider.asaas, Boolean(key), input);
  if (sandbox) return sandbox;

  const base = env().ASAAS_BASE_URL.replace(/\/$/, "");
  // Garante cliente
  const customerRes = await fetch(`${base}/customers`, {
    method: "POST",
    headers: {
      access_token: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.patientName ?? input.patientPhone,
      email: input.patientEmail ?? undefined,
      mobilePhone: input.patientPhone,
      externalReference: input.paymentId,
    }),
  });
  const customer = (await customerRes.json()) as { id?: string; errors?: { description?: string }[] };
  if (!customerRes.ok || !customer.id) {
    throw new Error(customer.errors?.[0]?.description ?? `Asaas customer: ${customerRes.status}`);
  }

  const billingType = input.method === "pix" ? "PIX" : "CREDIT_CARD";
  const due = new Date();
  due.setDate(due.getDate() + 1);
  const payRes = await fetch(`${base}/payments`, {
    method: "POST",
    headers: {
      access_token: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customer: customer.id,
      billingType,
      value: Number((input.amountCents / 100).toFixed(2)),
      dueDate: due.toISOString().slice(0, 10),
      description: input.description.slice(0, 200),
      externalReference: input.paymentId,
    }),
  });
  const pay = (await payRes.json()) as {
    id?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    errors?: { description?: string }[];
  };
  if (!payRes.ok || !pay.id) {
    throw new Error(pay.errors?.[0]?.description ?? `Asaas payment: ${payRes.status}`);
  }

  let pixCopyPaste: string | null = null;
  let pixQrCode: string | null = null;
  if (input.method === "pix") {
    const qrRes = await fetch(`${base}/payments/${pay.id}/pixQrCode`, {
      headers: { access_token: key },
    });
    const qr = (await qrRes.json()) as {
      encodedImage?: string;
      payload?: string;
    };
    if (qrRes.ok) {
      pixCopyPaste = qr.payload ?? null;
      pixQrCode = qr.encodedImage
        ? `data:image/png;base64,${qr.encodedImage}`
        : null;
    }
  }

  return {
    provider: OnlineProvider.asaas,
    externalId: pay.id,
    checkoutUrl:
      pay.invoiceUrl ??
      `${env().PUBLIC_BASE_URL}/v1/public/payments/${input.paymentId}/checkout?provider=asaas`,
    pixQrCode,
    pixCopyPaste,
    sandbox: false,
  };
}

async function pagarmeCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
  const key = env().PAGARME_SECRET_KEY.trim();
  const sandbox = requireOrSandbox(OnlineProvider.pagarme, Boolean(key), input);
  if (sandbox) return sandbox;

  const auth = Buffer.from(`${key}:`).toString("base64");
  const paymentMethod = input.method === "pix" ? "pix" : "credit_card";
  const res = await fetch("https://api.pagar.me/core/v5/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      closed: true,
      code: input.paymentId,
      customer: {
        name: input.patientName ?? input.patientPhone,
        email: input.patientEmail ?? `${input.patientPhone}@paciente.local`,
        type: "individual",
        phones: {
          mobile_phone: {
            country_code: "55",
            area_code: input.patientPhone.slice(0, 2) || "11",
            number: input.patientPhone.slice(2) || "999999999",
          },
        },
      },
      items: [
        {
          amount: input.amountCents,
          description: input.description.slice(0, 120),
          quantity: 1,
          code: input.paymentId,
        },
      ],
      payments: [
        {
          payment_method: paymentMethod,
          ...(paymentMethod === "pix"
            ? { pix: { expires_in: 3600 } }
            : {
                credit_card: {
                  installments: 1,
                  statement_descriptor: "CLINICA",
                },
              }),
        },
      ],
    }),
  });
  const data = (await res.json()) as {
    id?: string;
    checkouts?: { payment_url?: string }[];
    charges?: {
      id?: string;
      last_transaction?: {
        qr_code?: string;
        qr_code_url?: string;
      };
    }[];
    message?: string;
  };
  if (!res.ok || !data.id) {
    throw new Error(data.message ?? `Pagar.me: erro ${res.status}`);
  }

  const tx = data.charges?.[0]?.last_transaction;
  return {
    provider: OnlineProvider.pagarme,
    externalId: data.id,
    checkoutUrl:
      data.checkouts?.[0]?.payment_url ??
      `${env().PUBLIC_BASE_URL}/v1/public/payments/${input.paymentId}/checkout?provider=pagarme`,
    pixQrCode: tx?.qr_code_url ?? null,
    pixCopyPaste: tx?.qr_code ?? null,
    sandbox: false,
  };
}

export async function createProviderCheckout(
  provider: OnlineProvider,
  input: CreateCheckoutInput,
): Promise<CheckoutResult> {
  switch (provider) {
    case OnlineProvider.mercado_pago:
      return mercadoPagoCheckout(input);
    case OnlineProvider.stripe:
      return stripeCheckout(input);
    case OnlineProvider.asaas:
      return asaasCheckout(input);
    case OnlineProvider.pagarme:
      return pagarmeCheckout(input);
    default:
      return sandboxCheckout(provider, input);
  }
}

export type VerifiedPaidEvent = {
  paymentId: string;
  externalId: string;
  method: "pix" | "card";
};

function timingSafeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  const secret = env().STRIPE_WEBHOOK_SECRET.trim();
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return timingSafeEqualHex(expected, v1);
}

async function fetchMercadoPagoPaid(
  mpPaymentId: string,
): Promise<VerifiedPaidEvent | null> {
  const token = env().MERCADOPAGO_ACCESS_TOKEN.trim();
  if (!token) return null;
  const res = await fetch(
    `https://api.mercadopago.com/v1/payments/${mpPaymentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id?: number | string;
    status?: string;
    external_reference?: string;
    payment_type_id?: string;
  };
  if (data.status !== "approved" || !data.external_reference) return null;
  return {
    paymentId: data.external_reference,
    externalId: String(data.id ?? mpPaymentId),
    method: data.payment_type_id === "credit_card" || data.payment_type_id === "debit_card"
      ? "card"
      : "pix",
  };
}

async function fetchAsaasPaid(asaasId: string): Promise<VerifiedPaidEvent | null> {
  const key = env().ASAAS_API_KEY.trim();
  if (!key) return null;
  const base = env().ASAAS_BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/payments/${asaasId}`, {
    headers: { access_token: key },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id?: string;
    status?: string;
    externalReference?: string;
    billingType?: string;
  };
  if (
    !data.externalReference ||
    (data.status !== "RECEIVED" &&
      data.status !== "CONFIRMED" &&
      data.status !== "RECEIVED_IN_CASH")
  ) {
    return null;
  }
  return {
    paymentId: data.externalReference,
    externalId: data.id ?? asaasId,
    method: data.billingType === "PIX" ? "pix" : "card",
  };
}

async function fetchPagarmePaid(orderId: string): Promise<VerifiedPaidEvent | null> {
  const key = env().PAGARME_SECRET_KEY.trim();
  if (!key) return null;
  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`https://api.pagar.me/core/v5/orders/${orderId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id?: string;
    code?: string;
    status?: string;
    charges?: { payment_method?: string }[];
  };
  if (data.status !== "paid" || !data.code) return null;
  return {
    paymentId: data.code,
    externalId: data.id ?? orderId,
    method: data.charges?.[0]?.payment_method === "pix" ? "pix" : "card",
  };
}

/**
 * Valida o webhook consultando a API do provedor (não confia só no body).
 * Stripe exige assinatura quando STRIPE_WEBHOOK_SECRET está definido.
 */
export async function verifyProviderPaidEvent(input: {
  provider: OnlineProvider;
  body: unknown;
  rawBody?: string;
  signatureHeader?: string;
  query?: Record<string, string | undefined>;
}): Promise<VerifiedPaidEvent | null> {
  const data = input.body as Record<string, unknown>;
  const q = input.query ?? {};

  if (input.provider === OnlineProvider.mercado_pago) {
    const mpId =
      q.id ||
      q["data.id"] ||
      (typeof (data.data as { id?: string } | undefined)?.id === "string" ||
      typeof (data.data as { id?: number } | undefined)?.id === "number"
        ? String((data.data as { id: string | number }).id)
        : null) ||
      (typeof data.id === "string" || typeof data.id === "number"
        ? String(data.id)
        : null);
    if (!mpId) return null;
    return fetchMercadoPagoPaid(mpId);
  }

  if (input.provider === OnlineProvider.stripe) {
    const secret = env().STRIPE_WEBHOOK_SECRET.trim();
    // Sem secret configurado, não confia no body (use sandbox/simulate localmente).
    if (
      !secret ||
      !input.rawBody ||
      !verifyStripeWebhookSignature(input.rawBody, input.signatureHeader)
    ) {
      return null;
    }
    const type = String(data.type ?? "");
    if (
      type !== "checkout.session.completed" &&
      type !== "payment_intent.succeeded"
    ) {
      return null;
    }
    const obj = (data.data as { object?: Record<string, unknown> } | undefined)
      ?.object;
    const paymentId =
      (obj?.client_reference_id as string | undefined) ??
      (obj?.metadata as { paymentId?: string } | undefined)?.paymentId;
    const externalId = (obj?.id as string | undefined) ?? "";
    if (!paymentId) return null;
    const paid =
      obj?.payment_status === "paid" ||
      type === "payment_intent.succeeded" ||
      type === "checkout.session.completed";
    if (!paid) return null;
    return {
      paymentId,
      externalId,
      method: "card",
    };
  }

  if (input.provider === OnlineProvider.asaas) {
    const payment = data.payment as { id?: string } | undefined;
    const asaasId = payment?.id ?? (typeof data.id === "string" ? data.id : null);
    if (!asaasId) return null;
    return fetchAsaasPaid(asaasId);
  }

  if (input.provider === OnlineProvider.pagarme) {
    const orderId =
      (typeof data.id === "string" ? data.id : null) ||
      (typeof data.data === "object" &&
      data.data &&
      typeof (data.data as { id?: string }).id === "string"
        ? (data.data as { id: string }).id
        : null);
    if (!orderId) return null;
    return fetchPagarmePaid(orderId);
  }

  return null;
}

/** Assinatura leve para links sandbox (não substitui HMAC de provedor). */
export function sandboxPayToken(paymentId: string) {
  return createHash("sha256")
    .update(`${paymentId}:${env().JWT_SECRET}:pay`)
    .digest("hex")
    .slice(0, 24);
}
