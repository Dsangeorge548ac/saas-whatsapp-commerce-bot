/**
 * Layout de autenticación: tarjeta blanca dividida 50/50 (ref. login-example.png).
 *   - Izquierda: el contenido de cada pantalla (login, registro, verificación…).
 *   - Derecha: panel visual (solo en pantallas ≥ lg).
 * En móvil la tarjeta ocupa toda la pantalla y el panel visual se oculta.
 * No lee cookies: así se prerenderiza como contenido estático y carga al instante.
 */
import { AuthVisual } from "@/components/auth/auth-visual";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 bg-canvas sm:p-4 lg:p-6">
      <div className="grid w-full flex-1 mx-auto max-w-7xl overflow-hidden bg-surface sm:rounded-lg sm:border sm:border-border lg:grid-cols-2">
        <div className="flex min-h-dvh flex-col px-2 py-6 sm:min-h-0 sm:px-10 sm:py-8 lg:px-16">{children}</div>
        <div className="hidden p-3 lg:block">
          <AuthVisual />
        </div>
      </div>
    </div>
  );
}
