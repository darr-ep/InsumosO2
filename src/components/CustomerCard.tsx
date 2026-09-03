import type { ReactNode } from "react";
import { ChevronRight, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomerCardProps {
  name: string;
  phone?: string;
  activeCount?: number;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
  trailing?: ReactNode;
}

export function CustomerCard({
  name,
  phone,
  activeCount,
  onClick,
  className,
  ariaLabel,
  trailing,
}: CustomerCardProps) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground truncate">{name || "—"}</p>
        {phone && (
          <p className="text-muted-foreground text-sm flex items-center gap-1">
            <Phone aria-hidden="true" className="size-3 shrink-0" />
            <span>{phone}</span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 pl-2">
        {activeCount !== undefined && activeCount > 0 && (
          <span className="bg-success/10 text-success inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
            {activeCount === 1 ? "1 activa" : `${activeCount} activas`}
          </span>
        )}
        {trailing}
        {onClick && !trailing && (
          <ChevronRight
            aria-hidden="true"
            className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors"
          />
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          "group flex w-full items-center justify-between rounded-lg border bg-card p-3 text-left transition-all hover:bg-accent/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between rounded-lg border bg-card p-3",
        className,
      )}
    >
      {content}
    </div>
  );
}
