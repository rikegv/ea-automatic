import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { asEtapasFunil, motivosDescarte } from "../db/schema";
import { EtapasFunilController } from "./etapas/etapas-funil.controller";

/**
 * ─ AS DUAS MARCAS NOVAS SÃO DE CATÁLOGO, E NASCEM NO LADO SEGURO (Frente E) ─────────────────────
 *
 * ┌─ O QUE ESTE ARQUIVO GUARDA, E POR QUE NÃO DÁ PARA GUARDAR ISSO NO SERVICE ───────────────────┐
 * │ Duas perguntas de COMPORTAMENTO viraram FLAG em tabela que o diretor edita:                   │
 * │   . "nesta etapa se marca entrevista?"  -> `as_etapas_funil.tem_entrevista`                   │
 * │   . "este motivo pede a pretensão?"     -> `motivos_descarte.pede_pretensao`                  │
 * │ A propriedade que importa é a mesma dos flags que a 0102 e a 0130 criaram: elas NASCEM        │
 * │ `false`, e o comportamento que dependem delas é FAIL-CLOSED sobre o conjunto vazio. Um        │
 * │ default `true` (ou uma semente distraída) faria o sistema coletar dado financeiro de pessoa   │
 * │ por omissão de quem cadastrou a linha, que é o oposto da minimização (§A.6).                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E A SEGUNDA PROPRIEDADE É SOBRE O QUE A MIGRATION **NÃO** SEMEIA ───────────────────────────┐
 * │ `tem_entrevista` é semeada em DUAS etapas (Soulan e Cliente), porque o diretor NOMEOU as     │
 * │ duas. `pede_pretensao` NÃO é semeada em linha nenhuma, porque decidir QUAL motivo significa  │
 * │ "pretensão salarial" é escolha de vocabulário, e vocabulário de desfecho é dele (§A.31).     │
 * │ Semear um motivo aqui seria a fábrica inventando a lista, que é o que a OST proíbe.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: flags de catálogo. Nenhum dado pessoal atravessa este arquivo.
 */

const MIGRATION = readFileSync(
  join(__dirname, "..", "..", "drizzle", "0131_as_frente_e.sql"),
  "utf8",
);

function coluna(tabela: unknown, nome: string) {
  return getTableConfig(tabela as never).columns.find((c) => c.name === nome);
}

describe("1. as marcas existem no schema e nascem no lado seguro", () => {
  it.each([
    ["as_etapas_funil", asEtapasFunil, "tem_entrevista"],
    ["motivos_descarte", motivosDescarte, "pede_pretensao"],
  ])("%s.%s é booleano NOT NULL com default false", (_nome, tabela, nomeDaColuna) => {
    const c = coluna(tabela, nomeDaColuna as string);
    expect(c, "a coluna precisa existir no schema").toBeDefined();
    expect(c!.notNull, "nulo aqui seria um terceiro estado sem significado").toBe(true);
    expect(c!.default, "o lado seguro é `false`: nada é pedido até alguém marcar").toBe(false);
  });
});

describe("2. a semente: duas etapas de entrevista, ZERO motivos de pretensão", () => {
  /**
   * AS DUAS ETAPAS, E NÃO UMA. A OST manda considerar que pode haver entrevista TAMBÉM na etapa
   * Cliente, e a semente é onde essa frase vira produto. Semear só a Soulan deixaria o caso que a
   * OST nomeia fora do ar até alguém abrir a tela de etapas.
   */
  it("a migration marca `ENTREVISTA_SOULAN` e `ENTREVISTA_CLIENTE`", () => {
    expect(MIGRATION).toMatch(/tem_entrevista"?\s*=\s*true/i);
    expect(MIGRATION).toContain("ENTREVISTA_SOULAN");
    expect(MIGRATION).toContain("ENTREVISTA_CLIENTE");
  });

  /**
   * ─ E A MARCA É FEITA PELO `codigo`, NUNCA PELO `rotulo` ─────────────────────────────────────
   *
   * O código é a identidade IMUTÁVEL da etapa (a 0100 diz isso); o rótulo é editável pelo diretor.
   * Uma semente por rótulo erraria o alvo em toda base em que alguém já tivesse renomeado a etapa,
   * e erraria em silêncio: o `UPDATE` casaria zero linhas e ninguém ficaria sabendo.
   */
  it("a marca da etapa é feita por `codigo`, e não por `rotulo`", () => {
    const linhaDaSemente = MIGRATION.split("\n").find((l) => /tem_entrevista"?\s*=\s*true/i.test(l) || /SET "tem_entrevista"/i.test(l));
    expect(linhaDaSemente).toBeDefined();
    const bloco = MIGRATION.slice(MIGRATION.indexOf('SET "tem_entrevista"'));
    expect(bloco.slice(0, 300)).toMatch(/"codigo"\s+IN/i);
    expect(bloco.slice(0, 300)).not.toMatch(/"rotulo"/i);
  });

  /**
   * NENHUM MOTIVO NASCE MARCADO (§A.31). Este caso é sobre a AUSÊNCIA de uma linha, que é o tipo
   * de coisa que some de uma revisão sem ninguém notar: alguém "ajuda" a frente semeando um
   * "Pretensão Salarial", e a fábrica passa a ter decidido o vocabulário do diretor.
   */
  it("a migration NÃO semeia nenhum motivo marcado", () => {
    expect(MIGRATION).not.toMatch(/pede_pretensao"?\s*=\s*true/i);
    expect(MIGRATION).not.toMatch(/INSERT INTO "motivos_descarte"/i);
  });
});

describe("3. a rota que a tela usa para saber onde cabe entrevista", () => {
  /**
   * ─ POR QUE UMA ROTA PRÓPRIA, E NÃO UM CAMPO NO `GET /as/etapas` ──────────────────────────────
   *
   * O payload daquela rota é CONGELADO em sete campos por um teste que existe para pegar o campo a
   * mais (`etapas-funil.leitura-sem-contagem.spec.ts`), e ele está certo: a rota é aberta a todo
   * autenticado. Acrescentar o flag lá derrubaria aquele teste com razão. A rota nova devolve só os
   * CÓDIGOS, que é recorte menor e explícito.
   */
  it("a `EtapasFunilController` expõe a lista de etapas com entrevista", () => {
    const proto = EtapasFunilController.prototype as unknown as Record<string, unknown>;
    expect(typeof proto.comEntrevista).toBe("function");
  });

  it("ela devolve só os códigos, e nada do catálogo além disso", async () => {
    const etapas = {
      codigosComEntrevista: async () => new Set(["ENTREVISTA_SOULAN", "ENTREVISTA_CLIENTE"]),
    };
    const controller = new EtapasFunilController(etapas as never);

    const resposta = await controller.comEntrevista();

    expect(resposta).toEqual(["ENTREVISTA_SOULAN", "ENTREVISTA_CLIENTE"]);
    // ARRAY DE STRING, e não de objeto: é o que impede o rótulo, a ordem e a contagem de entrarem
    // de carona numa rota aberta, que é o defeito que a rota vizinha já pagou.
    for (const item of resposta) expect(typeof item).toBe("string");
  });
});
