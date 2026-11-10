/**
 * Tipos compartidos del motor de conversación de WhatsApp.
 *
 * Ctx es todo lo que necesita un manejador para responder a UN cliente: el cliente de la base (service
 * role, solo servidor), el comercio, las credenciales de Meta, el cliente y su sesión (la máquina de
 * estados vive en conversation_sessions).
 */
import { z } from "zod";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type Admin = ReturnType<typeof createAdminClient>;
export type SessionRow = Database["public"]["Tables"]["conversation_sessions"]["Row"];
export type SessionState = Database["public"]["Enums"]["session_state"];
export type BusinessType = Database["public"]["Enums"]["business_type"];

export type Tenant = {
  id: string;
  slug: string;
  status: "active" | "suspended";
  businessName: string;
  businessType: BusinessType;
  currency: string;
  timezone: string;
  botEnabled: boolean;
  billable: boolean;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  requireDeliveryLocation: boolean;
};

export type Credentials = { phoneNumberId: string; token: string | null };

export type Ctx = {
  admin: Admin;
  tenant: Tenant;
  creds: Credentials;
  customer: { id: string; phone: string; name: string | null };
  session: SessionRow;
  /** wamid del mensaje que se está procesando (null al notificar un cambio de estado de un pedido). */
  wamid: string | null;
};

/** Datos efímeros del pedido en curso (state_context). Nada contable vive aquí. */
export const sessionContextSchema = z.object({
  step: z.enum(["confirm", "fulfillment"]).optional(),
  fulfillment: z.enum(["delivery", "pickup"]).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
  orderId: z.string().uuid().optional(),
});
export type SessionContext = z.infer<typeof sessionContextSchema>;
