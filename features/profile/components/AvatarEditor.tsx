"use client";
/**
 * Foto de perfil: elegir, recortar al centro y reducir a 384×384 en WebP en el navegador (pesa poco y quita los
 * metadatos de la cámara, como la ubicación), subirla a la carpeta PRIVADA del usuario y guardarla con la Server
 * Action. También permite quitarla. Toda operación se confirma antes de enviarse.
 * Seguridad: Storage solo deja subir a avatars/{uid}/; la acción y la base vuelven a comprobar la ruta.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { notify } from "@/components/feedback/notify";
import { confirmAction } from "@/components/feedback/sweet-confirm";
import { UserAvatar } from "@/components/layout/user-avatar";
import { Button } from "@/components/ui/button";
import { setMyAvatar } from "@/features/profile/actions";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/lib/files/avatar";
import { createClient } from "@/lib/supabase/client";

const SIZE = 384;

/** Recorta al centro y reduce la imagen a un cuadrado WebP (sin metadatos EXIF). */
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("NO_CANVAS");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("NO_BLOB");
  return blob;
}

type Props = { userId: string; firstName: string; lastName: string; imageUrl: string | null };

export function AvatarEditor({ userId, firstName, lastName, imageUrl }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!(file.type in AVATAR_TYPES)) return notify.error("Use a JPG, PNG or WEBP image.");
    if (file.size > AVATAR_MAX_BYTES * 5) return notify.error("The photo must be 10 MB or smaller.");

    const answer = await confirmAction({ title: "Use this photo?", text: "It will be shown on your profile and to your team.", confirmLabel: "Use photo" });
    if (!answer.confirmed) return;

    start(async () => {
      try {
        const blob = await toSquareWebp(file);
        if (blob.size > AVATAR_MAX_BYTES) return notify.error("The photo is too large. Try another one.");
        setPreview(URL.createObjectURL(blob));
        const path = `${userId}/avatar-${crypto.randomUUID()}.webp`;
        const { error } = await createClient().storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: false });
        if (error) throw new Error("UPLOAD");
        const result = await setMyAvatar(path);
        if (!result.ok) throw new Error(result.error);
        notify.success(result.message ?? "Photo updated.");
        router.refresh();
      } catch {
        setPreview(null);
        notify.error("We couldn't upload your photo. Try another image.");
      }
    });
  }

  async function remove() {
    const answer = await confirmAction({ title: "Remove your photo?", text: "Your initials will be shown instead.", confirmLabel: "Remove photo", tone: "danger" });
    if (!answer.confirmed) return;
    start(async () => {
      const result = await setMyAvatar(null);
      if (!result.ok) return notify.error(result.error);
      setPreview(null);
      notify.success(result.message ?? "Photo removed.");
      router.refresh();
    });
  }

  const shown = preview ?? imageUrl;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-4">
        <UserAvatar firstName={firstName} lastName={lastName} size="lg" imageUrl={shown} />
        <div>
          <p className="text-sm font-medium text-fg">Profile photo</p>
          <p className="text-sm text-fg-muted">JPG, PNG or WEBP. We crop it to a square.</p>
        </div>
      </div>
      <div className="flex gap-2">
        {shown ? <Button variant="outline" size="sm" onClick={remove} disabled={pending}>Remove photo</Button> : null}
        <Button size="sm" onClick={() => input.current?.click()} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
          {shown ? "Change photo" : "Add photo"}
        </Button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Choose a profile photo" onChange={onFile} />
      </div>
    </div>
  );
}
