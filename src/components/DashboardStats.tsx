import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateBusinessSettings,
  type BusinessSettingsRecord,
} from "@/data/settings.repo";
import { handleIfStaleSession } from "@/data/staleSession";
import { totalStockSchema } from "@/domain/settings/businessSettings";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). Business owner
 * (verbatim, confirmed): "Después: estadísticas compactas: Rentas activas,
 * Concentradores disponibles y Tanques disponibles. Los valores 0 deben
 * mostrarse en gris neutro, no como error."
 *
 * Styling rule (explicit business-owner requirement, already decided):
 * - `0` renders `text-muted-foreground` — zero is a normal/expected state,
 *   not an error.
 * - The two availability tiles (Concentradores/Tanques disponibles): a
 *   non-zero value uses the `--success` token (green) — "hay stock
 *   disponible" reads as a positive state, same `--success`-token pattern
 *   `ReceiptDialog`/Batch D already established for confirmations.
 * - "Rentas activas" is a neutral operational count, not a positive/
 *   negative state — it stays `text-foreground` regardless of value, never
 *   promoted to `--success` or demoted to `text-muted-foreground`.
 *
 * Each tile is `role="group"` with an `aria-label` combining its label and
 * value, so the value (a bare number, otherwise ambiguous when multiple
 * tiles share the same digit) is unambiguously identifiable both to
 * assistive tech and to tests.
 *
 * Feature: Runtime-Editable Total Stock (business owner's UX request, post-
 * MVP+redesign, not SDD.md-sourced): the two availability tiles are now
 * tap-to-edit, directly where they're shown — no new screen, no new nav
 * entry (matches this redesign's "sin configuración adicional" preference).
 * Tapping "Concentradores disponibles"/"Tanques disponibles" opens a small
 * Dialog pre-filled with the CURRENT CONFIGURED TOTAL (`totalConcentradores`/
 * `totalTanques` — not the computed availability number the tile itself
 * displays), calling `updateBusinessSettings` on save. Both increasing and
 * decreasing are the exact same code path (business owner, verbatim: "tanto
 * para aumentar como disminuir") — no separate +/- controls. "Rentas
 * activas" stays a plain, non-tappable count: it's derived from real rental
 * data, not a settable total.
 *
 * Each tappable tile keeps its outer `role="group"`/`aria-label` container
 * unchanged (preserves every existing query in this file and in
 * `DashboardScreen.test.tsx`) and nests a real `<button>` inside it for the
 * actual tap target — a `role="group"` element cannot also carry the
 * implicit `button` role, so the interactive element has to be a distinct
 * child, not the group container itself.
 */

export interface DashboardStatsProps {
  activeRentalsCount: number;
  concentradoresDisponibles: number;
  tanquesDisponibles: number;
  totalConcentradores: number;
  totalTanques: number;
  onSettingsUpdated: (settings: BusinessSettingsRecord) => void;
}

type EditableField = "concentradores" | "tanques" | null;

function availabilityValueClassName(value: number): string {
  return value === 0 ? "text-muted-foreground" : "text-success";
}

export function DashboardStats({
  activeRentalsCount,
  concentradoresDisponibles,
  tanquesDisponibles,
  totalConcentradores,
  totalTanques,
  onSettingsUpdated,
}: DashboardStatsProps) {
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [inputValue, setInputValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function openEditDialog(field: Exclude<EditableField, null>) {
    setEditingField(field);
    setInputValue(
      String(field === "concentradores" ? totalConcentradores : totalTanques),
    );
    setFormError(null);
  }

  function closeEditDialog() {
    setEditingField(null);
    setFormError(null);
  }

  async function handleSave() {
    if (!editingField) {
      return;
    }

    const parsed = totalStockSchema.safeParse(Number(inputValue));
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Revisa el valor ingresado.",
      );
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const updated = await updateBusinessSettings(
        editingField === "concentradores"
          ? { totalConcentradores: parsed.data }
          : { totalTanques: parsed.data },
      );
      onSettingsUpdated(updated);
      setEditingField(null);
    } catch (error) {
      // §14 gap-fill (same pattern PaymentDialog/CustomerForm already use):
      // a rotated/expired session surfaces here as this exact generic
      // save-error — redirect to /login instead.
      if (handleIfStaleSession(error)) {
        return;
      }
      setFormError(
        "No se pudo guardar el cambio. Verifica tu conexión e intenta de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div
          role="group"
          aria-label={`Rentas activas: ${activeRentalsCount}`}
          className="flex flex-col items-center gap-1 rounded-md border p-3"
        >
          <span className="text-foreground text-2xl font-semibold">
            {activeRentalsCount}
          </span>
          <span className="text-center text-xs text-muted-foreground">
            Rentas activas
          </span>
        </div>

        <div
          role="group"
          aria-label={`Concentradores disponibles: ${concentradoresDisponibles}`}
          className="rounded-md border p-3"
        >
          <button
            type="button"
            onClick={() => openEditDialog("concentradores")}
            className="flex w-full flex-col items-center gap-1"
          >
            <span
              className={cn(
                "text-2xl font-semibold",
                availabilityValueClassName(concentradoresDisponibles),
              )}
            >
              {concentradoresDisponibles}
            </span>
            <span className="text-center text-xs text-muted-foreground">
              Concentradores disponibles
            </span>
          </button>
        </div>

        <div
          role="group"
          aria-label={`Tanques disponibles: ${tanquesDisponibles}`}
          className="rounded-md border p-3"
        >
          <button
            type="button"
            onClick={() => openEditDialog("tanques")}
            className="flex w-full flex-col items-center gap-1"
          >
            <span
              className={cn(
                "text-2xl font-semibold",
                availabilityValueClassName(tanquesDisponibles),
              )}
            >
              {tanquesDisponibles}
            </span>
            <span className="text-center text-xs text-muted-foreground">
              Tanques disponibles
            </span>
          </button>
        </div>
      </div>

      <Dialog
        open={editingField !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeEditDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingField === "concentradores"
                ? "Editar total de concentradores"
                : "Editar total de tanques"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="total-stock-input">
              {editingField === "concentradores"
                ? "Total de concentradores"
                : "Total de tanques"}
            </Label>
            <Input
              id="total-stock-input"
              type="number"
              inputMode="numeric"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
            />
          </div>

          {formError && (
            <p className="text-destructive text-sm">{formError}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={closeEditDialog}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleSave()}
            >
              {isSubmitting ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
