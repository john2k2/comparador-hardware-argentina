import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Proyecto: excluimos artefactos temporales y scripts de debugging/smoke.
    "tmp/**",
    "debug-*.js",
    "test-*.js",
    "test*.mjs",
    "take_screenshots.mjs",
    // E2E tests - usando Playwright, no React
    "e2e/**",
  ]),
]);

export default eslintConfig;
