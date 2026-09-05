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
 * Also applies the same `flex-col items-stretch` `DialogFooter` fix as
 * `RentalCreatedSummary`/`ReturnCreatedSummary`/`ReturnDialog` — the
 * primitive's own `flex-col-reverse` default was flipping button order on
 * mobile, and `sm:flex-row sm:justify-end` was shrinking these to
 * natural-width buttons on tablet instead of staying full-width/`lg`-scale
 * touch targets.
 *
 * Button hierarchy (normalized to match `RentalCreatedSummary`'s pattern):
 * "Imprimir" is `variant="secondary"` — a real next step, but not THE final
 * action — and "Cerrar" is always `variant="default"` (primary), the one
 * confirming action for this dialog. Label switches to "Imprimir nuevamente"
 * once `printStatus === "printed"`; failed/not-yet-tried both just read
 * "Imprimir" (no separate "reintentar" wording).
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
          variant="secondary"
          onClick={onPrint}
          disabled={printStatus === "printing"}
          className="w-full"
        >
          {printStatus === "printed" ? "Imprimir nuevamente" : "Imprimir"}
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
      <Button type="button" onClick={onClose} className="w-full">
        Cerrar
      </Button>
    </DialogFooter>
  );
}
