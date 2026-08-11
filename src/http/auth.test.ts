import { describe, expect, it } from "vitest";
import { isPublicPath, isServiceAllowedPath } from "../http/auth.js";
import { normalizePhone } from "../lib/time.js";
import { ClinicalRecordError } from "../services/clinical-records.js";
import { AppointmentError } from "../services/appointments.js";
import { assertProductionReady } from "../config/production-guards.js";
import type { Env } from "../config/env.js";

describe("auth public paths", () => {
  it("libera health e login", () => {
    expect(isPublicPath("/health")).toBe(true);
    expect(isPublicPath("/v1/auth/login")).toBe(true);
    expect(isPublicPath("/v1/auth/login?x=1")).toBe(true);
  });

  it("libera onboarding de assinatura", () => {
    expect(isPublicPath("/v1/public/signup/plan")).toBe(true);
    expect(isPublicPath("/v1/public/signup/checkout")).toBe(true);
    expect(isPublicPath("/v1/public/signup/setup")).toBe(true);
  });

  it("libera convite e recuperação de senha", () => {
    expect(isPublicPath("/v1/public/staff/invite")).toBe(true);
    expect(isPublicPath("/v1/public/staff/invite/accept")).toBe(true);
    expect(isPublicPath("/v1/public/staff/forgot-password")).toBe(true);
    expect(isPublicPath("/v1/public/staff/reset")).toBe(true);
  });

  it("protege rotas clínicas", () => {
    expect(isPublicPath("/v1/patients")).toBe(false);
    expect(isPublicPath("/v1/clinical-records")).toBe(false);
    expect(isPublicPath("/v1/auth/me")).toBe(false);
    expect(isPublicPath("/v1/staff")).toBe(false);
    expect(isPublicPath("/v1/auth/change-password")).toBe(false);
  });

  it("libera SPA e assets estáticos", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/assine")).toBe(true);
    expect(isPublicPath("/assets/index.js")).toBe(true);
  });
});

describe("service API key allowlist", () => {
  it("permite agenda do bot", () => {
    expect(isServiceAllowedPath("/v1/services", "GET")).toBe(true);
    expect(isServiceAllowedPath("/v1/availability", "GET")).toBe(true);
    expect(isServiceAllowedPath("/v1/appointments", "POST")).toBe(true);
    expect(isServiceAllowedPath("/v1/appointments", "GET")).toBe(true);
    expect(isServiceAllowedPath("/v1/appointments/abc/cancel", "POST")).toBe(true);
    expect(isServiceAllowedPath("/v1/appointments/abc/reschedule", "POST")).toBe(
      true,
    );
    expect(isServiceAllowedPath("/v1/reminders/due", "GET")).toBe(true);
    expect(isServiceAllowedPath("/v1/reminders/r1/sent", "POST")).toBe(true);
  });

  it("bloqueia prontuário, financeiro e mutações de staff", () => {
    expect(isServiceAllowedPath("/v1/clinical-records", "GET")).toBe(false);
    expect(isServiceAllowedPath("/v1/payments", "GET")).toBe(false);
    expect(isServiceAllowedPath("/v1/patients", "GET")).toBe(false);
    expect(isServiceAllowedPath("/v1/dashboard", "GET")).toBe(false);
    expect(isServiceAllowedPath("/v1/appointments/abc", "PATCH")).toBe(false);
    expect(isServiceAllowedPath("/v1/appointments/abc/move", "POST")).toBe(false);
    expect(isServiceAllowedPath("/v1/reminders/dispatch", "POST")).toBe(false);
    expect(isServiceAllowedPath("/v1/patients/abc/prep-context", "GET")).toBe(
      false,
    );
  });
});

describe("production guards", () => {
  const base: Env = {
    NODE_ENV: "production",
    PORT: 4000,
    DATABASE_URL: "postgresql://x",
    CLINIC_API_KEY: "prod-api-key-strong-16",
    CLINIC_ID: "clinic_live",
    JWT_SECRET: "prod-jwt-secret-at-least-32-chars!!",
    CLINICAL_ENCRYPTION_KEY: "prod-clinical-key-at-least-32ch!!",
    CORS_ORIGINS: "https://app.exemplo.com",
    TIMEZONE: "America/Sao_Paulo",
    CANCEL_MIN_HOURS: 2,
    SLOT_INTERVAL_MINUTES: 50,
    REMINDER_HOURS_BEFORE: 24,
    REMINDER_WHATSAPP_ENABLED: true,
    REMINDER_EMAIL_ENABLED: true,
    RESEND_API_KEY: "",
    RESEND_FROM: "Clínica <noreply@exemplo.com>",
    PUBLIC_BASE_URL: "https://api.exemplo.com",
    WEB_BASE_URL: "https://app.exemplo.com",
    PAYMENTS_DEFAULT_PROVIDER: "mercado_pago",
    MERCADOPAGO_ACCESS_TOKEN: "",
    MERCADOPAGO_PREAPPROVAL_PLAN_ID: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    ASAAS_API_KEY: "",
    ASAAS_BASE_URL: "https://api.asaas.com/api/v3",
    PAGARME_SECRET_KEY: "",
    PAYMENTS_ALLOW_SANDBOX: "auto",
    PAYMENTS_WEBHOOK_SECRET: "prod-webhook-secret-strong",
    COMPLIMENTARY_SIGNUP_EMAILS: "",
    SUBSCRIPTION_PLAN_CODE: "pro_monthly",
    SUBSCRIPTION_PLAN_NAME: "Plano",
    SUBSCRIPTION_AMOUNT_CENTS: 19900,
    SUBSCRIPTION_PLAN_DESCRIPTION: "desc",
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "gpt-4o-mini",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
  };

  it("aceita config de produção válida", () => {
    expect(() => assertProductionReady(base)).not.toThrow();
  });

  it("rejeita secrets de exemplo e CLINIC_ID vazio", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        CLINIC_ID: "",
        CLINIC_API_KEY: "clinic-api-key-change-me-16",
      }),
    ).toThrow(/CLINIC_ID|CLINIC_API_KEY/);
  });

  it("rejeita webhook secret vazio em production", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        PAYMENTS_WEBHOOK_SECRET: "",
      }),
    ).toThrow(/PAYMENTS_WEBHOOK_SECRET/);
  });

  it("ignora checagens fora de production", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        NODE_ENV: "development",
        CLINIC_ID: "",
        CLINIC_API_KEY: "clinic-api-key-change-me-16",
        PAYMENTS_WEBHOOK_SECRET: "",
      }),
    ).not.toThrow();
  });
});

describe("normalizePhone", () => {
  it("remove máscara", () => {
    expect(normalizePhone("(63) 99990-0001")).toBe("63999900001");
    expect(normalizePhone("55 63 99990-0001")).toBe("5563999900001");
  });
});

describe("domain errors", () => {
  it("carrega códigos HTTP de domínio", () => {
    expect(new AppointmentError("Horário já ocupado", 409).statusCode).toBe(409);
    expect(
      new ClinicalRecordError("Registro já confirmado no prontuário", 422).statusCode,
    ).toBe(422);
  });
});
