import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CredentialCameraCapture } from "@/components/CredentialCameraCapture";
import { customerFormSchema, type CustomerFormValues } from "@/domain/customers/customer";
import { ID_CARD_ASPECT_RATIO } from "@/lib/credentialCameraCrop";

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
 *
 * Business owner's follow-up request: the captured photo shows an actual
 * thumbnail (not just its filename), and the "Foto de credencial" area
 * reserves the same box footprint (`ID_CARD_ASPECT_RATIO`, matching
 * `CredentialCameraCapture`'s own internal box for idle/loading/live) across
 * both states — captured, or camera shown — so nothing else on the form
 * shifts position when the user retakes the photo. `CredentialCameraCapture`
 * already reserves its own box for its internal states, so it's rendered
 * as-is (not re-wrapped) to avoid nesting two competing `aspect-ratio`
 * boxes; only the captured-photo state builds a matching box here, using the
 * exact same classes.
 *
 * Business owner's second follow-up: dropped the separate "cancelled camera"
 * state (a boxed "Tomar foto" button that just re-showed
 * `CredentialCameraCapture`, which itself opened right back into its own
 * "Tomar foto"/idle button) — a redundant two-tap loop back to the same
 * place. `CredentialCameraCapture` is now unconditionally rendered whenever
 * there's no photo.
 *
 * Business owner's third follow-up: this form now has two distinct callers
 * with genuinely different needs, gated by the `liveReport` prop.
 * `CustomerDetailSheet` (retry-upload for an already-saved customer) keeps
 * the default (`liveReport` unset/false) explicit-submit behavior — a
 * deliberate "Guardar"-style button, unchanged. `CustomerPicker`'s
 * "Cliente nuevo" draft flow instead passes `liveReport` — no submit button
 * at all, `mode: "onBlur"` so field errors surface as soon as the user
 * leaves an invalid field, and every change to name/phone/photo is reported
 * to `onSubmit` immediately via `useWatch`, including the initial
 * (incomplete) values on mount. The caller is responsible for treating an
 * incomplete live-reported draft as not-yet-usable (see
 * `RentalNewScreen.tsx`'s `handleConfirm`).
 *
 * Business owner's fourth follow-up: "Cancelar" IS wanted after all, but
 * only while the camera is actually live (that's `CredentialCameraCapture`'s
 * own internal gating now — see its file doc comment) — so `onCancel` is
 * passed again here, as a no-op (`CredentialCameraCapture` resets its own
 * mode back to idle on cancel, nothing left for this form to do beyond
 * providing a truthy callback so the button renders at all). Also, "Cambiar
 * foto" (retake) now jumps straight into the live preview instead of back to
 * the idle "Tomar foto" button — `hasCapturedBefore` tracks whether a photo
 * has EVER been captured in this form instance, and once true is passed
 * through as `CredentialCameraCapture`'s `autoStart` prop on every
 * subsequent no-photo render (i.e. every retake, but never the very first
 * time — first entry must still not auto-request the camera).
 *
 * Business owner's fifth follow-up: `CustomerPicker` unified its old
 * "Buscar cliente"/"Cliente nuevo" toggle into one search field — tapping
 * "Crear cliente nuevo" after a no-results search pre-fills "Nombre" with
 * whatever was already typed, via the new `initialValues` prop below.
 *
 * design-fidelity (Slice B2, obs #2221/#2223/#2224, call site #5): "Cambiar
 * foto" used to be a bare `setPhoto(null)` with zero warning, discarding a
 * photo the customer's ID may already be back in their wallet for. Now gated
 * unconditionally (there is always a photo to lose when this button renders
 * at all) behind the shared `ConfirmDialog`, rendered as a JSX sibling of
 * this form (design B3 nesting pattern) — synchronous, no `isConfirming`.
 */

export interface CustomerFormSubmitValues extends CustomerFormValues {
  credentialPhoto: File | null;
}

export interface CustomerFormProps {
  onSubmit: (values: CustomerFormSubmitValues) => void | Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
  // No submit button; `mode: "onBlur"` validation; `onSubmit` is called
  // continuously (on mount and on every name/phone/photo change) instead of
  // only once on explicit submit. See file doc comment.
  liveReport?: boolean;
  // Pre-fills react-hook-form's `defaultValues` — named `initialValues` (not
  // `defaultValues`) to avoid confusion with react-hook-form's own config
  // key of the same name. Used by `CustomerPicker` to carry over whatever
  // was already typed into the search box when the user taps "Crear cliente
  // nuevo".
  initialValues?: Partial<CustomerFormValues>;
}

// Mirrors CredentialCameraCapture's own box classes verbatim so the
// captured-photo state occupies the exact same footprint as its live
// idle/loading/live box.
const PHOTO_BOX_CLASSNAME =
  "relative flex items-center justify-center overflow-hidden rounded-md bg-black";

export function CustomerForm({
  onSubmit,
  submitLabel = "Guardar cliente",
  isSubmitting = false,
  liveReport = false,
  initialValues,
}: CustomerFormProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  // Once a photo has been captured at least once, every subsequent retake
  // (via "Cambiar foto") should jump straight into the live camera instead
  // of back to the idle "Tomar foto" button — see file doc comment.
  const [hasCapturedBefore, setHasCapturedBefore] = useState(false);
  // design-fidelity call site #5 — gates the retake discard behind a
  // confirmation popup.
  const [confirmRetakeOpen, setConfirmRetakeOpen] = useState(false);

  // Derived at render time (not via setState-in-effect) so it's always in
  // sync with `photo` — recomputed only when `photo` itself changes.
  const photoPreviewUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );

  // Revokes the previous object URL once it's replaced AND on unmount — an
  // unrevoked blob URL leaks memory for the life of the tab, same discipline
  // `CredentialCameraCapture`'s own `stopStream` cleanup follows. Cleanup
  // only, no setState here.
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { name: "", phone: "", ...initialValues },
    ...(liveReport ? { mode: "onBlur" as const } : {}),
  });

  const watchedName = useWatch({ control, name: "name" });
  const watchedPhone = useWatch({ control, name: "phone" });

  // `liveReport` mode has no submit button to gate `onSubmit` — instead,
  // every change to name/phone/photo (including the initial mount values)
  // is reported immediately. The caller is responsible for treating an
  // incomplete draft as not-yet-usable (see `RentalNewScreen.handleConfirm`).
  useEffect(() => {
    if (!liveReport) {
      return;
    }
    void onSubmit({
      name: watchedName ?? "",
      phone: watchedPhone ?? "",
      credentialPhoto: photo,
    });
    // `onSubmit` intentionally excluded below: callers pass a fresh inline
    // function each render (e.g. `CustomerPicker`'s `handleCreate`), which
    // would otherwise re-fire this effect every render regardless of
    // whether the reported values actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveReport, watchedName, watchedPhone, photo]);

  function handleCapture(file: File) {
    setPhoto(file);
    setHasCapturedBefore(true);
  }

  function handleRetakePhoto() {
    setConfirmRetakeOpen(true);
  }

  function handleConfirmRetake() {
    setPhoto(null);
    setConfirmRetakeOpen(false);
  }

  // `CredentialCameraCapture` resets itself back to idle on cancel now —
  // nothing left for this form to actually do here. Kept as an explicit,
  // named no-op (rather than an inline arrow) so intent is clear: it exists
  // only so "Cancelar" renders at all (conditional on `onCancel` being
  // provided) — see file doc comment.
  function handleCameraCancel() {}

  async function submit(values: CustomerFormValues) {
    // §21/Anexo A.5: no photo is not a blocking error — the customer gets
    // created "credencial pendiente" instead.
    await onSubmit({ ...values, credentialPhoto: photo });
  }

  return (
    <>
    <form
      onSubmit={
        liveReport
          ? (event) => event.preventDefault()
          : (event) => void handleSubmit(submit)(event)
      }
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customer-name" required>Nombre</Label>
        <Input
          id="customer-name"
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
        <Label htmlFor="customer-phone" required>Teléfono</Label>
        <Input
          id="customer-phone"
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

      <div className="flex flex-col gap-1.5">
        <Label>Foto de credencial</Label>
        {photo ? (
          <div className="flex flex-col gap-2">
            <div
              data-testid="customer-form-photo-box"
              className={PHOTO_BOX_CLASSNAME}
              style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
            >
              {photoPreviewUrl && (
                <img
                  src={photoPreviewUrl}
                  alt="Foto de credencial"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <Button type="button" variant="outline" onClick={handleRetakePhoto}>
              Cambiar foto
            </Button>
          </div>
        ) : (
          // CredentialCameraCapture already reserves its own
          // ID_CARD_ASPECT_RATIO box for idle/loading/live — rendered as-is,
          // not re-wrapped in another box (see file doc comment). `autoStart`
          // only kicks in once a photo has been captured before (retakes);
          // `onCancel` is a no-op that just makes "Cancelar" render while
          // live (see file doc comment).
          <CredentialCameraCapture
            autoStart={hasCapturedBefore}
            onCapture={handleCapture}
            onCancel={handleCameraCancel}
          />
        )}
        {/* §16.13's "credencial pendiente" state, made visible at the point
            of creation too — not just later in CustomerDetailSheet. */}
        {!photo && (
          <p className="text-muted-foreground text-sm">
            Sin foto, el cliente se guardará con "credencial pendiente" y
            podrás agregarla después.
          </p>
        )}
      </div>

      {!liveReport && (
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : submitLabel}
        </Button>
      )}
    </form>
    <ConfirmDialog
      open={confirmRetakeOpen}
      onOpenChange={setConfirmRetakeOpen}
      title="¿Tomar otra foto?"
      description="Se borrará la foto que acabas de tomar y tendrás que volver a fotografiar la credencial."
      confirmLabel="Sí, tomar otra"
      onConfirm={handleConfirmRetake}
    />
    </>
  );
}
