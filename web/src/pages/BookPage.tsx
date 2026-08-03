import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Professional, Service, Slot } from "../api/types";
import { formatShortDay, formatTime } from "../lib/dates";

export function BookPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rescheduleId = searchParams.get("reschedule");
  const isReschedule = Boolean(rescheduleId);

  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [phone, setPhone] = useState(() => searchParams.get("phone") ?? "");
  const [patientName, setPatientName] = useState("");
  const [notes, setNotes] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [weeklyWeeks, setWeeklyWeeks] = useState(0);
  const [preferredProId, setPreferredProId] = useState<string | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const patientId = searchParams.get("patientId");
        const phoneFromQuery = searchParams.get("phone");
        if (phoneFromQuery) {
          setPhone(phoneFromQuery);
        } else if (patientId) {
          try {
            const detail = await api.patientDetail(patientId);
            setPhone(detail.phone);
            if (detail.name) setPatientName(detail.name);
          } catch {
            /* phone pode vir na query */
          }
        }

        const res = await api.services();
        setServices(res.items);

        if (rescheduleId) {
          try {
            const appt = await api.appointment(rescheduleId);
            setServiceId(appt.service.id);
            setPreferredProId(appt.professional.id);
            setPhone(appt.patient.phone);
            if (appt.patient.name) setPatientName(appt.patient.name);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Não foi possível carregar o agendamento para remarcar",
            );
            if (res.items[0]) setServiceId(res.items[0].id);
          }
        } else if (res.items[0]) {
          setServiceId(res.items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar serviços");
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, [searchParams, rescheduleId]);

  useEffect(() => {
    if (!serviceId) return;
    void (async () => {
      try {
        const res = await api.professionals(serviceId);
        setProfessionals(res.items);
        setSlotId("");
        if (preferredProId && res.items.some((p) => p.id === preferredProId)) {
          setProfessionalId(preferredProId);
        } else {
          setProfessionalId("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar profissionais");
      }
    })();
  }, [serviceId, preferredProId]);

  useEffect(() => {
    if (!serviceId) return;
    void (async () => {
      setLoadingSlots(true);
      setError(null);
      setSlotId("");
      try {
        const res = await api.availability({
          serviceId,
          professionalId: professionalId || undefined,
          days: 14,
        });
        setSlots(res.slots);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao buscar disponibilidade");
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [serviceId, professionalId]);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === slotId) ?? null,
    [slots, slotId],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedSlot) {
      setError("Selecione um horário");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      setError("Informe um telefone válido (WhatsApp)");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (isReschedule && rescheduleId) {
        await api.reschedule(rescheduleId, {
          phone,
          start: selectedSlot.start,
          professionalId: selectedSlot.professionalId,
        });
      } else {
        await api.book({
          phone,
          patientName: patientName.trim() || undefined,
          serviceId,
          professionalId: selectedSlot.professionalId,
          start: selectedSlot.start,
          notes: notes.trim() || undefined,
          meetLink: meetLink.trim() || undefined,
          weeklyWeeks: weeklyWeeks > 0 ? weeklyWeeks : undefined,
          source: "web",
        });
      }
      navigate("/agenda");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isReschedule
            ? "Não foi possível remarcar"
            : "Não foi possível agendar",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) return <p className="muted">Carregando…</p>;

  return (
    <div className="card pad">
      {isReschedule && (
        <p className="banner ok" style={{ marginBottom: 16 }}>
          Remarcação — escolha o novo horário. O atendimento atual será movido.
        </p>
      )}
      <form className="form-panel" onSubmit={(e) => void onSubmit(e)}>
        {!isReschedule && (
          <label>
            Serviço
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMinutes} min)
                </option>
              ))}
            </select>
          </label>
        )}

        {isReschedule && (
          <label>
            Serviço (mesmo da sessão)
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMinutes} min)
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Profissional
          <select
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
          >
            <option value="">Qualquer disponível</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>{isReschedule ? "Novo horário" : "Horário livre"}</legend>
          {loadingSlots ? (
            <p className="muted">Buscando slots…</p>
          ) : slots.length === 0 ? (
            <p className="muted">Nenhum horário livre nos próximos 14 dias.</p>
          ) : (
            <div className="slot-grid">
              {slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`slot ${slotId === s.id ? "selected" : ""}`}
                  onClick={() => setSlotId(s.id)}
                >
                  <span>
                    {formatShortDay(s.start)} {formatTime(s.start)}
                  </span>
                  <small>{s.professionalName}</small>
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <div className="form-row">
          <label>
            Telefone (WhatsApp)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5563999999999"
              required
              readOnly={isReschedule && Boolean(phone)}
            />
          </label>
          {!isReschedule && (
            <label>
              Nome do paciente
              <input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Opcional"
              />
            </label>
          )}
        </div>

        {!isReschedule && (
          <>
            <label>
              Observações
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Opcional"
              />
            </label>

            <label>
              Link Meet
              <input
                type="url"
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://meet.google.com/…"
              />
            </label>

            <label>
              Repetição semanal
              <select
                value={weeklyWeeks}
                onChange={(e) => setWeeklyWeeks(Number(e.target.value))}
              >
                <option value={0}>Sem repetição</option>
                <option value={3}>Por 4 semanas (hoje + 3)</option>
                <option value={7}>Por 8 semanas</option>
                <option value={11}>Por 12 semanas</option>
              </select>
            </label>
          </>
        )}

        {error && <p className="banner err">{error}</p>}

        <button type="submit" className="btn teal" disabled={submitting || !selectedSlot}>
          {submitting
            ? isReschedule
              ? "Remarcando…"
              : "Agendando…"
            : isReschedule
              ? "Confirmar remarcação"
              : weeklyWeeks > 0
                ? `Confirmar série (${weeklyWeeks + 1} sessões)`
                : "Confirmar atendimento"}
        </button>
      </form>
    </div>
  );
}
