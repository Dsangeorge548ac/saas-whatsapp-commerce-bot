/**
 * /admin/users/[id] — Detalle de una cuenta (mismo diseño que Tax Pro).
 * Cabecera con foto, nombre y estados; secciones Identity and contact, Business, Subscription, Platform access,
 * Account y Activity (auditoría del usuario, paginada en el servidor con ?page=).
 * Todo el staff lo ve (solo lectura); el developer además edita nombre, rol de plataforma y estado de la cuenta
 * (nunca la propia), edita el comercio (nombre, suspender), asigna un plan de cortesía y gestiona la suscripción de
 * Stripe (cambiar plan, cancelar, reembolsar). Cada cambio pide confirmación, los sensibles un motivo, y todo queda en audit_logs.
 */
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { z } from "zod";
import { Alert } from "@/components/feedback/alert";
import { StatusBadge, type BadgeTone } from "@/components/layout/status-badge";
import { UserAvatar } from "@/components/layout/user-avatar";
import { activityLabel, relativeTime } from "@/features/admin/activity";
import { AssignPlan, RemoveAssignedPlan, SubscriptionActions } from "@/features/admin/components/SubscriptionActions";
import { AccountEditor, DisableAccountButton, ExpandRow, PlatformRoleForm, TenantEditor } from "@/features/admin/components/UserEditors";
import { getUserActivity, getUserDetail } from "@/features/admin/queries";
import { subscriptionView, userIdSchema } from "@/features/admin/schemas";
import { avatarUrl } from "@/lib/files/avatar";
import type { PlanId } from "@/lib/stripe/plans";
import { ROLE_LABEL } from "@/features/profile/schemas";
import { requireWorkspace } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "User" };

export default function AdminUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <UserContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const fmt = (value: string | null) => (value ? date.format(new Date(value)) : "—");
const pageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);

const SUBSCRIPTION_TONE: Record<string, BadgeTone> = { active: "success", trialing: "success", past_due: "warning", canceled: "neutral", unpaid: "danger", incomplete: "warning" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({ label, value, badge, action }: { label: string; value?: React.ReactNode; badge?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">{label}{badge}</p>
        {value ? <div className="text-sm text-fg-muted">{value}</div> : null}
      </div>
      {action}
    </div>
  );
}

async function UserContent({ params, searchParams }: Pick<PageProps<"/admin/users/[id]">, "params" | "searchParams">) {
  await connection(); // Depende de la sesión y de la hora actual: solo en tiempo de petición.
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedId = userIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const page = pageSchema.parse(Array.isArray(query.page) ? query.page[0] : query.page);

  const [workspace, user, activity] = await Promise.all([requireWorkspace(), getUserDetail(parsedId.data), getUserActivity(parsedId.data, page)]);
  if (!user) notFound();

  const isDeveloper = workspace.platform_role === "developer";
  const isSelf = workspace.user.id === user.id;
  const canEdit = isDeveloper;
  const canChangeAccess = isDeveloper && !isSelf;
  const fullName = `${user.first_name} ${user.last_name}`.trim() || user.email;
  const now = new Date();
  const compActive = Boolean(user.comp_access_until && new Date(user.comp_access_until) > now);
  const liveStripe = user.has_stripe_subscription && ["active", "trialing", "past_due", "unpaid"].includes(user.subscription_status ?? "");
  const view = subscriptionView(user.subscription_status ?? "", user.cancel_at_period_end, user.comp_access_until, now);
  const roleText = user.platform_role ? ROLE_LABEL[user.platform_role] : user.tenant_role ? ROLE_LABEL[user.tenant_role] : "No role";

  return (
    <div className="flex w-full flex-col gap-8 py-2">
      <div>
        <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"><i className="ki-filled ki-arrow-left text-sm" aria-hidden /> All users</Link>
        <div className="mt-3 flex items-center gap-4">
          <UserAvatar firstName={user.first_name} lastName={user.last_name} size="lg" imageUrl={avatarUrl(user.id, user.avatar_path)} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-fg">{fullName}</h1>
              <StatusBadge tone={user.disabled ? "danger" : "success"}>{user.disabled ? "Disabled" : "Active"}</StatusBadge>
              {user.platform_role ? <StatusBadge tone="neutral">{ROLE_LABEL[user.platform_role]}</StatusBadge> : null}
              {isSelf ? <StatusBadge tone="accent">You</StatusBadge> : null}
            </div>
            <p className="mt-1 text-sm text-fg-muted">Joined {fmt(user.created_at)} · Last sign-in {user.last_sign_in_at ? relativeTime(user.last_sign_in_at, now) : "never"}</p>
          </div>
        </div>
      </div>

      {!isDeveloper ? <Alert tone="info" title="Read-only access">Only developers can edit accounts. Your role can review them.</Alert> : null}

      <Section title="Identity and contact">
        <Row
          label="Name and email"
          badge={<StatusBadge tone={user.email_confirmed ? "success" : "warning"}>{user.email_confirmed ? "Email verified" : "Email not verified"}</StatusBadge>}
          value={<>{user.first_name} {user.last_name} · {roleText}<br />{user.email}</>}
          action={canEdit ? <AccountEditor userId={user.id} firstName={user.first_name} lastName={user.last_name} email={user.email} emailConfirmed={user.email_confirmed} /> : null}
        />
      </Section>

      <Section title="Business" description="The business this person belongs to.">
        {user.tenant_id ? (
          <>
            <Row
              label="Business"
              badge={user.tenant_status === "suspended" ? <StatusBadge tone="danger">Suspended</StatusBadge> : null}
              value={<>{user.tenant_name}{user.tenant_slug ? <span className="text-fg-muted"> · {user.tenant_slug}</span> : null}</>}
              action={canEdit && user.tenant_name && user.tenant_status ? <TenantEditor tenantId={user.tenant_id} name={user.tenant_name} status={user.tenant_status} /> : null}
            />
            <Row label="Role in the business" value={`${user.tenant_role ? ROLE_LABEL[user.tenant_role] : "—"} · since ${fmt(user.member_since)}`} />
          </>
        ) : (
          <Row label="Business" value="Not part of any business." />
        )}
      </Section>

      {user.tenant_id ? (
        <Section title="Subscription" description="Paid plans are changed in Stripe. A complimentary plan gives access without charging.">
          <Row
            label="Paid subscription"
            badge={user.has_stripe_subscription && user.subscription_status ? <StatusBadge tone={SUBSCRIPTION_TONE[user.subscription_status] ?? "neutral"}>{user.cancel_at_period_end && liveStripe ? "Cancels at period end" : user.subscription_status.replace("_", " ")}</StatusBadge> : null}
            value={
              user.has_stripe_subscription && user.plan_name
                ? `${user.plan_name} · ${user.billing_interval === "yearly" ? "yearly" : "monthly"}${user.current_period_end ? ` · ${user.cancel_at_period_end ? "ends" : "renews"} ${fmt(user.current_period_end)}` : ""}`
                : "No paid subscription"
            }
            action={
              isDeveloper && user.has_stripe_subscription && user.plan_id ? (
                <SubscriptionActions tenantId={user.tenant_id} label={user.tenant_name ?? fullName} planId={user.plan_id as PlanId} interval={user.billing_interval} view={view} hasStripe lastPayment={null} />
              ) : null
            }
          />
          <Row
            label="Complimentary plan"
            badge={compActive ? <StatusBadge tone="accent">Active</StatusBadge> : null}
            value={compActive && user.plan_name ? `${user.plan_name} · until ${fmt(user.comp_access_until)}` : user.comp_access_until ? `Expired on ${fmt(user.comp_access_until)}` : "Not granted"}
            action={
              isDeveloper && !liveStripe ? (
                <span className="flex flex-wrap justify-end gap-2">
                  {compActive && user.plan_id ? <RemoveAssignedPlan tenantId={user.tenant_id} label={user.tenant_name ?? fullName} planId={user.plan_id as PlanId} /> : null}
                  <AssignPlan tenantId={user.tenant_id} label={user.tenant_name ?? fullName} currentPlanId={compActive ? (user.plan_id as PlanId) : null} currentUntil={compActive ? user.comp_access_until : null} />
                </span>
              ) : null
            }
          />
          {liveStripe && isDeveloper ? <Row label="Want to give a different plan?" value="This business pays in Stripe: use Change plan above, or cancel the subscription first to assign a complimentary plan." /> : null}
        </Section>
      ) : null}

      <Section title="Platform access" description="Platform admins audit (read-only); developers have full access.">
        {canChangeAccess ? (
          <ExpandRow label="Platform role" value={user.platform_role ? ROLE_LABEL[user.platform_role] : "None"} editLabel="Change">
            <PlatformRoleForm userId={user.id} current={user.platform_role} />
          </ExpandRow>
        ) : (
          <Row label="Platform role" value={user.platform_role ? ROLE_LABEL[user.platform_role] : "None"} />
        )}
      </Section>

      <Section title="Account">
        <Row
          label="Account status"
          badge={<StatusBadge tone={user.disabled ? "danger" : "success"}>{user.disabled ? "Disabled" : "Active"}</StatusBadge>}
          value={user.disabled ? "This person can't log in." : isSelf ? "Your own account can't be disabled." : "Disabling logs the person out everywhere and blocks new logins."}
          action={canChangeAccess ? <DisableAccountButton userId={user.id} disabled={user.disabled} name={fullName} /> : null}
        />
      </Section>

      <div id="activity" className="scroll-mt-6">
        <Section
          title="Activity"
          description={activity.total > 0 ? `${activity.total} ${activity.total === 1 ? "event" : "events"} where this person was the actor or the target.` : "Events where this person was the actor or the target."}
        >
          {activity.events.length === 0 ? (
            <Row label="No activity yet" />
          ) : (
            activity.events.map((event) => {
              const details = event.details && typeof event.details === "object" && Object.keys(event.details).length > 0 ? JSON.stringify(event.details) : null;
              return (
                <Row
                  key={event.id}
                  label={activityLabel(event.action)}
                  value={
                    <>
                      <span>{event.action} · {event.byUser ? "by the user" : "by the platform team or the system"}{event.ip ? ` · IP ${event.ip}` : ""}</span>
                      {details ? <pre className="mt-1.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-canvas p-2 font-mono text-[11px] text-fg-muted">{details}</pre> : null}
                    </>
                  }
                  action={<span className="text-xs text-fg-muted">{relativeTime(event.createdAt, now)}</span>}
                />
              );
            })
          )}
        </Section>
        {activity.pageCount > 1 ? (
          <nav aria-label="Activity pages" className="mt-3 flex items-center justify-between text-sm text-fg-muted">
            <span>Page {activity.page} of {activity.pageCount}</span>
            <div className="flex gap-2">
              {activity.page > 1 ? <Link href={`/admin/users/${user.id}?page=${activity.page - 1}#activity`} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-fg hover:bg-muted">Previous</Link> : null}
              {activity.page < activity.pageCount ? <Link href={`/admin/users/${user.id}?page=${activity.page + 1}#activity`} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-fg hover:bg-muted">Next</Link> : null}
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
