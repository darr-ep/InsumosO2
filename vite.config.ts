import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

const rootDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
});
