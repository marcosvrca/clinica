import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import path from "node:path";
import { PatientDocumentKind } from "@prisma/client";
import { z } from "zod";
import { resolveClinicId, resolveClinicalProfessionalScope } from "./auth.js";
import {
  PatientError,
  createPatient,
  deletePatientDocument,
  getPatientDetail,
  getPatientDocumentFile,
  getPatientPhotoPath,
  savePatientFile,
  updatePatient,
  type PatientWriteInput,
} from "../services/patients.js";
import {
  SessionPrepError,
  getSessionPrepContext,
} from "../services/session-prep.js";
import {
  UploadMimeError,
  assertPatientUploadMime,
} from "../lib/upload-mime.js";

async function requireClinic(
  request: Parameters<typeof resolveClinicId>[0],
  reply: FastifyReply,
) {
  const clinicId = await resolveClinicId(request);
  if (!clinicId) {
    await reply.code(404).send({ error: "Clínica não configurada" });
    return null;
  }
  return clinicId;
}

function sendError(reply: FastifyReply, err: unknown) {
  if (
    err instanceof PatientError ||
    err instanceof SessionPrepError ||
    err instanceof UploadMimeError
  ) {
    return reply.code(err.statusCode).send({ error: err.message });
  }
  if (err instanceof z.ZodError) {
    return reply.code(400).send({
      error: err.issues.map((i) => i.message).join("; "),
    });
  }
  const message = err instanceof Error ? err.message : "erro interno";
  return reply.code(500).send({ error: message });
}

const patientBodySchema = z.object({
  phone: z.string().min(8),
  name: z.string().nullable().optional(),
  email: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional(),
  notes: z.string().nullable().optional(),
  cpf: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  profession: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  zipCode: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  addressNumber: z.string().nullable().optional(),
  complement: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  emergencyName: z.string().nullable().optional(),
  emergencyPhone: z.string().nullable().optional(),
  emergencyRelation: z.string().nullable().optional(),
  insuranceName: z.string().nullable().optional(),
  insuranceNumber: z.string().nullable().optional(),
  insurancePlan: z.string().nullable().optional(),
  financialName: z.string().nullable().optional(),
  financialCpf: z.string().nullable().optional(),
  financialPhone: z.string().nullable().optional(),
  financialRelation: z.string().nullable().optional(),
});

function toWriteInput(body: z.infer<typeof patientBodySchema>): PatientWriteInput {
  return {
    ...body,
    email: body.email === "" ? null : body.email,
  };
}

export async function registerPatientRoutes(app: FastifyInstance) {
  app.post("/v1/patients", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const body = patientBodySchema.parse(request.body);
      const created = await createPatient(clinicId, toWriteInput(body));
      return reply.code(201).send(created);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/patients/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      return getPatientDetail(clinicId, params.id, scopePro);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/patients/:id/prep-context", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const scopePro = await resolveClinicalProfessionalScope(request, reply);
      if (scopePro === null) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const q = z
        .object({ appointmentId: z.string().optional() })
        .parse(request.query);
      return getSessionPrepContext({
        clinicId,
        patientId: params.id,
        appointmentId: q.appointmentId,
        scopedProfessionalId: scopePro,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/v1/patients/:id", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = patientBodySchema.parse(request.body);
      return updatePatient(clinicId, params.id, toWriteInput(body));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/patients/:id/photo", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);
      const photo = await getPatientPhotoPath(clinicId, params.id);
      const absolute = path.resolve(process.cwd(), photo.path);
      reply.type(photo.mimeType);
      return reply.send(createReadStream(absolute));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/v1/patients/:id/documents", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z.object({ id: z.string() }).parse(request.params);

      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "Arquivo obrigatório" });

      const fields = file.fields as Record<
        string,
        { value?: string } | undefined
      >;
      const kindRaw = fields.kind?.value ?? "attachment";
      const title = fields.title?.value ?? file.filename;
      const asProfilePhoto = fields.asProfilePhoto?.value === "true";
      const kind = z.nativeEnum(PatientDocumentKind).parse(kindRaw);

      const buffer = await file.toBuffer();
      if (buffer.length > 12 * 1024 * 1024) {
        return reply.code(413).send({ error: "Arquivo maior que 12MB" });
      }

      assertPatientUploadMime({
        kind,
        mimeType: file.mimetype,
        asProfilePhoto,
      });

      const saved = await savePatientFile({
        clinicId,
        patientId: params.id,
        kind,
        title,
        fileName: file.filename,
        mimeType: file.mimetype,
        buffer,
        asProfilePhoto,
      });
      return reply.code(201).send(saved);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/v1/patients/:id/documents/:docId/download", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z
        .object({ id: z.string(), docId: z.string() })
        .parse(request.params);
      const doc = await getPatientDocumentFile(
        clinicId,
        params.id,
        params.docId,
      );
      const absolute = path.resolve(process.cwd(), doc.storagePath);
      reply.header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      );
      reply.type(doc.mimeType);
      return reply.send(createReadStream(absolute));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/v1/patients/:id/documents/:docId", async (request, reply) => {
    try {
      const clinicId = await requireClinic(request, reply);
      if (!clinicId) return;
      const params = z
        .object({ id: z.string(), docId: z.string() })
        .parse(request.params);
      return deletePatientDocument(clinicId, params.id, params.docId);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
