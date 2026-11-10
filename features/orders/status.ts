/**
 * Estados de pedido en el panel: columnas del Kanban, etiquetas y acciones permitidas por estado.
 * (La secuencia real la impone la base de datos; esto solo decide qué botones se muestran.)
 *
 *   awaiting_payment → pending (llega el comprobante) → approved → on_the_way → delivered
 *   cancelled: desde awaiting_payment, pending o approved, siempre con motivo.
 */
import type { Database } from "@/types/database";
import type { BadgeTone } from "@/components/layout/status-badge";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** Columnas del tablero, en orden. `awaiting_payment` NO es columna: va en la bandeja "Waiting for payment". */
export const BOARD_COLUMNS: { status: OrderStatus; title: string; hint: string }[] = [
  { status: "pending", title: "Pending", hint: "Check the payment proof" },
  { status: "approved", title: "Approved", hint: "Being prepared" },
  { status: "on_the_way", title: "On the way", hint: "Out for delivery" },
  { status: "delivered", title: "Delivered", hint: "Completed" },
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "Waiting for payment",
  pending: "Pending",
  approved: "Approved",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  awaiting_payment: "neutral",
  pending: "warning",
  approved: "accent",
  on_the_way: "accent",
  delivered: "success",
  cancelled: "danger",
};

/** ¿Se puede cancelar desde este estado? (igual que la regla de la base de datos). */
export const CANCELLABLE: OrderStatus[] = ["awaiting_payment", "pending", "approved"];
