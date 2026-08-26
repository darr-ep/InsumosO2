/**
 * Dashboard placeholder (§16.3, §16.6, CU2). Real content — active rental
 * count, active rentals list, "requiere revisión" section — lands in
 * Phase 2 once `rentals.repo.ts` and the domain rules exist. This Phase 0
 * version only proves tab 1 of 3 (§16.5) renders through the app shell.
 */
export function DashboardScreen() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Rentas activas — próximamente (Fase 2).
      </p>
    </div>
  );
}
