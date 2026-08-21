import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BrandLockup } from "../components/BrandLockup";
import { api, ApiError } from "../api/client";
import { getToken } from "../lib/auth";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  useEffect(() => {
    if (!token) {
      setLoadError("Link inválido. Solicite um novo.");
      return;
    }
    void api
      .resetPasswordContext(token)
      .then((ctx) => setEmail(ctx.email))
      .catch((err) =>
        setLoadError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Não foi possível validar o link",
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
      await api.resetPassword({ token, password });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Falha ao redefinir senha",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card signup-card">
        <BrandLockup subtitle="Nova senha" />

        {loadError ? (
          <p className="banner err">{loadError}</p>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.85rem" }}>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              {email ? `Conta: ${email}` : "Validando link…"}
            </p>

            {error ? <p className="banner err">{error}</p> : null}

            <label className="field-block">
              <span>Nova senha</span>
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
              {loading ? "Salvando…" : "Salvar senha"}
            </button>
          </form>
        )}

        <p className="muted login-hint">
          <Link to="/login">Voltar ao login</Link>
        </p>
      </div>
    </div>
  );
}
