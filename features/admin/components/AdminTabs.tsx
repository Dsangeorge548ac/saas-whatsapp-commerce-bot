"use client";
/** Pestañas del área de plataforma (Users, Subscriptions). Solo navegación: cada página vuelve a exigir el rol. */
import { usePathname } from "next/navigation";
import { CreditCard, Users } from "lucide-react";
import { SectionTabs } from "@/components/layout/section-tabs";

const TABS = [
  { href: "/admin/users", label: "Users", icon: <Users /> },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: <CreditCard /> },
];

export function AdminTabs() {
  const pathname = usePathname();
  return <SectionTabs label="Platform sections" tabs={TABS.map((tab) => ({ ...tab, active: pathname === tab.href || pathname.startsWith(`${tab.href}/`) }))} />;
}
