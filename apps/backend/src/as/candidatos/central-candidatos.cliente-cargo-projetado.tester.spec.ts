import { describe, expect, it } from "vitest";
import { bancoDaCentral } from "./central-candidatos-conserto.tester-fake";

/**
 * ─ CLIENTE E CARGO VEM DA PROJECAO DO FUNIL, NAO DO MAPA DE `/as/vagas` (§A.27) ────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), REQUISITO do mapa (item 1): a Central de Candidatos cruzava a
 * `vagaId` contra `GET /as/vagas` para achar cliente/cargo. A Central de Vagas (05/10) fez aquela
 * rota devolver SO vaga liberada, e cliente/cargo da vaga em revisao sumiram da tela embora a vaga
 * exista. O conserto traz cliente/cargo na propria projecao do funil, do mesmo join com `vagas`.
 *
 * AS DUAS METADES DO REQUISITO, e so as duas juntas fecham:
 *  1. vaga COM cliente/cargo traz `clienteNome`/`cargoNome` preenchidos;
 *  2. vaga EM REVISAO sem cliente traz nulo e NAO some, NAO quebra, NAO vira erro. SEM filtro de
 *     status da vaga: a candidatura de vaga em revisao APARECE na lista (e a maioria da base).
 */

const CLIENTES = [{ codCliente: "C1", razaoSocial: "Soulan Servicos LTDA", nomeOperacao: "Soulan Operacao Sul" }];
const CARGOS = [{ id: "G1", nome: "Auxiliar De Limpeza" }];

const VAGAS = [
  { id: "vaga-liberada", codigo: "777", nomeDivulgacao: "Auxiliar De Limpeza", status: "ABERTA", codCliente: "C1", cargoId: "G1" },
  // Vaga espelho do Pandape em revisao: SEM cliente e SEM cargo (o caso de 94% da base).
  { id: "vaga-revisao", codigo: "888", nomeDivulgacao: "Atendente De Farmacia", status: "PENDENTE_REVISAO", codCliente: null, cargoId: null },
  // Vaga em revisao que JA tem cargo mas ainda nao cliente (os ~19 mil que a regressao cegou).
  { id: "vaga-revisao-com-cargo", codigo: "999", nomeDivulgacao: "Operador De Caixa", status: "PENDENTE_REVISAO", codCliente: null, cargoId: "G1" },
];

function cenario() {
  return bancoDaCentral({
    candidatos: [
      { id: "p-lib", nome: "Debora Campos", origem: "PANDAPE" },
      { id: "p-rev", nome: "Samara Nunes", origem: "PANDAPE" },
      { id: "p-rev-cargo", nome: "Bianca Souza", origem: "PANDAPE" },
    ],
    candidaturas: [
      { id: "k-lib", candidatoId: "p-lib", vagaId: "vaga-liberada", etapa: "CAPTACAO", situacao: "ATIVO" },
      { id: "k-rev", candidatoId: "p-rev", vagaId: "vaga-revisao", etapa: "CAPTACAO", situacao: "ATIVO" },
      { id: "k-rev-cargo", candidatoId: "p-rev-cargo", vagaId: "vaga-revisao-com-cargo", etapa: "CAPTACAO", situacao: "ATIVO" },
    ],
    vagas: VAGAS,
    clientes: CLIENTES,
    cargos: CARGOS,
  });
}

function candidaturaDe(pagina: Awaited<ReturnType<ReturnType<typeof cenario>["service"]["buscar"]>>, pessoaId: string) {
  const item = pagina.itens.find((i) => i.id === pessoaId);
  return item?.candidaturas?.[0];
}

describe("cliente e cargo descem na projecao do funil", () => {
  it("vaga liberada com cliente e cargo traz clienteNome e cargoNome (coalesce operacao/razao)", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    const c = candidaturaDe(pagina, "p-lib");

    expect(c, "a candidatura da vaga liberada tem de aparecer").toBeDefined();
    expect(c!.clienteNome, "coalesce(nomeOperacao, razaoSocial)").toBe("Soulan Operacao Sul");
    expect(c!.cargoNome).toBe("Auxiliar De Limpeza");
  });

  it("vaga em revisao SEM cliente traz clienteNome=null e NAO quebra", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    const c = candidaturaDe(pagina, "p-rev");

    expect(c, "a candidatura de vaga em revisao NAO pode ser cortada (sem filtro de status)").toBeDefined();
    expect(c!.clienteNome).toBeNull();
    expect(c!.cargoNome).toBeNull();
    // A vaga continua la: o que falta e o cliente, nao a vaga.
    expect(c!.vagaNome).toBe("Atendente De Farmacia");
  });

  it("vaga em revisao que TEM cargo volta a mostrar o cargo (o que a regressao cegou)", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    const c = candidaturaDe(pagina, "p-rev-cargo");

    expect(c).toBeDefined();
    expect(c!.cargoNome, "cargo da vaga em revisao volta a aparecer").toBe("Auxiliar De Limpeza");
    expect(c!.clienteNome, "mas o cliente ainda nao nasceu (vaga nao liberada)").toBeNull();
  });

  it("as tres pessoas aparecem: o conserto NAO reintroduz filtro de status de vaga", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map((i) => i.id).sort()).toEqual(["p-lib", "p-rev", "p-rev-cargo"]);
    // Toda pessoa tem a candidatura dela, inclusive as de vaga em revisao.
    for (const i of pagina.itens) {
      expect(i.candidaturas, `${i.id} perdeu o funil`).toHaveLength(1);
    }
  });
});
