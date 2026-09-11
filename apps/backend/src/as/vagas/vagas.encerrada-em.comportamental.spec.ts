import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import {
  bancoFingido,
  gravadoNaVaga,
  MASTER,
  MOTIVO_DE_CANCELAMENTO,
  naVaga,
  pessoa,
} from "./vaga-encerrada-em.tester-fake";

/**
 * ─ O CARIMBO DE ENCERRAMENTO DA VAGA É DE SERVIDOR (§A.6, LGPD, item 4 do requisito) ────────────
 *
 * ESTE ARQUIVO É DO `tester` (§A.38) E É DE COMPORTAMENTO, não de forma: ele não procura palavra
 * nenhuma no código, ele CHAMA `fechar` e `cancelar` e olha o PAYLOAD que a gravação recebeu.
 *
 * ┌─ POR QUE UMA COLUNA NOVA, E POR QUE `data_fechamento` NÃO SERVE ───────────────────────────┐
 * │ A correção de LGPD do expurgo faz o prazo de 2 anos correr do ENCERRAMENTO DA VAGA para quem │
 * │ ficou vivo dentro dela. Esse relógio precisa de um instante em que se possa confiar.         │
 * │                                                                                              │
 * │ `data_fechamento` VEM DO CORPO DA REQUISIÇÃO. É `@IsISO8601()` SEM PISO, e o próprio DTO      │
 * │ documenta que ela pode ser anterior ao clique, porque é o FATO COMERCIAL, e não o gesto. Um   │
 * │ COMUM cancelando uma vaga com data de 2019 viraria, sozinho, GATILHO REMOTO DE EXCLUSÃO do    │
 * │ dado pessoal de todo mundo que estava naquela vaga, na varredura da hora seguinte, sem        │
 * │ nenhuma carência e sem volta.                                                                 │
 * │                                                                                              │
 * │ Por isso o relógio lê `vagas.encerrada_em`, escrita com a hora do SERVIDOR no `fechar` e no   │
 * │ `cancelar`. É o mesmo desenho de `cancelada_em`, que já existia ao lado de `data_cancelamento`│
 * │ exatamente por esta razão, e o requisito só o estende para o fechamento.                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE CADA TESTE TRAVA, e nenhum deles é sobre estilo:
 *   1. os DOIS gestos que encerram vaga carimbam. Faltando um, metade das vagas encerradas fica com
 *      o relógio do expurgo em branco, e a correção de LGPD não alcança quem está dentro delas;
 *   2. o carimbo é a HORA DO SERVIDOR, e não a data que veio no corpo, ainda que ela seja de 2019;
 *   3. o carimbo vai na MESMA gravação que muda o status: não existe o estado intermediário de vaga
 *      encerrada sem carimbo, nem com um `update` que falhou entre os dois;
 *   4. `data_fechamento` continua sendo escrita a partir do corpo. A coluna nova ACRESCENTA, e o
 *      contador de dias em aberto, que lê a data do fato, não pode mudar de significado.
 */

const AGORA_DE_VERDADE = () => Date.now();

/** O corpo do fechamento, com a data do FATO propositalmente ANTIGA. */
const CORPO_FECHAR = { dataFechamento: "2019-01-01" };
/** O corpo do cancelamento, idem. */
const CORPO_CANCELAR = { motivo: MOTIVO_DE_CANCELAMENTO, dataCancelamento: "2019-01-01" };

/** Uma vaga que entregou o que prometeu: o fechamento passa por todas as travas sem exceção. */
function vagaEntregue() {
  return bancoFingido({
    status: "ABERTA",
    posicoesOficiais: 1,
    candidaturas: [pessoa("ALOCADO", "P1", "OFICIAL")],
  });
}

/** Uma vaga sem ninguém dentro: o cancelamento passa sem forçar nada. */
function vagaVazia() {
  return bancoFingido({ status: "ABERTA", posicoesOficiais: 1, candidaturas: [] });
}

type Gesto = (id: string, dto: Record<string, unknown>, user: AuthUser) => Promise<unknown>;

/**
 * O MÉTODO É RESOLVIDO POR NOME, e não chamado direto, pela mesma razão do `vagas.cancelar.spec.ts`:
 * enquanto a construção não chegar, cada teste falha com uma frase que DIZ o que falta, em vez de o
 * `typecheck` do repositório inteiro ficar vermelho por causa deste arquivo.
 */
function gestoDe(service: unknown, nome: "fechar" | "cancelar"): Gesto {
  const alvo = (service as Record<string, unknown>)[nome];
  if (typeof alvo !== "function") {
    throw new Error(`VagasService.${nome} ainda não existe. Este arquivo é a especificação dele.`);
  }
  return (alvo as Gesto).bind(service);
}

/** O instante gravado, seja qual for o nome que a construção deu à chave. */
function carimbo(escritas: ReturnType<typeof naVaga>): unknown {
  return gravadoNaVaga(escritas).encerradaem;
}

describe("encerrar a vaga carimba `encerrada_em` com a hora do SERVIDOR", () => {
  it("o FECHAMENTO carimba, e o instante é de agora, nunca a data que veio no corpo", async () => {
    const { service, escritas } = vagaEntregue();
    const antes = AGORA_DE_VERDADE();
    await gestoDe(service, "fechar")("vaga-1", CORPO_FECHAR, MASTER);
    const depois = AGORA_DE_VERDADE();

    const valor = carimbo(escritas);
    expect(
      valor,
      "sem `encerrada_em` no fechamento, o expurgo por retenção não tem de onde contar o prazo de quem ficou vivo na vaga fechada, e o dado pessoal dessas pessoas fica retido para sempre (§A.6).",
    ).toBeInstanceOf(Date);
    const instante = (valor as Date).getTime();
    expect(instante).toBeGreaterThanOrEqual(antes);
    expect(instante).toBeLessThanOrEqual(depois);
  });

  it("o CANCELAMENTO carimba, e o instante é de agora, nunca a data que veio no corpo", async () => {
    const { service, escritas } = vagaVazia();
    const antes = AGORA_DE_VERDADE();
    await gestoDe(service, "cancelar")("vaga-1", CORPO_CANCELAR, MASTER);
    const depois = AGORA_DE_VERDADE();

    const valor = carimbo(escritas);
    expect(
      valor,
      "o cancelamento é o caminho MAIS comum de vaga encerrada com gente viva dentro: sem carimbo aqui, é justamente essa gente que fica retida para sempre.",
    ).toBeInstanceOf(Date);
    const instante = (valor as Date).getTime();
    expect(instante).toBeGreaterThanOrEqual(antes);
    expect(instante).toBeLessThanOrEqual(depois);
  });

  /**
   * A PROVA DIRETA DE QUE O CARIMBO NÃO É O CAMPO DO CORPO: os dois gestos recebem a data de 2019, e
   * o que é gravado em `encerrada_em` tem de ser deste ano. Este é o teste que fica vermelho no dia
   * em que alguém "simplificar" a coluna nova para reusar a data do formulário.
   */
  it("a data de 2019 que veio no corpo NÃO vira o carimbo de encerramento", async () => {
    for (const [nome, cenario, corpo] of [
      ["fechar", vagaEntregue(), CORPO_FECHAR],
      ["cancelar", vagaVazia(), CORPO_CANCELAR],
    ] as const) {
      await gestoDe(cenario.service, nome as "fechar" | "cancelar")(
        "vaga-1",
        corpo as Record<string, unknown>,
        MASTER,
      );
      const valor = carimbo(cenario.escritas) as Date;
      expect(valor.getUTCFullYear(), `${nome}: o carimbo saiu com o ano do corpo.`).toBeGreaterThan(
        2020,
      );
      expect(String(valor)).not.toContain("2019");
    }
  });

  /**
   * E `data_fechamento` CONTINUA VINDO DO CORPO. A coluna nova ACRESCENTA: o contador de dias em
   * aberto lê a data do FATO, e trocá-la pelo instante do gesto mudaria, em silêncio, o indicador de
   * toda vaga encerrada com data retroativa, que é caso normal na operação.
   */
  it("`data_fechamento` continua sendo a data do FATO, vinda do corpo, e é OUTRA coisa", async () => {
    const { service, escritas } = vagaEntregue();
    await gestoDe(service, "fechar")("vaga-1", CORPO_FECHAR, MASTER);
    const payload = gravadoNaVaga(escritas);
    expect(payload.datafechamento).toBe("2019-01-01");
    expect(payload.datafechamento).not.toBe(payload.encerradaem);
  });

  /**
   * UMA GRAVAÇÃO SÓ, e é ela que garante que não existe vaga encerrada sem carimbo. Dois `update`
   * separados criariam o estado em que o primeiro passou e o segundo falhou: a vaga encerra, o
   * relógio do expurgo fica nulo, e ninguém percebe porque nada falhou visivelmente.
   */
  it("o carimbo vai na MESMA gravação que muda o status da vaga", async () => {
    for (const [nome, cenario, corpo] of [
      ["fechar", vagaEntregue(), CORPO_FECHAR],
      ["cancelar", vagaVazia(), CORPO_CANCELAR],
    ] as const) {
      await gestoDe(cenario.service, nome as "fechar" | "cancelar")(
        "vaga-1",
        corpo as Record<string, unknown>,
        MASTER,
      );
      const gravacoes = naVaga(cenario.escritas);
      expect(gravacoes, `${nome}: a linha da vaga foi gravada mais de uma vez.`).toHaveLength(1);
      const payload = gravadoNaVaga(cenario.escritas);
      expect(payload.status, `${nome}: o status não foi gravado junto do carimbo.`).toBeTruthy();
      expect(payload.encerradaem).toBeInstanceOf(Date);
    }
  });
});
