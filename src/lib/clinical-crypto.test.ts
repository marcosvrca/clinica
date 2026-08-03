import { beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../config/env.js";
import {
  decryptClinical,
  encryptClinical,
  encryptClinicalRequired,
} from "./clinical-crypto.js";

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5433/x";
  process.env.CLINIC_API_KEY ??= "clinic-api-key-change-me-16";
  process.env.JWT_SECRET ??= "clinic-jwt-secret-change-me-32chars";
  process.env.CLINICAL_ENCRYPTION_KEY ??= "clinic-clinical-key-change-me-32";
  loadEnv();
});

describe("clinical crypto", () => {
  it("criptografa e descriptografa texto", () => {
    const cipher = encryptClinical("nota sensível do paciente");
    expect(cipher).toMatch(/^enc:v1:/);
    expect(cipher).not.toContain("sensível");
    expect(decryptClinical(cipher)).toBe("nota sensível do paciente");
  });

  it("mantém legado plaintext legível", () => {
    expect(decryptClinical("texto antigo sem cifra")).toBe("texto antigo sem cifra");
  });

  it("não recriptografa ciphertext", () => {
    const once = encryptClinicalRequired("abc");
    expect(encryptClinicalRequired(once)).toBe(once);
  });

  it("trata vazio e null", () => {
    expect(encryptClinical(null)).toBeNull();
    expect(encryptClinical("")).toBe("");
    expect(decryptClinical(null)).toBeNull();
  });
});
