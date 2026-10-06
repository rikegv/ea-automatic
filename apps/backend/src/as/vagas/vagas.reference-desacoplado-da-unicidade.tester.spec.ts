import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { VagasService } from "./vagas.service";
import { bancoDeStatus, erroDe, instanciar } from "./vaga-status.tester-fake";

/**
 * COBERTURA INDEPENDENTE (tester, A.38/A.40): A TRAVA DE SERVICO DESACOPLA O `reference`.
 *
 * Exercita `VagasService.travaDuplicidadeDeCodigo` (vagas.service.ts) contra o banco fingido,
 * chamando o metodo diretamente (tecnica caixa-branca): o metodo e nomeado no requisito e e o unico
 * ponto onde a trava de codigo vive. O que se mede e o COMPORTAMENTO (recusa ou nao), nao a forma
 * interna: o chamador se adapta a aridade para sobreviver a mudanca de assinatura que o conserto
 * traz (hoje recebe o codigo e o id a ignorar; o conserto acrescenta o id_vacancy_pandape do
 * candidato, para a trava saber se a vaga em jogo e do Pandape).
 *
 * LIMITE CONHECIDO DO DUBLE: o banco fingido NAO honra `ne(vagas.id, ignorarVagaId)` (o id da vaga
 * e uma string, nao um serial), entao a propria vaga volta na lista de existentes. Por isso o caso
 * 4 (a vaga nao colide consigo mesma) e coberto na funcao PURA do dominio, e nao aqui: a exclusao
 * da propria linha e a clausula SQL `ne(...)`, ja presente e inalterada pelo conserto. Aqui ficam o
 * caso 1 (duas do Pandape liberam) e o caso 2 (duas manuais barram), mais o caso 3 como reforco.
 *
 * §A.6: codigos de vaga e ids tecnicos de integracao. Nenhum dado de candidato entra neste arquivo.
 */

const CODIGO = "SL0042";
const PANDAPE_1 = "VAGA-PANDAPE-0001";
const PANDAPE_2 = "VAGA-PANDAPE-0002";

interface VagaSemente {
  id: string;
  codigo: string;
  idVacancyPandape: string | null;
}

function servicoCom(vagas: VagaSemente[]): VagasService {
  const banco = bancoDeStatus({ vagas: vagas as unknown as Record<string, unknown>[] });
  return instanciar(VagasService, banco.db) as unknown as VagasService;
}

/**
 * CHAMADA ADAPTATIVA A TRAVA. Hoje a assinatura e `(codigo, ignorarVagaId)`; o conserto passa a
 * precisar do id_vacancy_pandape do candidato para distinguir vaga do Pandape de vaga manual. O
 * teste nao fixa a assinatura: pela aridade, entrega o id no meio quando o metodo o aceita.
 */
async function chamarTrava(
  service: VagasService,
  entrada: { codigo: string; idVacancyPandape: string | null; ignorar: string },
): Promise<unknown> {
  const dono = service as unknown as Record<string, unknown>;
  const metodo = dono.travaDuplicidadeDeCodigo as ((...a: unknown[]) => Promise<unknown>) | undefined;
  if (typeof metodo !== "function") {
    throw new Error(
      "`VagasService.travaDuplicidadeDeCodigo` nao existe mais. A trava de duplicidade mudou de " +
        "nome: o teste precisa seguir o novo nome da trava de codigo.",
    );
  }
  const vinculado = metodo.bind(service);
  if (vinculado.length >= 3) {
    return vinculado(entrada.codigo, entrada.idVacancyPandape, entrada.ignorar);
  }
  return vinculado(entrada.codigo, entrada.ignorar);
}

const mensagemDe = (erro: unknown): string => String((erro as { message?: unknown })?.message ?? "");

describe("a trava de servico: o reference do Pandape nao barra vaga", () => {
  it("CASO 1 (o conserto): duas vagas do Pandape distintas com o mesmo codigo, a segunda LIBERA", async () => {
    const service = servicoCom([
      { id: "vaga-A", codigo: CODIGO, idVacancyPandape: PANDAPE_1 },
      { id: "vaga-B", codigo: CODIGO, idVacancyPandape: PANDAPE_2 },
    ]);

    const erro = await erroDe(() =>
      chamarTrava(service, { codigo: CODIGO, idVacancyPandape: PANDAPE_2, ignorar: "vaga-B" }),
    );

    expect(
      erro,
      "a segunda vaga do Pandape bateu na trava pelo reference repetido. Hoje isto e VERMELHO (a trava so olha o codigo); o conserto e exatamente deixar as duas passarem.",
    ).toBeNull();
  });

  it("CASO 2 (a trava NAO morreu): duas vagas MANUAIS com o mesmo codigo, a segunda e BARRADA", async () => {
    const service = servicoCom([
      { id: "vaga-A", codigo: CODIGO, idVacancyPandape: null },
      { id: "vaga-B", codigo: CODIGO, idVacancyPandape: null },
    ]);

    const erro = await erroDe(() =>
      chamarTrava(service, { codigo: CODIGO, idVacancyPandape: null, ignorar: "vaga-B" }),
    );

    expect(erro, "a segunda vaga manual passou com codigo duplicado: a trava foi desligada por engano").not.toBeNull();
    expect(
      mensagemDe(erro),
      "a recusa tem de ser a de codigo em uso, e nao outro erro qualquer",
    ).toContain("em uso");
  });

  it("CASO 3: vaga manual com codigo igual ao reference de uma vaga do Pandape NAO e barrada", async () => {
    const service = servicoCom([
      { id: "vaga-A", codigo: CODIGO, idVacancyPandape: PANDAPE_1 },
      { id: "vaga-B", codigo: CODIGO, idVacancyPandape: null },
    ]);

    const erro = await erroDe(() =>
      chamarTrava(service, { codigo: CODIGO, idVacancyPandape: null, ignorar: "vaga-B" }),
    );

    expect(
      erro,
      "a vaga manual foi barrada por casar com o reference de uma do Pandape. Hoje isto e VERMELHO; o conserto distingue manual de Pandape.",
    ).toBeNull();
  });
});
