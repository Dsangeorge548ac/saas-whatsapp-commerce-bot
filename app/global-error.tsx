"use client";
/**
 * Último límite de error (si falla incluso el layout raíz). Reemplaza todo el documento, por eso trae su propio
 * <html> y <body> con estilos mínimos en línea.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div role="alert" style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#555" }}>We couldn&apos;t load the app. Try again in a moment.</p>
          {error.digest ? <p style={{ fontSize: 11, color: "#777", fontFamily: "monospace" }}>Reference: {error.digest}</p> : null}
          <button type="button" onClick={reset} style={{ marginTop: 12, height: 40, padding: "0 16px", borderRadius: 8, background: "#000", color: "#fff", border: 0, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
