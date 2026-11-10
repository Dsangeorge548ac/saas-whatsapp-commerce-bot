/**
 * Enmascarado de datos personales para mostrarlos en pantalla sin exponerlos completos.
 * (La base de datos tiene sus propias versiones, mask_ptin y mask_phone, para la auditoría.)
 */

/** ana.lopez@gmail.com → a***@gmail.com */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  return `${user[0]}***@${domain}`;
}

/** +15555550104 → +1 ••• ••• 0104 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  const lastFour = digits.slice(-4);
  const countryCode = digits.length > 10 ? digits.slice(0, digits.length - 10) : "";
  return `${countryCode ? `+${countryCode} ` : ""}••• ••• ${lastFour}`;
}
