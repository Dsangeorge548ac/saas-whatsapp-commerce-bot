import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad para TODAS las respuestas (regla de protección de datos, CLAUDE.md 8):
 *   - X-Frame-Options / frame-ancestors: nadie puede meter la app en un iframe (evita
 *     "clickjacking": engañar al usuario para que haga clic en botones ocultos).
 *   - nosniff: el navegador respeta el tipo de archivo declarado (un documento no se ejecuta como script).
 *   - Referrer-Policy: al salir a otro sitio no se envía la ruta completa (ni ids ni filtros).
 *   - Permissions-Policy: la app no usa cámara, micrófono ni ubicación; quedan bloqueados.
 *   - HSTS: obliga a HTTPS en producción (en http://localhost el navegador la ignora).
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  // object-src: sin plugins (Flash/PDF embebidos); base-uri: nadie cambia la base de las URLs
  // relativas; form-action: los formularios solo se envían a la propia app.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
