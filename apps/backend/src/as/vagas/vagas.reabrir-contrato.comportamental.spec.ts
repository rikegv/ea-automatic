import { describe, expect, it } from "vitest";
import {
  MUTANTES,
  colunasDesconhecidas,
  explicar,
  referenciaDoReabrir,
  regrasVioladas,
  violacoesDoReabrir,
  type BancoDoReabrir,
} from "./reabrir-vaga.tester-fake";

/**
 * ─ O TESTE DO TESTE: O CONTRATO DO REABRIR CONSEGUE FICAR VERMELHO? ─────────────────────────────
 *
 * ESTE ARQUIVO NÃO TESTA PRODUÇÃO. Ele testa o `violacoesDoReabrir`, que é o contrato que o
 * `vagas.reabrir.comportamental.spec.ts` aplica sobre o código de verdade. A pergunta que ele
 * responde é a única que valida um teste: "ele pega o defeito, ou só concorda com quem passou?".
 *
 * ┌─ POR QUE ELE EXISTE, e por que ele fica VERDE hoje enquanto o outro fica vermelho ──────────┐
 * │ O `reabrir` de produção AINDA NÃO FOI ESCRITO (§A.40 regra 2: o `tester` entra JUNTO com a  │
 * │ construção, escrevendo a partir do REQUISITO). Um contrato que nunca foi exercitado contra   │
 * │ NADA é uma lista de opiniões: pode estar frouxo, pode estar acoplado ao desenho, pode nem    │
 * │ rodar. Aqui ele roda contra uma implementação de REFERÊNCIA, escrita no próprio fake e não   │
 * │ em produção, e depois contra QUINZE MUTANTES dela, um defeito de cada vez.                  │
 * │                                                                                             │
 * │ CADA MUTANTE É UM DEFEITO QUE JÁ CUSTOU CARO EM ALGUM LUGAR, e o contrato tem de acusar      │
 * │ exatamente a REGRA nomeada: acusar "alguma coisa" não serve, porque quem constrói precisa    │
 * │ saber O QUE quebrou. Mutante que passa verde é buraco no contrato, e o buraco aparece AQUI,  │
 * │ antes de alguém depender dele.                                                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE NÃO PROVA, e está dito para ninguém confundir: ele não diz que a produção está certa.
 * Diz que, quando a produção chegar, este contrato é capaz de reprová-la.
 */

/**
 * O CÓDIGO DO PAPEL ABERTURA, RENOMEADO, E ESTA LINHA FOI O ACHADO DESTA RODADA.
 *
 * A semente chama o status de abertura de `"ABERTA"`, que é exatamente o literal que a armadilha
 * escreve à mão: com ela, "resolveu pelo papel" e "digitou o literal" gravam a MESMA coisa, e o
 * mutante 8 passou VERDE na primeira execução deste arquivo. Renomeado, os dois caminhos divergem.
 */
const ABERTURA_RENOMEADA = "ABERTURA_2026";

const referencia = (banco: BancoDoReabrir) =>
  referenciaDoReabrir(banco, {}, ABERTURA_RENOMEADA);

describe("o contrato do reabrir aprova uma implementação que cumpre o requisito", () => {
  it("a implementação de REFERÊNCIA passa sem nenhuma violação", async () => {
    const v = await violacoesDoReabrir(referencia, ABERTURA_RENOMEADA);
    expect(v, `o contrato reprovou a própria referência:${explicar(v)}`).toEqual([]);
  });

  it("a referência também passa com o catálogo da semente, sem o renome", async () => {
    const v = await violacoesDoReabrir((banco) => referenciaDoReabrir(banco));
    expect(v, `o contrato reprovou a referência na semente:${explicar(v)}`).toEqual([]);
  });

  /**
   * O FAKE ACOMPANHA O SCHEMA, e este teste é o alarme de quando ele parar de acompanhar.
   *
   * Coluna pedida por uma consulta e ausente do fixture é lida como `undefined`, e `undefined`
   * filtra linha fora em silêncio. O conjunto encolhe, o teste fica vermelho por um motivo que não
   * é o defeito, e alguém passa uma hora procurando no lugar errado.
   */
  it("nenhuma consulta pediu coluna que o fixture não conhece", () => {
    expect([...colunasDesconhecidas]).toEqual([]);
  });
});

describe("o contrato do reabrir REPROVA cada defeito conhecido, um de cada vez", () => {
  for (const m of MUTANTES) {
    it(`${m.nome} => acusa ${m.regraEsperada}`, async () => {
      const v = await violacoesDoReabrir(
        (banco) => referenciaDoReabrir(banco, m.desvio, ABERTURA_RENOMEADA),
        ABERTURA_RENOMEADA,
      );
      expect(
        regrasVioladas(v),
        `o mutante passou sem ser acusado por ${m.regraEsperada}. Dano em produção: ${m.dano}. O que o contrato acusou:${explicar(v)}`,
      ).toContain(m.regraEsperada);
    });
  }

  /**
   * A CONTRAPROVA DO CONJUNTO DE MUTANTES: cada regra nomeada acima é acusada por ALGUÉM. Uma
   * `regraEsperada` que nenhum mutante produza seria uma regra que o contrato nunca exercita, e
   * regra nunca exercitada é a que está escrita errado sem ninguém saber.
   */
  it("nenhum mutante depende de outro para ser pego: cada um é acusado sozinho", async () => {
    const soltos: string[] = [];
    for (const m of MUTANTES) {
      const v = await violacoesDoReabrir(
        (banco) => referenciaDoReabrir(banco, m.desvio, ABERTURA_RENOMEADA),
        ABERTURA_RENOMEADA,
      );
      if (!regrasVioladas(v).includes(m.regraEsperada)) soltos.push(m.nome);
    }
    expect(soltos).toEqual([]);
  });
});
