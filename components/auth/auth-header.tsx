/**
 * Encabezados de las pantallas de autenticación (ref. login-example.png):
 *   - AuthTopBar: logo a la izquierda y enlace a la pantalla alterna a la derecha.
 *   - AuthHeading: etiqueta de paso ("01 / Create account"), título grande y subtítulo.
 */
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function AuthTopBar({ prompt, linkLabel, href }: { prompt?: string; linkLabel: string; href: string }) {
  return (
    <div className="flex max-w-md mx-auto w-full items-center justify-between gap-4">
      <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-black">
        <Logo />
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {prompt ? <span className="hidden text-fg-muted sm:inline">{prompt}</span> : null}
        <Link
          href={href}
          className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 font-medium text-fg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-black"
        >
          {linkLabel}
        </Link>
      </div>
    </div>
  );
}

export function AuthHeading({ step, title, description }: { step: string; title: string; description?: React.ReactNode }) {
  return (
    <header>
      <p className="text-xs font-medium text-fg-muted">{step}</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight text-fg sm:text-4xl">{title}</h1>
      {description ? <p className="mt-3 max-w-md text-sm leading-relaxed text-fg-muted">{description}</p> : null}
    </header>
  );
}
