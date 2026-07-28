import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Professional, Service, Slot } from "../api/types";
import { formatShortDay, formatTime } from "../lib/dates";

export function BookPage() {
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [phone, setPhone] = useState("");
  const [patientName, setPatientName] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.services();
        setServices(res.items);
        if (res.items[0]) setServiceId(res.items[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar serviços");
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!serviceId) return;
    void (async () => {
      try {
        const res = await api.professionals(serviceId);
        setProfessionals(res.items);
        setProfessionalId("");
        setSlotId("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar profissionais");
      }
    })();
  }, [serviceId]);

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
      await api.book({
        phone,
        patientName: patientName.trim() || undefined,
        serviceId,
        professionalId: selectedSlot.professionalId,
        start: selectedSlot.start,
        notes: notes.trim() || undefined,
        source: "web",
      });
      navigate("/agenda");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível agendar");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) return <p className="muted">Carregando…</p>;

  return (
    <div className="card pad">
      <form className="form-panel" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Serviço
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes} min)
              </option>
            ))}
          </select>
        </label>

        <label>
          Profissional
          <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
            <option value="">Qualquer disponível</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Horário livre</legend>
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
            />
          </label>
          <label>
            Nome do paciente
            <input
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>

        <label>
          Observações
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Opcional"
          />
        </label>

        {error && <p className="banner err">{error}</p>}

        <button type="submit" className="btn teal" disabled={submitting || !selectedSlot}>
          {submitting ? "Agendando…" : "Confirmar atendimento"}
        </button>
      </form>
    </div>
  );
}
