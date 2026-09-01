import type { ReactNode } from "react";
import { Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import type { RentalStatus } from "@/data/rentals.repo";

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
 */
export interface RentalCardProps {
  customerName: string;
  status: RentalStatus;
  folio: string;
  onClick: () => void;
  cardClassName?: string;
  phone?: string;
  itemTypeIcon?: ReactNode;
  children?: ReactNode;
}

export function RentalCard({
  customerName,
  status,
  folio,
  onClick,
  cardClassName,
  phone,
  itemTypeIcon,
  children,
}: RentalCardProps) {
  return (
    <button type="button" className="w-full text-left" onClick={onClick}>
      <Card className={cardClassName}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{customerName}</CardTitle>
            <RentalStatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            {itemTypeIcon}
            <p className="text-sm font-medium text-foreground">
              Folio: {folio}
            </p>
          </div>
          {phone && (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <Phone aria-hidden="true" className="size-3" />
              {phone}
            </p>
          )}
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {children}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
