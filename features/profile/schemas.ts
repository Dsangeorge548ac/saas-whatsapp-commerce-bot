/**
 * Validaciones (Zod) del perfil: nombre, cambio de contraseña y cambio de correo.
 * Se usan en los formularios (errores al momento) y en las Server Actions (la validación que protege).
 * Los límites del nombre coinciden con los CHECK de profiles; la contraseña, con la de registro (12+).
 */
import { z } from "zod";
import { emailSchema, nameSchema, otpCodeSchema, passwordSchema } from "@/features/auth/schemas";

export const profileNameSchema = z.object({ firstName: nameSchema, lastName: nameSchema });
export type ProfileNameInput = z.infer<typeof profileNameSchema>;

/** Campos del formulario de contraseña (incluye la confirmación, que solo se valida en el navegador). */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(72),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "The passwords don't match." })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password." });
export type ChangePasswordFormInput = z.infer<typeof changePasswordFormSchema>;

/** Lo que recibe la Server Action (sin la confirmación). */
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(72), newPassword: passwordSchema });

export const changeEmailSchema = z.object({ newEmail: emailSchema, currentPassword: z.string().min(1, "Enter your current password.").max(72) });
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export const confirmEmailSchema = z.object({ newEmail: emailSchema, code: otpCodeSchema });

export const ROLE_LABEL = { developer: "Developer", platform_admin: "Platform admin", owner: "Owner", operator: "Operator" } as const;
