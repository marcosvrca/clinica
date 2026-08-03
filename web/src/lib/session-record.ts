import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Appointment } from "../api/types";

/** Cria ou reabre o rascunho ligado à sessão e navega ao prontuário. */
export async function openSessionEvolution(
  appointment: Pick<Appointment, "id" | "patient" | "status">,
  navigate: ReturnType<typeof useNavigate>,
) {
  if (appointment.status === "cancelled") {
    throw new Error("Sessão cancelada não gera evolução");
  }
  const record = await api.createClinicalRecord({
    appointmentId: appointment.id,
  });
  navigate(
    `/prontuarios?patientId=${encodeURIComponent(appointment.patient.id)}&id=${encodeURIComponent(record.id)}`,
  );
  return record;
}
