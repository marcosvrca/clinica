import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Lightbulb,
  Plus,
} from "lucide-react";
import { api } from "../api/client";
import type { Appointment, Professional } from "../api/types";
import {
  addDays,
  dayKey,
  formatTime,
  formatTimeRange,
  formatWeekRange,
  formatMonthYear,
  startOfWeek,
  toDateInputValue,
  zonedParts,
} from "../lib/dates";
import { avatarColor, initials, serviceShort, serviceTone } from "../lib/ui";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07–20

type ViewMode = "dia" | "semana" | "mes";

export function AgendaPage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>("semana");
  const [items, setItems] = useState<Appointment[]>([]);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = weekDays[6];

  const range = useMemo(() => {
    if (view === "dia") {
      const d = new Date(anchor);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return { from: d, to: end, days: [d] };
    }
    if (view === "mes") {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from: start, to: end, days: weekDays };
    }
    return {
      from: weekStart,
      to: addDays(weekEnd, 1),
      days: weekDays,
    };
  }, [view, anchor, weekStart, weekEnd, weekDays]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [appts, pros, dash] = await Promise.all([
          api.appointments({
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            status: "confirmed",
            professionalId: professionalId || undefined,
            scope: "clinic",
          }),
          api.professionals(),
          api.dashboard(),
        ]);
        setItems(appts.items);
        setProfessionals(pros.items);
        setUpcoming(dash.upcoming);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar agenda");
      } finally {
        setLoading(false);
      }
    })();
  }, [range.from, range.to, professionalId]);

  const todayKey = dayKey(new Date().toISOString());

  const nowLine = useMemo(() => {
    const p = zonedParts(new Date());
    const minutes = p.hour * 60 + p.minute;
    const start = 7 * 60;
    const end = 21 * 60;
    if (minutes < start || minutes > end) return null;
    return ((minutes - start) / (end - start)) * 100;
  }, []);

  const monthMatrix = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);

  function shift(dir: -1 | 1) {
    if (view === "dia") setAnchor((d) => addDays(d, dir));
    else if (view === "mes")
      setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else setAnchor((d) => addDays(d, dir * 7));
  }

  const displayDays = view === "dia" ? [anchor] : weekDays;

  return (
    <div className="agenda-layout">
      <section className="agenda-main card">
        <div className="agenda-toolbar">
          <div className="agenda-nav">
            <button type="button" className="btn ghost sm" onClick={() => setAnchor(new Date())}>
              Hoje
            </button>
            <button type="button" className="icon-btn soft" onClick={() => shift(-1)}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="icon-btn soft" onClick={() => shift(1)}>
              <ChevronRight size={16} />
            </button>
            <strong className="range-label">
              {view === "mes"
                ? formatMonthYear(anchor)
                : view === "dia"
                  ? anchor.toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : formatWeekRange(weekStart, weekEnd)}
            </strong>
          </div>

          <div className="view-switch">
            {(["dia", "semana", "mes"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? "on" : ""}
                onClick={() => setView(v)}
              >
                {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="banner err">{error}</p>}
        {loading && <p className="muted">Carregando agenda…</p>}

        {view !== "mes" ? (
          <div className={`cal-week ${view === "dia" ? "one-day" : ""}`}>
            <div className="cal-head">
              <div />
              <div className={`cal-days ${view === "dia" ? "one" : ""}`}>
                {displayDays.map((d) => {
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
                  gridTemplateColumns: `repeat(${displayDays.length}, 1fr)`,
                }}
              >
                {view === "semana" &&
                  dayKey(new Date().toISOString()) >= dayKey(weekStart.toISOString()) &&
                  dayKey(new Date().toISOString()) <= dayKey(weekEnd.toISOString()) &&
                  nowLine != null && (
                    <div className="now-line" style={{ top: `${nowLine}%` }}>
                      <span>
                        {String(zonedParts(new Date()).hour).padStart(2, "0")}:
                        {String(zonedParts(new Date()).minute).padStart(2, "0")}
                      </span>
                    </div>
                  )}
                {view === "dia" &&
                  toDateInputValue(anchor) === todayKey &&
                  nowLine != null && (
                    <div className="now-line" style={{ top: `${nowLine}%` }}>
                      <span>
                        {String(zonedParts(new Date()).hour).padStart(2, "0")}:
                        {String(zonedParts(new Date()).minute).padStart(2, "0")}
                      </span>
                    </div>
                  )}

                {HOURS.map((h) =>
                  displayDays.map((d) => (
                    <div key={`${toDateInputValue(d)}-${h}`} className="cal-cell" />
                  )),
                )}

                {items.map((a) => {
                  const dayIdx = displayDays.findIndex(
                    (d) => dayKey(d.toISOString()) === dayKey(a.start),
                  );
                  if (dayIdx < 0) return null;
                  const p = zonedParts(new Date(a.start));
                  const pe = zonedParts(new Date(a.end));
                  const startMin = p.hour * 60 + p.minute;
                  const endMin = pe.hour * 60 + pe.minute;
                  const top = ((startMin - 7 * 60) / (14 * 60)) * 100;
                  const height = Math.max(6, ((endMin - startMin) / (14 * 60)) * 100);
                  if (top < -5 || top > 100) return null;
                  const name = a.patient.name ?? a.patient.phone;
                  const tone = serviceTone(a.service.name);
                  return (
                    <div
                      key={a.id}
                      className={`cal-event ${tone}`}
                      style={{
                        left: `calc(${(dayIdx / displayDays.length) * 100}% + 4px)`,
                        width: `calc(${100 / displayDays.length}% - 8px)`,
                        top: `${Math.max(0, top)}%`,
                        height: `${height}%`,
                      }}
                    >
                      <div className="cal-event-row">
                        <div
                          className="avatar xs"
                          style={{ background: avatarColor(name) }}
                        >
                          {initials(a.patient.name, a.patient.phone)}
                        </div>
                        <strong>{name}</strong>
                      </div>
                      <span>{formatTimeRange(a.start, a.end)}</span>
                      <em>{serviceShort(a.service.name)}</em>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="month-grid">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d} className="month-dow">
                {d}
              </div>
            ))}
            {monthMatrix.map((d) => {
              const key = toDateInputValue(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              const dayItems = items.filter((a) => dayKey(a.start) === key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`month-cell ${inMonth ? "" : "out"} ${key === todayKey ? "today" : ""}`}
                  onClick={() => {
                    setAnchor(d);
                    setView("dia");
                  }}
                >
                  <span>{d.getDate()}</span>
                  <div className="month-dots">
                    {dayItems.slice(0, 3).map((a) => (
                      <i key={a.id} className={serviceTone(a.service.name)} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="agenda-side">
        <div className="side-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter size={15} /> Filtros
          </button>
          <Link to="/agendar" className="btn teal">
            <Plus size={16} /> Novo atendimento
          </Link>
        </div>

        {showFilters && (
          <div className="card pad-sm filter-box">
            <label>
              Terapeuta
              <select
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
              >
                <option value="">Todos</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <MiniCalendar
          anchor={anchor}
          onSelect={(d) => {
            setAnchor(d);
            setView("dia");
          }}
          onMonth={(dir) =>
            setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1))
          }
        />

        <div className="card pad-sm">
          <div className="card-head tight">
            <h3>Próximos atendimentos</h3>
          </div>
          <ul className="upcoming-mini">
            {upcoming.length === 0 && (
              <li className="muted">Nenhum horário futuro.</li>
            )}
            {upcoming.slice(0, 4).map((a) => {
              const name = a.patient.name ?? a.patient.phone;
              const isToday = dayKey(a.start) === todayKey;
              return (
                <li key={a.id}>
                  <div className="avatar sm" style={{ background: avatarColor(name) }}>
                    {initials(a.patient.name, a.patient.phone)}
                  </div>
                  <div className="up-body">
                    <strong>{name}</strong>
                    <span>{serviceShort(a.service.name)}</span>
                    <em>
                      {isToday ? `Hoje, ${formatTime(a.start)}` : a.startLabel}
                    </em>
                  </div>
                  <span className="status st-progress">Confirmado</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card pad-sm">
          <h3 className="card-title sm">Legenda</h3>
          <ul className="legend">
            <li>
              <i className="tone-tcc" /> TCC / Sessão
            </li>
            <li>
              <i className="tone-psi" /> Avaliação / Psicanálise
            </li>
            <li>
              <i className="tone-rel" /> Relacionamentos
            </li>
            <li>
              <i className="tone-auto" /> Autoconhecimento
            </li>
            <li>
              <i className="tone-other" /> Outros
            </li>
          </ul>
        </div>

        <div className="tip-card">
          <Lightbulb size={18} />
          <div>
            <strong>Dica rápida</strong>
            <p>
              Depois da sessão, abra{" "}
              <Link to="/prontuarios">Prontuários</Link> para revisar o rascunho
              antes de confirmar no registro.
            </p>
          </div>
          <Clock3 size={16} className="tip-clock" />
        </div>
      </aside>
    </div>
  );
}

function MiniCalendar({
  anchor,
  onSelect,
  onMonth,
}: {
  anchor: Date;
  onSelect: (d: Date) => void;
  onMonth: (dir: -1 | 1) => void;
}) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = toDateInputValue(new Date());
  const selected = toDateInputValue(anchor);

  return (
    <div className="card pad-sm mini-cal">
      <div className="mini-cal-head">
        <strong>{formatMonthYear(anchor)}</strong>
        <div>
          <button type="button" className="icon-btn soft" onClick={() => onMonth(-1)}>
            <ChevronLeft size={14} />
          </button>
          <button type="button" className="icon-btn soft" onClick={() => onMonth(1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="mini-cal-grid">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
          <span key={`${d}-${i}`} className="mini-dow">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const key = toDateInputValue(d);
          const inMonth = d.getMonth() === anchor.getMonth();
          return (
            <button
              key={key}
              type="button"
              className={`mini-day ${inMonth ? "" : "out"} ${key === today ? "today" : ""} ${key === selected ? "selected" : ""}`}
              onClick={() => onSelect(d)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
