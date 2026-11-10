/**
 * Regla de renovación que se muestra en Billing (función pura, se prueba sin red): la suscripción se renueva el
 * mismo día en que se activó. Mensual: ese día cada mes; anual: esa fecha cada año.
 */
function ordinal(day: number) {
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";
  return `${day}${suffix}`;
}

/** "Renews on the 10th of each month" / "Renews every year on November 10". */
export function renewalRule(interval: "monthly" | "yearly", activatedAt: string | null): string {
  if (!activatedAt) return "Renews on the same day you subscribed";
  const activated = new Date(activatedAt);
  if (interval === "yearly") return `Renews every year on ${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(activated)}`;
  return `Renews on the ${ordinal(activated.getUTCDate())} of each month`;
}
