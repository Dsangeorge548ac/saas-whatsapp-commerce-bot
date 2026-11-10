/**
 * Botón de Tax Pro (base shadcn/ui, adaptado a la paleta del proyecto).
 *
 * Variantes:
 *   default      → negro con texto blanco: acción principal de cada pantalla (solo una por vista).
 *   accent       → lima con texto negro: acción destacada/positiva (activar, continuar el setup).
 *   outline      → blanco con borde gris: acción secundaria.
 *   secondary    → gris claro: acciones terciarias o dentro de tarjetas.
 *   ghost        → sin fondo: acciones discretas, iconos.
 *   destructive  → rojo oscuro con texto blanco: borrar, inhabilitar (siempre con confirmación).
 *   danger-ghost → texto rojo sin fondo: acción peligrosa secundaria ("Cancel request").
 *   link         → texto subrayado.
 * Nunca usar el lima como color de texto (contraste insuficiente).
 */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none " +
  "focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
  "active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 " +
  "aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#000c] text-white hover:bg-black/80",
        accent: "bg-accent text-accent-fg hover:bg-accent-hover",
        outline: "border-border bg-surface text-fg hover:bg-muted aria-expanded:bg-muted",
        secondary: "bg-muted text-fg hover:bg-chart-muted aria-expanded:bg-chart-muted",
        ghost: "text-fg hover:bg-muted aria-expanded:bg-muted",
        destructive: "bg-danger-strong text-white hover:bg-danger-strong/90 focus-visible:ring-danger-strong",
        "danger-ghost": "text-danger-strong hover:bg-danger/10",
        link: "text-fg underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        xs: "h-7 rounded-lg px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 px-3",
        lg: "h-12 px-6 sm:h-11",
        icon: "size-10",
        "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  // Cada texto suelto va en su propio <span>: si el navegador traduce la página (p. ej. Google Translate),
  // reemplaza los nodos de texto y React fallaba al insertar o quitar el ícono de carga junto a ellos
  // ("Failed to execute 'insertBefore' on 'Node'"). Con el <span> React nunca toca esos nodos directamente.
  const children = asChild ? props.children : React.Children.map(props.children, (child) => (typeof child === "string" || typeof child === "number" ? <span>{child}</span> : child))

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </Comp>
  )
}

export { Button, buttonVariants }
