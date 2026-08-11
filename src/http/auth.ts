import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../infra/prisma.js";

export type AuthActor =
  | { kind: "service"; clinicId: string | null }
  | {
      kind: "staff";
      userId: string;
      clinicId: string;
      role: "admin" | "professional";
      professionalId: string | null;
      name: string;
      email: string;
    };

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthActor;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      sub: string;
      clinicId: string;
      role: "admin" | "professional";
      professionalId: string | null;
      email: string;
      name: string;
    };
    user: {
      sub: string;
      clinicId: string;
      role: "admin" | "professional";
      professionalId: string | null;
      email: string;
      name: string;
    };
  }
}

function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function isPublicPath(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  if (
    path === "/health" ||
    path === "/v1/auth/login" ||
    path.startsWith("/v1/public/")
  ) {
    return true;
  }
  // Painel SPA + assets estáticos (mesma origem em produção)
  if (!path.startsWith("/v1")) return true;
  return false;
}

/**
 * Rotas permitidas para `x-api-key` (bot / integrações).
 * Prontuário, financeiro, pacientes e dashboard exigem JWT de staff.
 */
export function isServiceAllowedPath(url: string, method = "GET"): boolean {
  const path = url.split("?")[0] ?? url;
  const m = method.toUpperCase();

  if (path === "/v1/clinic" && m === "GET") return true;
  if (path === "/v1/services" && m === "GET") return true;
  if (path === "/v1/professionals" && m === "GET") return true;
  if (path === "/v1/availability" && m === "GET") return true;
  if (path === "/v1/appointments" && (m === "GET" || m === "POST")) return true;
  if (/^\/v1\/appointments\/[^/]+$/.test(path) && m === "GET") return true;
  if (
    /^\/v1\/appointments\/[^/]+\/(cancel|reschedule)$/.test(path) &&
    m === "POST"
  ) {
    return true;
  }
  if (path === "/v1/reminders/due" && m === "GET") return true;
  if (/^\/v1\/reminders\/[^/]+\/(sent|failed)$/.test(path) && m === "POST") {
    return true;
  }
  return false;
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (isPublicPath(request.url)) return;

  const apiKeyHeader = request.headers["x-api-key"] ?? request.headers.apikey;
  if (apiKeyHeader) {
    const provided = String(apiKeyHeader);
    if (safeEqualString(provided, env().CLINIC_API_KEY)) {
      if (!isServiceAllowedPath(request.url, request.method)) {
        await reply.code(403).send({
          error:
            "API key do bot não tem acesso a esta rota. Use login JWT no painel.",
        });
        return;
      }
      const clinicId = env().CLINIC_ID.trim() || null;
      if (env().NODE_ENV === "production" && !clinicId) {
        await reply.code(500).send({
          error: "CLINIC_ID não configurado para a API key",
        });
        return;
      }
      request.auth = { kind: "service", clinicId };
      return;
    }
    await reply.code(401).send({ error: "unauthorized" });
    return;
  }

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = await request.jwtVerify<{
        sub: string;
        clinicId: string;
        role: "admin" | "professional";
        professionalId: string | null;
        email: string;
        name: string;
      }>();
      request.auth = {
        kind: "staff",
        userId: payload.sub,
        clinicId: payload.clinicId,
        role: payload.role,
        professionalId: payload.professionalId,
        name: payload.name,
        email: payload.email,
      };
      return;
    } catch {
      await reply.code(401).send({ error: "unauthorized" });
      return;
    }
  }

  await reply.code(401).send({ error: "unauthorized" });
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post(
    "/v1/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
      })
      .parse(request.body);

    const user = await prisma.staffUser.findFirst({
      where: {
        email: body.email.toLowerCase().trim(),
        active: true,
        clinic: { active: true },
      },
      include: { professional: true, clinic: true },
    });

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: "E-mail ou senha inválidos" });
    }

    const { getClinicBillingInfo } = await import(
      "../services/subscriptions.js"
    );
    const billing = await getClinicBillingInfo(user.clinicId);

    const token = app.jwt.sign(
      {
        sub: user.id,
        clinicId: user.clinicId,
        role: user.role,
        professionalId: user.professionalId,
        email: user.email,
        name: user.name,
      },
      { expiresIn: "12h" },
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        professionalId: user.professionalId,
        clinic: { id: user.clinic.id, name: user.clinic.name },
        billing,
      },
    };
  });

  app.get("/v1/auth/me", async (request, reply) => {
    if (!request.auth || request.auth.kind !== "staff") {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const user = await prisma.staffUser.findFirst({
      where: { id: request.auth.userId, active: true },
      include: { clinic: true },
    });
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { getClinicBillingInfo } = await import(
      "../services/subscriptions.js"
    );
    const billing = await getClinicBillingInfo(user.clinicId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      professionalId: user.professionalId,
      clinic: { id: user.clinic.id, name: user.clinic.name },
      billing,
    };
  });

  app.get("/v1/billing", async (request, reply) => {
    if (!request.auth || request.auth.kind !== "staff") {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const { getClinicBillingInfo } = await import(
      "../services/subscriptions.js"
    );
    return getClinicBillingInfo(request.auth.clinicId);
  });

  app.post("/v1/billing/cancel", async (request, reply) => {
    if (!request.auth || request.auth.kind !== "staff") {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (request.auth.role !== "admin") {
      return reply.code(403).send({ error: "Somente administradores podem cancelar a assinatura." });
    }
    try {
      const { cancelClinicSubscription } = await import(
        "../services/subscriptions.js"
      );
      const subscription = await cancelClinicSubscription(request.auth.clinicId);
      return { ok: true, subscription };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : "erro";
      return reply.code(status).send({ error: message });
    }
  });
}

export async function resolveClinicId(request: FastifyRequest): Promise<string | null> {
  if (request.auth?.kind === "staff") return request.auth.clinicId;
  if (request.auth?.kind === "service" && request.auth.clinicId) {
    return request.auth.clinicId;
  }
  const fixed = env().CLINIC_ID.trim();
  if (fixed) {
    const clinic = await prisma.clinic.findFirst({
      where: { id: fixed, active: true },
    });
    return clinic?.id ?? null;
  }
  // Em production CLINIC_ID é obrigatório — sem fallback ambíguo.
  if (env().NODE_ENV === "production") return null;
  const clinic = await prisma.clinic.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });
  return clinic?.id ?? null;
}

/**
 * Escopo clínico para role=professional.
 * - `undefined` = admin (sem filtro forçado)
 * - `string` = só registros deste profissional
 * - `null` = já respondeu 403
 */
export async function resolveClinicalProfessionalScope(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null | undefined> {
  if (request.auth?.kind !== "staff") {
    await reply.code(403).send({
      error: "Acesso clínico exige login no painel",
    });
    return null;
  }
  if (request.auth.role === "admin") return undefined;
  if (!request.auth.professionalId) {
    await reply.code(403).send({
      error: "Usuário profissional sem vínculo. Contate a administração.",
    });
    return null;
  }
  return request.auth.professionalId;
}

/** Exige JWT de staff (painel). */
export async function requireStaff(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (request.auth?.kind === "staff") return true;
  await reply.code(403).send({
    error: "Esta rota exige login no painel (JWT)",
  });
  return false;
}
