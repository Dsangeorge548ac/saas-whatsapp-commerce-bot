/**
 * Panel visual derecho de las pantallas de autenticación (ref. login-example.png).
 * Misma composición que Tax Pro (fondo negro, cuadrícula de puntos lima, brillos) con una
 * conversación de pedido de WhatsApp como ilustración. Es decorativo: aria-hidden.
 */
export function AuthVisual() {
  return (
    <div
      aria-hidden
      className="relative hidden h-full min-h-[460px] overflow-hidden rounded-xl bg-black lg:block"
      style={{
        backgroundImage: "radial-gradient(rgb(212 242 105 / 0.22) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="absolute -right-24 -top-24 size-96 rounded-full bg-accent opacity-25 blur-3xl" />
      <div className="absolute -bottom-32 -left-16 size-80 rounded-full bg-accent opacity-10 blur-3xl" />

      {/* Conversación de ejemplo */}
      <div className="absolute left-1/2 top-[38%] w-80 -translate-x-1/2 -translate-y-1/2 -rotate-3 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-fg-muted">Order #1042</span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">PAID</span>
        </div>
        <div className="mt-4 space-y-2 text-xs">
          <p className="w-fit max-w-[85%] rounded-lg bg-canvas px-3 py-2 text-fg">Hi! I&apos;d like 2 sourdough loaves 🥖</p>
          <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-accent px-3 py-2 text-accent-foreground">Great! Total: $8.00. Send your payment proof when ready.</p>
          <p className="w-fit max-w-[85%] rounded-lg bg-canvas px-3 py-2 text-fg">Done ✅</p>
        </div>
        <div className="mt-5 space-y-2 border-t border-border pt-4 text-xs">
          <div className="flex justify-between"><span className="text-fg-muted">Status</span><span className="font-medium text-fg">On the way</span></div>
          <div className="flex justify-between"><span className="text-fg-muted">Delivery</span><span className="font-medium text-fg">Today, 5:30 PM</span></div>
        </div>
      </div>

      <div className="absolute inset-x-8 bottom-8">
        <p className="max-w-sm text-2xl font-medium leading-tight tracking-tight text-white">
          Take orders and payments on WhatsApp — all in one workspace.
        </p>
        <p className="mt-2 text-sm text-sidebar-muted">Built for bakeries, restaurants and stores.</p>
      </div>
    </div>
  );
}
