import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export { globals };

/**
 * Shared ESLint flat config for every CampusConnect workspace.
 * TypeScript files are linted with type information from the workspace's tsconfig.json.
 *
 * @param {{ tsconfigRootDir: string }} options `tsconfigRootDir` is the calling workspace's directory (`import.meta.dirname`).
 */
export function createConfig(options) {
  const { tsconfigRootDir } = options;
  return defineConfig(
    globalIgnores([
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/.next/**",
      "**/cdk.out/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/test/fixtures/**",
    ]),
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: "error",
      },
      rules: {
        // Log only through packages/observability, which restricts log fields to an allowlist (25.1).
        "no-console": "error",
        eqeqeq: ["error", "always"],
        "@typescript-eslint/consistent-type-imports": "error",
      },
    },
    {
      // Plain JavaScript (config files) is not part of a TypeScript project.
      files: ["**/*.{js,mjs,cjs}"],
      extends: [tseslint.configs.disableTypeChecked],
    },
    {
      files: ["**/sw.js", "**/service-staff.js", "**/public/sw.js"],
      languageOptions: {
        globals: globals.serviceworker,
      },
    },
  );
}
