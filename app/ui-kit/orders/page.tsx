/**
 * /ui-kit/orders — Vista previa del tablero de pedidos con datos de EJEMPLO (solo desarrollo).
 *
 * Permite revisar el diseño sin sesión ni base de datos (como el /ui-kit de Tax Pro). En producción
 * responde 404. Todos los datos son inventados y no se usan en ninguna otra parte.
 */
import { notFound } from "next/navigation";
import { KanbanBoard } from "@/features/orders/components/KanbanBoard";
import { OrderDetail } from "@/features/orders/components/OrderDetail";
import type { Column, OrderCard, OrderDetail as OrderDetailData } from "@/features/orders/queries";

const now = new Date("2026-11-10T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

const card = (n: number, over: Partial<OrderCard>): OrderCard => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  number: n,
  status: "pending",
  fulfillment: "delivery",
  customerName: "Ana Pérez",
  phone: "+584141234567",
  total: 12.5,
  currency: "USD",
  placedAt: ago(8),
  updatedAt: ago(3),
  itemCount: 3,
  proof: "submitted",
  ...over,
});

const column = (cards: OrderCard[], total = cards.length): Column => ({ cards, total });

const board = {
  pending: column([card(1042, {}), card(1041, { customerName: null, phone: "+584149990000", proof: "rejected", placedAt: ago(95), fulfillment: "pickup", total: 4.5, itemCount: 1 })]),
  approved: column([card(1038, { status: "approved", proof: "accepted", placedAt: ago(180) }), card(1037, { status: "approved", proof: "accepted", customerName: "Luis Gómez", total: 31, itemCount: 6, placedAt: ago(240) })]),
  on_the_way: column([card(1035, { status: "on_the_way", proof: "accepted", customerName: "María Ruiz", total: 18.25, placedAt: ago(320) })]),
  delivered: column([card(1030, { status: "delivered", proof: "accepted", placedAt: ago(1500) }), card(1029, { status: "delivered", proof: "accepted", customerName: "Carlos Díaz", placedAt: ago(2900) })], 31),
};
const unpaid = column([card(1043, { status: "awaiting_payment", proof: null, placedAt: ago(4) }), card(1040, { status: "awaiting_payment", proof: null, customerName: "Sofía Lara", placedAt: ago(44) })]);

const detail: NonNullable<OrderDetailData> = {
  order: {
    id: "00000000-0000-4000-8000-000000001042",
    order_number: 1042,
    status: "pending",
    fulfillment: "delivery",
    customer_name_snapshot: "Ana Pérez",
    customer_phone_snapshot: "+584141234567",
    delivery_address_text: "Casa azul, frente a la plaza Bolívar",
    delivery_notes: "Sin cebolla, por favor",
    delivery_lat: 10.491016,
    delivery_lng: -66.902061,
    currency: "USD",
    subtotal: 10.5,
    delivery_fee: 2,
    total: 12.5,
    payment_method_type: "pago_movil",
    payment_details_snapshot: { label: "Pago Móvil", currency: "VES", details: { bank_name: "Banesco", phone: "0414-1234567", id_number: "V-12345678" } },
    placed_at: ago(8),
  },
  items: [
    { id: "i1", product_name_snapshot: "Sourdough loaf", unit_price: 4.5, quantity: 2, line_total: 9 },
    { id: "i2", product_name_snapshot: "Croissant", unit_price: 1.5, quantity: 1, line_total: 1.5 },
  ],
  proofs: [{ id: "p1", storage_path: null, reference_number: "REF-884213", status: "submitted", rejection_reason: null, created_at: ago(3), reviewed_at: null, hasFile: false }],
  history: [
    { id: "h1", from_status: null, to_status: "awaiting_payment", actor_type: "bot", actor_user_id: null, reason: null, created_at: ago(8), actorName: null },
    { id: "h2", from_status: "awaiting_payment", to_status: "pending", actor_type: "customer", actor_user_id: null, reason: "Payment proof received", created_at: ago(3), actorName: null },
  ],
};

export default function OrdersPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-10 bg-surface px-4 py-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight text-fg">Orders — preview with sample data</h1>
        <p className="mt-1 text-sm text-fg-muted">Development only. Nothing here is real.</p>
      </div>
      <KanbanBoard columns={board} unpaid={unpaid} selectedId="00000000-0000-4000-8000-000000001042" now={now} />
      <div className="max-w-md rounded-lg border border-border p-5">
        <h2 className="mb-4 text-base font-semibold">Order #1042</h2>
        <div className="flex flex-col gap-5">
          <OrderDetail detail={detail} />
        </div>
      </div>
    </main>
  );
}
