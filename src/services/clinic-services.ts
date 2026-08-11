import { prisma } from "../infra/prisma.js";

export class ClinicServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

function mapService(s: {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
  active: boolean;
  professionals?: { professionalId: string; professional: { id: string; name: string } }[];
}) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents,
    active: s.active,
    professionalIds: (s.professionals ?? []).map((p) => p.professionalId),
    professionals: (s.professionals ?? []).map((p) => ({
      id: p.professional.id,
      name: p.professional.name,
    })),
  };
}

export async function listClinicServices(
  clinicId: string,
  opts?: { includeInactive?: boolean },
) {
  const items = await prisma.service.findMany({
    where: {
      clinicId,
      ...(opts?.includeInactive ? {} : { active: true }),
    },
    include: {
      professionals: {
        include: { professional: { select: { id: true, name: true } } },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return items.map(mapService);
}

export async function createClinicService(input: {
  clinicId: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents?: number | null;
  professionalIds?: string[];
}) {
  const name = input.name.trim();
  if (name.length < 2) {
    throw new ClinicServiceError("Informe o nome do serviço", 400);
  }
  if (input.durationMinutes < 15 || input.durationMinutes > 240) {
    throw new ClinicServiceError("Duração deve ser entre 15 e 240 minutos", 400);
  }
  if (input.priceCents != null && input.priceCents < 0) {
    throw new ClinicServiceError("Valor inválido", 400);
  }

  let professionalIds = input.professionalIds?.filter(Boolean) ?? [];
  if (professionalIds.length === 0) {
    const pros = await prisma.professional.findMany({
      where: { clinicId: input.clinicId, active: true },
      select: { id: true },
    });
    professionalIds = pros.map((p) => p.id);
  } else {
    const valid = await prisma.professional.count({
      where: {
        clinicId: input.clinicId,
        active: true,
        id: { in: professionalIds },
      },
    });
    if (valid !== professionalIds.length) {
      throw new ClinicServiceError("Profissional inválido para esta clínica", 400);
    }
  }

  if (professionalIds.length === 0) {
    throw new ClinicServiceError(
      "Seu perfil profissional ainda não está pronto. Saia e entre de novo no painel, ou contate o suporte.",
      422,
    );
  }

  const created = await prisma.service.create({
    data: {
      clinicId: input.clinicId,
      name,
      description: input.description?.trim() || null,
      durationMinutes: input.durationMinutes,
      priceCents: input.priceCents ?? null,
      active: true,
      professionals: {
        create: professionalIds.map((professionalId) => ({ professionalId })),
      },
    },
    include: {
      professionals: {
        include: { professional: { select: { id: true, name: true } } },
      },
    },
  });

  return mapService(created);
}

export async function updateClinicService(input: {
  clinicId: string;
  serviceId: string;
  name?: string;
  description?: string | null;
  durationMinutes?: number;
  priceCents?: number | null;
  active?: boolean;
  professionalIds?: string[];
}) {
  const existing = await prisma.service.findFirst({
    where: { id: input.serviceId, clinicId: input.clinicId },
  });
  if (!existing) throw new ClinicServiceError("Serviço não encontrado", 404);

  if (input.durationMinutes != null) {
    if (input.durationMinutes < 15 || input.durationMinutes > 240) {
      throw new ClinicServiceError("Duração deve ser entre 15 e 240 minutos", 400);
    }
  }
  if (input.priceCents != null && input.priceCents < 0) {
    throw new ClinicServiceError("Valor inválido", 400);
  }

  if (input.professionalIds) {
    const professionalIds = input.professionalIds.filter(Boolean);
    if (professionalIds.length === 0) {
      throw new ClinicServiceError("Vincule ao menos um profissional", 400);
    }
    const valid = await prisma.professional.count({
      where: {
        clinicId: input.clinicId,
        active: true,
        id: { in: professionalIds },
      },
    });
    if (valid !== professionalIds.length) {
      throw new ClinicServiceError("Profissional inválido para esta clínica", 400);
    }
    await prisma.serviceProfessional.deleteMany({
      where: { serviceId: existing.id },
    });
    await prisma.serviceProfessional.createMany({
      data: professionalIds.map((professionalId) => ({
        serviceId: existing.id,
        professionalId,
      })),
    });
  }

  const updated = await prisma.service.update({
    where: { id: existing.id },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.durationMinutes != null
        ? { durationMinutes: input.durationMinutes }
        : {}),
      ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
      ...(input.active != null ? { active: input.active } : {}),
    },
    include: {
      professionals: {
        include: { professional: { select: { id: true, name: true } } },
      },
    },
  });

  return mapService(updated);
}
