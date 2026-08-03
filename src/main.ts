import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fjwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { loadEnv, env, corsOrigins } from "./config/env.js";
import { prisma } from "./infra/prisma.js";
import { authenticateRequest } from "./http/auth.js";
import { registerRoutes } from "./http/routes.js";
import { registerPatientRoutes } from "./http/patients-routes.js";
import { registerSignupRoutes } from "./http/signup-routes.js";

async function main() {
  loadEnv();
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

  await app.register(helmet, { global: true });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });
  await app.register(cors, {
    origin: corsOrigins(),
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "apikey"],
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

  await registerRoutes(app);
  await registerPatientRoutes(app);
  await registerSignupRoutes(app);

  const port = env().PORT;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`clinica-psicologia on :${port}`);

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
