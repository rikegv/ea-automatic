import { describe, expect, it } from "vitest";
import { bancoDaBuscaComFunil } from "./busca-funil.tester-fake";

/**
 * ─ O CASO QUE O DIRETOR RELATOU, como teste de aceitacao ────────────────────────────────────────
 *
 * Medido na producao em 02/10/2026: TODAS as candidatas que ele procurou tem candidatura ATIVA em
 * etapa CAPTACAO, em vaga de status `PENDENTE_REVISAO` e SEM CLIENTE. A ficha mostrava "Em
 * Captacao" (ela e outra rota, `GET /as/candidatos/:id`, e devolve as candidaturas em UMA chamada),
 * enquanto a lista jurava "Vaga Nao Alocada". A ficha estava certa; a lista estava cega.
 *
 * ┌─ POR QUE ISTO E TESTE, e nao observacao ────────────────────────────────────────────────────┐
 * │ O conserto tem uma tentacao obvia: filtrar a vaga por status, ou so trazer o funil da vaga  │
 * │ que "esta valendo". Esse filtro quebraria EXATAMENTE o caso real do diretor, porque todas as │
 * │ vagas dele estao em `PENDENTE_REVISAO`, e o 429 teria sido trocado por uma cegueira mais     │
 * │ discreta, que ninguem veria porque nenhum erro apareceria na tela.                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E A COLUNA DE VAGA NAO PODE DEPENDER DE `/as/vagas` (emenda E-2): `vagaCodigo` e `vagaNome` vem
 * na propria projecao de proposito, porque aquela lista e FILTRADA POR STATUS. Resolvendo o nome da
 * vaga por ela, vaga encerrada ou em revisao pintaria "nao informado" numa linha que TEM vaga.
 */

function cenarioDasCandidatasDoDiretor() {
  return bancoDaBuscaComFunil({
    pessoas: [
      { id: "p-1", nome: "Debora Campos De Oliveira", origem: "PANDAPE" },
      { id: "p-2", nome: "Debora Da Silva Oliveira", origem: "PANDAPE" },
    ],
    candidaturas: [
      {
        id: "c-1",
        candidatoId: "p-1",
        vagaId: "v-1",
        vagaCodigo: "3572904",
        vagaNome: "Auxiliar De Limpeza",
        etapa: "CAPTACAO",
        situacao: "ATIVO",
        vagaStatus: "PENDENTE_REVISAO",
      },
      {
        id: "c-2",
        candidatoId: "p-2",
        vagaId: "v-2",
        vagaCodigo: "3763601",
        vagaNome: "Porteiro",
        etapa: "CAPTACAO",
        situacao: "ATIVO",
        vagaStatus: "PENDENTE_REVISAO",
      },
    ],
  });
}

describe("vaga em PENDENTE_REVISAO e sem cliente vem com o funil preenchido", () => {
  it("as duas candidatas vem com etapa CAPTACAO e situacao ATIVO", async () => {
    const { service } = cenarioDasCandidatasDoDiretor();
    const pagina = await service.buscar({ nome: "debora" });

    expect(pagina.itens).toHaveLength(2);
    for (const item of pagina.itens) {
      expect(
        item.candidaturas,
        "funil vazio em quem TEM vaga e o defeito que o diretor relatou, agora sem o 429 para explica-lo.",
      ).toHaveLength(1);
      expect(item.candidaturas![0].etapa).toBe("CAPTACAO");
      expect(item.candidaturas![0].situacao).toBe("ATIVO");
    }
  });

  it("o funil nao e filtrado por status da vaga: a clausula nao cita status nenhum", async () => {
    const cenario = cenarioDasCandidatasDoDiretor();
    await cenario.service.buscar({ nome: "debora" });

    const funil = cenario.doFunil;
    expect(funil).toBeDefined();
    for (const status of ["ABERTA", "PENDENTE_REVISAO", "FECHADA", "ENCERRADA", "CANCELADA"]) {
      expect(
        funil!.where,
        `filtro por status na leitura do funil apaga da lista a vaga em revisao, que e o caso real de 100% das candidatas procuradas.`,
      ).not.toContain(status);
    }
  });

  it("vaga sem cliente nao suprime a candidatura", async () => {
    const { service } = bancoDaBuscaComFunil({
      pessoas: [{ id: "p-1", nome: "Debora Oliveira" }],
      candidaturas: [
        {
          id: "c-1",
          candidatoId: "p-1",
          vagaId: "v-1",
          vagaCodigo: "3435230",
          vagaNome: "Agente De Portaria",
          vagaStatus: "PENDENTE_REVISAO",
        },
      ],
    });
    const pagina = await service.buscar({});
    expect(pagina.itens[0]!.candidaturas).toHaveLength(1);
  });
});

describe("a coluna de vaga nao depende da lista `/as/vagas`", () => {
  it("codigo e nome da vaga vem na propria projecao, para vaga em PENDENTE_REVISAO", async () => {
    const { service } = cenarioDasCandidatasDoDiretor();
    const pagina = await service.buscar({ nome: "debora" });

    const primeira = pagina.itens[0]!.candidaturas![0];
    expect(
      primeira.vagaCodigo,
      "sem o codigo, a coluna pinta 'nao informado' numa linha que TEM vaga.",
    ).toBe("3572904");
    expect(primeira.vagaNome).toBe("Auxiliar De Limpeza");
    expect(primeira.vagaId).toBe("v-1");
  });

  it("vaga ENCERRADA tambem traz codigo e nome, mesmo nao estando na lista de vagas", async () => {
    const { service } = bancoDaBuscaComFunil({
      pessoas: [{ id: "p-1", nome: "Pessoa De Vaga Encerrada" }],
      candidaturas: [
        {
          id: "c-1",
          candidatoId: "p-1",
          vagaId: "v-9",
          vagaCodigo: "3100001",
          vagaNome: "Repositor",
          etapa: "CAPTACAO",
          situacao: "DESCARTADO",
          vagaStatus: "ENCERRADA",
        },
      ],
    });
    const pagina = await service.buscar({});
    const c = pagina.itens[0]!.candidaturas![0];

    expect(c.vagaCodigo).toBe("3100001");
    expect(c.vagaNome).toBe("Repositor");
  });
});
