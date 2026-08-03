import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Brain,
  CalendarClock,
  ListTodo,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { api } from "../api/client";
import type { SessionPrepContext } from "../api/types";
import { formatShortDay, formatTime } from "../lib/dates";

export function SessionPrepPanel({
  patientId,
  appointmentId,
  compact = false,
}: {
  patientId: string;
  appointmentId?: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<SessionPrepContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .patientPrepContext(patientId, appointmentId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar contexto");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, appointmentId]);

  if (loading) {
    return <p className="muted prep-loading">Preparando contexto da sessão…</p>;
  }
  if (error) {
    return <p className="banner err">{error}</p>;
  }
  if (!data) return null;

  return (
    <section className={`session-prep ${compact ? "compact" : ""}`}>
      <header className="session-prep-head">
        <div>
          <h3>
            <Brain size={16} /> Contexto pré-sessão
          </h3>
          <p className="muted">{data.reviewNote}</p>
        </div>
        <span className={`prep-provider ${data.provider}`}>
          <Sparkles size={13} />
          {data.provider === "openai" ? "Briefing IA" : "Briefing local"}
        </span>
      </header>

      <p className="prep-briefing">{data.briefing}</p>

      <div className="prep-grid">
        <article className="prep-block">
          <h4>
            <CalendarClock size={14} /> Últimas 5 sessões
          </h4>
          {data.recentSessions.length === 0 ? (
            <p className="muted">Sem sessões anteriores registradas.</p>
          ) : (
            <ul className="prep-list">
              {data.recentSessions.map((s) => (
                <li key={s.id}>
                  <div className="prep-session-top">
                    <strong>
                      {formatShortDay(s.start)} · {formatTime(s.start)}
                    </strong>
                    <span className="muted">
                      {s.serviceName} · {s.professionalName}
                    </span>
                  </div>
                  {s.summary ? <p>{s.summary}</p> : null}
                  {s.recordId ? (
                    <Link
                      className="link-btn"
                      to={`/prontuarios?patientId=${patientId}&id=${s.recordId}`}
                    >
                      Ver registro
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="prep-block">
          <h4>
            <Zap size={14} /> Temas recorrentes
          </h4>
          {data.recurringThemes.length === 0 ? (
            <p className="muted">Nenhum tema consolidado ainda.</p>
          ) : (
            <ul className="prep-bullets">
              {data.recurringThemes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </article>

        <article className="prep-block">
          <h4>
            <Target size={14} /> Objetivos
          </h4>
          {data.objectives.length === 0 ? (
            <p className="muted">Objetivos ainda não registrados.</p>
          ) : (
            <ul className="prep-bullets">
              {data.objectives.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </article>

        <article className="prep-block">
          <h4>
            <AlertCircle size={14} /> Últimos acontecimentos
          </h4>
          {data.latestEvents.length === 0 ? (
            <p className="muted">Sem acontecimentos recentes destacados.</p>
          ) : (
            <ul className="prep-bullets">
              {data.latestEvents.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </article>

        <article className="prep-block span-all">
          <h4>
            <ListTodo size={14} /> Pendências
          </h4>
          {data.pending.length === 0 ? (
            <p className="muted">Nenhuma pendência no momento.</p>
          ) : (
            <ul className="prep-pending">
              {data.pending.map((p, idx) => (
                <li key={`${p.kind}-${idx}`}>
                  <span className={`prep-kind ${p.kind}`}>{p.kind}</span>
                  {p.href ? (
                    <Link to={p.href}>{p.label}</Link>
                  ) : (
                    <span>{p.label}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
