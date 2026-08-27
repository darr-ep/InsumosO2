import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * SDD.md §17 ("RentalCard (folio, cliente, estado, tiempo transcurrido)").
 *
 * Gap-fill finding 5 (pure structural refactor, no behavior change):
 * `DashboardScreen` (active + "requiere revisión" sections) and
 * `SearchScreen` each inlined an identical `Card`/`CardHeader`/
 * `CardContent` clickable-rental block instead of sharing one named
 * component, drifting from §17's own component inventory. The 3 real
 * usages differ only in their `CardContent` children and (for the stale
 * "requiere revisión" variant) the outer `Card`'s border color and the
 * content wrapper's className — both exposed here as optional overrides
 * so every existing usage renders byte-identical markup to before this
 * extraction.
 */
export interface RentalCardProps {
  customerName: string;
  onClick: () => void;
  cardClassName?: string;
  contentClassName?: string;
  children: ReactNode;
}

export function RentalCard({
  customerName,
  onClick,
  cardClassName,
  contentClassName = "flex flex-col gap-1 text-sm text-muted-foreground",
  children,
}: RentalCardProps) {
  return (
    <button type="button" className="w-full text-left" onClick={onClick}>
      <Card className={cardClassName}>
        <CardHeader>
          <CardTitle>{customerName}</CardTitle>
        </CardHeader>
        <CardContent className={contentClassName}>{children}</CardContent>
      </Card>
    </button>
  );
}
