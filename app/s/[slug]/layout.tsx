/**
 * Layout de la tienda pública de un comercio (<slug>.<dominio>, reescrito por proxy.ts a /s/<slug>).
 * Sin sesión y sin datos personales. Estructura mínima: cada página pinta su propia cabecera con la marca
 * del comercio.
 */
export default function StoreLayout({ children }: LayoutProps<"/s/[slug]">) {
  return <div className="min-h-dvh bg-canvas">{children}</div>;
}
