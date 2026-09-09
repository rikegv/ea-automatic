import { describe, expect, it, vi } from "vitest";
import { VagasService } from "./vagas.service";
import { asCandidaturas, vagaBeneficio, vagas } from "../../db/schema";

/**
 * ─ A OCUPAÇÃO DERIVADA NA LISTAGEM DE VAGAS ─────────────────────────────────────────────────────
 *
 * O QUE MUDOU: `GET /as/vagas` passou a carregar, por vaga, a MESMA ocupação derivada que o painel
 * de uma vaga já servia. Antes, a única contagem que a listagem tinha era o número DIGITADO no
 * fechamento (`vagas_fechadas`), que é um carimbo do que alguém escreveu, e não do que aconteceu.
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   1. UMA CONSULTA SÓ para todas as vagas da página. A listagem não pagina, então uma consulta por
 *      linha viraria centenas de idas ao banco na tela mais pesada do módulo.
 *   2. A RÉGUA É A DO DOMÍNIO. A consulta agrupa e conta; quem decide o que cada situação vale é
 *      `ocupacaoDaVaga`. Somar "quem consome posição" dentro do SQL seria a sexta cópia da régua.
 *   3. O CONTADOR DIGITADO NÃO FOI TOCADO. `vagasFechadas` e `vagasFechadasBanco` continuam saindo
 *      com o mesmo valor: quem decide qual dos dois a tela lê é outra etapa, e é decisão do diretor.
 */

const AGORA = new Date("2026-09-08T12:00:00.000Z");

function linhaDeVaga(id: string, codigo: string, posicoesOficiais: number | null) {
  return {
    v: {
      id,
      codigo,
      nomeDivulgacao: codigo,
      status: "ABERTA",
      posicoesOficiais,
      posicoesBanco: 0,
      vagasFechadas: null,
      vagasFechadasBanco: null,
      escolaridade: null,
      regioes: [],
      idiomas: [],
      testes: [],
      etapasPs: [],
      criadoEm: AGORA,
    },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
  };
}

/**
 * `candidaturas` é o resultado do `group by (vaga, situação, LADO)`, do jeito que o banco devolveria.
 *
 * O LADO É OPCIONAL AQUI porque ele é opcional no banco: a coluna nasceu nula, e nulo vale OFICIAL.
 * Escrever `posicaoLado` só nos casos que falam de banco mantém os cenários antigos dizendo
 * exatamente o que diziam antes da separação.
 */
function makeDb(
  linhas: ReturnType<typeof linhaDeVaga>[],
  candidaturas: {
    vagaId: string;
    situacao: string;
    posicaoLado?: string | null;
    quantas: number;
  }[],
) {
  const consultasPorTabela = new Map<unknown, number>();

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    const resultado = () => {
      if (tabela === vagas) return linhas;
      if (tabela === asCandidaturas) return candidaturas;
      return [];
    };
    b.from = (t: unknown) => {
      tabela = t;
      consultasPorTabela.set(t, (consultasPorTabela.get(t) ?? 0) + 1);
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.orderBy = () => Promise.resolve(resultado());
    b.groupBy = () => Promise.resolve(resultado());
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(resultado()).then(r);
    return b;
  });

  const db = { select };
  return { service: new VagasService(db as never), consultasPorTabela };
}

describe("GET /as/vagas: a ocupação derivada por vaga", () => {
  /**
   * O RETRATO DA VAGA REAL DE HOMOLOGAÇÃO (5 posições, uma pessoa em seleção e uma fora), que é a
   * linha de base contra a qual esta frente foi medida. Nenhum dos números dela muda.
   */
  it("conta em seleção e fora sem consumir posição nenhuma", async () => {
    const { service } = makeDb(
      [linhaDeVaga("vaga-1", "123456 - TESTE", 5)],
      [
        { vagaId: "vaga-1", situacao: "ATIVO", quantas: 1 },
        { vagaId: "vaga-1", situacao: "DESISTIU", quantas: 1 },
      ],
    );

    const [v] = await service.list();
    expect(v.ocupacao).toEqual({
      vagaId: "vaga-1",
      posicoesOficiais: 5,
      ocupadas: 0,
      finalizadas: 0,
      finalizadasOficial: 0,
      finalizadasBanco: 0,
      livres: 5,
      emSelecao: 1,
      fora: 1,
      excedida: false,
    });
  });

  /**
   * AS DUAS PERGUNTAS SEPARADAS, na listagem: `ALOCADO` ENTREGOU a posição (enche o cilindro) e
   * `APROVADO` apenas a TOMA (reserva). Vale sempre `finalizadas <= ocupadas`.
   */
  it("separa a posição ENTREGUE da posição apenas TOMADA", async () => {
    const { service } = makeDb(
      [linhaDeVaga("vaga-1", "PS-1", 5)],
      [
        { vagaId: "vaga-1", situacao: "ALOCADO", quantas: 2 },
        { vagaId: "vaga-1", situacao: "ENVIADO_PARA_ADMISSAO", quantas: 1 },
        { vagaId: "vaga-1", situacao: "APROVADO", quantas: 1 },
        { vagaId: "vaga-1", situacao: "ATIVO", quantas: 3 },
      ],
    );

    const [v] = await service.list();
    expect(v.ocupacao).toMatchObject({
      ocupadas: 4,
      finalizadas: 3,
      livres: 1,
      emSelecao: 3,
      excedida: false,
    });
  });

  /** Vaga sem ninguém dentro vem ZERADA, e não ausente: o zero já é a resposta. */
  it("vaga sem candidatura nenhuma vem zerada, com as posições livres", async () => {
    const { service } = makeDb([linhaDeVaga("vaga-2", "PS-2026-002", 2)], []);
    const [v] = await service.list();
    expect(v.ocupacao).toMatchObject({ ocupadas: 0, finalizadas: 0, livres: 2, fora: 0 });
  });

  /** Meta nula (rascunho) não vira meta zero: `livres` fica nula e nada é declarado excedido. */
  it("vaga sem meta definida não inventa teto", async () => {
    const { service } = makeDb(
      [linhaDeVaga("vaga-3", "RASCUNHO", null)],
      [{ vagaId: "vaga-3", situacao: "APROVADO", quantas: 1 }],
    );
    const [v] = await service.list();
    expect(v.ocupacao).toMatchObject({ ocupadas: 1, livres: null, excedida: false });
  });

  /**
   * ─ A ENTREGA SEPARADA POR LADO, NA LISTAGEM ────────────────────────────────────────────────────
   *
   * A VAGA REAL: 5 oficiais e 20 de banco. Com uma entrega oficial e duas na reserva, o cilindro
   * oficial tem de mostrar UMA, e não três. Enquanto a entrega era um número só, ele mostrava três,
   * e a vaga aparecia adiantada no lado que ninguém tinha preenchido.
   */
  it("separa a entrega OFICIAL da entrega de BANCO", async () => {
    const { service } = makeDb(
      [linhaDeVaga("vaga-1", "123456 - TESTE", 5)],
      [
        { vagaId: "vaga-1", situacao: "ALOCADO", posicaoLado: "BANCO", quantas: 2 },
        { vagaId: "vaga-1", situacao: "ALOCADO", posicaoLado: "OFICIAL", quantas: 1 },
        { vagaId: "vaga-1", situacao: "APROVADO", posicaoLado: null, quantas: 1 },
      ],
    );

    const [v] = await service.list();
    expect(v.ocupacao).toMatchObject({
      ocupadas: 4,
      finalizadas: 3,
      finalizadasOficial: 1,
      finalizadasBanco: 2,
    });
  });

  /** O LADO NULO É OFICIAL, e é assim que toda linha anterior à coluna continua sendo lida. */
  it("entrega com lado nulo conta como OFICIAL", async () => {
    const { service } = makeDb(
      [linhaDeVaga("vaga-1", "PS-1", 5)],
      [{ vagaId: "vaga-1", situacao: "ALOCADO", posicaoLado: null, quantas: 2 }],
    );
    const [v] = await service.list();
    expect(v.ocupacao).toMatchObject({ finalizadas: 2, finalizadasOficial: 2, finalizadasBanco: 0 });
  });

  /**
   * O N+1, QUE É O RISCO DESTA MUDANÇA. A listagem traz a tabela inteira, então a ocupação precisa
   * sair de UMA consulta agregada. Com quatro vagas, o banco continua sendo consultado uma única vez
   * por `as_candidaturas`, e a entrada do LADO no `group by` não mudou isso: ela acrescentou uma
   * coluna ao agrupamento, e não uma consulta.
   */
  it("uma consulta só de candidaturas, para todas as vagas da página", async () => {
    const { service, consultasPorTabela } = makeDb(
      [
        linhaDeVaga("vaga-1", "A", 5),
        linhaDeVaga("vaga-2", "B", 2),
        linhaDeVaga("vaga-3", "C", 2),
        linhaDeVaga("vaga-4", "D", 3),
      ],
      [{ vagaId: "vaga-1", situacao: "ALOCADO", quantas: 1 }],
    );

    const lista = await service.list();

    expect(lista).toHaveLength(4);
    expect(consultasPorTabela.get(asCandidaturas)).toBe(1);
    // A listagem toda continua em três consultas: as vagas, os benefícios e a ocupação.
    expect(consultasPorTabela.get(vagas)).toBe(1);
    expect(consultasPorTabela.get(vagaBeneficio)).toBe(1);
  });

  /**
   * O CONTADOR DIGITADO CONTINUA INTOCADO, e este teste existe para que ninguém o "limpe" achando
   * que a derivada o substituiu. Quem decide qual dos dois a tela lê é o diretor, em outra etapa.
   */
  it("os contadores do fechamento continuam saindo como estavam", async () => {
    const linha = linhaDeVaga("vaga-1", "PS-2026-001", 3);
    linha.v.status = "ENTREGUE";
    linha.v.vagasFechadas = 1 as never;
    linha.v.vagasFechadasBanco = 1 as never;

    const { service } = makeDb([linha], []);
    const [v] = await service.list();

    expect(v.vagasFechadas).toBe(1);
    expect(v.vagasFechadasBanco).toBe(1);
    // E a derivada NÃO reescreve o carimbo histórico: ela convive com ele.
    expect(v.ocupacao.finalizadas).toBe(0);
  });
});
