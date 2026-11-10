"use client";
/**
 * Pestañas de Ajustes con icono. Las que tienen un paso pendiente de la guía de configuración (WhatsApp, pagos,
 * mensajes, plan, salir en vivo) muestran un punto "needs attention"; el layout lo calcula en el servidor.
 * Solo navegación: cada pantalla y cada acción vuelven a comprobar en el servidor que sea el dueño.
 */
import { usePathname } from "next/navigation";
import { Clock, CreditCard, ListTree, MessageSquareText, Rocket, Smartphone, Store, Users, Wallet } from "lucide-react";
import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  { href: "/settings/business", label: "Business", icon: <Store /> },
  { href: "/settings/hours", label: "Hours", icon: <Clock /> },
  { href: "/settings/payments", label: "Payments", icon: <Wallet /> },
  { href: "/settings/messages", label: "Messages", icon: <MessageSquareText /> },
  { href: "/settings/menu", label: "Menu", icon: <ListTree /> },
  { href: "/settings/whatsapp", label: "WhatsApp", icon: <Smartphone /> },
  { href: "/settings/team", label: "Team", icon: <Users /> },
  { href: "/settings/billing", label: "Billing", icon: <CreditCard /> },
  { href: "/settings/go-live", label: "Go live", icon: <Rocket /> },
];

export function SettingsTabs({ attention = [] }: { attention?: string[] }) {
  const pathname = usePathname();
  return (
    <SectionTabs
      label="Settings sections"
      tabs={TABS.map((tab) => ({
        ...tab,
        active: pathname === tab.href || pathname.startsWith(`${tab.href}/`),
        attention: attention.includes(tab.href),
      }))}
    />
  );
}
