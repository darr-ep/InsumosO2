import { useState } from "react";
import { ClipboardList, Droplet, Wind } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuantityStepper } from "@/components/QuantityStepper";
import {
  updateBusinessSettings,
  type BusinessSettingsRecord,
} from "@/data/settings.repo";
import { handleIfStaleSession } from "@/data/staleSession";
import { totalStockSchema } from "@/domain/settings/businessSettings";

/**
 * Redesign Round 2, Batch 4 (Dashboard Restructure). Original business-owner
 * brief (verbatim): "Después: estadísticas compactas: Rentas activas,
 * Concentradores disponibles y Tanques disponibles. Los valores 0 deben
 * mostrarse en gris neutro, no como error." Superseded by a later request:
 * availability should signal urgency instead.
 *
 * Styling rule (current, explicit business-owner requirement):
 * - The two availability tiles (Concentradores/Tanques disponibles) use a
 *   3-tier urgency scale: `0` → `text-destructive` (out of stock), `1` →
 *   `text-warning` (running low), `2+` → `text-success` ("hay stock
 *   disponible" reads as a positive state, same `--success`-token pattern
 *   `ReceiptDialog`/Batch D already established for confirmations).
 * - "Rentas activas" is a neutral operational count, not a positive/
 *   negative state — it stays `text-foreground` regardless of value, never
 *   promoted/demoted by this scale.
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
 *
 * design-fidelity Slice C (§4.1, design obs #2224 §C4): each tile also
 * shows a small icon with a FIXED per-card identity hue (Rentas activas
 * `text-primary`, Concentradores amber `#D97706`, Tanques teal `#0D9488`)
 * — deliberately NOT wired to `availabilityValueClassName` above, which
 * only ever colors the VALUE text, never the icon. The icon answers "what
 * is this tile about", the value's urgency color answers "how worried
 * should I be" — conflating them would make a low-stock tile's icon flash
 * red/amber too, which the design never asks for and would read as a
 * second, redundant alarm.
 */

export interface DashboardStatsProps {
  activeRentalsCount: number;
  concentradoresDisponibles: number;
  tanquesDisponibles: number;
  totalConcentradores: number;
  totalTanques: number;
  onSettingsUpdated: (settings: BusinessSettingsRecord) => void;
  isRefreshing?: boolean;
}

type EditableField = "concentradores" | "tanques" | null;

function availabilityValueClassName(value: number): string {
  if (value === 0) {
    return "text-destructive";
  }
  if (value === 1) {
    return "text-warning";
  }
  return "text-success";
}

export function DashboardStats({
  activeRentalsCount,
  concentradoresDisponibles,
  tanquesDisponibles,
  totalConcentradores,
  totalTanques,
  onSettingsUpdated,
  isRefreshing = false,
}: DashboardStatsProps) {
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [inputValue, setInputValue] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function openEditDialog(field: Exclude<EditableField, null>) {
    setEditingField(field);
    setInputValue(field === "concentradores" ? totalConcentradores : totalTanques);
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

    const parsed = totalStockSchema.safeParse(inputValue);
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
      {/* Business-owner request: revert to 3 equal-size tiles, no
          background tint or size hierarchy between them — the redesign
          pass's attempt at emphasizing "Rentas activas" read as worse, not
          better. Plain, same-size, same-chrome tiles side by side. */}
      <div className="grid grid-cols-3 gap-2">
        <div
          role="group"
          aria-label={`Rentas activas: ${activeRentalsCount}`}
          className="flex flex-col items-center justify-center gap-1 rounded-md border p-3"
        >
          <ClipboardList
            aria-hidden="true"
            data-testid="stat-icon-rentas-activas"
            className="text-primary size-5"
          />
          {isRefreshing ? (
            <Skeleton className="h-9 w-8" />
          ) : (
            <span className="text-foreground text-3xl font-bold">
              {activeRentalsCount}
            </span>
          )}
          <span className="text-center text-xs text-muted-foreground">
            Rentas activas
          </span>
        </div>

        <div
          role="group"
          aria-label={`Concentradores disponibles: ${concentradoresDisponibles}`}
          className="rounded-md border"
        >
          <button
            type="button"
            onClick={() => openEditDialog("concentradores")}
            className="flex w-full flex-col items-center gap-1 p-3"
          >
            <Wind
              aria-hidden="true"
              data-testid="stat-icon-concentradores"
              className="size-5 text-[#D97706]"
            />
            {isRefreshing ? (
              <Skeleton className="h-7 w-6" />
            ) : (
              <span
                className={cn(
                  "text-xl font-semibold",
                  availabilityValueClassName(concentradoresDisponibles),
                )}
              >
                {concentradoresDisponibles}
              </span>
            )}
            <span className="text-center text-xs text-muted-foreground">
              Concentradores disponibles
            </span>
          </button>
        </div>

        <div
          role="group"
          aria-label={`Tanques disponibles: ${tanquesDisponibles}`}
          className="rounded-md border"
        >
          <button
            type="button"
            onClick={() => openEditDialog("tanques")}
            className="flex w-full flex-col items-center gap-1 p-3"
          >
            <Droplet
              aria-hidden="true"
              data-testid="stat-icon-tanques"
              className="size-5 text-[#0D9488]"
            />
            {isRefreshing ? (
              <Skeleton className="h-7 w-6" />
            ) : (
              <span
                className={cn(
                  "text-xl font-semibold",
                  availabilityValueClassName(tanquesDisponibles),
                )}
              >
                {tanquesDisponibles}
              </span>
            )}
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
            <Label id="total-stock-label">
              {editingField === "concentradores"
                ? "Total de concentradores"
                : "Total de tanques"}
            </Label>
            <QuantityStepper
              value={inputValue}
              onChange={setInputValue}
              decreaseLabel="Restar uno al total"
              increaseLabel="Sumar uno al total"
              valueLabel="Total"
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
