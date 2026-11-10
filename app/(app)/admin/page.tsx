/** /admin — redirige a la lista de usuarios (el layout ya exige rol de plataforma). */
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/users");
}
