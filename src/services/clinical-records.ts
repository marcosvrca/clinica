import { prisma } from "../infra/prisma.js";

export class ClinicalRecordError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const recordInclude = {
  patient: true,
  professional: true,
  appointment: {
    include: {
      service: true,
    },
  },
} as const;

export function mapClinicalRecord(r: {
  id: string;
  status: string;
  sessionNotes: string | null;
  draftContent: string;
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
}) {
  return {
    id: r.id,
    status: r.status as "draft" | "confirmed",
    sessionNotes: r.sessionNotes,
    draftContent: r.draftContent,
    recordingConsent: r.recordingConsent,
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
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

export async function listClinicalRecords(input: {
  clinicId: string;
  patientId?: string;
  status?: string;
  professionalId?: string;
}) {
  const items = await prisma.clinicalRecord.findMany({
    where: {
      clinicId: input.clinicId,
      ...(input.patientId ? { patientId: input.patientId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.professionalId ? { professionalId: input.professionalId } : {}),
    },
    include: recordInclude,
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });
  // Rascunhos primeiro (aguardando revisão), depois confirmados
  const sorted = [...items].sort((a, b) => {
    if (a.status === b.status) {
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    }
    return a.status === "draft" ? -1 : 1;
  });
  return sorted.map(mapClinicalRecord);
}

export async function getClinicalRecordStats(clinicId: string) {
  const [drafts, confirmed, patientsWithRecords] = await Promise.all([
    prisma.clinicalRecord.count({ where: { clinicId, status: "draft" } }),
    prisma.clinicalRecord.count({ where: { clinicId, status: "confirmed" } }),
    prisma.clinicalRecord.groupBy({
      by: ["patientId"],
      where: { clinicId },
    }),
  ]);
  return {
    drafts,
    confirmed,
    patients: patientsWithRecords.length,
  };
}

export async function getClinicalRecord(clinicId: string, id: string) {
  const record = await prisma.clinicalRecord.findFirst({
    where: { id, clinicId },
    include: recordInclude,
  });
  if (!record) throw new ClinicalRecordError("Registro não encontrado", 404);
  return mapClinicalRecord(record);
}

export async function createClinicalRecord(input: {
  clinicId: string;
  patientId?: string;
  professionalId?: string;
  appointmentId?: string;
  sessionNotes?: string;
  draftContent?: string;
  recordingConsent?: boolean;
}) {
  if (input.appointmentId) {
    const existing = await prisma.clinicalRecord.findUnique({
      where: { appointmentId: input.appointmentId },
      include: recordInclude,
    });
    if (existing) {
      if (existing.clinicId !== input.clinicId) {
        throw new ClinicalRecordError("Registro não encontrado", 404);
      }
      return mapClinicalRecord(existing);
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: input.appointmentId,
        clinicId: input.clinicId,
        status: { in: ["confirmed", "pending"] },
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
        sessionNotes: input.sessionNotes ?? appointment.notes,
        draftContent: input.draftContent ?? "",
        recordingConsent: input.recordingConsent ?? false,
        status: "draft",
      },
      include: recordInclude,
    });
    return mapClinicalRecord(created);
  }

  if (!input.patientId || !input.professionalId) {
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
      id: input.professionalId,
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
      sessionNotes: input.sessionNotes ?? null,
      draftContent: input.draftContent ?? "",
      recordingConsent: input.recordingConsent ?? false,
      status: "draft",
    },
    include: recordInclude,
  });
  return mapClinicalRecord(created);
}

export async function updateClinicalRecord(input: {
  clinicId: string;
  id: string;
  sessionNotes?: string | null;
  draftContent?: string;
  recordingConsent?: boolean;
  professionalId?: string;
}) {
  const current = await prisma.clinicalRecord.findFirst({
    where: { id: input.id, clinicId: input.clinicId },
  });
  if (!current) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (current.status === "confirmed") {
    throw new ClinicalRecordError(
      "Registro confirmado no prontuário não pode ser editado. Crie um novo rascunho se necessário.",
      422,
    );
  }

  if (input.professionalId) {
    const pro = await prisma.professional.findFirst({
      where: {
        id: input.professionalId,
        clinicId: input.clinicId,
        active: true,
      },
    });
    if (!pro) throw new ClinicalRecordError("Profissional não encontrado", 404);
  }

  const updated = await prisma.clinicalRecord.update({
    where: { id: current.id },
    data: {
      ...(input.sessionNotes !== undefined
        ? { sessionNotes: input.sessionNotes }
        : {}),
      ...(input.draftContent !== undefined
        ? { draftContent: input.draftContent }
        : {}),
      ...(input.recordingConsent !== undefined
        ? { recordingConsent: input.recordingConsent }
        : {}),
      ...(input.professionalId ? { professionalId: input.professionalId } : {}),
    },
    include: recordInclude,
  });
  return mapClinicalRecord(updated);
}

export async function confirmClinicalRecord(clinicId: string, id: string) {
  const current = await prisma.clinicalRecord.findFirst({
    where: { id, clinicId },
  });
  if (!current) throw new ClinicalRecordError("Registro não encontrado", 404);
  if (current.status === "confirmed") {
    throw new ClinicalRecordError("Registro já confirmado no prontuário", 422);
  }
  if (!current.draftContent.trim()) {
    throw new ClinicalRecordError(
      "Escreva o rascunho de evolução antes de confirmar",
      422,
    );
  }

  const updated = await prisma.clinicalRecord.update({
    where: { id: current.id },
    data: {
      status: "confirmed",
      confirmedAt: new Date(),
    },
    include: recordInclude,
  });
  return mapClinicalRecord(updated);
}
