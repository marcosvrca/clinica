const TOKEN_KEY = "clinic_auth_token";
const USER_KEY = "clinic_auth_user";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "professional";
  professionalId: string | null;
  clinic: { id: string; name: string };
  billing?: {
    billingStatus: "none" | "active" | "past_due" | "cancelled";
    billingBlocked: boolean;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    complimentary: boolean;
    hasSubscription: boolean;
  };
  isPlatformAdmin?: boolean;
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
