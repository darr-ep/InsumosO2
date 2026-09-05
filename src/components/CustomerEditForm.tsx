import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { customerFormSchema, type CustomerFormValues } from "@/domain/customers/customer";

/**
 * Redesign — UX/UI pass (Ficha de cliente — business-owner request): a
 * lightweight Nombre/Teléfono-only edit form, deliberately NOT `CustomerForm`
 * reused with different props. `CustomerForm` is tightly coupled to the
 * credential-photo capture flow (it always renders `CredentialCameraCapture`
 * or a captured-photo box, with no "existing photo, don't touch it" mode) —
 * forcing that UI into a "just fix a phone typo" edit would drag in a camera
 * prompt for something that has nothing to do with the photo. Retaking the
 * credential photo already has its own dedicated flow
 * (`CustomerDetailSheet`'s "credencial pendiente" retry-upload), untouched
 * here. Reuses `customerFormSchema` for the same name/phone validation rules
 * `CustomerForm` already enforces — one source of truth for what a valid
 * name/phone looks like, even though the two forms don't share JSX.
 *
 * design-fidelity (Slice B2, obs #2221/#2222/#2223/#2224, call site #8):
 * owner-added on top of the original 6-case audit — cancelling with unsaved
 * name/phone changes now needs confirmation too. Guarded on a dirty check
 * (current name/phone vs `initialValues`); cancelling with no changes closes
 * immediately, no popup. This component owns its own field state, so the
 * dirty check and the `ConfirmDialog` both live here — `CustomerDetailSheet`
 * is not modified for this. Synchronous, no `isConfirming` needed.
 */
export interface CustomerEditFormProps {
  initialValues: CustomerFormValues;
  onSubmit: (values: CustomerFormValues) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function CustomerEditForm({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CustomerEditFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: initialValues,
  });

  const watchedName = useWatch({ control, name: "name" });
  const watchedPhone = useWatch({ control, name: "phone" });
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const isDirty =
    watchedName !== initialValues.name || watchedPhone !== initialValues.phone;

  function handleCancelClick() {
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onCancel();
  }

  function handleConfirmDiscard() {
    setConfirmDiscardOpen(false);
    onCancel();
  }

  return (
    <>
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-edit-name" required>Nombre</Label>
        <Input
          id="customer-edit-name"
          autoComplete="name"
          placeholder="Ej. Juan Pérez"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-destructive text-sm">{errors.name.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-edit-phone" required>Teléfono</Label>
        <Input
          id="customer-edit-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="5512345678"
          aria-invalid={!!errors.phone}
          {...register("phone")}
        />
        {errors.phone && (
          <p className="text-destructive text-sm">{errors.phone.message}</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Guardando…" : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={handleCancelClick}
          className="flex-1"
        >
          Cancelar
        </Button>
      </div>
    </form>
    <ConfirmDialog
      open={confirmDiscardOpen}
      onOpenChange={setConfirmDiscardOpen}
      title="¿Descartar los cambios?"
      description="Se perderán los cambios que hiciste al nombre o teléfono."
      cancelLabel="Seguir editando"
      confirmLabel="Sí, descartar"
      onConfirm={handleConfirmDiscard}
    />
    </>
  );
}
