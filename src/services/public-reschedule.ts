import { prisma } from "../infra/prisma.js";
import { getAvailability } from "./availability.js";
import {
  AppointmentError,
  rescheduleAppointment,
} from "./appointments.js";
import {
  ReminderError,
  formatSessionWhen,
  getRescheduleContext,
} from "./reminders.js";

export async function listPublicRescheduleSlots(appointmentId: string) {
  const ctx = await getRescheduleContext(appointmentId);
  const slots = await getAvailability({
    clinicId: ctx.clinicId,
    serviceId: ctx.serviceId,
    professionalId: ctx.professionalId,
    from: new Date(),
    days: 14,
  });
  return {
    appointmentId: ctx.appointmentId,
    whenLabel: ctx.whenLabel,
    serviceName: ctx.serviceName,
    professionalName: ctx.professionalName,
    slots: slots.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      professionalId: s.professionalId,
      professionalName: s.professionalName,
    })),
  };
}

export async function rescheduleByPatientAction(input: {
  appointmentId: string;
  start: string;
  professionalId?: string;
}) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: input.appointmentId,
      status: { in: ["confirmed", "pending"] },
    },
    include: { patient: true, service: true, clinic: true },
  });
  if (!appointment) {
    throw new ReminderError("Agendamento não encontrado ou cancelado", 404);
  }
  try {
    const updated = await rescheduleAppointment({
      clinicId: appointment.clinicId,
      appointmentId: appointment.id,
      phone: appointment.patient.phone,
      start: input.start,
      professionalId: input.professionalId,
    });
    return {
      ok: true as const,
      appointmentId: updated.id,
      patientName: appointment.patient.name,
      clinicName: appointment.clinic.name,
      whenLabel: formatSessionWhen(updated.startsAt),
      serviceName: appointment.service.name,
    };
  } catch (err) {
    if (err instanceof AppointmentError) {
      throw new ReminderError(err.message, err.statusCode);
    }
    const message =
      err instanceof Error ? err.message : "Não foi possível remarcar";
    throw new ReminderError(message, 400);
  }
}
