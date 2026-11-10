/**
 * /ui-kit/settings — Vista previa de las pantallas de Ajustes con datos de EJEMPLO (solo desarrollo).
 * Permite revisar el diseño sin sesión ni base de datos. En producción responde 404.
 */
import { notFound } from "next/navigation";
import { PlanCards } from "@/features/billing/components/PlanCards";
import { SubscriptionSummary } from "@/features/billing/components/SubscriptionSummary";
import { PLAN_BY_ID } from "@/lib/stripe/plans";
import { GoLivePanel } from "@/features/settings/components/GoLivePanel";
import { HoursEditor } from "@/features/settings/components/HoursEditor";
import { MessagesEditor, type MessageItem } from "@/features/settings/components/MessagesEditor";
import { PaymentMethodRow } from "@/features/settings/components/PaymentMethodRow";
import { SettingsTabs } from "@/features/settings/components/SettingsTabs";

const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, isOpen: weekday <= 6, opensAt: "09:00", closesAt: weekday === 6 ? "13:00" : "18:00" }));

const messages: MessageItem[] = [
  { key: "welcome", stage: "welcome", description: "First message when a customer writes.", defaultBody: "¡Hola {customer_name}! 🥐 Bienvenido a {business_name}.", body: "¡Hola {customer_name}! 🥐 Bienvenido a {business_name}.", isCustom: false, allowed: ["customer_name", "business_name"], required: [] },
  { key: "payment_instructions", stage: "payment", description: "How to pay. It must include the payment details and the total.", defaultBody: "Pedido #{order_number} — Total: {total}.\n\nDatos para pagar:\n{payment_details}", body: "Pedido #{order_number}: paga {total} aquí 👇\n{payment_details}", isCustom: true, allowed: ["order_number", "total", "payment_details"], required: ["total", "payment_details"] },
  { key: "business_info", stage: "menu", description: "Answer to “Business information”. Complete it with your details.", defaultBody: "Somos {business_name}.\nHorario: {schedule}\nDirección: [escribe tu dirección]", body: "Somos {business_name}.\nHorario: {schedule}\nDirección: [escribe tu dirección]", isCustom: false, allowed: ["business_name", "schedule"], required: [] },
];

export default function SettingsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-10 bg-surface px-4 py-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight text-fg">Settings — preview with sample data</h1>
        <p className="mt-1 text-sm text-fg-muted">Development only. Nothing here is real.</p>
      </div>
      <SettingsTabs />
      <section className="flex flex-col gap-4"><h2 className="text-lg font-semibold">Business hours</h2><HoursEditor initialEnabled initialDays={days} /></section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Payment methods</h2>
        <ul className="flex max-w-2xl flex-col gap-3">
          <PaymentMethodRow method={{ id: "1", type: "pago_movil", label: "Pago Móvil Banesco", currency: "VES", details: { bank_name: "Banesco", phone: "0414-1234567" }, isActive: true }} />
          <PaymentMethodRow method={{ id: "2", type: "zelle", label: "Zelle", currency: "USD", details: { email: "pay@luna.example" }, isActive: false }} />
        </ul>
      </section>
      <section className="flex flex-col gap-4"><h2 className="text-lg font-semibold">Bot messages</h2><MessagesEditor items={messages} businessName="Luna Bakery" reviewed={false} /></section>
      <section className="flex flex-col gap-4"><h2 className="text-lg font-semibold">Plans</h2><PlanCards currentPlanId={null} canSubscribe /></section>
      <SubscriptionSummary data={{ plan: PLAN_BY_ID.get("pro")!, status: "active", interval: "yearly", activatedAt: "2026-11-10T15:00:00Z", currentPeriodEnd: "2027-11-10T15:00:00Z", cancelAtPeriodEnd: false, card: { brand: "visa", last4: "4242", expMonth: 4, expYear: 2029 } }} />
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Go live</h2>
        <GoLivePanel botEnabled={false} tested={false} requirements={[
          { key: "whatsapp", label: "WhatsApp number connected", href: "#", done: true },
          { key: "payment_methods", label: "At least one payment method", href: "#", done: true },
          { key: "catalog", label: "At least one available product", href: "#", done: false },
          { key: "subscription", label: "An active plan", href: "#", done: false },
        ]} />
      </section>
    </main>
  );
}
