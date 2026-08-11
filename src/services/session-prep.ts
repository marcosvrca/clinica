import {
  AppointmentStatus,
  ClinicalRecordStatus,
  PaymentStatus,
  ReminderStatus,
} from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../infra/prisma.js";
import { decryptClinical } from "../lib/clinical-crypto.js";
import { formatDateTime } from "../lib/time.js";

export class SessionPrepError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export type SessionPrepContext = {
  patient: {
    id: string;
    name: string | null;
    phone: string;
  };
  appointment: {
    id: string;
    start: string;
    end: string;
    serviceName: string;
    professionalName: string;
    status: string;
  } | null;
  recentSessions: {
    id: string;
    start: string;
    serviceName: string;
    professionalName: string;
    status: string;
    summary: string | null;
    recordId: string | null;
    recordStatus: "draft" | "confirmed" | null;
  }[];
  recurringThemes: string[];
  objectives: string[];
  latestEvents: string[];
  pending: {
    kind: "draft" | "payment" | "intervention" | "confirmation" | "reminder";
    label: string;
    href: string | null;
  }[];
  briefing: string;
  provider: "openai" | "local";
  reviewNote: string;
};

function splitBullets(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[•\-*–—]\s*/, "").trim())
    .filter((l) => l.length > 2);
}

function uniqueKeepOrder(items: string[], limit = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const key = raw.toLowerCase().slice(0, 48);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw.length > 220 ? `${raw.slice(0, 217)}…` : raw);
    if (out.length >= limit) break;
  }
  return out;
}

function clip(text: string, max = 900) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function localBriefing(input: {
  patientName: string;
  themes: string[];
  objectives: string[];
  events: string[];
  pendingCount: number;
  sessionCount: number;
}): string {
  const name = input.patientName || "o paciente";
  const parts: string[] = [];
  parts.push(
    input.sessionCount
      ? `Antes de atender ${name}: há ${input.sessionCount} sessão(ões) recentes no histórico.`
      : `Antes de atender ${name}: ainda há pouco histórico clínico registrado.`,
  );
  if (input.themes[0]) {
    parts.push(`Temas em evidência: ${input.themes.slice(0, 3).join("; ")}.`);
  }
  if (input.objectives[0]) {
    parts.push(`Objetivos ativos: ${input.objectives.slice(0, 2).join("; ")}.`);
  }
  if (input.events[0]) {
    parts.push(`Últimos acontecimentos: ${input.events.slice(0, 2).join("; ")}.`);
  }
  if (input.pendingCount > 0) {
    parts.push(
      `Há ${input.pendingCount} pendência(s) para checar antes ou após a sessão.`,
    );
  }
  parts.push("Use como apoio de memória — revise o prontuário se necessário.");
  return parts.join(" ");
}

async function openaiBriefing(prompt: string): Promise<string | null> {
  const key = env().OPENAI_API_KEY.trim();
  if (!key) return null;
  const model = env().OPENAI_MODEL.trim() || "gpt-4o-mini";
  const base = env().OPENAI_BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `Você ajuda psicólogos a se prepararem para a próxima sessão.
Escreva em português do Brasil, 3 a 5 frases objetivas, sem inventar fatos.
Não dê diagnóstico definitivo. Não invente risco. Tom calmo e clínico.`,
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text || null;
}

/**
 * Contexto pré-sessão: últimas sessões, temas, objetivos, acontecimentos e pendências.
 * Com `scopedProfessionalId`, só descriptografa/expõe conteúdo clínico daquele profissional.
 */
export async function getSessionPrepContext(input: {
  clinicId: string;
  patientId: string;
  appointmentId?: string;
  /** Quando definido, isola conteúdo clínico a este profissional */
  scopedProfessionalId?: string;
}): Promise<SessionPrepContext> {
  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, clinicId: input.clinicId },
  });
  if (!patient) throw new SessionPrepError("Paciente não encontrado", 404);

  const clinicalScope = input.scopedProfessionalId
    ? { professionalId: input.scopedProfessionalId }
    : {};

  const appointment = input.appointmentId
    ? await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          clinicId: input.clinicId,
          patientId: patient.id,
        },
        include: { service: true, professional: true },
      })
    : await prisma.appointment.findFirst({
        where: {
          clinicId: input.clinicId,
          patientId: patient.id,
          status: { in: [AppointmentStatus.confirmed, AppointmentStatus.pending] },
          startsAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) },
          ...clinicalScope,
        },
        include: { service: true, professional: true },
        orderBy: { startsAt: "asc" },
      });

  if (
    appointment &&
    input.scopedProfessionalId &&
    appointment.professionalId !== input.scopedProfessionalId
  ) {
    throw new SessionPrepError(
      "Sem permissão para o contexto clínico desta sessão",
      403,
    );
  }

  const pastAppointments = await prisma.appointment.findMany({
    where: {
      clinicId: input.clinicId,
      patientId: patient.id,
      status: {
        in: [
          AppointmentStatus.confirmed,
          AppointmentStatus.pending,
          AppointmentStatus.no_show,
        ],
      },
      ...clinicalScope,
      ...(appointment
        ? { id: { not: appointment.id }, startsAt: { lt: appointment.startsAt } }
        : { startsAt: { lt: new Date() } }),
    },
    include: {
      service: true,
      professional: true,
      clinicalRecord: true,
    },
    orderBy: { startsAt: "desc" },
    take: 5,
  });

  const records = await prisma.clinicalRecord.findMany({
    where: {
      clinicId: input.clinicId,
      patientId: patient.id,
      deletedAt: null,
      ...clinicalScope,
    },
    orderBy: [{ confirmedAt: "desc" }, { updatedAt: "desc" }],
    take: 12,
  });

  const confirmedRecords = records.filter(
    (r) => r.status === ClinicalRecordStatus.confirmed,
  );
  const latestClinical = confirmedRecords[0] ?? records[0] ?? null;

  const themes = uniqueKeepOrder(
    confirmedRecords.flatMap((r) =>
      splitBullets(decryptClinical(r.recurringThemes)),
    ),
  );
  const objectives = uniqueKeepOrder(
    confirmedRecords.flatMap((r) => splitBullets(decryptClinical(r.objectives))),
  );
  // Notas do cadastro: só no escopo admin (sem filtro) — podem conter conteúdo clínico compartilhado
  const patientNotesForPrep = input.scopedProfessionalId
    ? null
    : patient.notes
      ? decryptClinical(patient.notes)
      : null;
  const latestEvents = uniqueKeepOrder([
    ...confirmedRecords.flatMap((r) =>
      splitBullets(decryptClinical(r.importantPoints)),
    ),
    ...confirmedRecords
      .slice(0, 3)
      .flatMap((r) => splitBullets(decryptClinical(r.sessionNotes))),
    ...(patientNotesForPrep ? splitBullets(patientNotesForPrep) : []),
  ]);

  const recentSessions = pastAppointments.map((a) => {
    const rec = a.clinicalRecord;
    const summary = rec
      ? decryptClinical(rec.draftContent)?.trim() ||
        decryptClinical(rec.importantPoints)?.trim() ||
        null
      : null;
    return {
      id: a.id,
      start: a.startsAt.toISOString(),
      serviceName: a.service.name,
      professionalName: a.professional.name,
      status: a.status,
      summary: summary ? clip(summary, 280) : null,
      recordId: rec?.id ?? null,
      recordStatus: (rec?.status as "draft" | "confirmed" | undefined) ?? null,
    };
  });

  const pending: SessionPrepContext["pending"] = [];

  for (const draft of records.filter(
    (r) => r.status === ClinicalRecordStatus.draft,
  )) {
    pending.push({
      kind: "draft",
      label: `Rascunho clínico aguardando revisão (${formatDateTime(draft.updatedAt)})`,
      href: `/prontuarios?patientId=${patient.id}&id=${draft.id}`,
    });
  }

  const openPayments = await prisma.payment.findMany({
    where: {
      clinicId: input.clinicId,
      patientId: patient.id,
      status: PaymentStatus.pending,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const p of openPayments) {
    const amount = (p.amountCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    pending.push({
      kind: "payment",
      label: `Pagamento pendente de ${amount}`,
      href: "/financeiro",
    });
  }

  const interventions = uniqueKeepOrder(
    splitBullets(
      latestClinical
        ? decryptClinical(latestClinical.nextInterventions)
        : null,
    ),
    4,
  );
  for (const item of interventions) {
    pending.push({
      kind: "intervention",
      label: item,
      href: latestClinical
        ? `/prontuarios?patientId=${patient.id}&id=${latestClinical.id}`
        : `/prontuarios?patientId=${patient.id}`,
    });
  }

  if (appointment && !appointment.patientConfirmedAt) {
    pending.push({
      kind: "confirmation",
      label: "Sessão ainda sem confirmação do paciente",
      href: `/agenda?appointment=${appointment.id}`,
    });
  }

  const dueReminders = await prisma.reminder.findMany({
    where: {
      clinicId: input.clinicId,
      patientId: patient.id,
      status: ReminderStatus.pending,
      scheduledAt: { lte: new Date(Date.now() + 24 * 3_600_000) },
    },
    take: 3,
    orderBy: { scheduledAt: "asc" },
  });
  for (const r of dueReminders) {
    pending.push({
      kind: "reminder",
      label: `Lembrete pendente (${r.kind}) — ${formatDateTime(r.scheduledAt)}`,
      href: null,
    });
  }

  const patientName = patient.name?.trim() || patient.phone;
  const briefingSeed = localBriefing({
    patientName,
    themes,
    objectives,
    events: latestEvents,
    pendingCount: pending.length,
    sessionCount: recentSessions.length,
  });

  const prompt = [
    `Paciente: ${patientName}`,
    appointment
      ? `Próxima sessão: ${formatDateTime(appointment.startsAt)} — ${appointment.service.name} com ${appointment.professional.name}`
      : "Próxima sessão: não especificada",
    `Últimas sessões:\n${recentSessions
      .map(
        (s) =>
          `- ${formatDateTime(new Date(s.start))}: ${s.serviceName}${s.summary ? ` — ${s.summary}` : ""}`,
      )
      .join("\n") || "(nenhuma)"}`,
    `Temas: ${themes.join("; ") || "(nenhum)"}`,
    `Objetivos: ${objectives.join("; ") || "(nenhum)"}`,
    `Acontecimentos: ${latestEvents.join("; ") || "(nenhum)"}`,
    `Pendências: ${pending.map((p) => p.label).join("; ") || "(nenhuma)"}`,
    "Gere um briefing curto para o psicólogo entrar preparado.",
  ].join("\n\n");

  let briefing = briefingSeed;
  let provider: "openai" | "local" = "local";
  try {
    const ai = await openaiBriefing(prompt);
    if (ai) {
      briefing = ai;
      provider = "openai";
    }
  } catch {
    /* mantém local */
  }

  return {
    patient: {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
    },
    appointment: appointment
      ? {
          id: appointment.id,
          start: appointment.startsAt.toISOString(),
          end: appointment.endsAt.toISOString(),
          serviceName: appointment.service.name,
          professionalName: appointment.professional.name,
          status: appointment.status,
        }
      : null,
    recentSessions,
    recurringThemes: themes,
    objectives,
    latestEvents,
    pending,
    briefing,
    provider,
    reviewNote:
      "Contexto de apoio pré-sessão. Não substitui a leitura do prontuário nem a decisão clínica.",
  };
}
