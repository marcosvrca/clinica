import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fjwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { loadEnv, env, corsOrigins } from "./config/env.js";
import { prisma } from "./infra/prisma.js";
import { authenticateRequest } from "./http/auth.js";
import { registerRoutes } from "./http/routes.js";
import { registerPatientRoutes } from "./http/patients-routes.js";
import { registerSignupRoutes } from "./http/signup-routes.js";
import { getClinicBillingInfo } from "./services/subscriptions.js";

async function main() {
  loadEnv();
  const isProd = env().NODE_ENV === "production";
  const webDist = path.join(process.cwd(), "web", "dist");
  const serveSpa = isProd && fs.existsSync(webDist);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.x-api-key",
          "req.headers.apikey",
          "body.password",
          "body.draftContent",
          "body.sessionNotes",
          "body.evolution",
          "body.observations",
          "body.objectives",
          "body.hypotheses",
          "body.recurringThemes",
          "body.nextInterventions",
          "body.importantPoints",
          "body.audioNotes",
          "body.notes",
          "body.diagnosisCid",
          "body.diagnosisDsm",
        ],
        censor: "[redacted]",
      },
    },
    trustProxy: true,
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: serveSpa
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "https:"],
            fontSrc: ["'self'", "data:"],
            frameSrc: [
              "'self'",
              "https://www.mercadopago.com.br",
              "https://www.mercadopago.com",
              "https://sdk.mercadopago.com",
            ],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'", "https:"],
          },
        }
      : false,
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });
  await app.register(cors, {
    origin: corsOrigins(),
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "apikey",
      "x-clinic-webhook-secret",
      "x-webhook-secret",
    ],
  });
  await app.register(fjwt, {
    secret: env().JWT_SECRET,
  });
  await app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  // Preserva body bruto para validação de assinatura (Stripe etc.)
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      try {
        const raw = typeof body === "string" ? body : String(body);
        (request as { rawBody?: string }).rawBody = raw;
        const json = raw === "" ? {} : JSON.parse(raw);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.addHook("preHandler", async (request, reply) => {
    await authenticateRequest(request, reply);
  });

  app.addHook("preHandler", async (request, reply) => {
    if (reply.sent) return;
    if (!request.auth || request.auth.kind !== "staff") return;
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
    const urlPath = request.url.split("?")[0] ?? "";
    if (
      urlPath.startsWith("/v1/billing") ||
      urlPath.startsWith("/v1/auth/") ||
      urlPath.startsWith("/v1/public/")
    ) {
      return;
    }
    const billing = await getClinicBillingInfo(request.auth.clinicId);
    if (billing.billingBlocked) {
      return reply.code(402).send({
        error:
          "Assinatura em atraso ou cancelada. Regularize o pagamento para continuar.",
        billing,
      });
    }
  });

  await registerRoutes(app);
  await registerPatientRoutes(app);
  await registerSignupRoutes(app);

  if (serveSpa) {
    await app.register(fastifyStatic, {
      root: webDist,
      // Deixa 404 cair no setNotFoundHandler (SPA fallback)
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      const urlPath = request.url.split("?")[0] ?? "";
      if (urlPath.startsWith("/v1") || urlPath === "/health") {
        return reply.code(404).send({ error: "not found" });
      }
      if (request.method === "GET" || request.method === "HEAD") {
        return reply.sendFile("index.html", webDist);
      }
      return reply.code(404).send({ error: "not found" });
    });
  }

  const port = env().PORT;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(
    `clinica-psicologia on :${port}${serveSpa ? " (api + spa)" : ""}`,
  );

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
