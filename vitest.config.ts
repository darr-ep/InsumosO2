import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Kept separate from vite.config.ts on purpose: build/dev config (Tailwind,
// PWA manifest) and test config are two different concerns, and this is the
// task-0.4 deliverable (install Vitest + Testing Library) layered cleanly on
// top of the task-0.2/0.5 scaffold rather than folded into the same file.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/lib/test-setup.ts"],
      css: true,
    },
  }),
);
