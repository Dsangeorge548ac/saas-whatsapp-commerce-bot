/**
 * /admin/subscriptions — Módulo de suscripciones (diseño de Tax Pro + historial completo).
 *   - Indicadores del estado actual: suscriptores activos, ingreso mensual (MRR), cobrado este mes, no renovaron,
 *     de cortesía y terminadas.
 *   - Tabla con UNA FILA POR SUSCRIPCIÓN (subscription_history): si un comercio se suscribió, pidió reembolso o
 *     canceló y se volvió a suscribir, se ven los dos registros. La vigente va primero, marcada "Current", y es la
 *     única con acciones (solo developer): cambiar plan, cancelar, mantener, reembolsar o cortesía, siempre por
 *     Stripe con motivo y auditoría. Las anteriores muestran su resultado final y lo cobrado y reembolsado.
 *   - Pestañas por estado con conteos, búsqueda y plan; paginación en la base.
 * El layout de /admin exige rol de plataforma y la base lo vuelve a comprobar; los filtros viven en la URL (Zod).
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { EmptyState, Pagination } from "@/components/data/data-table";
import { TableToolbar } from "@/components/data/table-toolbar";
import { SyncButton } from "@/features/admin/components/SubscriptionActions";
import { SubscriptionRecordsCards, SubscriptionRecordsTable } from "@/features/admin/components/SubscriptionRecords";
import { historyListParamsSchema, type HistoryListParams } from "@/features/admin/schemas";
import { getSubscriptionKpis, listSubscriptionHistory, type SubscriptionKpis } from "@/features/admin/subscriptions-data";
import type { HistoryFilter } from "@/features/billing/history";
import { formatPlanPrice } from "@/lib/stripe/plans";
import { requireWorkspace } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "Subscriptions" };

const TABS: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "new", label: "New" },
  { value: "canceling", label: "Canceling" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
  { value: "expired", label: "Expired" },
  { value: "refunded", label: "Refunded" },
  { value: "complimentary", label: "Complimentary" },
  { value: "pending", label: "Pending" },
];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function AdminSubscriptionsPage({ searchParams }: PageProps<"/admin/subscriptions">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <SubscriptionsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SubscriptionsContent({ searchParams }: Pick<PageProps<"/admin/subscriptions">, "searchParams">) {
  await connection(); // Depende de la sesión y de la hora actual ("nuevas", "vencidas"): solo en tiempo de petición.
  const query = await searchParams;
  // Compatibilidad con enlaces viejos (?status=…): se traduce al filtro nuevo.
  const legacy = first(query.status);
  const outcome = first(query.outcome) ?? (legacy === "issue" ? "failed" : legacy === "ended" ? "canceled" : legacy);
  const params = historyListParamsSchema.parse({ q: first(query.q), outcome, plan: first(query.plan), page: first(query.page) });
  const [workspace, list, kpis] = await Promise.all([requireWorkspace(), listSubscriptionHistory(params), getSubscriptionKpis()]);
  const isDeveloper = workspace.platform_role === "developer";
  const filtered = Boolean(params.q) || params.outcome !== "all" || params.plan !== "all";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-fg">Subscriptions</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Every subscription is kept as its own record, including canceled, refunded and expired ones. Changes go through Stripe and the audit log.
          </p>
        </div>
        {isDeveloper ? <SyncButton /> : null}
      </header>

      <KpiGrid kpis={kpis} ended={list.counts.canceled + list.counts.expired} />
      <TableToolbar
        tabs={{ name: "outcome", defaultValue: "all", label: "Status", items: TABS.map((t) => ({ value: t.value, label: t.label, count: list.counts[t.value] })) }}
        search={{ placeholder: "Search business, owner or email" }}
        selects={[{ name: "plan", label: "Plan", allLabel: "All plans", allValue: "all", options: [{ value: "starter", label: "Starter" }, { value: "pro", label: "Pro" }, { value: "business", label: "Business" }] }]}
      />

      {list.rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No subscriptions match these filters" : "No subscriptions yet"}
          text={filtered ? "Try another search or clear the filters." : "They appear here when a business subscribes or gets a complimentary plan."}
        />
      ) : (
        <>
          <SubscriptionRecordsTable rows={list.rows} canEdit={isDeveloper} />
          <SubscriptionRecordsCards rows={list.rows} canEdit={isDeveloper} />
        </>
      )}

      <Pagination page={list.page} pageCount={list.pageCount} total={list.total} noun={list.total === 1 ? "subscription" : "subscriptions"} href={(page) => href(params, { page })} />
    </div>
  );
}

function href(params: HistoryListParams, over: Partial<HistoryListParams>) {
  const next = { ...params, ...over };
  const search = new URLSearchParams({ outcome: next.outcome, plan: next.plan, page: String(next.page), ...(next.q ? { q: next.q } : {}) });
  return `/admin/subscriptions?${search}`;
}

/** Indicadores. "Ended" cuenta los REGISTROS cancelados o vencidos (no solo la suscripción actual de cada comercio). */
function KpiGrid({ kpis, ended }: { kpis: SubscriptionKpis; ended: number }) {
  const items = [
    { label: "Active subscribers", value: String(kpis.active), note: `${kpis.renewingSoon} renewing in 7 days` },
    { label: "Monthly recurring revenue", value: formatPlanPrice(kpis.mrrCents), note: "Yearly plans counted per month" },
    { label: "Collected this month", value: formatPlanPrice(kpis.paidThisMonthCents), note: kpis.refundedThisMonthCents > 0 ? `Net of ${formatPlanPrice(kpis.refundedThisMonthCents)} refunded` : "Paid invoices, net of refunds" },
    { label: "Not renewed", value: String(kpis.issues), note: "Payment failed or unpaid", alert: kpis.issues > 0 },
    { label: "Complimentary", value: String(kpis.complimentary), note: "Assigned by the platform team" },
    { label: "Ended", value: String(ended), note: "Canceled or expired subscriptions" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <section key={item.label} className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs text-fg-muted">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-fg">
            {item.value}
            {item.alert ? <span className="ml-2 inline-block size-2 rounded-full bg-danger align-middle" aria-hidden /> : null}
          </p>
          <p className="mt-1 text-xs text-fg-muted">{item.note}</p>
        </section>
      ))}
    </div>
  );
}
