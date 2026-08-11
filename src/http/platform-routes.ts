import type { FastifyInstance } from "fastify";
import {
  getPlatformOverview,
  isPlatformAdminEmail,
} from "../services/platform.js";

export async function registerPlatformRoutes(app: FastifyInstance) {
  app.get("/v1/platform/overview", async (request, reply) => {
    if (!request.auth || request.auth.kind !== "staff") {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (!isPlatformAdminEmail(request.auth.email)) {
      return reply.code(403).send({ error: "Acesso restrito à plataforma" });
    }
    return getPlatformOverview();
  });
}
