// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { EstadoDaCasa } from "./portal-trilha";
import * as PaginaPortal from "@/app/portal/page";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), escrito A PARTIR DO REQUISITO da REPAGINAÇÃO do Portal.
 *
 * O QUE ESTE ARQUIVO TRAVA: os OITO estados de casa da trilha renderizam com o RÓTULO e a COR
 * certos, e o `AGUARDANDO_VALIDACAO` é VERMELHO com "Aguardando Sua Validação". A repaginação troca
 * a PELE (paleta Soulan, tokens `portal-*`), então a régua aqui é PROPOSITALMENTE robusta à troca de
 * paleta: os rótulos são conferidos por texto, mas as cores por FAMÍLIA (vermelho x verde), nunca
 * por hex cravado, que a adoção da paleta pode legitimamente mudar. O que NÃO pode mudar é a
 * SEMÂNTICA: o estado que espera a ação do candidato salta em vermelho, o pronto fica verde, e
 * nenhum rótulo cai vazio nem ganha travessão.
 *
 * OS OITO ESTADOS (contrato de tela `EstadoDaCasa`): os seis do servidor (`ESTADOS_PASSO_PORTAL`:
 * ACEITO, EM_ANALISE, AGUARDANDO_VALIDACAO, AJUSTAR, NO_TIME, PENDENTE) mais os dois que são só da
 * tela (ATUAL, PULADO). A derivação `estado do servidor -> casa` já é travada em
 * `portal-trilha.comportamental.tester.spec.ts`; ESTE arquivo trava a PINTURA (rótulo + cor).
 *
 * FONTE ÚNICA: a tela pinta a casa a partir do mapa `PINTURA` (o mesmo objeto que o JSX consome).
 * Para o mapa ser afirmável sem renderizar a página inteira, ele precisa ser EXPORTADO de
 * `app/portal/page.tsx` (hoje vive lá, `const PINTURA`, e basta o prefixo `export`). Sem o export o
 * primeiro caso falha com a instrução, e isso é o §A.40: o teste diz o que a repaginação tem de
 * deixar afirmável. Duplicar o mapa aqui seria a segunda verdade que o resto do Portal evita.
 *
 * §A.6: nada de dado pessoal, só rótulo de catálogo e cor. §A.11: nenhum travessão nos rótulos.
 */

const TRAVESSAO = String.fromCharCode(0x2014);

interface Pintura {
  cor: string;
  fundo: string;
  rotulo: string;
}

// Lê o mapa exportado pela página. Sem export, `PINTURA` é undefined e o primeiro teste falha
// dizendo o que fazer, em vez de estourar no topo do arquivo.
const PINTURA = (PaginaPortal as unknown as { PINTURA?: Record<EstadoDaCasa, Pintura> }).PINTURA;

const OITO_ESTADOS: EstadoDaCasa[] = [
  "ACEITO",
  "EM_ANALISE",
  "AGUARDANDO_VALIDACAO",
  "AJUSTAR",
  "ATUAL",
  "PULADO",
  "NO_TIME",
  "PENDENTE",
];

function rgb(hex: string): { r: number; g: number; b: number } | null {
  const s = hex.trim().replace(/^#/, "");
  const cheio = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  if (!/^[0-9a-fA-F]{6}$/.test(cheio)) return null;
  return {
    r: parseInt(cheio.slice(0, 2), 16),
    g: parseInt(cheio.slice(2, 4), 16),
    b: parseInt(cheio.slice(4, 6), 16),
  };
}

/** Vermelho de verdade: o canal R domina os outros dois com folga (coral ou vermelho, os dois passam). */
function ehVermelho(hex: string): boolean {
  const c = rgb(hex);
  return c !== null && c.r > c.g + 50 && c.r > c.b + 50;
}

/** Verde de verdade: o canal G é o dominante. */
function ehVerde(hex: string): boolean {
  const c = rgb(hex);
  return c !== null && c.g > c.r && c.g >= c.b;
}

describe("A PINTURA é uma fonte única e exportável (não uma segunda verdade no teste)", () => {
  it("o mapa PINTURA é exportado de app/portal/page.tsx", () => {
    expect(
      PINTURA,
      "PINTURA precisa ser EXPORTADO de app/portal/page.tsx (prefixe a const com `export`) para os 8 estados serem afirmáveis sem renderizar a página inteira.",
    ).toBeTruthy();
  });
});

describe("os OITO estados de casa têm pintura, e cada um a sua", () => {
  it("os oito estados estão no mapa, nenhum a mais, nenhum a menos", () => {
    if (!PINTURA) return; // o caso acima já reportou a ausência do export
    expect([...Object.keys(PINTURA)].sort()).toEqual([...OITO_ESTADOS].sort());
  });

  it("todo estado tem rótulo não vazio, cor e fundo em hex", () => {
    if (!PINTURA) return;
    for (const estado of OITO_ESTADOS) {
      const p = PINTURA[estado];
      expect(p, `estado ${estado} sem pintura`).toBeTruthy();
      expect(p.rotulo.trim().length, `${estado} com rótulo vazio`).toBeGreaterThan(0);
      expect(rgb(p.cor), `${estado} com cor inválida (${p.cor})`).not.toBeNull();
      expect(rgb(p.fundo), `${estado} com fundo inválido (${p.fundo})`).not.toBeNull();
    }
  });

  it("§A.11: nenhum rótulo de estado usa travessão", () => {
    if (!PINTURA) return;
    for (const estado of OITO_ESTADOS) {
      expect(PINTURA[estado].rotulo, `${estado} com travessão`).not.toContain(TRAVESSAO);
    }
  });

  it("§A.24: cada rótulo é etiqueta em Title Case (primeira letra maiúscula)", () => {
    if (!PINTURA) return;
    for (const estado of OITO_ESTADOS) {
      const primeira = PINTURA[estado].rotulo.trim().charAt(0);
      expect(primeira, `${estado} não começa em maiúscula`).toBe(primeira.toUpperCase());
    }
  });

  it("os rótulos são DISTINTOS: um estado não se disfarça de outro", () => {
    if (!PINTURA) return;
    const rotulos = OITO_ESTADOS.map((e) => PINTURA[e].rotulo);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});

describe("REQUISITO EXPLÍCITO: AGUARDANDO_VALIDACAO é VERMELHO com 'Aguardando Sua Validação'", () => {
  it("o rótulo é exatamente 'Aguardando Sua Validação'", () => {
    if (!PINTURA) return;
    expect(PINTURA.AGUARDANDO_VALIDACAO.rotulo).toBe("Aguardando Sua Validação");
  });

  it("a cor é da família VERMELHA, não verde nem cinza: é a ação do candidato que falta", () => {
    if (!PINTURA) return;
    const cor = PINTURA.AGUARDANDO_VALIDACAO.cor;
    expect(ehVermelho(cor), `AGUARDANDO_VALIDACAO deveria ser vermelho, veio ${cor}`).toBe(true);
    expect(ehVerde(cor)).toBe(false);
  });

  it("não se confunde com o ACEITO (verde) nem com o PENDENTE: cores diferentes", () => {
    if (!PINTURA) return;
    expect(PINTURA.AGUARDANDO_VALIDACAO.cor).not.toBe(PINTURA.ACEITO.cor);
    expect(PINTURA.AGUARDANDO_VALIDACAO.cor).not.toBe(PINTURA.PENDENTE.cor);
  });
});

describe("as âncoras semânticas de cor que a repaginação não pode inverter", () => {
  it("ACEITO é da família VERDE: documento pronto", () => {
    if (!PINTURA) return;
    expect(ehVerde(PINTURA.ACEITO.cor), `ACEITO deveria ser verde, veio ${PINTURA.ACEITO.cor}`).toBe(
      true,
    );
  });

  it("AJUSTAR e AGUARDANDO_VALIDACAO não são verdes: ambos pedem algo do candidato", () => {
    if (!PINTURA) return;
    expect(ehVerde(PINTURA.AJUSTAR.cor)).toBe(false);
    expect(ehVerde(PINTURA.AGUARDANDO_VALIDACAO.cor)).toBe(false);
  });
});
