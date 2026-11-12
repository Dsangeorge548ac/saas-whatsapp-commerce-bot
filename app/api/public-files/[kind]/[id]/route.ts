/**
 * GET /api/public-files/product/<id>  — foto de un producto de una publicación PUBLICADA.
 * GET /api/public-files/cover/<id>    — portada de una publicación publicada.
 * GET /api/public-files/logo/<slug>   — logo del comercio para la cabecera de su tienda.
 *
 * Única excepción a "archivos siempre privados" (fotos de la tienda pública): solo responde si la base confirma que
 * el producto está DISPONIBLE (o la portada es de una publicación publicada, o el logo es del comercio) en un
 * comercio activo con suscripción vigente; en cualquier otro
 * caso devuelve siempre el mismo 404 (no revela si el archivo existe). El bucket sigue privado: el archivo
 * se transmite desde el servidor. Las fotos no contienen datos personales, por eso se pueden cachear.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(_request: NextRequest, { params }: RouteContext<"/api/public-files/[kind]/[id]">) {
  const { kind, id } = await params;
  if (kind === "logo" ? !SLUG.test(id) || id.length > 60 : (kind !== "product" && kind !== "cover") || !UUID.test(id)) return notFound();

  const admin = createAdminClient();
  const { data: path } =
    kind === "product"
      ? await admin.rpc("get_public_product_image", { p_product: id })
      : kind === "cover"
        ? await admin.rpc("get_public_cover_image", { p_publication: id })
        : await admin.rpc("get_public_logo", { p_slug: id });
  if (!path) return notFound();

  const { data: file, error } = await admin.storage.from(kind === "logo" ? "branding" : "product-images").download(path);
  if (error || !file) return notFound();

  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      // La CDN guarda la foto 1 h y la sigue sirviendo 10 min más mientras la renueva: con miles de visitas,
      // casi ninguna llega a este servidor ni a la base.
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=600",
      "Content-Disposition": "inline",
    },
  });
}
