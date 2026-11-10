/**
 * Validaciones (Zod) de autenticación.
 *
 * Se usan en DOS lugares: en el formulario (React Hook Form, para mostrar errores al momento)
 * y en la Server Action (la validación que de verdad protege, porque el navegador se puede saltar).
 * Las reglas coinciden con los CHECK de la base de datos.
 * No hay teléfono: los usuarios de la app (dueño y operadores) se identifican solo por su email.
 */
import { z } from "zod";

// --- Piezas reutilizables -----------------------------------------------------

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254));

export const nameSchema = z
  .string()
  .trim()
  .min(1, "This field is required.")
  .max(80, "Use 80 characters or fewer."); // = CHECK de profiles.first_name / last_name

/** Nombre del comercio: 2–120 caracteres (= CHECK de tenants.name). */
export const businessNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your business name.")
  .max(120, "Use 120 characters or fewer.");

/**
 * Tipo de negocio: ajusta los mensajes sugeridos (enum business_type de la base).
 * Store = comercio (tienda, panadería, farmacia…), Company = empresa que vende productos, Restaurant, Other.
 */
export const BUSINESS_TYPES = [
  { value: "store", label: "Store" },
  { value: "company", label: "Company" },
  { value: "restaurant", label: "Restaurant" },
  { value: "other", label: "Other" },
] as const;
export const businessTypeSchema = z.enum(["store", "company", "restaurant", "other"], {
  error: "Select your business type.",
});

/** 12+ caracteres (bcrypt solo usa los primeros 72 bytes, por eso el máximo). */
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(72, "Use 72 characters or fewer.");

export const otpCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");

// --- Registro -----------------------------------------------------------------

/** Campos tal como los ve el formulario. */
export const registerFormSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    businessName: businessNameSchema,
    businessType: businessTypeSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((value) => value, "You must accept the terms to continue."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });

export type RegisterFormInput = z.input<typeof registerFormSchema>;
export type RegisterFormValues = z.output<typeof registerFormSchema>;

/** Lo que recibe la Server Action. */
export const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  businessName: businessNameSchema,
  businessType: businessTypeSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// --- Registro de un operador invitado (sin datos del comercio) ------------------

/** Enlace de invitación: 32 bytes en hexadecimal (lo genera invite_operator en la base). */
export const inviteTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const inviteRegisterFormSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((value) => value, "You must accept the terms to continue."),
  })
  .refine((data) => data.password === data.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match." });

export const inviteRegisterSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true),
  inviteToken: inviteTokenSchema,
});

// --- Login, OTP ---------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const otpSchema = z.object({ code: otpCodeSchema });
export type OtpInput = z.infer<typeof otpSchema>;

// --- Recuperar contraseña -----------------------------------------------------

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// --- Resultado común de las Server Actions ------------------------------------

/** Las acciones redirigen cuando todo sale bien; si no, devuelven un mensaje para mostrar. */
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
