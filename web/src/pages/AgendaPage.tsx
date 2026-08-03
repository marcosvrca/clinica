import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { EventInput } from "@fullcalendar/core";
import { Filter, Plus } from "lucide-react";
import { api } from "../api/client";
import type { Appointment, CalendarBlock, Professional } from "../api/types";
import {
  formatShortDay,
  formatTime,
  localDateTimeToIso,
  toDateInputValue,
  toTimeInputValue,
} from "../lib/dates";
import { openSessionEvolution } from "../lib/session-record";
import { SessionPrepPanel } from "../components/SessionPrepPanel";

const BLOCK_COLOR = "#94a3b8";

type DetailState = {
  appointment: Appointment;
  notes: string;
  meetLink: string;
  status: string;
};

export function AgendaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkAppointmentId = searchParams.get("appointment");
  const deepLinkHandled = useRef<string | null>(null);
  const calendarRef = useRef<FullCalendar>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [range, setRange] = useState<{ from: Date; to: Date } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [saving, setSaving] = useState(false);
  const [openingRecord, setOpeningRecord] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockProId, setBlockProId] = useState("");
  const [blockDate, setBlockDate] = useState(() => toDateInputValue(new Date()));
  const [blockStartTime, setBlockStartTime] = useState("10:00");
  const [blockEndTime, setBlockEndTime] = useState("12:00");
  const [blockReason, setBlockReason] = useState("");
  const [shared, setShared] = useState(true);

  const load = useCallback(async () => {
    if (!range) return;
    setLoading(true);
    setError(null);
    try {
      /** Compartilhada = todos; individual exige profissional selecionado. */
      const proFilter = shared
        ? undefined
        : professionalId || undefined;
      if (!shared && !professionalId) {
        setAppointments([]);
        setBlocks([]);
        const pros = await api.professionals();
        setProfessionals(pros.items);
        setBlockProId((c) => c || pros.items[0]?.id || "");
        setLoading(false);
        return;
      }
      const [appts, calBlocks, pros] = await Promise.all([
        api.appointments({
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          professionalId: proFilter,
          scope: "clinic",
        }),
        api.calendarBlocks({
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          professionalId: proFilter,
        }),
        api.professionals(),
      ]);
      setAppointments(appts.items);
      setBlocks(calBlocks.items);
      setProfessionals(pros.items);
      setBlockProId((c) => c || pros.items[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar agenda");
    } finally {
      setLoading(false);
    }
  }, [range, professionalId, shared]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!deepLinkAppointmentId || loading) return;
    if (deepLinkHandled.current === deepLinkAppointmentId) return;

    const openDetail = (appointment: Appointment) => {
      deepLinkHandled.current = deepLinkAppointmentId;
      setDetail({
        appointment,
        notes: appointment.notes ?? "",
        meetLink: appointment.meetLink ?? "",
        status: appointment.status,
      });
      const next = new URLSearchParams(searchParams);
      next.delete("appointment");
      setSearchParams(next, { replace: true });
    };

    const inRange = appointments.find((a) => a.id === deepLinkAppointmentId);
    if (inRange) {
      openDetail(inRange);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const appointment = await api.appointment(deepLinkAppointmentId);
        if (cancelled) return;
        setAppointments((prev) =>
          prev.some((a) => a.id === appointment.id) ? prev : [...prev, appointment],
        );
        calendarRef.current?.getApi().gotoDate(appointment.start);
        openDetail(appointment);
      } catch (err) {
        if (cancelled) return;
        deepLinkHandled.current = deepLinkAppointmentId;
        setError(
          err instanceof Error
            ? err.message
            : "Agendamento do link não encontrado",
        );
        const next = new URLSearchParams(searchParams);
        next.delete("appointment");
        setSearchParams(next, { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    deepLinkAppointmentId,
    appointments,
    loading,
    searchParams,
    setSearchParams,
  ]);

  const events: EventInput[] = useMemo(() => {
    const sessionEvents: EventInput[] = appointments
      .filter((a) => a.status !== "cancelled")
      .map((a) => ({
        id: a.id,
        title: a.patient.name ?? a.patient.phone,
        start: a.start,
        end: a.end,
        backgroundColor: a.professional.color ?? "#14b8a6",
        borderColor: a.professional.color ?? "#14b8a6",
        editable: true,
        extendedProps: { kind: "appointment" as const, appointment: a },
      }));

    const blockEvents: EventInput[] = blocks.map((b) => ({
      id: `block:${b.id}`,
      title: b.reason ? `Bloqueio · ${b.reason}` : "Bloqueio",
      start: b.start,
      end: b.end,
      backgroundColor: BLOCK_COLOR,
      borderColor: BLOCK_COLOR,
      editable: false,
      display: "block",
      extendedProps: { kind: "block" as const, block: b },
    }));

    return [...sessionEvents, ...blockEvents];
  }, [appointments, blocks]);

  async function onEventDrop(info: {
    event: {
      id: string;
      start: Date | null;
      end: Date | null;
      extendedProps: { kind?: string };
    };
    revert: () => void;
  }) {
    const kind = info.event.extendedProps.kind;
    if (kind !== "appointment" || !info.event.start) {
      info.revert();
      return;
    }
    setError(null);
    try {
      await api.moveAppointment(info.event.id, {
        start: info.event.start.toISOString(),
        end: info.event.end?.toISOString(),
      });
      setOk("Horário remarcado");
      await load();
    } catch (err) {
      info.revert();
      setError(err instanceof Error ? err.message : "Falha ao remarcar");
    }
  }

  async function onEventResize(info: {
    event: {
      id: string;
      start: Date | null;
      end: Date | null;
      extendedProps: { kind?: string };
    };
    revert: () => void;
  }) {
    if (
      info.event.extendedProps.kind !== "appointment" ||
      !info.event.start ||
      !info.event.end
    ) {
      info.revert();
      return;
    }
    setError(null);
    try {
      await api.moveAppointment(info.event.id, {
        start: info.event.start.toISOString(),
        end: info.event.end.toISOString(),
      });
      setOk("Duração atualizada");
      await load();
    } catch (err) {
      info.revert();
      setError(err instanceof Error ? err.message : "Falha ao ajustar");
    }
  }

  function onEventClick(info: {
    event: {
      extendedProps: {
        kind?: string;
        block?: CalendarBlock;
        appointment?: Appointment;
      };
    };
  }) {
    const kind = info.event.extendedProps.kind;
    if (kind === "block") {
      const block = info.event.extendedProps.block;
      if (!block) return;
      if (window.confirm(`Remover bloqueio${block.reason ? ` (${block.reason})` : ""}?`)) {
        void api
          .deleteCalendarBlock(block.id)
          .then(() => load())
          .catch((err) =>
            setError(err instanceof Error ? err.message : "Falha ao remover"),
          );
      }
      return;
    }
    const appointment = info.event.extendedProps.appointment;
    if (!appointment) return;
    setDetail({
      appointment,
      notes: appointment.notes ?? "",
      meetLink: appointment.meetLink ?? "",
      status: appointment.status,
    });
  }

  function onSelect(sel: { start: Date; end: Date | null }) {
    setShowBlockForm(true);
    setBlockDate(toDateInputValue(sel.start));
    setBlockStartTime(toTimeInputValue(sel.start));
    const end = sel.end ?? new Date(sel.start.getTime() + 60 * 60_000);
    setBlockEndTime(toTimeInputValue(end));
    if (!shared && professionalId) {
      setBlockProId(professionalId);
    }
  }

  async function saveDetail() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateAppointment(detail.appointment.id, {
        notes: detail.notes,
        meetLink: detail.meetLink || null,
        status: detail.status,
      });
      setOk("Atendimento atualizado");
      setDetail(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function submitBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!blockProId) {
      setError("Selecione o profissional do bloqueio");
      return;
    }
    if (blockEndTime <= blockStartTime) {
      setError("Horário final do bloqueio deve ser depois do início");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createCalendarBlock({
        professionalId: blockProId,
        start: localDateTimeToIso(blockDate, blockStartTime),
        end: localDateTimeToIso(blockDate, blockEndTime),
        reason: blockReason.trim() || undefined,
      });
      setShowBlockForm(false);
      setBlockReason("");
      setOk("Bloqueio criado");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao bloquear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="agenda-layout fc-agenda">
      <section className="agenda-main card pad-sm">
        <div className="agenda-toolbar">
          <div className="agenda-nav">
            <strong className="range-label">Agenda da clínica</strong>
            {loading ? <span className="muted">Atualizando…</span> : null}
          </div>
          <div className="view-switch">
            <label className="chip" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShared(next);
                  if (!next && !professionalId && professionals[0]) {
                    setProfessionalId(professionals[0].id);
                  }
                  if (next) setProfessionalId("");
                }}
                style={{ marginRight: 6 }}
              />
              Compartilhada
            </label>
          </div>
        </div>

        {error ? <p className="banner err">{error}</p> : null}
        {ok ? (
          <p className="banner ok" onAnimationEnd={() => setOk(null)}>
            {ok}
          </p>
        ) : null}
        {!shared && !professionalId ? (
          <p className="banner err">
            Selecione um profissional para a agenda individual, ou ative
            “Compartilhada”.
          </p>
        ) : null}

        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          locale="pt-br"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
          }}
          buttonText={{
            today: "Hoje",
            month: "Mês",
            week: "Semana",
            day: "Dia",
            list: "Lista",
          }}
          height="auto"
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          allDaySlot={false}
          nowIndicator
          editable
          droppable={false}
          selectable
          selectMirror
          eventDurationEditable
          events={events}
          datesSet={(arg) => {
            setRange({ from: arg.start, to: arg.end });
          }}
          eventDrop={(info) => void onEventDrop(info)}
          eventResize={(info) => void onEventResize(info)}
          eventClick={onEventClick}
          select={onSelect}
        />
      </section>

      <aside className="agenda-side">
        <div className="side-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => setShowBlockForm((v) => !v)}
          >
            <Filter size={15} /> Bloquear
          </button>
          <Link to="/agendar" className="btn teal">
            <Plus size={16} /> Agendar
          </Link>
        </div>

        <div className="card pad-sm filter-box">
          <label>
            Profissional
            <select
              value={professionalId}
              onChange={(e) => {
                const id = e.target.value;
                setProfessionalId(id);
                setShared(!id);
                if (id) setBlockProId(id);
              }}
            >
              <option value="">Todos (agenda compartilhada)</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
            Cores por profissional · arraste para remarcar · selecione faixa para
            bloquear
          </p>
        </div>

        {showBlockForm ? (
          <form className="card pad-sm filter-box" onSubmit={(e) => void submitBlock(e)}>
            <strong style={{ display: "block", marginBottom: "0.5rem" }}>
              Bloqueio de horário
            </strong>
            <label>
              Profissional
              <select
                value={blockProId}
                onChange={(e) => setBlockProId(e.target.value)}
                required
              >
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data
              <input
                type="date"
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
                required
              />
            </label>
            <div className="form-grid two" style={{ marginBottom: 0 }}>
              <label>
                Início
                <input
                  type="time"
                  value={blockStartTime}
                  onChange={(e) => setBlockStartTime(e.target.value)}
                  required
                />
              </label>
              <label>
                Fim
                <input
                  type="time"
                  value={blockEndTime}
                  onChange={(e) => setBlockEndTime(e.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              Motivo
              <input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Supervisão, folga…"
              />
            </label>
            <button type="submit" className="btn teal block" disabled={saving}>
              Salvar bloqueio
            </button>
          </form>
        ) : null}

        <div className="card pad-sm">
          <h3 className="card-title sm">Legenda</h3>
          <ul className="legend">
            {professionals.map((p) => (
              <li key={p.id}>
                <i style={{ background: p.color ?? "#14b8a6" }} /> {p.name}
              </li>
            ))}
            <li>
              <i style={{ background: BLOCK_COLOR }} /> Bloqueio
            </li>
          </ul>
        </div>

        <div className="card pad-sm">
          <h3 className="card-title sm">Integrações</h3>
          <p className="muted" style={{ fontSize: "0.82rem", margin: "0 0 0.6rem" }}>
            Google Calendar e Outlook: configure em Configurações.
          </p>
          <Link to="/configuracoes" className="link-btn">
            Abrir integrações
          </Link>
        </div>
      </aside>

      {detail ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetail(null)}>
          <div
            className="modal-card wide"
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-head">
              <h2 className="card-title" style={{ margin: 0 }}>
                Detalhe do atendimento
              </h2>
              <button type="button" className="btn ghost sm" onClick={() => setDetail(null)}>
                Fechar
              </button>
            </div>

            <div className="detail-grid">
              <label>
                Paciente
                <input
                  readOnly
                  value={
                    detail.appointment.patient.name ??
                    detail.appointment.patient.phone
                  }
                />
              </label>
              <label>
                Telefone
                <input readOnly value={detail.appointment.patient.phone} />
              </label>
              <label>
                Data
                <input readOnly value={formatShortDay(detail.appointment.start)} />
              </label>
              <label>
                Hora
                <input
                  readOnly
                  value={`${formatTime(detail.appointment.start)} – ${formatTime(detail.appointment.end)}`}
                />
              </label>
              <label>
                Profissional
                <input readOnly value={detail.appointment.professional.name} />
              </label>
              <label>
                Serviço
                <input readOnly value={detail.appointment.service.name} />
              </label>
              <label className="span-2">
                Status
                <select
                  value={detail.status}
                  onChange={(e) =>
                    setDetail((d) => (d ? { ...d, status: e.target.value } : d))
                  }
                >
                  <option value="confirmed">Confirmado</option>
                  <option value="pending">Pendente</option>
                  <option value="cancelled">Cancelado</option>
                  <option value="no_show">Falta</option>
                </select>
              </label>
              <label className="span-2">
                Link Meet
                <input
                  type="url"
                  placeholder="https://meet.google.com/..."
                  value={detail.meetLink}
                  onChange={(e) =>
                    setDetail((d) => (d ? { ...d, meetLink: e.target.value } : d))
                  }
                />
              </label>
              <label className="span-2">
                Observações
                <textarea
                  rows={3}
                  value={detail.notes}
                  onChange={(e) =>
                    setDetail((d) => (d ? { ...d, notes: e.target.value } : d))
                  }
                />
              </label>
            </div>

            {detail.appointment.recurrenceRule ? (
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                Série recorrente ({detail.appointment.recurrenceRule})
              </p>
            ) : null}

            <SessionPrepPanel
              patientId={detail.appointment.patient.id}
              appointmentId={detail.appointment.id}
              compact
            />

            <div className="row-actions">
              {detail.meetLink ? (
                <a
                  className="btn ghost"
                  href={detail.meetLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir Meet
                </a>
              ) : null}
              {detail.appointment.status !== "cancelled" ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={openingRecord}
                  onClick={() => {
                    void (async () => {
                      setOpeningRecord(true);
                      setError(null);
                      try {
                        await openSessionEvolution(
                          detail.appointment,
                          navigate,
                        );
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Não foi possível abrir o registro",
                        );
                      } finally {
                        setOpeningRecord(false);
                      }
                    })();
                  }}
                >
                  {openingRecord ? "Abrindo…" : "Registrar evolução"}
                </button>
              ) : null}
              <Link
                className="btn ghost"
                to={`/prontuarios?patientId=${detail.appointment.patient.id}`}
              >
                Prontuário
              </Link>
              <button
                type="button"
                className="btn teal"
                disabled={saving}
                onClick={() => void saveDetail()}
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
