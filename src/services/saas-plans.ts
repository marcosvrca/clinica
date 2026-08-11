import { env } from "../config/env.js";

export type SaasPlan = {
  code: string;
  name: string;
  amountCents: number;
  description: string;
  maxProfessionals: number;
  currency: "BRL";
  interval: "month";
};

export const SOLO_PLAN_CODE = "solo_monthly";
export const TEAM_PLAN_CODE = "team_monthly";

/** Códigos legados tratados como Individual. */
const LEGACY_SOLO_CODES = new Set([
  "pro_monthly",
  "solo_monthly",
  SOLO_PLAN_CODE,
]);

export function getSoloPlan(): SaasPlan {
  return {
    code: SOLO_PLAN_CODE,
    name: env().SUBSCRIPTION_SOLO_PLAN_NAME,
    amountCents: env().SUBSCRIPTION_SOLO_AMOUNT_CENTS,
    description: env().SUBSCRIPTION_SOLO_PLAN_DESCRIPTION,
    maxProfessionals: 1,
    currency: "BRL",
    interval: "month",
  };
}

export function getTeamPlan(): SaasPlan {
  return {
    code: TEAM_PLAN_CODE,
    name: env().SUBSCRIPTION_TEAM_PLAN_NAME,
    amountCents: env().SUBSCRIPTION_TEAM_AMOUNT_CENTS,
    description: env().SUBSCRIPTION_TEAM_PLAN_DESCRIPTION,
    maxProfessionals: env().SUBSCRIPTION_TEAM_MAX_PROFESSIONALS,
    currency: "BRL",
    interval: "month",
  };
}

export function getSubscriptionPlans(): SaasPlan[] {
  return [getSoloPlan(), getTeamPlan()];
}

/** Plano Individual (compatível com getSubscriptionPlan() antigo). */
export function getSubscriptionPlan(code?: string | null): SaasPlan {
  if (!code) return getSoloPlan();
  const found = getSubscriptionPlans().find((p) => p.code === code);
  if (found) return found;
  // Legado / complimentary seed
  if (LEGACY_SOLO_CODES.has(code) || code === env().SUBSCRIPTION_PLAN_CODE) {
    return { ...getSoloPlan(), code };
  }
  if (code === TEAM_PLAN_CODE) return getTeamPlan();
  return getSoloPlan();
}

export function maxProfessionalsForPlanCode(planCode: string | null | undefined): number {
  if (!planCode) return getSoloPlan().maxProfessionals;
  if (planCode === TEAM_PLAN_CODE) return getTeamPlan().maxProfessionals;
  return getSoloPlan().maxProfessionals;
}

export function resolveCheckoutPlanCode(raw?: string | null): string {
  const code = (raw ?? SOLO_PLAN_CODE).trim();
  if (code === TEAM_PLAN_CODE) return TEAM_PLAN_CODE;
  return SOLO_PLAN_CODE;
}
