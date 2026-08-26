/**
 * "Buscar" placeholder (§7.4, §16.9, CU3). Real content — single search
 * field matching folio/nombre/teléfono — lands in Phase 2. This Phase 0
 * version only proves tab 3 of 3 (§16.5) renders through the app shell.
 */
export function SearchScreen() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Buscar</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Búsqueda por folio, nombre o teléfono — próximamente (Fase 2).
      </p>
    </div>
  );
}
