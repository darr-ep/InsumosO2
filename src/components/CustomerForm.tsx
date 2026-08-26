import { useState, type ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  customerFormSchema,
  isAcceptedCredentialPhotoType,
  isCredentialPhotoWithinSizeLimit,
  type CustomerFormValues,
} from "@/domain/customers/customer";

/**
 * SDD.md §7.1 (cliente nuevo: nombre, teléfono, foto de credencial) + §20
 * (validación) + §15 (credencial protegida). Used both standalone (from
 * `CustomerPicker`) and, later, from `CustomerDetailSheet` (Phase 3).
 */

export interface CustomerFormSubmitValues extends CustomerFormValues {
  credentialPhoto: File;
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
  const [photoError, setPhotoError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { name: "", phone: "" },
  });

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setPhoto(null);
      return;
    }

    if (!isAcceptedCredentialPhotoType(file.type)) {
      setPhotoError("Formato de imagen no válido. Usa JPG, PNG o WEBP.");
      setPhoto(null);
      return;
    }

    if (!isCredentialPhotoWithinSizeLimit(file.size)) {
      setPhotoError("La imagen no puede pesar más de 8MB.");
      setPhoto(null);
      return;
    }

    setPhotoError(null);
    setPhoto(file);
  }

  async function submit(values: CustomerFormValues) {
    if (!photo) {
      setPhotoError("Selecciona una foto de credencial.");
      return;
    }

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
        <Label htmlFor="customer-credential-photo">Foto de credencial</Label>
        <Input
          id="customer-credential-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoChange}
        />
        {photoError && (
          <p className="text-destructive text-sm">{photoError}</p>
        )}
        {photo && !photoError && (
          <p className="text-muted-foreground text-sm">
            Foto seleccionada: {photo.name}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
