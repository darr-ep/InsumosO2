import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

/**
 * SDD.md §17 ("PrintShareBar (imprimir / compartir, desacoplado, nunca
 * bloqueante)").
 *
 * Gap-fill finding 5 (pure structural refactor, no behavior change):
 * extracted out of `ReceiptDialog`'s inline `DialogFooter` — same
 * Imprimir/Compartir/Cerrar buttons, same visibility rules, same labels,
 * same disabled state, byte-identical markup to before this extraction.
 * All orchestration (Bluetooth connect/print, share, status state) stays
 * in `ReceiptDialog` — this component only renders the bar and forwards
 * callbacks, matching §17's "desacoplado" description.
 *
 * Redesign Round 3, Batch B (visual consistency) — real bug fixed here:
 * "Cerrar" was rendering with the default (filled/primary) `Button` variant
 * while "Imprimir" was `outline`, exactly backwards from the business
 * owner's explicit requirement that a connected printer makes Imprimir "una
 * acción muy evidente" (already correctly done in `RentalCreatedSummary`).
 * Also applies the same `flex-col items-stretch` `DialogFooter` fix as
 * `RentalCreatedSummary`/`ReturnCreatedSummary`/`ReturnDialog` — the
 * primitive's own `flex-col-reverse` default was flipping button order on
 * mobile, and `sm:flex-row sm:justify-end` was shrinking these to
 * natural-width buttons on tablet instead of staying full-width/`lg`-scale
 * touch targets.
 */
export interface PrintShareBarProps {
  printAvailable: boolean;
  printStatus: "idle" | "printing" | "printed" | "failed";
  onPrint: () => void;
  shareAvailable: boolean;
  onShare: () => void;
  onClose: () => void;
}

export function PrintShareBar({
  printAvailable,
  printStatus,
  onPrint,
  shareAvailable,
  onShare,
  onClose,
}: PrintShareBarProps) {
  return (
    <DialogFooter className="flex-col items-stretch">
      {printAvailable && (
        <Button
          type="button"
          onClick={onPrint}
          disabled={printStatus === "printing"}
          className="w-full"
        >
          {printStatus === "failed" ? "Reintentar impresión" : "Imprimir"}
        </Button>
      )}
      {shareAvailable && (
        <Button
          type="button"
          variant="outline"
          onClick={onShare}
          className="w-full"
        >
          Compartir
        </Button>
      )}
      <Button
        type="button"
        variant={printAvailable ? "outline" : "default"}
        onClick={onClose}
        className="w-full"
      >
        Cerrar
      </Button>
    </DialogFooter>
  );
}
