import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PatientDocumentKind } from "@prisma/client";
import { prisma } from "../infra/prisma.js";
import { normalizePhone } from "../lib/time.js";
import { decryptClinical, encryptClinical } from "../lib/clinical-crypto.js";

export class PatientError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "patients");

export type PatientWriteInput = {
  phone: string;
  name?: string | null;
  email?: string | null;
  notes?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  profession?: string | null;
  maritalStatus?: string | null;
  zipCode?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  emergencyRelation?: string | null;
  insuranceName?: string | null;
  insuranceNumber?: string | null;
  insurancePlan?: string | null;
  financialName?: string | null;
  financialCpf?: string | null;
  financialPhone?: string | null;
  financialRelation?: string | null;
};

function digits(value: string | null | undefined) {
  if (value == null || value === "") return null;
  return value.replace(/\D/g, "") || null;
}

function parseBirthDate(value: string | null | undefined) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new PatientError("Data de nascimento inválida", 422);
  }
  return d;
}

function toWriteData(input: PatientWriteInput) {
  return {
    phone: normalizePhone(input.phone),
    name: input.name?.trim() || null,
    email: input.email?.trim() || null,
    notes: encryptClinical(input.notes?.trim() || null),
    cpf: digits(input.cpf),
    birthDate: parseBirthDate(input.birthDate),
    gender: input.gender?.trim() || null,
    profession: input.profession?.trim() || null,
    maritalStatus: input.maritalStatus?.trim() || null,
    zipCode: digits(input.zipCode),
    street: input.street?.trim() || null,
    addressNumber: input.addressNumber?.trim() || null,
    complement: input.complement?.trim() || null,
    district: input.district?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim()?.toUpperCase() || null,
    emergencyName: input.emergencyName?.trim() || null,
    emergencyPhone: digits(input.emergencyPhone),
    emergencyRelation: input.emergencyRelation?.trim() || null,
    insuranceName: input.insuranceName?.trim() || null,
    insuranceNumber: input.insuranceNumber?.trim() || null,
    insurancePlan: input.insurancePlan?.trim() || null,
    financialName: input.financialName?.trim() || null,
    financialCpf: digits(input.financialCpf),
    financialPhone: digits(input.financialPhone),
    financialRelation: input.financialRelation?.trim() || null,
  };
}

export function mapPatientDetail(p: {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  notes: string | null;
  cpf: string | null;
  birthDate: Date | null;
  gender: string | null;
  profession: string | null;
  maritalStatus: string | null;
  photoPath: string | null;
  zipCode: string | null;
  street: string | null;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  insuranceName: string | null;
  insuranceNumber: string | null;
  insurancePlan: string | null;
  financialName: string | null;
  financialCpf: string | null;
  financialPhone: string | null;
  financialRelation: string | null;
  createdAt: Date;
  updatedAt: Date;
  documents?: {
    id: string;
    kind: PatientDocumentKind;
    title: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }[];
}) {
  return {
    id: p.id,
    phone: p.phone,
    name: p.name,
    email: p.email,
    notes: decryptClinical(p.notes),
    cpf: p.cpf,
    birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null,
    gender: p.gender,
    profession: p.profession,
    maritalStatus: p.maritalStatus,
    hasPhoto: Boolean(p.photoPath),
    zipCode: p.zipCode,
    street: p.street,
    addressNumber: p.addressNumber,
    complement: p.complement,
    district: p.district,
    city: p.city,
    state: p.state,
    emergencyName: p.emergencyName,
    emergencyPhone: p.emergencyPhone,
    emergencyRelation: p.emergencyRelation,
    insuranceName: p.insuranceName,
    insuranceNumber: p.insuranceNumber,
    insurancePlan: p.insurancePlan,
    financialName: p.financialName,
    financialCpf: p.financialCpf,
    financialPhone: p.financialPhone,
    financialRelation: p.financialRelation,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    documents: (p.documents ?? []).map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      fileName: d.fileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

export async function createPatient(clinicId: string, input: PatientWriteInput) {
  const data = toWriteData(input);
  if (data.phone.length < 8) throw new PatientError("Telefone inválido", 422);

  const existing = await prisma.patient.findUnique({
    where: { clinicId_phone: { clinicId, phone: data.phone } },
  });
  if (existing) {
    throw new PatientError("Já existe paciente com este telefone", 409);
  }

  if (data.cpf) {
    const cpfTaken = await prisma.patient.findFirst({
      where: { clinicId, cpf: data.cpf },
    });
    if (cpfTaken) throw new PatientError("CPF já cadastrado nesta clínica", 409);
  }

  const created = await prisma.patient.create({
    data: { clinicId, ...data },
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });
  return mapPatientDetail(created);
}

export async function updatePatient(
  clinicId: string,
  id: string,
  input: PatientWriteInput,
) {
  const current = await prisma.patient.findFirst({
    where: { id, clinicId },
  });
  if (!current) throw new PatientError("Paciente não encontrado", 404);

  const data = toWriteData(input);
  if (data.phone.length < 8) throw new PatientError("Telefone inválido", 422);

  if (data.phone !== current.phone) {
    const phoneTaken = await prisma.patient.findUnique({
      where: { clinicId_phone: { clinicId, phone: data.phone } },
    });
    if (phoneTaken) {
      throw new PatientError("Já existe paciente com este telefone", 409);
    }
  }

  if (data.cpf && data.cpf !== current.cpf) {
    const cpfTaken = await prisma.patient.findFirst({
      where: { clinicId, cpf: data.cpf, id: { not: id } },
    });
    if (cpfTaken) throw new PatientError("CPF já cadastrado nesta clínica", 409);
  }

  const updated = await prisma.patient.update({
    where: { id },
    data,
    include: { documents: { orderBy: { createdAt: "desc" } } },
  });
  return mapPatientDetail(updated);
}

export type PatientTimelineKind =
  | "first_session"
  | "session"
  | "payment"
  | "report"
  | "document"
  | "registered";

export type PatientTimelineEvent = {
  id: string;
  kind: PatientTimelineKind;
  title: string;
  subtitle: string | null;
  at: string;
  status: string | null;
  href: string | null;
  meta?: { amountCents?: number; fileName?: string };
};

function buildPatientTimeline(patient: {
  id: string;
  createdAt: Date;
  appointments: {
    id: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    notes: string | null;
    professional: { name: string };
    service: { name: string };
  }[];
  clinicalRecords: {
    id: string;
    status: string;
    updatedAt: Date;
    confirmedAt: Date | null;
    createdAt: Date;
    professional: { name: string };
  }[];
  payments: {
    id: string;
    status: string;
    amountCents: number;
    createdAt: Date;
    paidAt: Date | null;
  }[];
  documents: {
    id: string;
    kind: PatientDocumentKind;
    title: string;
    fileName: string;
    createdAt: Date;
  }[];
}): PatientTimelineEvent[] {
  const events: PatientTimelineEvent[] = [
    {
      id: `registered-${patient.id}`,
      kind: "registered",
      title: "Cadastro",
      subtitle: "Paciente cadastrado na clínica",
      at: patient.createdAt.toISOString(),
      status: null,
      href: null,
    },
  ];

  const sessionsAsc = [...patient.appointments].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const firstSessionId = sessionsAsc.find((a) => a.status !== "cancelled")?.id;

  for (const a of patient.appointments) {
    const isFirst = a.id === firstSessionId;
    const cancelled = a.status === "cancelled";
    events.push({
      id: `appointment-${a.id}`,
      kind: isFirst ? "first_session" : "session",
      title: cancelled
        ? "Sessão cancelada"
        : isFirst
          ? "Primeira consulta"
          : "Sessão",
      subtitle: `${a.service.name} · ${a.professional.name}`,
      at: a.startsAt.toISOString(),
      status: a.status,
      href: `/agenda?appointment=${a.id}`,
    });
  }

  for (const r of patient.clinicalRecords) {
    const confirmed = r.status === "confirmed";
    events.push({
      id: `clinical-${r.id}`,
      kind: "report",
      title: confirmed ? "Relatório" : "Rascunho de evolução",
      subtitle: r.professional.name,
      at: (r.confirmedAt ?? r.updatedAt).toISOString(),
      status: r.status,
      href: `/prontuarios?id=${r.id}`,
    });
  }

  for (const p of patient.payments) {
    events.push({
      id: `payment-${p.id}`,
      kind: "payment",
      title: "Pagamento",
      subtitle:
        p.status === "paid"
          ? "Recebido"
          : p.status === "cancelled"
            ? "Cancelado"
            : "Pendente",
      at: (p.paidAt ?? p.createdAt).toISOString(),
      status: p.status,
      href: "/financeiro",
      meta: { amountCents: p.amountCents },
    });
  }

  for (const d of patient.documents) {
    const label =
      d.kind === "document"
        ? "Documento"
        : d.kind === "photo"
          ? "Foto"
          : "Anexo";
    events.push({
      id: `document-${d.id}`,
      kind: "document",
      title: label,
      subtitle: d.title,
      at: d.createdAt.toISOString(),
      status: d.kind,
      href: null,
      meta: { fileName: d.fileName },
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export async function getPatientDetail(
  clinicId: string,
  id: string,
  scopedProfessionalId?: string,
) {
  const patient = await prisma.patient.findFirst({
    where: { id, clinicId },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      appointments: {
        orderBy: { startsAt: "desc" },
        take: 100,
        include: {
          professional: true,
          service: true,
        },
      },
      clinicalRecords: {
        where: {
          deletedAt: null,
          ...(scopedProfessionalId
            ? { professionalId: scopedProfessionalId }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { professional: true },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });
  if (!patient) throw new PatientError("Paciente não encontrado", 404);

  const history = {
    appointments: patient.appointments.map((a) => ({
      id: a.id,
      status: a.status,
      start: a.startsAt.toISOString(),
      end: a.endsAt.toISOString(),
      service: a.service.name,
      professional: a.professional.name,
      notes: a.notes,
    })),
    clinicalRecords: patient.clinicalRecords.map((r) => ({
      id: r.id,
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      professional: r.professional.name,
    })),
    payments: patient.payments.map((p) => ({
      id: p.id,
      status: p.status,
      amountCents: p.amountCents,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
    })),
  };

  return {
    ...mapPatientDetail(patient),
    history,
    timeline: buildPatientTimeline(patient),
  };
}

export async function savePatientFile(input: {
  clinicId: string;
  patientId: string;
  kind: PatientDocumentKind;
  title: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  asProfilePhoto?: boolean;
}) {
  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, clinicId: input.clinicId },
  });
  if (!patient) throw new PatientError("Paciente não encontrado", 404);

  const dir = path.join(UPLOAD_ROOT, input.patientId);
  await mkdir(dir, { recursive: true });
  const safeName = input.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  const stored = `${randomUUID()}_${safeName}`;
  const storagePath = path.join(dir, stored);
  await writeFile(storagePath, input.buffer);

  const relative = path.relative(path.resolve(process.cwd()), storagePath);

  if (input.asProfilePhoto || input.kind === PatientDocumentKind.photo) {
    if (patient.photoPath) {
      try {
        await unlink(path.resolve(process.cwd(), patient.photoPath));
      } catch {
        /* ignore */
      }
    }
    await prisma.patient.update({
      where: { id: patient.id },
      data: { photoPath: relative },
    });
  }

  const doc = await prisma.patientDocument.create({
    data: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      kind: input.kind,
      title: input.title.trim() || input.fileName,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      storagePath: relative,
    },
  });

  return {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function getPatientDocumentFile(
  clinicId: string,
  patientId: string,
  documentId: string,
) {
  const doc = await prisma.patientDocument.findFirst({
    where: { id: documentId, patientId, clinicId },
  });
  if (!doc) throw new PatientError("Arquivo não encontrado", 404);
  return doc;
}

export async function deletePatientDocument(
  clinicId: string,
  patientId: string,
  documentId: string,
) {
  const doc = await prisma.patientDocument.findFirst({
    where: { id: documentId, patientId, clinicId },
  });
  if (!doc) throw new PatientError("Arquivo não encontrado", 404);
  try {
    await unlink(path.resolve(process.cwd(), doc.storagePath));
  } catch {
    /* ignore missing file */
  }
  await prisma.patientDocument.delete({ where: { id: doc.id } });

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { photoPath: true },
  });
  if (patient?.photoPath === doc.storagePath) {
    await prisma.patient.update({
      where: { id: patientId },
      data: { photoPath: null },
    });
  }
  return { ok: true };
}

export async function getPatientPhotoPath(clinicId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { photoPath: true },
  });
  if (!patient?.photoPath) throw new PatientError("Foto não encontrada", 404);

  const doc = await prisma.patientDocument.findFirst({
    where: { patientId, storagePath: patient.photoPath },
    select: { mimeType: true },
  });

  return {
    path: patient.photoPath,
    mimeType: doc?.mimeType || "image/jpeg",
  };
}
