const TZ = "America/Sao_Paulo";

export function startOfDayIso(d = new Date()): string {
  const p = parts(d);
  return localToUtcIso(p.year, p.month, p.day, 0, 0);
}

export function endOfDayIso(d = new Date()): string {
  const p = parts(d);
  return localToUtcIso(p.year, p.month, p.day, 23, 59);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDayLabel(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(d);
}

export function formatShortDay(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function dayKey(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function toDateInputValue(d: Date): string {
  const p = parts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function parts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
  };
}

function localToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const asTz = parts(utcGuess);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  const actual = Date.UTC(asTz.year, asTz.month - 1, asTz.day, asTz.hour, asTz.minute);
  return new Date(utcGuess.getTime() + (desired - actual)).toISOString();
}

export function formatPrice(cents: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  });
}

export function formatWeekRange(start: Date, end: Date): string {
  const a = start.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  });
  const b = end.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${a} - ${b}`;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const p = parts(x);
  const probe = new Date(p.year, p.month - 1, p.day, 12);
  const day = probe.getDay();
  const mondayOffset = (day + 6) % 7;
  probe.setDate(probe.getDate() - mondayOffset);
  return probe;
}

export function zonedParts(date: Date) {
  return parts(date);
}
