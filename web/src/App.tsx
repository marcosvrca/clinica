import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { AgendaPage } from "./pages/AgendaPage";
import { BookPage } from "./pages/BookPage";
import { PatientsPage } from "./pages/PatientsPage";
import { RecordsPage } from "./pages/RecordsPage";
import {
  FinancePage,
  ReportsPage,
  SessionsPage,
  SettingsPage,
} from "./pages/ExtraPages";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="pacientes" element={<PatientsPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="agendar" element={<BookPage />} />
          <Route path="sessoes" element={<SessionsPage />} />
          <Route path="financeiro" element={<FinancePage />} />
          <Route path="prontuarios" element={<RecordsPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
