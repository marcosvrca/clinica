import { describe, expect, it } from "vitest";
import { isPublicPath } from "../http/auth.js";
import { normalizePhone } from "../lib/time.js";
import { ClinicalRecordError } from "../services/clinical-records.js";
import { AppointmentError } from "../services/appointments.js";

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

  it("protege rotas clínicas", () => {
    expect(isPublicPath("/v1/patients")).toBe(false);
    expect(isPublicPath("/v1/clinical-records")).toBe(false);
    expect(isPublicPath("/v1/auth/me")).toBe(false);
  });

  it("libera SPA e assets estáticos", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/assine")).toBe(true);
    expect(isPublicPath("/assets/index.js")).toBe(true);
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
    expect(new ClinicalRecordError("Registro já confirmado no prontuário", 422).statusCode).toBe(
      422,
    );
  });
});
