/**
 * Lectura de la tienda pública (sin sesión) con las funciones SECURITY DEFINER de la base.
 *
 * Esas funciones solo devuelven campos seguros (nombre, precio, descripción, WhatsApp del comercio) y
 * solo de publicaciones publicadas de comercios activos y con suscripción vigente. Aquí se vuelve a
 * validar la forma con Zod: lo que llega de la base se trata como dato no confiable al pintarlo.
 */
import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/anon";

const businessSchema = z.object({
  name: z.string(),
  accent_color: z.string().nullable().optional(),
  currency: z.string().optional(),
  whatsapp: z.string().nullable().optional(),
});

const storefrontSchema = z.object({
  available: z.boolean(),
  business: businessSchema.nullable().optional(),
  publications: z
    .array(z.object({ id: z.string(), title: z.string(), description: z.string().nullable(), has_cover: z.boolean(), item_count: z.number() }))
    .optional(),
});

const publicationSchema = z.object({
  available: z.boolean(),
  business: businessSchema.nullable().optional(),
  publication: z.object({ id: z.string(), title: z.string(), description: z.string().nullable() }).optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        price: z.number().nullable(),
        price_visible: z.boolean(),
        has_image: z.boolean(),
      }),
    )
    .optional(),
});

export type Storefront = z.infer<typeof storefrontSchema>;
export type PublicationPage = z.infer<typeof publicationSchema>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getStorefront(slug: string): Promise<Storefront | null> {
  await connection();
  if (!SLUG.test(slug)) return null;
  const { data } = await createAnonClient().rpc("get_public_storefront", { p_slug: slug });
  const parsed = storefrontSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function getPublicationPage(slug: string, publicationId: string): Promise<PublicationPage | null> {
  await connection();
  if (!SLUG.test(slug) || !UUID.test(publicationId)) return null;
  const { data } = await createAnonClient().rpc("get_public_publication", { p_slug: slug, p_publication: publicationId });
  const parsed = publicationSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
