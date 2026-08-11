import { ReminderKind, ReminderStatus } from "@prisma/client";
import { prisma } from "../infra/prisma.js";
import { env } from "../config/env.js";
import { addDays, formatDateTime, partsInTimeZone, zonedLocalToUtc } from "../lib/time.js";
import { actionUrl } from "../lib/action-tokens.js";
import { isEmailConfigured, sendReminderEmail } from "../lib/mailer.js";

export class ReminderError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const reminderInclude = {
  patient: true,
  appointment: {
    include: {
      professional: true,
      service: true,
      payment: true,
    },
  },
  clinic: true,
} as const;

/** Ex.: "amanhã às 15h" ou "15/01 às 15h". */
export function formatSessionWhen(startsAt: Date, timeZone = env().TIMEZONE) {
  const now = partsInTimeZone(new Date(), timeZone);
  const target = partsInTimeZone(startsAt, timeZone);
  const time = `${String(target.hour).padStart(2, "0")}h${
    target.minute === 0 ? "" : String(target.minute).padStart(2, "0")
  }`;

  const todayKey = `${now.year}-${now.month}-${now.day}`;
  const targetKey = `${target.year}-${target.month}-${target.day}`;
  const tomorrow = new Date(Date.UTC(now.year, now.month - 1, now.day + 1));
  const tom = partsInTimeZone(tomorrow, timeZone);
  const tomorrowKey = `${tom.year}-${tom.month}-${tom.day}`;

  if (targetKey === todayKey) return `hoje às ${time}`;
  if (targetKey === tomorrowKey) return `amanhã às ${time}`;
  return `${String(target.day).padStart(2, "0")}/${String(target.month).padStart(2, "0")} às ${time}`;
}

function firstName(name: string | null) {
  const n = name?.trim();
  if (!n) return null;
  return n.split(/\s+/)[0] ?? n;
}

function buildConfirmationMessage(input: {
  patientName: string | null;
  startsAt: Date;
}) {
  const who = firstName(input.patientName) ?? "olá";
  const when = formatSessionWhen(input.startsAt);
  return `Olá ${who}.\n\nSua sessão será ${when}.\n\nClique para confirmar.\n\n[Confirmar]\n[Remarcar]`;
}

function buildPaymentMessage(input: {
  patientName: string | null;
  startsAt: Date;
  amountCents: number;
}) {
  const who = firstName(input.patientName) ?? "olá";
  const when = formatSessionWhen(input.startsAt);
  const amount = (input.amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return `Olá ${who}.\n\nVocê tem um valor pendente de ${amount}.\nSessão: ${when}.\n\nFale conosco pelo WhatsApp para regularizar.`;
}

function buildDayBeforeMessage(input: {
  patientName: string | null;
  startsAt: Date;
}) {
  const who = firstName(input.patientName) ?? "olá";
  const when = formatSessionWhen(input.startsAt);
  return `Olá ${who}.\n\nLembrete: amanhã você tem sessão ${when}.\n\nQualquer imprevisto, avise a clínica.\n\n[Confirmar]\n[Remarcar]`;
}

/** Lembrete no dia anterior (09:00 no fuso da clínica), distinto da confirmação. */
export async function scheduleDayBeforeReminder(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      professional: true,
      service: true,
      clinic: true,
    },
  });
  if (!appointment) return null;

  const tz = env().TIMEZONE;
  const sessionParts = partsInTimeZone(appointment.startsAt, tz);
  const dayBefore = addDays(
    {
      year: sessionParts.year,
      month: sessionParts.month,
      day: sessionParts.day,
    },
    -1,
  );
  const scheduledAt = zonedLocalToUtc(
    {
      year: dayBefore.year,
      month: dayBefore.month,
      day: dayBefore.day,
      hour: 9,
      minute: 0,
    },
    tz,
  );

  if (scheduledAt <= new Date()) return null;

  // Evita duplicar se a confirmação cair na mesma manhã (±2h)
  const confirmationAt = new Date(
    appointment.startsAt.getTime() - env().REMINDER_HOURS_BEFORE * 3_600_000,
  );
  if (Math.abs(scheduledAt.getTime() - confirmationAt.getTime()) < 2 * 3_600_000) {
    return null;
  }

  const existing = await prisma.reminder.findFirst({
    where: {
      appointmentId,
      kind: ReminderKind.day_before,
      status: ReminderStatus.pending,
    },
  });
  if (existing) {
    return prisma.reminder.update({
      where: { id: existing.id },
      data: {
        scheduledAt,
        message: buildDayBeforeMessage({
          patientName: appointment.patient.name,
          startsAt: appointment.startsAt,
        }),
      },
    });
  }

  return prisma.reminder.create({
    data: {
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      kind: ReminderKind.day_before,
      status: ReminderStatus.pending,
      scheduledAt,
      message: buildDayBeforeMessage({
        patientName: appointment.patient.name,
        startsAt: appointment.startsAt,
      }),
    },
  });
}


function mapReminder(r: {
  id: string;
  kind: ReminderKind;
  status: ReminderStatus;
  message: string;
  scheduledAt: Date;
  sentAt: Date | null;
  emailSentAt: Date | null;
  whatsappSentAt: Date | null;
  error: string | null;
  patient: {
    id: string;
    phone: string;
    name: string | null;
    email: string | null;
  };
  appointment: {
    id: string;
    startsAt: Date;
    patientConfirmedAt: Date | null;
    professional: { name: string };
    service: { name: string };
    payment: { amountCents: number; status: string } | null;
  };
  clinic: { name: string };
}) {
  const confirmUrl = actionUrl(r.appointment.id, "confirm");
  const rescheduleUrl = actionUrl(r.appointment.id, "reschedule");
  const whenLabel = formatSessionWhen(r.appointment.startsAt);

  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    message: r.message,
    scheduledAt: r.scheduledAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    emailSentAt: r.emailSentAt?.toISOString() ?? null,
    whatsappSentAt: r.whatsappSentAt?.toISOString() ?? null,
    error: r.error,
    channels: {
      whatsapp: env().REMINDER_WHATSAPP_ENABLED,
      email: env().REMINDER_EMAIL_ENABLED && Boolean(r.patient.email),
    },
    buttons:
      r.kind === ReminderKind.payment
        ? []
        : [
            { id: "confirm", label: "Confirmar", url: confirmUrl },
            { id: "reschedule", label: "Remarcar", url: rescheduleUrl },
          ],
    confirmUrl: r.kind === ReminderKind.payment ? null : confirmUrl,
    rescheduleUrl: r.kind === ReminderKind.payment ? null : rescheduleUrl,
    whenLabel,
    patient: {
      id: r.patient.id,
      phone: r.patient.phone,
      name: r.patient.name,
      email: r.patient.email,
    },
    appointment: {
      id: r.appointment.id,
      start: r.appointment.startsAt.toISOString(),
      startLabel: formatDateTime(r.appointment.startsAt),
      patientConfirmedAt:
        r.appointment.patientConfirmedAt?.toISOString() ?? null,
      professionalName: r.appointment.professional.name,
      serviceName: r.appointment.service.name,
    },
    clinicName: r.clinic.name,
  };
}

/** Agenda lembrete automático ao marcar sessão (sem dados clínicos). */
export async function scheduleConfirmationReminder(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      professional: true,
      service: true,
      clinic: true,
    },
  });
  if (!appointment) return null;

  const hoursBefore = env().REMINDER_HOURS_BEFORE;
  const scheduledAt = new Date(
    appointment.startsAt.getTime() - hoursBefore * 3_600_000,
  );
  if (scheduledAt <= new Date()) {
    return null;
  }

  const existing = await prisma.reminder.findFirst({
    where: {
      appointmentId,
      kind: ReminderKind.confirmation,
      status: ReminderStatus.pending,
    },
  });
  if (existing) {
    return prisma.reminder.update({
      where: { id: existing.id },
      data: {
        scheduledAt,
        message: buildConfirmationMessage({
          patientName: appointment.patient.name,
          startsAt: appointment.startsAt,
        }),
      },
    });
  }

  return prisma.reminder.create({
    data: {
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      kind: ReminderKind.confirmation,
      status: ReminderStatus.pending,
      scheduledAt,
      message: buildConfirmationMessage({
        patientName: appointment.patient.name,
        startsAt: appointment.startsAt,
      }),
    },
  });
}

/** Cobrança automática: lembrete de pagamento pendente ligado à sessão. */
export async function schedulePaymentReminder(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      patient: true,
      appointment: true,
    },
  });
  if (!payment?.appointmentId || !payment.appointment) return null;
  if (payment.status !== "pending") return null;
  if (!payment.patient.active || payment.patient.billingPaused) return null;

  const existing = await prisma.reminder.findFirst({
    where: {
      appointmentId: payment.appointmentId,
      kind: ReminderKind.payment,
      status: ReminderStatus.pending,
    },
  });
  if (existing) return existing;

  // Dispara junto com a janela de confirmação (ou em 1h se sessão próxima)
  const hoursBefore = env().REMINDER_HOURS_BEFORE;
  let scheduledAt = new Date(
    payment.appointment.startsAt.getTime() - hoursBefore * 3_600_000,
  );
  if (scheduledAt <= new Date()) {
    scheduledAt = new Date(Date.now() + 60 * 60_000);
  }

  return prisma.reminder.create({
    data: {
      clinicId: payment.clinicId,
      patientId: payment.patientId,
      appointmentId: payment.appointmentId,
      kind: ReminderKind.payment,
      status: ReminderStatus.pending,
      scheduledAt,
      message: buildPaymentMessage({
        patientName: payment.patient.name,
        startsAt: payment.appointment.startsAt,
        amountCents: payment.amountCents,
      }),
    },
  });
}

export async function cancelRemindersForAppointment(appointmentId: string) {
  await prisma.reminder.updateMany({
    where: {
      appointmentId,
      status: ReminderStatus.pending,
    },
    data: { status: ReminderStatus.cancelled },
  });
}

export async function cancelPaymentRemindersForAppointment(
  appointmentId: string,
) {
  await prisma.reminder.updateMany({
    where: {
      appointmentId,
      kind: ReminderKind.payment,
      status: ReminderStatus.pending,
    },
    data: { status: ReminderStatus.cancelled },
  });
}

export async function listReminders(input: {
  clinicId: string;
  status?: ReminderStatus;
}) {
  const items = await prisma.reminder.findMany({
    where: {
      clinicId: input.clinicId,
      ...(input.status ? { status: input.status } : {}),
    },
    include: reminderInclude,
    orderBy: { scheduledAt: "asc" },
    take: 100,
  });
  return items.map(mapReminder);
}

/** Fila para o bot WhatsApp: claim atômico dos lembretes vencidos. */
export async function listDueReminders(clinicId: string, limit = 20) {
  if (!env().REMINDER_WHATSAPP_ENABLED) return [];

  const now = new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60_000);

  const candidates = await prisma.reminder.findMany({
    where: {
      clinicId,
      status: ReminderStatus.pending,
      scheduledAt: { lte: now },
      whatsappSentAt: null,
      OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
      appointment: {
        status: { in: ["confirmed", "pending"] },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const claimedIds: string[] = [];
  for (const row of candidates) {
    const updated = await prisma.reminder.updateMany({
      where: {
        id: row.id,
        clinicId,
        status: ReminderStatus.pending,
        whatsappSentAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
      },
      data: { claimedAt: now },
    });
    if (updated.count === 1) claimedIds.push(row.id);
  }

  if (claimedIds.length === 0) return [];

  const items = await prisma.reminder.findMany({
    where: { clinicId, id: { in: claimedIds } },
    include: reminderInclude,
    orderBy: { scheduledAt: "asc" },
  });
  return items.map(mapReminder);
}

/**
 * Dispara e-mails (Resend) dos lembretes vencidos.
 * WhatsApp continua na fila /due consumida pelo bot.
 */
export async function dispatchDueEmails(clinicId: string, limit = 20) {
  const items = await prisma.reminder.findMany({
    where: {
      clinicId,
      status: ReminderStatus.pending,
      scheduledAt: { lte: new Date() },
      emailSentAt: null,
      appointment: {
        status: { in: ["confirmed", "pending"] },
      },
    },
    include: reminderInclude,
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  const results: {
    id: string;
    ok: boolean;
    skipped?: boolean;
    error?: string;
  }[] = [];

  for (const r of items) {
    if (!env().REMINDER_EMAIL_ENABLED) {
      results.push({ id: r.id, ok: true, skipped: true });
      continue;
    }
    if (!r.patient.email) {
      results.push({ id: r.id, ok: true, skipped: true });
      continue;
    }
    if (!isEmailConfigured()) {
      results.push({
        id: r.id,
        ok: false,
        error: "RESEND_API_KEY não configurada",
      });
      continue;
    }

    try {
      const amountLabel = r.appointment.payment
        ? (r.appointment.payment.amountCents / 100).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })
        : undefined;

      await sendReminderEmail({
        to: r.patient.email,
        patientName: r.patient.name ?? "",
        clinicName: r.clinic.name,
        whenLabel: formatSessionWhen(r.appointment.startsAt),
        confirmUrl: actionUrl(r.appointment.id, "confirm"),
        rescheduleUrl: actionUrl(r.appointment.id, "reschedule"),
        kind: r.kind === ReminderKind.payment ? "payment" : "confirmation",
        amountLabel,
      });

      const updated = await prisma.reminder.update({
        where: { id: r.id },
        data: {
          emailSentAt: new Date(),
          // Se WhatsApp desabilitado, considera enviado após e-mail
          ...(!env().REMINDER_WHATSAPP_ENABLED
            ? {
                status: ReminderStatus.sent,
                sentAt: new Date(),
              }
            : {}),
        },
      });
      results.push({ id: updated.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "falha no e-mail";
      await prisma.reminder.update({
        where: { id: r.id },
        data: { error: message.slice(0, 500) },
      });
      results.push({ id: r.id, ok: false, error: message });
    }
  }

  return {
    emailed: results.filter((r) => r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    emailConfigured: isEmailConfigured(),
  };
}

export async function markReminderSent(clinicId: string, id: string) {
  const current = await prisma.reminder.findFirst({
    where: { id, clinicId, status: ReminderStatus.pending },
  });
  if (!current) throw new ReminderError("Lembrete não encontrado", 404);
  const updated = await prisma.reminder.update({
    where: { id: current.id },
    data: {
      status: ReminderStatus.sent,
      sentAt: new Date(),
      whatsappSentAt: new Date(),
      claimedAt: null,
      error: null,
    },
    include: reminderInclude,
  });
  return mapReminder(updated);
}

export async function markReminderFailed(
  clinicId: string,
  id: string,
  error: string,
) {
  const current = await prisma.reminder.findFirst({
    where: { id, clinicId, status: ReminderStatus.pending },
  });
  if (!current) throw new ReminderError("Lembrete não encontrado", 404);
  const updated = await prisma.reminder.update({
    where: { id: current.id },
    data: {
      status: ReminderStatus.failed,
      claimedAt: null,
      error: error.slice(0, 500),
    },
    include: reminderInclude,
  });
  return mapReminder(updated);
}

export async function cancelReminder(clinicId: string, id: string) {
  const current = await prisma.reminder.findFirst({
    where: { id, clinicId, status: ReminderStatus.pending },
  });
  if (!current) throw new ReminderError("Lembrete não encontrado", 404);
  const updated = await prisma.reminder.update({
    where: { id: current.id },
    data: { status: ReminderStatus.cancelled },
    include: reminderInclude,
  });
  return mapReminder(updated);
}

export async function confirmAppointmentByPatient(appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      status: { in: ["confirmed", "pending"] },
    },
    include: { clinic: true, patient: true, service: true },
  });
  if (!appointment) {
    throw new ReminderError("Agendamento não encontrado ou cancelado", 404);
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      patientConfirmedAt: new Date(),
      status: "confirmed",
    },
  });

  return {
    ok: true as const,
    appointmentId: updated.id,
    patientName: appointment.patient.name,
    clinicName: appointment.clinic.name,
    whenLabel: formatSessionWhen(appointment.startsAt),
    serviceName: appointment.service.name,
  };
}

export async function getRescheduleContext(appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      status: { in: ["confirmed", "pending"] },
    },
    include: { clinic: true, patient: true, service: true, professional: true },
  });
  if (!appointment) {
    throw new ReminderError("Agendamento não encontrado ou cancelado", 404);
  }
  const publicBase = env().PUBLIC_BASE_URL.replace(/\/$/, "");
  return {
    ok: true as const,
    appointmentId: appointment.id,
    clinicId: appointment.clinicId,
    serviceId: appointment.serviceId,
    professionalId: appointment.professionalId,
    patientPhone: appointment.patient.phone,
    patientName: appointment.patient.name,
    clinicName: appointment.clinic.name,
    whenLabel: formatSessionWhen(appointment.startsAt),
    serviceName: appointment.service.name,
    professionalName: appointment.professional.name,
    /** Página pública com escolha de horário (não o painel autenticado). */
    bookUrl: `${publicBase}/v1/public/actions/reschedule`,
    whatsappHint: "Ou responda REMARCAR no WhatsApp da clínica.",
  };
}
