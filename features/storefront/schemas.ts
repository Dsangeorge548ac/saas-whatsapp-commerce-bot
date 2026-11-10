/**
 * Validación (Zod) del pedido que llega desde la tienda pública.
 * Se usa en el formulario (cliente) y en la Server Action (la validación que de verdad protege).
 * Los límites coinciden con los de la base (1–60 productos, cantidad 1–999).
 */
import { z } from "zod";

/** Enlace personal: 32 bytes en hexadecimal (lo genera create_web_order_link). */
export const orderTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const submitOrderSchema = z.object({
  token: orderTokenSchema,
  items: z
    .array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(999) }))
    .min(1)
    .max(60),
});
export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;
