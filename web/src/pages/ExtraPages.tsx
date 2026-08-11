import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type {
  ClinicBillingInfo,
  Professional,
  Reminder,
  StaffMember,
} from "../api/types";
import { getStoredUser } from "../lib/auth";
import { formatShortDay, formatTime } from "../lib/dates";

export { FinancePage } from "./FinancePage";
export { SessionsPage } from "./SessionsPage";
export { ReportsPage } from "./ReportsPage";

export function SettingsPage() {
  const stored = getStoredUser();
  const isAdmin = stored?.role === "admin";
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [channels, setChannels] = useState<{
    whatsapp: boolean;
    email: boolean;
    emailConfigured: boolean;
  } | null>(null);
  const [billing, setBilling] = useState<ClinicBillingInfo | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "professional">(
    "professional",
  );
  const [inviteProfessionalId, setInviteProfessionalId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteUrlHint, setInviteUrlHint] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function reloadStaff() {
    if (!isAdmin) return;
    const res = await api.staffList();
    setStaff(res.items);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [rem, bill, pros] = await Promise.all([
          api.reminders(),
          api.billing(),
          api.professionals(),
        ]);
        setReminders(rem.items);
        setChannels(rem.channels ?? null);
        setBilling(bill);
        setProfessionals(pros.items);
        if (isAdmin) {
          const s = await api.staffList();
          setStaff(s.items);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      }
    })();
  }, [isAdmin]);

  async function runReminders() {
    setInfo(null);
    setError(null);
    try {
      const res = await api.dispatchReminders();
      setInfo(
        `Processados: ${res.emailed} enviados, ${res.skipped} ignorados, ${res.failed} falhas.`,
      );
      const rem = await api.reminders();
      setReminders(rem.items);
      setChannels(rem.channels ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar");
    }
  }

  async function cancelSubscription() {
    if (
      !window.confirm(
        "Cancelar a assinatura mensal no Mercado Pago? O acesso poderá ser bloqueado.",
      )
    ) {
      return;
    }
    setCancelling(true);
    setError(null);
    setInfo(null);
    try {
      await api.cancelBilling();
      const bill = await api.billing();
      setBilling(bill);
      setInfo("Assinatura cancelada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar");
    } finally {
      setCancelling(false);
    }
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setInfo(null);
    setInviteUrlHint(null);
    try {
      const res = await api.staffInvite({
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
        professionalId: inviteProfessionalId || null,
      });
      setInviteEmail("");
      setInviteName("");
      setInviteRole("professional");
      setInviteProfessionalId("");
      setInfo(
        res.emailSkipped
          ? `Convite criado. E-mail não enviado (${res.emailSkipReason ?? "sem Resend"}).`
          : "Convite enviado por e-mail.",
      );
      if (res.inviteUrl) setInviteUrlHint(res.inviteUrl);
      await reloadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao convidar");
    } finally {
      setInviting(false);
    }
  }

  async function toggleStaffActive(member: StaffMember) {
    setError(null);
    setInfo(null);
    try {
      await api.staffSetActive(member.id, !member.active);
      await reloadStaff();
      setInfo(member.active ? "Usuário desativado." : "Usuário reativado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar");
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      setError("As novas senhas não coincidem.");
      return;
    }
    setChangingPassword(true);
    setError(null);
    setInfo(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      setInfo("Senha atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao trocar senha");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="settings-page" style={{ display: "grid", gap: "1.25rem" }}>
      {error ? <p className="banner err">{error}</p> : null}
      {info ? <p className="banner ok">{info}</p> : null}

      <div className="card pad">
        <h2 className="card-title" style={{ marginTop: 0 }}>
          Preferências
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          A agenda da clínica é a fonte da verdade (sessões e bloqueios). Ajuste
          aqui equipe, senha, lembretes e cobrança — sem conteúdo clínico
          sensível.
        </p>
      </div>

      <div className="card pad">
        <h3 className="card-title sm">Minha senha</h3>
        <form
          onSubmit={onChangePassword}
          style={{ display: "grid", gap: "0.75rem", maxWidth: 360 }}
        >
          <label className="field-block">
            <span>Senha atual</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="field-block">
            <span>Nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="field-block">
            <span>Confirmar nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <button
            type="submit"
            className="btn teal"
            disabled={changingPassword}
            style={{ justifySelf: "start" }}
          >
            {changingPassword ? "Salvando…" : "Alterar senha"}
          </button>
        </form>
      </div>

      {isAdmin ? (
        <div className="card pad">
          <h3 className="card-title sm">Equipe</h3>
          <p className="muted" style={{ fontSize: "0.875rem", marginTop: 0 }}>
            Convide profissionais por e-mail. Eles definem a senha pelo link
            (7 dias).
          </p>
          <ul className="catalog-list">
            {staff.length === 0 ? (
              <li className="muted">Nenhum usuário listado.</li>
            ) : (
              staff.map((m) => (
                <li key={m.id}>
                  <div>
                    <strong>
                      {m.name} · {m.email}
                    </strong>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>
                      {m.role}
                      {m.pendingInvite ? " · convite pendente" : ""}
                      {!m.active ? " · inativo" : ""}
                      {m.professional ? ` · ${m.professional.name}` : ""}
                    </div>
                  </div>
                  {m.id !== stored?.id ? (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void toggleStaffActive(m)}
                    >
                      {m.active ? "Desativar" : "Reativar"}
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>

          <form
            onSubmit={onInvite}
            style={{
              display: "grid",
              gap: "0.75rem",
              marginTop: "1rem",
              maxWidth: 420,
            }}
          >
            <label className="field-block">
              <span>Nome</span>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                required
                minLength={2}
              />
            </label>
            <label className="field-block">
              <span>E-mail</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </label>
            <label className="field-block">
              <span>Perfil</span>
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "admin" | "professional")
                }
              >
                <option value="professional">Profissional</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <label className="field-block">
              <span>Vincular profissional (opcional)</span>
              <select
                value={inviteProfessionalId}
                onChange={(e) => setInviteProfessionalId(e.target.value)}
              >
                <option value="">—</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn teal"
              disabled={inviting}
              style={{ justifySelf: "start" }}
            >
              {inviting ? "Convidando…" : "Enviar convite"}
            </button>
          </form>
          {inviteUrlHint ? (
            <p
              className="muted"
              style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}
            >
              Link do convite (dev / e-mail não enviado):{" "}
              <a href={inviteUrlHint}>{inviteUrlHint}</a>
            </p>
          ) : null}
        </div>
      ) : null}

      {billing?.hasSubscription && !billing.complimentary ? (
        <div className="card pad">
          <h3 className="card-title sm">Assinatura do painel</h3>
          <p className="muted" style={{ fontSize: "0.875rem", marginTop: 0 }}>
            Status: <strong>{billing.billingStatus}</strong>
            {billing.currentPeriodEnd
              ? ` · vigência até ${formatShortDay(billing.currentPeriodEnd)}`
              : ""}
          </p>
          {stored?.role === "admin" &&
          billing.billingStatus !== "cancelled" ? (
            <button
              type="button"
              className="btn ghost"
              disabled={cancelling}
              onClick={() => void cancelSubscription()}
            >
              {cancelling ? "Cancelando…" : "Cancelar assinatura"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="card pad">
        <h3 className="card-title sm">Cobranças e lembretes</h3>
        <p className="muted" style={{ fontSize: "0.875rem", marginTop: 0 }}>
          Mensagens objetivas via WhatsApp/e-mail.
          {channels
            ? ` Canais: WhatsApp ${channels.whatsapp ? "on" : "off"} · E-mail ${
                channels.emailConfigured ? "configurado" : "sem API key"
              }.`
            : ""}
        </p>
        <ul className="catalog-list">
          {reminders.length === 0 ? (
            <li className="muted">Nenhum lembrete na fila.</li>
          ) : (
            reminders.slice(0, 12).map((r) => (
              <li key={r.id}>
                <div>
                  <strong>
                    {r.kind} · {r.patient.name ?? r.patient.phone}
                  </strong>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    Agendado: {formatShortDay(r.scheduledAt)}{" "}
                    {formatTime(r.scheduledAt)}
                    {r.whenLabel ? ` · sessão ${r.whenLabel}` : ""}
                  </div>
                  <div
                    className="muted"
                    style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}
                  >
                    {r.message}
                  </div>
                </div>
                <span
                  className={`status ${
                    r.status === "sent"
                      ? "st-ok"
                      : r.status === "failed"
                        ? "st-warn"
                        : "st-muted"
                  }`}
                >
                  {r.status}
                </span>
              </li>
            ))
          )}
        </ul>
        <div className="row-actions" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="btn teal"
            onClick={() => void runReminders()}
          >
            Processar fila de e-mails
          </button>
        </div>
      </div>
    </div>
  );
}
