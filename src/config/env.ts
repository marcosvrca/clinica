import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CLINIC_API_KEY: z.string().min(16),
  /** Clínica vinculada à API key do bot/integrações (obrigatório com multi-clínica). */
  CLINIC_ID: z.string().optional().default(""),
  JWT_SECRET: z.string().min(32),
  /** Segredo para AES-GCM dos campos clínicos (mín. 32 chars). */
  CLINICAL_ENCRYPTION_KEY: z.string().min(32),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  TIMEZONE: z.string().default("America/Sao_Paulo"),
  CANCEL_MIN_HOURS: z.coerce.number().int().nonnegative().default(2),
  SLOT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(50),
  /** Horas antes da sessão para lembrete de confirmação. */
  REMINDER_HOURS_BEFORE: z.coerce.number().int().positive().default(24),
  /** Canais de lembrete automático */
  REMINDER_WHATSAPP_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  REMINDER_EMAIL_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Resend — envio de e-mail */
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_FROM: z.string().default("Clínica Bem Estar <onboarding@resend.dev>"),
  /** Base pública para links Confirmar / Remarcar (API). */
  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),
  /** URL do painel (página de remarcar). */
  WEB_BASE_URL: z.string().default("http://localhost:5173"),
  /** Pagamentos online — chaves opcionais (sem chave = sandbox). */
  PAYMENTS_DEFAULT_PROVIDER: z
    .enum(["mercado_pago", "stripe", "asaas", "pagarme"])
    .default("mercado_pago"),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().default(""),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  ASAAS_API_KEY: z.string().optional().default(""),
  ASAAS_BASE_URL: z.string().default("https://sandbox.asaas.com/api/v3"),
  PAGARME_SECRET_KEY: z.string().optional().default(""),
  /** auto = sandbox só fora de production; true/false força. */
  PAYMENTS_ALLOW_SANDBOX: z.enum(["true", "false", "auto"]).default("auto"),
  /** Segredo extra para webhooks (header x-clinic-webhook-secret). Obrigatório em production. */
  PAYMENTS_WEBHOOK_SECRET: z.string().optional().default(""),
  /** Assinatura SaaS do painel (onboarding). */
  SUBSCRIPTION_PLAN_CODE: z.string().default("pro_monthly"),
  SUBSCRIPTION_PLAN_NAME: z.string().default("Plano Profissional"),
  SUBSCRIPTION_AMOUNT_CENTS: z.coerce.number().int().positive().default(19900),
  SUBSCRIPTION_PLAN_DESCRIPTION: z
    .string()
    .default(
      "Agenda, pacientes, prontuário revisável e financeiro do consultório.",
    ),
  /** IA para rascunho de evolução (opcional). Sem chave = gerador local estruturado. */
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid env: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  cached = parsed.data;
  return parsed.data;
}

export function env(): Env {
  if (!cached) return loadEnv();
  return cached;
}

export function corsOrigins(): string[] | boolean {
  const raw = env().CORS_ORIGINS.trim();
  if (raw === "*") return true;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
