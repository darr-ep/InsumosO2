/**
 * "Nueva renta" placeholder (§7.1, §16.7, CU4). Real content — single-screen
 * flow (cliente → productos → cantidad → renta → depósito → otros →
 * confirmar) — lands in Phase 1. This Phase 0 version only proves tab 2 of 3
 * (§16.5) renders through the app shell.
 */
export function RentalNewScreen() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Nueva renta</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Formulario de nueva renta — próximamente (Fase 1).
      </p>
    </div>
  );
}
