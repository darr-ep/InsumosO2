import { useEffect, useState } from "react";
import { pb } from "@/data/pocketbaseClient";

/**
 * SDD.md §14 — Gap-fill fix (found post-Phase-5): `App.tsx` had zero auth
 * check before this. `pb.authStore` already persists the session
 * (localStorage-backed SDK default) — this hook just exposes its `isValid`
 * flag reactively so the route guard and the `/login` redirect-if-already-
 * authenticated behavior update LIVE on login/logout, not only on mount.
 */
export function useIsAuthenticated(): boolean {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => pb.authStore.isValid,
  );

  useEffect(() => {
    return pb.authStore.onChange(() => {
      setIsAuthenticated(pb.authStore.isValid);
    });
  }, []);

  return isAuthenticated;
}
