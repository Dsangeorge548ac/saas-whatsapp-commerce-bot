"use client";
/**
 * Contenedor con scroll de los mensajes: al abrir la conversación o llegar un mensaje nuevo se baja hasta
 * el final (salvo que la persona esté leyendo mensajes anteriores). Solo comportamiento de pantalla.
 */
import { useEffect, useRef } from "react";

export function ThreadScroller({ children, anchor }: { children: React.ReactNode; anchor: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 160;
    if (nearBottom || element.scrollTop === 0) element.scrollTop = element.scrollHeight;
  }, [anchor]);
  return (
    <div ref={box} className="max-h-[58dvh] min-h-64 overflow-y-auto rounded-lg border border-border bg-canvas p-3 sm:p-4" aria-live="polite">
      {children}
    </div>
  );
}
