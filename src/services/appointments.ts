import { prisma } from "../infra/prisma.js";
import { env } from "../config/env.js";
import { normalizePhone } from "../lib/time.js";

export class AppointmentError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

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

export async function bookAppointment(input: {
  clinicId: string;
  phone: string;
  patientName?: string;
  serviceId: string;
  professionalId: string;
  start: string;
  notes?: string;
  source?: string;
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
  if (!professional) throw new AppointmentError("Profissional indisponível para este serviço", 404);

  const startsAt = new Date(input.start);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    throw new AppointmentError("Horário inválido ou no passado", 422);
  }
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  const conflict = await prisma.appointment.findFirst({
    where: {
      professionalId: professional.id,
      status: { in: ["confirmed", "pending"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (conflict) throw new AppointmentError("Horário já ocupado", 409);

  const patient = await ensurePatient({
    clinicId: input.clinicId,
    phone: input.phone,
    name: input.patientName,
  });

  return prisma.appointment.create({
    data: {
      clinicId: input.clinicId,
      patientId: patient.id,
      professionalId: professional.id,
      serviceId: service.id,
      startsAt,
      endsAt,
      status: "confirmed",
      source: input.source ?? "whatsapp",
      notes: input.notes ?? null,
    },
    include: {
      professional: true,
      service: true,
      patient: true,
    },
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
      status: "confirmed",
      startsAt: { gte: new Date(Date.now() - 12 * 60 * 60_000) },
    },
    include: { professional: true, service: true, patient: true },
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

  return prisma.appointment.findMany({
    where: {
      clinicId: input.clinicId,
      ...(input.professionalId ? { professionalId: input.professionalId } : {}),
      ...(input.status ? { status: input.status } : {}),
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
    include: { professional: true, service: true, patient: true },
    orderBy: { startsAt: "asc" },
    take: 200,
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
      status: "confirmed",
      patient: { phone: normalizePhone(input.phone) },
    },
    include: { professional: true, service: true, patient: true },
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

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "cancelled", cancelledAt: new Date() },
    include: { professional: true, service: true, patient: true },
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
      status: "confirmed",
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

  const service = await prisma.service.findUniqueOrThrow({ where: { id: current.serviceId } });
  const professionalId = input.professionalId ?? current.professionalId;
  const startsAt = new Date(input.start);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    throw new AppointmentError("Novo horário inválido", 422);
  }
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  const conflict = await prisma.appointment.findFirst({
    where: {
      professionalId,
      status: { in: ["confirmed", "pending"] },
      id: { not: current.id },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (conflict) throw new AppointmentError("Novo horário já ocupado", 409);

  return prisma.appointment.update({
    where: { id: current.id },
    data: { professionalId, startsAt, endsAt },
    include: { professional: true, service: true, patient: true },
  });
}
