import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: [".chrome-profile/"] },
  {
    files: ["src/**/*.ts"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: { parserOptions: { projectService: true } },
    rules: { "@typescript-eslint/no-non-null-assertion": "error" },
  },
  prettier,
);
