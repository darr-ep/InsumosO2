import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Phone, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingDialog } from "@/components/LoadingDialog";
import { CredentialCameraCapture } from "@/components/CredentialCameraCapture";
import {
  customerFormSchema,
  formatCustomerName,
  type CustomerFormValues,
} from "@/domain/customers/customer";
import { ID_CARD_ASPECT_RATIO } from "@/lib/credentialCameraCrop";
import { cleanPhoneDigits, formatPhoneDisplay, getCursorPositionAfterFormat } from "@/lib/phone";

export interface CustomerEditFormProps {
  initialValues: CustomerFormValues;
  credentialUrl?: string | null;
  onPhotoCaptured?: (file: File) => void;
  onSubmit: (values: CustomerFormValues) => void | Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
}

export function CustomerEditForm({
  initialValues,
  credentialUrl,
  onPhotoCaptured,
  onSubmit,
  onCancel,
  onDelete,
  isSubmitting = false,
}: CustomerEditFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    clearErrors,
    trigger,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: initialValues.name,
      phone: cleanPhoneDigits(initialValues.phone),
    },
  });

  const watchedName = useWatch({ control, name: "name" });
  const watchedPhone = useWatch({ control, name: "phone" });
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isCapturingNewPhoto, setIsCapturingNewPhoto] = useState(false);

  const currentCredentialUrl = localPreviewUrl || credentialUrl;

  const isDirty =
    watchedName !== initialValues.name ||
    watchedPhone !== initialValues.phone ||
    Boolean(localPreviewUrl);

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

  function handleCapturedFile(file: File) {
    const url = URL.createObjectURL(file);
    setLocalPreviewUrl(url);
    setIsCapturingNewPhoto(false);
    onPhotoCaptured?.(file);
  }

  return (
    <>
      <div className="sticky -top-1 -mx-4 -mt-1 z-20 flex items-center justify-between bg-background px-4 pt-1.5 pb-2.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancelClick}
          className="-ml-2 flex items-center gap-1.5 text-lg font-bold text-foreground hover:bg-transparent"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Editar cliente
        </Button>
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive/70 transition-colors"
            aria-label="Eliminar cliente"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>

      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-edit-name" required>
            Nombre
          </Label>
          <div className="relative flex items-center">
            <User
              aria-hidden="true"
              className="text-muted-foreground absolute left-3 size-4"
            />
            <Input
              id="customer-edit-name"
              autoComplete="name"
              placeholder="Ej. Juan Pérez"
              aria-invalid={!!errors.name}
              className="pl-9 bg-card border-border shadow-xs"
              {...register("name", {
                onChange: (e) => {
                  if (e.target.value.trim().length >= 2) {
                    clearErrors("name");
                  }
                },
                onBlur: (e) => {
                  const formatted = formatCustomerName(e.target.value);
                  if (formatted !== e.target.value) {
                    setValue("name", formatted, { shouldValidate: true });
                  }
                },
              })}
            />
          </div>
          {errors.name && (
            <p className="text-destructive text-sm">{errors.name.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-edit-phone">
            Teléfono
          </Label>
          <div className="relative flex items-center">
            <Phone
              aria-hidden="true"
              className="text-muted-foreground absolute left-3 size-4"
            />
            <Input
              id="customer-edit-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={12}
              placeholder="775 123 4567"
              aria-invalid={!!errors.phone}
              className="pl-9 bg-card border-border shadow-xs"
              value={formatPhoneDisplay(watchedPhone || "")}
              onChange={(e) => {
                const inputEl = e.target;
                const selectionStart = inputEl.selectionStart;
                const rawValue = inputEl.value;

                const digits = cleanPhoneDigits(rawValue);
                setValue("phone", digits, { shouldValidate: true });
                if (digits.length === 0 || digits.length === 10) {
                  clearErrors("phone");
                }

                const formatted = formatPhoneDisplay(digits);
                const newCursor = getCursorPositionAfterFormat(
                  rawValue,
                  selectionStart,
                  formatted,
                );

                requestAnimationFrame(() => {
                  inputEl.setSelectionRange(newCursor, newCursor);
                });
              }}
              onBlur={() => {
                void trigger("phone");
              }}
            />
          </div>
          {errors.phone && (
            <p className="text-destructive text-sm">{errors.phone.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Credencial</Label>
          {currentCredentialUrl && !isCapturingNewPhoto ? (
            <div className="flex flex-col gap-2">
              <div
                className="relative w-full overflow-hidden rounded-2xl border bg-black shadow-sm"
                style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
              >
                <img
                  src={currentCredentialUrl}
                  alt="Credencial del cliente"
                  className="h-full w-full object-cover"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCapturingNewPhoto(true)}
                className="w-full bg-card hover:bg-muted border border-border rounded-xl shadow-xs"
              >
                Cambiar foto
              </Button>
            </div>
          ) : (
            <CredentialCameraCapture
              autoStart={false}
              onCapture={handleCapturedFile}
              onCancel={currentCredentialUrl ? () => setIsCapturingNewPhoto(false) : undefined}
            />
          )}
        </div>

        {/* Hide bottom Cancelar/Guardar while camera is capturing to avoid 4 buttons */}
        {!isCapturingNewPhoto && (
          <div className="sticky -bottom-4 -mx-4 -mb-4 z-20 mt-auto flex gap-2 border-t bg-background px-4 pt-3 pb-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={handleCancelClick}
              className="flex-1 bg-card hover:bg-muted border border-border shadow-xs"
            >
              Cancelar
            </Button>
            <Button type="submit" size="lg" disabled={isSubmitting} className="flex-1">
              Guardar
            </Button>
          </div>
        )}
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
      <LoadingDialog
        open={isSubmitting}
        title="Guardando cambios..."
        description="Estamos actualizando tu información."
      />
    </>
  );
}
