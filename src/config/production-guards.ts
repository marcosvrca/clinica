import type { Env } from "./env.js";

/** Valores de exemplo do `.env.example` — proibidos em production. */
const FORBIDDEN_EXAMPLES = [
  "clinic-api-key-change-me-16",
  "clinic-jwt-secret-change-me-32chars",
  "clinic-clinical-key-change-me-32",
] as const;

const FORBIDDEN_FROM = [
  "onboarding@resend.dev",
  "beth.t@example.com",
] as const;

function isHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

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

  const publicUrl = config.PUBLIC_BASE_URL.trim();
  const webUrl = config.WEB_BASE_URL.trim();
  const publicLower = publicUrl.toLowerCase();
  const webLower = webUrl.toLowerCase();
  if (publicLower.includes("localhost") || webLower.includes("localhost")) {
    problems.push(
      "PUBLIC_BASE_URL e WEB_BASE_URL devem usar o domínio público (não localhost) em production",
    );
  }
  if (!isHttpsUrl(publicUrl) || !isHttpsUrl(webUrl)) {
    problems.push(
      "PUBLIC_BASE_URL e WEB_BASE_URL devem usar HTTPS em production",
    );
  }

  if (!config.PAYMENTS_WEBHOOK_SECRET.trim()) {
    problems.push(
      "PAYMENTS_WEBHOOK_SECRET é obrigatório em production (webhooks Mercado Pago / pagamentos)",
    );
  }

  if (config.PAYMENTS_ALLOW_SANDBOX === "true") {
    problems.push(
      "PAYMENTS_ALLOW_SANDBOX=true é proibido em production (libera simulação de pagamento)",
    );
  }

  if (!config.RESEND_API_KEY.trim()) {
    problems.push(
      "RESEND_API_KEY é obrigatório em production (e-mails de cadastro, convite e reset)",
    );
  }
  const fromLower = config.RESEND_FROM.toLowerCase();
  for (const bad of FORBIDDEN_FROM) {
    if (fromLower.includes(bad)) {
      problems.push(
        `RESEND_FROM não pode usar ${bad} em production — use domínio verificado`,
      );
    }
  }

  if (!config.MERCADOPAGO_ACCESS_TOKEN.trim()) {
    problems.push(
      "MERCADOPAGO_ACCESS_TOKEN é obrigatório em production (assinaturas SaaS)",
    );
  }

  const soloPlan =
    config.MERCADOPAGO_PREAPPROVAL_PLAN_ID_SOLO.trim() ||
    config.MERCADOPAGO_PREAPPROVAL_PLAN_ID.trim();
  const teamPlan = config.MERCADOPAGO_PREAPPROVAL_PLAN_ID_TEAM.trim();
  if (!soloPlan) {
    problems.push(
      "MERCADOPAGO_PREAPPROVAL_PLAN_ID_SOLO (ou MERCADOPAGO_PREAPPROVAL_PLAN_ID) é obrigatório em production",
    );
  }
  if (!teamPlan) {
    problems.push(
      "MERCADOPAGO_PREAPPROVAL_PLAN_ID_TEAM é obrigatório em production (plano Compartilhado)",
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Configuração insegura para production:\n- ${problems.join("\n- ")}`,
    );
  }
}
