import type { PatientWritePayload, PatientDetail, PatientDocument, SessionPrepContext } from "./types";
import { getToken } from "../lib/auth";

// extended in client.ts via parallel edits - this file is merged into client
export type PatientsApi = {
  createPatient: (body: PatientWritePayload) => Promise<PatientDetail>;
  patientDetail: (id: string) => Promise<PatientDetail>;
  updatePatient: (id: string, body: PatientWritePayload) => Promise<PatientDetail>;
  setPatientLifecycle: (
    id: string,
    body: { active?: boolean; billingPaused?: boolean },
  ) => Promise<{
    id: string;
    active: boolean;
    billingPaused: boolean;
    status: "ativo" | "pausado" | "inativo";
  }>;
  patientPrepContext: (
    id: string,
    appointmentId?: string,
  ) => Promise<SessionPrepContext>;
  uploadPatientDocument: (
    id: string,
    file: File,
    opts: {
      kind: "document" | "attachment" | "photo";
      title?: string;
      asProfilePhoto?: boolean;
    },
  ) => Promise<PatientDocument>;
  deletePatientDocument: (id: string, docId: string) => Promise<{ ok: boolean }>;
  downloadPatientDocument: (id: string, docId: string, fileName: string) => Promise<void>;
  patientPhotoUrl: (id: string) => Promise<string | null>;
};

export function createPatientsApi(
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
): PatientsApi {
  return {
    createPatient: (body) =>
      request<PatientDetail>("/v1/patients", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    patientDetail: (id) => request<PatientDetail>(`/v1/patients/${id}`),
    updatePatient: (id, body) =>
      request<PatientDetail>(`/v1/patients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    setPatientLifecycle: (
      id: string,
      body: { active?: boolean; billingPaused?: boolean },
    ) =>
      request<{
        id: string;
        active: boolean;
        billingPaused: boolean;
        status: "ativo" | "pausado" | "inativo";
      }>(`/v1/patients/${id}/lifecycle`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    patientPrepContext: (id, appointmentId) => {
      const q = appointmentId
        ? `?appointmentId=${encodeURIComponent(appointmentId)}`
        : "";
      return request<SessionPrepContext>(`/v1/patients/${id}/prep-context${q}`);
    },
    uploadPatientDocument: async (id, file, opts) => {
      const token = getToken();
      const form = new FormData();
      form.append("file", file);
      form.append("kind", opts.kind);
      if (opts.title) form.append("title", opts.title);
      if (opts.asProfilePhoto) form.append("asProfilePhoto", "true");
      const res = await fetch(`/v1/patients/${id}/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      } & PatientDocument;
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      return data;
    },
    deletePatientDocument: (id, docId) =>
      request<{ ok: boolean }>(`/v1/patients/${id}/documents/${docId}`, {
        method: "DELETE",
      }),
    downloadPatientDocument: async (id, docId, fileName) => {
      const token = getToken();
      const res = await fetch(
        `/v1/patients/${id}/documents/${docId}/download`,
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
    patientPhotoUrl: async (id) => {
      const token = getToken();
      const res = await fetch(`/v1/patients/${id}/photo`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return URL.createObjectURL(await res.blob());
    },
  };
}
