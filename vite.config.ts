import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

function buildInfo() {
  const root = dirname(fileURLToPath(import.meta.url));
  let version = "0.0.0";
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8")) as { version?: string };
    version = pkg.version ?? version;
  } catch {
    // ignore
  }
  let sha = "dev";
  try {
    sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || sha;
  } catch {
    // ignore
  }
  return { version, sha };
}

const info = buildInfo();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(info.version),
    __APP_COMMIT__: JSON.stringify(info.sha),
  },
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

