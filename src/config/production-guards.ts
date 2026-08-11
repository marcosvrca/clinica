import type { Env } from "./env.js";

/** Valores de exemplo do `.env.example` — proibidos em production. */
const FORBIDDEN_EXAMPLES = [
  "clinic-api-key-change-me-16",
  "clinic-jwt-secret-change-me-32chars",
  "clinic-clinical-key-change-me-32",
] as const;

/**
 * Falha cedo se a configuração não for segura para produção.
 * Chamado após `loadEnv()` em `main.ts`.
 */
export function assertProductionReady(config: Env): void {
  if (config.NODE_ENV !== "production") return;

  const problems: string[] = [];

  if (!config.CLINIC_ID.trim()) {
    problems.push("CLINIC_ID é obrigatório em production (vincule a clínica do bot/API key)");
  }

  if (FORBIDDEN_EXAMPLES.includes(config.CLINIC_API_KEY as (typeof FORBIDDEN_EXAMPLES)[number])) {
    problems.push("CLINIC_API_KEY ainda usa o valor de exemplo — gere um segredo forte");
  }
  if (FORBIDDEN_EXAMPLES.includes(config.JWT_SECRET as (typeof FORBIDDEN_EXAMPLES)[number])) {
    problems.push("JWT_SECRET ainda usa o valor de exemplo — gere um segredo forte");
  }
  if (
    FORBIDDEN_EXAMPLES.includes(
      config.CLINICAL_ENCRYPTION_KEY as (typeof FORBIDDEN_EXAMPLES)[number],
    )
  ) {
    problems.push(
      "CLINICAL_ENCRYPTION_KEY ainda usa o valor de exemplo — gere um segredo forte e único",
    );
  }

  if (config.JWT_SECRET === config.CLINICAL_ENCRYPTION_KEY) {
    problems.push("JWT_SECRET e CLINICAL_ENCRYPTION_KEY não podem ser iguais");
  }

  if (config.CORS_ORIGINS.trim() === "*") {
    problems.push("CORS_ORIGINS=* é proibido em production — liste os domínios do painel");
  }

  const publicUrl = config.PUBLIC_BASE_URL.trim().toLowerCase();
  const webUrl = config.WEB_BASE_URL.trim().toLowerCase();
  if (publicUrl.includes("localhost") || webUrl.includes("localhost")) {
    problems.push(
      "PUBLIC_BASE_URL e WEB_BASE_URL devem usar o domínio público (não localhost) em production",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuração insegura para production:\n- ${problems.join("\n- ")}`,
    );
  }
}
