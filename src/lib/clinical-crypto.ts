import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const PREFIX = "enc:v1:";

function keyBytes(): Buffer {
  // Deriva 32 bytes a partir do segredo configurado (aceita qualquer string longa)
  return createHash("sha256").update(env().CLINICAL_ENCRYPTION_KEY).digest();
}

/** Criptografa texto clínico. Valores vazios/nulos passam direto. */
export function encryptClinical(plain: string | null | undefined): string | null {
  if (plain == null) return null;
  if (plain === "") return "";
  if (plain.startsWith(PREFIX)) return plain;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64url");
  return `${PREFIX}${payload}`;
}

/** Descriptografa; se não for ciphertext (legado plaintext), devolve como está. */
export function decryptClinical(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (value === "") return "";
  if (!value.startsWith(PREFIX)) return value;

  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  if (raw.length < 12 + 16) {
    throw new Error("ciphertext clínico inválido");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function encryptClinicalRequired(plain: string): string {
  return encryptClinical(plain) ?? "";
}
