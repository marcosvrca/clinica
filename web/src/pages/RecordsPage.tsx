import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  Save,
  ShieldCheck,
} from "lucide-react";
import { api } from "../api/client";
import type {
  ClinicalRecord,
  ClinicalRecordsResponse,
  Patient,
  Professional,
} from "../api/types";
import { formatShortDay, formatTime } from "../lib/dates";
import { avatarColor, initials } from "../lib/ui";

export function RecordsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const patientFilter = searchParams.get("patientId") ?? "";
  const selectedId = searchParams.get("id") ?? "";

  const [data, setData] = useState<ClinicalRecordsResponse | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [statusFilter, setStatusFilter] = useState<"todos" | "draft" | "confirmed">(
    "todos",
  );
  const [selected, setSelected] = useState<ClinicalRecord | null>(null);
  const [sessionNotes, setSessionNotes] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPatientId, setNewPatientId] = useState("");
  const [newProfessionalId, setNewProfessionalId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [records, patientsRes, pros] = await Promise.all([
        api.clinicalRecords({
          patientId: patientFilter || undefined,
          status: statusFilter === "todos" ? undefined : statusFilter,
        }),
        api.patients(),
        api.professionals(),
      ]);
      setData(records);
      setPatients(patientsRes.items);
      setProfessionals(pros.items);
      setNewProfessionalId((current) => current || pros.items[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar prontuários");
    } finally {
      setLoading(false);
    }
  }, [patientFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const fromQuery = selectedId
      ? data.items.find((r) => r.id === selectedId)
      : undefined;
    const next = fromQuery ?? data.items[0] ?? null;
    setSelected(next);
    if (next) {
      setSessionNotes(next.sessionNotes ?? "");
      setDraftContent(next.draftContent);
      setRecordingConsent(next.recordingConsent);
    }
  }, [data, selectedId]);

  const dirty = useMemo(() => {
    if (!selected || selected.status !== "draft") return false;
    return (
      sessionNotes !== (selected.sessionNotes ?? "") ||
      draftContent !== selected.draftContent ||
      recordingConsent !== selected.recordingConsent
    );
  }, [selected, sessionNotes, draftContent, recordingConsent]);

  function selectRecord(record: ClinicalRecord) {
    setOk(null);
    setError(null);
    setSelected(record);
    setSessionNotes(record.sessionNotes ?? "");
    setDraftContent(record.draftContent);
    setRecordingConsent(record.recordingConsent);
    const next = new URLSearchParams(searchParams);
    next.set("id", record.id);
    setSearchParams(next);
  }

  async function saveDraft() {
    if (!selected || selected.status !== "draft") return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const updated = await api.updateClinicalRecord(selected.id, {
        sessionNotes,
        draftContent,
        recordingConsent,
      });
      setOk("Rascunho salvo.");
      await load();
      selectRecord(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDraft() {
    if (!selected || selected.status !== "draft") return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (dirty) {
        await api.updateClinicalRecord(selected.id, {
          sessionNotes,
          draftContent,
          recordingConsent,
        });
      }
      const confirmed = await api.confirmClinicalRecord(selected.id);
      setOk("Evolução confirmada no prontuário.");
      await load();
      selectRecord(confirmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao confirmar");
    } finally {
      setSaving(false);
    }
  }

  async function createDraft() {
    if (!newPatientId || !newProfessionalId) {
      setError("Selecione paciente e profissional");
      return;
    }
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const created = await api.createClinicalRecord({
        patientId: newPatientId,
        professionalId: newProfessionalId,
        draftContent: "",
        sessionNotes: "",
      });
      setCreating(false);
      setOk("Rascunho criado. Revise antes de confirmar no prontuário.");
      const next = new URLSearchParams(searchParams);
      next.set("patientId", newPatientId);
      next.set("id", created.id);
      setSearchParams(next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar rascunho");
    } finally {
      setSaving(false);
    }
  }

  const patientName = selected
    ? (selected.patient.name ?? selected.patient.phone)
    : "";

  return (
    <div className="records-page">
      <div className="page-actions">
        <Link to="/agenda" className="btn ghost">
          Ver agenda
        </Link>
        <button
          type="button"
          className="btn teal"
          onClick={() => {
            setCreating((v) => !v);
            setOk(null);
            setError(null);
          }}
        >
          <Plus size={16} /> Novo rascunho
        </button>
      </div>

      {error && <p className="banner err">{error}</p>}
      {ok && <p className="banner ok">{ok}</p>}

      <section className="kpi-grid patients-kpi">
        <article className="stat-card">
          <div className="stat-icon warn">
            <Clock3 size={18} />
          </div>
          <div>
            <span>Aguardando revisão</span>
            <strong>{data?.stats.drafts ?? "—"}</strong>
            <em>rascunhos editáveis</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon green">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span>No prontuário</span>
            <strong>{data?.stats.confirmed ?? "—"}</strong>
            <em>confirmações profissionais</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon blue">
            <FileText size={18} />
          </div>
          <div>
            <span>Pacientes com registro</span>
            <strong>{data?.stats.patients ?? "—"}</strong>
            <em>com evolução clínica</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon teal">
            <ShieldCheck size={18} />
          </div>
          <div>
            <span>Regra de ouro</span>
            <strong style={{ fontSize: "1rem" }}>Revisão humana</strong>
            <em>nada entra sem confirmação</em>
          </div>
        </article>
      </section>

      {creating && (
        <div className="card pad create-draft-box">
          <h3 className="card-title sm">Novo rascunho de evolução</h3>
          <div className="form-grid two">
            <label>
              Paciente
              <select
                value={newPatientId}
                onChange={(e) => setNewPatientId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.phone}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Profissional
              <select
                value={newProfessionalId}
                onChange={(e) => setNewProfessionalId(e.target.value)}
              >
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => setCreating(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn teal"
              disabled={saving}
              onClick={() => void createDraft()}
            >
              Criar rascunho
            </button>
          </div>
        </div>
      )}

      <div className="records-layout">
        <aside className="card records-list">
          <div className="records-filters">
            <label>
              Paciente
              <select
                value={patientFilter}
                onChange={(e) => {
                  const next = new URLSearchParams(searchParams);
                  if (e.target.value) next.set("patientId", e.target.value);
                  else next.delete("patientId");
                  next.delete("id");
                  setSearchParams(next);
                }}
              >
                <option value="">Todos</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.phone}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "todos" | "draft" | "confirmed")
                }
              >
                <option value="todos">Todos</option>
                <option value="draft">Aguardando revisão</option>
                <option value="confirmed">Confirmados</option>
              </select>
            </label>
          </div>

          {loading && <p className="muted pad-inline">Carregando…</p>}
          {!loading && (data?.items.length ?? 0) === 0 && (
            <p className="muted pad-inline">
              Nenhum registro ainda. Crie um rascunho após a sessão.
            </p>
          )}

          <ul className="record-items">
            {(data?.items ?? []).map((r) => {
              const name = r.patient.name ?? r.patient.phone;
              const active = selected?.id === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`record-item ${active ? "active" : ""}`}
                    onClick={() => selectRecord(r)}
                  >
                    <div
                      className="avatar sm"
                      style={{ background: avatarColor(name) }}
                    >
                      {initials(r.patient.name, r.patient.phone)}
                    </div>
                    <div className="record-item-body">
                      <strong>{name}</strong>
                      <span>{r.professional.name}</span>
                      <em>
                        {r.appointment
                          ? `${formatShortDay(r.appointment.start)} · ${formatTime(r.appointment.start)}`
                          : formatShortDay(r.updatedAt)}
                      </em>
                    </div>
                    <span
                      className={`status ${r.status === "draft" ? "st-warn" : "st-ok"}`}
                    >
                      {r.status === "draft" ? "Revisar" : "Prontuário"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="card pad records-detail">
          {!selected ? (
            <p className="muted">Selecione um registro à esquerda.</p>
          ) : (
            <>
              <div className="card-head">
                <div>
                  <h2 className="card-title" style={{ margin: 0 }}>
                    {patientName}
                  </h2>
                  <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                    {selected.professional.name}
                    {selected.appointment
                      ? ` · ${selected.appointment.service.name}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`status ${selected.status === "draft" ? "st-warn" : "st-ok"}`}
                >
                  {selected.status === "draft"
                    ? "Aguardando revisão"
                    : "Confirmado no prontuário"}
                </span>
              </div>

              {selected.status === "draft" && (
                <p className="review-hint">
                  Este é um rascunho editável. Nada entra no prontuário sem a sua
                  confirmação.
                </p>
              )}

              <label className="field-block">
                Notas da sessão
                <textarea
                  rows={3}
                  value={sessionNotes}
                  disabled={selected.status !== "draft" || saving}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Observações livres do atendimento…"
                />
              </label>

              <label className="field-block">
                Rascunho de evolução
                <textarea
                  rows={10}
                  value={draftContent}
                  disabled={selected.status !== "draft" || saving}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Estruture a evolução para ler, ajustar e confirmar…"
                />
              </label>

              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={recordingConsent}
                  disabled={selected.status !== "draft" || saving}
                  onChange={(e) => setRecordingConsent(e.target.checked)}
                />
                Consentimento explícito para gravação (quando aplicável)
              </label>

              {selected.status === "draft" ? (
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={saving || !dirty}
                    onClick={() => void saveDraft()}
                  >
                    <Save size={16} /> Salvar rascunho
                  </button>
                  <button
                    type="button"
                    className="btn teal"
                    disabled={saving || !draftContent.trim()}
                    onClick={() => void confirmDraft()}
                  >
                    <CheckCircle2 size={16} /> Confirmar no prontuário
                  </button>
                </div>
              ) : (
                <p className="muted">
                  Confirmado em{" "}
                  {selected.confirmedAt
                    ? new Date(selected.confirmedAt).toLocaleString("pt-BR")
                    : "—"}
                  . Registros confirmados ficam travados; crie um novo rascunho
                  para a próxima sessão.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
