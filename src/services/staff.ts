import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { StaffRole } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../infra/prisma.js";
import {
  sendPasswordResetEmail,
  sendStaffInviteEmail,
} from "../lib/mailer.js";

export class StaffError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const RESET_TTL_MS = 2 * 60 * 60_000;

function hashToken(token: string, kind: "invite" | "reset") {
  return createHash("sha256")
    .update(`${token}:${env().JWT_SECRET}:${kind}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function mapStaff(u: {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  active: boolean;
  passwordSetAt: Date | null;
  professionalId: string | null;
  inviteTokenExpiresAt: Date | null;
  createdAt: Date;
  professional?: { id: string; name: string } | null;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    pendingInvite: !u.passwordSetAt,
    inviteExpiresAt: u.inviteTokenExpiresAt?.toISOString() ?? null,
    professionalId: u.professionalId,
    professional: u.professional
      ? { id: u.professional.id, name: u.professional.name }
      : null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listStaff(clinicId: string) {
  const items = await prisma.staffUser.findMany({
    where: { clinicId },
    include: { professional: { select: { id: true, name: true } } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return items.map(mapStaff);
}

export async function inviteStaff(input: {
  clinicId: string;
  email: string;
  name: string;
  role: StaffRole;
  professionalId?: string | null;
}) {
  const email = input.email.toLowerCase().trim();
  const name = input.name.trim();
  if (name.length < 2) throw new StaffError("Informe o nome", 400);
  if (input.role !== "admin" && input.role !== "professional") {
    throw new StaffError("Perfil inválido", 400);
  }

  const elsewhere = await prisma.staffUser.findFirst({
    where: { email, clinicId: { not: input.clinicId }, active: true },
  });
  if (elsewhere) {
    throw new StaffError("Este e-mail já está em uso em outra clínica", 409);
  }

  let professionalId = input.professionalId ?? null;

  if (professionalId) {
    const pro = await prisma.professional.findFirst({
      where: {
        id: professionalId,
        clinicId: input.clinicId,
        active: true,
      },
    });
    if (!pro) throw new StaffError("Profissional não encontrado", 404);
    const taken = await prisma.staffUser.findFirst({
      where: {
        professionalId,
        NOT: { email },
      },
    });
    if (taken) {
      throw new StaffError("Profissional já vinculado a outro usuário", 409);
    }
  } else if (input.role === "professional") {
    // Solo-first: convidar profissional cria o perfil de agenda e consome assento
    const { assertCanAddProfessional, SubscriptionError } = await import(
      "./subscriptions.js"
    );
    try {
      await assertCanAddProfessional(input.clinicId);
    } catch (err) {
      if (err instanceof SubscriptionError) {
        throw new StaffError(err.message, err.statusCode);
      }
      throw err;
    }
    const { createClinicProfessional } = await import(
      "./owner-professional.js"
    );
    const created = await createClinicProfessional({
      clinicId: input.clinicId,
      name,
    });
    professionalId = created.id;
  }

  const token = randomBytes(32).toString("hex");
  const inviteTokenHash = hashToken(token, "invite");
  const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const placeholderHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);

  const existing = await prisma.staffUser.findUnique({
    where: { clinicId_email: { clinicId: input.clinicId, email } },
    include: { clinic: true },
  });

  let user;
  if (existing) {
    if (existing.passwordSetAt && existing.active) {
      throw new StaffError("Já existe usuário ativo com este e-mail", 409);
    }
    user = await prisma.staffUser.update({
      where: { id: existing.id },
      data: {
        name,
        role: input.role,
        professionalId,
        active: false,
        passwordHash: placeholderHash,
        passwordSetAt: null,
        inviteTokenHash,
        inviteTokenExpiresAt,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      },
      include: {
        clinic: true,
        professional: { select: { id: true, name: true } },
      },
    });
  } else {
    user = await prisma.staffUser.create({
      data: {
        clinicId: input.clinicId,
        email,
        name,
        role: input.role,
        professionalId,
        passwordHash: placeholderHash,
        active: false,
        passwordSetAt: null,
        inviteTokenHash,
        inviteTokenExpiresAt,
      },
      include: {
        clinic: true,
        professional: { select: { id: true, name: true } },
      },
    });
  }

  const inviteUrl = `${env().WEB_BASE_URL.replace(/\/$/, "")}/convite?token=${token}`;
  const emailResult = await sendStaffInviteEmail({
    to: email,
    inviteUrl,
    clinicName: user.clinic.name,
    inviteeName: name,
  });

  return {
    user: mapStaff(user),
    inviteUrl:
      emailResult.skipped || env().NODE_ENV !== "production" ? inviteUrl : null,
    emailSkipped: emailResult.skipped,
    emailSkipReason: emailResult.skipped ? emailResult.reason : null,
  };
}

export async function getInviteContext(token: string) {
  const hash = hashToken(token, "invite");
  const user = await prisma.staffUser.findFirst({
    where: { inviteTokenHash: hash },
    include: { clinic: true },
  });
  if (!user || !user.inviteTokenHash || !safeEqualHex(user.inviteTokenHash, hash)) {
    throw new StaffError("Link inválido ou já utilizado", 404);
  }
  if (
    !user.inviteTokenExpiresAt ||
    user.inviteTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new StaffError("Link expirado. Peça um novo convite.", 410);
  }
  return {
    email: user.email,
    name: user.name,
    clinicName: user.clinic.name,
    role: user.role,
    expiresAt: user.inviteTokenExpiresAt.toISOString(),
  };
}

export async function acceptInvite(input: {
  token: string;
  password: string;
  name?: string;
}) {
  if (input.password.length < 8) {
    throw new StaffError("A senha deve ter pelo menos 8 caracteres", 400);
  }
  const hash = hashToken(input.token, "invite");
  const user = await prisma.staffUser.findFirst({
    where: { inviteTokenHash: hash },
    include: { clinic: true },
  });
  if (!user || !user.inviteTokenHash || !safeEqualHex(user.inviteTokenHash, hash)) {
    throw new StaffError("Link inválido ou já utilizado", 404);
  }
  if (
    !user.inviteTokenExpiresAt ||
    user.inviteTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new StaffError("Link expirado. Peça um novo convite.", 410);
  }

  const name = input.name?.trim() || user.name;
  const passwordHash = await bcrypt.hash(input.password, 10);
  const updated = await prisma.staffUser.update({
    where: { id: user.id },
    data: {
      name,
      passwordHash,
      passwordSetAt: new Date(),
      active: true,
      inviteTokenHash: null,
      inviteTokenExpiresAt: null,
    },
    include: { clinic: true },
  });

  return {
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      clinic: { id: updated.clinic.id, name: updated.clinic.name },
    },
  };
}

export async function changePassword(input: {
  userId: string;
  clinicId: string;
  currentPassword: string;
  newPassword: string;
}) {
  if (input.newPassword.length < 8) {
    throw new StaffError("A nova senha deve ter pelo menos 8 caracteres", 400);
  }
  const user = await prisma.staffUser.findFirst({
    where: {
      id: input.userId,
      clinicId: input.clinicId,
      active: true,
    },
  });
  if (!user || !user.passwordSetAt) {
    throw new StaffError("Usuário não encontrado", 404);
  }
  if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new StaffError("Senha atual incorreta", 403);
  }
  await prisma.staffUser.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(input.newPassword, 10),
      passwordSetAt: new Date(),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });
  return { ok: true };
}

export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.toLowerCase().trim();
  const user = await prisma.staffUser.findFirst({
    where: {
      email,
      active: true,
      passwordSetAt: { not: null },
      clinic: { active: true },
    },
    include: { clinic: true },
  });

  // Resposta genérica — não revela se o e-mail existe
  if (!user) {
    return { ok: true as const };
  }

  const token = randomBytes(32).toString("hex");
  const resetTokenHash = hashToken(token, "reset");
  const resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.staffUser.update({
    where: { id: user.id },
    data: { resetTokenHash, resetTokenExpiresAt },
  });

  const resetUrl = `${env().WEB_BASE_URL.replace(/\/$/, "")}/redefinir-senha?token=${token}`;
  await sendPasswordResetEmail({
    to: email,
    resetUrl,
    clinicName: user.clinic.name,
  });

  return {
    ok: true as const,
    resetUrl: env().NODE_ENV !== "production" ? resetUrl : undefined,
  };
}

export async function getResetContext(token: string) {
  const hash = hashToken(token, "reset");
  const user = await prisma.staffUser.findFirst({
    where: { resetTokenHash: hash },
    include: { clinic: true },
  });
  if (!user || !user.resetTokenHash || !safeEqualHex(user.resetTokenHash, hash)) {
    throw new StaffError("Link inválido ou já utilizado", 404);
  }
  if (
    !user.resetTokenExpiresAt ||
    user.resetTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new StaffError("Link expirado. Solicite um novo.", 410);
  }
  return {
    email: user.email,
    clinicName: user.clinic.name,
    expiresAt: user.resetTokenExpiresAt.toISOString(),
  };
}

export async function resetPassword(input: {
  token: string;
  password: string;
}) {
  if (input.password.length < 8) {
    throw new StaffError("A senha deve ter pelo menos 8 caracteres", 400);
  }
  const hash = hashToken(input.token, "reset");
  const user = await prisma.staffUser.findFirst({
    where: { resetTokenHash: hash },
  });
  if (!user || !user.resetTokenHash || !safeEqualHex(user.resetTokenHash, hash)) {
    throw new StaffError("Link inválido ou já utilizado", 404);
  }
  if (
    !user.resetTokenExpiresAt ||
    user.resetTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new StaffError("Link expirado. Solicite um novo.", 410);
  }

  await prisma.staffUser.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(input.password, 10),
      passwordSetAt: new Date(),
      active: true,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });
  return { ok: true };
}

export async function setStaffActive(input: {
  clinicId: string;
  staffId: string;
  active: boolean;
  actorUserId: string;
}) {
  if (input.staffId === input.actorUserId && !input.active) {
    throw new StaffError("Você não pode desativar a própria conta", 422);
  }
  const user = await prisma.staffUser.findFirst({
    where: { id: input.staffId, clinicId: input.clinicId },
    include: { professional: { select: { id: true, name: true } } },
  });
  if (!user) throw new StaffError("Usuário não encontrado", 404);

  if (!input.active && user.role === "admin") {
    const otherAdmins = await prisma.staffUser.count({
      where: {
        clinicId: input.clinicId,
        role: "admin",
        active: true,
        passwordSetAt: { not: null },
        id: { not: user.id },
      },
    });
    if (otherAdmins === 0) {
      throw new StaffError("Mantenha pelo menos um administrador ativo", 422);
    }
  }

  const updated = await prisma.staffUser.update({
    where: { id: user.id },
    data: { active: input.active },
    include: { professional: { select: { id: true, name: true } } },
  });
  return mapStaff(updated);
}
