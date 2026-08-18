import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testes do frontend. JSX no runtime automático (react/jsx-runtime) — igual ao Next, sem exigir
 * `import React` nos componentes. O environment (happy-dom) é definido por arquivo, via docblock
 * `// @vitest-environment happy-dom`, para não afetar os testes de função pura (que rodam em node).
 */
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: [
      /**
       * O MESMO `@/` do `tsconfig` e do Next, que aqui não existia: sem ele, testar um COMPONENTE é
       * impossível (o primeiro import interno dele já não resolve). Os testes de função pura que já
       * existiam importam por caminho relativo e não passam por aqui.
       *
       * O padrão é `^@/` COM a barra, e não `@`: um alias de "@" seco capturaria também
       * `@ea/shared-types`, reescrevendo-o para um caminho dentro de `src` que não existe.
       */
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
    ],
  },
});
