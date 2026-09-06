import type { ReactNode } from "react";
import { ChevronRight, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";

/**
 * design-fidelity Slice C (§4.2, design obs #2224 §C2/C3):
 * - Circular avatar (`UserAvatar` `tone="soft"`) so the row has an identity
 *   mark, matching `RentalCard`'s customer name row.
 * - Fixed a real bug the explore report found: the active-count badge and
 *   the trailing chevron used to render TOGETHER (the chevron only checked
 *   `!trailing`, never `!badge`) — they're now mutually exclusive; a
 *   caller-supplied `trailing` is still allowed alongside the badge (it's
 *   an explicit override, e.g. an action button), only the badge/chevron
 *   pair is exclusive.
 * - Owner reversal (post-implementation audit, supersedes design §C2's
 *   `tel:` stretched-link pattern): the `tel:` affordance caused frequent
 *   misclicks in real usage and has been removed entirely. The phone
 *   renders as plain text like every other card field — no link, no `tel:`
 *   href, no overlay restructuring. The card root goes back to being a
 *   single `<button>` (when `onClick` is given) or a plain `<div>`
 *   (otherwise), since there's no longer a nested interactive element to
 *   keep separate from the root. The `tel:` affordance still exists, but
 *   ONLY inside `CustomerDetailSheet`'s dedicated phone row.
 */
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
  const showBadge = activeCount !== undefined && activeCount > 0;
  const showChevron = Boolean(onClick) && !trailing && !showBadge;

  const content = (
    <>
      <UserAvatar name={name || "—"} avatarUrl={null} tone="soft" size={40} />
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
        {showBadge && (
          <span className="bg-success/10 text-success inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
            {activeCount === 1 ? "1 activa" : `${activeCount} activas`}
          </span>
        )}
        {trailing}
        {showChevron && (
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
        aria-label={ariaLabel ?? name}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:bg-accent/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
        "flex w-full items-center gap-3 rounded-lg border bg-card p-3",
        className,
      )}
    >
      {content}
    </div>
  );
}
