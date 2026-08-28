/// <reference types="vite/client" />

// SDD.md §29 — env vars declared in .env.example.
//
// Feature: Runtime-Editable Total Stock — VITE_TOTAL_CONCENTRADORES/
// VITE_TOTAL_TANQUES (Redesign Round 2, Batch 4) are REMOVED. Total stock
// is no longer a build-time env var; it now lives in PocketBase's
// `business_settings` singleton collection, editable at runtime from the
// Dashboard's tap-to-edit dialog. See `pb_migrations/
// *_business_settings_collection.js` and `src/data/settings.repo.ts`.
interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL: string;
  readonly VITE_BUSINESS_NAME: string;
  readonly VITE_BUSINESS_PHONE: string;
  readonly VITE_BUSINESS_LOGO_URL: string;
  readonly VITE_STALE_RENTAL_DAYS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
