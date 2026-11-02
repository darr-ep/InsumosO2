import type { ReactNode } from "react";
import { Phone, Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import type { RentalStatus } from "@/data/rentals.repo";
import { cn } from "@/lib/utils";

/**
 * SDD.md §17 ("RentalCard (folio, cliente, estado, tiempo transcurrido)").
 *
 * Redesign Batch D (business-owner brief, round 4 — RentalCard visual
 * redesign, verbatim): "Una renta debe mostrar rápidamente: nombre del
 * cliente, folio, producto, fecha de inicio, costo/renta, estado.
 * Priorizar la información por importancia. Las rentas antiguas deben
 * destacar visualmente de forma moderada mediante color/indicador de
 * estado, sin crear una interfaz alarmista."
 *
 * Ground-truth check before this batch found status was NOT shown anywhere
 * on the card (only inside `RentalDetailSheet`'s `dl`) — a real gap, since
 * `searchRentals` (§7.4) matches across ALL statuses, so a search-result
 * card could be a returned rental with no way to tell. `status` is now a
 * required prop rendered via the existing `RentalStatusBadge` (unchanged —
 * already satisfies "el estado se comunica primero con texto, el color es
 * refuerzo"), placed trailing in the header row next to the customer name —
 * the same "label at rest, value/indicator trailing" row convention
 * `RentalDetailSheet`'s own "Estado" `dt`/`dd` row already uses.
 *
 * `folio` is promoted out of the generic `children` blob (previously just
 * another `<p>` with the exact same visual weight as everything else) into
 * its own styled prop, so RentalCard owns the 2-tier hierarchy instead of
 * leaving it to each call site to remember: folio renders with `font-medium
 * text-foreground` (the more prominent secondary line), `children` renders
 * at `text-xs text-muted-foreground` (tertiary/metadata weight — date,
 * cost, phone, or the stale "días activa" copy, depending on the caller).
 *
 * Redesign — UX/UI pass: `itemTypeIcon` is optional and deliberately NOT
 * always available — it's derived by the caller from data it already has in
 * memory (e.g. `DashboardScreen`'s own `listActiveRentalItems()` fetch,
 * grouped by `rental_id`), never a new per-card fetch. `searchRentals`
 * results still don't carry item-type data (unchanged limitation from the
 * original note this replaces), so search-result cards render without one
 * — a real, accepted scope cut, not an oversight. `phone` is optional for
 * the same reason: only screens that already expand `customer_id` can pass
 * it for free.
 *
 * design-fidelity Slice C (design obs #2224 §C3, exact values from explore
 * obs #2217 §4.1): row 2 collapses folio+phone onto ONE line (icon + bare
 * folio, no "Folio: " prefix — the folio is no longer the visually
 * prominent element, `amount` is) and row 3 splits into date (left,
 * `children`) + `amount` (right, `text-[17px] font-bold text-primary`).
 * `amount` is promoted out of the generic `children` blob into its own
 * prop, the same way `folio` was previously promoted — `children` now only
 * carries the date/metadata line(s) that sit to the LEFT of the amount.
 *
 * Owner reversal (post-implementation audit, supersedes design §C2's `tel:`
 * stretched-link pattern): the `tel:` affordance on cards caused frequent
 * misclicks in real usage ("misclicks bastantes seguidos... horrible cuando
 * no buscas eso") and has been removed entirely. The phone renders as plain
 * text like every other card field — no link, no `tel:` href, no overlay
 * restructuring. The card root is a single `<button>` wrapping the whole
 * card again (the pre-§C2 shape), since there's no longer a nested
 * interactive element to keep out of its way. The `tel:` affordance still
 * exists, but ONLY inside `CustomerDetailSheet`'s dedicated phone row.
 */
export interface RentalCardProps {
  customerName: string;
  status: RentalStatus;
  folio: string;
  onClick: () => void;
  cardClassName?: string;
  phone?: string;
  amount?: ReactNode;
  itemTypeIcon?: ReactNode;
  isStale?: boolean;
  children?: ReactNode;
}

export function RentalCard({
  customerName,
  status,
  folio,
  onClick,
  cardClassName,
  phone,
  amount,
  itemTypeIcon,
  isStale,
  children,
}: RentalCardProps) {
  return (
    <button type="button" className="w-full text-left" onClick={onClick}>
      <Card className={cn("gap-1.5 py-3", cardClassName)}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{customerName}</CardTitle>
            <RentalStatusBadge status={status} isStale={isStale} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1">
              {itemTypeIcon ?? <Tag aria-hidden="true" className="size-3" />}
              {folio}
            </span>
            {phone && (
              <span className="flex items-center gap-1">
                <Phone aria-hidden="true" className="size-3" />
                {phone}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {children}
            </div>
            {amount != null && (
              <span className="text-[17px] font-bold text-primary">
                {amount}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
