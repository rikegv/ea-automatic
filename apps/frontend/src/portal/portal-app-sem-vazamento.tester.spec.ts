import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A TRAVA DO APP PROPRIO DO PORTAL (§A.33: trava em TESTE, nao em lembranca).
 *
 * O `apps/portal-app/` e um build Next enxuto que serve SO a tela do candidato (/portal). Ele
 * conserta POR CONSTRUCAO o vazamento do EA: como so compila a rota do candidato e so reescreve as
 * rotas @Public do Portal, nenhum chunk das rotas (app)/* do EA e nenhuma rota sensivel nasce ali.
 *
 * O RISCO QUE ESTA TRAVA PEGA, e as tres formas regridem EM SILENCIO (gate verde sobre premissa
 * errada, a classe de defeito que ja mordeu esta casa):
 *   (a) uma rota nova sob `apps/portal-app/app/` que nao seja do portal (ex.: app/esteira/page.tsx);
 *   (b) um rewrite alargado (curinga `/api/:path*`, ou uma rota fora das 11 @Public, ou /api/auth);
 *   (c) a reintroducao do `basePath=/portal` como DEFAULT, que quebra o logo (/portal/portal/*=404).
 *
 * Este spec roda no gate ATUAL do frontend (vitest run em apps/frontend) e so LE os arquivos do
 * `apps/portal-app/` por caminho (ele NAO entra no pnpm-workspace; o frontend decidiu que nao).
 * Espelha o padrao da casa (apps/frontend/src/lib/api-prefixo.spec.ts): varredura de fonte por fs,
 * barata, deterministica e impossivel de esquecer.
 */

// apps/frontend/src/portal/ -> ../../../portal-app/ = apps/portal-app/
const PORTAL_APP = new URL("../../../portal-app/", import.meta.url).pathname;
const CONFIG = join(PORTAL_APP, "next.config.mjs");
const APP_DIR = join(PORTAL_APP, "app");
const NEXT_DIR = join(PORTAL_APP, ".next");

// A lista FECHADA das 11 rotas @Public do Portal do candidato (derivada dos controllers @Public()
// em apps/backend/src/portal/*.controller.ts). Qualquer source de rewrite fora desta lista e vazamento.
const ROTAS_PUBLICAS = [
  "identificar",
  "recuperacao",
  "credencial",
  "confirmar",
  "termo",
  "dados-gi",
  "documentos",
  "vt-link",
  "acesso-email/solicitar",
  "acesso-email/confirmar",
  "acesso-email/identidade",
];

// Segmentos de rota do EA que JAMAIS podem aparecer no app proprio (nem em app/, nem em rewrite).
const SEGMENTOS_PROIBIDOS = [
  "gerenciador",
  "esteira",
  "admin",
  "ajuda",
  "nao-conformidades",
  "analise",
  "dashboard",
  "login",
  "auth",
  "links",
];

// --- PREDICADOS PUROS (testados contra entradas sinteticas no bloco "a trava morde") ---

/** Extrai o bloco da funcao `async rewrites()` ate o inicio de `async headers()`. */
function blocoRewrites(configText: string): string {
  const ini = configText.indexOf("async rewrites()");
  const fim = configText.indexOf("async headers()");
  if (ini < 0) return "";
  return configText.slice(ini, fim < 0 ? configText.length : fim);
}

/** Extrai as strings entre `const rotasPublicasDoPortal = [` e o `];` que o fecha. */
function rotasDoConfig(configText: string): string[] {
  const marca = "const rotasPublicasDoPortal = [";
  const ini = configText.indexOf(marca);
  if (ini < 0) return [];
  const fim = configText.indexOf("];", ini);
  const corpo = configText.slice(ini + marca.length, fim < 0 ? configText.length : fim);
  return [...corpo.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

/** True quando um texto de rewrites tem curinga (`:path` ou `*`), o alargamento proibido. */
function temCuringa(textoRewrites: string): boolean {
  return textoRewrites.includes(":path") || textoRewrites.includes("*");
}

/** Lista recursiva de arquivos de um diretorio, com caminho relativo a ele. */
function arquivosRelativos(dir: string, base = dir): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      achados.push(...arquivosRelativos(caminho, base));
    } else {
      achados.push(caminho.slice(base.length + 1));
    }
  }
  return achados;
}

describe("app proprio do Portal: a trava anti-vazamento (§A.33)", () => {
  // === 1. REWRITES SEM CURINGA E SO @Public (nivel fonte, sempre roda) ===
  it("1. rewrites sao nominais: so as 11 @Public, sem curinga, sem /api/auth nem links", () => {
    const configText = readFileSync(CONFIG, "utf8");

    // 1a. A allowlist do config e EXATAMENTE a lista fechada das 11 @Public, nem mais nem menos.
    const rotas = rotasDoConfig(configText);
    expect(rotas.slice().sort()).toEqual(ROTAS_PUBLICAS.slice().sort());

    // 1b. O bloco rewrites() nao tem curinga (`:path`/`*`). Se alguem alargar, QUEBRA aqui.
    const bloco = blocoRewrites(configText);
    expect(bloco.length, "bloco async rewrites() nao encontrado").toBeGreaterThan(0);
    expect(temCuringa(bloco), `curinga no rewrites():\n${bloco}`).toBe(false);

    // 1c. O source de cada rewrite casa /api/portal/<rota> e nada mais (sem /api/auth, sem links).
    for (const rota of rotas) {
      expect(SEGMENTOS_PROIBIDOS.some((s) => rota.split("/")[0] === s), `rota proibida: ${rota}`).toBe(
        false,
      );
    }
    expect(bloco.includes("/api/auth"), "rewrite para /api/auth").toBe(false);
    // O template nominal exato que prova que o source e montado por rota, nao por curinga.
    expect(bloco).toContain("source: `/api/portal/${rota}`");
  });

  // === 2. ESTRUTURA DE ROTAS FECHADA (nivel fonte, sempre roda) ===
  it("2. app/ tem SO os arquivos do portal: sem grupo (app) e sem rota do EA", () => {
    const arquivos = arquivosRelativos(APP_DIR).map((p) => p.replace(/\\/g, "/"));

    // 2a. Conjunto EXATO: layout raiz + a tela do candidato. Rota nova sob app/ QUEBRA aqui.
    expect(arquivos.slice().sort()).toEqual(
      ["layout.tsx", "portal/layout.tsx", "portal/page.tsx"].slice().sort(),
    );

    // 2b. Nenhum grupo de rota `(app)` e nenhum segmento do EA (mensagem de falha clara).
    for (const arq of arquivos) {
      expect(arq.includes("("), `grupo de rota proibido em app/: ${arq}`).toBe(false);
      const segmentos = arq.split("/");
      for (const proibido of SEGMENTOS_PROIBIDOS) {
        expect(segmentos.includes(proibido), `rota do EA em app/: ${arq}`).toBe(false);
      }
    }
  });

  // === 3. BASEPATH DEFAULT VAZIO (nivel fonte, sempre roda) ===
  it("3. o default do basePath e vazio, nao /portal (o logo nao regride)", () => {
    const configText = readFileSync(CONFIG, "utf8");
    // Default vazio: `process.env.PORTAL_BASE_PATH ?? ""`. Qualquer default nao-vazio QUEBRA.
    expect(configText).toMatch(/PORTAL_BASE_PATH\s*\?\?\s*""/);
    expect(configText).not.toMatch(/PORTAL_BASE_PATH\s*\?\?\s*"\/portal"/);
    expect(configText).not.toMatch(/PORTAL_BASE_PATH\s*\?\?\s*"\/[^"]+"/);
  });

  // === 4 e 5. ARTEFATO DO BUILD (so quando .next existe; pulado em CI sem build) ===
  const temBuild = existsSync(NEXT_DIR);
  const quandoTemBuild = temBuild ? it : it.skip;

  quandoTemBuild("4. o build nao carrega rota (app)/* nem o chunk 3708 do menu restrito", () => {
    const manifest = JSON.parse(readFileSync(join(NEXT_DIR, "app-build-manifest.json"), "utf8"));
    for (const chave of Object.keys(manifest.pages ?? {})) {
      expect(chave.includes("(app)"), `rota (app)/* no build: ${chave}`).toBe(false);
      for (const proibido of SEGMENTOS_PROIBIDOS) {
        expect(chave.split("/").includes(proibido), `rota do EA no build: ${chave}`).toBe(false);
      }
    }
    const estaticos = arquivosRelativos(join(NEXT_DIR, "static")).map((p) => p.replace(/\\/g, "/"));
    const vazou = estaticos.filter((f) => f.includes("3708"));
    expect(vazou, `chunk 3708 (texto de menu restrito) no build:\n${vazou.join("\n")}`).toEqual([]);
  });

  quandoTemBuild("5. routes-manifest: rewrites sem curinga, igual a assercao 1", () => {
    const manifest = JSON.parse(readFileSync(join(NEXT_DIR, "routes-manifest.json"), "utf8"));
    const sources: string[] = (manifest.rewrites ?? []).map((r: { source: string }) => r.source);
    for (const source of sources) {
      expect(temCuringa(source), `curinga no rewrite do artefato: ${source}`).toBe(false);
      expect(source.startsWith("/api/portal/"), `rewrite fora de /api/portal: ${source}`).toBe(true);
      const rota = source.replace("/api/portal/", "");
      expect(ROTAS_PUBLICAS.includes(rota), `rota fora da lista @Public: ${source}`).toBe(true);
    }
    expect(sources.length).toBe(ROTAS_PUBLICAS.length);
  });

  // === A TRAVA MORDE: prova permanente de que os predicados pegam a regressao (padrao da casa,
  // espelhando api-prefixo.spec "o padrao pega a linha que causou o defeito") ===
  describe("a trava morde: os predicados detectam cada regressao", () => {
    it("curinga /api/:path* e detectado; o rewrite nominal passa", () => {
      expect(temCuringa('source: `/api/:path*`')).toBe(true);
      expect(temCuringa('source: `/api/portal/*`')).toBe(true);
      expect(temCuringa("source: `/api/portal/${rota}`")).toBe(false);
    });

    it("rota do EA sob app/ seria rejeitada pela lista fechada", () => {
      const comVazamento = ["layout.tsx", "portal/page.tsx", "esteira/page.tsx"].slice().sort();
      const permitido = ["layout.tsx", "portal/layout.tsx", "portal/page.tsx"].slice().sort();
      expect(comVazamento).not.toEqual(permitido);
      expect("esteira/page.tsx".split("/").includes("esteira")).toBe(true);
    });

    it("default /portal do basePath seria pego pela regra de default nao-vazio", () => {
      expect('process.env.PORTAL_BASE_PATH ?? "/portal"').toMatch(/PORTAL_BASE_PATH\s*\?\?\s*"\/[^"]+"/);
      expect('process.env.PORTAL_BASE_PATH ?? ""').not.toMatch(/PORTAL_BASE_PATH\s*\?\?\s*"\/[^"]+"/);
    });

    it("chave (app)/* e chunk 3708 no artefato seriam detectados", () => {
      expect("(app)/esteira/page".includes("(app)")).toBe(true);
      expect("static/chunks/app/3708-abc.js".includes("3708")).toBe(true);
    });
  });
});
