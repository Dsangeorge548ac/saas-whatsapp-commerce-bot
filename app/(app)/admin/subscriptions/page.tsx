/**
 * /admin/subscriptions — Suscripciones de todos los comercios (mismo diseño que Tax Pro).
 *   - Indicadores: suscriptores activos, ingreso mensual (MRR), cobrado este mes, no renovaron, terminadas y
 *     de cortesía.
 *   - Tabla filtrable (estado, plan, búsqueda) con paginación en la base.
 *   - Acciones por fila (solo developer): cambiar de plan, cancelar, mantener y reembolsar, siempre a través de
 *     Stripe con motivo y auditoría; en las de cortesía, cambiar o quitar el acceso.
 * El layout de /admin ya exige rol de plataforma; los filtros viven en la URL y se validan con Zod.
 */
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { EmptyState, Pagination, TableCard, rowClass, tdClass, thClass, theadClass } from "@/components/data/data-table";
import { TableToolbar } from "@/components/data/table-toolbar";
import { StatusBadge, type BadgeTone } from "@/components/layout/status-badge";
import { AssignPlan, RemoveAssignedPlan, SubscriptionActions, SyncButton } from "@/features/admin/components/SubscriptionActions";
import { subscriptionListParamsSchema, type SubscriptionListParams } from "@/features/admin/schemas";
import { getSubscriptionKpis, listSubscriptions, type AdminSubscriptionRow, type SubscriptionKpis } from "@/features/admin/subscriptions-data";
import { formatPlanPrice } from "@/lib/stripe/plans";
import { requireWorkspace } from "@/lib/data/workspace";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Subscriptions" };

const VIEW_BADGE: Record<AdminSubscriptionRow["view"], { tone: BadgeTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  canceling: { tone: "warning", label: "Cancels at period end" },
  issue: { tone: "danger", label: "Not renewed" },
  ended: { tone: "neutral", label: "Ended" },
  complimentary: { tone: "accent", label: "Complimentary" },
  other: { tone: "warning", label: "Pending" },
};
const PAYMENT_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  paid: { tone: "success", label: "Paid" },
  pending: { tone: "warning", label: "Pending" },
  failed: { tone: "danger", label: "Failed" },
  refunded: { tone: "neutral", label: "Refunded" },
};
const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "canceling", label: "Canceling" },
  { value: "issue", label: "Not renewed" },
  { value: "complimentary", label: "Complimentary" },
  { value: "ended", label: "Ended" },
] as const;

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const fmt = (value: string | null) => (value ? date.format(new Date(value)) : "—");
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function AdminSubscriptionsPage({ searchParams }: PageProps<"/admin/subscriptions">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <SubscriptionsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SubscriptionsContent({ searchParams }: Pick<PageProps<"/admin/subscriptions">, "searchParams">) {
  await connection(); // Depende de la sesión y de la hora actual: solo en tiempo de petición.
  const query = await searchParams;
  const params = subscriptionListParamsSchema.parse({ q: first(query.q), status: first(query.status), plan: first(query.plan), page: first(query.page) });
  const [workspace, list, kpis] = await Promise.all([requireWorkspace(), listSubscriptions(params), getSubscriptionKpis()]);
  const isDeveloper = workspace.platform_role === "developer";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-fg">Subscriptions</h1>
          <p className="mt-1 text-sm text-fg-muted">Paid plans change in Stripe and are recorded in the audit log. Complimentary plans don&apos;t charge.</p>
        </div>
        {isDeveloper ? <SyncButton /> : null}
      </header>

      <KpiGrid kpis={kpis} />
      <TableToolbar
        tabs={{ name: "status", defaultValue: "all", label: "Status", items: STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label })) }}
        search={{ placeholder: "Search business, owner or email" }}
        selects={[{ name: "plan", label: "Plan", allLabel: "All plans", allValue: "all", options: [{ value: "starter", label: "Starter" }, { value: "pro", label: "Pro" }, { value: "business", label: "Business" }] }]}
      />

      {list.rows.length === 0 ? (
        <EmptyState
          title={list.total === 0 && !params.q && params.status === "all" && params.plan === "all" ? "No subscriptions yet" : "No subscriptions match these filters"}
          text={list.total === 0 && !params.q && params.status === "all" && params.plan === "all" ? "They appear here when a business subscribes or gets a complimentary plan." : "Try another search or clear the filters."}
        />
      ) : (
        <>
          <Table rows={list.rows} canEdit={isDeveloper} />
          <Cards rows={list.rows} canEdit={isDeveloper} />
        </>
      )}

      <Pagination page={list.page} pageCount={list.pageCount} total={list.total} noun={list.total === 1 ? "subscription" : "subscriptions"} href={(page) => href(params, { page })} />
    </div>
  );
}

function href(params: SubscriptionListParams, over: Partial<SubscriptionListParams>) {
  const next = { ...params, ...over };
  const search = new URLSearchParams({ status: next.status, plan: next.plan, page: String(next.page), ...(next.q ? { q: next.q } : {}) });
  return `/admin/subscriptions?${search}`;
}

function KpiGrid({ kpis }: { kpis: SubscriptionKpis }) {
  const items = [
    { label: "Active subscribers", value: String(kpis.active), note: `${kpis.renewingSoon} renewing in 7 days` },
    { label: "Monthly recurring revenue", value: formatPlanPrice(kpis.mrrCents), note: "Yearly plans counted per month" },
    { label: "Collected this month", value: formatPlanPrice(kpis.paidThisMonthCents), note: kpis.refundedThisMonthCents > 0 ? `Net of ${formatPlanPrice(kpis.refundedThisMonthCents)} refunded` : "Paid invoices, net of refunds" },
    { label: "Not renewed", value: String(kpis.issues), note: "Payment failed or unpaid", alert: kpis.issues > 0 },
    { label: "Complimentary", value: String(kpis.complimentary), note: "Assigned by the platform team" },
    { label: "Ended", value: String(kpis.ended), note: "Canceled or expired" },
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

/** Qué fecha mostrar según el estado. */
function period(row: AdminSubscriptionRow) {
  if (row.view === "complimentary") return { title: "Until", date: row.comp_access_until };
  if (row.view === "ended") return { title: "Ended", date: row.canceled_at ?? row.current_period_end };
  if (row.view === "canceling") return { title: "Ends", date: row.current_period_end };
  if (row.view === "issue") return { title: "Was due", date: row.current_period_end };
  return { title: "Renews", date: row.current_period_end };
}

function Actions({ row }: { row: AdminSubscriptionRow }) {
  const label = row.tenant_name;
  if (row.view === "complimentary" && !row.has_stripe) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <RemoveAssignedPlan tenantId={row.tenant_id} label={label} planId={row.plan_id} />
        <AssignPlan tenantId={row.tenant_id} label={label} currentPlanId={row.plan_id} currentUntil={row.comp_access_until} />
      </div>
    );
  }
  return <SubscriptionActions tenantId={row.tenant_id} label={label} planId={row.plan_id} interval={row.billing_interval} view={row.view} hasStripe={row.has_stripe} lastPayment={row.last_payment} />;
}

function Owner({ row }: { row: AdminSubscriptionRow }) {
  return (
    <>
      {row.owner_id ? (
        <Link href={`/admin/users/${row.owner_id}`} className="font-medium text-fg hover:underline">{row.tenant_name}</Link>
      ) : (
        <span className="font-medium text-fg">{row.tenant_name}</span>
      )}
      <p className="text-xs text-fg-muted">{row.owner_name ?? "—"}{row.owner_email ? ` · ${row.owner_email}` : ""}</p>
    </>
  );
}

function Table({ rows, canEdit }: { rows: AdminSubscriptionRow[]; canEdit: boolean }) {
  return (
    <TableCard minWidth="56rem" className="hidden md:block">
        <thead className={theadClass}>
          <tr>
            {["Business", "Plan", "Status", "Activated", "Period", "Last payment"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}
            {canEdit ? <th scope="col" className={cn(thClass, "text-right")}>Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const badge = VIEW_BADGE[row.view];
            const when = period(row);
            const payment = row.last_payment ? PAYMENT_BADGE[row.last_payment.status] : null;
            return (
              <tr key={row.tenant_id} className={rowClass}>
                <td className={tdClass}><Owner row={row} /></td>
                <td className={cn(tdClass, "text-fg")}>
                  {row.plan_name}
                  <p className="text-xs text-fg-muted">{row.has_stripe ? (row.billing_interval === "yearly" ? "Yearly" : "Monthly") : "No charge"}</p>
                </td>
                <td className={tdClass}>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                  {row.tenant_status === "suspended" ? <p className="mt-1 text-xs text-danger-strong">Business suspended</p> : null}
                </td>
                <td className={cn(tdClass, "text-fg-muted")}>{fmt(row.activated_at)}</td>
                <td className={tdClass}><span className="text-xs text-fg-muted">{when.title}</span><p className="text-fg">{fmt(when.date)}</p></td>
                <td className={tdClass}>
                  {row.last_payment && payment ? (
                    <div className="flex flex-col gap-1">
                      <StatusBadge tone={payment.tone}>{payment.label}</StatusBadge>
                      <span className="text-xs text-fg-muted">{formatPlanPrice(row.last_payment.amount_cents)} · {fmt(row.last_payment.at)}</span>
                    </div>
                  ) : <span className="text-fg-muted">—</span>}
                </td>
                {canEdit ? <td className={tdClass}><Actions row={row} /></td> : null}
              </tr>
            );
          })}
        </tbody>
    </TableCard>
  );
}

/** En móvil la tabla se convierte en tarjetas. */
function Cards({ rows, canEdit }: { rows: AdminSubscriptionRow[]; canEdit: boolean }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {rows.map((row) => {
        const badge = VIEW_BADGE[row.view];
        const when = period(row);
        return (
          <li key={row.tenant_id} className="rounded-lg border border-border bg-surface p-4">
            <Owner row={row} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              <span className="text-xs text-fg-muted">{row.plan_name} · {when.title.toLowerCase()} {fmt(when.date)}</span>
            </div>
            {canEdit ? <div className="mt-3"><Actions row={row} /></div> : null}
          </li>
        );
      })}
    </ul>
  );
}
