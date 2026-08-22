import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({ plugins: [react()], test: { environment: "jsdom", globals: true, exclude: ["node_modules", "tests/e2e/**"] }, resolve: { alias: { "@": path.resolve(__dirname, ".") } } });
