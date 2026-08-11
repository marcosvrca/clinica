import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Appointment, Professional, Service } from "../api/types";
import {
  formatPrice,
  formatShortDay,
  formatTime,
  startOfDayIso,
  endOfDayIso,
  addDays,
} from "../lib/dates";
import { openSessionEvolution } from "../lib/session-record";
import { avatarColor, initials } from "../lib/ui";

function statusLabel(status: string) {
  if (status === "confirmed") return { text: "Confirmado", className: "st-ok" };
  if (status === "pending") return { text: "Pendente", className: "st-warn" };
  if (status === "cancelled") return { text: "Cancelado", className: "st-muted" };
  if (status === "no_show") return { text: "Falta", className: "st-muted" };
  return { text: status, className: "st-muted" };
}

export function SessionsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = new Date(startOfDayIso(addDays(new Date(), -14)));
        const to = new Date(endOfDayIso(addDays(new Date(), 21)));
        const res = await api.appointments({
          scope: "clinic",
          from: from.toISOString(),
          to: to.toISOString(),
        });
        setItems(res.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar sessões");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    const list =
      filter === "upcoming"
        ? items.filter(
            (a) =>
              new Date(a.start).getTime() >= now - 30 * 60_000 &&
              a.status !== "cancelled",
          )
        : filter === "past"
          ? items.filter((a) => new Date(a.start).getTime() < now)
          : items;
    return [...list].sort((a, b) =>
      filter === "past"
        ? new Date(b.start).getTime() - new Date(a.start).getTime()
        : new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
  }, [items, filter]);

  async function onRegister(a: Appointment) {
    setBusyId(a.id);
    setError(null);
    try {
      await openSessionEvolution(a, navigate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o rascunho");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div className="page-actions">
        <Link to="/agendar" className="btn teal">
          Novo atendimento
        </Link>
        <Link to="/agenda" className="btn ghost">
          Abrir agenda
        </Link>
      </div>

      <section className="card pad">
        <div className="card-head">
          <h2 className="card-title" style={{ margin: 0 }}>
            Sessões
          </h2>
          <div className="view-switch">
            {(
              [
                ["upcoming", "Próximas"],
                ["past", "Recentes"],
                ["all", "Todas"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filter === id ? "on" : ""}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className="muted">Carregando…</p> : null}
        {error ? <p className="banner err">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <p className="muted">Nenhuma sessão neste período.</p>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <ul className="catalog-list">
            {filtered.map((a) => {
              const name = a.patient.name ?? a.patient.phone;
              const st = statusLabel(a.status);
              const canRecord = a.status !== "cancelled";
              return (
                <li key={a.id}>
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
                      {initials(a.patient.name, a.patient.phone)}
                    </div>
                    <div>
                      <strong>{name}</strong>
                      <p className="muted" style={{ margin: 0 }}>
                        {a.service.name} · {a.professional.name}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>
                      {formatShortDay(a.start)} · {formatTime(a.start)}
                    </div>
                    <span className={`status ${st.className}`}>{st.text}</span>
                    <div
                      className="row-actions"
                      style={{
                        marginTop: "0.35rem",
                        justifyContent: "flex-end",
                        gap: "0.35rem",
                      }}
                    >
                      <Link
                        className="btn ghost sm"
                        to={`/agenda?appointment=${a.id}`}
                      >
                        Agenda
                      </Link>
                      {canRecord ? (
                        <button
                          type="button"
                          className="btn teal sm"
                          disabled={busyId === a.id}
                          onClick={() => void onRegister(a)}
                        >
                          {busyId === a.id
                            ? "Abrindo…"
                            : new Date(a.start).getTime() > Date.now()
                              ? "Preparar registro"
                              : "Registrar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <details className="card pad">
        <summary className="card-title sm" style={{ cursor: "pointer" }}>
          Serviços e equipe
        </summary>
        <div style={{ marginTop: "0.85rem" }}>
          <p style={{ marginBottom: "0.75rem" }}>
            <Link className="btn ghost sm" to="/servicos">
              Gerenciar serviços
            </Link>
          </p>
          <ServicesCatalog />
        </div>
      </details>
    </div>
  );
}

function ServicesCatalog() {
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [svc, pros] = await Promise.all([
          api.services(),
          api.professionals(),
        ]);
        setServices(svc.items);
        setProfessionals(pros.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      }
    })();
  }, []);

  if (error) return <p className="banner err">{error}</p>;

  if (services.length === 0) {
    return (
      <p className="muted">
        Nenhum serviço ativo.{" "}
        <Link to="/servicos">Cadastre um serviço</Link> para agendar e cobrar
        sessões.
      </p>
    );
  }

  return (
    <div className="dash-mid">
      <section>
        <h3 className="card-title sm">Serviços</h3>
        <ul className="catalog-list">
          {services.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <p className="muted">{s.description ?? "Sem descrição"}</p>
              </div>
              <div style={{ textAlign: "right", color: "var(--muted)" }}>
                <div>{s.durationMinutes} min</div>
                <div>{formatPrice(s.priceCents)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="card-title sm">Equipe</h3>
        <ul className="catalog-list">
          {professionals.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <p className="muted">
                  {p.specialty}
                  {p.crp ? ` · ${p.crp}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
