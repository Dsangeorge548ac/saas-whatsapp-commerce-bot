/**
 * Foto de perfil: reglas de la ruta y URL para mostrarla (funciones puras; se prueban sin red).
 *
 * La foto vive en el bucket PRIVADO `avatars` en `{userId}/avatar-{uuid}.{webp|jpg|png}` (la base lo exige con un
 * CHECK). Se muestra con `/api/files/avatar/{userId}?v=…`, que autoriza con la sesión; `v` cambia con cada foto
 * nueva para que el navegador no muestre la anterior.
 */
const AVATAR_PATH = /^([0-9a-f-]{36})\/avatar-([0-9a-f-]{36})\.(webp|jpg|png)$/;

/** true si la ruta es una foto válida DENTRO de la carpeta del usuario indicado. */
export function isOwnAvatarPath(path: string, userId: string): boolean {
  const match = AVATAR_PATH.exec(path);
  return Boolean(match && match[1] === userId);
}

/** URL para mostrar la foto (o null si no tiene). */
export function avatarUrl(userId: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const match = AVATAR_PATH.exec(path);
  return match ? `/api/files/avatar/${userId}?v=${match[2]!.slice(0, 8)}` : null;
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES: Record<string, "webp" | "jpg" | "png"> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
