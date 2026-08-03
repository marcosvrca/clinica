import { prisma } from "../infra/prisma.js";

export class CalendarBlockError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

function mapBlock(b: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  professional: { id: string; name: string };
}) {
  return {
    id: b.id,
    start: b.startsAt.toISOString(),
    end: b.endsAt.toISOString(),
    reason: b.reason,
    professional: { id: b.professional.id, name: b.professional.name },
  };
}

export async function listCalendarBlocks(input: {
  clinicId: string;
  professionalId?: string;
  from?: Date;
  to?: Date;
}) {
  const items = await prisma.calendarBlock.findMany({
    where: {
      clinicId: input.clinicId,
      ...(input.professionalId
        ? { professionalId: input.professionalId }
        : {}),
      ...(input.from && input.to
        ? {
            startsAt: { lt: input.to },
            endsAt: { gt: input.from },
          }
        : {}),
    },
    include: { professional: true },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  return items.map(mapBlock);
}

export async function createCalendarBlock(input: {
  clinicId: string;
  professionalId: string;
  start: string;
  end: string;
  reason?: string;
}) {
  const professional = await prisma.professional.findFirst({
    where: {
      id: input.professionalId,
      clinicId: input.clinicId,
      active: true,
    },
  });
  if (!professional) {
    throw new CalendarBlockError("Profissional não encontrado", 404);
  }

  const startsAt = new Date(input.start);
  const endsAt = new Date(input.end);
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt <= startsAt
  ) {
    throw new CalendarBlockError("Intervalo de bloqueio inválido", 422);
  }

  const conflict = await prisma.appointment.findFirst({
    where: {
      professionalId: professional.id,
      status: { in: ["confirmed", "pending"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (conflict) {
    throw new CalendarBlockError(
      "Há agendamento neste horário; cancele ou remarque antes de bloquear",
      409,
    );
  }

  const created = await prisma.calendarBlock.create({
    data: {
      clinicId: input.clinicId,
      professionalId: professional.id,
      startsAt,
      endsAt,
      reason: input.reason?.trim() || null,
    },
    include: { professional: true },
  });
  return mapBlock(created);
}

export async function deleteCalendarBlock(clinicId: string, id: string) {
  const block = await prisma.calendarBlock.findFirst({
    where: { id, clinicId },
  });
  if (!block) throw new CalendarBlockError("Bloqueio não encontrado", 404);
  await prisma.calendarBlock.delete({ where: { id: block.id } });
  return { ok: true };
}
