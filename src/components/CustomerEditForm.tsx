import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: initialValues,
  });

  return (
    <form
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-edit-name">Nombre</Label>
        <Input
          id="customer-edit-name"
          autoComplete="name"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && (
          <p className="text-destructive text-sm">{errors.name.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-edit-phone">Teléfono</Label>
        <Input
          id="customer-edit-phone"
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

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? "Guardando…" : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={onCancel}
          className="flex-1"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
