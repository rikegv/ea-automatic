import { describe, expect, it } from "vitest";
import {
  bancoDaCentral,
  type CandidatoFingido,
  type CandidaturaFingida,
} from "./central-candidatos-conserto.tester-fake";

/**
 * ─ ESCOPO, CLIENTE E ETAPA VIRARAM PREDICADO SERVER-SIDE, NA BASE (paginacao no servidor, 07/10) ─
 *
 * Os tres filtros recortavam a tela em `linhasSemCard` (`as/candidatos/page.tsx`); nunca houve como
 * aplica-los no navegador sobre 83 mil linhas que ele deixou de segurar. Esta cobertura prova, pelo
 * SQL RENDERIZADO (o fingido devolve a clausula montada de verdade), que:
 *
 *   1. cada filtro entra na consulta PAGINADA (a lista), e
 *   2. cada filtro entra TAMBEM nas duas agregacoes do KPI (porEtapa/porSituacao), porque ele mora na
 *      BASE (`filtros`) e o `kpisDaBusca` recebe `and(...filtros)`. E isso que faz o card concordar
 *      com a tabela: recortou a lista, recortou a conta do card, pela MESMA expressao.
 *
 * O oraculo e ESTRUTURAL de proposito: prova que o predicado chegou aos dois lugares, que e a
 * invariante do §6 do mapa, sem depender de o fingido simular o casamento linha a linha de um
 * `exists` correlacionado.
 */

function cenario() {
  const candidatos: CandidatoFingido[] = [
    { id: "p-ativo", nome: "Ana Ativo", origem: "PANDAPE" },
    { id: "p-desf", nome: "Bruno Desfecho", origem: "PANDAPE" },
    { id: "p-sem", nome: "Clara Sem Funil", origem: "MANUAL" },
  ];
  const candidaturas: CandidaturaFingida[] = [
    { id: "c-ativo", candidatoId: "p-ativo", vagaId: "v1", etapa: "TRIAGEM", situacao: "ATIVO" },
    { id: "c-desf", candidatoId: "p-desf", vagaId: "v1", etapa: "TRIAGEM", situacao: "DESCARTADO" },
  ];
  return bancoDaCentral({
    candidatos,
    candidaturas,
    vagas: [{ id: "v1", codigo: "VG-1", nomeDivulgacao: "Vaga 1", codCliente: "CLI1", cargoId: "cg1" }],
    clientes: [{ codCliente: "CLI1", razaoSocial: "Soulan RS", nomeOperacao: "Soulan SP" }],
    cargos: [{ id: "cg1", nome: "Atendente" }],
  });
}

/** As clausulas das DUAS agregacoes do KPI (porEtapa e porSituacao). */
function wheresDoKpi(banco: ReturnType<typeof bancoDaCentral>): string[] {
  return banco.agregacoes.map((q) => q.where);
}

describe("escopo/cliente/etapa sao predicados server-side, na BASE da lista e do KPI", () => {
  it("SEM os filtros, nenhum deles aparece na consulta (baseline)", async () => {
    const banco = cenario();
    await banco.service.buscar({});

    expect(banco.paginada?.where ?? "").not.toContain("<>");
    expect(banco.paginada?.where ?? "").not.toContain("coalesce");
    // sem etapa, a lista nao carrega um `exists` por codigo de etapa.
    expect(banco.paginada?.where ?? "").not.toContain("TRIAGEM");
  });

  it("escopo=historico recorta a lista E o KPI por `situacao <> ATIVO`", async () => {
    const banco = cenario();
    const pagina = await banco.service.buscar({ escopo: "historico" });

    // 1. a LISTA leva o predicado.
    expect(banco.paginada?.where, "a lista paginada recorta por desfecho").toContain("<>");
    expect(banco.paginada?.where).toContain("ATIVO");

    // 2. o KPI vem (offset 0) e as DUAS agregacoes levam o MESMO predicado: card = tabela.
    expect(pagina.kpis, "o KPI vem na primeira pagina do filtro").toBeDefined();
    const wheres = wheresDoKpi(banco);
    expect(wheres.length, "porEtapa e porSituacao").toBe(2);
    for (const w of wheres) {
      expect(w, "o escopo entra na BASE dos KPIs, nao so na lista").toContain("<>");
    }
  });

  it("escopo=andamento recorta por `sem candidatura OU ATIVO` (a linha sem funil fica em andamento)", async () => {
    const banco = cenario();
    await banco.service.buscar({ escopo: "andamento" });

    const w = banco.paginada?.where ?? "";
    // o OU entre "sem candidatura nenhuma" e "tem ao menos uma ATIVO".
    expect(w, "andamento tem o ramo 'sem candidatura nenhuma'").toContain("not exists");
    expect(w).toContain(" or ");
    expect(w).toContain("ATIVO");
  });

  it("cliente casa pelo NOME DE EXIBICAO (coalesce) na lista E no KPI", async () => {
    const banco = cenario();
    await banco.service.buscar({ cliente: "Soulan SP" });

    const wLista = banco.paginada?.where ?? "";
    expect(wLista, "casa por coalesce(operacao, razao), nao por codigo").toContain("coalesce");
    expect(wLista).toContain("nome_operacao");
    expect(wLista).toContain("razao_social");
    expect(wLista, "o nome de exibicao recebido vai para a clausula").toContain("Soulan SP");

    for (const w of wheresDoKpi(banco)) {
      expect(w, "o cliente entra na BASE dos KPIs").toContain("coalesce");
      expect(w).toContain("Soulan SP");
    }
  });

  it("etapa casa SO-VIVOS (`situacao in (...vivas)` + `etapa = codigo`) na lista E no KPI", async () => {
    const banco = cenario();
    await banco.service.buscar({ etapa: "TRIAGEM" });

    const wLista = banco.paginada?.where ?? "";
    expect(wLista, "o alcance so-vivos vem do `in (...SITUACOES_VIVAS)`").toContain(" in (");
    expect(wLista).toContain("APROVADO"); // uma das vivas listadas
    expect(wLista, "o codigo de etapa recebido vai para a clausula").toContain("TRIAGEM");

    for (const w of wheresDoKpi(banco)) {
      expect(w, "a etapa entra na BASE dos KPIs").toContain("TRIAGEM");
    }
  });
});
