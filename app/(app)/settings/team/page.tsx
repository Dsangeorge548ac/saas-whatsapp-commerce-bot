/**
 * /settings/team — Equipo: operadores del comercio e invitaciones pendientes.
 * Invitar exige plan vigente y cupo de usuarios (la base de datos lo impone; aquí solo se explica).
 * Las invitaciones se leen SIN la columna del token (permiso por columna): solo se ve a quién se invitó.
 */
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { StatusBadge } from "@/components/layout/status-badge";
import { InviteForm } from "@/features/team/components/InviteForm";
import { RemoveOperatorButton, RevokeInvitationButton } from "@/features/team/components/TeamRowActions";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { PLAN_BY_ID, type PlanId } from "@/lib/stripe/plans";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <TeamContent />
    </Suspense>
  );
}

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

async function TeamContent() {
  const membership = currentMembership(await requireWorkspace());
  if (!membership) return null;
  const supabase = await createClient();

  const [{ data: members }, { data: invitations }, { data: subscription }] = await Promise.all([
    supabase.from("tenant_members").select("user_id, role, created_at").eq("tenant_id", membership.tenant_id).order("created_at"),
    supabase
      .from("tenant_invitations")
      .select("id, email, expires_at")
      .eq("tenant_id", membership.tenant_id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase.from("tenant_subscriptions").select("plan_id").eq("tenant_id", membership.tenant_id).maybeSingle(),
  ]);
  const ids = (members ?? []).map((member) => member.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids) : { data: [] };
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const plan = subscription ? PLAN_BY_ID.get(subscription.plan_id as PlanId) : undefined;
  const used = (members ?? []).length + (invitations ?? []).length;
  const full = Boolean(plan?.maxUsers && used >= plan.maxUsers);
  const disabledReason = !membership.billable
    ? "Inviting your team needs an active plan."
    : full
      ? `Your ${plan?.name} plan includes ${plan?.maxUsers} team members. Upgrade to add more.`
      : null;

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-fg">Invite an operator</h2>
        <p className="text-sm text-fg-muted">Operators review payments, move orders on the board and answer customers. They can&apos;t change settings.</p>
        <InviteForm disabledReason={disabledReason} />
        {!membership.billable ? <p className="text-xs"><Link href="/settings/billing" className="font-medium underline underline-offset-2">Choose a plan</Link> to unlock your team.</p> : null}
        {plan ? <p className="text-xs text-fg-muted">{used} of {plan.maxUsers ?? "unlimited"} team members used ({plan.name} plan).</p> : null}
      </section>

      <section aria-labelledby="members" className="flex flex-col gap-3">
        <h2 id="members" className="text-base font-semibold text-fg">Team</h2>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {(members ?? []).map((member) => {
            const profile = byId.get(member.user_id);
            const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || profile?.email || "Team member";
            return (
              <li key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{name}</p>
                  <p className="truncate text-xs text-fg-muted">{profile?.email} · since {date.format(new Date(member.created_at))}</p>
                </div>
                <StatusBadge tone={member.role === "owner" ? "accent" : "neutral"}>{member.role === "owner" ? "Owner" : "Operator"}</StatusBadge>
                {member.role === "operator" ? <RemoveOperatorButton userId={member.user_id} name={name} /> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {(invitations ?? []).length > 0 ? (
        <section aria-labelledby="pending" className="flex flex-col gap-3">
          <h2 id="pending" className="text-base font-semibold text-fg">Pending invitations</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(invitations ?? []).map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{invitation.email}</p>
                  <p className="text-xs text-fg-muted">Expires {date.format(new Date(invitation.expires_at))}</p>
                </div>
                <RevokeInvitationButton id={invitation.id} email={invitation.email} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
