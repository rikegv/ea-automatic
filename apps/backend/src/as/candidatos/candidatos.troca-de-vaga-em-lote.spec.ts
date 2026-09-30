import { describe, expect, it, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ TROCAR A VAGA EM MASSA (item 1 da OST de 30/09/2026) ──────────────────────────────────────────
 *
 * ┌─ A EXIGÊNCIA QUE ESTE ARQUIVO GUARDA, NAS PALAVRAS DO DIRETOR ─────────────────────────────────┐
 * │ "Se uma linha falhar, o lote NÃO morre todo; relatório do que entrou e do que falhou."          │
 * │                                                                                                │
 * │ O CASO QUE SEPARA O CERTO DO ERRADO É A LINHA RUIM NO MEIO. Um lote que aborte no primeiro erro │
 * │ passaria num teste com a linha ruim no FIM, e é justamente esse teste confortável que não prova │
 * │ nada: a linha ruim está sempre no meio da seleção de verdade, e o consultor que selecionou      │
 * │ trinta pessoas descobriria, depois de tudo, que nada foi feito.                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE ARQUIVO MEDE, E O QUE ELE DE PROPÓSITO NÃO MEDE ───────────────────────────────────┐
 * │ ELE MEDE A CAMADA DO LOTE: o laço que não morre, o relatório por linha, a recusa do pedido      │
 * │ inteiro quando o problema é DA VAGA de destino, e a §A.6 na resposta.                          │
 * │                                                                                                │
 * │ ELE NÃO REMEDE AS TRAVAS DA `trocarVaga` (candidatura viva, teto do destino sob a linha         │
 * │ travada, pessoa que já está no destino, entrevista do cliente apagada na troca de cliente).     │
 * │ Elas têm spec próprio (`candidatos.transferencia-de-vaga.spec.ts`), e o LOTE não as reescreve:  │
 * │ ele chama a MESMA `trocarVaga`, N vezes. Duplicar aqui criaria uma segunda régua para dizer a   │
 * │ mesma coisa, que é como as duas passam a divergir.                                             │
 * │                                                                                                │
 * │ É POR ISSO QUE A AÇÃO INDIVIDUAL É ESPIONADA: o que está sob teste é a ORQUESTRAÇÃO, e trocar   │
 * │ a ação real por um dubleDaTroca é o que permite afirmar "a linha 2 explodiu e a 3 entrou" sem montar   │
 * │ duas vagas, um teto e um catálogo de entrevistas para provar um laço.                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: as iscas (nome e CPF) existem nas mensagens de erro de propósito, e a asserção é que NENHUMA
 * delas aparece na resposta do lote.
 */

const VAGA_DESTINO = "vaga-destino";
const AUTOR = "user-1";

/** AS ISCAS. Se a implementação repassar a mensagem crua de um erro qualquer, elas vazam. */
const CPF_ISCA = "39053344705";
const NOME_ISCA = "Marina Albuquerque Ferreira";

function servico(cenario: { statusDaVaga?: string; vagaExiste?: boolean } = {}) {
  const vaga = {
    id: VAGA_DESTINO,
    codigo: "PS-2026-777",
    status: cenario.statusDaVaga ?? "ABERTA",
    posicoesOficiais: 50,
    posicoesBanco: 0,
    codCliente: "CLI-A",
  };

  const db = {
    query: {
      vagas: {
        findFirst: async () => (cenario.vagaExiste === false ? undefined : { ...vaga }),
      },
    },
  };

  const service = new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );
  return service;
}

/**
 * A AÇÃO INDIVIDUAL, TROCADA POR UM DUBLÊ QUE FALHA NOS IDS ESCOLHIDOS. Ele guarda a ordem das
 * chamadas, que é o que prova que o laço SEGUIU depois do erro em vez de ter parado nele.
 */
function comTrocaQueFalhaEm(
  service: CandidatosService,
  falham: Record<string, unknown>,
): { chamadas: string[]; vagasPedidas: string[]; motivos: (string | undefined)[] } {
  const chamadas: string[] = [];
  const vagasPedidas: string[] = [];
  const motivos: (string | undefined)[] = [];
  const dubleDaTroca = vi.fn(async (id: string, dto: { vagaId: string; motivo?: string }) => {
    chamadas.push(id);
    vagasPedidas.push(dto.vagaId);
    motivos.push(dto.motivo);
    if (id in falham) throw falham[id];
    return undefined as never;
  });
  (service as unknown as Record<string, unknown>).trocarVaga = dubleDaTroca;
  return { chamadas, vagasPedidas, motivos };
}

const SELECAO = ["boa-1", "ruim-1", "boa-2", "ruim-2", "boa-3"];

describe("O lote de troca de vaga NÃO morre na primeira linha ruim", () => {
  /** AS DUAS RUINS FICAM NO MEIO, nunca no fim: ver o bloco do topo. */
  const duasRuins = () => ({
    "ruim-1": new NotFoundException("Candidatura não encontrada."),
    "ruim-2": new ConflictException(
      "A vaga de destino tem 1 posição e ela já está preenchida. Esta pessoa ocupa posição, então a troca deixaria a vaga acima do limite.",
    ),
  });

  it("aplica as 3 boas, relata as 2 ruins, e TENTA todas as 5", async () => {
    const service = servico();
    const { chamadas } = comTrocaQueFalhaEm(service, duasRuins());

    const r = await service.trocarVagaEmLote(
      { candidaturaIds: SELECAO, vagaId: VAGA_DESTINO },
      AUTOR,
    );

    expect(r.aplicadas).toBe(3);
    expect(r.falhas.map((f) => f.alvoId).sort()).toEqual(["ruim-1", "ruim-2"]);
    // A PROVA DE QUE O LAÇO SEGUIU: as cinco linhas foram tentadas, na ordem em que vieram.
    expect(chamadas).toEqual(SELECAO);
  });

  /** A falha aponta o ID QUE FOI ENVIADO, senão a tela não sabe qual linha marcar. */
  it("cada falha aponta um id que estava na seleção, e traz o motivo da recusa", async () => {
    const service = servico();
    comTrocaQueFalhaEm(service, duasRuins());

    const r = await service.trocarVagaEmLote(
      { candidaturaIds: SELECAO, vagaId: VAGA_DESTINO },
      AUTOR,
    );

    for (const f of r.falhas) {
      expect(SELECAO).toContain(f.alvoId);
      expect(f.motivo.length).toBeGreaterThan(0);
    }
    // O TETO DO DESTINO É A FALHA TÍPICA DESTE LOTE, e ela chega inteira na linha dela: é a frase
    // que explica por que metade da seleção entrou e metade não.
    const teto = r.falhas.find((f) => f.alvoId === "ruim-2")!;
    expect(teto.motivo).toContain("acima do limite");
  });

  /** A ORDEM NÃO IMPORTA: o mesmo conjunto, invertido, dá o mesmo resultado. */
  it("o lote invertido dá exatamente o mesmo resultado", async () => {
    const service = servico();
    comTrocaQueFalhaEm(service, duasRuins());

    const r = await service.trocarVagaEmLote(
      { candidaturaIds: [...SELECAO].reverse(), vagaId: VAGA_DESTINO },
      AUTOR,
    );

    expect(r.aplicadas).toBe(3);
    expect(r.falhas.map((f) => f.alvoId).sort()).toEqual(["ruim-1", "ruim-2"]);
  });

  /**
   * O LOTE TODO RUIM NÃO LANÇA: ele devolve cinco falhas. Uma implementação que propagasse a exceção
   * da última linha transformaria o relatório num erro de tela, e o consultor não saberia se ALGUMA
   * entrou.
   */
  it("com todas as linhas ruins, devolve relatório em vez de explodir", async () => {
    const service = servico();
    const todas = Object.fromEntries(
      SELECAO.map((id) => [id, new ConflictException("Esta candidatura já foi encerrada.")]),
    );
    comTrocaQueFalhaEm(service, todas);

    const r = await service.trocarVagaEmLote(
      { candidaturaIds: SELECAO, vagaId: VAGA_DESTINO },
      AUTOR,
    );

    expect(r.aplicadas).toBe(0);
    expect(r.falhas).toHaveLength(5);
  });
});

describe("O lote passa pelo MESMO caminho da ação individual", () => {
  it("cada linha recebe a vaga de destino do corpo, e o motivo da seleção", async () => {
    const service = servico();
    const { vagasPedidas, motivos } = comTrocaQueFalhaEm(service, {});

    await service.trocarVagaEmLote(
      { candidaturaIds: ["a", "b"], vagaId: VAGA_DESTINO, motivo: "vaga trocada na abertura" },
      AUTOR,
    );

    expect(vagasPedidas).toEqual([VAGA_DESTINO, VAGA_DESTINO]);
    expect(motivos).toEqual(["vaga trocada na abertura", "vaga trocada na abertura"]);
  });
});

describe("Problema DA VAGA de destino recusa o pedido INTEIRO, e nada é tentado", () => {
  /**
   * A PRÉ-CONFERÊNCIA DE UX, a mesma do lote de alocação: vaga encerrada é um problema só, e
   * devolver trinta falhas idênticas dizendo a mesma coisa não é relatório, é ruído.
   */
  it("vaga de destino FECHADA lança, e nenhuma linha é tocada", async () => {
    const service = servico({ statusDaVaga: "FECHADA" });
    const { chamadas } = comTrocaQueFalhaEm(service, {});

    await expect(
      service.trocarVagaEmLote({ candidaturaIds: SELECAO, vagaId: VAGA_DESTINO }, AUTOR),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(chamadas).toEqual([]);
  });

  it("vaga de destino inexistente lança, e nenhuma linha é tocada", async () => {
    const service = servico({ vagaExiste: false });
    const { chamadas } = comTrocaQueFalhaEm(service, {});

    await expect(
      service.trocarVagaEmLote({ candidaturaIds: SELECAO, vagaId: VAGA_DESTINO }, AUTOR),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(chamadas).toEqual([]);
  });
});

describe("A resposta do lote NÃO carrega dado pessoal (§A.6)", () => {
  /**
   * O RISCO QUE SÓ EXISTE NO LOTE: a resposta vai para o toast, para a área de transferência e para
   * o log de qualquer cliente HTTP no caminho. Erro CRU de banco traz o VALOR que violou a
   * restrição (o CPF, no índice de candidato), e repassá-lo publicaria o número num relatório que a
   * tela copia inteiro. O lote responde com frase genérica para o que não é `HttpException`.
   */
  it("erro cru com CPF e nome não vaza: a falha traz id e motivo de processo", async () => {
    const service = servico();
    comTrocaQueFalhaEm(service, {
      "ruim-1": new Error(
        `duplicate key value violates unique constraint: (cpf)=(${CPF_ISCA}) de ${NOME_ISCA}`,
      ),
    });

    const r = await service.trocarVagaEmLote(
      { candidaturaIds: ["boa-1", "ruim-1"], vagaId: VAGA_DESTINO },
      AUTOR,
    );

    const serializado = JSON.stringify(r);
    expect(serializado).not.toContain(CPF_ISCA);
    expect(serializado).not.toContain(NOME_ISCA);
    expect(r.falhas[0].alvoId).toBe("ruim-1");
  });

  /** O relatório identifica a linha por ID, e o ID é o da CANDIDATURA que a tela mandou. */
  it("a falha identifica a linha por id, nunca por nome", async () => {
    const service = servico();
    comTrocaQueFalhaEm(service, { "ruim-1": new ConflictException("Esta candidatura já saiu.") });

    const r = await service.trocarVagaEmLote(
      { candidaturaIds: ["ruim-1"], vagaId: VAGA_DESTINO },
      AUTOR,
    );

    expect(r.falhas).toEqual([{ alvoId: "ruim-1", motivo: "Esta candidatura já saiu." }]);
  });
});
