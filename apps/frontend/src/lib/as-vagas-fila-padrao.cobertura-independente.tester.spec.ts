import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VAGA_STATUS_SEMENTE } from "@ea/shared-types";
import { vagaEmProcesso, vagaEncerrada } from "./as-status-vaga";

/**
 * ─ A VAGA ENTREGUE VOLTA PARA A FILA PADRÃO (cobertura independente, §A.38) ────────────────────
 *
 * ESTE ARQUIVO É DO `tester`. O requisito do diretor tem TRÊS metades, e só duas tinham teste:
 *
 *   1. "a vaga Entregue continua VIVA"      -> `as-vaga-em-processo.spec.ts`, coberto;
 *   2. "ainda pode ser FECHADA ou CANCELADA" -> backend, coberto (e o fechamento a partir da
 *      entrega estava descoberto até `vagas.entrega-viva.cobertura-independente.spec.ts`);
 *   3. "VOLTA PARA A FILA PADRÃO"            -> NÃO TINHA TESTE NENHUM, e é o que se mede aqui.
 *
 * ┌─ POR QUE A TERCEIRA FICOU DE FORA, E POR QUE ISSO É O PROBLEMA ────────────────────────────────┐
 * │ A fila padrão da Central de Vagas é UMA LINHA dentro do `useMemo` de `filtradas`, em           │
 * │ `app/(app)/as/vagas/page.tsx`:                                                                 │
 * │                                                                                                │
 * │     if (setStatus.size === 0 && vagaEncerrada(v.status, catalogoStatus)) return false;          │
 * │                                                                                                │
 * │ Ela não mora em `lib/`, não tem função com nome e não é importada por ninguém, então NENHUMA   │
 * │ spec a alcança. A regra que decide o que o time vê ao abrir a tela é, hoje, a única parte do   │
 * │ recorte que nada afirma.                                                                        │
 * │                                                                                                │
 * │ E O MODO DE FALHA É SILENCIOSO: trocar `vagaEncerrada` por `!vagaEmProcesso` naquela linha      │
 * │ parece a mesma coisa (as duas listas coincidem em três dos seis status da semente), deixa a    │
 * │ suíte inteira verde, e ESCONDE da fila padrão o RASCUNHO e o PENDENTE DE REVISÃO, que são as   │
 * │ duas filas de trabalho que a tela existe para mostrar. É o mesmo par de flags que o cabeçalho  │
 * │ de `as-status-vaga.ts` já avisa não serem sinônimos.                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE MEDE, sem montar árvore de React: o PREDICADO que a linha usa, contra o catálogo, e a
 * PRESENÇA da linha no arquivo da tela. A segunda parte é o que impede a primeira de virar teste de
 * uma função que a tela deixou de chamar.
 *
 * §A.6: catálogo de processo, nenhum dado pessoal.
 */

const PAGINA = resolve(__dirname, "../app/(app)/as/vagas/page.tsx");

describe("1. o predicado da fila padrão deixa a ENTREGUE passar", () => {
  it("ENTREGUE não é encerrada, então a fila padrão a MOSTRA", () => {
    expect(
      vagaEncerrada("ENTREGUE", VAGA_STATUS_SEMENTE),
      "a fila padrão esconde quem ENCERRA; com a entrega marcada como encerrada, a vaga entregue sumiria da tela do time.",
    ).toBe(false);
  });

  it("ABERTA, RASCUNHO e PENDENTE DE REVISÃO também passam: a fila é de tudo que não acabou", () => {
    for (const codigo of ["ABERTA", "RASCUNHO", "PENDENTE_REVISAO"]) {
      expect(vagaEncerrada(codigo, VAGA_STATUS_SEMENTE), codigo).toBe(false);
    }
  });

  it("só os DOIS desfechos são escondidos por padrão, e mais nenhum", () => {
    const escondidos = VAGA_STATUS_SEMENTE.filter((s) => vagaEncerrada(s.codigo, VAGA_STATUS_SEMENTE)).map(
      (s) => s.codigo,
    );
    expect(escondidos.sort()).toEqual(["CANCELADA", "FECHADA"]);
  });

  /**
   * ─ A ARMADILHA, ESCRITA COMO TESTE ────────────────────────────────────────────────────────────
   *
   * `!vagaEmProcesso` NÃO É `vagaEncerrada`, e este teste existe para que a troca "equivalente"
   * fique vermelha em vez de passar. São DUAS perguntas diferentes sobre o mesmo catálogo, e elas
   * discordam exatamente nos status que a fila padrão precisa MOSTRAR.
   */
  it("`!vagaEmProcesso` esconderia o RASCUNHO e a REVISÃO: os dois predicados NÃO são o mesmo", () => {
    const divergem = VAGA_STATUS_SEMENTE.filter(
      (s) => vagaEncerrada(s.codigo, VAGA_STATUS_SEMENTE) !== !vagaEmProcesso(s.codigo, VAGA_STATUS_SEMENTE),
    ).map((s) => s.codigo);

    expect(divergem.sort()).toEqual(["PENDENTE_REVISAO", "RASCUNHO"]);
  });
});

describe("2. a linha da fila padrão continua na tela, e continua perguntando `vagaEncerrada`", () => {
  /**
   * O TESTE DE ARQUIVO É O ELO QUE FALTA, e ele não é preciosismo: sem ele, o bloco acima afirma
   * sobre uma função que a tela poderia ter parado de chamar, e a fila padrão mudaria de régua com
   * a suíte verde. É o mesmo recurso que `as-vaga-status-fonte-unica.comportamental.spec.ts` já usa
   * para afirmar que nenhuma lista de status foi reescrita à mão nas telas.
   */
  it("o recorte sem filtro esconde a encerrada, pela função do catálogo", () => {
    const fonte = readFileSync(PAGINA, "utf8");
    expect(
      /setStatus\.size === 0 && vagaEncerrada\(/.test(fonte),
      "a fila padrão da Central de Vagas deixou de esconder a vaga encerrada pela régua do catálogo. Se a linha mudou de forma, este teste precisa acompanhar a mudança DE PROPÓSITO, e não cair sozinho.",
    ).toBe(true);
  });

  it("a tela NÃO escreve `ENTREGUE` à mão para decidir o que mostrar", () => {
    const fonte = readFileSync(PAGINA, "utf8");
    const emCodigo = fonte
      .split("\n")
      // Os comentários explicam a mudança e citam o código; o que não pode é LÓGICA com o literal.
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .join("\n");
    expect(emCodigo).not.toContain('"ENTREGUE"');
  });
});
