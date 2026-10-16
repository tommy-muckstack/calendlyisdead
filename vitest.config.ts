import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ resolve: { alias: { "@": path.resolve(__dirname) } }, oxc: { jsx: { runtime: "automatic" } }, test: { testTimeout: 30_000, hookTimeout: 120_000 } });
