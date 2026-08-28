import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CredentialCameraCapture } from "@/components/CredentialCameraCapture";
import { customerFormSchema, type CustomerFormValues } from "@/domain/customers/customer";

/**
 * SDD.md §7.1 (cliente nuevo: nombre, teléfono, foto de credencial) + §20
 * (validación) + §15 (credencial protegida) + §21/Anexo A.5 (falla de
 * subida no bloquea la creación). Used both standalone (from
 * `CustomerPicker`) and from `CustomerDetailSheet` (Phase 3, retry upload).
 *
 * Phase 3 fix: the photo is no longer required to submit this form —
 * §21's own failure table and Anexo A.5 say a missing/failed upload must
 * still let the customer (and rental) be created, marked "credencial
 * pendiente" (domain/customers/customer.ts#isCredentialPending). Before
 * this fix the form hard-blocked submission without a photo, which made
 * A.5's fallback impossible to reach from the UI at all.
 *
 * Feature: Credential Photo Camera + Compression (Batch 3a) — the plain
 * `<input type="file">` was replaced with `CredentialCameraCapture`
 * (business owner's UX request). `CredentialCameraCapture` already
 * compresses and re-encodes every photo it produces (both its live-capture
 * and its own native-file-picker fallback path always run through
 * `compressImage` before calling `onCapture`, and never call `onCapture` if
 * that fails — see its own tests), so this form's former
 * `isAcceptedCredentialPhotoType`/`isCredentialPhotoWithinSizeLimit`
 * defense-in-depth checks are dropped here as dead weight: every `File`
 * this form can now receive is already a compressed `image/jpeg` blob well
 * under the size limit by construction. `onCancel` (declining/skipping the
 * camera) is treated the same as never having taken a photo — still a
 * valid, non-blocking "credencial pendiente" submission per Anexo A.5, not
 * an error.
 */

export interface CustomerFormSubmitValues extends CustomerFormValues {
  credentialPhoto: File | null;
}

export interface CustomerFormProps {
  onSubmit: (values: CustomerFormSubmitValues) => void | Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export function CustomerForm({
  onSubmit,
  submitLabel = "Guardar cliente",
  isSubmitting = false,
}: CustomerFormProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [showCamera, setShowCamera] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { name: "", phone: "" },
  });

  function handleCapture(file: File) {
    setPhoto(file);
    setShowCamera(false);
  }

  function handleCameraCancel() {
    // §21/Anexo A.5: skipping/declining the camera is not an error — the
    // customer still gets created "credencial pendiente" if the form is
    // submitted from here.
    setShowCamera(false);
  }

  function handleRetakePhoto() {
    setPhoto(null);
    setShowCamera(true);
  }

  async function submit(values: CustomerFormValues) {
    // §21/Anexo A.5: no photo is not a blocking error — the customer gets
    // created "credencial pendiente" instead.
    await onSubmit({ ...values, credentialPhoto: photo });
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-name">Nombre</Label>
        <Input
          id="customer-name"
          autoComplete="name"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-destructive text-sm">{errors.name.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-phone">Teléfono</Label>
        <Input
          id="customer-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          aria-invalid={!!errors.phone}
          {...register("phone")}
        />
        {errors.phone && (
          <p className="text-destructive text-sm">{errors.phone.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Foto de credencial</Label>
        {photo ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-sm">
              Foto seleccionada: {photo.name}
            </p>
            <Button type="button" variant="outline" onClick={handleRetakePhoto}>
              Cambiar foto
            </Button>
          </div>
        ) : (
          <>
            {showCamera ? (
              <CredentialCameraCapture
                onCapture={handleCapture}
                onCancel={handleCameraCancel}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCamera(true)}
              >
                Tomar foto
              </Button>
            )}
            {/* §16.13's "credencial pendiente" state, made visible at the
                point of creation too — not just later in CustomerDetailSheet. */}
            <p className="text-muted-foreground text-sm">
              Sin foto, el cliente se guardará con "credencial pendiente" y
              podrás agregarla después.
            </p>
          </>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
