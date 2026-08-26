import { z } from "zod";

/**
 * SDD.md §20 (validaciones — cliente, capa Zod) + §15 (credencial protegida).
 * Pure validation rules for the customer half of "Nueva renta" (§7.1,
 * CustomerForm — task 1.6). The server (PocketBase schema) re-validates the
 * same shape as the last line of defense (§20), this is the client-side
 * immediate-feedback layer only.
 */

export const CUSTOMER_NAME_MIN_LENGTH = 2;
export const CUSTOMER_PHONE_PATTERN = /^\d{10}$/;

export const customerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(
      CUSTOMER_NAME_MIN_LENGTH,
      "El nombre debe tener al menos 2 caracteres.",
    ),
  phone: z
    .string()
    .trim()
    .regex(CUSTOMER_PHONE_PATTERN, "El teléfono debe tener 10 dígitos."),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

// §20: "imagen, máx. tamaño razonable (ej. 8MB)" — matches the server-side
// `credential_photo` field's maxSize/mimeTypes in the customers migration.
export const CREDENTIAL_PHOTO_MAX_SIZE_BYTES = 8 * 1024 * 1024;
export const CREDENTIAL_PHOTO_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function isAcceptedCredentialPhotoType(mimeType: string): boolean {
  return (CREDENTIAL_PHOTO_ACCEPTED_TYPES as readonly string[]).includes(
    mimeType,
  );
}

export function isCredentialPhotoWithinSizeLimit(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= CREDENTIAL_PHOTO_MAX_SIZE_BYTES;
}
