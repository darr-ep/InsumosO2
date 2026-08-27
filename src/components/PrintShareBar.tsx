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
    <DialogFooter>
      {printAvailable && (
        <Button
          type="button"
          variant="outline"
          onClick={onPrint}
          disabled={printStatus === "printing"}
        >
          {printStatus === "failed" ? "Reintentar impresión" : "Imprimir"}
        </Button>
      )}
      {shareAvailable && (
        <Button type="button" variant="outline" onClick={onShare}>
          Compartir
        </Button>
      )}
      <Button type="button" onClick={onClose}>
        Cerrar
      </Button>
    </DialogFooter>
  );
}
