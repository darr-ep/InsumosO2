/// <reference types="vite/client" />

// SDD.md §29 — env vars declared in .env.example.
interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL: string;
  readonly VITE_BUSINESS_NAME: string;
  readonly VITE_BUSINESS_PHONE: string;
  readonly VITE_BUSINESS_LOGO_URL: string;
  readonly VITE_STALE_RENTAL_DAYS: string;
  // Redesign Round 2, Batch 4 (Dashboard Restructure): total configured
  // stock, same fixed-env-var pattern as VITE_STALE_RENTAL_DAYS (Anexo A.3
  // precedent) — not an inventory module, just two numbers the owner sets
  // once. See domain/rentals/availability.ts.
  readonly VITE_TOTAL_CONCENTRADORES: string;
  readonly VITE_TOTAL_TANQUES: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
