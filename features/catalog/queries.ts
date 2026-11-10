/**
 * Consultas del catálogo para el panel (con la sesión del usuario: RLS limita todo a su comercio).
 *
 * Paginación y filtros SIEMPRE en la base de datos: cada página pide solo sus filas (count + range);
 * si la página pedida no existe, se corrige a la última. Búsqueda con ilike (los comodines % y _ del
 * texto se escapan para que no cambien el patrón).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProductListParams } from "@/features/catalog/schemas";

export const PAGE_SIZE = 10;

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  price_visible: boolean;
  sku: string | null;
  is_available: boolean;
  category_id: string | null;
  image_path: string | null;
};

const PRODUCT_COLUMNS = "id, name, description, price, price_visible, sku, is_available, category_id, image_path";
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function listProducts(tenantId: string, params: ProductListParams) {
  const supabase = await createClient();
  const build = (page: number) => {
    let query = supabase.from("products").select(PRODUCT_COLUMNS, { count: "exact" }).eq("tenant_id", tenantId);
    if (params.q) query = query.ilike("name", `%${escapeLike(params.q)}%`);
    if (params.category === "none") query = query.is("category_id", null);
    else if (params.category) query = query.eq("category_id", params.category);
    return query.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  };

  let page = params.page;
  const first = await build(page);
  let data = first.data;
  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Si la página pedida no existe (p. ej. se borraron productos), se corrige a la última.
  if (page > pageCount) {
    page = pageCount;
    data = (await build(page)).data;
  }
  return { rows: (data ?? []) as ProductRow[], total, page, pageCount };
}

export async function listCategories(tenantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id, name").eq("tenant_id", tenantId).order("sort_order").order("name");
  return data ?? [];
}

/** Productos para elegir dentro de una publicación (solo id y nombre; máx. 300). */
export async function listProductOptions(tenantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, name").eq("tenant_id", tenantId).order("name").limit(300);
  return data ?? [];
}

export async function listPublications(tenantId: string) {
  const supabase = await createClient();
  const { data: publications } = await supabase
    .from("catalog_publications")
    .select("id, title, description, status, published_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  const ids = (publications ?? []).map((publication) => publication.id);
  const { data: items } = ids.length
    ? await supabase.from("catalog_publication_items").select("publication_id, product_id").in("publication_id", ids)
    : { data: [] };
  return (publications ?? []).map((publication) => ({
    ...publication,
    productIds: (items ?? []).filter((item) => item.publication_id === publication.id).map((item) => item.product_id),
  }));
}
