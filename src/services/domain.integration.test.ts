import { beforeAll, describe, expect, it } from "vitest";
import { AppointmentStatus } from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { prisma } from "../infra/prisma.js";
import {
  confirmClinicalRecord,
  createClinicalRecord,
  ClinicalRecordError,
  updateClinicalRecord,
} from "../services/clinical-records.js";
import {
  AppointmentError,
  bookAppointment,
  cancelAppointment,
} from "../services/appointments.js";
import { createCalendarBlock } from "../services/calendar-blocks.js";

/** Rode com: RUN_INTEGRATION=1 npm test (Postgres + seed necessários) */
const runIntegration = process.env.RUN_INTEGRATION === "1";

describe.runIf(runIntegration)("regras críticas (integração)", () => {
  let clinicId = "";
  let serviceId = "";
  let professionalId = "";
  let patientId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET ??= "test-jwt-secret-change-me-32chars!!";
    process.env.CLINIC_API_KEY ??= "clinic-api-key-change-me-16";
    process.env.CLINICAL_ENCRYPTION_KEY ??= "clinic-clinical-key-change-me-32";
    loadEnv();
    const clinic = await prisma.clinic.findFirst({ where: { active: true } });
    if (!clinic) throw new Error("Rode o seed antes dos testes de integração");
    clinicId = clinic.id;
    const service = await prisma.service.findFirst({
      where: { clinicId, active: true },
    });
    const pro = await prisma.professional.findFirst({
      where: { clinicId, active: true },
    });
    const patient = await prisma.patient.findFirst({ where: { clinicId } });
    if (!service || !pro || !patient) throw new Error("Seed incompleto");
    serviceId = service.id;
    professionalId = pro.id;
    patientId = patient.id;
  });

  it("confirma prontuário e impede edição", async () => {
    const draft = await createClinicalRecord({
      clinicId,
      patientId,
      professionalId,
      draftContent: "Evolução de teste",
      sessionNotes: "nota",
    });

    const confirmed = await confirmClinicalRecord(clinicId, draft.id);
    expect(confirmed.status).toBe("confirmed");

    await expect(
      updateClinicalRecord({
        clinicId,
        id: draft.id,
        draftContent: "tentativa",
      }),
    ).rejects.toBeInstanceOf(ClinicalRecordError);

    await expect(confirmClinicalRecord(clinicId, draft.id)).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("rejeita conflito e bloqueio na agenda", async () => {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 21);
    while (start.getUTCDay() !== 1) start.setUTCDate(start.getUTCDate() + 1);
    start.setUTCHours(12, 0, 0, 0);

    await bookAppointment({
      clinicId,
      phone: "556399991111",
      patientName: "Teste Conflito",
      serviceId,
      professionalId,
      start: start.toISOString(),
      source: "test",
    });

    await expect(
      bookAppointment({
        clinicId,
        phone: "556399991112",
        patientName: "Outro",
        serviceId,
        professionalId,
        start: start.toISOString(),
        source: "test",
      }),
    ).rejects.toBeInstanceOf(AppointmentError);

    const blockStart = new Date(start);
    blockStart.setUTCHours(18, 0, 0, 0);
    const blockEnd = new Date(blockStart.getTime() + 60 * 60_000);
    await createCalendarBlock({
      clinicId,
      professionalId,
      start: blockStart.toISOString(),
      end: blockEnd.toISOString(),
      reason: "teste",
    });

    await expect(
      bookAppointment({
        clinicId,
        phone: "556399991113",
        serviceId,
        professionalId,
        start: blockStart.toISOString(),
        source: "test",
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/bloqueado/i) });
  });

  it("respeita antecedência mínima no cancelamento", async () => {
    const startsAt = new Date(Date.now() + 30 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 50 * 60_000);
    const patient = await prisma.patient.upsert({
      where: {
        clinicId_phone: { clinicId, phone: "556399991114" },
      },
      create: {
        clinicId,
        phone: "556399991114",
        name: "Cancel Short",
      },
      update: {},
    });

    const appt = await prisma.appointment.create({
      data: {
        clinicId,
        patientId: patient.id,
        professionalId,
        serviceId,
        startsAt,
        endsAt,
        status: AppointmentStatus.confirmed,
        source: "test",
      },
    });

    await expect(
      cancelAppointment({
        clinicId,
        appointmentId: appt.id,
        phone: "556399991114",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
