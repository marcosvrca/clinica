import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api/client";
import { getStoredUser } from "../lib/auth";

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function PlatformPage() {
  const stored = getStoredUser();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof api.platformOverview>
  > | null>(null);

  useEffect(() => {
    if (!stored?.isPlatformAdmin) return;
    void api
      .platformOverview()
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar"),
      );
  }, [stored?.isPlatformAdmin]);

  if (!stored?.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }

  const k = data?.kpis;

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {error ? <p className="banner err">{error}</p> : null}

      <div className="card pad">
        <h2 className="card-title" style={{ marginTop: 0 }}>
          Plataforma
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Área restrita: métricas SaaS e clínicas. Separada do consultório do
          psicólogo.
        </p>
      </div>

      {k ? (
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          }}
        >
          {[
            ["Clínicas", String(k.clinics)],
            ["Usuários ativos", String(k.staffActive)],
            ["Pacientes", String(k.patients)],
            ["Sessões no mês", String(k.appointmentsThisMonth)],
            ["Assinaturas pagantes", String(k.subscriptionsPaying)],
            ["Complimentary", String(k.subscriptionsComplimentary)],
            ["Em atraso", String(k.subscriptionsPastDue)],
            ["Individual", money(k.planAmountCents) + "/mês"],
            [
              "Compartilhado",
              money(k.teamPlanAmountCents ?? 6990) + "/mês",
            ],
            ["Receita sessões (mês)", money(k.sessionRevenueCentsThisMonth)],
          ].map(([label, value]) => (
            <div key={label} className="card pad">
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                {label}
              </div>
              <strong style={{ fontSize: "1.15rem" }}>{value}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Carregando…</p>
      )}

      <div className="card pad">
        <h3 className="card-title sm">Clínicas</h3>
        <ul className="catalog-list">
          {!data?.clinics.length ? (
            <li className="muted">Nenhuma clínica.</li>
          ) : (
            data.clinics.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>
                    {c.name} · {c.slug}
                  </strong>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    Staff {c.staffCount} · pacientes {c.patientCount} · sessões{" "}
                    {c.appointmentCount}
                    {c.billing
                      ? ` · ${c.billing.method ?? "—"} / ${c.billing.billingStatus} · ${c.billing.email}`
                      : " · sem assinatura"}
                  </div>
                </div>
                <span className={`status ${c.active ? "st-ok" : "st-muted"}`}>
                  {c.active ? "ativa" : "inativa"}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
