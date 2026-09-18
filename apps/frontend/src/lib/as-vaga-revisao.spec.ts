import { beforeAll, describe, expect, it, vi } from "vitest";
import { VAGA_STATUS_SEMENTE, type VagaStatusItem } from "@ea/shared-types";

/**
 * ─ A VAGA QUE ENTROU SOZINHA: O PAPEL SUBSTITUI O LITERAL, E A FILA TEM UMA CONDIÇÃO SÓ ────────
 *
 * O QUE ESTE ARQUIVO PROTEGE, e é o defeito MEDIDO que originou a frente: a vaga espelhada pela
 * varredura do Pandapé (código `PENDENTE_REVISAO`, papel `REVISAO`) não casa com NENHUM literal de
 * status do frontend. Enquanto as decisões eram por literal, ela:
 *   . aparecia na trilha como "Vaga Aberta", uma vaga SEM CLIENTE anunciada como aberta;
 *   . ficava sem as ações que dependiam de `=== "ABERTA"`, sem nada falhar;
 *   . e, pior, seria oferecida no seletor de alocação no dia em que alguém trocasse o literal pela
 *     pergunta ERRADA (`recebeCandidato`), que ela responde `true`.
 *
 * O TERCEIRO É O CASO DE SEGURANÇA, e ele tem teste próprio aqui embaixo: a vaga pendente RECEBE
 * candidatura da INGESTÃO e mesmo assim NÃO é destino de alocação manual, porque enquanto o cliente
 * for nulo não há finalidade determinada para o dado daquelas pessoas.
 *
 * O CATÁLOGO É INJETADO PELA REDE, e é por isso que o `apiFetch` é fingido: `PENDENTE_REVISAO` não
 * existe na semente do vocabulário compartilhado (ele nasce da migration, no banco), então sem a
 * leitura não haveria como exercitar o papel novo.
 */

/** A linha que a migration cria, como o catálogo a serve. Espelha o desenho fechado pela auditoria. */
const PENDENTE_REVISAO: VagaStatusItem = {
  codigo: "PENDENTE_REVISAO",
  rotulo: "Pendente De Revisão",
  ordem: 7,
  tom: "dg",
  ativo: true,
  papel: "REVISAO",
  // OS DOIS FLAGS QUE A AUDITORIA FIXOU: ela não encerra (a vaga fica viva até alguém revisar) e
  // recebe candidato (senão a ingestão não tem onde pendurar o que acabou de ler).
  encerra: false,
  recebeCandidato: true,
  // E OS DOIS QUE ELA PROIBIU: fora da trilha humana e fora do movimento manual.
  daTrilha: false,
  movivelManualmente: false,
};

const CATALOGO: VagaStatusItem[] = [...VAGA_STATUS_SEMENTE, PENDENTE_REVISAO];

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async () => CATALOGO.map((s, i) => ({ ...s, id: i + 1 }))),
}));

type Lib = typeof import("./as-status-vaga");
type Trilha = typeof import("./as-vaga-trilha");
type Regua = typeof import("./as-vagas-revisao");

let lib: Lib;
let trilha: Trilha;
let regua: Regua;

beforeAll(async () => {
  lib = await import("./as-status-vaga");
  trilha = await import("./as-vaga-trilha");
  regua = await import("./as-vagas-revisao");
  // Depois desta leitura o catálogo CORRENTE é o de verdade, e é ele que as perguntas de
  // comportamento consultam quando ninguém passa um catálogo explícito.
  await lib.carregarStatusVaga(null);
});

describe("o papel substitui o literal de status", () => {
  it("responde o papel da linha do catálogo, e `null` para código que ele não conhece", () => {
    expect(lib.papelDoStatusVaga("ABERTA")).toBe("ABERTURA");
    expect(lib.papelDoStatusVaga("PENDENTE_REVISAO")).toBe("REVISAO");
    expect(lib.papelDoStatusVaga("INVENTADO")).toBeNull();
    expect(lib.papelDoStatusVaga(null)).toBeNull();
  });

  it("FAIL-CLOSED: código desconhecido não exerce papel nenhum", () => {
    for (const papel of ["ABERTURA", "RASCUNHO", "CANCELAMENTO", "REVISAO"] as const) {
      expect(lib.ehDoPapelDaVaga("INVENTADO", papel)).toBe(false);
    }
  });

  it("a vaga pendente de revisão é reconhecida pelo papel, e nenhuma outra é", () => {
    expect(lib.ehPendenteDeRevisao("PENDENTE_REVISAO")).toBe(true);
    // A SEMENTE PASSOU A CONTER A PRÓPRIA LINHA quando o papel REVISAO nasceu (decisão 4), então o
    // varrimento pergunta por "nenhuma OUTRA", que é o que a afirmação sempre quis dizer. Excluir
    // pelo PAPEL, e não pelo literal do código, é a mesma régua que o resto do módulo usa.
    for (const s of VAGA_STATUS_SEMENTE) {
      if (s.papel === "REVISAO") continue;
      expect(lib.ehPendenteDeRevisao(s.codigo), s.codigo).toBe(false);
    }
  });

  it("a linha de um papel de sistema é achável pelo papel, que é único", () => {
    expect(lib.statusDoPapel("REVISAO", CATALOGO)?.codigo).toBe("PENDENTE_REVISAO");
    expect(lib.statusDoPapel("ABERTURA", CATALOGO)?.codigo).toBe("ABERTA");
  });
});

describe("o que a vaga pendente NÃO vira por acidente", () => {
  it("ela NÃO é rascunho, e por isso não volta para a trilha de abertura", () => {
    expect(lib.ehDoPapelDaVaga("PENDENTE_REVISAO", "RASCUNHO")).toBe(false);
  });

  it("ela NÃO é uma vaga aberta: a barra de ações da vaga aberta não é a dela", () => {
    expect(lib.ehDoPapelDaVaga("PENDENTE_REVISAO", "ABERTURA")).toBe(false);
  });

  it("ela NÃO encerra, então a contagem dela continua derivada e o relógio continua correndo", () => {
    expect(lib.vagaEncerrada("PENDENTE_REVISAO")).toBe(false);
  });

  it("ela NÃO entra no seletor de publicação nem nos destinos de movimento manual", () => {
    const publicacao = lib.statusDePublicacao(CATALOGO).map((s) => s.codigo);
    expect(publicacao).not.toContain("PENDENTE_REVISAO");
    const destinos = lib.destinosManuais(CATALOGO, "ABERTA").map((s) => s.codigo);
    expect(destinos).not.toContain("PENDENTE_REVISAO");
  });

  /**
   * ─ O CASO DE SEGURANÇA, e ele é o mais importante do arquivo ─────────────────────────────────
   *
   * A vaga pendente RESPONDE `true` a "recebe candidato", porque a ingestão precisa pendurar nela as
   * candidaturas que leu. Se o seletor de alocação manual perguntasse isso, ela seria OFERECIDA, e
   * alocar alguém numa vaga sem cliente é pendurar aquela pessoa num processo sem controlador
   * definido. A pergunta do seletor é o PAPEL, e é isto que este caso trava.
   */
  it("RECEBE candidato da ingestão e mesmo assim fica FORA do seletor de alocação manual", () => {
    expect(lib.vagaRecebeCandidato("PENDENTE_REVISAO")).toBe(true);
    const ofertaDeAlocacao = CATALOGO.filter((s) => lib.ehDoPapelDaVaga(s.codigo, "ABERTURA")).map(
      (s) => s.codigo,
    );
    expect(ofertaDeAlocacao).toEqual(["ABERTA"]);
    expect(ofertaDeAlocacao).not.toContain("PENDENTE_REVISAO");
  });
});

describe("a trilha da vaga deixa de anunciar a pendente como aberta", () => {
  function vaga(status: string) {
    return {
      status,
      vagasFechadas: null,
      vagasFechadasBanco: null,
      posicoesOficiais: 3,
      enviarParaAdmissao: false,
      dataFechamento: null,
      ocupacao: {
        vagaId: "v1",
        posicoesOficiais: 3,
        ocupadas: 0,
        finalizadas: 0,
        finalizadasOficial: 0,
        finalizadasBanco: 0,
        livres: 3,
        emSelecao: 0,
        fora: 0,
        excedida: false,
        porEtapa: {},
        porDesfecho: {},
      },
    };
  }

  it("a pendente de revisão tem estado PRÓPRIO, e não `VAGA_ABERTA`", () => {
    expect(trilha.processoDaVaga(vaga("PENDENTE_REVISAO"))).toBe("PENDENTE_REVISAO");
    expect(trilha.processoDaVaga(vaga("ABERTA"))).toBe("VAGA_ABERTA");
  });

  it("o rótulo é o mesmo do catálogo, em title case (§A.24)", () => {
    expect(trilha.TRILHA_PROCESSO_ROTULO.PENDENTE_REVISAO).toBe("Pendente De Revisão");
  });

  it("a frase diz o que fazer, não só o que está errado", () => {
    const t = trilha.trilhaDaVaga(vaga("PENDENTE_REVISAO"));
    expect(t.processo.frase).toContain("vincular o cliente");
    expect(t.processo.tom).toBe("dg");
  });

  it("o rascunho e o cancelamento continuam lidos, agora pelo PAPEL", () => {
    expect(trilha.processoDaVaga(vaga("RASCUNHO"))).toBe("RASCUNHO");
    expect(trilha.desfechoDaVaga(vaga("CANCELADA"))).toBe("CANCELADA");
  });
});

describe("a régua da liberação: uma condição só, e ela é o cliente", () => {
  it("sem cliente não libera, e a frase diz por quê e o que fazer", () => {
    const r = regua.reguaDeLiberacao({ codCliente: null });
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("Vincule o cliente");
  });

  it("com cliente, libera, e não sobra frase de recusa", () => {
    const r = regua.reguaDeLiberacao({ codCliente: "51525" });
    expect(r.pode).toBe(true);
    expect(r.motivo).toBe("");
  });

  it("§A.11: nenhum texto desta frente usa travessão", () => {
    const textos = [
      regua.reguaDeLiberacao({ codCliente: null }).motivo,
      trilha.TRILHA_PROCESSO_ROTULO.PENDENTE_REVISAO,
      trilha.trilhaDaVaga(vagaSimples()).processo.frase,
    ];
    for (const t of textos) expect(t, t).not.toContain("—");
  });

  function vagaSimples() {
    return {
      status: "PENDENTE_REVISAO",
      vagasFechadas: null,
      vagasFechadasBanco: null,
      posicoesOficiais: 1,
      enviarParaAdmissao: false,
      dataFechamento: null,
      ocupacao: {
        vagaId: "v1",
        posicoesOficiais: 1,
        ocupadas: 0,
        finalizadas: 0,
        finalizadasOficial: 0,
        finalizadasBanco: 0,
        livres: 1,
        emSelecao: 0,
        fora: 0,
        excedida: false,
        porEtapa: {},
        porDesfecho: {},
      },
    };
  }
});
