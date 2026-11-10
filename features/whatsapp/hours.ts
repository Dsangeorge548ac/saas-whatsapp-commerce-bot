/**
 * Horario de atención en el bot: consulta si el comercio está abierto y responde fuera de horario.
 *
 * La base decide (get_open_status, en la zona horaria del comercio); este módulo solo arma el texto en
 * español con {schedule} (resumen semanal) y {next_open} ("mañana a las 09:00") para el mensaje
 * `out_of_hours`, que el dueño puede personalizar.
 * Quién lo usa: engine.ts y flows/checkout.ts.
 */
import "server-only";
import { formatNextOpen, formatSchedule, type OpenStatus } from "@/lib/whatsapp/format";
import { say } from "@/features/whatsapp/outbound";
import { TEXT } from "@/features/whatsapp/texts";
import type { Ctx } from "@/features/whatsapp/types";

export async function openStatus(ctx: Ctx): Promise<OpenStatus> {
  const { data } = await ctx.admin.rpc("get_open_status", { p_tenant: ctx.tenant.id });
  const status = data as OpenStatus | null;
  // Si la consulta falla se asume abierto: es mejor atender que bloquear a todos los clientes.
  return status ?? { is_open: true };
}

export async function sendOutOfHours(ctx: Ctx, status?: OpenStatus): Promise<void> {
  const current = status ?? (await openStatus(ctx));
  const { data: hours } = await ctx.admin.from("tenant_business_hours").select("weekday, is_open, opens_at, closes_at").eq("tenant_id", ctx.tenant.id);
  await say(ctx, "out_of_hours", {
    schedule: hours?.length ? formatSchedule(hours) : TEXT.alwaysOpen,
    next_open: formatNextOpen(current, new Date(), ctx.tenant.timezone),
    opening_time: current.next_opens_at ?? "",
    closing_time: (current as { next_closes_at?: string }).next_closes_at ?? "",
  });
}
