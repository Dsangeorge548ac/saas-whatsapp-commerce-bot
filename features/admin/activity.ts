/**
 * Textos legibles para los eventos de auditoría que se muestran en el detalle de un usuario y tiempo relativo.
 * Funciones puras (se prueban sin red). Si una acción no tiene texto, se muestra su código tal cual.
 */
const LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Logged in",
  LOGIN_FAILED: "Failed login",
  LOGIN_RATE_LIMITED: "Too many login attempts",
  LOGOUT: "Logged out",
  SIGNUP_COMPLETED: "Created the account and business",
  INVITATION_JOINED: "Joined a business by invitation",
  EMAIL_VERIFIED: "Verified the email",
  PASSWORD_RESET: "Reset the password",
  PASSWORD_CHANGED: "Changed the password",
  EMAIL_CHANGED: "Changed the email",
  SESSIONS_REVOKED: "Signed out of other devices",
  PROFILE_UPDATED: "Updated the profile",
  ADMIN_USER_NAME_UPDATED: "Name changed by the platform team",
  ADMIN_PLATFORM_ROLE_CHANGED: "Platform role changed",
  ADMIN_USER_DISABLED: "Account disabled",
  ADMIN_USER_ENABLED: "Account enabled",
};

export function activityLabel(action: string): string {
  return LABELS[action] ?? action.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" o la fecha si pasó más de un mes. */
export function relativeTime(from: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(from));
}
