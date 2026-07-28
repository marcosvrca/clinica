const TZ = "America/Sao_Paulo";

export function formatDateTime(date: Date, timeZone = TZ): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function partsInTimeZone(date: Date, timeZone = TZ) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

export function zonedLocalToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone = TZ,
): Date {
  const utcGuess = new Date(
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute),
  );
  const asTz = partsInTimeZone(utcGuess, timeZone);
  const desiredAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const actualAsUtc = Date.UTC(asTz.year, asTz.month - 1, asTz.day, asTz.hour, asTz.minute);
  return new Date(utcGuess.getTime() + (desiredAsUtc - actualAsUtc));
}

export function addDays(base: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}
