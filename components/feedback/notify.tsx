"use client";
/**
 * Avisos del resultado de una acción (guardado, enviado, error) SIN toasts.
 *
 * Funciona así:
 *   - Cualquier componente cliente llama a `notify.success("Saved")`, `notify.error("…")`,
 *     `notify.info(...)` o `notify.warning(...)`.
 *   - <NotificationBanner /> (montado una sola vez en el layout privado) muestra el aviso
 *     como una <Alert> en línea, pegada arriba del contenido, con botón para cerrar.
 *   - Solo hay un aviso a la vez: el más reciente reemplaza al anterior.
 *   - Se cierra solo a los 8 s (los de error se quedan hasta que el usuario los cierre) y
 *     al cambiar de página.
 * Seguridad: los mensajes vienen de las Server Actions, que nunca incluyen datos sensibles
 * (PTIN, documentos, teléfono) en sus errores.
 */
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Alert, type AlertTone } from "@/components/feedback/alert";

type Notice = { id: number; tone: AlertTone; title: string; description?: string };

// Estado global mínimo (fuera de React) para poder llamar a `notify` desde cualquier parte.
let current: Notice | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function setNotice(notice: Notice | null) {
  current = notice;
  listeners.forEach((listener) => listener());
}

function show(tone: AlertTone, title: string, description?: string) {
  setNotice({ id: nextId++, tone, title, description });
}

export const notify = {
  success: (title: string, description?: string) => show("success", title, description),
  info: (title: string, description?: string) => show("info", title, description),
  warning: (title: string, description?: string) => show("warning", title, description),
  error: (title: string, description?: string) => show("danger", title, description),
  dismiss: () => setNotice(null),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const AUTO_CLOSE_MS = 8000;

/** Aviso en línea, pegado arriba del área de contenido mientras se hace scroll. */
export function NotificationBanner() {
  const notice = useSyncExternalStore(subscribe, () => current, () => null);
  const pathname = usePathname();

  // Al cambiar de página se limpia el aviso anterior.
  useEffect(() => {
    notify.dismiss();
  }, [pathname]);

  // Los avisos que no son de error se cierran solos; el de error espera al usuario.
  useEffect(() => {
    if (!notice || notice.tone === "danger") return;
    const timer = window.setTimeout(() => {
      if (current?.id === notice.id) notify.dismiss();
    }, AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;

  return (
    <div className="sticky top-0 z-30 -mx-1 mb-4 px-1 pt-1">
      {/* Fondo blanco debajo para que el aviso sea opaco sobre la cuadrícula de puntos. */}
      <div className="rounded-2xl bg-surface shadow-sm">
        <Alert key={notice.id} tone={notice.tone} title={notice.title} onDismiss={notify.dismiss}>
          {notice.description}
        </Alert>
      </div>
    </div>
  );
}
