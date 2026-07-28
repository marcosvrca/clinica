import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv, env } from "./config/env.js";
import { prisma } from "./infra/prisma.js";
import { registerRoutes } from "./http/routes.js";

async function main() {
  loadEnv();
  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(cors, {
    origin: true,
    allowedHeaders: ["Content-Type", "x-api-key", "apikey"],
  });
  await registerRoutes(app);

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
