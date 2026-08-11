import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Camera, Upload } from "lucide-react";
import { api } from "../api/client";
import type { PatientDetail, PatientWritePayload } from "../api/types";
import { avatarColor, initials } from "../lib/ui";

const emptyForm: PatientWritePayload = {
  phone: "",
  name: "",
  email: "",
  notes: "",
  cpf: "",
  birthDate: "",
  gender: "",
  profession: "",
  maritalStatus: "",
  zipCode: "",
  street: "",
  addressNumber: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelation: "",
  insuranceName: "",
  insuranceNumber: "",
  insurancePlan: "",
  financialName: "",
  financialCpf: "",
  financialPhone: "",
  financialRelation: "",
};

function fromDetail(p: PatientDetail): PatientWritePayload {
  return {
    phone: p.phone,
    name: p.name ?? "",
    email: p.email ?? "",
    notes: p.notes ?? "",
    cpf: p.cpf ?? "",
    birthDate: p.birthDate ?? "",
    gender: p.gender ?? "",
    profession: p.profession ?? "",
    maritalStatus: p.maritalStatus ?? "",
    zipCode: p.zipCode ?? "",
    street: p.street ?? "",
    addressNumber: p.addressNumber ?? "",
    complement: p.complement ?? "",
    district: p.district ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    emergencyName: p.emergencyName ?? "",
    emergencyPhone: p.emergencyPhone ?? "",
    emergencyRelation: p.emergencyRelation ?? "",
    insuranceName: p.insuranceName ?? "",
    insuranceNumber: p.insuranceNumber ?? "",
    insurancePlan: p.insurancePlan ?? "",
    financialName: p.financialName ?? "",
    financialCpf: p.financialCpf ?? "",
    financialPhone: p.financialPhone ?? "",
    financialRelation: p.financialRelation ?? "",
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field-block">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PatientFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<PatientWritePayload>(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const detail = await api.patientDetail(id);
        setForm(fromDetail(detail));
        if (detail.hasPhoto) {
          const url = await api.patientPhotoUrl(id);
          setPhotoPreview(url);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function set<K extends keyof PatientWritePayload>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPickPhoto(file: File | null) {
    if (!file) return;
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: PatientWritePayload = {
        ...form,
        email: form.email || null,
        name: form.name || null,
      };
      let patientId = id;
      if (isEdit && id) {
        await api.updatePatient(id, payload);
      } else {
        const created = await api.createPatient(payload);
        patientId = created.id;
      }
      if (photoFile && patientId) {
        try {
          await api.uploadPatientDocument(patientId, photoFile, {
            kind: "photo",
            title: "Foto do paciente",
            asProfilePhoto: true,
          });
        } catch (photoErr) {
          // Cadastro já salvo — segue para o detalhe e mostra o erro de foto
          navigate(`/pacientes/${patientId}`);
          throw photoErr instanceof Error
            ? photoErr
            : new Error("Paciente salvo, mas a foto não foi enviada");
        }
      }
      navigate(`/pacientes/${patientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Carregando cadastro…</p>;

  const previewName = form.name || form.phone || "Paciente";

  return (
    <div className="patient-form-page">
      <div className="page-actions">
        <Link to={isEdit && id ? `/pacientes/${id}` : "/pacientes"} className="btn ghost">
          Voltar
        </Link>
      </div>

      {error ? <p className="banner err">{error}</p> : null}

      <form className="card pad patient-form" onSubmit={(e) => void onSubmit(e)}>
        <h2 className="card-title">
          {isEdit ? "Editar paciente" : "Novo paciente"}
        </h2>

        <section className="patient-photo-section">
          <h3>Foto do paciente</h3>
          <div className="patient-photo-picker">
            <div
              className="avatar xl"
              style={{
                background: photoPreview ? "transparent" : avatarColor(previewName),
                overflow: "hidden",
              }}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt={previewName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span className="patient-photo-placeholder">
                  <Camera size={28} strokeWidth={1.5} />
                  <span>{initials(form.name, form.phone)}</span>
                </span>
              )}
            </div>
            <div className="patient-photo-actions">
              <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
                JPEG, PNG ou WebP. Aparece na lista e no cadastro do paciente.
              </p>
              <label className="btn ghost">
                <Upload size={15} />
                {photoPreview ? "Trocar foto" : "Escolher foto"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
              {photoFile ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (photoPreview?.startsWith("blob:")) {
                      URL.revokeObjectURL(photoPreview);
                    }
                    setPhotoFile(null);
                    setPhotoPreview(null);
                    if (id) {
                      void api.patientPhotoUrl(id).then((url) => {
                        if (url) setPhotoPreview(url);
                      });
                    }
                  }}
                >
                  Remover seleção
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section>
          <h3>Dados pessoais</h3>
          <div className="form-grid two">
            <Field label="Nome completo">
              <input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="CPF">
              <input value={form.cpf ?? ""} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
            </Field>
            <Field label="Data de nascimento">
              <input type="date" value={form.birthDate ?? ""} onChange={(e) => set("birthDate", e.target.value)} />
            </Field>
            <Field label="Gênero">
              <select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value)}>
                <option value="">—</option>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="outro">Outro</option>
                <option value="nao_informado">Prefiro não informar</option>
              </select>
            </Field>
            <Field label="Estado civil">
              <select value={form.maritalStatus ?? ""} onChange={(e) => set("maritalStatus", e.target.value)}>
                <option value="">—</option>
                <option value="solteiro">Solteiro(a)</option>
                <option value="casado">Casado(a)</option>
                <option value="uniao_estavel">União estável</option>
                <option value="divorciado">Divorciado(a)</option>
                <option value="viuvo">Viúvo(a)</option>
              </select>
            </Field>
            <Field label="Profissão">
              <input value={form.profession ?? ""} onChange={(e) => set("profession", e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <h3>Contato</h3>
          <div className="form-grid two">
            <Field label="Telefone / WhatsApp *">
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
            </Field>
            <Field label="E-mail">
              <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <h3>Endereço</h3>
          <div className="form-grid two">
            <Field label="CEP">
              <input value={form.zipCode ?? ""} onChange={(e) => set("zipCode", e.target.value)} />
            </Field>
            <Field label="UF">
              <input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} maxLength={2} />
            </Field>
            <Field label="Cidade">
              <input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Bairro">
              <input value={form.district ?? ""} onChange={(e) => set("district", e.target.value)} />
            </Field>
            <Field label="Rua">
              <input value={form.street ?? ""} onChange={(e) => set("street", e.target.value)} />
            </Field>
            <Field label="Número">
              <input value={form.addressNumber ?? ""} onChange={(e) => set("addressNumber", e.target.value)} />
            </Field>
            <Field label="Complemento">
              <input value={form.complement ?? ""} onChange={(e) => set("complement", e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <h3>Contato de emergência</h3>
          <div className="form-grid two">
            <Field label="Nome">
              <input value={form.emergencyName ?? ""} onChange={(e) => set("emergencyName", e.target.value)} />
            </Field>
            <Field label="Telefone">
              <input value={form.emergencyPhone ?? ""} onChange={(e) => set("emergencyPhone", e.target.value)} />
            </Field>
            <Field label="Parentesco / relação">
              <input value={form.emergencyRelation ?? ""} onChange={(e) => set("emergencyRelation", e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <h3>Convênio</h3>
          <div className="form-grid two">
            <Field label="Operadora">
              <input value={form.insuranceName ?? ""} onChange={(e) => set("insuranceName", e.target.value)} />
            </Field>
            <Field label="Número da carteirinha">
              <input value={form.insuranceNumber ?? ""} onChange={(e) => set("insuranceNumber", e.target.value)} />
            </Field>
            <Field label="Plano">
              <input value={form.insurancePlan ?? ""} onChange={(e) => set("insurancePlan", e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <h3>Responsável financeiro</h3>
          <div className="form-grid two">
            <Field label="Nome">
              <input value={form.financialName ?? ""} onChange={(e) => set("financialName", e.target.value)} />
            </Field>
            <Field label="CPF">
              <input value={form.financialCpf ?? ""} onChange={(e) => set("financialCpf", e.target.value)} />
            </Field>
            <Field label="Telefone">
              <input value={form.financialPhone ?? ""} onChange={(e) => set("financialPhone", e.target.value)} />
            </Field>
            <Field label="Relação">
              <input
                value={form.financialRelation ?? ""}
                onChange={(e) => set("financialRelation", e.target.value)}
                placeholder="Ex.: próprio, cônjuge, responsável"
              />
            </Field>
          </div>
        </section>

        <section>
          <h3>Observações internas</h3>
          <Field label="Notas (não clínicas)">
            <textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Preferências de horário, etc."
            />
          </Field>
        </section>

        <div className="row-actions">
          <button type="submit" className="btn teal" disabled={saving}>
            {saving ? "Salvando…" : "Salvar cadastro"}
          </button>
        </div>
      </form>
    </div>
  );
}
