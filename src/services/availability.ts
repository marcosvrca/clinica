import { prisma } from "../infra/prisma.js";
import { env } from "../config/env.js";
import {
  addDays,
  partsInTimeZone,
  zonedLocalToUtc,
} from "../lib/time.js";

export type Slot = {
  id: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  start: string;
  end: string;
};

export async function listServices(clinicId: string) {
  return prisma.service.findMany({
    where: { clinicId, active: true },
    orderBy: { name: "asc" },
  });
}

export async function listProfessionals(clinicId: string, serviceId?: string) {
  return prisma.professional.findMany({
    where: {
      clinicId,
      active: true,
      ...(serviceId
        ? { services: { some: { serviceId } } }
        : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function getAvailability(input: {
  clinicId: string;
  serviceId: string;
  professionalId?: string;
  from: Date;
  days?: number;
}): Promise<Slot[]> {
  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, clinicId: input.clinicId, active: true },
  });
  if (!service) {
    throw Object.assign(new Error("Serviço não encontrado"), { statusCode: 404 });
  }

  const professionals = await prisma.professional.findMany({
    where: {
      clinicId: input.clinicId,
      active: true,
      services: { some: { serviceId: service.id } },
      ...(input.professionalId ? { id: input.professionalId } : {}),
    },
    include: { weeklyHours: true },
  });

  if (professionals.length === 0) {
    return [];
  }

  const days = input.days ?? 14;
  const tz = env().TIMEZONE;
  const duration = service.durationMinutes;
  const now = new Date();
  const fromParts = partsInTimeZone(input.from > now ? input.from : now, tz);
  const rangeStart = zonedLocalToUtc(
    { year: fromParts.year, month: fromParts.month, day: fromParts.day, hour: 0, minute: 0 },
    tz,
  );
  const endDay = addDays(fromParts, days);
  const rangeEnd = zonedLocalToUtc(
    { year: endDay.year, month: endDay.month, day: endDay.day, hour: 23, minute: 59 },
    tz,
  );

  const busy = await prisma.appointment.findMany({
    where: {
      clinicId: input.clinicId,
      status: { in: ["confirmed", "pending"] },
      professionalId: { in: professionals.map((p) => p.id) },
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
    },
  });

  const slots: Slot[] = [];

  for (let d = 0; d < days; d += 1) {
    const day = addDays(fromParts, d);
    const probe = zonedLocalToUtc(
      { year: day.year, month: day.month, day: day.day, hour: 12, minute: 0 },
      tz,
    );
    const weekday = partsInTimeZone(probe, tz).weekday;

    for (const pro of professionals) {
      const windows = pro.weeklyHours.filter((h) => h.weekday === weekday);
      for (const win of windows) {
        for (let minute = win.startMinute; minute + duration <= win.endMinute; minute += duration) {
          const hour = Math.floor(minute / 60);
          const min = minute % 60;
          const start = zonedLocalToUtc(
            { year: day.year, month: day.month, day: day.day, hour, minute: min },
            tz,
          );
          const end = new Date(start.getTime() + duration * 60_000);
          if (start <= now) continue;

          const conflict = busy.some(
            (a) =>
              a.professionalId === pro.id &&
              a.startsAt < end &&
              a.endsAt > start,
          );
          if (conflict) continue;

          slots.push({
            id: `${pro.id}_${start.toISOString()}`,
            professionalId: pro.id,
            professionalName: pro.name,
            serviceId: service.id,
            serviceName: service.name,
            start: start.toISOString(),
            end: end.toISOString(),
          });
        }
      }
    }
  }

  return slots.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 60);
}
