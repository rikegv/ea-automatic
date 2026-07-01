import { defineConfig } from "vitest/config";

/**
 * Testes do frontend. JSX no runtime automático (react/jsx-runtime) — igual ao Next, sem exigir
 * `import React` nos componentes. O environment (happy-dom) é definido por arquivo, via docblock
 * `// @vitest-environment happy-dom`, para não afetar os testes de função pura (que rodam em node).
 */
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
});
