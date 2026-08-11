import { randomUUID } from "node:crypto";
import { AppointmentStatus, type Prisma } from "@prisma/client";
import { prisma } from "../infra/prisma.js";
import { env } from "../config/env.js";
import { normalizePhone } from "../lib/time.js";
import {
  cancelRemindersForAppointment,
  scheduleConfirmationReminder,
  scheduleDayBeforeReminder,
  schedulePaymentReminder,
} from "./reminders.js";

export class AppointmentError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const appointmentInclude = {
  professional: true,
  service: true,
  patient: true,
} as const;

export async function ensurePatient(input: {
  clinicId: string;
  phone: string;
  name?: string;
}) {
  const phone = normalizePhone(input.phone);
  return prisma.patient.upsert({
    where: { clinicId_phone: { clinicId: input.clinicId, phone } },
    create: {
      clinicId: input.clinicId,
      phone,
      name: input.name?.trim() || null,
    },
    update: {
      name: input.name?.trim() || undefined,
    },
  });
}

async function assertSlotFree(
  input: {
    professionalId: string;
    startsAt: Date;
    endsAt: Date;
    excludeAppointmentId?: string;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const conflict = await db.appointment.findFirst({
    where: {
      professionalId: input.professionalId,
      status: { in: [AppointmentStatus.confirmed, AppointmentStatus.pending] },
      ...(input.excludeAppointmentId
        ? { id: { not: input.excludeAppointmentId } }
        : {}),
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
  });
  if (conflict) throw new AppointmentError("Horário já ocupado", 409);

  const block = await db.calendarBlock.findFirst({
    where: {
      professionalId: input.professionalId,
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
  });
  if (block) throw new AppointmentError("Horário bloqueado na agenda", 409);
}

export async function bookAppointment(input: {
  clinicId: string;
  phone: string;
  patientName?: string;
  serviceId: string;
  professionalId: string;
  start: string;
  notes?: string;
  meetLink?: string;
  source?: string;
  /** Repetir semanalmente por N semanas adicionais (0–12). */
  weeklyWeeks?: number;
}) {
  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, clinicId: input.clinicId, active: true },
  });
  if (!service) throw new AppointmentError("Serviço não encontrado", 404);

  const professional = await prisma.professional.findFirst({
    where: {
      id: input.professionalId,
      clinicId: input.clinicId,
      active: true,
      services: { some: { serviceId: service.id } },
    },
  });
  if (!professional) {
    throw new AppointmentError("Profissional indisponível para este serviço", 404);
  }

  const firstStart = new Date(input.start);
  if (Number.isNaN(firstStart.getTime()) || firstStart <= new Date()) {
    throw new AppointmentError("Horário inválido ou no passado", 422);
  }

  const weeklyWeeks = Math.min(12, Math.max(0, input.weeklyWeeks ?? 0));
  const patient = await ensurePatient({
    clinicId: input.clinicId,
    phone: input.phone,
    name: input.patientName,
  });
  if (!patient.active) {
    throw new AppointmentError(
      "Paciente inativo. Reative o cadastro antes de agendar.",
      422,
    );
  }

  const recurrenceGroupId = weeklyWeeks > 0 ? randomUUID() : null;
  const createdIds: string[] = [];
  const createdPaymentIds: string[] = [];

  const first = await prisma.$transaction(async (tx) => {
    let firstCreated: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    notes: string | null;
    meetLink: string | null;
    recurrenceRule: string | null;
    recurrenceGroupId: string | null;
    professional: {
      id: string;
      name: string;
      color: string;
    };
    service: { id: string; name: string; durationMinutes: number };
    patient: { id: string; phone: string; name: string | null };
  } | null = null;

    for (let week = 0; week <= weeklyWeeks; week += 1) {
      const startsAt = new Date(firstStart.getTime() + week * 7 * 24 * 60 * 60_000);
      const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

      await assertSlotFree(
        { professionalId: professional.id, startsAt, endsAt },
        tx,
      );

      const created = await tx.appointment.create({
        data: {
          clinicId: input.clinicId,
          patientId: patient.id,
          professionalId: professional.id,
          serviceId: service.id,
          startsAt,
          endsAt,
          status: AppointmentStatus.confirmed,
          source: input.source ?? "whatsapp",
          notes: input.notes ?? null,
          meetLink: input.meetLink?.trim() || null,
          recurrenceRule: weeklyWeeks > 0 ? "WEEKLY" : null,
          recurrenceGroupId,
        },
        include: appointmentInclude,
      });

      createdIds.push(created.id);
      if (week === 0) firstCreated = created;

      if (
        !patient.billingPaused &&
        service.priceCents != null &&
        service.priceCents > 0
      ) {
        const payment = await tx.payment.create({
          data: {
            clinicId: input.clinicId,
            patientId: patient.id,
            appointmentId: created.id,
            amountCents: service.priceCents,
            status: "pending",
            kind: "session",
          },
        });
        createdPaymentIds.push(payment.id);
      }
    }

    if (!firstCreated) throw new AppointmentError("Falha ao agendar", 500);
    return firstCreated;
  });

  for (const id of createdIds) {
    await scheduleConfirmationReminder(id);
    await scheduleDayBeforeReminder(id);
  }
  for (const paymentId of createdPaymentIds) {
    await schedulePaymentReminder(paymentId);
  }

  return first;
}

export async function getAppointment(clinicId: string, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppointmentError("Agendamento não encontrado", 404);
  return appointment;
}

/** Remarcação pelo painel (drag-and-drop) — sem exigir telefone. */
export async function moveAppointment(input: {
  clinicId: string;
  appointmentId: string;
  start: string;
  end?: string;
  professionalId?: string;
}) {
  const current = await prisma.appointment.findFirst({
    where: {
      id: input.appointmentId,
      clinicId: input.clinicId,
      status: { in: [AppointmentStatus.confirmed, AppointmentStatus.pending] },
    },
  });
  if (!current) throw new AppointmentError("Agendamento não encontrado", 404);

  const service = await prisma.service.findUniqueOrThrow({
    where: { id: current.serviceId },
  });
  const professionalId = input.professionalId ?? current.professionalId;
  const startsAt = new Date(input.start);
  if (Number.isNaN(startsAt.getTime())) {
    throw new AppointmentError("Novo horário inválido", 422);
  }
  const endsAt = input.end
    ? new Date(input.end)
    : new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new AppointmentError("Intervalo inválido", 422);
  }

  await assertSlotFree({
    professionalId,
    startsAt,
    endsAt,
    excludeAppointmentId: current.id,
  });

  return prisma.appointment
    .update({
      where: { id: current.id },
      data: { professionalId, startsAt, endsAt },
      include: appointmentInclude,
    })
    .then(async (updated) => {
      await cancelRemindersForAppointment(updated.id);
      await scheduleConfirmationReminder(updated.id);
      await scheduleDayBeforeReminder(updated.id);
      const pendingPay = await prisma.payment.findFirst({
        where: { appointmentId: updated.id, status: "pending" },
      });
      if (pendingPay) {
        await schedulePaymentReminder(pendingPay.id);
      }
      return updated;
    });
}

export async function updateAppointmentDetails(input: {
  clinicId: string;
  appointmentId: string;
  notes?: string | null;
  meetLink?: string | null;
  status?: AppointmentStatus;
}) {
  const current = await prisma.appointment.findFirst({
    where: { id: input.appointmentId, clinicId: input.clinicId },
  });
  if (!current) throw new AppointmentError("Agendamento não encontrado", 404);

  if (input.status === AppointmentStatus.cancelled) {
    await cancelRemindersForAppointment(current.id);
  }

  return prisma.appointment.update({
    where: { id: current.id },
    data: {
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.meetLink !== undefined
        ? { meetLink: input.meetLink?.trim() || null }
        : {}),
      ...(input.status
        ? {
            status: input.status,
            cancelledAt:
              input.status === AppointmentStatus.cancelled ? new Date() : null,
          }
        : {}),
    },
    include: appointmentInclude,
  });
}

export async function listPatientAppointments(clinicId: string, phone: string) {
  const normalized = normalizePhone(phone);
  const patient = await prisma.patient.findUnique({
    where: { clinicId_phone: { clinicId, phone: normalized } },
  });
  if (!patient) return [];

  return prisma.appointment.findMany({
    where: {
      clinicId,
      patientId: patient.id,
      status: AppointmentStatus.confirmed,
      startsAt: { gte: new Date(Date.now() - 12 * 60 * 60_000) },
    },
    include: appointmentInclude,
    orderBy: { startsAt: "asc" },
    take: 30,
  });
}

export async function listClinicAppointments(input: {
  clinicId: string;
  phone?: string;
  professionalId?: string;
  status?: string;
  from?: Date;
  to?: Date;
}) {
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  const status = input.status
    ? (input.status as AppointmentStatus)
    : undefined;

  return prisma.appointment.findMany({
    where: {
      clinicId: input.clinicId,
      ...(input.professionalId ? { professionalId: input.professionalId } : {}),
      ...(status ? { status } : {}),
      ...(phone ? { patient: { phone } } : {}),
      ...(input.from || input.to
        ? {
            startsAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    },
    include: appointmentInclude,
    orderBy: { startsAt: "asc" },
    take: 500,
  });
}

export async function cancelAppointment(input: {
  clinicId: string;
  appointmentId: string;
  phone: string;
}) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: input.appointmentId,
      clinicId: input.clinicId,
      status: AppointmentStatus.confirmed,
      patient: { phone: normalizePhone(input.phone) },
    },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppointmentError("Agendamento não encontrado", 404);

  const minHours = env().CANCEL_MIN_HOURS;
  const hoursLeft = (appointment.startsAt.getTime() - Date.now()) / 3_600_000;
  if (hoursLeft < minHours) {
    throw new AppointmentError(
      `Cancelamento permitido apenas com ${minHours}h de antecedência`,
      422,
    );
  }

  return prisma
    .$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: AppointmentStatus.cancelled, cancelledAt: new Date() },
        include: appointmentInclude,
      });
      await tx.payment.updateMany({
        where: {
          appointmentId: appointment.id,
          status: "pending",
        },
        data: { status: "cancelled" },
      });
      return updated;
    })
    .then(async (updated) => {
      await cancelRemindersForAppointment(updated.id);
      return updated;
    });
}

export async function rescheduleAppointment(input: {
  clinicId: string;
  appointmentId: string;
  phone: string;
  start: string;
  professionalId?: string;
}) {
  const current = await prisma.appointment.findFirst({
    where: {
      id: input.appointmentId,
      clinicId: input.clinicId,
      status: { in: [AppointmentStatus.confirmed, AppointmentStatus.pending] },
      patient: { phone: normalizePhone(input.phone) },
    },
  });
  if (!current) throw new AppointmentError("Agendamento não encontrado", 404);

  const minHours = env().CANCEL_MIN_HOURS;
  if ((current.startsAt.getTime() - Date.now()) / 3_600_000 < minHours) {
    throw new AppointmentError(
      `Remarcação permitida apenas com ${minHours}h de antecedência`,
      422,
    );
  }

  return moveAppointment({
    clinicId: input.clinicId,
    appointmentId: input.appointmentId,
    start: input.start,
    professionalId: input.professionalId,
  });
}
