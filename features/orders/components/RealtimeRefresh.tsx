"use client";
/**
 * Mantiene el tablero al día en tiempo real: cuando cambia un pedido o llega un comprobante del comercio,
 * pide a Next que vuelva a leer los datos del servidor (router.refresh) con un pequeño retardo para
 * agrupar ráfagas de cambios.
 * Seguridad: Realtime aplica RLS, así que este navegador solo recibe eventos de su propio comercio; el
 * filtro por tenant_id solo reduce tráfico. Los datos siempre se vuelven a leer en el servidor.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RealtimeRefresh({ tenantId, tables = ["orders", "payment_proofs"], channelName = "orders" }: { tenantId: string; tables?: string[]; channelName?: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 600);
    };
    const filter = `tenant_id=eq.${tenantId}`;
    let channel = supabase.channel(`${channelName}-${tenantId}`);
    for (const table of tables) channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, refresh);
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- las tablas y el canal no cambian durante la vida del componente
  }, [tenantId, router]);

  return null;
}
