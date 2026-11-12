/**
 * GET /c/<publicationId>  →  redirección a /s/<slug>/c/<publicationId>.
 *
 * Permite que los enlaces compartidos o visitados en local (sin resolución de subdominio) encuentren el comercio
 * dueño de una publicación PUBLICADA y muestren sus productos. Es un Route Handler (no una página) porque solo
 * redirige: así no hay nada que prerenderizar.
 * Seguridad: id validado como UUID; solo publicaciones publicadas; para cualquier otro caso el mismo 404 (no
 * revela si existe). Solo lee el slug con la service role. El token `t` se reenvía codificado.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(request: NextRequest, { params }: RouteContext<"/c/[publicationId]">) {
  const { publicationId } = await params;
  if (!UUID.test(publicationId)) return notFound();

  const admin = createAdminClient();
  const { data } = await admin
    .from("catalog_publications")
    .select("tenants!inner(slug)")
    .eq("id", publicationId)
    .eq("status", "published")
    .maybeSingle();
  const slug = (data?.tenants as { slug: string } | null)?.slug ?? null;
  if (!slug) return notFound();

  const url = new URL(`/s/${encodeURIComponent(slug)}/c/${publicationId}`, request.nextUrl.origin);
  const token = request.nextUrl.searchParams.get("t");
  if (token && token.length <= 200) url.searchParams.set("t", token);
  return NextResponse.redirect(url, 307);
}
