/**
 * Login screen placeholder (§16.6, CU1). Real implementation (user selector
 * of the 6 fixed business users + password, via
 * `pb.collection('users').authWithPassword(phone, password)`) lands in
 * Phase 1 once `src/data/pocketbaseClient.ts` exists (§14). This Phase 0
 * version only proves the route/screen scaffold is wired end to end.
 */
export function LoginScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <img src="/logo.png" alt="Insumos O2" className="size-20" />
      <h1 className="text-xl font-semibold">Insumos O2</h1>
      <p className="text-sm text-muted-foreground">
        Selección de usuario — próximamente (Fase 1).
      </p>
    </div>
  );
}
