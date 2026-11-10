/**
 * Tiempo transcurrido legible ("just now", "5 min ago", "3 h ago", "2 days ago") para las tarjetas del
 * tablero. Función pura: recibe la hora actual para poder probarse sin depender del reloj.
 */
export function timeAgo(from: string | Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
