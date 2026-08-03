import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Brain, Check } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { SoftwareSubscription, SubscriptionPlan } from "../api/types";
import { getToken } from "../lib/auth";

function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function toAppPath(url: string) {
  try {
    const u = new URL(url, window.location.origin);
    return `${u.pathname}${u.search}`;
  } catch {
    return url.startsWith("/") ? url : "/cadastro";
  }
}

export function SubscribePage() {
  const [searchParams] = useSearchParams();
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkout, setCheckout] = useState<SoftwareSubscription | null>(null);
  const [paidInfo, setPaidInfo] = useState<{
    emailSent: boolean;
    setupUrl: string | null;
    reason?: string;
  } | null>(null);

  useEffect(() => {
    void api
      .signupPlan()
      .then((r) => setPlan(r.plan))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Falha ao carregar plano"),
      );
  }, []);

  useEffect(() => {
    const paidId = searchParams.get("paid");
    if (!paidId) return;
    void api
      .signupStatus(paidId)
      .then((s) => {
        setCheckout(s);
        if (s.status === "paid" || s.status === "completed") {
          setPaidInfo({
            emailSent: Boolean(s.setupEmailSentAt),
            setupUrl: null,
          });
        }
      })
      .catch(() => undefined);
  }, [searchParams]);

  if (getToken()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPaidInfo(null);
    try {
      const created = await api.signupCheckout({
        email: email.trim(),
        method: "card",
      });
      setCheckout(created);
      if (created.complimentary && created.setup) {
        setPaidInfo({
          emailSent: created.setup.emailSent,
          setupUrl: created.setup.setupUrl,
          reason: created.setup.emailSkippedReason,
        });
        return;
      }
      if (created.checkoutUrl && !created.sandbox) {
        window.location.assign(created.checkoutUrl);
        return;
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Falha ao iniciar assinatura",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSimulate() {
    if (!checkout?.simulateToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.signupSimulate(
        checkout.id,
        checkout.simulateToken,
      );
      setCheckout(result.subscription);
      setPaidInfo({
        emailSent: result.setup?.emailSent ?? false,
        setupUrl: result.setup?.setupUrl ?? null,
        reason: result.setup?.emailSkippedReason,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na simulação");
    } finally {
      setLoading(false);
    }
  }

  const showCheckout =
    checkout && checkout.status === "pending_payment" && !paidInfo;

  return (
    <div className="login-page">
      <div className="login-card signup-card">
        <div className="login-brand">
          <div className="brand-icon" aria-hidden>
            <Brain size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1>Bem Estar</h1>
            <p>Assinatura mensal do painel</p>
          </div>
        </div>

        {error ? <p className="banner err">{error}</p> : null}

        {paidInfo ? (
          <div className="signup-success">
            <div className="signup-success-icon" aria-hidden>
              <Check size={22} strokeWidth={2.25} />
            </div>
            <h2>Pagamento confirmado</h2>
            <p>
              {paidInfo.emailSent
                ? "Enviamos um link para o e-mail cadastrado. Use-o para finalizar o cadastro (nome completo e dados do consultório)."
                : "Pagamento confirmado. O envio de e-mail está indisponível no momento — use o link abaixo para finalizar."}
            </p>
            {paidInfo.setupUrl ? (
              <Link className="btn teal block" to={toAppPath(paidInfo.setupUrl)}>
                Finalizar cadastro
              </Link>
            ) : null}
            {paidInfo.reason && !paidInfo.emailSent ? (
              <p className="muted login-hint">{paidInfo.reason}</p>
            ) : null}
            <p className="muted login-hint">
              Já finalizou? <Link to="/login">Entrar</Link>
            </p>
          </div>
        ) : showCheckout ? (
          <div className="signup-checkout">
            <p className="muted">
              Assinatura para <strong>{checkout.email}</strong>
            </p>
            <p className="signup-amount">
              {formatMoney(checkout.amountCents)}
              <small> / mês</small>
            </p>
            {checkout.checkoutUrl ? (
              <a className="btn teal block" href={checkout.checkoutUrl}>
                Continuar no Mercado Pago
              </a>
            ) : null}

            {checkout.simulateToken ? (
              <button
                type="button"
                className="btn ghost block"
                disabled={loading}
                onClick={() => void onSimulate()}
              >
                {loading ? "Confirmando…" : "Simular pagamento (sandbox)"}
              </button>
            ) : (
              <p className="muted login-hint">
                Após autorizar a assinatura no Mercado Pago, o link de cadastro
                chega no e-mail. A cobrança renova automaticamente todo mês.
              </p>
            )}

            <button
              type="button"
              className="btn ghost block"
              onClick={() => {
                setCheckout(null);
                setPaidInfo(null);
              }}
            >
              Usar outro e-mail
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            {plan ? (
              <div className="signup-plan">
                <div>
                  <strong>{plan.name}</strong>
                  <p>{plan.description}</p>
                  <p className="muted login-hint">
                    Renovação automática mensal via Mercado Pago (cartão).
                  </p>
                </div>
                <div className="signup-plan-price">
                  <span>{formatMoney(plan.amountCents)}</span>
                  <small>/ mês</small>
                </div>
              </div>
            ) : (
              <p className="muted">Carregando plano…</p>
            )}

            <label className="field-block">
              <span>E-mail de cadastro</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="voce@consultorio.com"
              />
            </label>

            <button
              type="submit"
              className="btn teal block"
              disabled={loading || !plan}
            >
              {loading ? "Abrindo Mercado Pago…" : "Assinar com Mercado Pago"}
            </button>
          </form>
        )}

        <p className="muted login-hint">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
