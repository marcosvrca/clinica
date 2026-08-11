import { prisma } from "../infra/prisma.js";

const DEFAULT_HOURS = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
  { weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
]);

/**
 * Garante que o staff (em geral o admin dono) tenha um Professional
 * vinculado — modelo solo-first: a conta já atende sozinha.
 */
export async function ensureOwnerProfessional(input: {
  clinicId: string;
  staffUserId: string;
}) {
  const user = await prisma.staffUser.findFirst({
    where: {
      id: input.staffUserId,
      clinicId: input.clinicId,
      active: true,
    },
  });
  if (!user) return null;

  if (user.professionalId) {
    const linked = await prisma.professional.findFirst({
      where: { id: user.professionalId, clinicId: input.clinicId },
    });
    if (linked) {
      if (!linked.active) {
        return prisma.professional.update({
          where: { id: linked.id },
          data: { active: true },
        });
      }
      return linked;
    }
  }

  // Admin sem vínculo: reaproveita o único profissional da clínica, se houver
  if (user.role === "admin") {
    const existing = await prisma.professional.findMany({
      where: { clinicId: input.clinicId },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    if (existing.length === 1) {
      const only = existing[0]!;
      await prisma.staffUser.update({
        where: { id: user.id },
        data: { professionalId: only.id },
      });
      if (!only.active) {
        return prisma.professional.update({
          where: { id: only.id },
          data: { active: true },
        });
      }
      return only;
    }
  }

  // Cria profissional do dono (admin) ou do próprio staff se a clínica está vazia
  const activeCount = await prisma.professional.count({
    where: { clinicId: input.clinicId, active: true },
  });
  if (user.role !== "admin" && activeCount > 0) {
    return null;
  }

  const professional = await prisma.professional.create({
    data: {
      clinicId: input.clinicId,
      name: user.name,
      specialty: "Psicologia",
      color: "#14b8a6",
      active: true,
    },
  });

  const hoursCount = await prisma.weeklyHour.count({
    where: { professionalId: professional.id },
  });
  if (hoursCount === 0) {
    await prisma.weeklyHour.createMany({
      data: DEFAULT_HOURS.map((h) => ({
        ...h,
        professionalId: professional.id,
      })),
    });
  }

  await prisma.staffUser.update({
    where: { id: user.id },
    data: { professionalId: professional.id },
  });

  return professional;
}

export async function createClinicProfessional(input: {
  clinicId: string;
  name: string;
  specialty?: string;
  crp?: string | null;
  color?: string;
}) {
  const name = input.name.trim();
  if (name.length < 2) {
    throw Object.assign(new Error("Informe o nome do profissional"), {
      statusCode: 400,
    });
  }

  const professional = await prisma.professional.create({
    data: {
      clinicId: input.clinicId,
      name,
      specialty: input.specialty?.trim() || "Psicologia",
      crp: input.crp?.trim() || null,
      color: input.color?.trim() || "#14b8a6",
      active: true,
    },
  });

  await prisma.weeklyHour.createMany({
    data: DEFAULT_HOURS.map((h) => ({
      ...h,
      professionalId: professional.id,
    })),
  });

  return professional;
}
