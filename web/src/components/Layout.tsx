import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Brain,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Wallet,
  BarChart3,
} from "lucide-react";
import { api } from "../api/client";
import { clearSession, getStoredUser } from "../lib/auth";
import { initials } from "../lib/ui";
import { TopbarSearch } from "./TopbarSearch";

type ShellCtx = {
  clinicName: string;
  professionalName: string;
  specialty: string;
};

const ShellContext = createContext<ShellCtx>({
  clinicName: "Clínica Bem Estar",
  professionalName: "Dra. Ana Carolina",
  specialty: "Psicóloga",
});

export function useShell() {
  return useContext(ShellContext);
}

const NAV = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/sessoes", label: "Sessões", icon: ClipboardList },
  { to: "/prontuarios", label: "Prontuários", icon: FileText },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

const PAGE_META: Record<string, { title: string; subtitle: string; search: string }> = {
  "/": {
    title: "Início",
    subtitle: "O que precisa da sua atenção hoje",
    search: "Buscar pacientes…",
  },
  "/pacientes": {
    title: "Pacientes",
    subtitle: "Cadastros e acompanhamento",
    search: "Buscar pacientes…",
  },
  "/pacientes/novo": {
    title: "Novo paciente",
    subtitle: "Cadastro",
    search: "Buscar pacientes…",
  },
  "/agenda": {
    title: "Agenda",
    subtitle: "Sessões e bloqueios",
    search: "Buscar pacientes…",
  },
  "/agendar": {
    title: "Novo atendimento",
    subtitle: "Serviço, horário e paciente",
    search: "Buscar pacientes…",
  },
  "/sessoes": {
    title: "Sessões",
    subtitle: "Atendimentos, serviços e equipe",
    search: "Buscar pacientes…",
  },
  "/financeiro": {
    title: "Financeiro",
    subtitle: "Recebimentos e pendências",
    search: "Buscar pacientes…",
  },
  "/prontuarios": {
    title: "Prontuários",
    subtitle: "Rascunhos e evoluções confirmadas",
    search: "Buscar pacientes…",
  },
  "/relatorios": {
    title: "Relatórios",
    subtitle: "Indicadores da clínica",
    search: "Buscar pacientes…",
  },
  "/configuracoes": {
    title: "Configurações",
    subtitle: "Preferências e integrações",
    search: "Buscar pacientes…",
  },
};

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const stored = getStoredUser();
  const [clinicName, setClinicName] = useState(stored?.clinic.name ?? "Clínica Bem Estar");
  const [professionalName, setProfessionalName] = useState(
    stored?.name ?? "Dra. Ana Carolina",
  );
  const [specialty, setSpecialty] = useState("Psicóloga");
  const [billingBanner, setBillingBanner] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [clinic, dash, me] = await Promise.all([
          api.clinic(),
          api.dashboard(),
          api.me(),
        ]);
        setClinicName(clinic.name);
        setProfessionalName(me.name);
        if (dash.professional) {
          setSpecialty(
            dash.professional.specialty?.toLowerCase().includes("psic")
              ? "Psicóloga"
              : dash.professional.specialty || "Psicóloga",
          );
        }
        const b = me.billing;
        if (b?.billingBlocked) {
          setBillingBanner(
            b.billingStatus === "cancelled"
              ? "Assinatura cancelada. Regularize o pagamento para voltar a editar dados."
              : "Pagamento da assinatura em atraso. Após o período de cortesia, alterações ficam bloqueadas.",
          );
        } else if (b?.billingStatus === "past_due") {
          setBillingBanner(
            "Não conseguimos renovar sua assinatura. Atualize o pagamento no Mercado Pago para evitar bloqueio.",
          );
        } else {
          setBillingBanner(null);
        }
      } catch {
        /* defaults */
      }
    })();
  }, []);

  function logout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  const meta =
    PAGE_META[location.pathname] ??
    (location.pathname.startsWith("/pacientes/")
      ? {
          title: location.pathname.endsWith("/editar")
            ? "Editar paciente"
            : "Paciente",
          subtitle: "Dados e histórico",
          search: "Buscar…",
        }
      : {
          title: clinicName,
          subtitle: "",
          search: "Buscar…",
        });

  const subtitle =
    location.pathname === "/"
      ? `Olá, ${professionalName.split(" ")[0]}`
      : meta.subtitle;

  const ctx = useMemo(
    () => ({ clinicName, professionalName, specialty }),
    [clinicName, professionalName, specialty],
  );

  return (
    <ShellContext.Provider value={ctx}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-icon" aria-hidden>
              <Brain size={20} strokeWidth={1.75} />
            </div>
            <div>
              <p className="brand-title">Bem Estar</p>
              <p className="brand-sub">Clínica</p>
            </div>
          </div>

          <nav className="side-nav" aria-label="Principal">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                >
                  <Icon size={18} strokeWidth={1.75} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="sidebar-foot">
            <div className="profile sidebar-profile">
              <div className="avatar">{initials(professionalName, "AC")}</div>
              <div>
                <strong>{professionalName}</strong>
                <span>{specialty}</span>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Sair"
              title="Sair"
              onClick={logout}
            >
              <LogOut size={18} strokeWidth={1.75} />
            </button>
          </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="topbar-title">
              <h1>{meta.title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>

            <TopbarSearch placeholder={meta.search} />

            <div className="topbar-actions">
              <button
                type="button"
                className="icon-btn topbar-logout"
                aria-label="Sair"
                title="Sair"
                onClick={logout}
              >
                <LogOut size={18} strokeWidth={1.75} />
              </button>
            </div>
          </header>

          <main className="page-area">
            {billingBanner ? (
              <p className="banner err" role="status">
                {billingBanner}
              </p>
            ) : null}
            <Outlet />
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}

export function PlaceholderPage({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card pad">
      <h2 className="card-title">{title}</h2>
      {children ?? (
        <p className="muted">Conteúdo em construção — dados virão da API da clínica.</p>
      )}
    </div>
  );
}
