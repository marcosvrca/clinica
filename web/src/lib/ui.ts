export function avatarColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h + c.charCodeAt(0) * 17) % 360;
  return `hsl(${h} 18% 92%)`;
}

export function initials(name: string | null | undefined, fallback = "—") {
  if (name?.trim()) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }
  return fallback.slice(-2).toUpperCase();
}

/** Soft calendar tone by service/specialty label */
export function serviceTone(label: string): string {
  const t = label.toLowerCase();
  if (/tcc|cognitivo|sessão|sessao|individual/.test(t)) return "tone-tcc";
  if (/psican|primeira/.test(t)) return "tone-psi";
  if (/relac/.test(t)) return "tone-rel";
  if (/auto|avali/.test(t)) return "tone-auto";
  return "tone-other";
}

export function serviceShort(label: string): string {
  const t = label.toLowerCase();
  if (/tcc|cognitivo/.test(t)) return "TCC";
  if (/psican/.test(t)) return "Psicanálise";
  if (/primeira|avali/.test(t)) return "Avaliação";
  if (/sessão|sessao|individual/.test(t)) return "Sessão";
  return label.split(" ")[0] ?? label;
}

export function planTone(plan: string): string {
  const t = plan.toLowerCase();
  if (t === "mensal") return "plan-mensal";
  if (t === "trimestral") return "plan-tri";
  if (t === "anual") return "plan-anual";
  return "plan-avulso";
}
