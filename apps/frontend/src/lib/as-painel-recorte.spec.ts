import { describe, expect, it } from "vitest";
import type { CandidaturaSituacao } from "@ea/shared-types";
import {
  aplicarRecorte,
  criteriosAtivos,
  etapaVisivel,
  recorteAtivo,
  selecaoNoRecorte,
  ETAPA_FORA_DO_FUNIL,
  RECORTE_VAZIO,
  type LinhaFiltravel,
} from "./as-painel-recorte";

/**
 * O QUE ESTE TESTE PROTEGE, e o segundo item é o caro.
 *
 * 1. O RECORTE casa o que a tela MOSTRA. Filtrar por uma etapa e receber linha sem aquela pill é
 *    filtrar por dado invisível, que é o oposto do que esta frente existe para fazer.
 * 2. A SELEÇÃO NÃO SOBREVIVE INVISÍVEL. Marcar 8, filtrar para 2 e agir precisa alcançar 2. O
 *    defeito contrário já existiu nesta barra (a tela conta certo, a régua conta errado) e é
 *    silencioso: ninguém vê as seis pessoas que foram afetadas fora da vista.
 */
type Linha = LinhaFiltravel & { id: string };

function linha(id: string, nome: string, situacao: CandidaturaSituacao, etapa: string): Linha {
  return { id, candidatoNome: nome, situacao, etapa };
}

const LISTA: Linha[] = [
  linha("1", "Ana Paula Souza", "ATIVO", "CAPTACAO"),
  linha("2", "Bruno Almeida", "ALOCADO", "APROVACAO"),
  linha("3", "Carla Mendes", "DESCARTADO", "TRIAGEM"),
  linha("4", "João Ribeiro", "ATIVO", "TRIAGEM"),
  linha("5", "Daniel Costa", "DESISTIU", "CAPTACAO"),
];

const ids = (itens: Linha[]) => itens.map((c) => c.id);

describe("recorteAtivo e criteriosAtivos", () => {
  it("o recorte vazio não está ativo e não conta critério", () => {
    expect(recorteAtivo(RECORTE_VAZIO)).toBe(false);
    expect(criteriosAtivos(RECORTE_VAZIO)).toBe(0);
  });

  it("busca só de espaços não liga nada, que é o caso de quem apagou o que digitou", () => {
    expect(recorteAtivo({ ...RECORTE_VAZIO, busca: "   " })).toBe(false);
  });

  it("a busca conta como UM critério, e não como o tanto de letras", () => {
    expect(criteriosAtivos({ busca: "ana", situacoes: [], etapas: [] })).toBe(1);
    expect(criteriosAtivos({ busca: "ana", situacoes: ["ATIVO"], etapas: ["TRIAGEM"] })).toBe(3);
    expect(criteriosAtivos({ busca: "", situacoes: ["ATIVO", "ALOCADO"], etapas: [] })).toBe(1);
  });
});

describe("aplicarRecorte (busca por nome)", () => {
  it("sem recorte nenhum, devolve a lista inteira", () => {
    expect(ids(aplicarRecorte(LISTA, RECORTE_VAZIO))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("acha por pedaço do nome, em qualquer posição", () => {
    expect(ids(aplicarRecorte(LISTA, { ...RECORTE_VAZIO, busca: "mendes" }))).toEqual(["3"]);
  });

  /* SEM ACENTO ACHA COM ACENTO, e este é o defeito clássico de normalizar um lado só: a pessoa
     digita "joao", o dado tem "João", a busca volta vazia e a tela não explica por quê. */
  it("ignora acento e caixa nos DOIS lados", () => {
    expect(ids(aplicarRecorte(LISTA, { ...RECORTE_VAZIO, busca: "JOAO" }))).toEqual(["4"]);
    expect(ids(aplicarRecorte(LISTA, { ...RECORTE_VAZIO, busca: "joão" }))).toEqual(["4"]);
  });

  it("busca que não acha ninguém devolve lista vazia, e não a lista inteira", () => {
    expect(aplicarRecorte(LISTA, { ...RECORTE_VAZIO, busca: "zzz" })).toEqual([]);
  });
});

describe("aplicarRecorte (situação e etapa, multiselect)", () => {
  it("lista vazia de filtro quer dizer TODOS, nunca nenhum", () => {
    expect(ids(aplicarRecorte(LISTA, { busca: "", situacoes: [], etapas: [] }))).toHaveLength(5);
  });

  it("soma os valores do multiselect (é OU dentro do mesmo filtro)", () => {
    expect(ids(aplicarRecorte(LISTA, { ...RECORTE_VAZIO, situacoes: ["DESCARTADO", "DESISTIU"] }))).toEqual([
      "3",
      "5",
    ]);
  });

  it("os critérios diferentes se somam (é E entre filtros)", () => {
    const r = { busca: "", situacoes: ["ATIVO"], etapas: ["TRIAGEM"] };
    expect(ids(aplicarRecorte(LISTA, r))).toEqual(["4"]);
  });

  it("busca e filtro convivem", () => {
    const r = { busca: "a", situacoes: ["ATIVO"], etapas: [] };
    expect(ids(aplicarRecorte(LISTA, r))).toEqual(["1", "4"]);
  });
});

/**
 * ─ A ETAPA FILTRADA É A QUE A TELA MOSTRA (§A.37) ──────────────────────────────────────────────
 *
 * A tabela escreve "Fora Do Funil" para quem saiu, em vez da etapa guardada. Se o filtro casasse
 * pela etapa crua, escolher "Triagem" traria a Carla, que está DESCARTADA e cuja linha não mostra
 * Triagem nenhuma. A pessoa leria uma lista que não corresponde ao que ela pediu.
 */
describe("etapa: o filtro casa o que a célula mostra", () => {
  it("quem saiu do funil NÃO é achado pela etapa guardada", () => {
    // A Carla saiu em TRIAGEM, mas a célula dela diz "Fora Do Funil".
    expect(ids(aplicarRecorte(LISTA, { ...RECORTE_VAZIO, etapas: ["TRIAGEM"] }))).toEqual(["4"]);
  });

  it("o valor especial da coluna é opção de filtro, e acha exatamente quem saiu", () => {
    expect(ids(aplicarRecorte(LISTA, { ...RECORTE_VAZIO, etapas: [ETAPA_FORA_DO_FUNIL] }))).toEqual([
      "3",
      "5",
    ]);
  });

  it("etapaVisivel traduz uma linha por vez, e é ela que a tabela e o filtro compartilham", () => {
    expect(etapaVisivel(LISTA[3])).toBe("TRIAGEM");
    expect(etapaVisivel(LISTA[2])).toBe(ETAPA_FORA_DO_FUNIL);
  });
});

/**
 * ─ A REGRA CENTRAL: O QUE SAIU DA VISTA SAIU DA CONTA ─────────────────────────────────────────
 */
describe("selecaoNoRecorte", () => {
  it("mantém só quem continua à vista", () => {
    const visiveis = [LISTA[0], LISTA[3]];
    expect(selecaoNoRecorte(["1", "2", "3", "4"], visiveis)).toEqual(["1", "4"]);
  });

  /* O CASO QUE ORIGINOU A REGRA, com os números do mapa: marcar 8, filtrar para 2, agir. Sem esta
     poda, as outras 6 seriam afetadas sem ninguém vê-las. */
  it("marcar muitos e filtrar para poucos deixa a ação com os POUCOS", () => {
    const marcados = ["1", "2", "3", "4", "5"];
    const aposFiltro = aplicarRecorte(LISTA, { ...RECORTE_VAZIO, situacoes: ["ATIVO"] });
    expect(ids(aposFiltro)).toEqual(["1", "4"]);
    expect(selecaoNoRecorte(marcados, aposFiltro)).toEqual(["1", "4"]);
  });

  it("recorte que esconde tudo zera a seleção, em vez de deixar um lote invisível pronto", () => {
    const nada = aplicarRecorte(LISTA, { ...RECORTE_VAZIO, busca: "zzz" });
    expect(selecaoNoRecorte(["1", "2", "3"], nada)).toEqual([]);
  });

  it("preserva a ordem da seleção e não inventa id que ninguém marcou", () => {
    expect(selecaoNoRecorte(["4", "1"], LISTA)).toEqual(["4", "1"]);
    expect(selecaoNoRecorte([], LISTA)).toEqual([]);
  });
});

/**
 * ─ §A.6: A BUSCA LIGA SÓ NO NOME, E ISSO É EXIGÊNCIA DE AUDITORIA ──────────────────────────────
 *
 * O atalho natural de implementação é varrer o objeto da linha inteiro ("busca em qualquer
 * coluna", como a tabela de fora faz). AQUI ISSO SERIA ERRADO, e por um motivo medido: o payload da
 * candidatura traz `motivoDescarte`, que é TEXTO LIVRE escrito por consultor sobre uma pessoa. Uma
 * busca genérica passaria a casar contra o motivo de descarte de todo mundo, e alguém digitando uma
 * palavra qualquer descobriria por que fulano foi recusado.
 *
 * A PRIMEIRA DEFESA É O TIPO (`LinhaFiltravel` declara três campos, e nenhum deles é o motivo), e
 * este teste é a segunda: ele passa objetos COM os campos extras e prova que eles não entram na
 * conta, que é o que um `Object.values(...).join(" ")` faria.
 */
describe("§A.6: o que a busca NÃO alcança", () => {
  const comExtras = [
    {
      id: "a",
      candidatoNome: "Ana Paula Souza",
      situacao: "DESCARTADO" as CandidaturaSituacao,
      etapa: "TRIAGEM",
      motivoDescarte: "perfil desalinhado com a cultura",
      vagaCodigo: "9999001",
      candidatoId: "cpf-nao-vem-aqui-mas-o-id-sim",
    },
  ];

  it("não casa pelo MOTIVO DE DESCARTE, que é texto livre sobre a pessoa", () => {
    expect(aplicarRecorte(comExtras, { ...RECORTE_VAZIO, busca: "cultura" })).toEqual([]);
    expect(aplicarRecorte(comExtras, { ...RECORTE_VAZIO, busca: "desalinhado" })).toEqual([]);
  });

  it("não casa por nenhum outro campo da linha, só pelo nome", () => {
    expect(aplicarRecorte(comExtras, { ...RECORTE_VAZIO, busca: "9999001" })).toEqual([]);
    expect(aplicarRecorte(comExtras, { ...RECORTE_VAZIO, busca: "cpf-nao-vem" })).toEqual([]);
    expect(aplicarRecorte(comExtras, { ...RECORTE_VAZIO, busca: "ana" })).toHaveLength(1);
  });
});

/**
 * ─ A COMPOSIÇÃO DA ABA DE ALOCADOS: O FILTRO ESTREITA, NUNCA ALARGA ───────────────────────────
 *
 * A aba de alocados JÁ É um recorte (`finalizaPosicao`). O erro é de uma linha e invisível na tela:
 * aplicar o recorte sobre a LISTA INTEIRA e deixar a aba decidir só o que desenhar traria de volta,
 * por um filtro de situação, gente que aquela aba existe para excluir. Este teste fixa a ordem da
 * composição: primeiro a régua da aba, depois o recorte.
 */
describe("a aba de alocados: filtrar o recorte, não a lista", () => {
  const finaliza = (s: CandidaturaSituacao) => s === "ALOCADO" || s === "ENVIADO_PARA_ADMISSAO";
  const alocados = LISTA.filter((c) => finaliza(c.situacao));

  it("o recorte da aba vem PRIMEIRO, e o filtro só estreita", () => {
    expect(ids(alocados)).toEqual(["2"]);
    // Pedir DESCARTADO dentro dos alocados devolve vazio, e não a Carla.
    expect(aplicarRecorte(alocados, { ...RECORTE_VAZIO, situacoes: ["DESCARTADO"] })).toEqual([]);
  });

  it("a ordem errada traria de volta quem a aba exclui (o defeito que isto impede)", () => {
    // Aplicar o filtro sobre a lista INTEIRA acharia a Carla, que não é alocada.
    const errado = aplicarRecorte(LISTA, { ...RECORTE_VAZIO, situacoes: ["DESCARTADO"] });
    expect(ids(errado)).toEqual(["3"]);
    // E a composição certa não acha ninguém, que é a resposta verdadeira daquela aba.
    expect(aplicarRecorte(alocados, { ...RECORTE_VAZIO, situacoes: ["DESCARTADO"] })).toEqual([]);
  });
});
