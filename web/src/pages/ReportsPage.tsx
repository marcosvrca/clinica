import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "../api/client";
import type { DashboardData } from "../api/types";
import { formatPrice, formatShortDay, formatTime } from "../lib/dates";
import { avatarColor, initials } from "../lib/ui";

export function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        setData(await api.dashboard());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kpis = data?.kpis;
  const maxMonth = Math.max(1, ...(data?.evolution.map((e) => e.count) ?? [1]));

  return (
    <div className="reports-page" style={{ display: "grid", gap: "1.25rem" }}>
      {error ? <p className="banner err">{error}</p> : null}
      {loading && !data ? <p className="muted">Carregando indicadores…</p> : null}

      <section className="kpi-grid">
        <article className="stat-card">
          <div className="stat-icon">
            <Users size={18} strokeWidth={1.75} />
          </div>
          <div>
            <span>Pacientes ativos</span>
            <strong>{kpis?.activePatients ?? "—"}</strong>
            <em className="muted" style={{ fontSize: "0.75rem", fontStyle: "normal" }}>
              +{kpis?.newPatientsThisMonth ?? 0} este mês
            </em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">
            <CalendarDays size={18} strokeWidth={1.75} />
          </div>
          <div>
            <span>Consultas hoje</span>
            <strong>{kpis?.todayAppointments ?? "—"}</strong>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">
            <BarChart3 size={18} strokeWidth={1.75} />
          </div>
          <div>
            <span>Comparecimento</span>
            <strong>{kpis ? `${kpis.attendanceRate}%` : "—"}</strong>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">
            <Wallet size={18} strokeWidth={1.75} />
          </div>
          <div>
            <span>Receita do mês</span>
            <strong>
              {kpis ? formatPrice(kpis.monthlyRevenueCents) : "—"}
            </strong>
            <em className="muted" style={{ fontSize: "0.75rem", fontStyle: "normal" }}>
              Hoje {kpis ? formatPrice(kpis.todayReceivedCents) : "—"}
            </em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">
            <FileText size={18} strokeWidth={1.75} />
          </div>
          <div>
            <span>Rascunhos pendentes</span>
            <strong>{kpis?.pendingEvolutions ?? "—"}</strong>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">
            <ClipboardList size={18} strokeWidth={1.75} />
          </div>
          <div>
            <span>Cobranças pendentes</span>
            <strong>{kpis?.pendingInvoices ?? "—"}</strong>
            <em className="muted" style={{ fontSize: "0.75rem", fontStyle: "normal" }}>
              {kpis ? formatPrice(kpis.pendingInvoicesCents) : ""}
            </em>
          </div>
        </article>
      </section>

      <div className="dash-mid">
        <section className="card pad">
          <div className="card-head">
            <h2 className="card-title" style={{ margin: 0 }}>
              Evoluções aguardando revisão
            </h2>
            <Link to="/prontuarios" className="link-btn">
              Abrir prontuários
            </Link>
          </div>
          {!data?.pendingEvolutions.length ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              Nenhum rascunho pendente. Bom sinal — o prontuário está em dia.
            </p>
          ) : (
            <ul className="catalog-list">
              {data.pendingEvolutions.map((r) => {
                const name = r.patient.name ?? r.patient.phone;
                return (
                  <li key={r.id}>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.65rem",
                        alignItems: "center",
                      }}
                    >
                      <div
                        className="avatar sm"
                        style={{ background: avatarColor(name) }}
                      >
                        {initials(r.patient.name, r.patient.phone)}
                      </div>
                      <div>
                        <strong>{name}</strong>
                        <p className="muted" style={{ margin: 0 }}>
                          {r.appointment
                            ? `${r.appointment.serviceName} · ${formatShortDay(r.appointment.start)} ${formatTime(r.appointment.start)}`
                            : r.professional.name}
                        </p>
                      </div>
                    </div>
                    <Link
                      className="btn teal sm"
                      to={`/prontuarios?patientId=${r.patient.id}&id=${r.id}`}
                    >
                      Revisar
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card pad">
          <div className="card-head">
            <h2 className="card-title" style={{ margin: 0 }}>
              Pendências financeiras
            </h2>
            <Link to="/financeiro" className="link-btn">
              Financeiro
            </Link>
          </div>
          {!data?.pendingPayments.length ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              Sem cobranças em aberto no momento.
            </p>
          ) : (
            <ul className="catalog-list">
              {data.pendingPayments.slice(0, 8).map((p) => {
                const name = p.patient.name ?? p.patient.phone;
                return (
                  <li key={p.id}>
                    <div>
                      <strong>{name}</strong>
                      <p className="muted" style={{ margin: 0 }}>
                        {p.appointment?.service.name ?? "Recebimento"}
                      </p>
                    </div>
                    <strong>{formatPrice(p.amountCents)}</strong>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card pad">
        <div className="card-head">
          <h2 className="card-title" style={{ margin: 0 }}>
            Volume de sessões (6 meses)
          </h2>
          <Link to="/sessoes" className="link-btn">
            Sessões
          </Link>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${data?.evolution.length || 6}, 1fr)`,
            gap: "0.75rem",
            alignItems: "end",
            minHeight: 120,
            marginTop: "0.5rem",
          }}
        >
          {(data?.evolution ?? []).map((m) => (
            <div key={m.label} style={{ textAlign: "center" }}>
              <div
                title={`${m.count} sessões`}
                style={{
                  height: `${Math.max(8, (m.count / maxMonth) * 100)}px`,
                  background:
                    "color-mix(in srgb, var(--primary) 70%, #0f766e)",
                  borderRadius: "8px 8px 4px 4px",
                  margin: "0 auto 0.35rem",
                  maxWidth: 36,
                }}
              />
              <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                {m.count}
              </div>
              <div className="muted" style={{ fontSize: "0.72rem" }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="card pad">
        <h2 className="card-title sm">Próximo passo da rotina</h2>
        <p className="muted" style={{ margin: "0 0 0.75rem", maxWidth: "36rem" }}>
          Indicadores ligados ao fluxo do consultório: preparar → registrar →
          revisar → organizar recebimentos.
        </p>
        <div className="row-actions" style={{ justifyContent: "flex-start" }}>
          <Link to="/agenda" className="btn ghost sm">
            Agenda de hoje
          </Link>
          <Link to="/sessoes" className="btn ghost sm">
            Sessões
          </Link>
          <Link to="/financeiro" className="btn ghost sm">
            Financeiro
          </Link>
          <Link to="/prontuarios" className="btn teal sm">
            Revisar evoluções
          </Link>
        </div>
      </div>
    </div>
  );
}
