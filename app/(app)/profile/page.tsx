/**
 * /profile — Mis datos: ver y cambiar nombre, correo, contraseña y sesiones.
 * Disponible para cualquier usuario con sesión (dueño, operador, staff de plataforma). Los datos salen del
 * workspace (una llamada, ya validada con RLS) y la fecha de alta del propio perfil. Lee la sesión: <Suspense>.
 */
import { Suspense } from "react";
import type { Metadata } from "next";
import { ProfileView } from "@/features/profile/components/ProfileView";
import { currentMembership, requireWorkspace } from "@/lib/data/workspace";
import { createClient } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/files/avatar";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-canvas" aria-busy="true" />}>
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  const workspace = await requireWorkspace();
  const membership = currentMembership(workspace);
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("created_at").eq("id", workspace.user.id).maybeSingle();

  return (
    <ProfileView
      data={{
        userId: workspace.user.id,
        avatarUrl: avatarUrl(workspace.user.id, workspace.user.avatar_path),
        firstName: workspace.user.first_name,
        lastName: workspace.user.last_name,
        email: workspace.user.email,
        createdAt: profile?.created_at ?? new Date().toISOString(),
        platformRole: workspace.platform_role,
        business: membership ? { name: membership.name, role: membership.role } : null,
      }}
    />
  );
}
