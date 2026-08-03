import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ClinicBillingInfo, Reminder } from "../api/types";
import { getStoredUser } from "../lib/auth";
import { formatShortDay, formatTime } from "../lib/dates";

export { FinancePage } from "./FinancePage";
export { SessionsPage } from "./SessionsPage";
export { ReportsPage } from "./ReportsPage";

export function SettingsPage() {
  const stored = getStoredUser();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [channels, setChannels] = useState<{
    whatsapp: boolean;
    email: boolean;
    emailConfigured: boolean;
  } | null>(null);
  const [billing, setBilling] = useState<ClinicBillingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [rem, bill] = await Promise.all([
          api.reminders(),
          api.billing(),
        ]);
        setReminders(rem.items);
        setChannels(rem.channels ?? null);
        setBilling(bill);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      }
    })();
  }, []);

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

  return (
    <div className="settings-page" style={{ display: "grid", gap: "1.25rem" }}>
      {error ? <p className="banner err">{error}</p> : null}

      <div className="card pad">
        <h2 className="card-title" style={{ marginTop: 0 }}>
          Preferências
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          A agenda da clínica é a fonte da verdade (sessões e bloqueios). Ajuste
          aqui lembretes de confirmação e cobrança — sem conteúdo clínico
          sensível.
        </p>
      </div>

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
        {info ? <p className="banner ok">{info}</p> : null}
      </div>
    </div>
  );
}
