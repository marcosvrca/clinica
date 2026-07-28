import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  PieChart,
  TrendingUp,
  Users,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../api/client";
import type { Appointment, DashboardData } from "../api/types";
import {
  formatPrice,
  formatTime,
  dayKey,
  addDays,
  toDateInputValue,
  zonedParts,
  startOfWeek,
} from "../lib/dates";
import { avatarColor, initials, serviceShort, serviceTone } from "../lib/ui";

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

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

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekAppts, setWeekAppts] = useState<Appointment[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const dash = await api.dashboard();
        setData(dash);
        setWeekAppts(dash.week);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar dashboard");
      }
    })();
  }, []);

  const weekDays = useMemo(() => {
    const base = data ? new Date(data.weekStart) : startOfWeek(new Date());
    const start = addDays(base, weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [data, weekOffset]);

  useEffect(() => {
    if (!data || weekOffset === 0) {
      if (data) setWeekAppts(data.week);
      return;
    }
    const from = weekDays[0];
    const to = addDays(weekDays[6], 1);
    void (async () => {
      try {
        const res = await api.appointments({
          from: from.toISOString(),
          to: to.toISOString(),
          status: "confirmed",
          scope: "clinic",
        });
        setWeekAppts(res.items);
      } catch {
        /* keep previous */
      }
    })();
  }, [weekOffset, weekDays, data]);

  const todayKey = dayKey(new Date().toISOString());

  const nowLine = useMemo(() => {
    const p = zonedParts(new Date());
    const minutes = p.hour * 60 + p.minute;
    const start = 8 * 60;
    const end = 18 * 60;
    if (minutes < start || minutes > end) return null;
    return ((minutes - start) / (end - start)) * 100;
  }, []);

  const tasks = [
    { id: 1, label: "Enviar relatório mensal", due: "30/05", done: false },
    { id: 2, label: "Reunião de supervisão", due: "02/06", done: false },
    { id: 3, label: "Atualizar prontuários", due: "", done: true },
  ];

  if (error) return <p className="banner err">{error}</p>;
  if (!data) return <p className="muted">Carregando dashboard…</p>;

  const kpis = [
    {
      label: "Pacientes ativos",
      value: String(data.kpis.activePatients),
      hint: "cadastros na clínica",
      icon: Users,
      tone: "blue",
    },
    {
      label: "Consultas do dia",
      value: String(data.kpis.todayAppointments),
      hint: "Hoje",
      icon: Calendar,
      tone: "green",
    },
    {
      label: "Faturamento mensal",
      value: formatPrice(data.kpis.monthlyRevenueCents),
      hint: "serviços confirmados",
      icon: Wallet,
      tone: "lilac",
    },
    {
      label: "Taxa de comparecimento",
      value: `${data.kpis.attendanceRate}%`,
      hint: "mês atual",
      icon: PieChart,
      tone: "teal",
    },
  ];

  const maxEvo = Math.max(1, ...data.evolution.map((e) => e.count));
  const showNow =
    weekOffset === 0 &&
    nowLine != null &&
    weekDays.some((d) => toDateInputValue(d) === todayKey);

  return (
    <div className="dash">
      <section className="kpi-grid">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <article key={k.label} className={`kpi-card tone-${k.tone}`}>
              <div className="kpi-head">
                <span>{k.label}</span>
                <div className="kpi-icon">
                  <Icon size={16} />
                </div>
              </div>
              <strong className="kpi-value">{k.value}</strong>
              <div className="kpi-foot">
                <span className="trend">
                  <TrendingUp size={14} /> {k.hint}
                </span>
                <svg className="spark" viewBox="0 0 80 28" preserveAspectRatio="none">
                  <path
                    d="M0 22 C12 18, 18 8, 28 12 S48 24, 58 10 S72 4, 80 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </article>
          );
        })}
      </section>

      <section className="dash-mid">
        <article className="card week-card">
          <div className="card-head">
            <h2>Agenda da semana</h2>
            <div className="week-nav">
              <button type="button" className="chip" onClick={() => setWeekOffset(0)}>
                Esta semana
              </button>
              <button
                type="button"
                className="icon-btn soft"
                onClick={() => setWeekOffset((v) => v - 1)}
                aria-label="Semana anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="icon-btn soft"
                onClick={() => setWeekOffset((v) => v + 1)}
                aria-label="Próxima semana"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="cal-week dash-cal">
            <div className="cal-head">
              <div />
              <div className="cal-days">
                {weekDays.map((d) => {
                  const key = toDateInputValue(d);
                  const isToday = key === todayKey;
                  return (
                    <div key={key} className={`cal-day-head ${isToday ? "today" : ""}`}>
                      <span>
                        {d
                          .toLocaleDateString("pt-BR", { weekday: "short" })
                          .replace(".", "")}
                      </span>
                      <strong className={isToday ? "today-num" : ""}>{d.getDate()}</strong>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="cal-body-row">
              <div className="cal-times">
                {HOURS.map((h) => (
                  <div key={h}>{String(h).padStart(2, "0")}:00</div>
                ))}
              </div>

              <div
                className="cal-body"
                style={{
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gridTemplateRows: `repeat(${HOURS.length}, 1fr)`,
                  minHeight: 380,
                }}
              >
                {showNow && <div className="now-line" style={{ top: `${nowLine}%` }} />}

                {HOURS.map((h) =>
                  weekDays.map((d) => (
                    <div key={`${toDateInputValue(d)}-${h}`} className="cal-cell" />
                  )),
                )}

                {weekAppts.map((a) => {
                  const dayIdx = weekDays.findIndex(
                    (d) => dayKey(d.toISOString()) === dayKey(a.start),
                  );
                  if (dayIdx < 0) return null;
                  const p = zonedParts(new Date(a.start));
                  const pe = zonedParts(new Date(a.end));
                  const startMin = p.hour * 60 + p.minute;
                  const endMin = pe.hour * 60 + pe.minute;
                  const top = ((startMin - 8 * 60) / (10 * 60)) * 100;
                  const height = Math.max(8, ((endMin - startMin) / (10 * 60)) * 100);
                  if (top < 0 || top > 100) return null;
                  const name = a.patient.name ?? a.patient.phone;
                  return (
                    <div
                      key={a.id}
                      className={`cal-event ${serviceTone(a.service.name)}`}
                      style={{
                        left: `calc(${(dayIdx / 7) * 100}% + 4px)`,
                        width: `calc(${100 / 7}% - 8px)`,
                        top: `${top}%`,
                        height: `${height}%`,
                      }}
                      title={`${name} · ${formatTime(a.start)}`}
                    >
                      <strong>{name}</strong>
                      <span>{formatTime(a.start)}</span>
                      <em>{serviceShort(a.service.name)}</em>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Próximos atendimentos</h2>
            <Link to="/agenda" className="link-btn">
              Ver todos
            </Link>
          </div>
          {data.upcoming.length === 0 ? (
            <p className="empty-state">Nenhum horário futuro confirmado.</p>
          ) : (
            <ul className="upcoming-list">
              {data.upcoming.map((a) => {
                const st = statusLabel(a.status, a.start);
                const name = a.patient.name ?? a.patient.phone;
                return (
                  <li key={a.id}>
                    <div className="avatar sm" style={{ background: avatarColor(name) }}>
                      {initials(a.patient.name, a.patient.phone)}
                    </div>
                    <div className="up-body">
                      <strong>{name}</strong>
                      <span>{a.service.name}</span>
                    </div>
                    <div className="up-meta">
                      <time>{formatTime(a.start)}</time>
                      <span className={`status ${st.className}`}>{st.text}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>

      <section className="dash-bottom">
        <article className="card">
          <div className="card-head">
            <h2>Evolução de atendimentos</h2>
            <span className="chip">Últimos 6 meses</span>
          </div>
          <div className="chart">
            <svg viewBox="0 0 560 180" className="area-chart">
              <defs>
                <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {(() => {
                const pts = data.evolution.map((e, i) => {
                  const x = 40 + (i * 480) / Math.max(1, data.evolution.length - 1);
                  const y = 150 - (e.count / maxEvo) * 120;
                  return { x, y, ...e };
                });
                const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
                const area = `40,150 ${line} ${pts.at(-1)?.x ?? 40},150`;
                return (
                  <>
                    <polygon points={area} fill="url(#evoFill)" />
                    <polyline
                      points={line}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="3"
                      strokeLinejoin="round"
                    />
                    {pts.map((p) => (
                      <g key={p.label}>
                        <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#3b82f6" strokeWidth="2" />
                        <text x={p.x} y="170" textAnchor="middle" className="chart-label">
                          {p.label}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </article>

        <article className="card">
          <div className="card-head">
            <h2>Lembretes e tarefas</h2>
            <button type="button" className="link-btn">
              Ver todas
            </button>
          </div>
          <ul className="task-list">
            {tasks.map((t) => (
              <li key={t.id} className={t.done ? "done" : ""}>
                <span className={`check ${t.done ? "on" : ""}`}>{t.done ? "✓" : ""}</span>
                <div>
                  <strong>{t.label}</strong>
                  {t.due && <span>{t.due}</span>}
                  {t.done && <em>Concluído</em>}
                </div>
              </li>
            ))}
          </ul>
          <Link to="/agendar" className="btn teal block">
            Novo atendimento
          </Link>
        </article>
      </section>
    </div>
  );
}
