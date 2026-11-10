/**
 * Formato de textos para los mensajes del bot (funciones puras, se prueban sin red ni base).
 *
 *   - renderTemplate: reemplaza {placeholders} del mensaje (los desconocidos se quitan).
 *   - formatMoney / formatPaymentDetails: importes y datos de pago del comercio.
 *   - formatSchedule / formatNextOpen: horario semanal y próxima apertura en español.
 * Seguridad: el texto es PLANO (WhatsApp no interpreta HTML) y los valores se insertan tal cual, sin
 * evaluar nada del comercio.
 */

/** Reemplaza {nombre} por su valor; un placeholder sin valor se elimina. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{([a-z_]+)\}/g, (_match, key: string) => vars[key] ?? "").replace(/[ \t]+\n/g, "\n").trim();
}

export function formatMoney(amount: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${amount.toFixed(2)}${symbol ? "" : ` ${currency}`}`;
}

const humanize = (key: string) => {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Datos de pago congelados en el pedido ({label, currency, details:{…}}) como líneas legibles. */
export function formatPaymentDetails(snapshot: unknown): string {
  if (typeof snapshot !== "object" || snapshot === null) return "";
  const { label, details } = snapshot as { label?: unknown; details?: unknown };
  const lines: string[] = [];
  if (typeof label === "string" && label) lines.push(`*${label.slice(0, 80)}*`);
  if (typeof details === "object" && details !== null) {
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === "string" || typeof value === "number") {
        const text = String(value).trim();
        if (text) lines.push(`${humanize(key)}: ${text.slice(0, 200)}`);
      }
    }
  }
  return lines.join("\n");
}

export type HourRow = { weekday: number; is_open: boolean; opens_at: string | null; closes_at: string | null };
const SHORT_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const LONG_DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const hhmm = (time: string | null) => (time ?? "").slice(0, 5);

/** "Lun–Vie 09:00–18:00 · Sáb 09:00–13:00 · Dom cerrado" (agrupa días seguidos con el mismo horario). */
export function formatSchedule(rows: HourRow[]): string {
  const byDay = [...rows].sort((a, b) => a.weekday - b.weekday);
  const labelOf = (row: HourRow) => (row.is_open ? `${hhmm(row.opens_at)}–${hhmm(row.closes_at)}` : "cerrado");
  const groups: { from: number; to: number; label: string }[] = [];
  for (const row of byDay) {
    const last = groups[groups.length - 1];
    if (last && last.label === labelOf(row) && last.to === row.weekday - 1) last.to = row.weekday;
    else groups.push({ from: row.weekday, to: row.weekday, label: labelOf(row) });
  }
  return groups
    .map((g) => `${g.from === g.to ? SHORT_DAYS[g.from - 1] : `${SHORT_DAYS[g.from - 1]}–${SHORT_DAYS[g.to - 1]}`} ${g.label}`)
    .join(" · ");
}

export type OpenStatus = { is_open: boolean; next_open_local?: string | null; next_open_weekday?: number | null; next_opens_at?: string | null };

/** "hoy a las 09:00", "mañana a las 09:00" o "el lunes a las 09:00". */
export function formatNextOpen(status: OpenStatus, now: Date, timeZone: string): string {
  if (!status.next_open_local || !status.next_opens_at) return "";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const nextDate = status.next_open_local.slice(0, 10);
  const days = Math.round((Date.parse(`${nextDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const when =
    days <= 0 ? "hoy" : days === 1 ? "mañana" : `el ${LONG_DAYS[(status.next_open_weekday ?? 1) - 1] ?? ""}`.trim();
  return `${when} a las ${status.next_opens_at}`;
}
