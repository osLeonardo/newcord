import js from "@eslint/js";
import prettierCompatibility from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["**/out/", "**/dist/", "**/coverage/"]),
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
  { files: ["**/*.tsx"], extends: [reactHooks.configs.flat.recommended] },
  prettierCompatibility,
);
