import { ClinicalAuditAction, Prisma } from "@prisma/client";
import { prisma } from "../infra/prisma.js";

export type ClinicalAuditActor = {
  staffUserId?: string | null;
  professionalId?: string | null;
  ip?: string | null;
};

export async function writeClinicalAudit(input: {
  clinicId: string;
  recordId: string;
  patientId: string;
  action: ClinicalAuditAction;
  actor?: ClinicalAuditActor;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.clinicalAuditLog.create({
      data: {
        clinicId: input.clinicId,
        recordId: input.recordId,
        patientId: input.patientId,
        professionalId: input.actor?.professionalId ?? null,
        staffUserId: input.actor?.staffUserId ?? null,
        action: input.action,
        meta:
          input.meta === undefined || input.meta === null
            ? Prisma.JsonNull
            : (input.meta as Prisma.InputJsonValue),
        ip: input.actor?.ip?.slice(0, 64) ?? null,
      },
    });
  } catch (err) {
    // Auditoria não deve derrubar o fluxo clínico
    console.error("clinical.audit.write_failed", err);
  }
}

export async function listClinicalAuditLogs(input: {
  clinicId: string;
  recordId: string;
  /** Quando definido, só registros deste profissional. */
  scopedProfessionalId?: string;
  limit?: number;
}) {
  if (input.scopedProfessionalId) {
    const owned = await prisma.clinicalRecord.findFirst({
      where: {
        id: input.recordId,
        clinicId: input.clinicId,
        professionalId: input.scopedProfessionalId,
      },
      select: { id: true },
    });
    if (!owned) return [];
  }

  const items = await prisma.clinicalAuditLog.findMany({
    where: {
      clinicId: input.clinicId,
      recordId: input.recordId,
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 100,
  });

  return items.map((row) => ({
    id: row.id,
    action: row.action,
    staffUserId: row.staffUserId,
    professionalId: row.professionalId,
    meta: row.meta,
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
  }));
}
