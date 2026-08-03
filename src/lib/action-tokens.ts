import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export type ActionKind = "confirm" | "reschedule";

type ActionPayload = {
  appointmentId: string;
  action: ActionKind;
  exp: number;
};

function b64url(input: Buffer | string) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

function sign(body: string) {
  return createHmac("sha256", env().JWT_SECRET).update(body).digest();
}

/** Token assinado para links de e-mail / botões (sem login). */
export function createActionToken(
  appointmentId: string,
  action: ActionKind,
  ttlSeconds = 7 * 24 * 3600,
) {
  const payload: ActionPayload = {
    appointmentId,
    action,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(sign(body));
  return `${body}.${sig}`;
}

export function verifyActionToken(token: string): ActionPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Token inválido");
  const expected = sign(body);
  const got = fromB64url(sig);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    throw new Error("Token inválido");
  }
  const payload = JSON.parse(fromB64url(body).toString("utf8")) as ActionPayload;
  if (!payload.appointmentId || !payload.action || !payload.exp) {
    throw new Error("Token inválido");
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Link expirado");
  }
  if (payload.action !== "confirm" && payload.action !== "reschedule") {
    throw new Error("Ação inválida");
  }
  return payload;
}

export function actionUrl(appointmentId: string, action: ActionKind) {
  const token = createActionToken(appointmentId, action);
  return `${env().PUBLIC_BASE_URL}/v1/public/actions/${action}?token=${encodeURIComponent(token)}`;
}
