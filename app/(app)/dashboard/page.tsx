/**
 * /dashboard — Inicio del área privada (mismo diseño que Tax Pro: hero con degradado lima).
 *
 *   Hero con saludo
 *   Dueño: guía de configuración ("Continue setup") con el avance y el siguiente paso.
 *   Operador: accesos directos a lo que puede usar (pedidos, chats, catálogo). No ve la guía ni opciones que solo
 *   el dueño puede cambiar.
 *
 * Lee la sesión (getWorkspace), así que el contenido va dentro de <Suspense>.
 */
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList, MessageCircle, Store } from "lucide-react";
import { Alert } from "@/components/feedback/alert";
import { SetupChecklist } from "@/features/onboarding/components/SetupChecklist";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "Home" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const workspace = await requireWorkspace();
  const membership = currentMembership(workspace);
  const firstName = workspace.user.first_name || "there";
  const isOwner = membership?.role === "owner";

  return (
    <div className="flex w-full flex-col gap-8">
      <section className="relative -mx-4 -mt-4 px-4 pb-6 pt-12 sm:-mx-6 sm:px-6 sm:pt-14 lg:-mx-8 lg:px-8">
        <HeroBackground />
        <h1 className="relative text-balance text-center text-3xl font-medium tracking-tight text-fg sm:text-5xl">
          Welcome{membership ? ` to ${membership.name}` : ""}, {firstName}
        </h1>
        <p className="relative mt-3 text-center text-sm text-fg-muted">
          {isOwner || !membership ? "Set up your WhatsApp store step by step. We'll guide you." : "Here's what you can do for your team today."}
        </p>
      </section>

      {membership && !isOwner ? (
        <OperatorHome billable={membership.billable} businessName={membership.name} />
      ) : membership ? (
        <>
          {!membership.billable ? (
            <Alert tone="accent" title="Your store is in setup mode">
              Configure everything for free. Choose a plan when you&apos;re ready to take orders and invite your team.
            </Alert>
          ) : null}
          <SetupChecklist tenantId={membership.tenant_id} />
        </>
      ) : (
        <Alert tone="warning" title="We couldn't find your business">
          Sign out and log in again to finish creating it. If you were invited to a team, ask the owner to send you a new invitation.
        </Alert>
      )}
    </div>
  );
}

const OPERATOR_LINKS = [
  { href: "/orders", title: "Orders", text: "Review payment proofs and move orders forward.", icon: ClipboardList },
  { href: "/chats", title: "Chats", text: "Answer customers who asked for an agent.", icon: MessageCircle },
  { href: "/catalog", title: "Catalog", text: "See the products and catalogs customers order from.", icon: Store },
] as const;

/** Inicio del operador: accesos a sus módulos. Sin plan vigente, solo el aviso de pedírselo al dueño. */
function OperatorHome({ billable, businessName }: { billable: boolean; businessName: string }) {
  if (!billable) {
    return (
      <Alert tone="info" title={`${businessName} doesn't have an active plan`}>
        Orders and chats open again as soon as the owner renews the plan. Ask them to check Billing.
      </Alert>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-3">
      {OPERATOR_LINKS.map(({ href, title, text, icon: Icon }) => (
        <li key={href}>
          <Link href={href} className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-canvas focus-visible:ring-2 focus-visible:ring-black">
            <span className="grid size-9 place-items-center rounded-lg bg-black text-white"><Icon className="size-4" aria-hidden /></span>
            <span>
              <span className="block text-sm font-semibold text-fg">{title}</span>
              <span className="mt-1 block text-sm text-fg-muted">{text}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Degradado suave gris → blanco que se desvanece hacia abajo. (El acento actual de Tax Pro es casi
 * negro, así que el degradado usa los grises del tema para no tapar el texto.)
 */
function HeroBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,var(--color-chart-muted)_0%,#ffffff_55%,var(--color-canvas)_100%)] [mask-image:linear-gradient(to_bottom,black_40%,transparent)]"
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-8" aria-busy="true">
      <div className="mx-auto mt-10 h-12 w-2/3 animate-pulse rounded-lg bg-chart-muted" />
      <div className="h-80 animate-pulse rounded-lg bg-canvas" />
    </div>
  );
}
