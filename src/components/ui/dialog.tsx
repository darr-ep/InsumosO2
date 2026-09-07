import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useHistoryBackClose } from "@/lib/useHistoryBackClose";

// shadcn/ui base Dialog (§9, §17) — used as the modal shell for
// ReceiptDialog (task 1.9) and, later, PaymentDialog/ReturnDialog
// (Phase 2/3).

function Dialog({
  open = false,
  onOpenChange,
  manageHistory = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & {
  // A router `useBlocker`-driven dialog (e.g. RentalNewScreen's exit-guard
  // ConfirmDialog) already has its `open` state tied to a real back
  // navigation attempt — layering this hook's own raw `pushState`/
  // `history.back()` bookkeeping on top of that fights the blocker for the
  // same physical back step (its self-cleanup `history.back()` on a normal
  // button close resumes/replays the blocked navigation instead of just
  // dismissing the dialog). Those callers pass `manageHistory={false}` to
  // opt out; every other Dialog keeps the default so the back gesture
  // still closes it.
  manageHistory?: boolean;
}) {
  // Makes the Android/browser back gesture close this dialog instead of
  // navigating the screen underneath it away — see useHistoryBackClose's
  // own docblock for why this needs to live at the shared primitive.
  useHistoryBackClose(manageHistory && open, () => onOpenChange?.(false));
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  );
}

function DialogPortal(
  props: React.ComponentProps<typeof DialogPrimitive.Portal>,
) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-xs",
        "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  overlayClassName,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  // design-fidelity B1 (obs #2224): lets a dialog stacked on top of an
  // already-open Dialog/Sheet (e.g. ConfirmDialog rendered as a sibling)
  // use a lighter overlay so two stacked overlays don't compound to
  // near-black. Additive, default-undefined — zero effect on every
  // existing caller.
  overlayClassName?: string;
}) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-card fixed top-1/2 left-1/2 z-50 flex flex-col w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-xl",
          "max-h-[85dvh] overflow-hidden p-0",
          "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out",
          className,
        )}
        {...props}
      >
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-3 right-3 z-30 flex size-8 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 hover:bg-accent focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ring-0 outline-none border-none disabled:pointer-events-none"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        )}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "sticky -top-4 -mx-4 -mt-4 z-20 flex flex-col gap-1.5 bg-card pl-12 pr-12 pt-4 pb-3 border-b text-center sm:pl-4 sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
