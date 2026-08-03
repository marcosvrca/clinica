import {
  AppointmentStatus,
  ExpenseCategory,
  PackageStatus,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  OnlineProvider,
} from "@prisma/client";
import { prisma } from "../infra/prisma.js";
import { env } from "../config/env.js";
import { partsInTimeZone, zonedLocalToUtc } from "../lib/time.js";
import {
  cancelPaymentRemindersForAppointment,
  schedulePaymentReminder,
} from "./reminders.js";

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const paymentInclude = {
  patient: true,
  appointment: { include: { service: true } },
  package: true,
} as const;

const packageInclude = {
  patient: true,
} as const;

function mapPayment(p: {
  id: string;
  amountCents: number;
  status: PaymentStatus;
  kind: PaymentKind;
  method: string | null;
  notes: string | null;
  paidAt: Date | null;
  createdAt: Date;
  packageId: string | null;
  provider?: OnlineProvider | null;
  externalId?: string | null;
  checkoutUrl?: string | null;
  pixQrCode?: string | null;
  pixCopyPaste?: string | null;
  patient: { id: string; phone: string; name: string | null };
  appointment: {
    id: string;
    startsAt: Date;
    status?: AppointmentStatus;
    patientConfirmedAt?: Date | null;
    service: { id: string; name: string };
  } | null;
  package: { id: string; name: string; totalSessions: number } | null;
}) {
  return {
    id: p.id,
    amountCents: p.amountCents,
    status: p.status,
    kind: p.kind,
    method: (p.method as PaymentMethod | null) ?? null,
    notes: p.notes,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    packageId: p.packageId,
    provider: p.provider ?? null,
    externalId: p.externalId ?? null,
    checkoutUrl: p.checkoutUrl ?? null,
    pixQrCode: p.pixQrCode ?? null,
    pixCopyPaste: p.pixCopyPaste ?? null,
    patient: {
      id: p.patient.id,
      phone: p.patient.phone,
      name: p.patient.name,
    },
    appointment: p.appointment
      ? {
          id: p.appointment.id,
          start: p.appointment.startsAt.toISOString(),
          status: p.appointment.status ?? "confirmed",
          patientConfirmedAt:
            p.appointment.patientConfirmedAt?.toISOString() ?? null,
          service: {
            id: p.appointment.service.id,
            name: p.appointment.service.name,
          },
        }
      : null,
    package: p.package
      ? {
          id: p.package.id,
          name: p.package.name,
          totalSessions: p.package.totalSessions,
        }
      : null,
  };
}

function mapExpense(e: {
  id: string;
  title: string;
  category: ExpenseCategory;
  amountCents: number;
  method: PaymentMethod | null;
  notes: string | null;
  occurredAt: Date;
  createdAt: Date;
}) {
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    amountCents: e.amountCents,
    method: e.method,
    notes: e.notes,
    occurredAt: e.occurredAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}

function mapPackage(p: {
  id: string;
  name: string;
  totalSessions: number;
  usedSessions: number;
  amountCents: number;
  status: PackageStatus;
  method: PaymentMethod | null;
  notes: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  patient: { id: string; phone: string; name: string | null };
}) {
  return {
    id: p.id,
    name: p.name,
    totalSessions: p.totalSessions,
    usedSessions: p.usedSessions,
    amountCents: p.amountCents,
    status: p.status,
    method: p.method,
    notes: p.notes,
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    patient: {
      id: p.patient.id,
      phone: p.patient.phone,
      name: p.patient.name,
    },
  };
}

function monthKey(d: Date, timeZone = env().TIMEZONE) {
  const p = partsInTimeZone(d, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function dayKey(d: Date, timeZone = env().TIMEZONE) {
  const p = partsInTimeZone(d, timeZone);
  return `${monthKey(d, timeZone)}-${String(p.day).padStart(2, "0")}`;
}

function parseMethod(value: string | null | undefined): PaymentMethod | null {
  if (!value) return null;
  if (value === "pix" || value === "card" || value === "cash") return value;
  throw new PaymentError("Método inválido. Use pix, card ou cash", 422);
}

export async function listPayments(input: {
  clinicId: string;
  status?: PaymentStatus;
  patientId?: string;
  kind?: PaymentKind;
}) {
  const items = await prisma.payment.findMany({
    where: {
      clinicId: input.clinicId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.patientId ? { patientId: input.patientId } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
    },
    include: paymentInclude,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return items.map(mapPayment);
}

export async function getPaymentStats(clinicId: string) {
  const [pending, paid, pendingSum, paidSum, sessionSum, packageSum] =
    await Promise.all([
      prisma.payment.count({
        where: { clinicId, status: PaymentStatus.pending },
      }),
      prisma.payment.count({ where: { clinicId, status: PaymentStatus.paid } }),
      prisma.payment.aggregate({
        where: { clinicId, status: PaymentStatus.pending },
        _sum: { amountCents: true },
      }),
      prisma.payment.aggregate({
        where: { clinicId, status: PaymentStatus.paid },
        _sum: { amountCents: true },
      }),
      prisma.payment.aggregate({
        where: {
          clinicId,
          status: PaymentStatus.paid,
          kind: PaymentKind.session,
        },
        _sum: { amountCents: true },
      }),
      prisma.payment.aggregate({
        where: {
          clinicId,
          status: PaymentStatus.paid,
          kind: PaymentKind.package,
        },
        _sum: { amountCents: true },
      }),
    ]);
  return {
    pending,
    paid,
    pendingCents: pendingSum._sum.amountCents ?? 0,
    paidCents: paidSum._sum.amountCents ?? 0,
    sessionCents: sessionSum._sum.amountCents ?? 0,
    packageCents: packageSum._sum.amountCents ?? 0,
  };
}

export async function createPayment(input: {
  clinicId: string;
  patientId: string;
  amountCents: number;
  kind?: PaymentKind;
  method?: string | null;
  notes?: string | null;
  status?: PaymentStatus;
  appointmentId?: string | null;
}) {
  if (input.amountCents <= 0) {
    throw new PaymentError("Valor deve ser positivo", 422);
  }
  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, clinicId: input.clinicId },
  });
  if (!patient) throw new PaymentError("Paciente não encontrado", 404);

  const method = parseMethod(input.method ?? null);
  const status = input.status ?? PaymentStatus.pending;
  if (status === PaymentStatus.paid && !method) {
    throw new PaymentError("Informe o método (PIX, cartão ou dinheiro)", 422);
  }

  const created = await prisma.payment.create({
    data: {
      clinicId: input.clinicId,
      patientId: patient.id,
      appointmentId: input.appointmentId ?? null,
      amountCents: input.amountCents,
      kind: input.kind ?? PaymentKind.session,
      status,
      method,
      notes: input.notes?.trim() || null,
      paidAt: status === PaymentStatus.paid ? new Date() : null,
    },
    include: paymentInclude,
  });
  if (created.status === PaymentStatus.pending && created.appointmentId) {
    await schedulePaymentReminder(created.id);
  }
  return mapPayment(created);
}

export async function markPaymentPaid(input: {
  clinicId: string;
  id: string;
  method?: string;
  notes?: string;
}) {
  const current = await prisma.payment.findFirst({
    where: { id: input.id, clinicId: input.clinicId },
  });
  if (!current) throw new PaymentError("Recebimento não encontrado", 404);
  if (current.status === PaymentStatus.cancelled) {
    throw new PaymentError(
      "Recebimento cancelado não pode ser marcado como pago",
      422,
    );
  }
  if (current.status === PaymentStatus.paid) {
    throw new PaymentError("Recebimento já está pago", 422);
  }

  const method = parseMethod(input.method ?? current.method);
  if (!method) {
    throw new PaymentError("Informe o método: pix, card ou cash", 422);
  }

  const updated = await prisma.payment.update({
    where: { id: current.id },
    data: {
      status: PaymentStatus.paid,
      paidAt: new Date(),
      method,
      notes: input.notes !== undefined ? input.notes : current.notes,
    },
    include: paymentInclude,
  });
  if (updated.appointmentId) {
    await prisma.appointment.update({
      where: { id: updated.appointmentId },
      data: {
        status: AppointmentStatus.confirmed,
        patientConfirmedAt: new Date(),
      },
    });
    await cancelPaymentRemindersForAppointment(updated.appointmentId);
  }
  const fresh = await prisma.payment.findFirst({
    where: { id: updated.id },
    include: paymentInclude,
  });
  return mapPayment(fresh!);
}

export async function listExpenses(clinicId: string) {
  const items = await prisma.expense.findMany({
    where: { clinicId },
    orderBy: { occurredAt: "desc" },
    take: 300,
  });
  return items.map(mapExpense);
}

export async function createExpense(input: {
  clinicId: string;
  title: string;
  amountCents: number;
  category?: ExpenseCategory;
  method?: string | null;
  notes?: string | null;
  occurredAt?: string;
}) {
  if (!input.title.trim()) throw new PaymentError("Título obrigatório", 422);
  if (input.amountCents <= 0) {
    throw new PaymentError("Valor deve ser positivo", 422);
  }
  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt)
    : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new PaymentError("Data inválida", 422);
  }

  const created = await prisma.expense.create({
    data: {
      clinicId: input.clinicId,
      title: input.title.trim(),
      amountCents: input.amountCents,
      category: input.category ?? ExpenseCategory.other,
      method: parseMethod(input.method ?? null),
      notes: input.notes?.trim() || null,
      occurredAt,
    },
  });
  return mapExpense(created);
}

export async function deleteExpense(clinicId: string, id: string) {
  const current = await prisma.expense.findFirst({
    where: { id, clinicId },
  });
  if (!current) throw new PaymentError("Despesa não encontrada", 404);
  await prisma.expense.delete({ where: { id } });
  return { ok: true };
}

export async function listPackages(clinicId: string, patientId?: string) {
  const items = await prisma.sessionPackage.findMany({
    where: {
      clinicId,
      ...(patientId ? { patientId } : {}),
    },
    include: packageInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return items.map(mapPackage);
}

export async function createPackage(input: {
  clinicId: string;
  patientId: string;
  name: string;
  totalSessions: number;
  amountCents: number;
  method?: string | null;
  notes?: string | null;
  markPaid?: boolean;
}) {
  if (!input.name.trim()) throw new PaymentError("Nome do pacote obrigatório", 422);
  if (input.totalSessions < 1) {
    throw new PaymentError("Informe ao menos 1 sessão no pacote", 422);
  }
  if (input.amountCents <= 0) {
    throw new PaymentError("Valor deve ser positivo", 422);
  }

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, clinicId: input.clinicId },
  });
  if (!patient) throw new PaymentError("Paciente não encontrado", 404);

  const method = parseMethod(input.method ?? null);
  const markPaid = input.markPaid ?? Boolean(method);

  const result = await prisma.$transaction(async (tx) => {
    const pkg = await tx.sessionPackage.create({
      data: {
        clinicId: input.clinicId,
        patientId: patient.id,
        name: input.name.trim(),
        totalSessions: input.totalSessions,
        amountCents: input.amountCents,
        method,
        notes: input.notes?.trim() || null,
        paidAt: markPaid ? new Date() : null,
        status: PackageStatus.active,
        startsAt: new Date(),
      },
      include: packageInclude,
    });

    await tx.payment.create({
      data: {
        clinicId: input.clinicId,
        patientId: patient.id,
        packageId: pkg.id,
        kind: PaymentKind.package,
        amountCents: input.amountCents,
        status: markPaid ? PaymentStatus.paid : PaymentStatus.pending,
        method: markPaid ? method : null,
        paidAt: markPaid ? new Date() : null,
        notes: `Pacote: ${pkg.name}`,
      },
    });

    return pkg;
  });

  return mapPackage(result);
}

export async function usePackageSession(clinicId: string, id: string) {
  const current = await prisma.sessionPackage.findFirst({
    where: { id, clinicId },
    include: packageInclude,
  });
  if (!current) throw new PaymentError("Pacote não encontrado", 404);
  if (current.status !== PackageStatus.active) {
    throw new PaymentError("Pacote não está ativo", 422);
  }
  if (current.usedSessions >= current.totalSessions) {
    throw new PaymentError("Pacote já foi utilizado por completo", 422);
  }

  const used = current.usedSessions + 1;
  const updated = await prisma.sessionPackage.update({
    where: { id },
    data: {
      usedSessions: used,
      status:
        used >= current.totalSessions
          ? PackageStatus.completed
          : PackageStatus.active,
      endsAt: used >= current.totalSessions ? new Date() : current.endsAt,
    },
    include: packageInclude,
  });
  return mapPackage(updated);
}

export async function getFinanceOverview(input: {
  clinicId: string;
  period: "month" | "year";
  year: number;
  month?: number;
}) {
  const { clinicId, period, year } = input;
  const month = input.month ?? partsInTimeZone(new Date(), env().TIMEZONE).month;
  const tz = env().TIMEZONE;

  const rangeStart =
    period === "year"
      ? zonedLocalToUtc({ year, month: 1, day: 1, hour: 0, minute: 0 }, tz)
      : zonedLocalToUtc(
          { year, month, day: 1, hour: 0, minute: 0 },
          tz,
        );
  const rangeEnd =
    period === "year"
      ? zonedLocalToUtc({ year: year + 1, month: 1, day: 1, hour: 0, minute: 0 }, tz)
      : month === 12
        ? zonedLocalToUtc({ year: year + 1, month: 1, day: 1, hour: 0, minute: 0 }, tz)
        : zonedLocalToUtc(
            { year, month: month + 1, day: 1, hour: 0, minute: 0 },
            tz,
          );

  const [payments, expenses, pendingSum, stats] = await Promise.all([
    prisma.payment.findMany({
      where: {
        clinicId,
        status: PaymentStatus.paid,
        OR: [
          { paidAt: { gte: rangeStart, lt: rangeEnd } },
          {
            paidAt: null,
            createdAt: { gte: rangeStart, lt: rangeEnd },
          },
        ],
      },
      include: paymentInclude,
    }),
    prisma.expense.findMany({
      where: {
        clinicId,
        occurredAt: { gte: rangeStart, lt: rangeEnd },
      },
    }),
    prisma.payment.aggregate({
      where: { clinicId, status: PaymentStatus.pending },
      _sum: { amountCents: true },
    }),
    getPaymentStats(clinicId),
  ]);

  const revenueCents = payments.reduce((s, p) => s + p.amountCents, 0);
  const expenseCents = expenses.reduce((s, e) => s + e.amountCents, 0);

  const byMethod = { pix: 0, card: 0, cash: 0, other: 0 };
  const byKind = { session: 0, package: 0 };
  for (const p of payments) {
    if (p.method === PaymentMethod.pix) byMethod.pix += p.amountCents;
    else if (p.method === PaymentMethod.card) byMethod.card += p.amountCents;
    else if (p.method === PaymentMethod.cash) byMethod.cash += p.amountCents;
    else byMethod.other += p.amountCents;

    if (p.kind === PaymentKind.package) byKind.package += p.amountCents;
    else byKind.session += p.amountCents;
  }

  const buckets = new Map<
    string,
    { key: string; label: string; revenueCents: number; expenseCents: number }
  >();

  const MONTH_LABELS = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  if (period === "year") {
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`;
      buckets.set(key, {
        key,
        label: MONTH_LABELS[m],
        revenueCents: 0,
        expenseCents: 0,
      });
    }
  } else {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      buckets.set(key, {
        key,
        label: String(d).padStart(2, "0"),
        revenueCents: 0,
        expenseCents: 0,
      });
    }
  }

  for (const p of payments) {
    const at = p.paidAt ?? p.createdAt;
    const key = period === "year" ? monthKey(at, tz) : dayKey(at, tz);
    const bucket = buckets.get(key);
    if (bucket) bucket.revenueCents += p.amountCents;
  }
  for (const e of expenses) {
    const key =
      period === "year" ? monthKey(e.occurredAt, tz) : dayKey(e.occurredAt, tz);
    const bucket = buckets.get(key);
    if (bucket) bucket.expenseCents += e.amountCents;
  }

  const cashFlow = [...buckets.values()].map((b) => ({
    ...b,
    balanceCents: b.revenueCents - b.expenseCents,
  }));

  // For monthly view, trim empty trailing/leading days but keep if all empty
  const activeFlow =
    period === "month"
      ? (() => {
          const withActivity = cashFlow.filter(
            (b) => b.revenueCents > 0 || b.expenseCents > 0,
          );
          return withActivity.length > 0 ? withActivity : cashFlow.slice(0, 7);
        })()
      : cashFlow;

  return {
    period,
    year,
    month: period === "month" ? month : null,
    kpis: {
      revenueCents,
      expenseCents,
      balanceCents: revenueCents - expenseCents,
      pendingCents: pendingSum._sum.amountCents ?? 0,
      sessionCents: byKind.session,
      packageCents: byKind.package,
    },
    byMethod,
    byKind,
    cashFlow: activeFlow,
    stats,
    recentPayments: payments
      .sort(
        (a, b) =>
          (b.paidAt ?? b.createdAt).getTime() -
          (a.paidAt ?? a.createdAt).getTime(),
      )
      .slice(0, 12)
      .map(mapPayment),
    recentExpenses: expenses
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 12)
      .map(mapExpense),
  };
}
