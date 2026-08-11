import { type FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Brain } from "lucide-react";
import { api, ApiError } from "../api/client";
import { getToken } from "../lib/auth";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (getToken()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setDevUrl(null);
    try {
      const res = await api.forgotPassword(email.trim());
      setInfo(
        "Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.",
      );
      if (res.resetUrl) setDevUrl(res.resetUrl);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Falha ao solicitar redefinição",
      );
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
            <p>Recuperar senha</p>
          </div>
        </div>

        {error ? <p className="banner err">{error}</p> : null}
        {info ? <p className="banner ok">{info}</p> : null}
        {devUrl ? (
          <p className="muted login-hint">
            Dev:{" "}
            <a href={devUrl}>abrir link de redefinição</a>
          </p>
        ) : null}

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

        <button type="submit" className="btn teal block" disabled={loading}>
          {loading ? "Enviando…" : "Enviar link"}
        </button>

        <p className="muted login-hint">
          <Link to="/login">Voltar ao login</Link>
        </p>
      </form>
    </div>
  );
}
