import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CLINIC_API_KEY: z.string().min(16),
  TIMEZONE: z.string().default("America/Sao_Paulo"),
  CANCEL_MIN_HOURS: z.coerce.number().int().nonnegative().default(2),
  SLOT_INTERVAL_MINUTES: z.coerce.number().int().positive().default(50),
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
