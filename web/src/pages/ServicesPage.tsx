import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Professional, Service } from "../api/types";
import { formatPrice } from "../lib/dates";

function parseReaisToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace("R$", "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("Sessão individual");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(50);
  const [priceReais, setPriceReais] = useState("");
  const [professionalIds, setProfessionalIds] = useState<string[]>([]);

  async function load() {
    const [svc, pros] = await Promise.all([
      api.services({ includeInactive: true }),
      api.professionals(),
    ]);
    setServices(svc.items);
    setProfessionals(pros.items);
    if (professionalIds.length === 0 && pros.items.length > 0) {
      setProfessionalIds(pros.items.map((p) => p.id));
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("Sessão individual");
    setDescription("");
    setDurationMinutes(50);
    setPriceReais("");
    setProfessionalIds(professionals.map((p) => p.id));
  }

  function startEdit(s: Service) {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description ?? "");
    setDurationMinutes(s.durationMinutes);
    setPriceReais(centsToInput(s.priceCents));
    setProfessionalIds(
      s.professionalIds?.length
        ? s.professionalIds
        : professionals.map((p) => p.id),
    );
    setOk(null);
    setError(null);
  }

  function togglePro(id: string) {
    setProfessionalIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const priceCents = parseReaisToCents(priceReais);
      if (Number.isNaN(priceCents as number)) {
        throw new Error("Valor inválido. Use formato como 150,00");
      }
      const payload = {
        name,
        description: description.trim() || null,
        durationMinutes,
        priceCents,
        professionalIds:
          professionalIds.length > 0 ? professionalIds : undefined,
      };
      if (editingId) {
        await api.updateService(editingId, payload);
        setOk("Serviço atualizado.");
      } else {
        await api.createService(payload);
        setOk("Serviço cadastrado.");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.updateService(id, { active });
      await load();
      setOk(active ? "Serviço reativado." : "Serviço desativado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Carregando…</p>;

  return (
    <div className="page-stack">
      <header className="page-head">
        <div>
          <h1 className="page-title">Serviços</h1>
          <p className="muted">
            Cadastre tipos de atendimento, duração e valor. Seu perfil já é o
            profissional dos atendimentos — a equipe aparece quando o plano
            permitir mais pessoas.
          </p>
        </div>
        <Link className="btn ghost" to="/sessoes">
          Voltar às sessões
        </Link>
      </header>

      {error && <p className="banner err">{error}</p>}
      {ok && <p className="banner ok">{ok}</p>}

      {professionals.length === 0 && (
        <p className="banner warn">
          Ainda não encontramos seu perfil de atendimento. Saia e entre de novo
          no painel para criar automaticamente, ou recarregue esta página.
        </p>
      )}

      <section className="card pad">
        <h2 className="card-title">
          {editingId ? "Editar serviço" : "Novo serviço"}
        </h2>
        <form className="form-panel" onSubmit={(e) => void onSubmit(e)}>
          <label>
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              placeholder="Ex.: Sessão individual"
            />
          </label>
          <label>
            Descrição (opcional)
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Atendimento clínico 50 min"
            />
          </label>
          <div className="form-row">
            <label>
              Duração (minutos)
              <input
                type="number"
                min={15}
                max={240}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                required
              />
            </label>
            <label>
              Valor da sessão (R$)
              <input
                value={priceReais}
                onChange={(e) => setPriceReais(e.target.value)}
                placeholder="150,00"
                inputMode="decimal"
              />
            </label>
          </div>
          {professionals.length > 0 && (
            <fieldset className="chk-fieldset">
              <legend>Profissionais que oferecem</legend>
              <div className="chk-list">
                {professionals.map((p) => (
                  <label key={p.id} className="chk">
                    <input
                      type="checkbox"
                      checked={professionalIds.includes(p.id)}
                      onChange={() => togglePro(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="btn-row">
            <button
              className="btn primary"
              type="submit"
              disabled={busy || professionals.length === 0}
            >
              {editingId ? "Salvar alterações" : "Cadastrar serviço"}
            </button>
            {editingId && (
              <button
                className="btn ghost"
                type="button"
                onClick={resetForm}
                disabled={busy}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card pad">
        <h2 className="card-title">Cadastrados</h2>
        {services.length === 0 ? (
          <p className="muted">
            Nenhum serviço ainda. Cadastre o primeiro acima para liberar agenda e
            cobranças.
          </p>
        ) : (
          <ul className="catalog-list">
            {services.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>
                    {s.name}
                    {s.active === false ? (
                      <span className="st-muted" style={{ marginLeft: 8 }}>
                        Inativo
                      </span>
                    ) : null}
                  </strong>
                  <p className="muted">
                    {s.description ?? "Sem descrição"}
                    {s.professionals?.length
                      ? ` · ${s.professionals.map((p) => p.name).join(", ")}`
                      : ""}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="muted">
                    {s.durationMinutes} min · {formatPrice(s.priceCents)}
                  </div>
                  <div className="btn-row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
                    <button
                      className="btn ghost sm"
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(s)}
                    >
                      Editar
                    </button>
                    {s.active === false ? (
                      <button
                        className="btn ghost sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void setActive(s.id, true)}
                      >
                        Reativar
                      </button>
                    ) : (
                      <button
                        className="btn ghost sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void setActive(s.id, false)}
                      >
                        Desativar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
