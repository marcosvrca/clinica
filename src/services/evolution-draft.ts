import { ClinicalRecordStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../infra/prisma.js";
import { decryptClinical } from "../lib/clinical-crypto.js";
import {
  ClinicalRecordError,
  mapClinicalRecord,
  updateClinicalRecord,
} from "./clinical-records.js";

export type EvolutionDraftSections = {
  summary: string;
  hypotheses: string;
  recurringThemes: string;
  nextInterventions: string;
  importantPoints: string;
};

export type EvolutionDraftResult = EvolutionDraftSections & {
  provider: "openai" | "local";
  model: string | null;
  sources: {
    previousSession: boolean;
    notes: boolean;
    audio: boolean;
  };
  reviewRequired: true;
  message: string;
  record?: ReturnType<typeof mapClinicalRecord>;
};

function clip(text: string, max = 4000) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function bulletsFromText(text: string, limit = 5): string[] {
  const lines = text
    .split(/[\n.;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  const unique: string[] = [];
  for (const line of lines) {
    if (unique.some((u) => u.toLowerCase().includes(line.toLowerCase().slice(0, 24)))) {
      continue;
    }
    unique.push(line.length > 160 ? `${line.slice(0, 157)}…` : line);
    if (unique.length >= limit) break;
  }
  return unique;
}

function formatBullets(items: string[]) {
  if (items.length === 0) return "";
  return items.map((i) => `• ${i}`).join("\n");
}

function localDraft(input: {
  previousEvolution: string;
  previousHypotheses: string;
  previousThemes: string;
  notes: string;
  audio: string;
}): EvolutionDraftSections {
  const corpus = [input.notes, input.audio, input.previousEvolution]
    .filter(Boolean)
    .join("\n");
  const noteBullets = bulletsFromText(input.notes || input.audio || corpus, 4);
  const prevBullets = bulletsFromText(input.previousEvolution, 3);
  const themeSeeds = bulletsFromText(
    [input.previousThemes, input.previousHypotheses, corpus].filter(Boolean).join("\n"),
    4,
  );

  const summaryParts = [
    noteBullets.length
      ? `Resumo da sessão com base nas anotações disponíveis:\n${formatBullets(noteBullets)}`
      : "Resumo preliminar: anotações ainda escassas — complete o texto e revise antes de confirmar.",
  ];
  if (prevBullets.length) {
    summaryParts.push(
      `\nContinuidade da sessão anterior:\n${formatBullets(prevBullets)}`,
    );
  }

  return {
    summary: summaryParts.join("\n"),
    hypotheses:
      input.previousHypotheses.trim() ||
      formatBullets(
        themeSeeds.length
          ? themeSeeds.map((t) => `Hipótese em elaboração a partir de: ${t}`)
          : [
              "Hipótese em elaboração — falta material clínico suficiente; valide com o profissional.",
            ],
      ),
    recurringThemes: formatBullets(
      themeSeeds.length
        ? themeSeeds
        : ["Temas a identificar na próxima revisão do rascunho."],
    ),
    nextInterventions: formatBullets([
      "Revisitar o que emergiu nesta sessão e priorizar o tema mais emocionalmente carregado.",
      "Checar adesão às tarefas / acordos da sessão anterior, se houver.",
      "Planejar uma intervenção concreta alinhada ao objetivo terapêutico vigente.",
    ]),
    importantPoints: formatBullets(
      noteBullets.length
        ? noteBullets.slice(0, 3)
        : [
            "Registrar risco, rede de apoio e mudanças relevantes assim que houver material.",
          ],
    ),
  };
}

function parseAiJson(raw: string): EvolutionDraftSections | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced?.[1]?.trim() ?? trimmed;
  try {
    const data = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      summary: String(data.summary ?? data.resumo ?? "").trim(),
      hypotheses: String(data.hypotheses ?? data.hipoteses ?? "").trim(),
      recurringThemes: String(
        data.recurringThemes ?? data.temasRecorrentes ?? "",
      ).trim(),
      nextInterventions: String(
        data.nextInterventions ?? data.proximasIntervencoes ?? "",
      ).trim(),
      importantPoints: String(
        data.importantPoints ?? data.pontosImportantes ?? "",
      ).trim(),
    };
  } catch {
    return null;
  }
}

async function openaiDraft(prompt: string): Promise<{
  sections: EvolutionDraftSections;
  model: string;
} | null> {
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
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você é um assistente de apoio à documentação clínica em psicologia.
Gere apenas um rascunho estruturado para REVISÃO do profissional.
Nunca invente diagnóstico definitivo, risco concreto ou fatos não presentes no material.
Não use linguagem prescritiva absoluta. Escreva em português do Brasil.
Responda SOMENTE JSON com chaves:
summary, hypotheses, recurringThemes, nextInterventions, importantPoints
(valores string; use bullets com • quando listar).`,
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new ClinicalRecordError(
      `Falha na IA (${res.status})${errText ? `: ${clip(errText, 180)}` : ""}`,
      502,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const sections = parseAiJson(content);
  if (!sections || !sections.summary) {
    throw new ClinicalRecordError(
      "A IA retornou um rascunho inválido. Tente novamente.",
      502,
    );
  }
  return { sections, model };
}

/**
 * Gera EvolutionDraft a partir de sessão anterior + anotações + áudio (com consentimento).
 * Nunca confirma no prontuário — apenas propõe campos editáveis.
 */
export async function generateEvolutionDraft(input: {
  clinicId: string;
  recordId: string;
  /** Anotações atuais (sobrescreve observações do rascunho se enviado). */
  notes?: string;
  /** Transcrição / notas de áudio — exige consentimento. */
  audioNotes?: string;
  recordingConsent?: boolean;
  /** Se true, grava o rascunho nos campos do registro (status permanece draft). */
  apply?: boolean;
}): Promise<EvolutionDraftResult> {
  const current = await prisma.clinicalRecord.findFirst({
    where: {
      id: input.recordId,
      clinicId: input.clinicId,
      deletedAt: null,
    },
    include: {
      patient: true,
      professional: true,
      appointment: { include: { service: true } },
      files: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!current) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (current.status === ClinicalRecordStatus.confirmed) {
    throw new ClinicalRecordError(
      "Registro confirmado não pode receber novo rascunho de IA",
      422,
    );
  }

  const consent =
    input.recordingConsent ?? current.recordingConsent ?? false;
  const audioRaw = (input.audioNotes ?? decryptClinical(current.audioNotes) ?? "").trim();
  if (audioRaw && !consent) {
    throw new ClinicalRecordError(
      "Consentimento explícito é obrigatório para usar áudio na geração",
      422,
    );
  }

  const notes = (
    input.notes ??
    decryptClinical(current.sessionNotes) ??
    ""
  ).trim();
  const currentEvolution = decryptClinical(current.draftContent) ?? "";

  const previous = await prisma.clinicalRecord.findFirst({
    where: {
      clinicId: input.clinicId,
      patientId: current.patientId,
      status: ClinicalRecordStatus.confirmed,
      deletedAt: null,
      id: { not: current.id },
    },
    orderBy: [{ confirmedAt: "desc" }, { updatedAt: "desc" }],
  });

  const previousEvolution = previous
    ? decryptClinical(previous.draftContent) ?? ""
    : "";
  const previousHypotheses = previous
    ? decryptClinical(previous.hypotheses) ?? ""
    : "";
  const previousThemes = previous
    ? decryptClinical(previous.recurringThemes) ?? ""
    : "";
  const previousPoints = previous
    ? decryptClinical(previous.importantPoints) ?? ""
    : "";
  const previousInterventions = previous
    ? decryptClinical(previous.nextInterventions) ?? ""
    : "";

  const sources = {
    previousSession: Boolean(
      previousEvolution ||
        previousHypotheses ||
        previousThemes ||
        previousPoints,
    ),
    notes: Boolean(notes || currentEvolution),
    audio: Boolean(audioRaw),
  };

  if (!sources.previousSession && !sources.notes && !sources.audio) {
    throw new ClinicalRecordError(
      "Inclua anotações, áudio (com consentimento) ou aguarde uma sessão anterior confirmada",
      422,
    );
  }

  const prompt = [
    "Material clínico para rascunho de evolução (revisão humana obrigatória):",
    previous
      ? `Sessão anterior confirmada:\n- Evolução: ${clip(previousEvolution)}\n- Hipóteses: ${clip(previousHypotheses)}\n- Temas: ${clip(previousThemes)}\n- Intervenções: ${clip(previousInterventions)}\n- Pontos: ${clip(previousPoints)}`
      : "Sessão anterior: (não há evolução confirmada)",
    `Anotações da sessão atual:\n${clip(notes || currentEvolution || "(vazio)")}`,
    audioRaw
      ? `Áudio / transcrição (com consentimento):\n${clip(audioRaw)}`
      : "Áudio: (não utilizado)",
  ].join("\n\n");

  let sections: EvolutionDraftSections;
  let provider: "openai" | "local" = "local";
  let model: string | null = null;

  try {
    const ai = await openaiDraft(prompt);
    if (ai) {
      sections = ai.sections;
      provider = "openai";
      model = ai.model;
    } else {
      sections = localDraft({
        previousEvolution,
        previousHypotheses,
        previousThemes,
        notes: notes || currentEvolution,
        audio: audioRaw,
      });
    }
  } catch (err) {
    if (err instanceof ClinicalRecordError && env().OPENAI_API_KEY.trim()) {
      // Se a API falhar, não engolir silenciosamente — profissional precisa saber
      throw err;
    }
    sections = localDraft({
      previousEvolution,
      previousHypotheses,
      previousThemes,
      notes: notes || currentEvolution,
      audio: audioRaw,
    });
  }

  const message =
    provider === "openai"
      ? "Rascunho gerado por IA — revise e confirme no prontuário apenas se estiver adequado."
      : "Rascunho estruturado local (sem chave de IA) — revise e edite antes de confirmar.";

  let record = mapClinicalRecord(current);
  if (input.apply !== false) {
    record = await updateClinicalRecord({
      clinicId: input.clinicId,
      id: current.id,
      draftContent: sections.summary,
      hypotheses: sections.hypotheses,
      recurringThemes: sections.recurringThemes,
      nextInterventions: sections.nextInterventions,
      importantPoints: sections.importantPoints,
      sessionNotes: notes || undefined,
      audioNotes: consent ? audioRaw || null : null,
      recordingConsent: consent,
    });
  }

  return {
    ...sections,
    provider,
    model,
    sources,
    reviewRequired: true,
    message,
    record,
  };
}
