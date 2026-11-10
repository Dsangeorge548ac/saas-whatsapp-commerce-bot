/**
 * Color de la marca del comercio en su tienda pública.
 * El dueño elige un color (#RRGGBB); este módulo decide si el texto encima va en blanco o negro para que
 * siempre se lea (contraste WCAG) y descarta cualquier valor que no sea un hexadecimal válido.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK = "#000000";

export function safeBrandColor(value: string | null | undefined): string {
  return value && HEX.test(value) ? value.toLowerCase() : FALLBACK;
}

/** "#ffffff" o "#000000": el que mejor contrasta con el fondo dado. */
export function readableTextColor(background: string): "#ffffff" | "#000000" {
  const hex = safeBrandColor(background).slice(1);
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
