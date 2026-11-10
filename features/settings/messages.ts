/**
 * Reglas de los mensajes del bot que el dueño puede personalizar (funciones puras, se prueban sin red).
 *
 * Un mensaje solo puede usar los {placeholders} que su plantilla permite y debe incluir los obligatorios
 * (p. ej. {payment_details} en las instrucciones de pago: sin él el cliente no sabría dónde pagar). La base
 * de datos vuelve a imponer estas reglas con un trigger; esto da el error al instante en el formulario.
 * "Needs your info": los textos de ejemplo traen marcas como [escribe tu horario] que el dueño debe completar.
 */

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((match) => match[1] as string))];
}

/** null si el mensaje es válido; si no, el motivo para mostrarle al dueño. */
export function validateMessage(body: string, allowed: string[], required: string[]): string | null {
  const text = body.trim();
  if (text.length === 0) return "Write the message.";
  if (text.length > 1000) return "Use 1000 characters or fewer.";
  const used = placeholdersIn(text);
  const unknown = used.filter((name) => !allowed.includes(name));
  if (unknown.length > 0) return `{${unknown[0]}} can't be used in this message.${allowed.length ? ` You can use: ${allowed.map((name) => `{${name}}`).join(", ")}.` : " It has no placeholders."}`;
  const missing = required.filter((name) => !used.includes(name));
  if (missing.length > 0) return `This message must include ${missing.map((name) => `{${name}}`).join(", ")}.`;
  return null;
}

/** ¿Quedan marcas [entre corchetes] sin completar? */
export function needsInfo(body: string): boolean {
  return /\[[^\]]{2,}\]/.test(body);
}

/** Datos de ejemplo para la vista previa (no son datos reales). */
export function sampleVars(businessName: string): Record<string, string> {
  return {
    business_name: businessName,
    customer_name: "Ana",
    order_number: "1042",
    total: "$12.50",
    items: "2 × Sourdough loaf — $9.00\n1 × Croissant — $1.50",
    payment_details: "*Pago Móvil*\nBank: Banesco\nPhone: 0414-1234567",
    reason: "The reference doesn't match the amount",
    schedule: "Mon–Fri 09:00–18:00 · Sat 09:00–13:00 · Sun closed",
    next_open: "tomorrow at 09:00",
    opening_time: "09:00",
    closing_time: "18:00",
  };
}
