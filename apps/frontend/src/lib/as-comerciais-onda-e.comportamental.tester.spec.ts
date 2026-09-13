import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ─ O GERENCIADOR DE COMERCIAIS: A TELA NÃO PODE MOSTRAR O QUE O SERVIDOR NÃO MANDA ─────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester`. Este arquivo nasceu de um DEFEITO MEDIDO,
 * e não de uma suposição.
 *
 * ┌─ O DEFEITO, E POR QUE O TYPECHECK NÃO O PEGA ───────────────────────────────────────────────┐
 * │ `as_comerciais` NÃO TEM a coluna `codigo` (achado da auditoria: código imutável derivado de  │
 * │ nome de pessoa é irretificável, e a LGPD dá direito à retificação). O serviço, coerente com  │
 * │ isso, seleciona `id, rotulo, ordem, ativo` e MAIS NADA.                                       │
 * │                                                                                              │
 * │ O CONTRATO COMPARTILHADO AINDA PROMETE `codigo`: `AsComercial`, em `packages/shared-types`,  │
 * │ nasceu no molde de `AsLinhaDeServico` e continua declarando `codigo: string`. O backend       │
 * │ contornou por dentro (`AsComercialGravado = Omit<AsComercial, "codigo">`) e deixou escrito    │
 * │ que o DONO do arquivo (o coordenador, §A.39) precisa remover o campo.                        │
 * │                                                                                              │
 * │ ENQUANTO ELE ESTIVER LÁ, a tela pode ler `c.codigo`, COMPILAR, e receber `undefined` em      │
 * │ tempo de execução: coluna em branco em todas as linhas, ordenação por `undefined`, e a frase  │
 * │ do modal de renomear dizendo `Corrigindo o nome de ""`. Nada falha, nada avisa.              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum nome real. A varredura lê marcação de tela.
 */

const PAGINA = new URL("../app/(app)/admin/as/comerciais/page.tsx", import.meta.url).pathname;
const PAGINA_SEGMENTOS = new URL("../app/(app)/admin/as/segmentos/page.tsx", import.meta.url).pathname;

function fonte(caminho = PAGINA): string {
  const cru = readFileSync(caminho, "utf8");
  return cru.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("a tela de comerciais não lê um `codigo` que não existe", () => {
  /**
   * O CAMPO NÃO EXISTE NO PAYLOAD, e ler um campo ausente não dá erro em JavaScript: dá vazio. A
   * varredura é a única forma barata de ver isso enquanto o tipo compartilhado ainda promete o
   * campo, porque é justamente o compilador que está sendo enganado.
   */
  it("nenhuma leitura de `.codigo` de um comercial na página", () => {
    const achados = [...fonte().matchAll(/.{0,70}\b[a-z]\w*\.codigo\b.{0,40}/gi)].map((m) => m[0].trim());
    expect(
      achados,
      "o servidor não manda `codigo` para comercial: o que aparecer na tela vem `undefined`",
    ).toEqual([]);
  });

  it("a tabela não tem coluna de código nem ordena por ela", () => {
    const src = fonte();
    const i = src.indexOf("<thead");
    const head = i < 0 ? "" : src.slice(i, src.indexOf("</thead>", i));
    expect(head, "coluna que nasce vazia em toda linha é pior do que coluna nenhuma").not.toMatch(
      /codigo|Código/i,
    );
    expect(src, "ordenar por um campo ausente ordena por `undefined`").not.toMatch(
      /chave="codigo"/,
    );
  });

  /**
   * O CONTRASTE, e ele prova que a régua é sobre O DADO e não sobre a tela: o SEGMENTO TEM
   * `codigo` (é catálogo de processo, o código é derivado do rótulo e imutável), então a tela dele
   * pode mostrar. Sem este caso, alguém "corrigiria" as duas telas do mesmo jeito.
   */
  it("a tela de SEGMENTOS, essa sim, pode mostrar o código", () => {
    const src = fonte(PAGINA_SEGMENTOS);
    expect(
      /\.codigo\b/.test(src),
      "o segmento tem código imutável e ele é o que fica legível no histórico",
    ).toBe(true);
  });
});

/**
 * ─ O LIMITE, DECLARADO ─────────────────────────────────────────────────────────────────────────
 *
 * A CORREÇÃO DE VERDADE É NO CONTRATO, e ela não é minha: enquanto `AsComercial` declarar
 * `codigo`, qualquer tela futura pode repetir o mesmo erro e compilar. Tirar o campo do
 * `packages/shared-types` é do COORDENADOR (dono único do arquivo, §A.39). Esta varredura defende
 * uma tela; o tipo defende todas.
 */
