/**
 * Registro de auditoría desde el servidor de Next.js.
 *
 * Qué hace: llama a log_audit() con el cliente admin (es la única forma permitida: los usuarios
 * no pueden ejecutarla) y añade la IP real de la petición, que el cliente nunca puede falsificar.
 * Por qué no lanza errores: un fallo de auditoría no debe romper el login del usuario;
 * se informa en los logs del servidor (sin datos sensibles) para revisarlo.
 * Seguridad: `details` nunca debe llevar teléfonos completos de clientes, contraseñas, tokens
 * ni URLs firmadas.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/auth/rate-limit";
import type { Json } from "@/types/database";

type AuditEntry = {
  actorId: string | null;
  action: string; // MAYÚSCULAS_CON_GUIONES, por ejemplo LOGIN_SUCCESS
  resource: string;
  tenantId?: string | null;
  targetUserId?: string | null;
  details?: Record<string, Json>;
};

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("log_audit", {
      p_actor: entry.actorId as string,
      p_action: entry.action,
      p_resource: entry.resource,
      p_tenant: (entry.tenantId ?? undefined) as string,
      p_target: (entry.targetUserId ?? entry.actorId ?? undefined) as string,
      p_ip: ((await getClientIp()) ?? undefined) as string,
      p_details: entry.details ?? {},
    });
    if (error) console.error(`[audit] No se pudo registrar ${entry.action}: ${error.message}`);
  } catch (error) {
    console.error(`[audit] Error registrando ${entry.action}:`, error instanceof Error ? error.message : error);
  }
}
