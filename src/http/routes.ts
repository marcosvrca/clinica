import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import path from "node:path";
import {
  AppointmentStatus,
  ClinicalFileKind,
  ClinicalRecordStatus,
  ExpenseCategory,
  OnlineProvider,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  ReminderStatus,
} from "@prisma/client";
import { z } from "zod";
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
  getAppointment,
  listClinicAppointments,
  listPatientAppointments,
  moveAppointment,
  rescheduleAppointment,
  updateAppointmentDetails,
} from "../services/appointments.js";
import {
  ClinicalRecordError,
  confirmClinicalRecord,
  createClinicalRecord,
  deleteClinicalRecordFile,
  getClinicalRecord,
  getClinicalRecordFile,
  getClinicalRecordStats,
  listClinicalRecords,
  saveClinicalRecordFile,
  softDeleteClinicalRecord,
  updateClinicalRecord,
} from "../services/clinical-records.js";
import { listClinicalAuditLogs } from "../services/clinical-audit.js";
import { generateEvolutionDraft } from "../services/evolution-draft.js";
import {
  CalendarBlockError,
  createCalendarBlock,
  deleteCalendarBlock,
  listCalendarBlocks,
} from "../services/calendar-blocks.js";
import {
  PaymentError,
  createExpense,
  createPackage,
  createPayment,
  deleteExpense,
  getFinanceOverview,
  getPaymentStats,
  listExpenses,
  listPackages,
  listPayments,
  markPaymentPaid,
  usePackageSession,
} from "../services/payments.js";
import {
  createOnlineCheckout,
  getOnlineProvidersStatus,
  getPublicCheckout,
  handleProviderWebhook,
  simulateSandboxPay,
} from "../services/online-payments.js";
import {
  ReminderError,
  cancelReminder,
  confirmAppointmentByPatient,
  dispatchDueEmails,
  getRescheduleContext,
  listDueReminders,
  listReminders,
  markReminderFailed,
  markReminderSent,
} from "../services/reminders.js";
import {
  listPublicRescheduleSlots,
  rescheduleByPatientAction,
} from "../services/public-reschedule.js";
import { verifyActionToken } from "../lib/action-tokens.js";
import { env } from "../config/env.js";
import { escapeHtml, safeUrl } from "../lib/html.js";
import { isEmailConfigured } from "../lib/mailer.js";
import { addDays, formatDateTime, partsInTimeZone, zonedLocalToUtc } from "../lib/time.js";
import { registerAuthRoutes, requireStaff, resolveClinicId, resolveClinicalProfessionalScope } from "./auth.js";
import {
  UploadMimeError,
  assertClinicalUploadMime,
} from "../lib/upload-mime.js";

function sendError(reply: FastifyReply, err: unknown) {
  if (
    err instanceof AppointmentError ||
    err instanceof ClinicalRecordError ||
    err instanceof CalendarBlockError ||
    err instanceof PaymentError ||
    err instanceof ReminderError ||
    err instanceof UploadMimeError
  ) {
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

async function requireClinic(request: Parameters<typeof resolveClinicId>[0], reply: FastifyReply) {
  const clinicId = await resolveClinicId(request);
  if (!clinicId) {
    await reply.code(404).send({ error: "Clínica não configurada" });
    return null;
  }
  return clinicId;
}

function staffActor(request: Parameters<typeof resolveClinicId>[0]) {
  if (request.auth?.kind !== "staff") return undefined;
  return {
    staffUserId: request.auth.userId,
    professionalId: request.auth.professionalId,
    ip: request.ip,
  };
}

function mapAppointment(a: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus | string;
  notes: string | null;
  meetLink?: string | null;
  recurrenceRule?: string | null;
  recurrenceGroupId?: string | null;
  professional: { id: string; name: string; color?: string | null };
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
    meetLink: a.meetLink ?? null,
    recurrenceRule: a.recurrenceRule ?? null,
    recurrenceGroupId: a.recurrenceGroupId ?? null,
    professional: {
      id: a.professional.id,
      name: a.professional.name,
      color: a.professional.color ?? "#14b8a6",
    },
    service: {
      id: a.service.id,
      name: a.service.name,
      durationMinutes: a.service.durationMinutes,
    },
    patient: { id: a.patient.id, phone: a.patient.phone, name: a.patient.name },
  };
}

export async function registerRoutes(app: FastifyInstance) {
  await registerAuthRoutes(app);

  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", service: "clinica-psicologia" };
  });

  app.get("/v1/clinic", async (request, reply) => {
    const clinicId = await requireClinic(request, reply);
    if (!clinicId) return;
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) return reply.code(404).send({ error: "Clínica não configurada" });
    return clinic;
  });

  app.get("/v1/patients", async (request, reply) => {
    const clinicId = await requireClinic(request, reply);
    if (!clinicId) return;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60_000);

    const patients = await prisma.patient.findMany({
      where: { clinicId },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        _count: { select: { appointments: true } },
        appointments: {
          orderBy: { startsAt: "desc" },
          take: 40,
          include: { service: true, professional: true },
        },
      },
    });

    const items = patients.map((p) => {
      const upcoming = p.appointments
        .filter((a) => a.status === AppointmentStatus.confirmed && a.startsAt >= now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
      const last = p.appointments
        .filter((a) => a.status === AppointmentStatus.confirmed && a.startsAt < now)
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
      const recentOrUpcoming = p.appointments.some(
        (a) =>
          a.status === AppointmentStatus.confirmed &&
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
      const plan =
        count >= 12 ? "Anual" : count >= 6 ? "Trimestral" : count >= 2 ? "Mensal" : "Avulso";

      return {
        id: p.id,
        phone: p.phone,
        name: p.name,
        email: p.email,
        cpf: p.cpf,
        city: p.city,
        state: p.state,
        insuranceName: p.insuranceName,
        profession: p.profession,
        hasPhoto: Boolean(p.photoPath),
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
        activePct:
          items.length === 0 ? 0 : Math.round((activeCount / items.length) * 100),
        newThisMonth,
        returnRate,
      },
      items,
    };
  });

  app.get("/v1/dashboard", async (request, reply) => {
    if (!(await requireStaff(request, reply))) return;
    const clinicId = await requireClinic(request, reply);
    if (!clinicId) return;
    const scopePro = await resolveClinicalProfessionalScope(request, reply);
    if (scopePro === null) return;

    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    const now = new Date();
    const tz = env().TIMEZONE;
    const p = partsInTimeZone(now, tz);
    const startToday = zonedLocalToUtc(
      { year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 },
      tz,
    );
    const endToday = zonedLocalToUtc(
      { year: p.year, month: p.month, day: p.day, hour: 23, minute: 59 },
      tz,
    );
    endToday.setSeconds(59, 999);

    const daysFromMonday = (p.weekday + 6) % 7;
    const monday = addDays(
      { year: p.year, month: p.month, day: p.day },
      -daysFromMonday,
    );
    const weekStart = zonedLocalToUtc(
      { year: monday.year, month: monday.month, day: monday.day, hour: 0, minute: 0 },
      tz,
    );
    const nextMonday = addDays(monday, 7);
    const weekEnd = new Date(
      zonedLocalToUtc(
        {
          year: nextMonday.year,
          month: nextMonday.month,
          day: nextMonday.day,
          hour: 0,
          minute: 0,
        },
        tz,
      ).getTime() - 1,
    );

    const monthStart = zonedLocalToUtc(
      { year: p.year, month: p.month, day: 1, hour: 0, minute: 0 },
      tz,
    );
    const nextMonth =
      p.month === 12
        ? { year: p.year + 1, month: 1, day: 1 }
        : { year: p.year, month: p.month + 1, day: 1 };
    const monthEnd = new Date(
      zonedLocalToUtc(
        {
          year: nextMonth.year,
          month: nextMonth.month,
          day: nextMonth.day,
          hour: 0,
          minute: 0,
        },
        tz,
      ).getTime() - 1,
    );

    let sixY = p.year;
    let sixM = p.month - 5;
    while (sixM < 1) {
      sixM += 12;
      sixY -= 1;
    }
    const sixMonthsAgo = zonedLocalToUtc(
      { year: sixY, month: sixM, day: 1, hour: 0, minute: 0 },
      tz,
    );
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60_000);

    const staffProId =
      request.auth?.kind === "staff" ? request.auth.professionalId : null;
    const clinicalWhere = scopePro ? { professionalId: scopePro } : {};

    const paymentInclude = {
      patient: true,
      appointment: { include: { service: true } },
    } as const;

    const [
      activePatients,
      todayItems,
      monthConfirmed,
      monthCancelled,
      monthNoShow,
      weekItems,
      upcoming,
      history,
      pros,
      paymentPaidMonth,
      newPatients,
      newPatientsCount,
      todayPayments,
      pendingPayments,
      pendingEvolutions,
      pendingEvolutionsCount,
      recentAttended,
      todayPaidAgg,
      pendingAgg,
    ] = await Promise.all([
      prisma.patient.count({
        where: {
          clinicId,
          appointments: {
            some: {
              status: AppointmentStatus.confirmed,
              startsAt: { gte: ninetyDaysAgo },
            },
          },
        },
      }),
      prisma.appointment.findMany({
        where: {
          clinicId,
          status: AppointmentStatus.confirmed,
          startsAt: { gte: startToday, lte: endToday },
        },
        include: { professional: true, service: true, patient: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: {
          clinicId,
          status: AppointmentStatus.confirmed,
          startsAt: { gte: monthStart, lte: monthEnd },
        },
        include: { service: true },
      }),
      prisma.appointment.count({
        where: {
          clinicId,
          status: AppointmentStatus.cancelled,
          startsAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.appointment.count({
        where: {
          clinicId,
          status: AppointmentStatus.no_show,
          startsAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.appointment.findMany({
        where: {
          clinicId,
          status: {
            in: [AppointmentStatus.confirmed, AppointmentStatus.pending],
          },
          startsAt: { gte: weekStart, lte: weekEnd },
        },
        include: { professional: true, service: true, patient: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.appointment.findMany({
        where: {
          clinicId,
          status: AppointmentStatus.confirmed,
          startsAt: { gte: now },
        },
        include: { professional: true, service: true, patient: true },
        orderBy: { startsAt: "asc" },
        take: 8,
      }),
      prisma.appointment.findMany({
        where: {
          clinicId,
          status: AppointmentStatus.confirmed,
          startsAt: { gte: sixMonthsAgo, lte: monthEnd },
        },
        select: { startsAt: true },
      }),
      prisma.professional.findMany({
        where: { clinicId, active: true },
        orderBy: { name: "asc" },
      }),
      prisma.payment.aggregate({
        where: {
          clinicId,
          status: PaymentStatus.paid,
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amountCents: true },
      }),
      prisma.patient.findMany({
        where: { clinicId, createdAt: { gte: monthStart } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.patient.count({
        where: { clinicId, createdAt: { gte: monthStart } },
      }),
      prisma.payment.findMany({
        where: {
          clinicId,
          status: PaymentStatus.paid,
          paidAt: { gte: startToday, lte: endToday },
        },
        include: paymentInclude,
        orderBy: { paidAt: "desc" },
        take: 10,
      }),
      prisma.payment.findMany({
        where: { clinicId, status: PaymentStatus.pending },
        include: paymentInclude,
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.clinicalRecord.findMany({
        where: {
          clinicId,
          status: ClinicalRecordStatus.draft,
          deletedAt: null,
          ...clinicalWhere,
        },
        include: {
          patient: true,
          professional: true,
          appointment: { include: { service: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.clinicalRecord.count({
        where: {
          clinicId,
          status: ClinicalRecordStatus.draft,
          deletedAt: null,
          ...clinicalWhere,
        },
      }),
      prisma.appointment.findMany({
        where: {
          clinicId,
          status: AppointmentStatus.confirmed,
          startsAt: { lt: now },
        },
        include: { professional: true, service: true, patient: true },
        orderBy: { startsAt: "desc" },
        take: 8,
      }),
      prisma.payment.aggregate({
        where: {
          clinicId,
          status: PaymentStatus.paid,
          paidAt: { gte: startToday, lte: endToday },
        },
        _sum: { amountCents: true },
      }),
      prisma.payment.aggregate({
        where: { clinicId, status: PaymentStatus.pending },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ]);

    const professional =
      (staffProId ? pros.find((p) => p.id === staffProId) : null) ??
      pros.find((p) => p.id === "pro_ana") ??
      pros[0] ??
      null;

    const estimatedRevenue = monthConfirmed.reduce(
      (sum, a) => sum + (a.service.priceCents ?? 0),
      0,
    );
    const monthlyRevenueCents =
      paymentPaidMonth._sum.amountCents ?? estimatedRevenue;

    const attendanceDenom =
      monthConfirmed.length + monthCancelled + monthNoShow;
    const attendanceRate =
      attendanceDenom === 0
        ? 100
        : Math.round((monthConfirmed.length / attendanceDenom) * 100);

    const monthLabels: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = d
        .toLocaleDateString("pt-BR", { month: "short" })
        .replace(".", "");
      monthLabels.push({ key, label, count: 0 });
    }
    for (const a of history) {
      const key = `${a.startsAt.getFullYear()}-${a.startsAt.getMonth()}`;
      const bucket = monthLabels.find((m) => m.key === key);
      if (bucket) bucket.count += 1;
    }

    function mapPaymentRow(p: (typeof todayPayments)[number]) {
      return {
        id: p.id,
        amountCents: p.amountCents,
        status: p.status,
        method: p.method,
        paidAt: p.paidAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        patient: {
          id: p.patient.id,
          phone: p.patient.phone,
          name: p.patient.name,
        },
        appointment: p.appointment
          ? {
              id: p.appointment.id,
              start: p.appointment.startsAt.toISOString(),
              service: {
                id: p.appointment.service.id,
                name: p.appointment.service.name,
              },
            }
          : null,
      };
    }

    return {
      clinic: { id: clinic.id, name: clinic.name },
      professional: professional
        ? {
            id: professional.id,
            name: professional.name,
            specialty: professional.specialty,
          }
        : null,
      kpis: {
        activePatients,
        todayAppointments: todayItems.length,
        monthlyRevenueCents,
        attendanceRate,
        newPatientsThisMonth: newPatientsCount,
        todayReceivedCents: todayPaidAgg._sum.amountCents ?? 0,
        pendingInvoices: pendingAgg._count._all,
        pendingInvoicesCents: pendingAgg._sum.amountCents ?? 0,
        pendingEvolutions: pendingEvolutionsCount,
      },
      evolution: monthLabels.map(({ label, count }) => ({ label, count })),
      week: weekItems.map(mapAppointment),
      upcoming: upcoming.map(mapAppointment),
      today: todayItems.map(mapAppointment),
      newPatients: newPatients.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        createdAt: p.createdAt.toISOString(),
      })),
      todayPayments: todayPayments.map(mapPaymentRow),
      pendingPayments: pendingPayments.map(mapPaymentRow),
      pendingEvolutions: pendingEvolutions.map((r) => ({
        id: r.id,
        updatedAt: r.updatedAt.toISOString(),
        patient: {
          id: r.patient.id,
          name: r.patient.name,
          phone: r.patient.phone,
        },
        professional: { id: r.professional.id, name: r.professional.name },
        appointment: r.appointment
          ? {
              id: r.appointment.id,
              start: r.appointment.startsAt.toISOString(),
              serviceName: r.appointment.service.name,
            }
          : null,
      })),
      recentAttended: recentAttended.map(mapAppointment),
      weekStart: weekStart.toISOString(),
    };
  });

  app.get("/v1/services", async (request, reply) => {
    const clinicId = await requireClinic(request, reply);
    if (!clinicId) return;
    const services = await listServices(clinicId);
    return { items: services };
  });

  app.get("/v1/professionals", async (request, reply) => {
    const clinicId = await requireClinic(request, reply);
    if (!clinicId) return;
    const q = z.object({ serviceId: z.string().optional() }).parse(request.query);
    const items = await listProfessionals(clinicId, q.serviceId);
    return { items };
  });

  app.get("/v1/availability", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const q = z
        .object({
          serviceId: z.string().min(1),
          professionalId: z.string().optional(),
          from: z.string().datetime().optional(),
          days: z.coerce.number().int().positive().max(30).optional(),
        })
        .parse(request.query);
      const slots = await getAvailability({
        clinicId,
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
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const body = z
        .object({
          phone: z.string().min(8),
          patientName: z.string().optional(),
          serviceId: z.string().min(1),
          professionalId: z.string().min(1),
          start: z.string().datetime(),
          notes: z.string().optional(),
          meetLink: z.string().url().optional().or(z.literal("")),
          weeklyWeeks: z.coerce.number().int().min(0).max(12).optional(),
          source: z.string().optional(),
        })
        .parse(request.body);
      const created = await bookAppointment({
        clinicId,
        ...body,
        meetLink: body.meetLink || undefined,
      });
      return reply.code(201).send(mapAppointment(created));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/appointments/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const item = await getAppointment(clinicId, params.id);
      return mapAppointment(item);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/v1/appointments/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          notes: z.string().nullable().optional(),
          meetLink: z.string().nullable().optional(),
          status: z.nativeEnum(AppointmentStatus).optional(),
        })
        .parse(request.body);
      const updated = await updateAppointmentDetails({
        clinicId,
        appointmentId: params.id,
        ...body,
      });
      return mapAppointment(updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/appointments/:id/move", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          start: z.string().datetime(),
          end: z.string().datetime().optional(),
          professionalId: z.string().optional(),
        })
        .parse(request.body);
      const updated = await moveAppointment({
        clinicId,
        appointmentId: params.id,
        ...body,
      });
      return mapAppointment(updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/appointments", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
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

      if (
        q.phone &&
        !q.from &&
        !q.to &&
        !q.professionalId &&
        !q.status &&
        q.scope !== "clinic"
      ) {
        const items = await listPatientAppointments(clinicId, q.phone);
        return { items: items.map(mapAppointment) };
      }

      const items = await listClinicAppointments({
        clinicId,
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
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ phone: z.string().min(8) }).parse(request.body);
      const cancelled = await cancelAppointment({
        clinicId,
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
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          phone: z.string().min(8),
          start: z.string().datetime(),
          professionalId: z.string().optional(),
        })
        .parse(request.body);
      const updated = await rescheduleAppointment({
        clinicId,
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

  app.get("/v1/calendar-blocks", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const q = z
        .object({
          professionalId: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        })
        .parse(request.query);
      const items = await listCalendarBlocks({
        clinicId,
        professionalId: q.professionalId,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
      });
      return { items };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/calendar-blocks", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const body = z
        .object({
          professionalId: z.string().min(1),
          start: z.string().datetime(),
          end: z.string().datetime(),
          reason: z.string().optional(),
        })
        .parse(request.body);
      const created = await createCalendarBlock({ clinicId, ...body });
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/v1/calendar-blocks/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return deleteCalendarBlock(clinicId, params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/payments", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const q = z
        .object({
          status: z.nativeEnum(PaymentStatus).optional(),
          patientId: z.string().optional(),
          kind: z.nativeEnum(PaymentKind).optional(),
        })
        .parse(request.query);
      const [items, stats] = await Promise.all([
        listPayments({ clinicId, ...q }),
        getPaymentStats(clinicId),
      ]);
      return { stats, items };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/payments", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const body = z
        .object({
          patientId: z.string(),
          amountCents: z.number().int().positive(),
          kind: z.nativeEnum(PaymentKind).optional(),
          method: z.nativeEnum(PaymentMethod).nullable().optional(),
          notes: z.string().nullable().optional(),
          status: z.nativeEnum(PaymentStatus).optional(),
          appointmentId: z.string().nullable().optional(),
        })
        .parse(request.body);
      const created = await createPayment({ clinicId, ...body });
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/payments/:id/pay", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          method: z.nativeEnum(PaymentMethod).optional(),
          notes: z.string().optional(),
        })
        .parse(request.body ?? {});
      return markPaymentPaid({ clinicId, id: params.id, ...body });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/payments/providers", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      return getOnlineProvidersStatus();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/payments/:id/checkout", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          provider: z.nativeEnum(OnlineProvider).optional(),
          method: z.enum(["pix", "card"]).optional(),
        })
        .parse(request.body ?? {});
      const created = await createOnlineCheckout({
        clinicId,
        paymentId: params.id,
        provider: body.provider,
        method: body.method,
      });
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/public/webhooks/:provider", async (request, reply) => {
    try {
      const params = z
        .object({ provider: z.nativeEnum(OnlineProvider) })
        .parse(request.params);
      const query = request.query as Record<string, string | undefined>;
      return handleProviderWebhook({
        provider: params.provider,
        body: request.body,
        rawBody: (request as { rawBody?: string }).rawBody,
        headers: request.headers as Record<string, string | string[] | undefined>,
        query,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/public/payments/:id/checkout", async (request, reply) => {
    try {
      const params = z.object({ id: z.string() }).parse(request.params);
      const data = await getPublicCheckout(params.id);
      const amount = (data.amountCents / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const paid = data.status === "paid";
      const firstName = escapeHtml(
        (data.patient.name ?? "").trim().split(/\s+/)[0] ?? "",
      );
      const serviceLabel = escapeHtml(
        data.appointment?.service.name ?? data.package?.name ?? "Recebimento",
      );
      const providerLabel = escapeHtml(data.provider ?? "sandbox");
      const pixSrc = safeUrl(data.pixQrCode);
      const pixCopy = escapeHtml(data.pixCopyPaste ?? "");
      const simToken = encodeURIComponent(data.simulateToken ?? "");
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${paid ? "Pagamento confirmado" : "Pagamento online"}</title>
<style>
body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f5f7fb;color:#1e293b;display:grid;place-items:center;min-height:100vh;padding:24px}
.card{background:#fff;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 8px 24px rgba(15,23,42,.06)}
h1{font-size:1.2rem;margin:0 0 6px}.muted{color:#64748b;margin:0 0 16px;line-height:1.45}
.amount{font-size:1.6rem;font-weight:700;margin:0 0 16px;color:#0f766e}
.qr{display:block;width:220px;height:220px;margin:0 auto 14px;border-radius:12px;background:#f8fafc}
.copy{word-break:break-all;font-size:12px;background:#f8fafc;padding:10px;border-radius:10px;margin-bottom:14px}
.btn{display:inline-block;border:0;border-radius:10px;padding:12px 16px;font-weight:600;cursor:pointer;text-decoration:none}
.btn.teal{background:#14b8a6;color:#fff}.btn.ghost{background:#eff6ff;color:#1d4ed8;margin-left:8px}
.ok{color:#0f766e;font-weight:700;margin-bottom:8px}
</style></head><body><div class="card">
${
  paid
    ? `<div class="ok">Sessão confirmada</div>
<h1>Pagamento recebido</h1>
<p class="muted">Obrigado${firstName ? `, ${firstName}` : ""}. Sua sessão está confirmada.</p>
<p class="amount">${escapeHtml(amount)}</p>`
    : `<h1>Pagamento online · PIX</h1>
<p class="muted">${serviceLabel} · ${providerLabel}</p>
<p class="amount">${escapeHtml(amount)}</p>
${pixSrc ? `<img class="qr" src="${pixSrc}" alt="QR Code PIX"/>` : ""}
${pixCopy ? `<div class="copy">${pixCopy}</div>` : ""}
${
  data.simulateToken
    ? `<p><a class="btn teal" href="/v1/public/payments/${escapeHtml(data.id)}/simulate?token=${simToken}">Simular pagamento (sandbox)</a></p>
<p class="muted" style="margin-top:12px;font-size:12px">Em produção, o provedor confirma via webhook e a sessão é confirmada automaticamente.</p>`
    : `<p class="muted">Aguardando confirmação do provedor…</p>`
}
`
}
</div></body></html>`;
      return reply.type("text/html").send(html);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/public/payments/:id/simulate", async (request, reply) => {
    try {
      const params = z.object({ id: z.string() }).parse(request.params);
      const q = z.object({ token: z.string().min(8) }).parse(request.query);
      await simulateSandboxPay({
        paymentId: params.id,
        token: q.token,
      });
      return reply.redirect(
        `/v1/public/payments/${params.id}/checkout?paid=1`,
      );
    } catch (err) {
      const message = escapeHtml(err instanceof Error ? err.message : "Falha");
      return reply
        .code(400)
        .type("text/html")
        .send(
          `<html><body style="font-family:sans-serif;padding:2rem"><h1>Não foi possível pagar</h1><p>${message}</p></body></html>`,
        );
    }
  });

  app.get("/v1/public/payments/:id/success", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    return reply.redirect(`/v1/public/payments/${params.id}/checkout`);
  });

  app.get("/v1/finance/overview", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const now = new Date();
      const q = z
        .object({
          period: z.enum(["month", "year"]).default("month"),
          year: z.coerce.number().int().optional(),
          month: z.coerce.number().int().min(1).max(12).optional(),
        })
        .parse(request.query);
      const nowParts = partsInTimeZone(now, env().TIMEZONE);
      return getFinanceOverview({
        clinicId,
        period: q.period,
        year: q.year ?? nowParts.year,
        month: q.month ?? nowParts.month,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/expenses", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const items = await listExpenses(clinicId);
      return { items };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/expenses", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const body = z
        .object({
          title: z.string().min(1),
          amountCents: z.number().int().positive(),
          category: z.nativeEnum(ExpenseCategory).optional(),
          method: z.nativeEnum(PaymentMethod).nullable().optional(),
          notes: z.string().nullable().optional(),
          occurredAt: z.string().optional(),
        })
        .parse(request.body);
      const created = await createExpense({ clinicId, ...body });
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/v1/expenses/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return deleteExpense(clinicId, params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/packages", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const q = z
        .object({ patientId: z.string().optional() })
        .parse(request.query);
      const items = await listPackages(clinicId, q.patientId);
      return { items };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/packages", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const body = z
        .object({
          patientId: z.string(),
          name: z.string().min(1),
          totalSessions: z.number().int().positive(),
          amountCents: z.number().int().positive(),
          method: z.nativeEnum(PaymentMethod).nullable().optional(),
          notes: z.string().nullable().optional(),
          markPaid: z.boolean().optional(),
        })
        .parse(request.body);
      const created = await createPackage({ clinicId, ...body });
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/packages/:id/use", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return usePackageSession(clinicId, params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/reminders", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const q = z
        .object({
          status: z.nativeEnum(ReminderStatus).optional(),
        })
        .parse(request.query);
      const items = await listReminders({
        clinicId,
        status: q.status,
      });
      return {
        items,
        channels: {
          whatsapp: env().REMINDER_WHATSAPP_ENABLED,
          email: env().REMINDER_EMAIL_ENABLED,
          emailConfigured: isEmailConfigured(),
        },
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/reminders/due", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const q = z
        .object({ limit: z.coerce.number().int().positive().max(50).optional() })
        .parse(request.query);
      const limit = q.limit ?? 20;
      // Dispara e-mails automaticamente na mesma varredura do bot (não bloqueia a fila WA)
      void dispatchDueEmails(clinicId, limit).catch((err) => {
        request.log.warn({ err }, "falha ao despachar e-mails de lembrete");
      });
      const items = await listDueReminders(clinicId, limit);
      return { items };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/reminders/dispatch", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const body = z
        .object({
          limit: z.number().int().positive().max(50).optional(),
        })
        .parse(request.body ?? {});
      return dispatchDueEmails(clinicId, body.limit ?? 20);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/reminders/:id/sent", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return markReminderSent(clinicId, params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/reminders/:id/failed", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({ error: z.string().min(1) })
        .parse(request.body ?? {});
      return markReminderFailed(clinicId, params.id, body.error);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/reminders/:id/cancel", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return cancelReminder(clinicId, params.id);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/public/actions/confirm", async (request, reply) => {
    try {
      const q = z.object({ token: z.string().min(10) }).parse(request.query);
      const payload = verifyActionToken(q.token);
      if (payload.action !== "confirm") {
        return reply.code(400).send({ error: "Token de ação inválido" });
      }
      const result = await confirmAppointmentByPatient(payload.appointmentId);
      const first = escapeHtml(result.patientName?.split(" ")[0] ?? "");
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sessão confirmada</title>
<style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f5f7fb;color:#1e293b;display:grid;place-items:center;min-height:100vh;padding:24px}
.card{background:#fff;border-radius:16px;padding:28px;max-width:420px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
h1{font-size:1.25rem;margin:0 0 8px}p{margin:0;color:#64748b;line-height:1.5}.ok{color:#0f766e;font-weight:700;margin-bottom:10px}</style></head>
<body><div class="card"><div class="ok">Confirmado</div><h1>Obrigado${first ? `, ${first}` : ""}!</h1>
<p>Sua sessão (${escapeHtml(result.serviceName)}) ${escapeHtml(result.whenLabel)} foi confirmada com a ${escapeHtml(result.clinicName)}.</p></div></body></html>`;
      return reply.type("text/html").send(html);
    } catch (err) {
      const message = escapeHtml(err instanceof Error ? err.message : "Link inválido");
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Link inválido</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;padding:2rem"><h1>Não foi possível confirmar</h1><p>${message}</p></body></html>`;
      return reply.code(400).type("text/html").send(html);
    }
  });

  app.get("/v1/public/actions/reschedule", async (request, reply) => {
    try {
      const q = z.object({ token: z.string().min(10) }).parse(request.query);
      const payload = verifyActionToken(q.token);
      if (payload.action !== "reschedule") {
        return reply.code(400).send({ error: "Token de ação inválido" });
      }
      const result = await getRescheduleContext(payload.appointmentId);
      const first = escapeHtml(result.patientName?.split(" ")[0] ?? "");
      const tokenJson = JSON.stringify(q.token);
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Remarcar sessão</title>
<style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f5f7fb;color:#1e293b;display:grid;place-items:center;min-height:100vh;padding:24px}
.card{background:#fff;border-radius:16px;padding:28px;max-width:480px;width:100%;box-shadow:0 8px 24px rgba(15,23,42,.06)}
h1{font-size:1.25rem;margin:0 0 8px}p{margin:0 0 12px;color:#64748b;line-height:1.5}
.slot{display:block;width:100%;text-align:left;border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:10px 12px;margin:0 0 8px;cursor:pointer;font:inherit}
.slot:hover,.slot.sel{border-color:#14b8a6;background:#f0fdfa}
.btn{display:inline-block;border:0;background:#3b82f6;color:#fff;padding:12px 18px;border-radius:10px;font-weight:600;cursor:pointer;margin-top:8px}
.btn:disabled{opacity:.55;cursor:not-allowed}.err{color:#b91c1c}.ok{color:#0f766e;font-weight:700}
#list{max-height:280px;overflow:auto;margin:12px 0}</style></head>
<body><div class="card" id="root">
<h1>Remarcar sessão</h1>
<p>Olá${first ? ` ${first}` : ""}. Sua sessão atual é ${escapeHtml(result.whenLabel)} (${escapeHtml(result.serviceName)} com ${escapeHtml(result.professionalName)}).</p>
<p id="status" class="muted">Carregando horários…</p>
<div id="list"></div>
<button type="button" class="btn" id="confirm" disabled>Confirmar novo horário</button>
<p style="font-size:13px;margin-top:16px">${escapeHtml(result.whatsappHint)}</p>
</div>
<script>
(function(){
  var token = ${tokenJson};
  var list = document.getElementById("list");
  var status = document.getElementById("status");
  var btn = document.getElementById("confirm");
  var selected = null;
  function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function fmt(iso){
    try { return new Date(iso).toLocaleString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); }
    catch(e){ return iso; }
  }
  fetch("/v1/public/actions/reschedule/slots?token="+encodeURIComponent(token))
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||"Falha"); return j; }); })
    .then(function(data){
      var slots = data.slots||[];
      if(!slots.length){ status.textContent = "Nenhum horário disponível nos próximos dias."; return; }
      status.textContent = "Escolha um horário:";
      slots.forEach(function(s){
        var b = document.createElement("button");
        b.type = "button";
        b.className = "slot";
        b.textContent = fmt(s.start) + (s.professionalName ? " · " + s.professionalName : "");
        b.addEventListener("click", function(){
          selected = s;
          Array.prototype.forEach.call(list.querySelectorAll(".slot"), function(el){ el.classList.remove("sel"); });
          b.classList.add("sel");
          btn.disabled = false;
        });
        list.appendChild(b);
      });
    })
    .catch(function(err){
      status.className = "err";
      status.textContent = err.message || "Não foi possível carregar horários";
    });
  btn.addEventListener("click", function(){
    if(!selected) return;
    btn.disabled = true;
    status.className = "";
    status.textContent = "Remarcando…";
    fetch("/v1/public/actions/reschedule", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ token: token, start: selected.start, professionalId: selected.professionalId })
    })
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||"Falha"); return j; }); })
      .then(function(res){
        document.getElementById("root").innerHTML =
          '<div class="ok">Remarcado</div><h1>Novo horário confirmado</h1><p>Sua sessão ('+
          esc(res.serviceName)+") "+esc(res.whenLabel)+" foi remarcada com a "+esc(res.clinicName||"clínica")+".</p>";
      })
      .catch(function(err){
        status.className = "err";
        status.textContent = err.message || "Não foi possível remarcar";
        btn.disabled = false;
      });
  });
})();
</script></body></html>`;
      return reply.type("text/html").send(html);
    } catch (err) {
      const message = escapeHtml(err instanceof Error ? err.message : "Link inválido");
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Link inválido</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;padding:2rem"><h1>Não foi possível remarcar</h1><p>${message}</p></body></html>`;
      return reply.code(400).type("text/html").send(html);
    }
  });

  app.get("/v1/public/actions/reschedule/slots", async (request, reply) => {
    try {
      const q = z.object({ token: z.string().min(10) }).parse(request.query);
      const payload = verifyActionToken(q.token);
      if (payload.action !== "reschedule") {
        return reply.code(400).send({ error: "Token de ação inválido" });
      }
      return listPublicRescheduleSlots(payload.appointmentId);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/public/actions/reschedule", async (request, reply) => {
    try {
      const body = z
        .object({
          token: z.string().min(10),
          start: z.string().datetime(),
          professionalId: z.string().optional(),
        })
        .parse(request.body);
      const payload = verifyActionToken(body.token);
      if (payload.action !== "reschedule") {
        return reply.code(400).send({ error: "Token de ação inválido" });
      }
      return rescheduleByPatientAction({
        appointmentId: payload.appointmentId,
        start: body.start,
        professionalId: body.professionalId,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/clinical-records", async (request, reply) => {
    try {
      if (!(await requireStaff(request, reply))) return;
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const q = z
        .object({
          patientId: z.string().optional(),
          status: z.nativeEnum(ClinicalRecordStatus).optional(),
          professionalId: z.string().optional(),
        })
        .parse(request.query);
      const professionalId = scopePro ?? q.professionalId;
      const [items, stats] = await Promise.all([
        listClinicalRecords({ clinicId, ...q, professionalId }),
        getClinicalRecordStats(clinicId, professionalId),
      ]);
      return { stats, items };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/clinical-records/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return getClinicalRecord(clinicId, params.id, scopePro, staffActor(request));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/clinical-records/:id/audit", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      // Garante existência + permissão
      await getClinicalRecord(clinicId, params.id, scopePro);
      const items = await listClinicalAuditLogs({
        clinicId,
        recordId: params.id,
        scopedProfessionalId: scopePro,
      });
      return { items };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/clinical-records", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const body = z
        .object({
          patientId: z.string().optional(),
          professionalId: z.string().optional(),
          appointmentId: z.string().optional(),
          sessionNotes: z.string().optional(),
          observations: z.string().optional(),
          draftContent: z.string().optional(),
          evolution: z.string().optional(),
          objectives: z.string().optional(),
          hypotheses: z.string().optional(),
          recurringThemes: z.string().optional(),
          nextInterventions: z.string().optional(),
          importantPoints: z.string().optional(),
          audioNotes: z.string().optional(),
          diagnosisCid: z.string().optional(),
          diagnosisDsm: z.string().optional(),
          recordingConsent: z.boolean().optional(),
        })
        .parse(request.body);
      const created = await createClinicalRecord({
        clinicId,
        patientId: body.patientId,
        professionalId: body.professionalId,
        appointmentId: body.appointmentId,
        scopedProfessionalId: scopePro,
        actor: staffActor(request),
        sessionNotes: body.observations ?? body.sessionNotes,
        draftContent: body.evolution ?? body.draftContent,
        objectives: body.objectives,
        hypotheses: body.hypotheses,
        recurringThemes: body.recurringThemes,
        nextInterventions: body.nextInterventions,
        importantPoints: body.importantPoints,
        audioNotes: body.audioNotes,
        diagnosisCid: body.diagnosisCid,
        diagnosisDsm: body.diagnosisDsm,
        recordingConsent: body.recordingConsent,
      });
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/v1/clinical-records/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z
        .object({
          sessionNotes: z.string().nullable().optional(),
          observations: z.string().nullable().optional(),
          draftContent: z.string().optional(),
          evolution: z.string().optional(),
          objectives: z.string().nullable().optional(),
          hypotheses: z.string().nullable().optional(),
          recurringThemes: z.string().nullable().optional(),
          nextInterventions: z.string().nullable().optional(),
          importantPoints: z.string().nullable().optional(),
          audioNotes: z.string().nullable().optional(),
          diagnosisCid: z.string().nullable().optional(),
          diagnosisDsm: z.string().nullable().optional(),
          recordingConsent: z.boolean().optional(),
          professionalId: z.string().optional(),
        })
        .parse(request.body);
      return updateClinicalRecord({
        clinicId,
        id: params.id,
        professionalId: body.professionalId,
        scopedProfessionalId: scopePro,
        actor: staffActor(request),
        sessionNotes:
          body.observations !== undefined
            ? body.observations
            : body.sessionNotes,
        draftContent:
          body.evolution !== undefined ? body.evolution : body.draftContent,
        objectives: body.objectives,
        hypotheses: body.hypotheses,
        recurringThemes: body.recurringThemes,
        nextInterventions: body.nextInterventions,
        importantPoints: body.importantPoints,
        audioNotes: body.audioNotes,
        diagnosisCid: body.diagnosisCid,
        diagnosisDsm: body.diagnosisDsm,
        recordingConsent: body.recordingConsent,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/clinical-records/:id/generate-evolution", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      await getClinicalRecord(clinicId, params.id, scopePro);
      const body = z
        .object({
          notes: z.string().optional(),
          audioNotes: z.string().optional(),
          recordingConsent: z.boolean().optional(),
          apply: z.boolean().optional(),
        })
        .parse(request.body ?? {});
      return generateEvolutionDraft({
        clinicId,
        recordId: params.id,
        notes: body.notes,
        audioNotes: body.audioNotes,
        recordingConsent: body.recordingConsent,
        apply: body.apply,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/clinical-records/:id/confirm", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return confirmClinicalRecord(
        clinicId,
        params.id,
        scopePro,
        staffActor(request),
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/v1/clinical-records/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return softDeleteClinicalRecord(
        clinicId,
        params.id,
        scopePro,
        staffActor(request),
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/clinical-records/:id/files", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);

      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "Arquivo obrigatório" });

      const fields = file.fields as Record<
        string,
        { value?: string } | undefined
      >;
      const kind = z
        .nativeEnum(ClinicalFileKind)
        .parse(fields.kind?.value ?? "pdf");
      const title = fields.title?.value ?? file.filename;
      const buffer = await file.toBuffer();
      if (buffer.length > 15 * 1024 * 1024) {
        return reply.code(413).send({ error: "Arquivo maior que 15MB" });
      }

      assertClinicalUploadMime({ kind, mimeType: file.mimetype });

      const saved = await saveClinicalRecordFile({
        clinicId,
        recordId: params.id,
        kind,
        title,
        fileName: file.filename,
        mimeType: file.mimetype,
        buffer,
        scopedProfessionalId: scopePro,
        actor: staffActor(request),
      });
      return reply.code(201).send(saved);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get(
    "/v1/clinical-records/:id/files/:fileId/download",
    async (request, reply) => {
      try {
        const clinicId = await requireClinic(request, reply);
        if (!clinicId) return;
        const scopePro = await resolveClinicalProfessionalScope(request, reply);
        if (scopePro === null) return;
        const params = z
          .object({ id: z.string(), fileId: z.string() })
          .parse(request.params);
        const file = await getClinicalRecordFile(
          clinicId,
          params.id,
          params.fileId,
          scopePro,
        );
        const absolute = path.resolve(process.cwd(), file.storagePath);
        reply.header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(file.fileName)}"`,
        );
        reply.type(file.mimeType);
        return reply.send(createReadStream(absolute));
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.delete(
    "/v1/clinical-records/:id/files/:fileId",
    async (request, reply) => {
      try {
        const clinicId = await requireClinic(request, reply);
        if (!clinicId) return;
        const scopePro = await resolveClinicalProfessionalScope(request, reply);
        if (scopePro === null) return;
        const params = z
          .object({ id: z.string(), fileId: z.string() })
          .parse(request.params);
        return deleteClinicalRecordFile(
          clinicId,
          params.id,
          params.fileId,
          scopePro,
          staffActor(request),
        );
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );
}
