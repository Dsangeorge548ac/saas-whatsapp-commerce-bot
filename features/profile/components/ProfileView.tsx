/**
 * Vista del perfil ("My information"): cuenta (foto, nombre, correo, contraseña, sesiones) y acceso (rol de
 * plataforma, comercio y rol en él). Mismo diseño que Tax Pro: secciones con título fuera de la tarjeta y
 * filas separadas por líneas. Es presentacional: recibe los datos ya leídos (se puede previsualizar sin sesión).
 */
import { StatusBadge } from "@/components/layout/status-badge";
import { UserAvatar } from "@/components/layout/user-avatar";
import { AvatarEditor } from "@/features/profile/components/AvatarEditor";
import { EmailRow, NameRow, PasswordRow, SignOutOthersButton } from "@/features/profile/components/ProfileEditors";
import { ROLE_LABEL } from "@/features/profile/schemas";

export type ProfileData = {
  userId: string;
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  platformRole: "developer" | "platform_admin" | null;
  business: { name: string; role: "owner" | "operator" } | null;
};

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {subtitle ? <p className="mb-2 text-sm text-fg-muted">{subtitle}</p> : <div className="mb-2" />}
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({ label, value, action }: { label: string; value: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{label}</p>
        <div className="truncate text-sm text-fg-muted">{value}</div>
      </div>
      {action}
    </div>
  );
}

export function ProfileView({ data }: { data: ProfileData }) {
  return (
    <div className="mx-auto flex w-full flex-col gap-8 py-2">
      <header className="flex items-center gap-4">
        <UserAvatar firstName={data.firstName} lastName={data.lastName} size="lg" imageUrl={data.avatarUrl} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-medium tracking-tight text-fg">{data.firstName} {data.lastName}</h1>
          <p className="truncate text-sm text-fg-muted">{data.email}</p>
        </div>
      </header>

      <Section title="Your account" subtitle="Your personal details and how you log in.">
        <AvatarEditor userId={data.userId} firstName={data.firstName} lastName={data.lastName} imageUrl={data.avatarUrl} />
        <NameRow firstName={data.firstName} lastName={data.lastName} />
        <EmailRow email={data.email} />
        <PasswordRow />
        <Row label="Other devices" value="Log out everywhere except here." action={<SignOutOthersButton />} />
        <Row label="Member since" value={date.format(new Date(data.createdAt))} />
      </Section>

      <Section title="Access" subtitle="What you can do on the platform. Only the platform team can change roles.">
        {data.platformRole ? (
          <Row label="Platform role" value={<StatusBadge tone="accent">{ROLE_LABEL[data.platformRole]}</StatusBadge>} />
        ) : null}
        {data.business ? (
          <>
            <Row label="Business" value={data.business.name} />
            <Row label="Role in the business" value={<StatusBadge tone="neutral">{ROLE_LABEL[data.business.role]}</StatusBadge>} />
          </>
        ) : (
          <Row label="Business" value="You are not part of a business yet." />
        )}
      </Section>
    </div>
  );
}
