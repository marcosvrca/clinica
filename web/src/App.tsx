import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { AgendaPage } from "./pages/AgendaPage";
import { BookPage } from "./pages/BookPage";
import { PatientsPage } from "./pages/PatientsPage";
import { PatientFormPage } from "./pages/PatientFormPage";
import { PatientDetailPage } from "./pages/PatientDetailPage";
import { RecordsPage } from "./pages/RecordsPage";
import { LoginPage } from "./pages/LoginPage";
import { SubscribePage } from "./pages/SubscribePage";
import { CompleteSignupPage } from "./pages/CompleteSignupPage";
import {
  FinancePage,
  ReportsPage,
  SessionsPage,
  SettingsPage,
} from "./pages/ExtraPages";
import { getToken } from "./lib/auth";

function RequireAuth() {
  const location = useLocation();
  if (!getToken()) {
    const from = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/login?from=${encodeURIComponent(from)}`}
        replace
      />
    );
  }
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/assine" element={<SubscribePage />} />
        <Route path="/cadastro" element={<CompleteSignupPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="pacientes" element={<PatientsPage />} />
            <Route path="pacientes/novo" element={<PatientFormPage />} />
            <Route path="pacientes/:id" element={<PatientDetailPage />} />
            <Route path="pacientes/:id/editar" element={<PatientFormPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="agendar" element={<BookPage />} />
            <Route path="sessoes" element={<SessionsPage />} />
            <Route path="financeiro" element={<FinancePage />} />
            <Route path="prontuarios" element={<RecordsPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
