import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Carga" family (pencil ground truth: "Carga · Iniciando sesión" /
 * "Conectando impresora" / "Guardando cambios" / "Creando renta" /
 * "Procesando devolución" / "Procesando pago" / "Registrando ajuste" — 7
 * frames, identical layout, only title/description differ per action).
 *
 * Distinct from `ConfirmDialog`: this is for actions that DON'T need a
 * prior yes/no confirmation — the form submit or menu action itself already
 * IS the confirmation, so there are no buttons at all here, just an icon +
 * indeterminate progress bar. The caller's own async work is the only thing
 * that closes it (flip `open` to `false` once the mutation resolves) — there
 * is no user-facing way to dismiss it early, matching every real frame
 * (no close button, no Cancelar).
 */
export interface LoadingDialogProps {
  open: boolean;
  title: string;
  description: string;
  // Forwarded to the underlying `Dialog` — see its own `manageHistory` doc.
  // A caller where this LoadingDialog opens in the SAME commit that closes
  // a sibling `ConfirmDialog`/`Dialog` (e.g. PaymentDialog/ReturnDialog's
  // confirm → loading transition) needs to pass `false`, so its freshly
  // pushed history entry doesn't get mistaken for the closing dialog's own
  // entry — same race `ReturnCreatedSummary`/`PaymentCreatedSummary` opt
  // out of. Every other call site keeps the default.
  manageHistory?: boolean;
}

export function LoadingDialog({
  open,
  title,
  description,
  manageHistory = true,
}: LoadingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}} manageHistory={manageHistory}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[330px]"
        overlayClassName="bg-black/30 backdrop-blur-none"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40">
            <Loader2
              aria-hidden="true"
              className="text-primary size-6 animate-spin"
            />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </div>

        <div
          role="progressbar"
          aria-label={title}
          className="bg-muted relative h-1.5 w-full overflow-hidden rounded-full"
        >
          <div className="animate-bar-sweep bg-primary absolute inset-y-0 left-0 w-full origin-left rounded-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
