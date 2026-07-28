import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CloudUpload,
  Download,
  Filter,
  Heart,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "../api/client";
import type { Patient, PatientsResponse } from "../api/types";
import { formatShortDay, formatTime } from "../lib/dates";
import { avatarColor, initials, planTone } from "../lib/ui";

export function PatientsPage() {
  const [data, setData] = useState<PatientsResponse | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos");
  const [therapist, setTherapist] = useState("todos");
  const [plan, setPlan] = useState("todos");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [view, setView] = useState<"list" | "grid">("list");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setData(await api.patients());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar pacientes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const therapists = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of data?.items ?? []) {
      if (p.therapist) map.set(p.therapist.id, p.therapist.name);
    }
    return [...map.entries()];
  }, [data]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((p) => {
      const hay = `${p.name ?? ""} ${p.phone} ${p.email ?? ""}`.toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (status !== "todos" && p.status !== status) return false;
      if (therapist !== "todos" && p.therapist?.id !== therapist) return false;
      if (plan !== "todos" && p.plan.toLowerCase() !== plan) return false;
      return true;
    });
  }, [data, q, status, therapist, plan]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const stats = data?.stats;

  return (
    <div className="patients-page">
      <div className="page-actions">
        <button type="button" className="btn ghost">
          <CloudUpload size={16} /> Importar pacientes
        </button>
        <Link to="/agendar" className="btn teal">
          <Plus size={16} /> Novo paciente
        </Link>
      </div>

      {error && <p className="banner err">{error}</p>}

      <section className="kpi-grid patients-kpi">
        <article className="stat-card">
          <div className="stat-icon blue">
            <Users size={18} />
          </div>
          <div>
            <span>Total de pacientes</span>
            <strong>{stats?.total ?? "—"}</strong>
            <em className="up">cadastros na clínica</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon green">
            <UserCheck size={18} />
          </div>
          <div>
            <span>Pacientes ativos</span>
            <strong>{stats?.active ?? "—"}</strong>
            <em>{stats ? `${stats.activePct}% do total` : ""}</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon lilac">
            <UserPlus size={18} />
          </div>
          <div>
            <span>Novos este mês</span>
            <strong>{stats?.newThisMonth ?? "—"}</strong>
            <em className="up">no mês atual</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon teal">
            <Heart size={18} />
          </div>
          <div>
            <span>Retorno médio</span>
            <strong>{stats ? `${stats.returnRate}%` : "—"}</strong>
            <em>Taxa de reconsulta</em>
          </div>
        </article>
      </section>

      <section className="card table-card">
        <div className="table-toolbar">
          <label className="table-search">
            <Search size={15} />
            <input
              placeholder="Buscar paciente..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Status: Todos</option>
            <option value="ativo">Ativo</option>
            <option value="pausado">Em pausa</option>
          </select>

          <select
            value={therapist}
            onChange={(e) => {
              setTherapist(e.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Terapeuta: Todos</option>
            {therapists.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Plano: Todos</option>
            <option value="avulso">Avulso</option>
            <option value="mensal">Mensal</option>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </select>

          <button type="button" className="btn ghost sm">
            <Filter size={14} /> Mais filtros
          </button>

          <div className="toolbar-right">
            <button type="button" className="btn ghost sm">
              <Download size={14} /> Exportar
            </button>
            <div className="view-toggle">
              <button
                type="button"
                className={view === "list" ? "on" : ""}
                onClick={() => setView("list")}
                aria-label="Lista"
              >
                <List size={15} />
              </button>
              <button
                type="button"
                className={view === "grid" ? "on" : ""}
                onClick={() => setView("grid")}
                aria-label="Grade"
              >
                <LayoutGrid size={15} />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="muted pad">Carregando pacientes…</p>
        ) : filtered.length === 0 ? (
          <p className="muted pad">Nenhum paciente encontrado.</p>
        ) : view === "list" ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="check-col">
                    <input type="checkbox" aria-label="Selecionar todos" />
                  </th>
                  <th>Paciente</th>
                  <th>Contato</th>
                  <th>Terapeuta</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>Última sessão</th>
                  <th>Próxima sessão</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {slice.map((p) => (
                  <PatientRow key={p.id} patient={p} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="patient-grid">
            {slice.map((p) => (
              <PatientCard key={p.id} patient={p} />
            ))}
          </div>
        )}

        <div className="table-foot">
          <span>
            Mostrando {(pageSafe - 1) * perPage + 1} a{" "}
            {Math.min(pageSafe * perPage, filtered.length)} de {filtered.length} pacientes
          </span>
          <div className="pager">
            <button
              type="button"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={n === pageSafe ? "on" : ""}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            {totalPages > 5 && <span>…</span>}
            <button
              type="button"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>
          </div>
          <label className="per-page">
            Itens por página:
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}

function PatientRow({ patient: p }: { patient: Patient }) {
  const name = p.name ?? "Sem nome";
  return (
    <tr>
      <td className="check-col">
        <input type="checkbox" aria-label={`Selecionar ${name}`} />
      </td>
      <td>
        <div className="person-cell">
          <div className="avatar sm" style={{ background: avatarColor(name) }}>
            {initials(p.name, p.phone)}
          </div>
          <div>
            <strong>{name}</strong>
            <span className="muted">{p.appointmentsCount} consultas</span>
          </div>
        </div>
      </td>
      <td>
        <div className="stack">
          <span>{p.phone}</span>
          <span className="muted">{p.email ?? "—"}</span>
        </div>
      </td>
      <td>
        {p.therapist ? (
          <div className="person-cell">
            <div
              className="avatar xs"
              style={{ background: avatarColor(p.therapist.name) }}
            >
              {initials(p.therapist.name)}
            </div>
            <div>
              <strong>{p.therapist.name}</strong>
              <span className="mini-tag">{p.therapist.tag}</span>
            </div>
          </div>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <span className={`pill ${planTone(p.plan)}`}>{p.plan}</span>
      </td>
      <td>
        <span className={`status-dot ${p.status === "ativo" ? "ok" : "warn"}`}>
          {p.status === "ativo" ? "Ativo" : "Em pausa"}
        </span>
      </td>
      <td>
        {p.lastAppointment ? formatShortDay(p.lastAppointment.start) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        {p.nextAppointment ? (
          <div className="stack">
            <span>{formatShortDay(p.nextAppointment.start)}</span>
            <span className="muted">{formatTime(p.nextAppointment.start)}</span>
          </div>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td>
        <Link
          to={`/prontuarios?patientId=${p.id}`}
          className="icon-btn soft"
          aria-label="Ver prontuário"
          title="Ver prontuário"
        >
          <MoreHorizontal size={16} />
        </Link>
      </td>
    </tr>
  );
}

function PatientCard({ patient: p }: { patient: Patient }) {
  const name = p.name ?? "Sem nome";
  return (
    <article className="patient-card">
      <div className="person-cell">
        <div className="avatar" style={{ background: avatarColor(name) }}>
          {initials(p.name, p.phone)}
        </div>
        <div>
          <strong>{name}</strong>
          <span className="muted">{p.phone}</span>
        </div>
      </div>
      <div className="card-meta">
        <span className={`pill ${planTone(p.plan)}`}>{p.plan}</span>
        <span className={`status-dot ${p.status === "ativo" ? "ok" : "warn"}`}>
          {p.status === "ativo" ? "Ativo" : "Em pausa"}
        </span>
      </div>
      <Link to={`/prontuarios?patientId=${p.id}`} className="btn ghost sm">
        Prontuário
      </Link>
    </article>
  );
}
