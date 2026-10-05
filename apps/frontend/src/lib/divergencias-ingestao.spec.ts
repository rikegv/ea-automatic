import { describe, expect, it } from "vitest";
import type { DivergenciaDaIngestaoItem } from "@ea/shared-types";
import { CAMPOS_DE_DIVERGENCIA } from "@ea/shared-types";
import {
  CAMPOS_ADOTAVEIS,
  FILTROS_VAZIOS,
  alternarValor,
  avisoDoCaminhoManual,
  contarFiltrosAtivos,
  estadoDoFiltro,
  filtrarDivergencias,
  ordemPadrao,
  podeAdotar,
  situacaoDaLinha,
  toneDaSituacao,
  urlDaFila,
  valorExibido,
} from "./divergencias-ingestao";

/**
 * ─ O RECORTE DA FILA DE DIVERGÊNCIAS: o que soma, o que cruza, e o que conta ────────────────────
 *
 * As quatro réguas que este arquivo trava, e que nenhum typecheck pega:
 *  1. filtro MÚLTIPLO (§A.28) SOMA dentro do campo (vira `IN` no servidor) em vez de a segunda
 *     escolha trocar a primeira, e os CINCO filtros do servidor chegam de fato à URL. Filtro que a
 *     tela oferece e a consulta não recebe é pior que filtro nenhum, porque mente;
 *  2. a tradução do filtro de Situação para o `estado` da rota: são DUAS caixas na tela e TRÊS
 *     valores no servidor, e marcar as duas tem de virar `TODAS` (senão o card de Resolvidas
 *     trocaria a população em vez de somá-la);
 *  3. adotar existe em TRÊS campos dos oito, e a tela precisa saber disso antes do clique, senão
 *     oferece um botão que só pode voltar 409;
 *  4. ausência de valor é "não informado" (§A.11), nunca vazio nem glifo.
 */

function item(over: Partial<DivergenciaDaIngestaoItem>): DivergenciaDaIngestaoItem {
  return {
    id: "d1",
    escopo: "CANDIDATURA",
    campo: "etapa",
    campoRotulo: "Etapa Do Funil",
    valorEa: "TRIAGEM",
    valorAts: "ENTREVISTA",
    candidaturaId: "c1",
    candidatoNome: "Ana",
    vagaId: "v1",
    vagaNome: "Operador De Loja",
    clienteNome: "Cliente Alfa",
    ocorrencias: 1,
    primeiraEm: "2026-09-20T10:00:00.000Z",
    ultimaEm: "2026-09-20T10:00:00.000Z",
    resolvidoEm: null,
    resolvidoPorNome: null,
    decisao: null,
    ...over,
  };
}

const PENDENTE_ETAPA = item({ id: "a", campo: "etapa", ocorrencias: 3 });
const PENDENTE_VAGA = item({
  id: "b",
  escopo: "VAGA",
  campo: "vaga_codigo",
  campoRotulo: "Código Da Vaga",
  candidatoNome: null,
  clienteNome: "Cliente Beta",
  vagaId: "v2",
  valorEa: null,
});
const RESOLVIDA = item({
  id: "c",
  campo: "situacao",
  campoRotulo: "Situação",
  resolvidoEm: "2026-09-25T10:00:00.000Z",
  resolvidoPorNome: "Consultora",
  decisao: "MANTIDO_EA",
  ocorrencias: 4,
});
const TODAS = [PENDENTE_ETAPA, PENDENTE_VAGA, RESOLVIDA];

describe("situação da linha", () => {
  it("deriva do carimbo de resolução, sem coluna própria para discordar dele", () => {
    expect(situacaoDaLinha(PENDENTE_ETAPA)).toBe("PENDENTE");
    expect(situacaoDaLinha(RESOLVIDA)).toBe("RESOLVIDA");
  });

  it("dá o tom de onde sai o ícone dinâmico da §A.12: pendente amarelo, resolvida verde", () => {
    expect(toneDaSituacao("PENDENTE")).toBe("wn");
    expect(toneDaSituacao("RESOLVIDA")).toBe("ok");
  });
});

describe("a URL da fila, que é onde vivem os filtros do servidor", () => {
  it("manda escopo e campo como lista, somando os valores em vez de trocar", () => {
    expect(urlDaFila({ ...FILTROS_VAZIOS, campos: ["etapa", "vaga_codigo"] })).toBe(
      "/as/ingestao/divergencias?campo=etapa%2Cvaga_codigo&estado=ABERTAS",
    );
    expect(urlDaFila({ ...FILTROS_VAZIOS, escopos: ["CANDIDATURA", "VAGA"] })).toBe(
      "/as/ingestao/divergencias?escopo=CANDIDATURA%2CVAGA&estado=ABERTAS",
    );
  });

  /**
   * CLIENTE E VAGA VÃO À REDE, e este teste é o que trava a inversão.
   *
   * A primeira versão desta tela recortava os dois NA TELA, e o teste daqui provava o contrário do
   * que prova agora. O que virou a decisão foi uma medição: a consulta da fila tem `limit 500`, então
   * recorte de tela é honesto só abaixo daquela linha. Acima dela, as divergências do cliente
   * escolhido que ficaram fora do teto não apareceriam, sem nada indicar isso, e o número na tela
   * continuaria plausível. Filtro que mente é pior que filtro nenhum (§A.28).
   */
  it("manda cliente pelo NOME e vaga pelo ID, somando dois valores em cada um", () => {
    const url = urlDaFila({
      ...FILTROS_VAZIOS,
      clientes: ["Cliente Alfa", "Cliente Beta"],
      vagas: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
    });
    const q = new URLSearchParams(url.split("?")[1]);
    expect(q.get("cliente")).toBe("Cliente Alfa,Cliente Beta");
    expect(q.get("vaga")).toBe(
      "11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222",
    );
    expect(q.get("estado")).toBe("ABERTAS");
  });

  it("os cinco filtros do servidor viajam juntos, e o de reincidentes NÃO vai (é da tela)", () => {
    const q = new URLSearchParams(
      urlDaFila({
        escopos: ["VAGA"],
        campos: ["vaga_codigo"],
        clientes: ["Cliente Beta"],
        vagas: ["v2"],
        situacoes: ["RESOLVIDA"],
        soReincidentes: true,
      }).split("?")[1],
    );
    expect([...q.keys()].sort()).toEqual(["campo", "cliente", "escopo", "estado", "vaga"]);
    expect(q.get("estado")).toBe("RESOLVIDAS");
  });

  it("traduz o filtro de Situação para os três estados da rota", () => {
    expect(estadoDoFiltro([])).toBe("ABERTAS");
    expect(estadoDoFiltro(["PENDENTE"])).toBe("ABERTAS");
    expect(estadoDoFiltro(["RESOLVIDA"])).toBe("RESOLVIDAS");
    // As DUAS marcadas somam as duas populações, e é isso que faz o card ser multiselect (§A.28).
    expect(estadoDoFiltro(["PENDENTE", "RESOLVIDA"])).toBe("TODAS");
  });
});

describe("o único recorte que fica na tela", () => {
  it("reincidentes deixa passar só ocorrências maior que 1, pendente ou resolvida", () => {
    const r = filtrarDivergencias(TODAS, { ...FILTROS_VAZIOS, soReincidentes: true });
    expect(r.map((i) => i.id)).toEqual(["a", "c"]);
  });

  /**
   * NENHUM FILTRO DO SERVIDOR É REFEITO AQUI, e é isso que impede as duas réguas de existirem.
   * A lista que volta da rota é desenhada como veio: escolher um cliente não pode recortar de novo,
   * senão o teto de 500 do servidor e o recorte da tela discordariam sobre quem aparece na fila.
   */
  it("NÃO refaz o recorte do servidor: cliente, vaga, campo, escopo e situação passam intactos", () => {
    const r = filtrarDivergencias(TODAS, {
      escopos: ["VAGA"],
      campos: ["etapa"],
      clientes: ["Cliente Beta"],
      vagas: ["v2"],
      situacoes: ["RESOLVIDA"],
      soReincidentes: false,
    });
    expect(r.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("sem filtro nenhum, a lista sai exatamente como entrou", () => {
    expect(filtrarDivergencias(TODAS, FILTROS_VAZIOS)).toEqual(TODAS);
  });
});

describe("o estado dos filtros", () => {
  it("alternarValor liga e desliga o mesmo valor, que é o toggle do KPI e do multiselect", () => {
    expect(alternarValor([], "PENDENTE")).toEqual(["PENDENTE"]);
    expect(alternarValor(["PENDENTE"], "RESOLVIDA")).toEqual(["PENDENTE", "RESOLVIDA"]);
    expect(alternarValor(["PENDENTE", "RESOLVIDA"], "PENDENTE")).toEqual(["RESOLVIDA"]);
  });

  it("conta um filtro ativo por campo preenchido, para o badge do gatilho", () => {
    expect(contarFiltrosAtivos(FILTROS_VAZIOS)).toBe(0);
    expect(
      contarFiltrosAtivos({
        ...FILTROS_VAZIOS,
        campos: ["etapa", "situacao"],
        clientes: ["Cliente Alfa"],
        soReincidentes: true,
      }),
    ).toBe(3);
  });
});

describe("adotar, que só existe em três dos oito campos", () => {
  it("os três adotáveis são os que têm caminho humano para o estado em que a linha nasce", () => {
    expect([...CAMPOS_ADOTAVEIS]).toEqual(["etapa", "vaga_posicoes_oficiais", "vaga_do_candidato"]);
    expect(podeAdotar("etapa")).toBe(true);
    expect(podeAdotar("vaga_posicoes_oficiais")).toBe(true);
    expect(podeAdotar("vaga_do_candidato")).toBe(true);
  });

  /**
   * QUATRO, E NÃO CINCO: `motivo_descarte` saiu do catálogo de campos por veto do `seguranca`, então
   * ele não é mais nem adotável nem não adotável, porque não existe mais como linha de fila. A lista
   * é derivada do contrato de propósito: campo novo lá aparece aqui, em vez de passar batido.
   */
  it("os quatro restantes NÃO são adotáveis, e é neles que o servidor devolve 409", () => {
    const naoAdotaveis = CAMPOS_DE_DIVERGENCIA.filter((c) => !podeAdotar(c));
    expect(naoAdotaveis).toEqual([
      "situacao",
      "vaga_codigo",
      "vaga_nome_divulgacao",
      "vaga_cidade",
    ]);
  });

  it("o catálogo tem SETE campos, sem o motivo do descarte", () => {
    expect(CAMPOS_DE_DIVERGENCIA).toHaveLength(7);
    expect(CAMPOS_DE_DIVERGENCIA).not.toContain("motivo_descarte");
  });

  it("o aviso diz o caminho real de cada família, e é a mesma régua que o 409 explica", () => {
    expect(avisoDoCaminhoManual("situacao")).toContain("ficha do candidato");
    expect(avisoDoCaminhoManual("situacao")).toContain("motivo do catálogo");
    expect(avisoDoCaminhoManual("vaga_codigo")).toContain("Editar vaga");
    expect(avisoDoCaminhoManual("vaga_cidade")).toContain("Central de Vagas");
  });
});

describe("ordem padrão da fila", () => {
  it("põe o trabalho primeiro: pendente antes de resolvida, e detecção mais recente no topo", () => {
    const antiga = item({ id: "antiga", ultimaEm: "2026-09-01T10:00:00.000Z" });
    const nova = item({ id: "nova", ultimaEm: "2026-09-28T10:00:00.000Z" });
    expect(ordemPadrao([RESOLVIDA, antiga, nova]).map((i) => i.id)).toEqual([
      "nova",
      "antiga",
      "c",
    ]);
  });
});

describe("valor exibido", () => {
  it("ausência de dado é a palavra, nunca vazio nem glifo (§A.11)", () => {
    expect(valorExibido(null)).toBe("não informado");
    expect(valorExibido("   ")).toBe("não informado");
    expect(valorExibido("TRIAGEM")).toBe("TRIAGEM");
  });
});
