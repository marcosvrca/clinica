import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Brain } from "lucide-react";
import { api, ApiError } from "../api/client";
import { getToken, setSession } from "../lib/auth";

export function CompleteSignupPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [phone, setPhone] = useState("");
  const [crp, setCrp] = useState("");
  const [specialty, setSpecialty] = useState("Psicologia");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  useEffect(() => {
    if (!token) {
      setLoadError("Link inválido. Solicite um novo envio após o pagamento.");
      return;
    }
    void api
      .signupSetup(token)
      .then((ctx) => {
        setEmail(ctx.email);
        setPlanName(ctx.planName);
      })
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
      const result = await api.signupComplete({
        token,
        fullName: fullName.trim(),
        clinicName: clinicName.trim(),
        phone: phone.trim() || undefined,
        password,
        crp: crp.trim() || undefined,
        specialty: specialty.trim() || undefined,
      });
      // Login imediato após cadastro
      const login = await api.login(result.user.email, password);
      setSession(login.token, login.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Falha ao finalizar cadastro",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card signup-card">
        <div className="login-brand">
          <div className="brand-icon" aria-hidden>
            <Brain size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1>Bem Estar</h1>
            <p>Finalize seu cadastro</p>
          </div>
        </div>

        {loadError ? (
          <>
            <p className="banner err">{loadError}</p>
            <p className="muted login-hint">
              <Link to="/assine">Voltar à assinatura</Link>
              {" · "}
              <Link to="/login">Entrar</Link>
            </p>
          </>
        ) : !email ? (
          <p className="muted">Validando link…</p>
        ) : (
          <form onSubmit={onSubmit}>
            {error ? <p className="banner err">{error}</p> : null}

            <p className="muted signup-context">
              Conta: <strong>{email}</strong>
              {planName ? <> · {planName}</> : null}
            </p>

            <label className="field-block">
              <span>Nome completo</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={3}
                autoComplete="name"
                placeholder="Seu nome profissional"
              />
            </label>

            <label className="field-block">
              <span>Nome da clínica / consultório</span>
              <input
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                required
                minLength={2}
                placeholder="Ex.: Clínica Bem Estar"
              />
            </label>

            <label className="field-block">
              <span>Telefone / WhatsApp</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="(63) 99999-0000"
              />
            </label>

            <div className="signup-row">
              <label className="field-block">
                <span>CRP</span>
                <input
                  value={crp}
                  onChange={(e) => setCrp(e.target.value)}
                  placeholder="CRP 00/0000"
                />
              </label>
              <label className="field-block">
                <span>Especialidade</span>
                <input
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="Psicologia"
                />
              </label>
            </div>

            <label className="field-block">
              <span>Senha de acesso</span>
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

            <button type="submit" className="btn teal block" disabled={loading}>
              {loading ? "Criando conta…" : "Concluir cadastro"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
