import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../infra/prisma.js";
import {
  getAvailability,
  listProfessionals,
  listServices,
} from "../services/availability.js";
import {
  AppointmentError,
  bookAppointment,
  cancelAppointment,
  listClinicAppointments,
  listPatientAppointments,
  rescheduleAppointment,
} from "../services/appointments.js";
import {
  ClinicalRecordError,
  confirmClinicalRecord,
  createClinicalRecord,
  getClinicalRecord,
  getClinicalRecordStats,
  listClinicalRecords,
  updateClinicalRecord,
} from "../services/clinical-records.js";
import { formatDateTime } from "../lib/time.js";

async function authHook(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers["x-api-key"] ?? request.headers.apikey;
  if (!key || String(key) !== env().CLINIC_API_KEY) {
    await reply.code(401).send({ error: "unauthorized" });
  }
}

function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof AppointmentError || err instanceof ClinicalRecordError) {
    return reply.code(err.statusCode).send({ error: err.message });
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  const message = err instanceof Error ? err.message : "erro interno";
  return reply.code(status).send({ error: message });
}

function mapAppointment(a: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  notes: string | null;
  professional: { id: string; name: string };
  service: { id: string; name: string; durationMinutes: number };
  patient: { id: string; phone: string; name: string | null };
}) {
  return {
    id: a.id,
    status: a.status,
    start: a.startsAt.toISOString(),
    end: a.endsAt.toISOString(),
    startLabel: formatDateTime(a.startsAt),
    notes: a.notes,
    professional: { id: a.professional.id, name: a.professional.name },
    service: {
      id: a.service.id,
      name: a.service.name,
      durationMinutes: a.service.durationMinutes,
    },
    patient: { id: a.patient.id, phone: a.patient.phone, name: a.patient.name },
  };
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", service: "clinica-psicologia" };
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/health")) return;
    await authHook(request, reply);
  });

  app.get("/v1/clinic", async (_req, reply) => {
    const clinic = await prisma.clinic.findFirst({ where: { active: true } });
    if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
    return clinic;
  });

  app.get("/v1/patients", async (_req, reply) => {
    const clinic = await prisma.clinic.findFirst({ where: { active: true } });
    if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60_000);

    const patients = await prisma.patient.findMany({
      where: { clinicId: clinic.id },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        _count: { select: { appointments: true } },
        appointments: {
          orderBy: { startsAt: "desc" },
          take: 40,
          include: {
            service: true,
            professional: true,
          },
        },
      },
    });

    const items = patients.map((p) => {
      const upcoming = p.appointments
        .filter((a) => a.status === "confirmed" && a.startsAt >= now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
      const last = p.appointments
        .filter((a) => a.status === "confirmed" && a.startsAt < now)
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
      const recentOrUpcoming = p.appointments.some(
        (a) =>
          a.status === "confirmed" &&
          (a.startsAt >= ninetyDaysAgo || a.startsAt >= now),
      );
      const therapist = upcoming?.professional ?? last?.professional ?? null;
      const specialty = therapist?.specialty ?? "";
      const tag =
        /cognitivo|tcc/i.test(specialty)
          ? "TCC"
          : /psican/i.test(specialty)
            ? "Psicanálise"
            : specialty
              ? specialty.split(" ")[0]
              : "Geral";
      const count = p._count.appointments;
      const plan = count >= 12 ? "Anual" : count >= 6 ? "Trimestral" : count >= 2 ? "Mensal" : "Avulso";

      return {
        id: p.id,
        phone: p.phone,
        name: p.name,
        email: p.email,
        createdAt: p.createdAt.toISOString(),
        appointmentsCount: count,
        status: recentOrUpcoming ? "ativo" : "pausado",
        plan,
        therapist: therapist
          ? { id: therapist.id, name: therapist.name, tag }
          : null,
        lastAppointment: last
          ? {
              start: last.startsAt.toISOString(),
              startLabel: formatDateTime(last.startsAt),
              service: last.service.name,
            }
          : null,
        nextAppointment: upcoming
          ? {
              start: upcoming.startsAt.toISOString(),
              startLabel: formatDateTime(upcoming.startsAt),
              service: upcoming.service.name,
            }
          : null,
      };
    });

    const activeCount = items.filter((i) => i.status === "ativo").length;
    const newThisMonth = patients.filter((p) => p.createdAt >= monthStart).length;
    const withReturn = items.filter((i) => i.appointmentsCount >= 2).length;
    const returnRate =
      items.length === 0 ? 0 : Math.round((withReturn / items.length) * 100);

    return {
      stats: {
        total: items.length,
        active: activeCount,
        activePct: items.length === 0 ? 0 : Math.round((activeCount / items.length) * 100),
        newThisMonth,
        returnRate,
      },
      items,
    };
  });

  app.get("/v1/dashboard", async (_req, reply) => {
    const clinic = await prisma.clinic.findFirst({ where: { active: true } });
    if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });

    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(now);
    endToday.setHours(23, 59, 59, 999);

    const weekStart = new Date(startToday);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    weekEnd.setMilliseconds(-1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      activePatients,
      todayItems,
      monthConfirmed,
      monthCancelled,
      weekItems,
      upcoming,
      history,
      pros,
    ] = await Promise.all([
      prisma.patient.count({ where: { clinicId: clinic.id } }),
      prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: "confirmed",
          startsAt: { gte: startToday, lte: endToday },
        },
        include: { professional: true, service: true, patient: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: "confirmed",
          startsAt: { gte: monthStart, lte: monthEnd },
        },
        include: { service: true },
      }),
      prisma.appointment.count({
        where: {
          clinicId: clinic.id,
          status: "cancelled",
          startsAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: { in: ["confirmed", "pending"] },
          startsAt: { gte: weekStart, lte: weekEnd },
        },
        include: { professional: true, service: true, patient: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: "confirmed",
          startsAt: { gte: now },
        },
        include: { professional: true, service: true, patient: true },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      prisma.appointment.findMany({
        where: {
          clinicId: clinic.id,
          status: "confirmed",
          startsAt: { gte: sixMonthsAgo, lte: monthEnd },
        },
        select: { startsAt: true },
      }),
      prisma.professional.findMany({
        where: { clinicId: clinic.id, active: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const professional =
      pros.find((p) => p.id === "pro_ana") ?? pros[0] ?? null;

    const monthlyRevenueCents = monthConfirmed.reduce(
      (sum, a) => sum + (a.service.priceCents ?? 0),
      0,
    );
    const attendanceDenom = monthConfirmed.length + monthCancelled;
    const attendanceRate =
      attendanceDenom === 0
        ? 100
        : Math.round((monthConfirmed.length / attendanceDenom) * 100);

    const monthLabels: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      monthLabels.push({ key, label, count: 0 });
    }
    for (const a of history) {
      const key = `${a.startsAt.getFullYear()}-${a.startsAt.getMonth()}`;
      const bucket = monthLabels.find((m) => m.key === key);
      if (bucket) bucket.count += 1;
    }

    return {
      clinic: { id: clinic.id, name: clinic.name },
      professional: professional
        ? { id: professional.id, name: professional.name, specialty: professional.specialty }
        : null,
      kpis: {
        activePatients,
        todayAppointments: todayItems.length,
        monthlyRevenueCents,
        attendanceRate,
      },
      evolution: monthLabels.map(({ label, count }) => ({ label, count })),
      week: weekItems.map(mapAppointment),
      upcoming: upcoming.map(mapAppointment),
      today: todayItems.map(mapAppointment),
      weekStart: weekStart.toISOString(),
    };
  });

  app.get("/v1/services", async (_req, reply) => {
    const clinic = await prisma.clinic.findFirst({ where: { active: true } });
    if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
    const services = await listServices(clinic.id);
    return { items: services };
  });

  app.get("/v1/professionals", async (request, reply) => {
    const clinic = await prisma.clinic.findFirst({ where: { active: true } });
    if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
    const q = z.object({ serviceId: z.string().optional() }).parse(request.query);
    const items = await listProfessionals(clinic.id, q.serviceId);
    return { items };
  });

  app.get("/v1/availability", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const q = z
        .object({
          serviceId: z.string().min(1),
          professionalId: z.string().optional(),
          from: z.string().datetime().optional(),
          days: z.coerce.number().int().positive().max(30).optional(),
        })
        .parse(request.query);
      const slots = await getAvailability({
        clinicId: clinic.id,
        serviceId: q.serviceId,
        professionalId: q.professionalId,
        from: q.from ? new Date(q.from) : new Date(),
        days: q.days ?? 14,
      });
      return { slots };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/appointments", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const body = z
        .object({
          phone: z.string().min(8),
          patientName: z.string().optional(),
          serviceId: z.string().min(1),
          professionalId: z.string().min(1),
          start: z.string().datetime(),
          notes: z.string().optional(),
          source: z.string().optional(),
        })
        .parse(request.body);
      const created = await bookAppointment({ clinicId: clinic.id, ...body });
      return reply.code(201).send(mapAppointment(created));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/appointments", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const q = z
        .object({
          phone: z.string().min(8).optional(),
          professionalId: z.string().optional(),
          status: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          scope: z.enum(["patient", "clinic"]).optional(),
        })
        .parse(request.query);

      // Compatível com o bot: só telefone → agenda do paciente (confirmados futuros)
      if (q.phone && !q.from && !q.to && !q.professionalId && !q.status && q.scope !== "clinic") {
        const items = await listPatientAppointments(clinic.id, q.phone);
        return { items: items.map(mapAppointment) };
      }

      const items = await listClinicAppointments({
        clinicId: clinic.id,
        phone: q.phone,
        professionalId: q.professionalId,
        status: q.status,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
      });
      return { items: items.map(mapAppointment) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/appointments/:id/cancel", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ phone: z.string().min(8) }).parse(request.body);
      const cancelled = await cancelAppointment({
        clinicId: clinic.id,
        appointmentId: params.id,
        phone: body.phone,
      });
      return mapAppointment(cancelled);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/appointments/:id/reschedule", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          phone: z.string().min(8),
          start: z.string().datetime(),
          professionalId: z.string().optional(),
        })
        .parse(request.body);
      const updated = await rescheduleAppointment({
        clinicId: clinic.id,
        appointmentId: params.id,
        phone: body.phone,
        start: body.start,
        professionalId: body.professionalId,
      });
      return mapAppointment(updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/clinical-records", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const q = z
        .object({
          patientId: z.string().optional(),
          status: z.enum(["draft", "confirmed"]).optional(),
          professionalId: z.string().optional(),
        })
        .parse(request.query);
      const [items, stats] = await Promise.all([
        listClinicalRecords({ clinicId: clinic.id, ...q }),
        getClinicalRecordStats(clinic.id),
      ]);
      return { stats, items };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/clinical-records/:id", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const params = z.object({ id: z.string() }).parse(request.params);
      return getClinicalRecord(clinic.id, params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/clinical-records", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const body = z
        .object({
          patientId: z.string().optional(),
          professionalId: z.string().optional(),
          appointmentId: z.string().optional(),
          sessionNotes: z.string().optional(),
          draftContent: z.string().optional(),
          recordingConsent: z.boolean().optional(),
        })
        .parse(request.body);
      const created = await createClinicalRecord({ clinicId: clinic.id, ...body });
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/v1/clinical-records/:id", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          sessionNotes: z.string().nullable().optional(),
          draftContent: z.string().optional(),
          recordingConsent: z.boolean().optional(),
          professionalId: z.string().optional(),
        })
        .parse(request.body);
      return updateClinicalRecord({ clinicId: clinic.id, id: params.id, ...body });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/clinical-records/:id/confirm", async (request, reply) => {
    try {
      const clinic = await prisma.clinic.findFirst({ where: { active: true } });
      if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
      const params = z.object({ id: z.string() }).parse(request.params);
      return confirmClinicalRecord(clinic.id, params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
