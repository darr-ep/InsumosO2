import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * design-fidelity (Slice B1, obs #2221/#2224/#2223) — shared confirmation
 * popup reused across every state-mutating/work-discarding action the
 * confirm-dialogs audit (#2221) flagged. Built on `ui/dialog.tsx`, no new
 * dependency (`@radix-ui/react-alert-dialog` explicitly rejected).
 *
 * Visual mapping to frame `d41cks` (330x235): no close (X) button so the
 * only exits are the two buttons; centered rose circle + red
 * `AlertTriangle`; centered bold title + gray description; side-by-side
 * full-width buttons with Cancelar = outline, confirm = default/black
 * unless `tone="destructive"` is explicitly requested (none of this
 * change's 8 call sites use it, per the design's deliberate black
 * "Sí, devolver").
 *
 * Initial focus on Cancel is achieved by DOM ORDER, not an
 * `onOpenAutoFocus` override: with `showCloseButton={false}`, the Cancel
 * button is the first focusable descendant of `DialogContent`, so Radix's
 * default autofocus behavior lands there. Load-bearing but implicit —
 * pinned by `ConfirmDialog.test.tsx` so a future markup reorder (e.g.
 * moving confirm before cancel) can't silently move initial focus onto the
 * (sometimes destructive) confirm button.
 *
 * Nesting pattern (design B3): callers render this as a JSX SIBLING of
 * their parent `Dialog`/`Sheet`, never inside its `DialogContent` — see
 * `overlayClassName="bg-black/30 backdrop-blur-none"` below, which exists
 * specifically so two stacked Radix overlays don't compound to near-black.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  tone?: "default" | "destructive";
  isConfirming?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  tone = "default",
  isConfirming = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[330px]"
        overlayClassName="bg-black/30 backdrop-blur-none"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
            <AlertTriangle aria-hidden="true" className="size-6 text-red-600" />
          </div>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {description}
          </DialogDescription>
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={isConfirming}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            size="lg"
            className="flex-1"
            disabled={isConfirming}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
