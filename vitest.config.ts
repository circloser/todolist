import { defineConfig } from "vitest/config";

// Standalone test config so unit tests don't load the app's vite.config.ts
// (which pulls in the Cloudflare/vinext plugins and hosting.json).
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist", ".next"],
  },
});
