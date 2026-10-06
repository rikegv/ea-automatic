import { describe, expect, it } from "vitest";
import { bancoDaBuscaComFunil } from "./busca-funil.tester-fake";

/**
 * ─ CLIENTE E CARGO VEM DO FUNIL, e nao mais do mapa de `/as/vagas` (06/10/2026) ──────────────────
 *
 * A Central de Candidatos cruzava a `vagaId` de cada candidatura contra `GET /as/vagas` para achar
 * cliente/cargo. A Central de Vagas (05/10) passou a devolver so vaga LIBERADA, entao a vaga em
 * revisao (94% da base) sumiu daquele mapa e o cargo passou a pintar "nao informado" numa linha que
 * TEM cargo. O conserto trouxe os dois para a projecao do proprio `buscar`.
 *
 * O NULO E ESTADO LEGITIMO, e nao falha: a vaga em revisao tem `cod_cliente`/`cargo_id` nulos porque
 * o cliente so nasce quando o time libera a vaga. A projecao usa `leftJoin`, entao a candidatura
 * continua aparecendo com cliente/cargo nulos, em vez de ser apagada por um inner.
 */
describe("a lista projeta cliente e cargo da vaga, do proprio funil", () => {
  it("devolve `clienteNome` e `cargoNome` quando a vaga os tem", async () => {
    const { service } = bancoDaBuscaComFunil({
      pessoas: [{ id: "pessoa-1", nome: "Samara Dias" }],
      candidaturas: [
        {
          id: "cand-1",
          candidatoId: "pessoa-1",
          vagaId: "vaga-1",
          vagaCodigo: "3572904",
          vagaNome: "Atendente De Farmacia, Praia Grande",
          clienteNome: "Operacao Praia Grande",
          cargoNome: "Atendente De Farmacia",
          etapa: "CAPTACAO",
          situacao: "ATIVO",
        },
      ],
    });

    const pagina = await service.buscar({});
    const c = pagina.itens[0]?.candidaturas?.[0];

    expect(c?.clienteNome).toBe("Operacao Praia Grande");
    expect(c?.cargoNome).toBe("Atendente De Farmacia");
  });

  it("devolve NULO, e nao apaga a linha, quando a vaga em revisao nao tem cliente/cargo", async () => {
    const { service } = bancoDaBuscaComFunil({
      pessoas: [{ id: "pessoa-1", nome: "Daniela Rocha" }],
      candidaturas: [
        {
          id: "cand-1",
          candidatoId: "pessoa-1",
          vagaId: "vaga-1",
          vagaCodigo: "9001",
          vagaNome: "Espelho Pandape",
          clienteNome: null,
          cargoNome: null,
          vagaStatus: "PENDENTE_REVISAO",
        },
      ],
    });

    const pagina = await service.buscar({});
    const candidaturas = pagina.itens[0]?.candidaturas;

    // A CANDIDATURA CONTINUA LA (leftJoin), so com cliente/cargo nulos.
    expect(candidaturas).toHaveLength(1);
    expect(candidaturas![0].clienteNome).toBeNull();
    expect(candidaturas![0].cargoNome).toBeNull();
    // A vaga em si NAO some: o conserto nao reintroduz o filtro de status que causou a regressao.
    expect(candidaturas![0].vagaNome).toBe("Espelho Pandape");
  });
});
