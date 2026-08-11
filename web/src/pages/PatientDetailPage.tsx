import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Brain,
  FileText,
  GitCommitHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Upload,
  User,
  UserX,
} from "lucide-react";
import { api } from "../api/client";
import type { PatientDetail, PatientDocument } from "../api/types";
import { formatShortDay } from "../lib/dates";
import { avatarColor, initials } from "../lib/ui";
import { PatientTimeline } from "../components/PatientTimeline";
import { SessionPrepPanel } from "../components/SessionPrepPanel";

type Tab = "prep" | "dados" | "documentos" | "timeline";

function DocList({
  title,
  items,
  patientId,
  onChanged,
}: {
  title: string;
  items: PatientDocument[];
  patientId: string;
  onChanged: () => void;
}) {
  return (
    <div className="card pad-sm" style={{ marginBottom: "0.85rem" }}>
      <h3 className="card-title sm">{title}</h3>
      {items.length === 0 ? (
        <p className="muted">Nenhum arquivo.</p>
      ) : (
        <ul className="catalog-list">
          {items.map((d) => (
            <li key={d.id}>
              <div>
                <strong>{d.title}</strong>
                <span className="muted">
                  {" "}
                  · {d.fileName} · {(d.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                  {formatShortDay(d.createdAt)}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() =>
                    void api.downloadPatientDocument(patientId, d.id, d.fileName)
                  }
                >
                  Baixar
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() =>
                    void api
                      .deletePatientDocument(patientId, d.id)
                      .then(onChanged)
                  }
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PatientDetailPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<PatientDetail | null>(null);
  const [tab, setTab] = useState<Tab>("prep");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  async function load() {
    const detail = await api.patientDetail(id);
    setData(detail);
    if (detail.hasPhoto) {
      const url = await api.patientPhotoUrl(id);
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    }
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : "Erro ao carregar"),
    );
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onLifecycle(patch: { active?: boolean; billingPaused?: boolean }) {
    setLifecycleBusy(true);
    setError(null);
    try {
      await api.setPatientLifecycle(id, patch);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status");
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function onUpload(
    file: File | null,
    kind: "document" | "attachment" | "photo",
    asProfilePhoto = false,
  ) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadPatientDocument(id, file, {
        kind,
        title: file.name,
        asProfilePhoto,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  if (error && !data) return <p className="banner err">{error}</p>;
  if (!data) return <p className="muted">Carregando paciente…</p>;

  const name = data.name ?? data.phone;
  const docs = data.documents.filter((d) => d.kind === "document");
  const attachments = data.documents.filter((d) => d.kind === "attachment");
  const photos = data.documents.filter((d) => d.kind === "photo");

  return (
    <div className="patient-detail">
      <div className="page-actions">
        <Link to="/pacientes" className="btn ghost">
          Lista
        </Link>
        <Link to={`/pacientes/${id}/editar`} className="btn ghost">
          <Pencil size={15} /> Editar cadastro
        </Link>
        <Link to={`/agendar`} className="btn teal">
          Agendar sessão
        </Link>
        {data?.billingPaused ? (
          <button
            type="button"
            className="btn ghost"
            disabled={lifecycleBusy}
            onClick={() => void onLifecycle({ billingPaused: false })}
          >
            <Play size={15} /> Retomar cobranças
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost"
            disabled={lifecycleBusy || data?.active === false}
            onClick={() => void onLifecycle({ billingPaused: true })}
          >
            <Pause size={15} /> Pausar cobranças
          </button>
        )}
        {data?.active ? (
          <button
            type="button"
            className="btn ghost"
            disabled={lifecycleBusy}
            onClick={() => {
              if (
                window.confirm(
                  "Inativar este paciente? Novos agendamentos e cobranças automáticas serão bloqueados.",
                )
              ) {
                void onLifecycle({ active: false });
              }
            }}
          >
            <UserX size={15} /> Inativar
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost"
            disabled={lifecycleBusy}
            onClick={() => void onLifecycle({ active: true })}
          >
            <Play size={15} /> Reativar
          </button>
        )}
      </div>

      {error ? <p className="banner err">{error}</p> : null}

      <header className="card pad patient-hero">
        <div
          className="avatar lg"
          style={{
            background: photoUrl ? "transparent" : avatarColor(name),
            overflow: "hidden",
          }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            initials(data.name, data.phone)
          )}
        </div>
        <div>
          <h2 style={{ margin: 0 }}>{name}</h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {data.phone}
            {data.email ? ` · ${data.email}` : ""}
            {data.cpf ? ` · CPF ${data.cpf}` : ""}
          </p>
          <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>
            {[data.city, data.state].filter(Boolean).join(" / ") || "Endereço não informado"}
            {data.insuranceName ? ` · Convênio ${data.insuranceName}` : ""}
          </p>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
            <span
              className={`status-dot ${
                !data.active ? "warn" : data.billingPaused ? "warn" : "ok"
              }`}
            >
              {!data.active
                ? "Inativo"
                : data.billingPaused
                  ? "Cobranças pausadas"
                  : "Ativo"}
            </span>
          </div>
        </div>
        <label className="btn ghost sm" style={{ marginLeft: "auto" }}>
          <Upload size={14} /> Foto do paciente
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            disabled={uploading}
            onChange={(e) =>
              void onUpload(e.target.files?.[0] ?? null, "photo", true)
            }
          />
        </label>
      </header>

      <div className="view-switch" style={{ marginBottom: "0.85rem" }}>
        {(
          [
            ["prep", "Preparar sessão", Brain],
            ["timeline", "Linha do tempo", GitCommitHorizontal],
            ["dados", "Dados", User],
            ["documentos", "Documentos", Paperclip],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "on" : ""}
            onClick={() => setTab(key)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "prep" ? (
        <div className="card pad">
          <SessionPrepPanel patientId={data.id} />
        </div>
      ) : null}

      {tab === "dados" ? (
        <div className="dash-cards">
          <article className="dash-card tone-blue">
            <h3 className="card-title sm">Pessoais / contato</h3>
            <ul className="catalog-list">
              <li><strong>Nascimento</strong><span>{data.birthDate || "—"}</span></li>
              <li><strong>Gênero</strong><span>{data.gender || "—"}</span></li>
              <li><strong>Estado civil</strong><span>{data.maritalStatus || "—"}</span></li>
              <li><strong>Profissão</strong><span>{data.profession || "—"}</span></li>
              <li><strong>E-mail</strong><span>{data.email || "—"}</span></li>
            </ul>
          </article>
          <article className="dash-card tone-teal">
            <h3 className="card-title sm">Endereço</h3>
            <ul className="catalog-list">
              <li><strong>CEP</strong><span>{data.zipCode || "—"}</span></li>
              <li>
                <strong>Logradouro</strong>
                <span>
                  {[data.street, data.addressNumber, data.complement]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </span>
              </li>
              <li><strong>Bairro</strong><span>{data.district || "—"}</span></li>
              <li>
                <strong>Cidade/UF</strong>
                <span>{[data.city, data.state].filter(Boolean).join(" / ") || "—"}</span>
              </li>
            </ul>
          </article>
          <article className="dash-card tone-warn">
            <h3 className="card-title sm">Emergência</h3>
            <ul className="catalog-list">
              <li><strong>Nome</strong><span>{data.emergencyName || "—"}</span></li>
              <li><strong>Telefone</strong><span>{data.emergencyPhone || "—"}</span></li>
              <li><strong>Relação</strong><span>{data.emergencyRelation || "—"}</span></li>
            </ul>
          </article>
          <article className="dash-card tone-lilac">
            <h3 className="card-title sm">Convênio / financeiro</h3>
            <ul className="catalog-list">
              <li><strong>Convênio</strong><span>{data.insuranceName || "Particular"}</span></li>
              <li><strong>Carteirinha</strong><span>{data.insuranceNumber || "—"}</span></li>
              <li><strong>Plano</strong><span>{data.insurancePlan || "—"}</span></li>
              <li><strong>Resp. financeiro</strong><span>{data.financialName || "—"}</span></li>
              <li><strong>CPF resp.</strong><span>{data.financialCpf || "—"}</span></li>
              <li><strong>Tel. resp.</strong><span>{data.financialPhone || "—"}</span></li>
            </ul>
          </article>
          {data.notes ? (
            <article className="dash-card tone-ink" style={{ gridColumn: "1 / -1" }}>
              <h3 className="card-title sm">Observações</h3>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{data.notes}</p>
            </article>
          ) : null}
        </div>
      ) : null}

      {tab === "documentos" ? (
        <div>
          <div className="page-actions" style={{ marginBottom: "0.75rem" }}>
            <label className="btn ghost">
              <FileText size={14} /> Documento
              <input
                type="file"
                accept="application/pdf,.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp"
                hidden
                disabled={uploading}
                onChange={(e) =>
                  void onUpload(e.target.files?.[0] ?? null, "document")
                }
              />
            </label>
            <label className="btn ghost">
              <Paperclip size={14} /> Anexo
              <input
                type="file"
                accept="application/pdf,.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp"
                hidden
                disabled={uploading}
                onChange={(e) =>
                  void onUpload(e.target.files?.[0] ?? null, "attachment")
                }
              />
            </label>
            <label className="btn ghost">
              <Upload size={14} /> Foto do paciente
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                disabled={uploading}
                onChange={(e) =>
                  void onUpload(e.target.files?.[0] ?? null, "photo", true)
                }
              />
            </label>
          </div>
          {uploading ? <p className="muted">Enviando…</p> : null}
          <DocList title="Documentos" items={docs} patientId={id} onChanged={() => void load()} />
          <DocList title="Anexos" items={attachments} patientId={id} onChanged={() => void load()} />
          <DocList title="Fotos do paciente" items={photos} patientId={id} onChanged={() => void load()} />
        </div>
      ) : null}

      {tab === "timeline" ? (
        <PatientTimeline events={data.timeline ?? []} />
      ) : null}
    </div>
  );
}
