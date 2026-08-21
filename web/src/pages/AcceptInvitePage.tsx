import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLockup } from "../components/BrandLockup";
import { api, ApiError } from "../api/client";
import { getToken, setSession } from "../lib/auth";

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  useEffect(() => {
    if (!token) {
      setLoadError("Link inválido. Peça um novo convite.");
      return;
    }
    void api
      .staffInviteContext(token)
      .then((ctx) => {
        setEmail(ctx.email);
        setClinicName(ctx.clinicName);
        setName(ctx.name);
      })
      .catch((err) =>
        setLoadError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Não foi possível validar o convite",
        ),
      );
  }, [token]);

  if (getToken()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== password2) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.staffAcceptInvite({
        token,
        password,
        name: name.trim() || undefined,
      });
      const login = await api.login(email!, password);
      setSession(login.token, login.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Falha ao aceitar convite",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card signup-card">
        <BrandLockup subtitle="Aceitar convite" />

        {loadError ? (
          <p className="banner err">{loadError}</p>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.85rem" }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              {clinicName
                ? `Você foi convidado(a) para ${clinicName}.`
                : "Validando convite…"}
              {email ? ` Conta: ${email}` : ""}
            </p>

            {error ? <p className="banner err">{error}</p> : null}

            <label className="field-block">
              <span>Nome</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </label>

            <label className="field-block">
              <span>Senha</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>

            <label className="field-block">
              <span>Confirmar senha</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                minLength={8}
              />
            </label>

            <button
              type="submit"
              className="btn teal block"
              disabled={loading || !email}
            >
              {loading ? "Salvando…" : "Definir senha e entrar"}
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
