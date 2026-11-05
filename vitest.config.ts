import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    coverage: {
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/app/favicon.ico",
        "src/app/globals.css",
        "src/test/**",
      ],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // The full-workspace integration tests render the entire editor and
    // take ~5-7s each even in isolation, so the 5s default failed them
    // spuriously (and far more often when the whole suite runs in parallel).
    // A real hang still fails, just later.
    testTimeout: 30_000,
  },
});
