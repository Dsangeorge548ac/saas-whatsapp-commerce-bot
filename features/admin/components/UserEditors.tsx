"use client";
/**
 * Acciones del detalle de un usuario (solo las ve el developer): editar la cuenta (nombre, correo, verificación),
 * el comercio (nombre, suspender), cambiar el rol de plataforma e inhabilitar o reactivar la cuenta. Las acciones destructivas piden confirmación y un motivo (queda en la
 * auditoría). La UI es solo comodidad: las Server Actions y la base vuelven a exigir el rol de developer.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/components/feedback/notify";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { Field, SelectInput } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { adminSetDisabled, adminSetPlatformRole, adminUpdateAccount, adminUpdateTenant } from "@/features/admin/actions";
import { AdminActionDialog, OptionCard } from "@/features/admin/components/AdminActionDialog";
import { adminAccountSchema, adminTenantSchema } from "@/features/admin/schemas";

/**
 * Fila de ajuste con un botón que despliega su editor debajo (mismo patrón que Configuración en Tax Pro).
 * Recibe el editor ya armado como elemento (los Server Components pueden pasarlo, a diferencia de una función).
 */
export function ExpandRow({ label, value, badge, editLabel = "Edit", children }: { label: string; value: React.ReactNode; badge?: React.ReactNode; editLabel?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">{label}{badge}</p>
          <div className="text-sm text-fg-muted">{value}</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Close" : editLabel}</Button>
      </div>
      {open ? <div className="mt-4 border-t border-border pt-4">{children}</div> : null}
    </div>
  );
}

const inputClass = "h-10 rounded-lg border border-border bg-surface px-3 text-sm font-normal outline-none focus:border-black aria-invalid:border-danger";

/** Datos de la cuenta: nombre, correo y si el correo está verificado (cambiar el correo no pide código). */
export function AccountEditor({ userId, firstName, lastName, email, emailConfirmed }: { userId: string; firstName: string; lastName: string; email: string; emailConfirmed: boolean }) {
  const [values, setValues] = useState({ firstName, lastName, email, emailConfirmed });
  const parsed = adminAccountSchema.safeParse(values);
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: key === "emailConfirmed" ? event.target.checked : event.target.value }));
  return (
    <AdminActionDialog
      triggerLabel="Edit"
      title={`Edit ${firstName} ${lastName}`}
      description="Changing the email doesn't send a code: the person logs in with the new email right away. Use it with care."
      confirmLabel="Save changes"
      disabled={!parsed.success}
      onSave={(reason) => adminUpdateAccount(userId, values, reason)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg">First name<input value={values.firstName} onChange={set("firstName")} maxLength={80} className={inputClass} /></label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg">Last name<input value={values.lastName} onChange={set("lastName")} maxLength={80} className={inputClass} /></label>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-medium text-fg">Email<input type="email" value={values.email} onChange={set("email")} maxLength={254} className={inputClass} /></label>
      <label className="flex cursor-pointer items-center gap-3 text-sm text-fg">
        <input type="checkbox" checked={values.emailConfirmed} onChange={set("emailConfirmed")} className="size-4 accent-black" />
        Email verified
      </label>
      {!parsed.success ? <p className="text-xs text-danger-strong">{parsed.error.issues[0]?.message}</p> : null}
    </AdminActionDialog>
  );
}

/** Comercio: nombre y estado (suspenderlo corta el acceso de todo su equipo). */
export function TenantEditor({ tenantId, name, status }: { tenantId: string; name: string; status: "active" | "suspended" }) {
  const [values, setValues] = useState<{ name: string; status: "active" | "suspended" }>({ name, status });
  const parsed = adminTenantSchema.safeParse(values);
  return (
    <AdminActionDialog
      triggerLabel="Edit"
      title={`Edit ${name}`}
      description="A suspended business can't log in, its bot stops answering and nothing is lost."
      confirmLabel="Save changes"
      confirmVariant={values.status === "suspended" && status !== "suspended" ? "destructive" : "default"}
      disabled={!parsed.success}
      onSave={(reason) => adminUpdateTenant(tenantId, values, reason)}
    >
      <label className="flex flex-col gap-1.5 text-xs font-medium text-fg">Business name<input value={values.name} onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))} maxLength={120} className={inputClass} /></label>
      <div role="radiogroup" aria-label="Business status" className="flex flex-col gap-2">
        <OptionCard selected={values.status === "active"} onSelect={() => setValues((v) => ({ ...v, status: "active" }))} title="Active" text="The business works normally." />
        <OptionCard selected={values.status === "suspended"} onSelect={() => setValues((v) => ({ ...v, status: "suspended" }))} title="Suspended" text="Nobody on its team can use the app." />
      </div>
    </AdminActionDialog>
  );
}

export function PlatformRoleForm({ userId, current }: { userId: string; current: "developer" | "platform_admin" | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [role, setRole] = useState<string>(current ?? "none");

  async function save() {
    const answer = await confirmAction({ title: "Change the platform role?", text: role === "none" ? "This person loses platform access." : "This changes what they can see and do across all businesses.", confirmLabel: "Change role", tone: "danger", requireReason: true });
    if (!answer.confirmed) return;
    start(async () => {
      const result = await adminSetPlatformRole(userId, role, answer.reason);
      if (result.ok) { notify.success(result.message ?? "Saved"); router.refresh(); } else notify.error(result.error);
    });
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <Field label="Platform role" className="flex-1">
        {(p) => (
          <SelectInput {...p} value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="none">No platform role</option>
            <option value="platform_admin">Platform admin (read-only audit)</option>
            <option value="developer">Developer (full access)</option>
          </SelectInput>
        )}
      </Field>
      <Button size="sm" onClick={save} disabled={pending || role === (current ?? "none")}>{pending ? "Saving…" : "Change role"}</Button>
    </div>
  );
}

export function DisableAccountButton({ userId, disabled, name }: { userId: string; disabled: boolean; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  async function toggle() {
    const answer = await confirmAction({
      title: disabled ? `Enable ${name}?` : `Disable ${name}?`,
      text: disabled ? "They will be able to log in again." : "They are logged out everywhere right away and can't log in until you enable the account.",
      confirmLabel: disabled ? "Enable account" : "Disable account",
      tone: disabled ? "default" : "danger",
      requireReason: true,
    });
    if (!answer.confirmed) return;
    start(async () => {
      const result = await adminSetDisabled(userId, !disabled, answer.reason);
      if (result.ok) { notify.success(result.message ?? "Done"); router.refresh(); } else notify.error(result.error);
    });
  }
  return <Button variant={disabled ? "outline" : "destructive"} size="sm" onClick={toggle} disabled={pending}>{disabled ? "Enable account" : "Disable account"}</Button>;
}
