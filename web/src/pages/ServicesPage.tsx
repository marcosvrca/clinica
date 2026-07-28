import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Professional, Service } from "../api/types";
import { formatPrice } from "../lib/dates";

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [svc, pros] = await Promise.all([api.services(), api.professionals()]);
        setServices(svc.items);
        setProfessionals(pros.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="muted">Carregando…</p>;
  if (error) return <p className="banner err">{error}</p>;

  return (
    <div className="dash-mid">
      <section className="card pad">
        <h2 className="card-title">Serviços</h2>
        <ul className="catalog-list">
          {services.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <p className="muted">{s.description ?? "Sem descrição"}</p>
              </div>
              <div style={{ textAlign: "right", color: "var(--muted)" }}>
                <div>{s.durationMinutes} min</div>
                <div>{formatPrice(s.priceCents)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card pad">
        <h2 className="card-title">Equipe</h2>
        <ul className="catalog-list">
          {professionals.map((p) => (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <p className="muted">
                  {p.specialty}
                  {p.crp ? ` · ${p.crp}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
