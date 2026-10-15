import js from "@eslint/js";
import prettierCompatibility from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["**/out/", "**/dist/", "**/coverage/"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  security.configs.recommended,
  { files: ["**/*.tsx"], extends: [reactHooks.configs.flat.recommended] },
  prettierCompatibility,
);
