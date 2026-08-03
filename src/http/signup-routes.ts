import type { FastifyInstance, FastifyReply } from "fastify";
import { OnlineProvider } from "@prisma/client";
import { z } from "zod";
import {
  SubscriptionError,
  completeSubscriptionSignup,
  getSetupContext,
  getSubscriptionPlan,
  getSubscriptionStatus,
  simulateSubscriptionPay,
  startSubscriptionCheckout,
} from "../services/subscriptions.js";

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof SubscriptionError) {
    return reply.code(err.statusCode).send({ error: err.message });
  }
  if (err instanceof z.ZodError) {
    return reply.code(400).send({
      error: err.issues.map((i) => i.message).join("; "),
    });
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  const message = err instanceof Error ? err.message : "erro interno";
  return reply.code(status).send({ error: message });
}

export async function registerSignupRoutes(app: FastifyInstance) {
  app.get("/v1/public/signup/plan", async () => {
    return { plan: getSubscriptionPlan() };
  });

  app.get("/v1/public/signup/setup", async (request, reply) => {
    try {
      const q = z.object({ token: z.string().min(16) }).parse(request.query);
      return getSetupContext(q.token);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/public/signup/complete", async (request, reply) => {
    try {
      const body = z
        .object({
          token: z.string().min(16),
          fullName: z.string().min(3).max(120),
          clinicName: z.string().min(2).max(120),
          phone: z.string().max(20).optional(),
          password: z.string().min(8).max(128),
          crp: z.string().max(40).optional(),
          specialty: z.string().max(80).optional(),
          timezone: z.string().max(64).optional(),
        })
        .parse(request.body);
      const result = await completeSubscriptionSignup(body);
      return reply.code(201).send(result);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/public/signup/checkout", async (request, reply) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          method: z.enum(["pix", "card"]).optional(),
          provider: z.nativeEnum(OnlineProvider).optional(),
        })
        .parse(request.body);
      const created = await startSubscriptionCheckout(body);
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/public/signup/:id", async (request, reply) => {
    try {
      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      return getSubscriptionStatus(params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/public/signup/:id/simulate", async (request, reply) => {
    try {
      const params = z.object({ id: z.string().min(1) }).parse(request.params);
      const body = z.object({ token: z.string().min(8) }).parse(request.body);
      const result = await simulateSubscriptionPay({
        subscriptionId: params.id,
        token: body.token,
      });
      return result;
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
