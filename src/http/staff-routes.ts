import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  acceptInvite,
  changePassword,
  getInviteContext,
  getResetContext,
  inviteStaff,
  listStaff,
  requestPasswordReset,
  resetPassword,
  setStaffActive,
  StaffError,
} from "../services/staff.js";

function staffErrorReply(reply: {
  code: (n: number) => { send: (b: unknown) => unknown };
}, err: unknown) {
  if (err instanceof StaffError) {
    return reply.code(err.statusCode).send({ error: err.message });
  }
  throw err;
}

export async function registerStaffRoutes(app: FastifyInstance) {
  app.get("/v1/public/staff/invite", async (request, reply) => {
    const q = z.object({ token: z.string().min(20) }).parse(request.query);
    try {
      return await getInviteContext(q.token);
    } catch (err) {
      return staffErrorReply(reply, err);
    }
  });

  app.post("/v1/public/staff/invite/accept", async (request, reply) => {
    const body = z
      .object({
        token: z.string().min(20),
        password: z.string().min(8),
        name: z.string().min(2).optional(),
      })
      .parse(request.body);
    try {
      return await acceptInvite(body);
    } catch (err) {
      return staffErrorReply(reply, err);
    }
  });

  app.post(
    "/v1/public/staff/forgot-password",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const body = z.object({ email: z.string().email() }).parse(request.body);
      try {
        return await requestPasswordReset(body.email);
      } catch (err) {
        return staffErrorReply(reply, err);
      }
    },
  );

  app.get("/v1/public/staff/reset", async (request, reply) => {
    const q = z.object({ token: z.string().min(20) }).parse(request.query);
    try {
      return await getResetContext(q.token);
    } catch (err) {
      return staffErrorReply(reply, err);
    }
  });

  app.post(
    "/v1/public/staff/reset",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const body = z
        .object({
          token: z.string().min(20),
          password: z.string().min(8),
        })
        .parse(request.body);
      try {
        return await resetPassword(body);
      } catch (err) {
        return staffErrorReply(reply, err);
      }
    },
  );

  app.get("/v1/staff", async (request, reply) => {
    if (!request.auth || request.auth.kind !== "staff") {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (request.auth.role !== "admin") {
      return reply.code(403).send({ error: "Apenas administradores" });
    }
    return { items: await listStaff(request.auth.clinicId) };
  });

  app.post("/v1/staff/invite", async (request, reply) => {
    if (!request.auth || request.auth.kind !== "staff") {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (request.auth.role !== "admin") {
      return reply.code(403).send({ error: "Apenas administradores" });
    }
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(2),
        role: z.enum(["admin", "professional"]),
        professionalId: z.string().cuid().nullable().optional(),
      })
      .parse(request.body);
    try {
      return await inviteStaff({
        clinicId: request.auth.clinicId,
        email: body.email,
        name: body.name,
        role: body.role,
        professionalId: body.professionalId,
      });
    } catch (err) {
      return staffErrorReply(reply, err);
    }
  });

  app.patch("/v1/staff/:id/active", async (request, reply) => {
    if (!request.auth || request.auth.kind !== "staff") {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (request.auth.role !== "admin") {
      return reply.code(403).send({ error: "Apenas administradores" });
    }
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const body = z.object({ active: z.boolean() }).parse(request.body);
    try {
      return await setStaffActive({
        clinicId: request.auth.clinicId,
        staffId: id,
        active: body.active,
        actorUserId: request.auth.userId,
      });
    } catch (err) {
      return staffErrorReply(reply, err);
    }
  });

  app.post("/v1/auth/change-password", async (request, reply) => {
    if (!request.auth || request.auth.kind !== "staff") {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      })
      .parse(request.body);
    try {
      return await changePassword({
        userId: request.auth.userId,
        clinicId: request.auth.clinicId,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
    } catch (err) {
      return staffErrorReply(reply, err);
    }
  });
}
