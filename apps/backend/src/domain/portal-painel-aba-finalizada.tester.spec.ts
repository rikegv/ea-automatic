import { describe, expect, it } from "vitest";
import { finalizadaParaAba, naAba, type FatoDaConclusao } from "./portal-painel";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO (§A.40) — AJUSTE 4A + 4B.
 *
 * REQUISITO (decisões do diretor): a PÁGINA PRINCIPAL (aba `EM_ANDAMENTO`) mostra só trabalho em
 * andamento. A segunda aba (`CONCLUIDO`) junta TUDO que já não está em andamento, por TRÊS portas
 * ADITIVAS, sem mexer no rótulo da situação nem nos cards:
 *   (1) coleta completa pelo Portal (a régua original `concluiuAColeta`);
 *   (2) AJUSTE 4B: admissão CONCLUÍDA (farol `ADMISSAO_CONCLUIDA` -> `farolConcluida`);
 *   (3) AJUSTE 4A: AUDITORIA finalizada (`ANALISE_OK` -> `analiseFinalizada`), que pega o resquício
 *       da migração do Pandapé (documentos entregues pela Esteira, análise OK, candidato nunca
 *       acessou o Portal, então `concluiuAColeta` é falso de propósito).
 *
 * O MAL-ENTENDIDO QUE ESTE ARQUIVO EXISTE PARA PEGAR: que 4A/4B tivessem REVERTIDO a régua de
 * "concluiu exige acesso". Não reverteram: um candidato que NÃO acessou e NÃO tem nenhum dos dois
 * sinais novos continua EM_ANDAMENTO (régua intacta). Os sinais novos só ACRESCENTAM à aba.
 */

const andamento = (over: Partial<FatoDaConclusao> = {}): FatoDaConclusao => ({
  acessou: false,
  obrigatorios: 5,
  obrigatoriosPendentes: 3,
  aceitos: 2,
  ...over,
});

describe("finalizadaParaAba: as três portas são aditivas", () => {
  it("coleta completa pelo Portal (porta 1) é finalizada", () => {
    expect(finalizadaParaAba(andamento({ acessou: true, obrigatoriosPendentes: 0, aceitos: 5 }))).toBe(
      true,
    );
  });

  it("farol CONCLUÍDA (porta 2, AJUSTE 4B) é finalizada mesmo sem acesso e sem coleta cheia", () => {
    expect(finalizadaParaAba(andamento({ farolConcluida: true }))).toBe(true);
  });

  it("AUDITORIA ANALISE_OK (porta 3, AJUSTE 4A) é finalizada mesmo sem acesso (resquício Pandapé)", () => {
    // Este é exatamente o caso dos 6 medidos em produção: entregou pela Esteira, análise OK, nunca
    // acessou o Portal. Sem este sinal, ficava preso em EM_ANDAMENTO como "Não Acessou".
    expect(finalizadaParaAba(andamento({ acessou: false, analiseFinalizada: true }))).toBe(true);
  });

  it("em andamento de verdade (sem nenhum dos três sinais) NÃO é finalizada", () => {
    expect(finalizadaParaAba(andamento())).toBe(false);
  });

  it("a régua de acesso NÃO foi revertida: acesso sem coleta e sem sinal novo segue em andamento", () => {
    expect(finalizadaParaAba(andamento({ acessou: true, obrigatoriosPendentes: 2 }))).toBe(false);
  });
});

describe("naAba: a página principal é o complemento exato da aba de finalizadas", () => {
  it("o resquício (análise OK, não acessou) SAI da página principal e aparece em CONCLUIDO", () => {
    const resquicio = andamento({ acessou: false, analiseFinalizada: true });
    expect(naAba("EM_ANDAMENTO", resquicio)).toBe(false);
    expect(naAba("CONCLUIDO", resquicio)).toBe(true);
  });

  it("a admissão CONCLUÍDA sai da página principal e aparece em CONCLUIDO", () => {
    const concluida = andamento({ farolConcluida: true });
    expect(naAba("EM_ANDAMENTO", concluida)).toBe(false);
    expect(naAba("CONCLUIDO", concluida)).toBe(true);
  });

  it("a admissão em andamento fica na página principal e fora de CONCLUIDO", () => {
    const viva = andamento();
    expect(naAba("EM_ANDAMENTO", viva)).toBe(true);
    expect(naAba("CONCLUIDO", viva)).toBe(false);
  });
});
