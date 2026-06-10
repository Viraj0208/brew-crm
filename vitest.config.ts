import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" path alias so domain modules resolve in tests.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // Unit tests only — pure domain logic, no DB, no jsdom needed.
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
