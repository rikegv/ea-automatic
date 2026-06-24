import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "apps/ai-service/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Arquivos de configuração rodam em Node — exponha os globals correspondentes.
    files: ["**/*.config.{js,cjs,mjs,ts}"],
    languageOptions: {
      globals: {
        process: "readonly",
        module: "writable",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
  {
    // TS/TSX: o próprio compilador resolve identificadores; no-undef gera falso-positivo
    // para globais de browser/node (window, fetch, console, ...). Prática do typescript-eslint.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
