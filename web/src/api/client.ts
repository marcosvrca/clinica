import type {
  Appointment,
  Clinic,
  ClinicalRecord,
  ClinicalRecordsResponse,
  DashboardData,
  PatientsResponse,
  Professional,
  Service,
  Slot,
} from "./types";

const API_KEY = import.meta.env.VITE_API_KEY as string;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      ...(init?.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error ?? `Erro ${res.status}`);
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
    source?: string;
  }) =>
    request<Appointment>("/v1/appointments", {
      method: "POST",
      body: JSON.stringify({ ...body, source: body.source ?? "web" }),
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
    sessionNotes?: string;
    draftContent?: string;
    recordingConsent?: boolean;
  }) =>
    request<ClinicalRecord>("/v1/clinical-records", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateClinicalRecord: (
    id: string,
    body: {
      sessionNotes?: string | null;
      draftContent?: string;
      recordingConsent?: boolean;
      professionalId?: string;
    },
  ) =>
    request<ClinicalRecord>(`/v1/clinical-records/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  confirmClinicalRecord: (id: string) =>
    request<ClinicalRecord>(`/v1/clinical-records/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
