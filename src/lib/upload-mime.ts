import {
  ClinicalFileKind,
  PatientDocumentKind,
} from "@prisma/client";

export class UploadMimeError extends Error {
  constructor(
    message: string,
    readonly statusCode = 415,
  ) {
    super(message);
  }
}

const IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const PDF = new Set(["application/pdf"]);

const DOC = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function normalizeMime(raw: string) {
  return (raw.trim().toLowerCase().split(";")[0] ?? "").trim();
}

function isAudioMime(mime: string) {
  const n = normalizeMime(mime);
  return (
    n.startsWith("audio/") &&
    /^(audio\/(webm|mpeg|mp4|ogg|wav|x-wav|aac|mp3))$/.test(n)
  );
}

export function assertPatientUploadMime(input: {
  kind: PatientDocumentKind;
  mimeType: string;
  asProfilePhoto?: boolean;
}) {
  const mime = normalizeMime(input.mimeType);
  if (input.asProfilePhoto || input.kind === PatientDocumentKind.photo) {
    if (!IMAGE.has(mime)) {
      throw new UploadMimeError(
        "Foto de perfil: use JPEG, PNG, WebP ou GIF",
      );
    }
    return;
  }
  if (!IMAGE.has(mime) && !PDF.has(mime) && !DOC.has(mime)) {
    throw new UploadMimeError("Documento: use PDF, imagem ou Word/texto");
  }
}

export function assertClinicalUploadMime(input: {
  kind: ClinicalFileKind;
  mimeType: string;
}) {
  const mime = normalizeMime(input.mimeType);
  switch (input.kind) {
    case ClinicalFileKind.pdf:
      if (!PDF.has(mime)) throw new UploadMimeError("Envie um PDF");
      return;
    case ClinicalFileKind.image:
      if (!IMAGE.has(mime)) {
        throw new UploadMimeError("Imagem: use JPEG, PNG, WebP ou GIF");
      }
      return;
    case ClinicalFileKind.exam:
    case ClinicalFileKind.report:
      if (!PDF.has(mime) && !IMAGE.has(mime) && !DOC.has(mime)) {
        throw new UploadMimeError(
          "Exame/laudo: use PDF, imagem ou documento",
        );
      }
      return;
    case ClinicalFileKind.audio:
      if (!isAudioMime(input.mimeType)) {
        throw new UploadMimeError("Áudio: use WebM, MP3, OGG ou WAV");
      }
      return;
    default:
      throw new UploadMimeError("Tipo de arquivo clínico inválido");
  }
}
