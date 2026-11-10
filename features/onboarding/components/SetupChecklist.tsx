/**
 * Guía de configuración ("Continue setup"): muestra el avance y el siguiente paso pendiente.
 *
 * El progreso NO se guarda a mano: lo calcula la función get_onboarding_status() de la base con
 * datos reales (¿hay WhatsApp conectado? ¿un método de pago activo? ¿al menos un producto?).
 * Así nunca se desincroniza con la realidad. Cada paso explica qué es y por qué se pide, y los
 * pasos bloqueados dicen qué falta (nunca un botón gris sin motivo).
 * Quién lo usa: app/(app)/dashboard/page.tsx (el comercio activo sale de getWorkspace()).
 */
import Link from "next/link";
import { Check, Circle, Lock } from "lucide-react";
import { z } from "zod";
import { ProgressRing } from "@/components/widgets/progress-ring";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const statusSchema = z.object({
  steps: z.array(z.object({ key: z.string(), done: z.boolean(), blocked_by: z.array(z.string()) })),
  bot_enabled: z.boolean(),
});

/** Texto de cada paso y, si la pantalla ya existe, su ruta. (Las rutas se agregan al construir cada módulo.) */
const STEP_META: Record<string, { title: string; description: string; href?: string; optional?: boolean }> = {
  business_profile: { title: "Business profile", description: "Your business name, type, currency and delivery options.", href: "/settings/business" },
  branding: { title: "Brand", description: "Add your logo and color so customers recognize you.", href: "/settings/business", optional: true },
  business_hours: {
    title: "Business hours",
    description: "Days and hours you take orders. Outside them the bot tells customers when you open. Skip it to answer 24/7.",
    href: "/settings/hours",
    optional: true,
  },
  whatsapp: { title: "Connect WhatsApp", description: "Link your business number. Without it the bot can't exist.", href: "/settings/whatsapp" },
  payment_methods: { title: "Payment methods", description: "Where customers pay you: bank transfer, mobile payment, Zelle, USDT…", href: "/settings/payments" },
  catalog: { title: "Catalog", description: "Add the products customers will see.", href: "/catalog" },
  bot_menus: { title: "Bot menu", description: "The options customers see after the welcome message. Edit the suggested one.", href: "/settings/menu" },
  bot_messages: { title: "Bot messages", description: "Review the suggested texts and add your own details.", href: "/settings/messages" },
  test_bot: { title: "Test your bot", description: "Try a full order from your own phone before going live.", href: "/settings/go-live" },
  subscription: { title: "Choose a plan", description: "Unlocks orders, chats and your team.", href: "/settings/billing" },
  team: { title: "Invite your team", description: "Add operators to manage orders. Needs an active plan.", href: "/settings/team", optional: true },
  go_live: { title: "Go live", description: "Turn the bot on for your customers.", href: "/settings/go-live" },
};

const BLOCKER_LABELS: Record<string, string> = {
  whatsapp: "Connect WhatsApp",
  payment_methods: "Add a payment method",
  catalog: "Add a product",
  subscription: "Choose a plan",
};

export async function SetupChecklist({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_onboarding_status", { p_tenant: tenantId });
  const parsed = statusSchema.safeParse(data);
  if (!parsed.success) return null;

  const { steps, bot_enabled: botEnabled } = parsed.data;
  const required = steps.filter((step) => !STEP_META[step.key]?.optional);
  const doneCount = required.filter((step) => step.done).length;
  const percent = Math.round((doneCount / required.length) * 100);
  const nextStep = steps.find((step) => !step.done && !STEP_META[step.key]?.optional);

  return (
    <section aria-labelledby="setup-title" className="rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ProgressRing value={percent} label={`${percent}% of setup complete`} />
        <div className="min-w-0 flex-1">
          <h2 id="setup-title" className="text-lg font-semibold tracking-tight text-fg">
            {botEnabled ? "Your bot is live" : "Continue setup"}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {botEnabled
              ? "Customers can now order on WhatsApp. You can still change anything below."
              : nextStep
                ? `Next: ${STEP_META[nextStep.key]?.title ?? "Continue"}. Everything except the plan is free to set up.`
                : "Everything is ready. Turn your bot on when you are."}
          </p>
        </div>
      </div>

      <ol className="mt-6 divide-y divide-border rounded-lg border border-border">
        {steps.map((step) => {
          const meta = STEP_META[step.key];
          if (!meta) return null;
          const blockers = step.blocked_by.map((key) => BLOCKER_LABELS[key] ?? key);
          const isNext = nextStep?.key === step.key;
          const row = (
            <div className={cn("flex items-center gap-3 px-4 py-3", isNext && "bg-accent/15")}>
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  step.done ? "bg-accent text-accent-foreground" : "border border-chart-muted-strong text-fg-muted",
                )}
              >
                {step.done ? <Check className="size-3" aria-hidden /> : blockers.length > 0 ? <Lock className="size-3" aria-hidden /> : <Circle className="size-3" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">
                  {meta.title}
                  {meta.optional ? <span className="ml-2 text-[11px] font-normal text-fg-muted">Optional</span> : null}
                </p>
                <p className="text-xs text-fg-muted">{meta.description}</p>
                {/* Paso bloqueado: se explica qué falta, con texto (no solo color). */}
                {!step.done && blockers.length > 0 ? <p className="mt-1 text-xs font-medium text-fg">First: {blockers.join(", ")}.</p> : null}
              </div>
              {!step.done && !meta.href ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">Soon</span>
              ) : null}
            </div>
          );
          return (
            <li key={step.key}>
              {meta.href && !step.done ? (
                <Link href={meta.href} className="block transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-black">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
