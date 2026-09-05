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
 * - `tel:` stretched-link pattern (design §C2): the card root is a
 *   `relative` div, never a `<button>`. An absolutely-positioned
 *   `<button className="absolute inset-0">` carries `onClick`; the phone
 *   is a real `<a href="tel:...">` rendered in its natural place with
 *   `relative z-10` so it sits above that overlay and is NOT a descendant
 *   of it — tapping it can never also trigger the card's `onClick`.
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

  return (
    <div
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-lg border bg-card p-3",
        className,
      )}
    >
      <UserAvatar name={name || "—"} avatarUrl={null} tone="soft" size={40} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground truncate">{name || "—"}</p>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="text-muted-foreground text-sm relative z-10 flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <Phone aria-hidden="true" className="size-3 shrink-0" />
            <span>{phone}</span>
          </a>
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
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel ?? name}
          className="absolute inset-0 rounded-lg transition-all hover:bg-accent/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
    </div>
  );
}
