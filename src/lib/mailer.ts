import { Resend } from "resend";
import { env } from "../config/env.js";
import { escapeHtml } from "./html.js";

export type ReminderEmailInput = {
  to: string;
  patientName: string;
  clinicName: string;
  whenLabel: string;
  confirmUrl: string;
  rescheduleUrl: string;
  kind: "confirmation" | "payment";
  amountLabel?: string;
};

/** Resend com API key — usado por cadastro e lembretes. */
export function isResendConfigured() {
  return Boolean(env().RESEND_API_KEY?.trim());
}

/** Lembretes de sessão: Resend + flag REMINDER_EMAIL_ENABLED. */
export function isEmailConfigured() {
  return isResendConfigured() && env().REMINDER_EMAIL_ENABLED;
}

export async function sendReminderEmail(input: ReminderEmailInput) {
  if (!isEmailConfigured()) {
    return {
      skipped: true as const,
      reason: isResendConfigured()
        ? "REMINDER_EMAIL_ENABLED=false"
        : "RESEND_API_KEY não configurada",
    };
  }

  const resend = new Resend(env().RESEND_API_KEY);
  const firstName =
    input.patientName.trim().split(/\s+/)[0] || "olá";
  const greeting = `Olá ${escapeHtml(firstName)}.`;

  const bodyText =
    input.kind === "payment"
      ? `${greeting}\n\nVocê tem um valor pendente de ${input.amountLabel ?? ""}.\nSua sessão: ${input.whenLabel}.\n\nConfirme o pagamento com a clínica ou responda pelo WhatsApp.`
      : `${greeting}\n\nSua sessão será ${input.whenLabel}.\n\nClique para confirmar.\n\nConfirmar: ${input.confirmUrl}\nRemarcar: ${input.rescheduleUrl}`;

  const html =
    input.kind === "payment"
      ? `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1e293b;max-width:480px">
  <p style="font-size:16px;margin:0 0 12px">${greeting}</p>
  <p style="margin:0 0 8px">Você tem um valor pendente de <strong>${escapeHtml(input.amountLabel ?? "")}</strong>.</p>
  <p style="margin:0 0 16px">Sessão: ${escapeHtml(input.whenLabel)}.</p>
  <p style="color:#64748b;font-size:13px;margin:0">Fale conosco pelo WhatsApp para regularizar.</p>
</div>`
      : `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1e293b;max-width:480px">
  <p style="font-size:16px;margin:0 0 12px">${greeting}</p>
  <p style="margin:0 0 8px">Sua sessão será <strong>${escapeHtml(input.whenLabel)}</strong>.</p>
  <p style="margin:0 0 20px">Clique para confirmar.</p>
  <p style="margin:0 0 10px">
    <a href="${escapeHtml(input.confirmUrl)}" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Confirmar</a>
  </p>
  <p style="margin:0">
    <a href="${escapeHtml(input.rescheduleUrl)}" style="display:inline-block;background:#eff6ff;color:#1d4ed8;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Remarcar</a>
  </p>
  <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">${escapeHtml(input.clinicName)}</p>
</div>`;

  const subject =
    input.kind === "payment"
      ? `${input.clinicName}: pagamento pendente`
      : `${input.clinicName}: confirme sua sessão`;

  const result = await resend.emails.send({
    from: env().RESEND_FROM,
    to: input.to,
    subject,
    text: bodyText,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { skipped: false as const, id: result.data?.id ?? null };
}

export type SignupSetupEmailInput = {
  to: string;
  setupUrl: string;
  planName: string;
};

export async function sendSignupSetupEmail(input: SignupSetupEmailInput) {
  // Cadastro NÃO depende de REMINDER_EMAIL_ENABLED — só da API key do Resend.
  if (!isResendConfigured()) {
    return { skipped: true as const, reason: "RESEND_API_KEY não configurada" };
  }

  const resend = new Resend(env().RESEND_API_KEY);
  const subject = `Finalize seu cadastro — ${input.planName}`;
  const text = `Olá.\n\nSeu pagamento da assinatura ${input.planName} foi confirmado.\n\nFinalize seu cadastro neste link (válido por 7 dias):\n${input.setupUrl}\n\nSe você não solicitou esta assinatura, ignore este e-mail.`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1e293b;max-width:480px">
  <p style="font-size:16px;margin:0 0 12px">Olá.</p>
  <p style="margin:0 0 8px">Seu pagamento da assinatura <strong>${escapeHtml(input.planName)}</strong> foi confirmado.</p>
  <p style="margin:0 0 20px">Clique para finalizar o cadastro do consultório (nome completo, clínica e senha).</p>
  <p style="margin:0 0 10px">
    <a href="${escapeHtml(input.setupUrl)}" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Finalizar cadastro</a>
  </p>
  <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">Link válido por 7 dias. Se você não solicitou esta assinatura, ignore este e-mail.</p>
</div>`;

  const result = await resend.emails.send({
    from: env().RESEND_FROM,
    to: input.to,
    subject,
    text,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { skipped: false as const, id: result.data?.id ?? null };
}

export type StaffInviteEmailInput = {
  to: string;
  inviteUrl: string;
  clinicName: string;
  inviteeName: string;
};

export async function sendStaffInviteEmail(input: StaffInviteEmailInput) {
  if (!isResendConfigured()) {
    return { skipped: true as const, reason: "RESEND_API_KEY não configurada" };
  }

  const resend = new Resend(env().RESEND_API_KEY);
  const first = input.inviteeName.trim().split(/\s+/)[0] || "olá";
  const subject = `Convite — ${input.clinicName}`;
  const text = `Olá ${first}.\n\nVocê foi convidado(a) para o painel de ${input.clinicName}.\n\nDefina sua senha neste link (válido por 7 dias):\n${input.inviteUrl}\n\nSe você não esperava este convite, ignore este e-mail.`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1e293b;max-width:480px">
  <p style="font-size:16px;margin:0 0 12px">Olá ${escapeHtml(first)}.</p>
  <p style="margin:0 0 8px">Você foi convidado(a) para o painel de <strong>${escapeHtml(input.clinicName)}</strong>.</p>
  <p style="margin:0 0 20px">Clique para definir sua senha e acessar.</p>
  <p style="margin:0 0 10px">
    <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Aceitar convite</a>
  </p>
  <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">Link válido por 7 dias. Se você não esperava este convite, ignore este e-mail.</p>
</div>`;

  const result = await resend.emails.send({
    from: env().RESEND_FROM,
    to: input.to,
    subject,
    text,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { skipped: false as const, id: result.data?.id ?? null };
}

export type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  clinicName: string;
};

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  if (!isResendConfigured()) {
    return { skipped: true as const, reason: "RESEND_API_KEY não configurada" };
  }

  const resend = new Resend(env().RESEND_API_KEY);
  const subject = `Redefinir senha — ${input.clinicName}`;
  const text = `Olá.\n\nRecebemos um pedido para redefinir a senha do painel de ${input.clinicName}.\n\nUse este link (válido por 2 horas):\n${input.resetUrl}\n\nSe você não pediu isso, ignore este e-mail.`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1e293b;max-width:480px">
  <p style="font-size:16px;margin:0 0 12px">Olá.</p>
  <p style="margin:0 0 8px">Recebemos um pedido para redefinir a senha do painel de <strong>${escapeHtml(input.clinicName)}</strong>.</p>
  <p style="margin:0 0 20px">Clique para escolher uma nova senha.</p>
  <p style="margin:0 0 10px">
    <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#14b8a6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Redefinir senha</a>
  </p>
  <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">Link válido por 2 horas. Se você não pediu isso, ignore este e-mail.</p>
</div>`;

  const result = await resend.emails.send({
    from: env().RESEND_FROM,
    to: input.to,
    subject,
    text,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { skipped: false as const, id: result.data?.id ?? null };
}
