/**
 * GET /api/public-files/product/<id>  — foto de un producto de una publicación PUBLICADA.
 * GET /api/public-files/cover/<id>    — portada de una publicación publicada.
 *
 * Única excepción a "archivos siempre privados": solo responde si la base confirma que el producto (o la
 * portada) pertenece a una publicación publicada de un comercio con suscripción vigente; en cualquier otro
 * caso devuelve siempre el mismo 404 (no revela si el archivo existe). El bucket sigue privado: el archivo
 * se transmite desde el servidor. Las fotos no contienen datos personales, por eso se pueden cachear.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(_request: NextRequest, { params }: RouteContext<"/api/public-files/[kind]/[id]">) {
  const { kind, id } = await params;
  if ((kind !== "product" && kind !== "cover") || !UUID.test(id)) return notFound();

  const admin = createAdminClient();
  const { data: path } =
    kind === "product"
      ? await admin.rpc("get_public_product_image", { p_product: id })
      : await admin.rpc("get_public_cover_image", { p_publication: id });
  if (!path) return notFound();

  const { data: file, error } = await admin.storage.from("product-images").download(path);
  if (error || !file) return notFound();

  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Disposition": "inline",
    },
  });
}
