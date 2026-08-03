import type {
  Appointment,
  CalendarBlock,
  Clinic,
  ClinicalRecord,
  ClinicalRecordFile,
  ClinicalRecordsResponse,
  ClinicalRecordWrite,
  ClinicalFileKind,
  DashboardData,
  EvolutionDraftResponse,
  PatientsResponse,
  Payment,
  PaymentsResponse,
  FinanceOverview,
  Expense,
  SessionPackage,
  PaymentMethod,
  PaymentKind,
  ExpenseCategory,
  OnlineProvider,
  OnlineProviderInfo,
  Professional,
  Reminder,
  Service,
  Slot,
  AuthUser,
  SoftwareSubscription,
  SubscriptionPlan,
} from "./types";
import { clearSession, getToken } from "../lib/auth";
import { createPatientsApi } from "./patients";

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;

  if (!res.ok) {
    throw new ApiError(data.error ?? `Erro ${res.status}`, res.status);
  }
  return data;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;

  if (res.status === 401 && !path.startsWith("/v1/auth/login")) {
    clearSession();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign("/login");
    }
    throw new ApiError(data.error ?? "unauthorized", 401);
  }

  if (!res.ok) {
    throw new ApiError(data.error ?? `Erro ${res.status}`, res.status);
  }
  return data;
}

function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signupPlan: () =>
    publicRequest<{ plan: SubscriptionPlan }>("/v1/public/signup/plan"),
  signupCheckout: (body: {
    email: string;
    method?: "pix" | "card";
    provider?: OnlineProvider;
  }) =>
    publicRequest<
      SoftwareSubscription & {
        sandbox?: boolean;
        simulateToken?: string | null;
        complimentary?: boolean;
        setup?: {
          setupUrl: string | null;
          emailSent: boolean;
          emailSkippedReason?: string;
        };
      }
    >("/v1/public/signup/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  signupStatus: (id: string) =>
    publicRequest<SoftwareSubscription>(`/v1/public/signup/${id}`),
  signupSimulate: (id: string, token: string) =>
    publicRequest<{
      subscription: SoftwareSubscription;
      alreadyPaid: boolean;
      setup: {
        setupUrl: string | null;
        emailSent: boolean;
        emailSkippedReason?: string;
      } | null;
      message?: string;
    }>(`/v1/public/signup/${id}/simulate`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  signupSetup: (token: string) =>
    publicRequest<{
      email: string;
      planName: string;
      amountCents: number;
      expiresAt: string;
    }>(`/v1/public/signup/setup${qs({ token })}`),
  signupComplete: (body: {
    token: string;
    fullName: string;
    clinicName: string;
    phone?: string;
    password: string;
    crp?: string;
    specialty?: string;
  }) =>
    publicRequest<{
      ok: true;
      message: string;
      user: AuthUser;
    }>("/v1/public/signup/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<AuthUser>("/v1/auth/me"),
  billing: () =>
    request<{
      billingStatus: "none" | "active" | "past_due" | "cancelled";
      billingBlocked: boolean;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      complimentary: boolean;
      hasSubscription: boolean;
    }>("/v1/billing"),
  cancelBilling: () =>
    request<{ ok: true; subscription: SoftwareSubscription }>(
      "/v1/billing/cancel",
      { method: "POST" },
    ),
  clinic: () => request<Clinic>("/v1/clinic"),
  dashboard: () => request<DashboardData>("/v1/dashboard"),
  patients: () => request<PatientsResponse>("/v1/patients"),
  services: () => request<{ items: Service[] }>("/v1/services"),
  professionals: (serviceId?: string) =>
    request<{ items: Professional[] }>(`/v1/professionals${qs({ serviceId })}`),
  availability: (params: {
    serviceId: string;
    professionalId?: string;
    days?: number;
  }) => request<{ slots: Slot[] }>(`/v1/availability${qs(params)}`),
  appointments: (params: {
    phone?: string;
    professionalId?: string;
    status?: string;
    from?: string;
    to?: string;
    scope?: "clinic" | "patient";
  }) => request<{ items: Appointment[] }>(`/v1/appointments${qs(params)}`),
  book: (body: {
    phone: string;
    patientName?: string;
    serviceId: string;
    professionalId: string;
    start: string;
    notes?: string;
    meetLink?: string;
    weeklyWeeks?: number;
    source?: string;
  }) =>
    request<Appointment>("/v1/appointments", {
      method: "POST",
      body: JSON.stringify({ ...body, source: body.source ?? "web" }),
    }),
  appointment: (id: string) => request<Appointment>(`/v1/appointments/${id}`),
  updateAppointment: (
    id: string,
    body: {
      notes?: string | null;
      meetLink?: string | null;
      status?: string;
    },
  ) =>
    request<Appointment>(`/v1/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  moveAppointment: (
    id: string,
    body: { start: string; end?: string; professionalId?: string },
  ) =>
    request<Appointment>(`/v1/appointments/${id}/move`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cancel: (id: string, phone: string) =>
    request<Appointment>(`/v1/appointments/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  reschedule: (
    id: string,
    body: { phone: string; start: string; professionalId?: string },
  ) =>
    request<Appointment>(`/v1/appointments/${id}/reschedule`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  calendarBlocks: (params?: {
    professionalId?: string;
    from?: string;
    to?: string;
  }) =>
    request<{ items: CalendarBlock[] }>(
      `/v1/calendar-blocks${qs(params ?? {})}`,
    ),
  createCalendarBlock: (body: {
    professionalId: string;
    start: string;
    end: string;
    reason?: string;
  }) =>
    request<CalendarBlock>("/v1/calendar-blocks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteCalendarBlock: (id: string) =>
    request<{ ok: boolean }>(`/v1/calendar-blocks/${id}`, { method: "DELETE" }),
  payments: (params?: {
    status?: string;
    patientId?: string;
    kind?: PaymentKind;
  }) => request<PaymentsResponse>(`/v1/payments${qs(params ?? {})}`),
  createPayment: (body: {
    patientId: string;
    amountCents: number;
    kind?: PaymentKind;
    method?: PaymentMethod | null;
    notes?: string | null;
    status?: "pending" | "paid" | "cancelled";
  }) =>
    request<Payment>("/v1/payments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  markPaymentPaid: (
    id: string,
    body?: { method?: PaymentMethod; notes?: string },
  ) =>
    request<Payment>(`/v1/payments/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  paymentProviders: () =>
    request<{
      defaultProvider: OnlineProvider;
      items: OnlineProviderInfo[];
      sandboxNote: string;
    }>("/v1/payments/providers"),
  createPaymentCheckout: (
    id: string,
    body?: { provider?: OnlineProvider; method?: "pix" | "card" },
  ) =>
    request<Payment & { sandbox?: boolean; simulateToken?: string | null }>(
      `/v1/payments/${id}/checkout`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      },
    ),
  financeOverview: (params?: {
    period?: "month" | "year";
    year?: number;
    month?: number;
  }) =>
    request<FinanceOverview>(`/v1/finance/overview${qs(params ?? {})}`),
  expenses: () => request<{ items: Expense[] }>("/v1/expenses"),
  createExpense: (body: {
    title: string;
    amountCents: number;
    category?: ExpenseCategory;
    method?: PaymentMethod | null;
    notes?: string | null;
    occurredAt?: string;
  }) =>
    request<Expense>("/v1/expenses", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteExpense: (id: string) =>
    request<{ ok: boolean }>(`/v1/expenses/${id}`, { method: "DELETE" }),
  packages: (patientId?: string) =>
    request<{ items: SessionPackage[] }>(
      `/v1/packages${qs({ patientId })}`,
    ),
  createPackage: (body: {
    patientId: string;
    name: string;
    totalSessions: number;
    amountCents: number;
    method?: PaymentMethod | null;
    notes?: string | null;
    markPaid?: boolean;
  }) =>
    request<SessionPackage>("/v1/packages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  usePackageSession: (id: string) =>
    request<SessionPackage>(`/v1/packages/${id}/use`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  clinicalRecords: (params?: {
    patientId?: string;
    status?: "draft" | "confirmed";
    professionalId?: string;
  }) =>
    request<ClinicalRecordsResponse>(
      `/v1/clinical-records${qs(params ?? {})}`,
    ),
  clinicalRecord: (id: string) =>
    request<ClinicalRecord>(`/v1/clinical-records/${id}`),
  createClinicalRecord: (body: {
    patientId?: string;
    professionalId?: string;
    appointmentId?: string;
  } & ClinicalRecordWrite) =>
    request<ClinicalRecord>("/v1/clinical-records", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateClinicalRecord: (id: string, body: ClinicalRecordWrite) =>
    request<ClinicalRecord>(`/v1/clinical-records/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  confirmClinicalRecord: (id: string) =>
    request<ClinicalRecord>(`/v1/clinical-records/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  generateEvolution: (
    id: string,
    body?: {
      notes?: string;
      audioNotes?: string;
      recordingConsent?: boolean;
      apply?: boolean;
    },
  ) =>
    request<EvolutionDraftResponse>(
      `/v1/clinical-records/${id}/generate-evolution`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      },
    ),
  uploadClinicalFile: async (
    recordId: string,
    file: File,
    opts: { kind: ClinicalFileKind; title?: string },
  ) => {
    const token = getToken();
    const form = new FormData();
    form.append("file", file);
    form.append("kind", opts.kind);
    if (opts.title) form.append("title", opts.title);
    const res = await fetch(`/v1/clinical-records/${recordId}/files`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
    } & ClinicalRecordFile;
    if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
    return data;
  },
  deleteClinicalFile: (recordId: string, fileId: string) =>
    request<{ ok: boolean }>(
      `/v1/clinical-records/${recordId}/files/${fileId}`,
      { method: "DELETE" },
    ),
  downloadClinicalFile: async (
    recordId: string,
    fileId: string,
    fileName: string,
  ) => {
    const token = getToken();
    const res = await fetch(
      `/v1/clinical-records/${recordId}/files/${fileId}/download`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!res.ok) throw new Error("Falha ao baixar arquivo");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },
  reminders: (status?: string) =>
    request<{
      items: Reminder[];
      channels?: {
        whatsapp: boolean;
        email: boolean;
        emailConfigured: boolean;
      };
    }>(`/v1/reminders${qs({ status })}`),
  dispatchReminders: (limit?: number) =>
    request<{
      emailed: number;
      skipped: number;
      failed: number;
      emailConfigured: boolean;
    }>("/v1/reminders/dispatch", {
      method: "POST",
      body: JSON.stringify({ limit: limit ?? 20 }),
    }),
  cancelReminder: (id: string) =>
    request<Reminder>(`/v1/reminders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  ...createPatientsApi(request),
};
