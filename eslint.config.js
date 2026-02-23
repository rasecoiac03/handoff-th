import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default defineConfig(
  {
    ignores: ["dist/", "node_modules/", "coverage/", "prisma/migrations/"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "prisma/seed.ts"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["tests/*.ts", "prisma/seed.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
