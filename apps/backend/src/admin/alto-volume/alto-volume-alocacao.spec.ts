import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AltoVolumeVinculosService } from "./alto-volume-vinculos.service";

/**
 * ALOCAÇÃO VISTA DA FICHA (item 3 da OST dos 3 itens): `alocacaoDaAdmissao`.
 *
 * O QUE ESTES TESTES PROTEGEM, e é o pedido do diretor em uma frase: a ficha tem de dizer EM QUE
 * PROJETO A ADMISSÃO JÁ ESTÁ antes de qualquer clique, para ninguém alocar duas vezes sem querer. O
 * `unique` de `admissao_id` é a trava final e não muda; esta leitura é a que INFORMA, e é ela que
 * evita o clique errado em vez de recusá-lo depois.
 *
 * A segunda garantia é de recorte: os projetos oferecidos são os ATIVOS do cliente DA ADMISSÃO, e
 * nada mais. Oferecer projeto de outro cliente faria a tela sugerir exatamente o vínculo torto que a
 * onda 3 recusa no backend, com a pessoa culpando a recusa em vez da sugestão.
 *
 * FAKE PRÓPRIO, e não o de `alto-volume-vinculos.spec`: aquele harness resolve as leituras no
 * `orderBy`, e duas das consultas desta leitura terminam no `where`. Um fake separado é mais barato
 * (e mais honesto) que mexer no harness que cobre a onda 3 inteira (§A.26).
 */

const ADMISSAO = "55555555-5555-4555-8555-555555555555";
const PROJETO = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

/**
 * Fake do Drizzle que entrega os resultados NA ORDEM em que o serviço consulta:
 * admissão, vínculo, projetos, grupos. Qualquer método da cadeia devolve o mesmo construtor, e o
 * `await` (via `then`) consome a próxima resposta da fila.
 */
function montar(filas: Row[][]) {
  const restante = [...filas];
  const construtor: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "groupBy"]) {
    construtor[m] = () => construtor;
  }
  construtor.then = (ok: (v: Row[]) => unknown, erro: (e: unknown) => unknown) =>
    Promise.resolve(restante.shift() ?? []).then(ok, erro);
  const db = { select: () => construtor };
  return new AltoVolumeVinculosService(db as never);
}

const ADMISSAO_OK: Row = {
  id: ADMISSAO,
  codCliente: "100",
  clienteRazaoSocial: "EDITORA X",
  clienteNomeOperacao: "OPERAÇÃO X",
  cargoNome: "Vendedor I",
  dataAdmissao: "2026-09-05",
  farolGlobal: "EM_ADMISSAO",
};
const PROJETO_OK: Row = {
  id: PROJETO,
  codCliente: "100",
  ativo: true,
  nome: "BIENAL DOS LIVROS",
  dataInicio: "2026-09-01",
  dataFim: "2026-09-13",
};

describe("alocacaoDaAdmissao", () => {
  it("admissão inexistente: 404, e não uma alocação vazia", async () => {
    const service = montar([[]]);
    await expect(service.alocacaoDaAdmissao(ADMISSAO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("SEM vínculo: devolve `vinculo` nulo e os projetos ativos do cliente, com os grupos de cada um", async () => {
    const service = montar([
      [ADMISSAO_OK],
      [], // nenhuma linha em admissao_projeto: a admissão não está em projeto nenhum
      [PROJETO_OK],
      [{ id: "g1", projetoId: PROJETO, rotulo: "Turma 1" }],
    ]);

    const r = await service.alocacaoDaAdmissao(ADMISSAO);

    expect(r.vinculo).toBeNull();
    expect(r.projetos).toHaveLength(1);
    expect(r.projetos[0].nome).toBe("BIENAL DOS LIVROS");
    // Os grupos chegam pendurados no projeto a que pertencem, que é como o segundo seletor os pede.
    expect(r.projetos[0].grupos).toEqual([{ id: "g1", rotulo: "Turma 1" }]);
  });

  it("COM vínculo: diz onde a admissão já está, com a trilha de quem vinculou e quando", async () => {
    const service = montar([
      [ADMISSAO_OK],
      [
        {
          id: "v1",
          projetoId: PROJETO,
          projetoNome: "BIENAL DOS LIVROS",
          projetoAtivo: true,
          grupoId: null,
          grupoRotulo: null,
          origem: "LIBERACAO",
          vinculadoEm: "2026-08-10T12:00:00.000Z",
          vinculadoPorNome: "Fulano",
        },
      ],
      [PROJETO_OK],
      [],
    ]);

    const r = await service.alocacaoDaAdmissao(ADMISSAO);

    expect(r.vinculo?.projetoNome).toBe("BIENAL DOS LIVROS");
    expect(r.vinculo?.origem).toBe("LIBERACAO");
    expect(r.vinculo?.vinculadoPorNome).toBe("Fulano");
    // Projeto sem grupo cadastrado devolve lista vazia, e a tela simplesmente não desenha o seletor.
    expect(r.projetos[0].grupos).toEqual([]);
  });

  it("admissão AINDA SEM CLIENTE (pré-admissão): não consulta projeto nenhum e devolve lista vazia", async () => {
    // Só DUAS filas: se o serviço fosse consultar projetos, cairia no `?? []` e o teste passaria por
    // acidente. A prova de que ele NÃO consulta é o `codCliente` nulo com a lista vazia no retorno.
    const service = montar([[{ ...ADMISSAO_OK, codCliente: null }], []]);

    const r = await service.alocacaoDaAdmissao(ADMISSAO);

    expect(r.projetos).toEqual([]);
    expect(r.vinculo).toBeNull();
  });
});
