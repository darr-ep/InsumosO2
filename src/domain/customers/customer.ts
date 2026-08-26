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

/**
 * §21's failure table + Anexo A.5: "si falla la subida de la foto de
 * credencial, se permite continuar... el cliente queda marcado 'credencial
 * pendiente'". `customers.credential_photo` is `required: false` at the
 * PocketBase schema level (Phase 3 fix — see the migration's docblock), so
 * there's no separate status field to track this: "pendiente" is simply
 * "no credential file exists yet", derived from the record itself. Used by
 * `CustomerDetailSheet` (task 3.4, §16.13's own "credencial pendiente" UI
 * state) to decide whether to show a warning + retry-upload affordance.
 */
export function isCredentialPending(credentialPhoto: string | null | undefined): boolean {
  return !credentialPhoto;
}
