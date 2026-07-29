import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    ".build-tools/**",
    ".electron-cache/**",
    ".superpowers/**",
    ".tmp/**",
    ".worktrees/**",
    "build/**",
    "data/**",
    "electron/dist-electron/**",
    "node_modules/**",
    "public/**",
    "release*/**",
    "resources/**",
    "scripts/**/*.cjs",
    "superpowers-main/**",
    "tools/**",
    "一键分发源码/**",
    "**/*.min.js",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["tests/**/*.{ts,mjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
])
