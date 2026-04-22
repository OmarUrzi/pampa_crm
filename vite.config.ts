import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "server/**",
      "tests-e2e/**",
      "**/tests-e2e/**",
      "dist/**",
      "build/**",
    ],
  },
  server: {
    port: 5173,
  },
});

