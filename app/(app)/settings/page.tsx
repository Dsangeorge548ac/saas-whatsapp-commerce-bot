/**
 * /settings — Lleva a la primera pestaña de Ajustes.
 */
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/business");
}
