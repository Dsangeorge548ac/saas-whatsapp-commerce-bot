"use client";
/**
 * Panel lateral del detalle de un pedido. Su contenido lo renderiza el servidor (children) y cerrarlo
 * vuelve a la URL sin ?order=, así el detalle se puede compartir con el equipo y sobrevive a un refresco.
 */
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function OrderSheet({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => (open ? null : router.push(closeHref, { scroll: false }))}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Order details, payment proof, status history and actions.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
