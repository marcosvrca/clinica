/** Escape seguro para HTML público (páginas de ação / pagamento). */

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Permite apenas URLs http(s) ou data:image/* para atributos src/href. */
export function safeUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  const v = raw.trim();
  if (/^https?:\/\//i.test(v)) return escapeHtml(v);
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(v)) return escapeHtml(v);
  return "";
}
