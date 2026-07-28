import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  Brain,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  Wallet,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import { api } from "../api/client";
import { initials } from "../lib/ui";

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
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/sessoes", label: "Sessões", icon: ClipboardList },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/prontuarios", label: "Prontuários", icon: FileText },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

const PAGE_META: Record<
  string,
  { title: string; subtitle: string; search: string; quote: string }
> = {
  "/": {
    title: "Dashboard",
    subtitle: "Bem-vinda de volta",
    search: "Buscar pacientes, sessões, prontuários...",
    quote: "Acolher é transformar vidas todos os dias.",
  },
  "/pacientes": {
    title: "Pacientes",
    subtitle: "Gerencie e acompanhe seus pacientes",
    search: "Buscar pacientes pelo nome, telefone ou e-mail...",
    quote: "Cuidar de pessoas transforma vidas. E você transforma todos os dias.",
  },
  "/agenda": {
    title: "Agenda",
    subtitle: "Visualize e gerencie seus atendimentos",
    search: "Buscar pacientes, horários ou sessões...",
    quote: "Organização que gera mais tempo para o que importa: seus pacientes.",
  },
  "/agendar": {
    title: "Novo atendimento",
    subtitle: "Escolha serviço, horário e paciente",
    search: "Buscar pacientes, horários ou sessões...",
    quote: "Organização que gera mais tempo para o que importa: seus pacientes.",
  },
  "/sessoes": {
    title: "Sessões",
    subtitle: "Serviços e equipe da clínica",
    search: "Buscar serviços ou profissionais...",
    quote: "Cuidar de pessoas transforma vidas. E você transforma todos os dias.",
  },
  "/financeiro": {
    title: "Financeiro",
    subtitle: "Acompanhe a receita estimada da clínica",
    search: "Buscar lançamentos...",
    quote: "Organização que gera mais tempo para o que importa: seus pacientes.",
  },
  "/prontuarios": {
    title: "Prontuários",
    subtitle: "Registros clínicos dos pacientes",
    search: "Buscar prontuários...",
    quote: "Cuidar de pessoas transforma vidas. E você transforma todos os dias.",
  },
  "/relatorios": {
    title: "Relatórios",
    subtitle: "Indicadores e evolução da clínica",
    search: "Buscar relatórios...",
    quote: "Organização que gera mais tempo para o que importa: seus pacientes.",
  },
  "/configuracoes": {
    title: "Configurações",
    subtitle: "Preferências do painel e da API",
    search: "Buscar configurações...",
    quote: "Cuidar de pessoas transforma vidas. E você transforma todos os dias.",
  },
};

export function Layout() {
  const location = useLocation();
  const [clinicName, setClinicName] = useState("Clínica Bem Estar");
  const [professionalName, setProfessionalName] = useState("Dra. Ana Carolina");
  const [specialty, setSpecialty] = useState("Psicóloga");

  useEffect(() => {
    void (async () => {
      try {
        const [clinic, dash] = await Promise.all([api.clinic(), api.dashboard()]);
        setClinicName(clinic.name);
        if (dash.professional) {
          setProfessionalName(dash.professional.name);
          setSpecialty(
            dash.professional.specialty?.toLowerCase().includes("psic")
              ? "Psicóloga"
              : dash.professional.specialty || "Psicóloga",
          );
        }
      } catch {
        /* defaults */
      }
    })();
  }, []);

  const meta = PAGE_META[location.pathname] ?? {
    title: clinicName,
    subtitle: "",
    search: "Buscar...",
    quote: "Cuidar de pessoas transforma vidas. E você transforma todos os dias.",
  };

  const subtitle =
    location.pathname === "/"
      ? `Bem-vinda de volta, ${professionalName}`
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
              <Brain size={22} strokeWidth={2.2} />
            </div>
            <div>
              <p className="brand-title">Clínica Bem Estar</p>
              <p className="brand-sub">Psicologia</p>
            </div>
          </div>

          <nav className="side-nav">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={"end" in item ? item.end : false}
                  className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                >
                  <Icon size={18} strokeWidth={2} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="side-quote">
            <div className="quote-art" aria-hidden>
              <span className="quote-plant">🪴</span>
              <span className="quote-chair">🪑</span>
            </div>
            <p>{meta.quote}</p>
          </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="topbar-title">
              <h1>{meta.title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>

            <label className="search">
              <Search size={16} />
              <input placeholder={meta.search} />
              <kbd>Ctrl + K</kbd>
            </label>

            <div className="topbar-actions">
              <button type="button" className="icon-btn" aria-label="Notificações">
                <Bell size={18} />
                <span className="badge-dot">3</span>
              </button>
              <div className="profile">
                <div className="avatar">{initials(professionalName, "AC")}</div>
                <div>
                  <strong>{professionalName}</strong>
                  <span>{specialty}</span>
                </div>
                <ChevronDown size={16} className="muted-icon" />
              </div>
            </div>
          </header>

          <main className="page-area">
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
