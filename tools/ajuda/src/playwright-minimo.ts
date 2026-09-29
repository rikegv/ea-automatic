/**
 * ─ O PEDAÇO DO PLAYWRIGHT QUE ESTE MOTOR USA, TIPADO À MÃO ─────────────────────────────────────
 *
 * O Playwright NÃO é dependência do monorepo: ele vive no arnês visual da fábrica, fora da árvore
 * (`/home/henrique/.npm/_npx/...`), e é carregado por import dinâmico. Trazê-lo para o
 * `package.json` puxaria os navegadores para o `pnpm install` de todo mundo para servir a um comando
 * que só o `devops` roda.
 *
 * A consequência é que o typecheck não enxerga os tipos da biblioteca, e a resposta NÃO é `any`
 * espalhado: é esta superfície mínima, estrutural, com exatamente o que o motor chama. Se um dia a
 * API mudar, o erro aparece aqui, num arquivo, em vez de espalhado pelo motor.
 */

export type Caixa = { x: number; y: number; width: number; height: number };

export type Localizador = {
  first(): Localizador;
  boundingBox(): Promise<Caixa | null>;
  isVisible(): Promise<boolean>;
  count(): Promise<number>;
  click(opcoes?: { force?: boolean; timeout?: number }): Promise<void>;
  fill(valor: string, opcoes?: { timeout?: number }): Promise<void>;
  /**
   * O gesto `subirArquivo`. O caminho é SEMPRE resolvido por `caminhoDoArquivoDePreparo`, que recusa
   * qualquer coisa fora da pasta dos arquivos sintéticos versionados (§A.6).
   */
  setInputFiles(caminho: string, opcoes?: { timeout?: number }): Promise<void>;
  scrollIntoViewIfNeeded(opcoes?: { timeout?: number }): Promise<void>;
  /** Roda no navegador COM O ELEMENTO em mão. É assim que o gate audita só a caixa recortada. */
  evaluate<R, A>(fn: (el: Element, arg: A) => R, arg: A): Promise<R>;
};

export type Pagina = {
  goto(url: string, opcoes?: { waitUntil?: "load" | "domcontentloaded" | "networkidle" }): Promise<unknown>;
  url(): string;
  locator(seletor: string): Localizador;
  getByRole(papel: string, opcoes?: { name?: string | RegExp }): Localizador;
  getByPlaceholder(texto: string | RegExp): Localizador;
  waitForTimeout(ms: number): Promise<void>;
  waitForURL(predicado: (u: URL) => boolean, opcoes?: { timeout?: number }): Promise<void>;
  keyboard: { press(tecla: string): Promise<void> };
  addStyleTag(opcoes: { content: string }): Promise<unknown>;
  addInitScript(script: string): Promise<void>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  /** A forma de EXPRESSÃO (string). Usada só pelo remendo do `__name`, ver `shim-name.ts`. */
  evaluate<R>(expressao: string): Promise<R>;
  /** `clip` é o recorte (§A.6): tela que mostra gente vira imagem só no controle que o passo ensina. */
  screenshot(opcoes?: {
    path?: string;
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
  }): Promise<Buffer>;
};

export type Contexto = {
  newPage(): Promise<Pagina>;
};

export type Navegador = {
  newContext(opcoes?: {
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
    colorScheme?: "light" | "dark";
    reducedMotion?: "reduce" | "no-preference";
    locale?: string;
  }): Promise<Contexto>;
  close(): Promise<void>;
};

export type Chromium = {
  launch(opcoes?: { args?: string[] }): Promise<Navegador>;
};
