import * as React from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useHistoryBackClose } from "@/lib/useHistoryBackClose";

// shadcn/ui Drawer / Sheet backed by Vaul (§16.2, §16.5, §16.6).
// Provides native mobile drag-to-dismiss gesture, spring physics animations,
// and accessible modal dialog semantics under the hood.

function Sheet({
  shouldScaleBackground = false,
  open = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof Drawer.Root>) {
  // Makes the Android/browser back gesture close this sheet instead of
  // navigating the screen underneath it away — see useHistoryBackClose's
  // own docblock for why this needs to live at the shared primitive.
  useHistoryBackClose(open, () => onOpenChange?.(false));
  return (
    <Drawer.Root
      data-slot="sheet"
      shouldScaleBackground={shouldScaleBackground}
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    />
  );
}

function SheetPortal(props: React.ComponentProps<typeof Drawer.Portal>) {
  return <Drawer.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof Drawer.Overlay>) {
  return (
    <Drawer.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-scrim backdrop-blur-xs transition-opacity duration-300",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  showCloseButton = false,
  showHandle = true,
  ...props
}: React.ComponentProps<typeof Drawer.Content> & {
  showCloseButton?: boolean;
  showHandle?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <Drawer.Content
        data-slot="sheet-content"
        className={cn(
          "bg-background fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] flex flex-col rounded-t-2xl border border-b-0 shadow-2xl overflow-hidden focus:outline-none",
          className,
        )}
        {...props}
      >
        {showHandle && (
          <div
            data-slot="sheet-handle"
            className="mx-auto mt-2.5 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30 cursor-grab active:cursor-grabbing"
          />
        )}
        {showCloseButton && (
          <Drawer.Close
            data-slot="sheet-close"
            className="absolute top-[18px] right-3 z-30 flex size-9 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ring-0 outline-none border-none disabled:pointer-events-none"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Cerrar</span>
          </Drawer.Close>
        )}
        <div className="flex-1 overflow-y-auto p-4 pt-1 flex flex-col gap-4">
          {children}
        </div>
      </Drawer.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "sticky -top-1 -mx-4 -mt-1 z-20 flex flex-col gap-1.5 bg-background px-4 pt-1.5 pb-2.5",
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "sticky -bottom-4 -mx-4 -mb-4 z-20 mt-auto flex flex-col gap-2 bg-background px-4 pt-3 pb-4 border-t",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof Drawer.Title>) {
  return (
    <Drawer.Title
      data-slot="sheet-title"
      className={cn("text-foreground text-lg font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof Drawer.Description>) {
  return (
    <Drawer.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};

