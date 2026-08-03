import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock3, FileText, Receipt } from "lucide-react";
import { api } from "../api/client";
import type { Appointment, DashboardData } from "../api/types";
import { formatPrice, formatShortDay, formatTime } from "../lib/dates";
import { avatarColor, initials } from "../lib/ui";

function statusLabel(status: string, start: string) {
  const now = Date.now();
  const s = new Date(start).getTime();
  if (status === "confirmed" && s <= now && s + 50 * 60_000 > now) {
    return { text: "Em andamento", className: "st-progress" };
  }
  if (status === "confirmed") return { text: "Confirmado", className: "st-ok" };
  if (status === "pending") return { text: "A confirmar", className: "st-warn" };
  return { text: status, className: "st-muted" };
}

function DashCard({
  title,
  count,
  to,
  linkLabel,
  icon,
  children,
  empty,
  emptyHint,
}: {
  title: string;
  count?: number | string;
  to: string;
  linkLabel: string;
  icon: ReactNode;
  children: ReactNode;
  empty?: boolean;
  emptyHint?: string;
}) {
  return (
    <article className="dash-card">
      <div className="dash-card-head">
        <div className="dash-card-title">
          <span className="dash-card-icon">{icon}</span>
          <div>
            <h2>{title}</h2>
            {count !== undefined ? <em>{count}</em> : null}
          </div>
        </div>
        <Link to={to} className="link-btn">
          {linkLabel}
        </Link>
      </div>
      {empty ? (
        <p className="empty-state">{emptyHint ?? "Nada pendente por aqui."}</p>
      ) : (
        children
      )}
    </article>
  );
}

function AppointmentRows({
  items,
  showDay = false,
}: {
  items: Appointment[];
  showDay?: boolean;
}) {
  return (
    <ul className="dash-list">
      {items.slice(0, 5).map((a) => {
        const name = a.patient.name ?? a.patient.phone;
        const st = statusLabel(a.status, a.start);
        return (
          <li key={a.id}>
            <div className="avatar sm" style={{ background: avatarColor(name) }}>
              {initials(a.patient.name, a.patient.phone)}
            </div>
            <div className="up-body">
              <strong>
                <Link to={`/agenda?appointment=${a.id}`}>{name}</Link>
              </strong>
              <span>{a.service.name}</span>
            </div>
            <div className="up-meta">
              <time>
                {showDay ? `${formatShortDay(a.start)} · ` : ""}
                {formatTime(a.start)}
              </time>
              <span className={`status ${st.className}`}>{st.text}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setData(await api.dashboard());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar dashboard");
      }
    })();
  }, []);

  if (error) return <p className="banner err">{error}</p>;
  if (!data) {
    return (
      <div className="skeleton-grid" aria-busy="true" aria-label="Carregando">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  const { upcoming, today, pendingPayments, pendingEvolutions, kpis } = data;

  return (
    <div className="dash">
      <div className="page-actions">
        <Link to="/agenda" className="btn ghost">
          Agenda
        </Link>
        <Link to="/agendar" className="btn teal">
          Novo atendimento
        </Link>
      </div>

      <section className="dash-cards">
        <DashCard
          title="Hoje"
          count={today.length}
          to="/agenda"
          linkLabel="Ver"
          icon={<CalendarDays size={18} strokeWidth={1.75} />}
          empty={today.length === 0}
          emptyHint="Nenhuma sessão hoje. Que tal agendar?"
        >
          <AppointmentRows items={today} />
        </DashCard>

        <DashCard
          title="Próximas"
          count={upcoming.length}
          to="/agenda"
          linkLabel="Agenda"
          icon={<Clock3 size={18} strokeWidth={1.75} />}
          empty={upcoming.length === 0}
          emptyHint="Sem sessões futuras no momento."
        >
          <AppointmentRows items={upcoming} showDay />
        </DashCard>

        <DashCard
          title="Revisar evoluções"
          count={kpis.pendingEvolutions}
          to="/prontuarios"
          linkLabel="Revisar"
          icon={<FileText size={18} strokeWidth={1.75} />}
          empty={pendingEvolutions.length === 0}
          emptyHint="Nenhum rascunho aguardando confirmação."
        >
          <ul className="dash-list">
            {pendingEvolutions.slice(0, 5).map((r) => {
              const name = r.patient.name ?? r.patient.phone;
              return (
                <li key={r.id}>
                  <div
                    className="avatar sm"
                    style={{ background: avatarColor(name) }}
                  >
                    {initials(r.patient.name, r.patient.phone)}
                  </div>
                  <div className="up-body">
                    <strong>{name}</strong>
                    <span>
                      {r.appointment
                        ? r.appointment.serviceName
                        : "Sem sessão vinculada"}
                    </span>
                  </div>
                  <div className="up-meta">
                    <time>
                      {r.appointment
                        ? formatShortDay(r.appointment.start)
                        : formatShortDay(r.updatedAt)}
                    </time>
                    <Link to={`/prontuarios?id=${r.id}`} className="status st-warn">
                      Rascunho
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </DashCard>

        <DashCard
          title="A receber"
          count={`${kpis.pendingInvoices} · ${formatPrice(kpis.pendingInvoicesCents)}`}
          to="/financeiro"
          linkLabel="Financeiro"
          icon={<Receipt size={18} strokeWidth={1.75} />}
          empty={pendingPayments.length === 0}
          emptyHint="Nenhuma fatura pendente."
        >
          <ul className="dash-list">
            {pendingPayments.slice(0, 5).map((p) => {
              const name = p.patient.name ?? p.patient.phone;
              return (
                <li key={p.id}>
                  <div
                    className="avatar sm"
                    style={{ background: avatarColor(name) }}
                  >
                    {initials(p.patient.name, p.patient.phone)}
                  </div>
                  <div className="up-body">
                    <strong>{name}</strong>
                    <span>{p.appointment?.service.name ?? "Avulso"}</span>
                  </div>
                  <div className="up-meta">
                    <time>{formatPrice(p.amountCents)}</time>
                    <span className="status st-warn">Pendente</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </DashCard>
      </section>
    </div>
  );
}
