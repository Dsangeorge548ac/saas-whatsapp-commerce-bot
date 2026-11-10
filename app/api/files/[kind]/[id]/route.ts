/**
 * GET /api/files/product/<id> — foto de un producto, para el panel del comercio.
 * GET /api/files/proof/<id>   — comprobante de pago (imagen o PDF) de un pedido.
 * GET /api/files/logo/<tenantId> — logo del comercio (visible para sus miembros).
 * GET /api/files/avatar/<userId> — foto de perfil (la ven la propia persona, sus compañeros de comercio y el staff
 *   de plataforma: exactamente quien puede leer su fila de `profiles` por RLS).
 *
 * Regla de datos del proyecto: ningún archivo se entrega con URL pública o firmada. Aquí se exige sesión
 * válida y que el archivo sea del comercio del usuario: la fila se lee con la SESIÓN del usuario, así que
 * RLS no la devuelve si es de otro comercio (o si un operador no tiene suscripción vigente). El servidor
 * transmite el archivo y responde `no-store`. A cualquier otro caso: siempre el mismo 404, que no revela
 * si el archivo existe ni de quién es. Cada apertura de un comprobante queda en la auditoría.
 * (Un tipo de archivo nuevo —logos— se agrega aquí, nunca con otra vía.)
 */
import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: NextRequest, { params }: RouteContext<"/api/files/[kind]/[id]">) {
  const { kind, id } = await params;
  if (!["product", "proof", "logo", "avatar"].includes(kind) || !UUID.test(id)) return notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return notFound();

  let bucket: string;
  let path: string | null;
  let tenantId: string | null = null;
  if (kind === "product") {
    const { data } = await supabase.from("products").select("image_path").eq("id", id).maybeSingle();
    bucket = "product-images";
    path = data?.image_path ?? null;
  } else if (kind === "avatar") {
    const { data } = await supabase.from("profiles").select("avatar_path").eq("id", id).maybeSingle();
    bucket = "avatars";
    path = data?.avatar_path ?? null;
  } else if (kind === "logo") {
    const { data } = await supabase.from("tenant_branding").select("logo_path").eq("tenant_id", id).maybeSingle();
    bucket = "branding";
    path = data?.logo_path ?? null;
  } else {
    const { data } = await supabase.from("payment_proofs").select("storage_path, tenant_id").eq("id", id).maybeSingle();
    bucket = "payment-proofs";
    path = data?.storage_path ?? null;
    tenantId = data?.tenant_id ?? null;
  }
  if (!path || path.startsWith("dry-run/")) return notFound();

  const { data: file, error } = await createAdminClient().storage.from(bucket).download(path);
  if (error || !file) return notFound();

  if (kind === "proof") await logAudit({ actorId: userId, action: "PROOF_VIEWED", resource: "payment_proofs", tenantId, details: { proof_id: id } });

  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Disposition": "inline",
    },
  });
}
