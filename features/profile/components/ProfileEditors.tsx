"use client";
/**
 * Editores del perfil (se abren dentro de su fila): nombre, correo (con código), contraseña y cierre de las
 * demás sesiones. Toda operación se confirma antes de enviarse; las reglas reales están en el servidor
 * (features/profile/actions.ts). Los errores se muestran en línea, sin datos sensibles.
 */
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { notify } from "@/components/feedback/notify";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { Field, TextInput } from "@/components/forms/field";
import { FormAlert } from "@/components/forms/form-feedback";
import { OtpInput } from "@/components/forms/otp-input";
import { Button } from "@/components/ui/button";
import { changeMyPassword, confirmEmailChange, requestEmailChange, signOutOtherDevices, updateMyName } from "@/features/profile/actions";
import {
  changeEmailSchema, changePasswordFormSchema, profileNameSchema,
  type ChangeEmailInput, type ChangePasswordFormInput, type ProfileNameInput,
} from "@/features/profile/schemas";

/** Una fila con su etiqueta, valor y un botón Edit que despliega el editor (solo una operación a la vez por fila). */
export function EditableRow({ label, value, note, children }: { label: string; value: string; note?: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{label}</p>
          <p className="truncate text-sm text-fg-muted">{value}</p>
          {note ? <p className="mt-0.5 text-xs text-fg-muted">{note}</p> : null}
        </div>
        {!open ? <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Edit</Button> : null}
      </div>
      {open ? <div className="mt-4">{children(() => setOpen(false))}</div> : null}
    </div>
  );
}

/*
 * Filas listas para usar desde un Server Component (ProfileView): un Server Component no puede pasar una
 * función como hijo a un componente cliente, así que la función que abre cada editor vive aquí.
 */
export function NameRow({ firstName, lastName }: { firstName: string; lastName: string }) {
  return (
    <EditableRow label="Name" value={`${firstName} ${lastName}`}>
      {(close) => <NameEditor firstName={firstName} lastName={lastName} close={close} />}
    </EditableRow>
  );
}

export function EmailRow({ email }: { email: string }) {
  return (
    <EditableRow label="Email" value={email} note="Changing it needs your password and a code sent to the new address.">
      {(close) => <EmailEditor close={close} />}
    </EditableRow>
  );
}

export function PasswordRow() {
  return (
    <EditableRow label="Password" value="••••••••••••">
      {(close) => <PasswordEditor close={close} />}
    </EditableRow>
  );
}

function Actions({ onCancel, pending, label = "Save" }: { onCancel: () => void; pending: boolean; label?: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : label}</Button>
    </div>
  );
}

export function NameEditor({ firstName, lastName, close }: { firstName: string; lastName: string; close: () => void }) {
  const [pending, start] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<ProfileNameInput>({ resolver: zodResolver(profileNameSchema), defaultValues: { firstName, lastName } });

  async function onSubmit(values: ProfileNameInput) {
    const answer = await confirmAction({ title: "Save your name?", text: `Your name will be ${values.firstName} ${values.lastName}.`, confirmLabel: "Save" });
    if (!answer.confirmed) return;
    start(async () => {
      const result = await updateMyName(values);
      if (result.ok) { notify.success(result.message ?? "Saved"); close(); } else notify.error(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName?.message}>{(p) => <TextInput {...p} {...register("firstName")} autoComplete="given-name" autoFocus />}</Field>
        <Field label="Last name" error={errors.lastName?.message}>{(p) => <TextInput {...p} {...register("lastName")} autoComplete="family-name" />}</Field>
      </div>
      <Actions onCancel={close} pending={pending} />
    </form>
  );
}

/** Correo: paso 1 (correo nuevo + contraseña actual) y paso 2 (código enviado al correo nuevo). */
export function EmailEditor({ close }: { close: () => void }) {
  const [pending, start] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<ChangeEmailInput>({ resolver: zodResolver(changeEmailSchema) });

  function onRequest(values: ChangeEmailInput) {
    setError(null);
    start(async () => {
      const result = await requestEmailChange(values);
      if (result.ok) setSentTo(values.newEmail.trim().toLowerCase()); else setError(result.error);
    });
  }
  function onConfirm() {
    if (!sentTo) return;
    setError(null);
    start(async () => {
      const result = await confirmEmailChange({ newEmail: sentTo, code });
      if (result.ok) { notify.success(result.message ?? "Saved"); close(); } else setError(result.error);
    });
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">Enter the 6-digit code we sent to <span className="font-medium text-fg">{sentTo}</span>. Until you confirm it, your current email keeps working.</p>
        <OtpInput value={code} onChange={setCode} disabled={pending} label="Email confirmation code" autoFocus />
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={close} disabled={pending}>Cancel</Button>
          <Button type="button" size="sm" onClick={onConfirm} disabled={pending || code.length !== 6}>{pending ? "Checking…" : "Confirm email"}</Button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={handleSubmit(onRequest)} noValidate className="flex flex-col gap-5">
      <Field label="New email" error={errors.newEmail?.message}>{(p) => <TextInput {...p} {...register("newEmail")} type="email" autoComplete="email" autoFocus />}</Field>
      <Field label="Current password" error={errors.currentPassword?.message}>{(p) => <TextInput {...p} {...register("currentPassword")} type="password" autoComplete="current-password" />}</Field>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Actions onCancel={close} pending={pending} label="Send code" />
    </form>
  );
}

export function PasswordEditor({ close }: { close: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<ChangePasswordFormInput>({ resolver: zodResolver(changePasswordFormSchema) });

  async function onSubmit(values: ChangePasswordFormInput) {
    setError(null);
    const answer = await confirmAction({ title: "Change your password?", text: "Use the new password the next time you log in.", confirmLabel: "Change password" });
    if (!answer.confirmed) return;
    start(async () => {
      const result = await changeMyPassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      if (result.ok) { notify.success(result.message ?? "Saved"); close(); } else setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <Field label="Current password" error={errors.currentPassword?.message}>{(p) => <TextInput {...p} {...register("currentPassword")} type="password" autoComplete="current-password" autoFocus />}</Field>
      <Field label="New password" hint="At least 12 characters." error={errors.newPassword?.message}>{(p) => <TextInput {...p} {...register("newPassword")} type="password" autoComplete="new-password" />}</Field>
      <Field label="Confirm new password" error={errors.confirmPassword?.message}>{(p) => <TextInput {...p} {...register("confirmPassword")} type="password" autoComplete="new-password" />}</Field>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Actions onCancel={close} pending={pending} label="Change password" />
    </form>
  );
}

export function SignOutOthersButton() {
  const [pending, start] = useTransition();
  async function run() {
    const answer = await confirmAction({ title: "Sign out of other devices?", text: "You stay logged in here. Everywhere else you'll need to log in again.", confirmLabel: "Sign them out", tone: "danger" });
    if (!answer.confirmed) return;
    start(async () => {
      const result = await signOutOtherDevices();
      if (result.ok) notify.success(result.message ?? "Done"); else notify.error(result.error);
    });
  }
  return <Button variant="outline" size="sm" onClick={run} disabled={pending}>Sign out others</Button>;
}
