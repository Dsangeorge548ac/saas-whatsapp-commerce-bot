/**
 * /admin/users — Todas las cuentas de la plataforma (staff). Búsqueda, filtro y página en la URL (validados con
 * Zod) y resueltos en el servidor por admin_list_users. Solo cuentas: nunca datos de clientes finales.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { UsersTable } from "@/features/admin/components/UsersTable";
import { listUsers } from "@/features/admin/queries";
import { userListParamsSchema } from "@/features/admin/schemas";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <UsersContent searchParams={searchParams} />
    </Suspense>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function UsersContent({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  await connection(); // Depende de la sesión: solo en tiempo de petición (no se prerenderiza).
  const query = await searchParams;
  const params = userListParamsSchema.parse({ q: first(query.q), filter: first(query.filter), page: first(query.page) });
  const data = await listUsers(params);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-medium tracking-tight text-fg">Users</h1>
        <p className="mt-1 text-sm text-fg-muted">Every account on the platform. Open one to see its details.</p>
      </header>
      <UsersTable {...data} params={params} />
    </div>
  );
}
