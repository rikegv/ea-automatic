import { describe, expect, it, vi } from "vitest";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ /opcoes: OS FILTROS VEM DA BASE DE CANDIDATOS, NAO DE `/as/vagas` (06/10/2026) ────────────────
 *
 * Os clientes, cargos e vagas DISTINTOS que aparecem nas candidaturas. Desacopla a Central de
 * Candidatos do `/as/vagas` filtrado pela Central de Vagas, que so traz liberadas e encolhia estes
 * filtros. §A.37: a opcao do filtro vem de endpoint. §A.6: so rotulo/codigo de catalogo.
 *
 * O FINGIDO E SCRIPTADO, e nao behavioral: `opcoes` emite tres `selectDistinct` independentes (um por
 * eixo), e o que o teste assere e que cada eixo vira sua lista, com o nulo do codigo preservado. O
 * `selectDistinct` do driver ja garante os DISTINTOS; o teste nao reimplementa o banco.
 */

function bancoScriptado() {
  const chamadas: string[] = [];

  function chain(resultado: unknown[]) {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.innerJoin = () => c;
    c.orderBy = () => c;
    c.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(ok, falha);
    return c;
  }

  const db = {
    selectDistinct: vi.fn((selecao: Record<string, unknown>) => {
      const chaves = Object.keys(selecao);
      // O EIXO SE LE PELAS CHAVES DO select, que sao distintas em cada consulta de `opcoes`.
      if (chaves.includes("codCliente")) {
        chamadas.push("clientes");
        return chain([
          { codCliente: "C1", nome: "Operacao Praia Grande" },
          { codCliente: "C2", nome: "Operacao Centro" },
        ]);
      }
      if (chaves.includes("codigo")) {
        chamadas.push("vagas");
        return chain([
          { id: "v1", codigo: "3572904", nome: "Atendente De Farmacia" },
          // VAGA SEM CODIGO: o nulo do codigo tem de sobreviver, nao virar string vazia.
          { id: "v2", codigo: null, nome: "Espelho Pandape" },
        ]);
      }
      chamadas.push("cargos");
      return chain([
        { id: "g1", nome: "Atendente De Farmacia" },
        { id: "g2", nome: "Auxiliar De Limpeza" },
      ]);
    }),
  };

  const service = new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );

  return { service, chamadas };
}

describe("GET /as/candidatos/opcoes devolve os distintos dos tres eixos", () => {
  it("monta clientes, cargos e vagas, cada eixo no seu formato", async () => {
    const { service, chamadas } = bancoScriptado();

    const opcoes = await service.opcoes();

    // UM `selectDistinct` por eixo: o distinct mora no banco, nao numa deduplicacao na memoria.
    expect(chamadas.sort()).toEqual(["cargos", "clientes", "vagas"]);

    expect(opcoes.clientes).toEqual([
      { codCliente: "C1", nome: "Operacao Praia Grande" },
      { codCliente: "C2", nome: "Operacao Centro" },
    ]);
    expect(opcoes.cargos).toEqual([
      { id: "g1", nome: "Atendente De Farmacia" },
      { id: "g2", nome: "Auxiliar De Limpeza" },
    ]);
    expect(opcoes.vagas).toEqual([
      { id: "v1", codigo: "3572904", nome: "Atendente De Farmacia" },
      { id: "v2", codigo: null, nome: "Espelho Pandape" },
    ]);
  });
});
