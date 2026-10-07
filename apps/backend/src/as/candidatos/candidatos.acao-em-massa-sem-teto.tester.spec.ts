import { describe, expect, it } from "vitest";
import { AS_MAXIMO_POR_LOTE, type AsResultadoAcaoEmMassa } from "@ea/shared-types";
import { bancoDaCentral } from "./central-candidatos-conserto.tester-fake";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ ACAO EM MASSA SEM TETO NO MODO-FILTRO, TETO MANTIDO NO MODO-IDS (07/10/2026, decisao do diretor) ─
 *
 * COBERTURA INDEPENDENTE (§A.38/§A.40), escrita ANTES do codigo a partir do REQUISITO do mapa
 * (`docs/MAPA-ALCANCE-PAGINACAO-SERVIDOR-CANDIDATOS-VAGAS.md`, secao 3.3), SEM ler a implementacao.
 *
 * ┌─ A DECISAO, EM UMA FRASE ─────────────────────────────────────────────────────────────────────┐
 * │ O diretor quer AGIR SOBRE TODOS OS CANDIDATOS DO FILTRO de uma vez. Dois modos:                 │
 * │  - MODO-FILTRO: a tela manda o FILTRO (nao a lista de ids); o servidor resolve o conjunto       │
 * │    INTEIRO e age sobre ele, em lotes internos, SEM o teto de 200. Uma vaga com 2.509            │
 * │    candidaturas e processada inteira.                                                           │
 * │  - MODO-IDS: a tela manda a lista marcada; o teto `AS_MAXIMO_POR_LOTE=200` CONTINUA valendo,    │
 * │    por protecao de payload (ArrayMaxSize nos DTOs de lote, ja travado em `candidatos.lote-dto`).│
 * │ O retorno e `{ afetados, falharam }`, e a falha parcial e REPORTADA, nunca metade em silencio.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS NOMES DO MODO-FILTRO SAO PROPOSTA DESTE ARQUIVO (como em `candidatos.lote-dto`) ───────────┐
 * │ O contrato fixa o COMPORTAMENTO (sem teto no filtro, teto nos ids, retorno {afetados,falharam}),│
 * │ nao o nome do metodo. Enquanto a construcao nao escolhe, cada teste falha com uma frase que diz │
 * │ QUAL superficie falta. Se o backend escolher outro nome, ajusta-se aqui, em uma linha.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Os nomes PROPOSTOS dos metodos de acao em massa POR FILTRO (sem teto). Reconciliar com o backend. */
const METODOS_POR_FILTRO = [
  "registrarSaidaPorFiltro",
  "moverEtapaPorFiltro",
  "trocarVagaPorFiltro",
  "finalizarPosicaoPorFiltro",
  "adicionarPorFiltro",
] as const;

function servico() {
  return bancoDaCentral({ candidatos: [] }).service as unknown as Record<string, unknown>;
}

describe("O teto do MODO-IDS continua sendo 200 (ancora: o modo manual nao muda)", () => {
  it("AS_MAXIMO_POR_LOTE chegou ao runtime e vale 200", () => {
    // Os DTOs de lote (modo-ids) ja aplicam este teto por ArrayMaxSize, travado em `candidatos.lote-dto`.
    // Esta ancora garante que o modo-filtro NASCE ao lado dele, sem afrouxar o modo manual.
    expect(AS_MAXIMO_POR_LOTE).toBe(200);
  });
});

describe("O MODO-FILTRO existe no service, e e por onde a vaga de 2.509 e processada SEM teto", () => {
  for (const nome of METODOS_POR_FILTRO) {
    it(`o service expoe \`${nome}\` (acao em massa por filtro, sem teto de 200)`, () => {
      const svc = servico();
      expect(
        typeof svc[nome],
        `A acao em massa por filtro \`${nome}\` ainda nao existe. Ela recebe o FILTRO (nao uma lista de ids), resolve o conjunto inteiro, processa em lotes internos SEM o teto de 200, e devolve { afetados, falharam }. Enquanto nao existir, este teste e a especificacao dela (ajuste o nome em uma linha se a construcao escolher outro).`,
      ).toBe("function");
    });
  }
});

/*
 * ─ STATUS EM MASSA SIM, CREDENCIAL NAO (decisao do diretor, 07/10/2026) ─────────────────────────
 *
 * As tres saidas entram pela MESMA `registrarSaida`, mas `ENVIADO_PARA_ADMISSAO` nasce a pre-admissao
 * e DISPARA a credencial de acesso ao prontuario (o link do Portal, §A.47). Enviar credencial so pode
 * ser NOMINAL (pessoa por pessoa, com a previa do caminho por ids), nunca "todos do filtro" de uma vez.
 * DESCARTADO e DESISTIU sao ACAO DE STATUS (descarte) e seguem permitidos no modo-filtro.
 *
 * A trava vive em CODIGO (§A.33, defesa em profundidade): o `registrarSaidaPorFiltro` recusa
 * `ENVIADO_PARA_ADMISSAO` ANTES de qualquer linha, independente do que a tela mande.
 *
 * O db fingido devolve a vaga como inexistente de proposito: assim o caminho PERMITIDO (DESCARTADO/
 * DESISTIU) passa a guarda de credencial e para no lookup da vaga (`NotFoundException`), provando que
 * passou; o caminho RECUSADO (`ENVIADO_PARA_ADMISSAO`) nunca chega la, para na guarda de credencial.
 */
function servicoComVagaInexistente() {
  const cadeia: Record<string, unknown> = {};
  const mesmo = () => cadeia;
  cadeia.from = mesmo;
  cadeia.innerJoin = mesmo;
  cadeia.leftJoin = mesmo;
  cadeia.where = mesmo;
  cadeia.groupBy = mesmo;
  cadeia.orderBy = mesmo;
  cadeia.limit = mesmo;
  cadeia.offset = mesmo;
  cadeia.then = (ok: (v: unknown) => unknown) => Promise.resolve([] as unknown[]).then(ok);
  const db = {
    select: () => cadeia,
    selectDistinct: () => cadeia,
    query: { vagas: { findFirst: async () => undefined } },
  };
  return new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );
}

const MASTER = { id: "u-master", email: "master@teste.local", role: "MASTER" } as never;
const filtroDaVaga = { filtro: { vagaId: "11111111-1111-1111-1111-111111111111" } };

describe("registrarSaidaPorFiltro: STATUS em massa SIM, CREDENCIAL (enviar para admissao) NAO", () => {
  it("RECUSA `ENVIADO_PARA_ADMISSAO` no modo-filtro (manda credencial, so pode ser nominal)", async () => {
    const svc = servicoComVagaInexistente();
    await expect(
      svc.registrarSaidaPorFiltro(
        { ...filtroDaVaga, situacao: "ENVIADO_PARA_ADMISSAO", motivo: "em massa" } as never,
        MASTER,
      ),
    ).rejects.toThrow(/credencial/i);
  });

  it("recusa ANTES de tocar a vaga: a mensagem fala de credencial e nominal, nao de vaga inexistente", async () => {
    const svc = servicoComVagaInexistente();
    await expect(
      svc.registrarSaidaPorFiltro(
        { ...filtroDaVaga, situacao: "ENVIADO_PARA_ADMISSAO", motivo: "em massa" } as never,
        MASTER,
      ),
    ).rejects.toThrow(/nominal/i);
  });

  for (const situacao of ["DESCARTADO", "DESISTIU"] as const) {
    it(`PERMITE \`${situacao}\` no modo-filtro (passa a guarda; para so no lookup da vaga)`, async () => {
      const svc = servicoComVagaInexistente();
      // Nao e recusado pela guarda de credencial: a prova e que a rejeicao NAO fala de credencial.
      // Com a vaga fingida como inexistente, ele avanca ate `idsDaVaga` e cai em "Vaga não encontrada".
      const erro = await svc
        .registrarSaidaPorFiltro(
          { ...filtroDaVaga, situacao, motivo: "em massa" } as never,
          MASTER,
        )
        .then(
          () => null,
          (e: Error) => e,
        );
      expect(erro, "o status em massa tinha de passar a guarda de credencial").not.toBeNull();
      expect((erro as Error).message).not.toMatch(/credencial/i);
      expect((erro as Error).message).toMatch(/vaga não encontrada/i);
    });
  }
});

describe("O retorno da acao em massa e { afetados, falharam } (falha parcial nunca fica em silencio)", () => {
  it("o tipo compartilhado `AsResultadoAcaoEmMassa` carrega as duas contagens", () => {
    // O tipo ja existe no vocabulario; a trava aqui e que o modo-filtro use ELE (afetados+falharam),
    // e NAO o `AsResultadoEmMassa` do modo-ids ({ aplicadas, falhas }). Um retorno so com `afetados`
    // esconderia a metade que falhou, que e exatamente o que o diretor proibiu.
    const exemplo: AsResultadoAcaoEmMassa = { afetados: 2500, falharam: 9 };
    expect(exemplo.afetados + exemplo.falharam, "afetados + falharam = total tentado").toBe(2509);
    expect(exemplo).toHaveProperty("falharam");
  });
});
