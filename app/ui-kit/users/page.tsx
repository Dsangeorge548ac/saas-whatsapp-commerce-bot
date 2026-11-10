/**
 * /ui-kit/users — Vista previa del perfil y de la lista de usuarios con datos de EJEMPLO (solo desarrollo).
 * En producción responde 404.
 */
import { notFound } from "next/navigation";
import { UsersTable } from "@/features/admin/components/UsersTable";
import type { UserRow } from "@/features/admin/queries";
import { ProfileView } from "@/features/profile/components/ProfileView";

const row = (n: number, over: Partial<UserRow>): UserRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, email: `user${n}@example.com`, first_name: "Ana", last_name: "Pérez",
  created_at: "2026-10-01T12:00:00Z", avatar_path: null, platform_role: null, tenant_name: "Luna Bakery", tenant_role: "owner", disabled: false, ...over,
});

const rows = [
  row(1, { first_name: "Fernando", last_name: "Acuña", email: "dev@example.com", platform_role: "developer", tenant_name: "Demo Bakery" }),
  row(2, { first_name: "Carla", last_name: "Díaz", tenant_role: "operator" }),
  row(3, { first_name: "Luis", last_name: "Gómez", tenant_name: "Casa Luis", disabled: true }),
  row(4, { first_name: "Marta", last_name: "Ruiz", tenant_name: null, tenant_role: null, platform_role: "platform_admin" }),
];

export default function UsersPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-12 bg-surface px-4 py-8">
      <ProfileView data={{ userId: "11111111-1111-4111-8111-111111111111", avatarUrl: null, firstName: "Fernando", lastName: "Acuña", email: "dev@example.com", createdAt: "2026-10-01T12:00:00Z", platformRole: "developer", business: { name: "Demo Bakery", role: "owner" } }} />
      <UsersTable rows={rows} total={44} page={1} pageCount={3} params={{ q: "", filter: "all", page: 1 }} />
    </main>
  );
}
