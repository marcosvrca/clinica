import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileImage,
  FileText,
  FlaskConical,
  Lightbulb,
  ListChecks,
  Mic,
  Plus,
  Repeat2,
  Save,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { api } from "../api/client";
import { SessionAudioRecorder } from "../components/SessionAudioRecorder";
import type {
  ClinicalFileKind,
  ClinicalRecord,
  ClinicalRecordFile,
  ClinicalRecordsResponse,
  Patient,
  Professional,
} from "../api/types";
import { formatShortDay, formatTime } from "../lib/dates";
import { avatarColor, initials } from "../lib/ui";

type Section =
  | "evolucao"
  | "hipoteses"
  | "temas"
  | "intervencoes"
  | "pontos"
  | "objetivos"
  | "diagnosticos"
  | "observacoes"
  | "arquivos";

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: "evolucao", label: "Resumo", hint: "Resumo / evolução da sessão" },
  { id: "hipoteses", label: "Hipóteses", hint: "Hipóteses clínicas" },
  { id: "temas", label: "Temas", hint: "Temas recorrentes" },
  { id: "intervencoes", label: "Intervenções", hint: "Próximas intervenções" },
  { id: "pontos", label: "Pontos", hint: "Pontos importantes" },
  { id: "objetivos", label: "Objetivos", hint: "Objetivos do tratamento" },
  { id: "diagnosticos", label: "Diagnósticos", hint: "CID / DSM" },
  { id: "observacoes", label: "Anotações", hint: "Anotações e áudio" },
  { id: "arquivos", label: "Arquivos", hint: "PDF, exames, laudos, imagens" },
];

const FILE_KINDS: {
  kind: ClinicalFileKind;
  label: string;
  accept: string;
  icon: typeof FileText;
}[] = [
  { kind: "pdf", label: "PDF", accept: "application/pdf,.pdf", icon: FileText },
  {
    kind: "exam",
    label: "Exames",
    accept: "application/pdf,.pdf,image/jpeg,image/png,image/webp,.doc,.docx,.txt",
    icon: FlaskConical,
  },
  {
    kind: "report",
    label: "Laudos",
    accept: "application/pdf,.pdf,image/jpeg,image/png,image/webp,.doc,.docx,.txt",
    icon: ScrollText,
  },
  {
    kind: "image",
    label: "Imagens",
    accept: "image/jpeg,image/png,image/webp,image/gif",
    icon: FileImage,
  },
  {
    kind: "audio",
    label: "Áudios",
    accept: "audio/webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4",
    icon: Mic,
  },
];

type FormState = {
  evolution: string;
  objectives: string;
  hypotheses: string;
  recurringThemes: string;
  nextInterventions: string;
  importantPoints: string;
  audioNotes: string;
  diagnosisCid: string;
  diagnosisDsm: string;
  observations: string;
  recordingConsent: boolean;
};

function fromRecord(r: ClinicalRecord): FormState {
  return {
    evolution: r.evolution || r.draftContent || "",
    objectives: r.objectives || "",
    hypotheses: r.hypotheses || "",
    recurringThemes: r.recurringThemes || "",
    nextInterventions: r.nextInterventions || "",
    importantPoints: r.importantPoints || "",
    audioNotes: r.audioNotes || "",
    diagnosisCid: r.diagnosisCid || "",
    diagnosisDsm: r.diagnosisDsm || "",
    observations: r.observations || r.sessionNotes || "",
    recordingConsent: r.recordingConsent,
  };
}

function FileGroup({
  title,
  kind,
  items,
  recordId,
  canEdit,
  uploading,
  onUpload,
  onChanged,
}: {
  title: string;
  kind: ClinicalFileKind;
  items: ClinicalRecordFile[];
  recordId: string;
  canEdit: boolean;
  uploading: boolean;
  onUpload: (file: File | null, kind: ClinicalFileKind) => void;
  onChanged: () => void;
}) {
  const meta = FILE_KINDS.find((k) => k.kind === kind)!;
  const Icon = meta.icon;
  const filtered = items.filter((f) => f.kind === kind);

  return (
    <div className="card pad-sm clinical-file-group">
      <div className="clinical-file-head">
        <h4>
          <Icon size={15} /> {title}
        </h4>
        {canEdit ? (
          <label className="btn ghost sm">
            <Upload size={13} /> Enviar
            <input
              type="file"
              accept={meta.accept}
              hidden
              disabled={uploading}
              onChange={(e) =>
                onUpload(e.target.files?.[0] ?? null, kind)
              }
            />
          </label>
        ) : null}
      </div>
      {filtered.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Nenhum arquivo.
        </p>
      ) : (
        <ul className="catalog-list">
          {filtered.map((f) => (
            <li key={f.id}>
              <div>
                <strong>{f.title}</strong>
                <span className="muted">
                  {" "}
                  · {f.fileName} · {(f.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                  {formatShortDay(f.createdAt)}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() =>
                    void api.downloadClinicalFile(recordId, f.id, f.fileName)
                  }
                >
                  Baixar
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() =>
                      void api
                        .deleteClinicalFile(recordId, f.id)
                        .then(onChanged)
                    }
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const [form, setForm] = useState<FormState>({
    evolution: "",
    objectives: "",
    hypotheses: "",
    recurringThemes: "",
    nextInterventions: "",
    importantPoints: "",
    audioNotes: "",
    diagnosisCid: "",
    diagnosisDsm: "",
    observations: "",
    recordingConsent: false,
  });
  const [section, setSection] = useState<Section>("evolucao");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
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
    if (next) setForm(fromRecord(next));
  }, [data, selectedId]);

  const dirty = useMemo(() => {
    if (!selected || selected.status !== "draft") return false;
    const base = fromRecord(selected);
    return (
      form.evolution !== base.evolution ||
      form.objectives !== base.objectives ||
      form.hypotheses !== base.hypotheses ||
      form.recurringThemes !== base.recurringThemes ||
      form.nextInterventions !== base.nextInterventions ||
      form.importantPoints !== base.importantPoints ||
      form.audioNotes !== base.audioNotes ||
      form.diagnosisCid !== base.diagnosisCid ||
      form.diagnosisDsm !== base.diagnosisDsm ||
      form.observations !== base.observations ||
      form.recordingConsent !== base.recordingConsent
    );
  }, [selected, form]);

  const canConfirm = useMemo(() => {
    return [
      form.evolution,
      form.objectives,
      form.hypotheses,
      form.recurringThemes,
      form.nextInterventions,
      form.importantPoints,
      form.diagnosisCid,
      form.diagnosisDsm,
      form.observations,
    ].some((v) => v.trim().length > 0);
  }, [form]);

  function writePayload() {
    return {
      evolution: form.evolution,
      objectives: form.objectives,
      hypotheses: form.hypotheses,
      recurringThemes: form.recurringThemes,
      nextInterventions: form.nextInterventions,
      importantPoints: form.importantPoints,
      audioNotes: form.audioNotes,
      diagnosisCid: form.diagnosisCid,
      diagnosisDsm: form.diagnosisDsm,
      observations: form.observations,
      recordingConsent: form.recordingConsent,
    };
  }

  function selectRecord(record: ClinicalRecord) {
    setOk(null);
    setError(null);
    setAiHint(null);
    setSelected(record);
    setForm(fromRecord(record));
    setSection("evolucao");
    const next = new URLSearchParams(searchParams);
    next.set("id", record.id);
    setSearchParams(next);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveDraft() {
    if (!selected || selected.status !== "draft") return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const updated = await api.updateClinicalRecord(selected.id, writePayload());
      setOk("Rascunho salvo.");
      await load();
      selectRecord(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function generateEvolution() {
    if (!selected || selected.status !== "draft") return;
    if (form.audioNotes.trim() && !form.recordingConsent) {
      setError("Marque o consentimento de gravação para usar o áudio na geração.");
      setSection("observacoes");
      return;
    }
    setGenerating(true);
    setError(null);
    setOk(null);
    try {
      if (dirty) {
        await api.updateClinicalRecord(selected.id, writePayload());
      }
      const draft = await api.generateEvolution(selected.id, {
        notes: form.observations,
        audioNotes: form.audioNotes,
        recordingConsent: form.recordingConsent,
        apply: true,
      });
      if (draft.record) {
        setSelected(draft.record);
        setForm(fromRecord(draft.record));
      } else {
        setForm((f) => ({
          ...f,
          evolution: draft.summary,
          hypotheses: draft.hypotheses,
          recurringThemes: draft.recurringThemes,
          nextInterventions: draft.nextInterventions,
          importantPoints: draft.importantPoints,
        }));
      }
      setAiHint(draft.message);
      setOk(
        draft.provider === "openai"
          ? "Evolução gerada — aguardando revisão."
          : "Rascunho estruturado gerado — revise antes de confirmar.",
      );
      setSection("evolucao");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar evolução");
    } finally {
      setGenerating(false);
    }
  }

  async function confirmDraft() {
    if (!selected || selected.status !== "draft") return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (dirty) {
        await api.updateClinicalRecord(selected.id, writePayload());
      }
      const confirmed = await api.confirmClinicalRecord(selected.id);
      setOk("Registro confirmado no prontuário.");
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
        evolution: "",
        observations: "",
      });
      setCreating(false);
      setOk("Rascunho criado. Preencha as seções e confirme no prontuário.");
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

  async function onUpload(file: File | null, kind: ClinicalFileKind) {
    if (!file || !selected) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadClinicalFile(selected.id, file, {
        kind,
        title: file.name,
      });
      setOk("Arquivo anexado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  const patientName = selected
    ? (selected.patient.name ?? selected.patient.phone)
    : "";
  const locked = !selected || selected.status !== "draft" || saving || generating;
  const files = selected?.files ?? [];

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
          <h3 className="card-title sm">Novo rascunho de prontuário</h3>
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
                  Rascunho editável por seções. Nada entra no prontuário sem a
                  sua confirmação.
                </p>
              )}

              {aiHint ? <p className="ai-hint">{aiHint}</p> : null}

              {selected.status === "draft" ? (
                <div className="ai-generate-bar">
                  <button
                    type="button"
                    className="btn teal"
                    disabled={saving || generating}
                    onClick={() => void generateEvolution()}
                  >
                    <Sparkles size={16} />
                    {generating ? "Gerando…" : "Gerar evolução"}
                  </button>
                  <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                    Usa sessão anterior, anotações e áudio (com consentimento).
                    Resultado fica como rascunho para revisão.
                  </p>
                </div>
              ) : null}

              <div className="view-switch clinical-sections">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={section === s.id ? "on" : ""}
                    onClick={() => setSection(s.id)}
                    title={s.hint}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {section === "evolucao" ? (
                <label className="field-block">
                  <span className="section-label">
                    <ClipboardList size={15} /> Resumo / evolução
                  </span>
                  <textarea
                    rows={12}
                    value={form.evolution}
                    disabled={locked}
                    onChange={(e) => setField("evolution", e.target.value)}
                    placeholder="Resumo da sessão…"
                  />
                </label>
              ) : null}

              {section === "objetivos" ? (
                <label className="field-block">
                  <span className="section-label">
                    <Target size={15} /> Objetivos do tratamento
                  </span>
                  <textarea
                    rows={10}
                    value={form.objectives}
                    disabled={locked}
                    onChange={(e) => setField("objectives", e.target.value)}
                    placeholder="Liste os objetivos terapêuticos…"
                  />
                </label>
              ) : null}

              {section === "hipoteses" ? (
                <label className="field-block">
                  <span className="section-label">
                    <FlaskConical size={15} /> Hipóteses clínicas
                  </span>
                  <textarea
                    rows={10}
                    value={form.hypotheses}
                    disabled={locked}
                    onChange={(e) => setField("hypotheses", e.target.value)}
                    placeholder="Registre hipóteses clínicas em elaboração…"
                  />
                </label>
              ) : null}

              {section === "temas" ? (
                <label className="field-block">
                  <span className="section-label">
                    <Repeat2 size={15} /> Temas recorrentes
                  </span>
                  <textarea
                    rows={10}
                    value={form.recurringThemes}
                    disabled={locked}
                    onChange={(e) => setField("recurringThemes", e.target.value)}
                    placeholder="Temas que se repetem ao longo do processo…"
                  />
                </label>
              ) : null}

              {section === "intervencoes" ? (
                <label className="field-block">
                  <span className="section-label">
                    <ListChecks size={15} /> Próximas intervenções
                  </span>
                  <textarea
                    rows={10}
                    value={form.nextInterventions}
                    disabled={locked}
                    onChange={(e) =>
                      setField("nextInterventions", e.target.value)
                    }
                    placeholder="Intervenções sugeridas para as próximas sessões…"
                  />
                </label>
              ) : null}

              {section === "pontos" ? (
                <label className="field-block">
                  <span className="section-label">
                    <Lightbulb size={15} /> Pontos importantes
                  </span>
                  <textarea
                    rows={10}
                    value={form.importantPoints}
                    disabled={locked}
                    onChange={(e) => setField("importantPoints", e.target.value)}
                    placeholder="Pontos de atenção desta sessão…"
                  />
                </label>
              ) : null}

              {section === "diagnosticos" ? (
                <div className="form-grid two">
                  <label className="field-block">
                    <span className="section-label">CID</span>
                    <textarea
                      rows={6}
                      value={form.diagnosisCid}
                      disabled={locked}
                      onChange={(e) => setField("diagnosisCid", e.target.value)}
                      placeholder="Ex.: F41.1"
                    />
                  </label>
                  <label className="field-block">
                    <span className="section-label">DSM</span>
                    <textarea
                      rows={6}
                      value={form.diagnosisDsm}
                      disabled={locked}
                      onChange={(e) => setField("diagnosisDsm", e.target.value)}
                      placeholder="Descrição / código DSM…"
                    />
                  </label>
                </div>
              ) : null}

              {section === "observacoes" ? (
                <div className="stack-fields">
                  <label className="field-block">
                    <span className="section-label">Anotações da sessão</span>
                    <textarea
                      rows={8}
                      value={form.observations}
                      disabled={locked}
                      onChange={(e) => setField("observations", e.target.value)}
                      placeholder="Notas livres usadas na geração da evolução…"
                    />
                  </label>
                  <label className="field-block">
                    <span className="section-label">
                      <Mic size={15} /> Áudio / transcrição (apoio)
                    </span>
                    <textarea
                      rows={6}
                      value={form.audioNotes}
                      disabled={locked || !form.recordingConsent}
                      onChange={(e) => setField("audioNotes", e.target.value)}
                      placeholder={
                        form.recordingConsent
                          ? "Cole a transcrição ou notas do áudio (com consentimento)…"
                          : "Marque o consentimento abaixo para habilitar o uso de áudio…"
                      }
                    />
                    <SessionAudioRecorder
                      enabled={form.recordingConsent}
                      locked={locked || selected.status !== "draft"}
                      onError={(msg) => setError(msg)}
                      onBlob={(file) => {
                        void onUpload(file, "audio");
                        setField(
                          "audioNotes",
                          form.audioNotes.trim()
                            ? `${form.audioNotes.trim()}\n\n[Áudio gravado anexado em Arquivos — ${file.name}]`
                            : `[Áudio gravado anexado em Arquivos — ${file.name}]`,
                        );
                      }}
                    />
                    <p className="muted" style={{ fontSize: "0.82rem", marginTop: 6 }}>
                      A gravação é material de apoio e só sobe após consentimento.
                      Nada entra no prontuário sem sua confirmação.
                    </p>
                  </label>
                </div>
              ) : null}

              {section === "arquivos" ? (
                <div className="clinical-files">
                  {uploading ? <p className="muted">Enviando…</p> : null}
                  {FILE_KINDS.map((k) => (
                    <FileGroup
                      key={k.kind}
                      title={k.label}
                      kind={k.kind}
                      items={files}
                      recordId={selected.id}
                      canEdit={selected.status === "draft" && !saving}
                      uploading={uploading}
                      onUpload={(f, kind) => void onUpload(f, kind)}
                      onChanged={() => void load()}
                    />
                  ))}
                </div>
              ) : null}

              {section !== "arquivos" ? (
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={form.recordingConsent}
                    disabled={locked}
                    onChange={(e) =>
                      setField("recordingConsent", e.target.checked)
                    }
                  />
                  Consentimento explícito para gravação (quando aplicável)
                </label>
              ) : null}

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
                    disabled={saving || !canConfirm}
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
                  para a próxima sessão. Arquivos podem ser consultados e
                  baixados.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
