import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";

const rootDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // HTTPS es obligatorio para Web Bluetooth fuera de localhost (secure
    // context) — mismo patrón ya validado contra hardware real en
    // test-impresora/vite.config.ts. Certificado autofirmado: el navegador
    // va a pedir "avanzado > continuar" la primera vez.
    basicSsl(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.png"],
      manifest: {
        name: "Insumos O2",
        short_name: "Insumos O2",
        description: "Control de rentas de concentradores de oxígeno y tanques",
        lang: "es-MX",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0c68c2",
        icons: [
          {
            src: "/logo.png",
            sizes: "554x554",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/logo.png",
            sizes: "554x554",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  server: {
    host: true, // escucha en 0.0.0.0, accesible por IP de LAN/Tailscale
    // El celular solo habla con este origen HTTPS; Vite reenvía /api hacia
    // PocketBase en localhost server-side, así PocketBase no necesita
    // exponerse él mismo ni tener su propio certificado (evita el problema
    // de "mixed content" de pedir HTTP plano desde una página HTTPS).
    proxy: {
      "/api": "http://127.0.0.1:8090",
    },
  },
});
