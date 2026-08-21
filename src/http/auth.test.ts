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
    expect(isServiceAllowedPath("/v1/platform/overview", "GET")).toBe(false);
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
    RESEND_API_KEY: "re_prod_test_key_xxxxxxxx",
    RESEND_FROM: "Clínica <noreply@exemplo.com>",
    PUBLIC_BASE_URL: "https://api.exemplo.com",
    WEB_BASE_URL: "https://app.exemplo.com",
    PAYMENTS_DEFAULT_PROVIDER: "mercado_pago",
    MERCADOPAGO_ACCESS_TOKEN: "APP_USR-prod-token",
    MERCADOPAGO_PREAPPROVAL_PLAN_ID: "",
    MERCADOPAGO_PREAPPROVAL_PLAN_ID_SOLO: "plan_solo_abc",
    MERCADOPAGO_PREAPPROVAL_PLAN_ID_TEAM: "plan_team_abc",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    ASAAS_API_KEY: "",
    ASAAS_BASE_URL: "https://api.asaas.com/api/v3",
    PAGARME_SECRET_KEY: "",
    PAYMENTS_ALLOW_SANDBOX: "auto",
    PAYMENTS_WEBHOOK_SECRET: "prod-webhook-secret-strong",
    COMPLIMENTARY_SIGNUP_EMAILS: "",
    PLATFORM_ADMIN_EMAILS: "",
    SUBSCRIPTION_PLAN_CODE: "solo_monthly",
    SUBSCRIPTION_PLAN_NAME: "Individual",
    SUBSCRIPTION_AMOUNT_CENTS: 3990,
    SUBSCRIPTION_PLAN_DESCRIPTION: "desc",
    SUBSCRIPTION_SOLO_PLAN_NAME: "Individual",
    SUBSCRIPTION_SOLO_AMOUNT_CENTS: 3990,
    SUBSCRIPTION_SOLO_PLAN_DESCRIPTION: "desc",
    SUBSCRIPTION_TEAM_PLAN_NAME: "Compartilhado",
    SUBSCRIPTION_TEAM_AMOUNT_CENTS: 6990,
    SUBSCRIPTION_TEAM_PLAN_DESCRIPTION: "desc team",
    SUBSCRIPTION_TEAM_MAX_PROFESSIONALS: 5,
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "gpt-4o-mini",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
  };

  it("aceita config de produção válida", () => {
    expect(() => assertProductionReady(base)).not.toThrow();
  });

  it("rejeita secrets de exemplo", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        CLINIC_API_KEY: "clinic-api-key-change-me-16",
      }),
    ).toThrow(/CLINIC_API_KEY/);
  });

  it("permite CLINIC_ID vazio no boot (primeiro deploy)", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        CLINIC_ID: "",
      }),
    ).not.toThrow();
  });

  it("rejeita webhook secret vazio em production", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        PAYMENTS_WEBHOOK_SECRET: "",
      }),
    ).toThrow(/PAYMENTS_WEBHOOK_SECRET/);
  });

  it("exige Resend, Mercado Pago e planos em production", () => {
    expect(() =>
      assertProductionReady({ ...base, RESEND_API_KEY: "" }),
    ).toThrow(/RESEND_API_KEY/);
    expect(() =>
      assertProductionReady({ ...base, MERCADOPAGO_ACCESS_TOKEN: "" }),
    ).toThrow(/MERCADOPAGO_ACCESS_TOKEN/);
    expect(() =>
      assertProductionReady({
        ...base,
        MERCADOPAGO_PREAPPROVAL_PLAN_ID_SOLO: "",
        MERCADOPAGO_PREAPPROVAL_PLAN_ID: "",
      }),
    ).toThrow(/PREAPPROVAL_PLAN_ID_SOLO|PREAPPROVAL_PLAN_ID/);
    expect(() =>
      assertProductionReady({
        ...base,
        MERCADOPAGO_PREAPPROVAL_PLAN_ID_TEAM: "",
      }),
    ).toThrow(/PREAPPROVAL_PLAN_ID_TEAM/);
  });

  it("rejeita sandbox forçado e FROM de teste", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        PAYMENTS_ALLOW_SANDBOX: "true",
      }),
    ).toThrow(/PAYMENTS_ALLOW_SANDBOX/);
    expect(() =>
      assertProductionReady({
        ...base,
        RESEND_FROM: "Clínica <onboarding@resend.dev>",
      }),
    ).toThrow(/RESEND_FROM|onboarding@resend/);
  });

  it("rejeita URLs sem HTTPS", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        PUBLIC_BASE_URL: "http://api.exemplo.com",
      }),
    ).toThrow(/HTTPS/);
  });

  it("ignora checagens fora de production", () => {
    expect(() =>
      assertProductionReady({
        ...base,
        NODE_ENV: "development",
        CLINIC_ID: "",
        CLINIC_API_KEY: "clinic-api-key-change-me-16",
        PAYMENTS_WEBHOOK_SECRET: "",
        RESEND_API_KEY: "",
        MERCADOPAGO_ACCESS_TOKEN: "",
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
