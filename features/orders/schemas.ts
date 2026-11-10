/**
 * Validaciones (Zod) del módulo de pedidos: entradas de las Server Actions y filtros del historial.
 * Los límites coinciden con la base de datos (motivos de 3 a 300 caracteres).
 */
import { z } from "zod";

export const orderIdSchema = z.uuid();

export const reasonSchema = z.string().trim().min(3, "Write a short reason (3 characters or more).").max(300, "Use 300 characters or fewer.");

/** Estados a los que un operador puede AVANZAR a mano (aprobar va por la revisión del comprobante). */
export const advanceTargetSchema = z.enum(["on_the_way", "delivered"]);

export const historyParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  status: z.enum(["delivered", "cancelled"]).catch("delivered"),
});
export type HistoryParams = z.infer<typeof historyParamsSchema>;

export type ActionResult = { ok: true; warning?: string } | { ok: false; error: string };
export const NOT_FOUND: ActionResult = { ok: false, error: "Not found." };
