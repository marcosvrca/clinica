import { type FormEvent, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Brain } from "lucide-react";
import { api } from "../api/client";
import { getToken, setSession } from "../lib/auth";

function safeReturnPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("from"));
  const [email, setEmail] = useState(
    import.meta.env.DEV ? "ana@bemestar.local" : "",
  );
  const [password, setPassword] = useState(
    import.meta.env.DEV ? "demo1234" : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    return <Navigate to={returnTo} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email.trim(), password);
      setSession(res.token, res.user);
      window.location.assign(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <div className="brand-icon" aria-hidden>
            <Brain size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1>Bem Estar</h1>
            <p>Acesso do profissional</p>
          </div>
        </div>

        {error ? <p className="banner err">{error}</p> : null}

        <label className="field-block">
          <span>E-mail</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="field-block">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>

        <button type="submit" className="btn teal block" disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <p className="muted login-hint">
          <Link to="/recuperar-senha">Esqueci a senha</Link>
          {" · "}
          Ainda não tem uma conta? <Link to="/assine">Registre-se</Link>
        </p>

        {import.meta.env.DEV ? (
          <p className="muted login-hint">Demo: ana@bemestar.local / demo1234</p>
        ) : null}
      </form>
    </div>
  );
}
