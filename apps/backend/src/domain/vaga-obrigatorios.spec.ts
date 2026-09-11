import { describe, expect, it } from "vitest";
import { VAGA_OBRIGATORIOS, type VagaPendencia } from "@ea/shared-types";
import type { CreateVagaDto } from "../as/vagas/vagas.dto";
import type { VagaItemOndaC } from "../as/vagas/vaga-item-onda-c";
import {
  PENDENCIA_LINHA_SERVICO,
  pendenciasDaVaga,
  type VagaCamposObrigatoriosComLinha,
} from "./vaga-obrigatorios";

/**
 * ─ A LINHA DE SERVIÇO É OBRIGATÓRIA PARA PUBLICAR, E O NOME DO CAMPO É O PONTO FRÁGIL ──────────
 *
 * ┌─ O FURO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR (condição da auditoria) ───────────────────────┐
 * │ A régua dos obrigatórios indexa o objeto POR TEXTO (`(v as Record<string, unknown>)[campo]`,│
 * │ dentro do `vagaPendencias` do contrato). O compilador não protege string: escrever           │
 * │ "linhaServicold" com L minúsculo, ou renomear o campo em UM dos lados, produz uma régua que  │
 * │ lê `undefined` PARA SEMPRE. E `undefined` é "vazio", então a pendência passa a existir em    │
 * │ TODA vaga: NINGUÉM publica vaga nenhuma, com typecheck verde e nenhum teste vermelho.        │
 * │                                                                                              │
 * │ SÃO QUATRO PONTOS QUE TÊM DE CONCORDAR, e o bloco abaixo amarra os quatro:                   │
 * │   1. o que a RÉGUA cobra  (`PENDENCIA_LINHA_SERVICO.campo`)                                  │
 * │   2. o que a régua LÊ     (`VagaCamposObrigatoriosComLinha`)                                 │
 * │   3. o que o CORPO aceita (`CreateVagaDto`, senão o `ValidationPipe` recusa a abertura com   │
 * │      400 antes de chegar em qualquer régua)                                                  │
 * │   4. o que a LISTAGEM devolve (`VagaItemOndaC`, que é o objeto de onde a TELA monta o que    │
 * │      manda de volta)                                                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TRÊS DOS QUATRO SÃO TRAVA DE COMPILAÇÃO, e isso é melhor do que asserção: eles quebram no
 * `typecheck`, antes de qualquer teste rodar, e quebram no lugar exato.
 *
 * §A.6: nenhum dado pessoal. Nomes de campo e listas de pendência.
 */

/** O NOME, UMA VEZ SÓ. Tudo abaixo é conferido contra ele. */
const CAMPO = "linhaServicoId" as const;

// ── AS TRÊS TRAVAS DE COMPILAÇÃO ────────────────────────────────────────────────────────────────
// Se o campo for renomeado em qualquer um dos três tipos e não nos outros, o `typecheck` recusa.
const _aReguaLe: keyof VagaCamposObrigatoriosComLinha = CAMPO;
const _oCorpoAceita: keyof CreateVagaDto = CAMPO;
const _aListagemDevolve: keyof VagaItemOndaC = CAMPO;
void _aReguaLe;
void _oCorpoAceita;
void _aListagemDevolve;

/** Uma vaga com TODOS os obrigatórios de hoje preenchidos, menos o que cada caso tirar. */
function vagaCompleta(): VagaCamposObrigatoriosComLinha {
  return {
    codigo: "SL-1",
    nomeDivulgacao: "Auxiliar",
    cargoId: "11111111-1111-4111-8111-111111111111",
    posicoesOficiais: 2,
    natureza: "NOVA",
    sazonalidade: "OPERACAO_PADRAO",
    status: "ABERTA",
    dataAbertura: "2026-09-11",
    linhaServicoId: 3,
  };
}

const campos = (p: Partial<VagaCamposObrigatoriosComLinha>) => ({ ...vagaCompleta(), ...p });
const cobra = (v: VagaCamposObrigatoriosComLinha) =>
  pendenciasDaVaga(v).some((p) => p.campo === CAMPO);

describe("a régua dos obrigatórios cobra a linha de serviço", () => {
  it("4. a régua cobra EXATAMENTE o nome que os três tipos acima declaram", () => {
    expect(PENDENCIA_LINHA_SERVICO.campo).toBe(CAMPO);
  });

  it("vaga completa não tem pendência nenhuma", () => {
    expect(pendenciasDaVaga(vagaCompleta())).toEqual([]);
  });

  /**
   * OS TRÊS JEITOS DE ESTAR VAZIO. `undefined` é o corpo que não mandou o campo, `null` é o rascunho
   * que o gravou vazio, e `""` é o campo da tela que voltou como texto. Os três significam a mesma
   * coisa, e qualquer um que escapasse deixaria publicar vaga sem linha de serviço.
   */
  it.each([undefined, null, "" as unknown as number])("cobra quando a linha é %s", (valor) => {
    expect(cobra(campos({ linhaServicoId: valor as never }))).toBe(true);
  });

  it("NÃO cobra quando a linha está escolhida", () => {
    expect(cobra(campos({ linhaServicoId: 1 }))).toBe(false);
  });

  /**
   * A FRASE QUE CHEGA NA TELA precisa dizer o passo certo, senão o item clicável da lista de
   * pendências leva a pessoa para a página errada da trilha.
   */
  it("a pendência aponta para o passo 1 da trilha, onde o campo é perguntado", () => {
    expect(PENDENCIA_LINHA_SERVICO.passo).toBe(0);
    expect(PENDENCIA_LINHA_SERVICO.passoRotulo).toBe("A Vaga");
    expect(PENDENCIA_LINHA_SERVICO.artigo).toBe("a");
  });

  /**
   * ─ A ORDEM DA LISTA É A ORDEM DA TELA ────────────────────────────────────────────────────────
   * As pendências são lidas na ordem em que a trilha pergunta. A linha de serviço é do passo 1, e
   * jogá-la para depois de "Data de abertura" (passo 2) faria a lista saltar do passo 2 de volta
   * para o 1, que é o tipo de detalhe que ninguém reporta e todo mundo estranha.
   */
  it("a linha de serviço aparece entre as pendências do passo 1, nunca depois das do passo 2", () => {
    const vazia: VagaCamposObrigatoriosComLinha = {};
    const lista = pendenciasDaVaga(vazia);
    const indice = lista.findIndex((p) => p.campo === CAMPO);
    expect(indice).toBeGreaterThanOrEqual(0);
    expect(lista[indice]!.passo).toBe(0);
    const depois = lista.slice(indice + 1);
    expect(depois.every((p) => p.passo >= 0)).toBe(true);
    // Nenhuma pendência de passo 0 pode vir DEPOIS de uma de passo 1 na lista inteira.
    const passos = lista.map((p) => p.passo);
    expect([...passos].sort((a, b) => a - b)).toEqual(passos);
  });

  /**
   * ─ A COMPOSIÇÃO É IDEMPOTENTE, e este é o teste que protege a migração futura ────────────────
   *
   * No dia em que o coordenador acrescentar a linha de serviço ao `VAGA_OBRIGATORIOS` do contrato
   * (para a TELA desenhar o asterisco a partir da mesma fonte), esta função NÃO pode passar a
   * cobrar duas vezes: a mensagem de recusa listaria "falta a Linha de serviço; falta a Linha de
   * serviço", e a lista de pendências da tela mostraria o item repetido.
   *
   * O TESTE NÃO DEPENDE DE O CONTRATO JÁ TER MUDADO: ele afirma a invariante nos dois mundos, e
   * continua verdadeiro antes e depois da mudança.
   */
  it("nunca cobra o mesmo campo duas vezes, mesmo que o contrato passe a trazê-lo", () => {
    const lista = pendenciasDaVaga({});
    const doCampo = lista.filter((p: VagaPendencia) => p.campo === CAMPO);
    expect(doCampo).toHaveLength(1);

    const jaNoContrato = VAGA_OBRIGATORIOS.some((p) => p.campo === CAMPO);
    // A invariante vale nos dois casos, e o `expect` acima já a mediu. Esta linha existe para o dia
    // em que alguém ler este arquivo procurando "já migrou?": a resposta está no próprio teste.
    expect(typeof jaNoContrato).toBe("boolean");
  });

  /** A régua de hoje não foi afrouxada: os oito obrigatórios antigos continuam sendo cobrados. */
  it("não afrouxa nenhum obrigatório que já existia", () => {
    const lista = pendenciasDaVaga({});
    for (const p of VAGA_OBRIGATORIOS) {
      expect(lista.some((x) => x.campo === p.campo), p.campo).toBe(true);
    }
  });
});
