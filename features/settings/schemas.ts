/**
 * Validaciones (Zod) de Ajustes: negocio, horario, métodos de pago y mensajes del bot.
 * Se usan en los formularios (errores al momento) y en las Server Actions (la validación que protege).
 * Los límites coinciden con los CHECK de la base de datos.
 */
import { z } from "zod";
import { businessNameSchema, businessTypeSchema } from "@/features/auth/schemas";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
export const NOT_FOUND: ActionResult = { ok: false, error: "Not found." };

/** ¿Es un nombre de zona horaria IANA que el sistema conoce? (p. ej. America/Caracas) */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

export const CURRENCIES = ["USD", "EUR", "VES", "COP", "MXN", "ARS", "CLP", "PEN", "BRL"] as const;
const priceText = z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 2.50.");

// ───────── Negocio y marca ─────────

const hexColor = z
  .string()
  .trim()
  .refine((value) => value === "" || /^#[0-9a-fA-F]{6}$/.test(value), "Use a color like #D4F269.")
  .transform((value) => (value === "" ? null : value.toLowerCase()));

export const businessFormSchema = z
  .object({
    name: businessNameSchema,
    businessType: businessTypeSchema,
    currency: z.enum(CURRENCIES, { error: "Select a currency." }),
    timezone: z.string().trim().refine(isValidTimeZone, "Choose a valid time zone, e.g. America/Caracas."),
    acceptsDelivery: z.boolean(),
    acceptsPickup: z.boolean(),
    deliveryFee: priceText,
    requireDeliveryLocation: z.boolean(),
    accentColor: hexColor,
  })
  .refine((value) => value.acceptsDelivery || value.acceptsPickup, { path: ["acceptsDelivery"], message: "Offer delivery, pickup or both." });
export type BusinessFormInput = z.input<typeof businessFormSchema>;
export type BusinessFormValues = z.output<typeof businessFormSchema>;

/** Lo que recibe la Server Action (el logo ya subido a Storage, o null para dejar el actual). */
export const businessSchema = z.object({
  name: businessNameSchema,
  businessType: businessTypeSchema,
  currency: z.enum(CURRENCIES),
  timezone: z.string().trim().refine(isValidTimeZone),
  acceptsDelivery: z.boolean(),
  acceptsPickup: z.boolean(),
  deliveryFee: z.number().min(0).max(999_999_999.99),
  requireDeliveryLocation: z.boolean(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/).nullable(),
  logoPath: z.string().regex(/^[0-9a-f-]{36}\/logo\/[0-9a-f-]{36}\.(jpg|png|webp)$/).nullable(),
});

// ───────── Horario ─────────

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");
const day = z
  .object({ weekday: z.number().int().min(1).max(7), isOpen: z.boolean(), opensAt: time.nullable(), closesAt: time.nullable() })
  .refine((value) => !value.isOpen || (value.opensAt !== null && value.closesAt !== null && value.opensAt !== value.closesAt), {
    message: "Opening and closing times must be different.",
  });

export const hoursSchema = z.object({
  enabled: z.boolean(),
  days: z
    .array(day)
    .length(7)
    .refine((days) => new Set(days.map((d) => d.weekday)).size === 7, "Each weekday once."),
});
export type HoursInput = z.infer<typeof hoursSchema>;

// ───────── Métodos de pago ─────────

export const PAYMENT_TYPES = [
  { value: "pago_movil", label: "Pago Móvil", fields: [["bank_name", "Bank"], ["phone", "Phone"], ["id_number", "ID number"]] },
  { value: "bank_transfer", label: "Bank transfer", fields: [["bank_name", "Bank"], ["account_holder", "Account holder"], ["account_number", "Account number"], ["id_number", "ID number"]] },
  { value: "zelle", label: "Zelle", fields: [["email", "Zelle email or phone"], ["account_holder", "Account holder"]] },
  { value: "usdt", label: "USDT", fields: [["network", "Network (e.g. TRC20)"], ["wallet_address", "Wallet address"]] },
  { value: "cash", label: "Cash", fields: [["instructions", "Instructions"]] },
  { value: "other", label: "Other", fields: [["instructions", "Instructions"]] },
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number]["value"];
const paymentTypeValues = PAYMENT_TYPES.map((type) => type.value) as [PaymentType, ...PaymentType[]];
const ALLOWED_FIELDS = new Set<string>(PAYMENT_TYPES.flatMap((type) => type.fields.map(([key]) => key as string)));

/** Datos de cobro: solo claves conocidas, solo texto, cada valor hasta 200 caracteres. */
const detailsSchema = z.record(z.string(), z.string().trim().max(200, "Use 200 characters or fewer.")).refine((value) => Object.keys(value).every((key) => ALLOWED_FIELDS.has(key)), "Unknown field.");

export const paymentMethodSchema = z.object({
  type: z.enum(paymentTypeValues),
  label: z.string().trim().min(2, "Enter a name.").max(80, "Use 80 characters or fewer."),
  currency: z.enum(CURRENCIES),
  details: detailsSchema,
  isActive: z.boolean(),
});
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

// ───────── Mensajes del bot ─────────

export const messageKeySchema = z.string().regex(/^[a-z_]+$/).max(40);
export const messageBodySchema = z.string().trim().min(1, "Write the message.").max(1000, "Use 1000 characters or fewer.");
