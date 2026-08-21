import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AppointmentStatus,
  ClinicalAuditAction,
  ClinicalFileKind,
  ClinicalRecordStatus,
} from "@prisma/client";
import { prisma } from "../infra/prisma.js";
import {
  decryptClinical,
  encryptClinical,
  encryptClinicalRequired,
} from "../lib/clinical-crypto.js";
import {
  type ClinicalAuditActor,
  writeClinicalAudit,
} from "./clinical-audit.js";

export class ClinicalRecordError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "clinical");

const recordInclude = {
  patient: true,
  professional: true,
  appointment: {
    include: {
      service: true,
    },
  },
  files: { orderBy: { createdAt: "desc" as const } },
} as const;

const notDeleted = { deletedAt: null as Date | null };

export type ClinicalWriteFields = {
  sessionNotes?: string | null;
  draftContent?: string;
  objectives?: string | null;
  hypotheses?: string | null;
  recurringThemes?: string | null;
  nextInterventions?: string | null;
  importantPoints?: string | null;
  audioNotes?: string | null;
  diagnosisCid?: string | null;
  diagnosisDsm?: string | null;
  recordingConsent?: boolean;
};

function mapFile(f: {
  id: string;
  kind: ClinicalFileKind;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}) {
  return {
    id: f.id,
    kind: f.kind,
    title: f.title,
    fileName: f.fileName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    createdAt: f.createdAt.toISOString(),
  };
}

export function mapClinicalRecord(r: {
  id: string;
  status: ClinicalRecordStatus;
  sessionNotes: string | null;
  draftContent: string;
  objectives: string | null;
  hypotheses: string | null;
  recurringThemes?: string | null;
  nextInterventions?: string | null;
  importantPoints?: string | null;
  audioNotes?: string | null;
  diagnosisCid: string | null;
  diagnosisDsm: string | null;
  recordingConsent: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  patient: { id: string; phone: string; name: string | null };
  professional: { id: string; name: string };
  appointment: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    service: { id: string; name: string };
  } | null;
  files?: {
    id: string;
    kind: ClinicalFileKind;
    title: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }[];
}) {
  return {
    id: r.id,
    status: r.status,
    /** Evolução / resumo — texto livre */
    evolution: decryptClinical(r.draftContent) ?? "",
    draftContent: decryptClinical(r.draftContent) ?? "",
    /** Objetivos do tratamento */
    objectives: decryptClinical(r.objectives) ?? "",
    /** Hipóteses clínicas */
    hypotheses: decryptClinical(r.hypotheses) ?? "",
    recurringThemes: decryptClinical(r.recurringThemes ?? null) ?? "",
    nextInterventions: decryptClinical(r.nextInterventions ?? null) ?? "",
    importantPoints: decryptClinical(r.importantPoints ?? null) ?? "",
    audioNotes: decryptClinical(r.audioNotes ?? null) ?? "",
    /** Diagnósticos */
    diagnosisCid: decryptClinical(r.diagnosisCid) ?? "",
    diagnosisDsm: decryptClinical(r.diagnosisDsm) ?? "",
    /** Observações — campo livre */
    observations: decryptClinical(r.sessionNotes) ?? "",
    sessionNotes: decryptClinical(r.sessionNotes),
    recordingConsent: r.recordingConsent,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    files: (r.files ?? []).map(mapFile),
    patient: {
      id: r.patient.id,
      phone: r.patient.phone,
      name: r.patient.name,
    },
    professional: {
      id: r.professional.id,
      name: r.professional.name,
    },
    appointment: r.appointment
      ? {
          id: r.appointment.id,
          start: r.appointment.startsAt.toISOString(),
          end: r.appointment.endsAt.toISOString(),
          service: {
            id: r.appointment.service.id,
            name: r.appointment.service.name,
          },
        }
      : null,
  };
}

function encryptFields(
  input: ClinicalWriteFields,
  opts?: { existingRecordingConsent?: boolean },
) {
  const nextConsent =
    input.recordingConsent !== undefined
      ? input.recordingConsent
      : opts?.existingRecordingConsent;
  if (input.audioNotes !== undefined) {
    const hasAudio = (input.audioNotes ?? "").trim().length > 0;
    if (hasAudio && nextConsent !== true) {
      throw new ClinicalRecordError(
        "Áudio/gravação exige consentimento explícito do paciente (recordingConsent)",
        422,
      );
    }
  }

  return {
    ...(input.sessionNotes !== undefined
      ? { sessionNotes: encryptClinical(input.sessionNotes) }
      : {}),
    ...(input.draftContent !== undefined
      ? { draftContent: encryptClinicalRequired(input.draftContent) }
      : {}),
    ...(input.objectives !== undefined
      ? { objectives: encryptClinical(input.objectives) }
      : {}),
    ...(input.hypotheses !== undefined
      ? { hypotheses: encryptClinical(input.hypotheses) }
      : {}),
    ...(input.recurringThemes !== undefined
      ? { recurringThemes: encryptClinical(input.recurringThemes) }
      : {}),
    ...(input.nextInterventions !== undefined
      ? { nextInterventions: encryptClinical(input.nextInterventions) }
      : {}),
    ...(input.importantPoints !== undefined
      ? { importantPoints: encryptClinical(input.importantPoints) }
      : {}),
    ...(input.audioNotes !== undefined
      ? {
          audioNotes: encryptClinical(
            nextConsent === true ? input.audioNotes : null,
          ),
        }
      : {}),
    ...(input.diagnosisCid !== undefined
      ? { diagnosisCid: encryptClinical(input.diagnosisCid) }
      : {}),
    ...(input.diagnosisDsm !== undefined
      ? { diagnosisDsm: encryptClinical(input.diagnosisDsm) }
      : {}),
    ...(input.recordingConsent !== undefined
      ? { recordingConsent: input.recordingConsent }
      : {}),
  };
}

function assertCreateAudioConsent(input: {
  audioNotes?: string | null;
  recordingConsent?: boolean;
}) {
  const hasAudio = (input.audioNotes ?? "").trim().length > 0;
  if (hasAudio && input.recordingConsent !== true) {
    throw new ClinicalRecordError(
      "Áudio/gravação exige consentimento explícito do paciente (recordingConsent)",
      422,
    );
  }
}

function hasConfirmableContent(current: {
  draftContent: string;
  sessionNotes: string | null;
  objectives: string | null;
  hypotheses: string | null;
  recurringThemes?: string | null;
  nextInterventions?: string | null;
  importantPoints?: string | null;
  diagnosisCid: string | null;
  diagnosisDsm: string | null;
}) {
  const parts = [
    decryptClinical(current.draftContent),
    decryptClinical(current.sessionNotes),
    decryptClinical(current.objectives),
    decryptClinical(current.hypotheses),
    decryptClinical(current.recurringThemes ?? null),
    decryptClinical(current.nextInterventions ?? null),
    decryptClinical(current.importantPoints ?? null),
    decryptClinical(current.diagnosisCid),
    decryptClinical(current.diagnosisDsm),
  ];
  return parts.some((p) => (p ?? "").trim().length > 0);
}

export async function listClinicalRecords(input: {
  clinicId: string;
  patientId?: string;
  status?: ClinicalRecordStatus;
  professionalId?: string;
}) {
  const items = await prisma.clinicalRecord.findMany({
    where: {
      clinicId: input.clinicId,
      ...notDeleted,
      ...(input.patientId ? { patientId: input.patientId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.professionalId ? { professionalId: input.professionalId } : {}),
    },
    include: recordInclude,
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });
  const sorted = [...items].sort((a, b) => {
    if (a.status === b.status) {
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    }
    return a.status === ClinicalRecordStatus.draft ? -1 : 1;
  });
  return sorted.map(mapClinicalRecord);
}

export async function getClinicalRecordStats(
  clinicId: string,
  professionalId?: string,
) {
  const scope = professionalId ? { professionalId } : {};
  const [drafts, confirmed, patientsWithRecords] = await Promise.all([
    prisma.clinicalRecord.count({
      where: {
        clinicId,
        status: ClinicalRecordStatus.draft,
        ...notDeleted,
        ...scope,
      },
    }),
    prisma.clinicalRecord.count({
      where: {
        clinicId,
        status: ClinicalRecordStatus.confirmed,
        ...notDeleted,
        ...scope,
      },
    }),
    prisma.clinicalRecord.groupBy({
      by: ["patientId"],
      where: { clinicId, ...notDeleted, ...scope },
    }),
  ]);
  return {
    drafts,
    confirmed,
    patients: patientsWithRecords.length,
  };
}

export async function getClinicalRecord(
  clinicId: string,
  id: string,
  professionalId?: string,
  actor?: ClinicalAuditActor,
) {
  const record = await prisma.clinicalRecord.findFirst({
    where: {
      id,
      clinicId,
      ...notDeleted,
      ...(professionalId ? { professionalId } : {}),
    },
    include: recordInclude,
  });
  if (!record) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (actor) {
    await writeClinicalAudit({
      clinicId,
      recordId: record.id,
      patientId: record.patientId,
      action: ClinicalAuditAction.viewed,
      actor,
    });
  }
  return mapClinicalRecord(record);
}

export async function createClinicalRecord(input: {
  clinicId: string;
  patientId?: string;
  professionalId?: string;
  appointmentId?: string;
  scopedProfessionalId?: string;
  actor?: ClinicalAuditActor;
} & ClinicalWriteFields) {
  assertCreateAudioConsent(input);
  const forcedPro = input.scopedProfessionalId;
  if (forcedPro && input.professionalId && input.professionalId !== forcedPro) {
    throw new ClinicalRecordError(
      "Sem permissão para criar registro de outro profissional",
      403,
    );
  }
  const professionalId = forcedPro ?? input.professionalId;

  if (input.appointmentId) {
    const existing = await prisma.clinicalRecord.findFirst({
      where: {
        appointmentId: input.appointmentId,
        clinicId: input.clinicId,
        ...notDeleted,
      },
      include: recordInclude,
    });
    if (existing) {
      if (forcedPro && existing.professionalId !== forcedPro) {
        throw new ClinicalRecordError(
          "Sem permissão para acessar este registro",
          403,
        );
      }
      return mapClinicalRecord(existing);
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        clinicId: input.clinicId,
        ...(forcedPro ? { professionalId: forcedPro } : {}),
        status: {
          in: [AppointmentStatus.confirmed, AppointmentStatus.pending],
        },
      },
    });
    if (!appointment) {
      throw new ClinicalRecordError("Agendamento não encontrado", 404);
    }

    const created = await prisma.clinicalRecord.create({
      data: {
        clinicId: input.clinicId,
        patientId: appointment.patientId,
        professionalId: appointment.professionalId,
        appointmentId: appointment.id,
        sessionNotes: encryptClinical(
          input.sessionNotes ?? appointment.notes,
        ),
        draftContent: encryptClinicalRequired(input.draftContent ?? ""),
        objectives: encryptClinical(input.objectives ?? null),
        hypotheses: encryptClinical(input.hypotheses ?? null),
        recurringThemes: encryptClinical(input.recurringThemes ?? null),
        nextInterventions: encryptClinical(input.nextInterventions ?? null),
        importantPoints: encryptClinical(input.importantPoints ?? null),
        audioNotes: encryptClinical(
          input.recordingConsent === true ? (input.audioNotes ?? null) : null,
        ),
        diagnosisCid: encryptClinical(input.diagnosisCid ?? null),
        diagnosisDsm: encryptClinical(input.diagnosisDsm ?? null),
        recordingConsent: input.recordingConsent ?? false,
        status: ClinicalRecordStatus.draft,
      },
      include: recordInclude,
    });
    await writeClinicalAudit({
      clinicId: input.clinicId,
      recordId: created.id,
      patientId: created.patientId,
      action: ClinicalAuditAction.created,
      actor: input.actor,
      meta: { appointmentId: appointment.id },
    });
    return mapClinicalRecord(created);
  }

  if (!input.patientId || !professionalId) {
    throw new ClinicalRecordError(
      "Informe appointmentId ou patientId + professionalId",
      422,
    );
  }

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, clinicId: input.clinicId },
  });
  if (!patient) throw new ClinicalRecordError("Paciente não encontrado", 404);

  const professional = await prisma.professional.findFirst({
    where: {
      id: professionalId,
      clinicId: input.clinicId,
      active: true,
    },
  });
  if (!professional) {
    throw new ClinicalRecordError("Profissional não encontrado", 404);
  }

  const created = await prisma.clinicalRecord.create({
    data: {
      clinicId: input.clinicId,
      patientId: patient.id,
      professionalId: professional.id,
      sessionNotes: encryptClinical(input.sessionNotes ?? null),
      draftContent: encryptClinicalRequired(input.draftContent ?? ""),
      objectives: encryptClinical(input.objectives ?? null),
      hypotheses: encryptClinical(input.hypotheses ?? null),
      recurringThemes: encryptClinical(input.recurringThemes ?? null),
      nextInterventions: encryptClinical(input.nextInterventions ?? null),
      importantPoints: encryptClinical(input.importantPoints ?? null),
      audioNotes: encryptClinical(
        input.recordingConsent === true ? (input.audioNotes ?? null) : null,
      ),
      diagnosisCid: encryptClinical(input.diagnosisCid ?? null),
      diagnosisDsm: encryptClinical(input.diagnosisDsm ?? null),
      recordingConsent: input.recordingConsent ?? false,
      status: ClinicalRecordStatus.draft,
    },
    include: recordInclude,
  });
  await writeClinicalAudit({
    clinicId: input.clinicId,
    recordId: created.id,
    patientId: created.patientId,
    action: ClinicalAuditAction.created,
    actor: input.actor,
  });
  return mapClinicalRecord(created);
}

export async function updateClinicalRecord(input: {
  clinicId: string;
  id: string;
  professionalId?: string;
  /** Quando definido, só permite editar registros deste profissional. */
  scopedProfessionalId?: string;
  actor?: ClinicalAuditActor;
} & ClinicalWriteFields) {
  const current = await prisma.clinicalRecord.findFirst({
    where: {
      id: input.id,
      clinicId: input.clinicId,
      ...notDeleted,
      ...(input.scopedProfessionalId
        ? { professionalId: input.scopedProfessionalId }
        : {}),
    },
  });
  if (!current) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (current.status === ClinicalRecordStatus.confirmed) {
    throw new ClinicalRecordError(
      "Registro confirmado no prontuário não pode ser editado. Crie um novo rascunho se necessário.",
      422,
    );
  }

  const nextProId = input.scopedProfessionalId
    ? input.scopedProfessionalId
    : input.professionalId;

  if (nextProId && nextProId !== current.professionalId) {
    const pro = await prisma.professional.findFirst({
      where: {
        id: nextProId,
        clinicId: input.clinicId,
        active: true,
      },
    });
    if (!pro) throw new ClinicalRecordError("Profissional não encontrado", 404);
  }

  const updated = await prisma.clinicalRecord.update({
    where: { id: current.id },
    data: {
      ...encryptFields(input, {
        existingRecordingConsent: current.recordingConsent,
      }),
      ...(nextProId ? { professionalId: nextProId } : {}),
    },
    include: recordInclude,
  });
  await writeClinicalAudit({
    clinicId: input.clinicId,
    recordId: updated.id,
    patientId: updated.patientId,
    action: ClinicalAuditAction.updated,
    actor: input.actor,
    meta: {
      fields: (
        [
          "sessionNotes",
          "draftContent",
          "objectives",
          "hypotheses",
          "recurringThemes",
          "nextInterventions",
          "importantPoints",
          "audioNotes",
          "diagnosisCid",
          "diagnosisDsm",
          "recordingConsent",
          "professionalId",
        ] as const
      ).filter((key) => input[key] !== undefined),
    },
  });
  return mapClinicalRecord(updated);
}

export async function confirmClinicalRecord(
  clinicId: string,
  id: string,
  scopedProfessionalId?: string,
  actor?: ClinicalAuditActor,
) {
  const current = await prisma.clinicalRecord.findFirst({
    where: {
      id,
      clinicId,
      ...notDeleted,
      ...(scopedProfessionalId ? { professionalId: scopedProfessionalId } : {}),
    },
  });
  if (!current) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (current.status === ClinicalRecordStatus.confirmed) {
    throw new ClinicalRecordError("Registro já confirmado no prontuário", 422);
  }
  if (!hasConfirmableContent(current)) {
    throw new ClinicalRecordError(
      "Preencha ao menos uma seção clínica (evolução, objetivos, hipóteses, diagnósticos ou observações) antes de confirmar",
      422,
    );
  }

  const updated = await prisma.clinicalRecord.update({
    where: { id: current.id },
    data: {
      status: ClinicalRecordStatus.confirmed,
      confirmedAt: new Date(),
    },
    include: recordInclude,
  });
  await writeClinicalAudit({
    clinicId,
    recordId: updated.id,
    patientId: updated.patientId,
    action: ClinicalAuditAction.confirmed,
    actor,
  });
  return mapClinicalRecord(updated);
}

export async function softDeleteClinicalRecord(
  clinicId: string,
  id: string,
  scopedProfessionalId?: string,
  actor?: ClinicalAuditActor,
) {
  const current = await prisma.clinicalRecord.findFirst({
    where: {
      id,
      clinicId,
      ...notDeleted,
      ...(scopedProfessionalId ? { professionalId: scopedProfessionalId } : {}),
    },
  });
  if (!current) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (current.status === ClinicalRecordStatus.confirmed) {
    throw new ClinicalRecordError(
      "Registro confirmado não pode ser excluído. Contate a administração se necessário.",
      422,
    );
  }
  await prisma.clinicalRecord.update({
    where: { id: current.id },
    data: { deletedAt: new Date() },
  });
  await writeClinicalAudit({
    clinicId,
    recordId: current.id,
    patientId: current.patientId,
    action: ClinicalAuditAction.deleted,
    actor,
  });
  return { ok: true };
}

export async function saveClinicalRecordFile(input: {
  clinicId: string;
  recordId: string;
  kind: ClinicalFileKind;
  title: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  scopedProfessionalId?: string;
  actor?: ClinicalAuditActor;
}) {
  const record = await prisma.clinicalRecord.findFirst({
    where: {
      id: input.recordId,
      clinicId: input.clinicId,
      ...notDeleted,
      ...(input.scopedProfessionalId
        ? { professionalId: input.scopedProfessionalId }
        : {}),
    },
  });
  if (!record) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (record.status === ClinicalRecordStatus.confirmed) {
    throw new ClinicalRecordError(
      "Não é possível anexar arquivos a um registro já confirmado",
      422,
    );
  }

  const dir = path.join(UPLOAD_ROOT, input.recordId);
  await mkdir(dir, { recursive: true });
  const safeName = input.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const stored = `${randomUUID()}_${safeName}`;
  const storagePath = path.join(dir, stored);
  await writeFile(storagePath, input.buffer);
  const relative = path.relative(path.resolve(process.cwd()), storagePath);

  const file = await prisma.clinicalRecordFile.create({
    data: {
      clinicId: input.clinicId,
      recordId: input.recordId,
      kind: input.kind,
      title: input.title.trim() || input.fileName,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      storagePath: relative,
    },
  });

  await writeClinicalAudit({
    clinicId: input.clinicId,
    recordId: input.recordId,
    patientId: record.patientId,
    action: ClinicalAuditAction.file_added,
    actor: input.actor,
    meta: { fileId: file.id, kind: file.kind, fileName: file.fileName },
  });

  return mapFile(file);
}

export async function getClinicalRecordFile(
  clinicId: string,
  recordId: string,
  fileId: string,
  scopedProfessionalId?: string,
) {
  if (scopedProfessionalId) {
    const owned = await prisma.clinicalRecord.findFirst({
      where: {
        id: recordId,
        clinicId,
        professionalId: scopedProfessionalId,
        ...notDeleted,
      },
      select: { id: true },
    });
    if (!owned) throw new ClinicalRecordError("Registro não encontrado", 404);
  }
  const file = await prisma.clinicalRecordFile.findFirst({
    where: { id: fileId, recordId, clinicId },
  });
  if (!file) throw new ClinicalRecordError("Arquivo não encontrado", 404);
  return file;
}

export async function deleteClinicalRecordFile(
  clinicId: string,
  recordId: string,
  fileId: string,
  scopedProfessionalId?: string,
  actor?: ClinicalAuditActor,
) {
  const record = await prisma.clinicalRecord.findFirst({
    where: {
      id: recordId,
      clinicId,
      ...notDeleted,
      ...(scopedProfessionalId ? { professionalId: scopedProfessionalId } : {}),
    },
  });
  if (!record) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (record.status === ClinicalRecordStatus.confirmed) {
    throw new ClinicalRecordError(
      "Arquivos de registro confirmado não podem ser excluídos",
      422,
    );
  }

  const file = await prisma.clinicalRecordFile.findFirst({
    where: { id: fileId, recordId, clinicId },
  });
  if (!file) throw new ClinicalRecordError("Arquivo não encontrado", 404);

  try {
    await unlink(path.resolve(process.cwd(), file.storagePath));
  } catch {
    /* ignore */
  }
  await prisma.clinicalRecordFile.delete({ where: { id: file.id } });
  await writeClinicalAudit({
    clinicId,
    recordId,
    patientId: record.patientId,
    action: ClinicalAuditAction.file_removed,
    actor,
    meta: { fileId: file.id, fileName: file.fileName },
  });
  return { ok: true };
}
