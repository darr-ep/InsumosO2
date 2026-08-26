/// <reference types="vite/client" />

// SDD.md §29 — env vars declared in .env.example.
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
