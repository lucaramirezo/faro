import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx", "app/**/*.test.ts?(x)"],
    exclude: ["node_modules", ".next", "_archive"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
});
