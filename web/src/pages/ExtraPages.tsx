import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { formatPrice } from "../lib/dates";
import type { DashboardData } from "../api/types";
import { PlaceholderPage } from "../components/Layout";
import { ServicesPage } from "./ServicesPage";

export function FinancePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setData(await api.dashboard());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      }
    })();
  }, []);

  if (error) return <p className="banner err">{error}</p>;
  if (!data) return <p className="muted">Carregando…</p>;

  return (
    <div>
      <div className="page-actions">
        <Link to="/agenda" className="btn ghost">
          Ver agenda
        </Link>
        <Link to="/agendar" className="btn teal">
          + Novo atendimento
        </Link>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <article className="stat-card">
          <div className="stat-icon lilac">💰</div>
          <div>
            <span>Faturamento do mês</span>
            <strong>{formatPrice(data.kpis.monthlyRevenueCents)}</strong>
            <em>serviços confirmados</em>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon green">📅</div>
          <div>
            <span>Consultas no mês</span>
            <strong>{data.evolution[data.evolution.length - 1]?.count ?? 0}</strong>
            <em>atendimentos confirmados</em>
          </div>
        </article>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void api.dashboard().then(setData).catch(() => undefined);
  }, []);

  return (
    <div className="card pad">
      <div className="card-head">
        <h2 className="card-title" style={{ margin: 0 }}>
          Indicadores
        </h2>
        <Link to="/pacientes" className="link-btn">
          Ver pacientes
        </Link>
      </div>
      {!data ? (
        <p className="muted">Carregando…</p>
      ) : (
        <ul className="catalog-list">
          <li>
            <strong>Pacientes ativos</strong>
            <span>{data.kpis.activePatients}</span>
          </li>
          <li>
            <strong>Consultas hoje</strong>
            <span>{data.kpis.todayAppointments}</span>
          </li>
          <li>
            <strong>Taxa de comparecimento</strong>
            <span>{data.kpis.attendanceRate}%</span>
          </li>
          <li>
            <strong>Receita mensal estimada</strong>
            <span>{formatPrice(data.kpis.monthlyRevenueCents)}</span>
          </li>
        </ul>
      )}
    </div>
  );
}

export function SessionsPage() {
  return (
    <div>
      <div className="page-actions">
        <Link to="/agendar" className="btn teal">
          + Novo atendimento
        </Link>
      </div>
      <ServicesPage />
    </div>
  );
}

export function SettingsPage() {
  return (
    <PlaceholderPage title="Configurações">
      <ul className="catalog-list">
        <li>
          <strong>API</strong>
          <span>http://localhost:4000</span>
        </li>
        <li>
          <strong>Autenticação</strong>
          <span>Header x-api-key</span>
        </li>
        <li>
          <strong>Cancelamento mínimo</strong>
          <span>2 horas de antecedência</span>
        </li>
        <li>
          <strong>Tema</strong>
          <span>Clínica Bem Estar</span>
        </li>
      </ul>
    </PlaceholderPage>
  );
}
