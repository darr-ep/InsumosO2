import { z } from "zod";

/**
 * New gap-fill feature: Self-Service Profile Screen (business owner request,
 * post-Phase-5, not sourced from any SDD.md §35 phase task or §20's
 * validation table). Pure validation rules for `ProfileScreen`'s two
 * separate "Guardar" sections — no I/O here, same `zod` convention every
 * other `domain/*` file in this project already established (see
 * `domain/customers/customer.ts`, `domain/payments/payment.ts`,
 * `domain/settings/businessSettings.ts`).
 */

export const PROFILE_NAME_MIN_LENGTH = 2;

// Same 10-digit format `domain/customers/customer.ts#CUSTOMER_PHONE_PATTERN`
// already enforces for a customer's phone — this app operates in one
// country/format, no reason a business user's own phone should follow a
// different rule. `users.phone` itself has no server-side format constraint
// (confirmed live: it's a plain `TextField`, only the unique INDEX is
// enforced), so this is a client-side convenience check, not mirroring a
// server rule the way `customerFormSchema`'s does.
export const PROFILE_PHONE_PATTERN = /^\d{10}$/;

export const profileFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(
      PROFILE_NAME_MIN_LENGTH,
      "El nombre debe tener al menos 2 caracteres.",
    ),
  phone: z
    .string()
    .trim()
    .regex(PROFILE_PHONE_PATTERN, "El teléfono debe tener 10 dígitos."),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

// Live-verified (`src/data/auth-profile.integration.test.ts`, 2026-09-01):
// the `users` collection's `password` field has `min: 8` on this instance —
// PocketBase's own unmodified default, no migration here overrides it — so
// 8 is the real server-side floor, not a guessed number.
export const PROFILE_PASSWORD_MIN_LENGTH = 8;

export const passwordChangeFormSchema = z
  .object({
    oldPassword: z.string().min(1, "Ingresa tu contraseña actual."),
    password: z
      .string()
      .min(
        PROFILE_PASSWORD_MIN_LENGTH,
        `La nueva contraseña debe tener al menos ${PROFILE_PASSWORD_MIN_LENGTH} caracteres.`,
      ),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

export type PasswordChangeFormValues = z.infer<
  typeof passwordChangeFormSchema
>;
