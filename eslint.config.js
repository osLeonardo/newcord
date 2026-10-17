import js from "@eslint/js";
import prettierCompatibility from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/out/",
    "**/dist/",
    "**/coverage/",
    "packages/mls/pkg/",
    "packages/mls/target/",
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["vitest.config.ts"],
          defaultProject: "tsconfig.base.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/explicit-function-return-type": "error" },
  },
  security.configs.recommended,
  {
    // The MLS module holds keys, so it lives only in the main process (D22, #4's spec).
    files: ["apps/desktop/src/preload/**", "apps/desktop/src/renderer/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@newcord/mls",
              message: "The MLS module is for the main process only (D22).",
            },
          ],
        },
      ],
    },
  },
  { files: ["**/*.tsx"], extends: [reactHooks.configs.flat.recommended] },
  prettierCompatibility,
);
