"use client";
/**
 * Tarjetas de productos de una publicación y carrito del cliente (tienda pública).
 *
 * El cliente elige cantidades y pulsa "Send my order": la Server Action submitWebOrder lo registra en la
 * conversación de WhatsApp (el cliente llega con un enlace personal; sin enlace la página es solo de
 * consulta y ofrece abrir el chat). Los totales de aquí son solo informativos: la base vuelve a calcular
 * los precios con el catálogo vigente. Productos sin precio visible se cotizan con un asesor.
 */
import { useMemo, useState, useTransition } from "react";
import { Check, ImageOff, Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { formatMoney } from "@/lib/whatsapp/format";
import { readableTextColor } from "@/lib/storefront/color";
import { submitWebOrder } from "@/features/storefront/actions";

export type StoreItem = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceVisible: boolean;
  hasImage: boolean;
};

type Props = {
  items: StoreItem[];
  currency: string;
  token: string | null;
  whatsapp: string | null;
  accent: string;
  businessName: string;
};

export function StoreCards({ items, currency, token, whatsapp, accent, businessName }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ notified: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const onAccent = readableTextColor(accent);

  const chosen = useMemo(() => items.filter((item) => (quantities[item.id] ?? 0) > 0), [items, quantities]);
  const count = chosen.reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);
  const total = chosen.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * (item.price ?? 0), 0);
  const chatUrl = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola ${businessName}, vi su catálogo`)}` : null;

  const change = (id: string, delta: number) =>
    setQuantities((current) => ({ ...current, [id]: Math.min(999, Math.max(0, (current[id] ?? 0) + delta)) }));

  function onSubmit() {
    if (!token || chosen.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await submitWebOrder({ token, items: chosen.map((item) => ({ productId: item.id, quantity: quantities[item.id] ?? 0 })) });
      if (result.ok) setSent({ notified: result.notified });
      else setError(result.error);
    });
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <span className="grid size-14 place-items-center rounded-full" style={{ backgroundColor: accent, color: onAccent }}>
          <Check className="size-7" aria-hidden />
        </span>
        <h2 className="mt-6 text-2xl font-medium tracking-tight text-fg">Order sent!</h2>
        <p className="mt-2 text-sm text-fg-muted">
          {sent.notified
            ? "Go back to WhatsApp: we sent you a summary there. Confirm it to continue with delivery and payment."
            : "Go back to WhatsApp and write “hi” to continue with your order."}
        </p>
        {chatUrl ? (
          <a href={chatUrl} className="mt-6 inline-flex h-12 items-center rounded-lg px-6 text-sm font-medium" style={{ backgroundColor: accent, color: onAccent }}>
            Open WhatsApp
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pb-32">
      {!token ? (
        <p className="mb-6 rounded-lg border border-border bg-canvas px-4 py-3 text-sm text-fg-muted">
          To order, message us on WhatsApp and we&apos;ll send you a personal link to choose your products.
        </p>
      ) : null}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const quantity = quantities[item.id] ?? 0;
          const canOrder = Boolean(token) && item.priceVisible;
          return (
            <li key={item.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
              <div className="grid aspect-[16/10] place-items-center bg-canvas">
                {item.hasImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/public-files/product/${item.id}`} alt={item.name} loading="lazy" className="size-full object-cover" />
                ) : (
                  <ImageOff className="size-8 text-chart-muted-strong" aria-hidden />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className="text-sm font-semibold text-fg">{item.name}</h3>
                {item.description ? <p className="line-clamp-3 text-xs text-fg-muted">{item.description}</p> : null}
                <p className="mt-1 text-sm font-medium text-fg">{item.priceVisible && item.price !== null ? formatMoney(item.price, currency) : "Ask for a quote"}</p>
                {canOrder ? (
                  <div className="mt-3">
                    {quantity === 0 ? (
                      <button
                        type="button"
                        onClick={() => change(item.id, 1)}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-fg transition-colors hover:bg-muted"
                      >
                        <Plus className="size-4" aria-hidden /> Add
                      </button>
                    ) : (
                      <div className="flex h-10 items-center justify-between rounded-lg border border-black px-1">
                        <button type="button" onClick={() => change(item.id, -1)} aria-label={`Remove one ${item.name}`} className="grid size-8 place-items-center rounded-lg hover:bg-muted">
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <span className="text-sm font-semibold" aria-live="polite">{quantity}</span>
                        <button type="button" onClick={() => change(item.id, 1)} aria-label={`Add one ${item.name}`} className="grid size-8 place-items-center rounded-lg hover:bg-muted">
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {token ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(0_0_0/0.06)]">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p className="flex items-center gap-2 font-medium text-fg">
                <ShoppingBag className="size-4" aria-hidden />
                {count === 0 ? "Your order is empty" : `${count} ${count === 1 ? "item" : "items"} · ${formatMoney(total, currency)}`}
              </p>
              {error ? <p role="alert" className="mt-1 text-xs text-danger-strong">{error}</p> : null}
            </div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={count === 0 || isPending}
              aria-busy={isPending}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 text-sm font-medium disabled:opacity-50 sm:h-11"
              style={{ backgroundColor: accent, color: onAccent }}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {/* En su propio <span>: si el navegador traduce la página, React no choca con el texto traducido. */}
              <span>Send my order</span>
            </button>
          </div>
        </div>
      ) : chatUrl ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <a href={chatUrl} className="mx-auto flex h-12 max-w-5xl items-center justify-center rounded-lg text-sm font-medium" style={{ backgroundColor: accent, color: onAccent }}>
            Order on WhatsApp
          </a>
        </div>
      ) : null}
    </div>
  );
}
