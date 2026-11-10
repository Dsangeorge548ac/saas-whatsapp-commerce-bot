/**
 * Lista de usuarios de la plataforma: pestañas (todos, equipo de plataforma, dueños, operadores, inhabilitados),
 * búsqueda por nombre o correo y paginación; todo vive en la URL (TableToolbar) y se resuelve en el servidor.
 * En móvil la tabla se convierte en tarjetas. Es presentacional: recibe los datos ya consultados.
 */
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";
import { EmptyState, Pagination, TableCard, rowClass, tdClass, thClass, theadClass } from "@/components/data/data-table";
import { TableToolbar } from "@/components/data/table-toolbar";
import { StatusBadge } from "@/components/layout/status-badge";
import { UserAvatar } from "@/components/layout/user-avatar";
import { avatarUrl } from "@/lib/files/avatar";
import type { UserRow } from "@/features/admin/queries";
import { FILTER_LABEL, USER_FILTERS, type UserListParams } from "@/features/admin/schemas";
import { ROLE_LABEL } from "@/features/profile/schemas";
import { cn } from "@/lib/utils";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

type Props = { rows: UserRow[]; total: number; page: number; pageCount: number; params: UserListParams; detailBase?: string };

function RoleBadge({ user }: { user: UserRow }) {
  if (user.platform_role) return <StatusBadge tone="accent">{ROLE_LABEL[user.platform_role]}</StatusBadge>;
  if (user.tenant_role) return <StatusBadge tone="neutral">{ROLE_LABEL[user.tenant_role]}</StatusBadge>;
  return <span className="text-fg-muted">—</span>;
}

export function UsersTable({ rows, total, page, pageCount, params, detailBase = "/admin/users" }: Props) {
  const href = (nextPage: number) => `/admin/users?${new URLSearchParams({ ...(params.filter !== "all" ? { filter: params.filter } : {}), ...(params.q ? { q: params.q } : {}), page: String(nextPage) })}`;
  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        tabs={{ name: "filter", defaultValue: "all", label: "Filter users", items: USER_FILTERS.map((filter) => ({ value: filter, label: FILTER_LABEL[filter] })) }}
        search={{ placeholder: "Search by name or email" }}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No users found" text={params.q || params.filter !== "all" ? "Try another search or clear the filters." : "Accounts appear here when people sign up."} />
      ) : (
        <>
          <TableCard minWidth="44rem" className="hidden md:block">
            <thead className={theadClass}>
              <tr>
                {["User", "Business", "Role", "Account", "Joined"].map((h) => <th key={h} scope="col" className={thClass}>{h}</th>)}
                <th scope="col" className={thClass}><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((user) => (
                <tr key={user.id} className={rowClass}>
                  <td className={tdClass}>
                    <div className="flex items-center gap-3">
                      <UserAvatar firstName={user.first_name} lastName={user.last_name} size="sm" imageUrl={avatarUrl(user.id, user.avatar_path)} />
                      <div className="min-w-0">
                        <Link href={`${detailBase}/${user.id}`} className="font-semibold text-fg underline-offset-2 hover:underline">{user.first_name} {user.last_name}</Link>
                        <p className="truncate text-xs text-fg-muted">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className={cn(tdClass, "text-fg-muted")}>{user.tenant_name ?? "—"}</td>
                  <td className={tdClass}><RoleBadge user={user} /></td>
                  <td className={tdClass}><StatusBadge tone={user.disabled ? "danger" : "success"}>{user.disabled ? "Disabled" : "Active"}</StatusBadge></td>
                  <td className={cn(tdClass, "whitespace-nowrap text-fg-muted")}>{date.format(new Date(user.created_at))}</td>
                  <td className={cn(tdClass, "text-right")}>
                    <Link href={`${detailBase}/${user.id}`} aria-label={`Open ${user.first_name} ${user.last_name}`} className="inline-grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-muted hover:text-fg"><ChevronRight className="size-4" aria-hidden /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          {/* En móvil la tabla se convierte en tarjetas. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((user) => (
              <li key={user.id}>
                <Link href={`${detailBase}/${user.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4">
                  <UserAvatar firstName={user.first_name} lastName={user.last_name} size="sm" imageUrl={avatarUrl(user.id, user.avatar_path)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{user.first_name} {user.last_name}</p>
                    <p className="truncate text-xs text-fg-muted">{user.email}{user.tenant_name ? ` · ${user.tenant_name}` : ""}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <RoleBadge user={user} />
                      <StatusBadge tone={user.disabled ? "danger" : "success"}>{user.disabled ? "Disabled" : "Active"}</StatusBadge>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <Pagination page={page} pageCount={pageCount} total={total} noun={total === 1 ? "user" : "users"} href={href} />
    </div>
  );
}
