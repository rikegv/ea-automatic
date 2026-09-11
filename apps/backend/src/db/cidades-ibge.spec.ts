import { describe, expect, it } from "vitest";
import {
  FONTE_IBGE,
  MINIMO_MUNICIPIOS,
  municipiosDoIbge,
  ufDoMunicipio,
  type MunicipioIbge,
} from "./cidades-ibge";

/**
 * ─ O TRANSFORM DA CARGA DO IBGE, SEM REDE E SEM POSTGRES ───────────────────────────────────────
 *
 * O RUNNER (`carga-cidades-ibge.ts`) chama `main()` ao ser importado, então ele NÃO é testável:
 * importá-lo abriria conexão e sairia para a internet. O transform mora separado justamente para
 * estas quatro perguntas virarem teste de mesa: homônimo sobrevive, duplicata some, item inválido é
 * CONTADO, e resposta truncada é reconhecível.
 *
 * §A.6: nenhum dado pessoal. Municípios são dado público.
 */

/** Um item no formato de HOJE da fonte (UF por `microrregiao`). */
function municipio(id: number, nome: string, uf: string): MunicipioIbge {
  return { id, nome, microrregiao: { mesorregiao: { UF: { sigla: uf } } } };
}

/** Um item no formato NOVO (UF por `regiao-imediata`), que os municípios pós-2017 usam. */
function municipioNovo(id: number, nome: string, uf: string): MunicipioIbge {
  return { id, nome, "regiao-imediata": { "regiao-intermediaria": { UF: { sigla: uf } } } };
}

describe("a UF é lida pelos DOIS caminhos da fonte", () => {
  it("pelo caminho clássico (`microrregiao`)", () => {
    expect(ufDoMunicipio(municipio(3550308, "São Paulo", "SP"))).toBe("SP");
  });

  /**
   * O SEGUNDO CAMINHO NÃO É ZELO: o IBGE serve os dois formatos, e municípios criados depois da
   * reforma das regiões (2017) vêm só pelo novo. Um transform que conhecesse um caminho só perderia
   * essas cidades EM SILÊNCIO, e o buraco apareceria um ano depois como "a minha cidade não está na
   * lista".
   */
  it("pelo caminho novo (`regiao-imediata`), que o clássico não cobre", () => {
    expect(ufDoMunicipio(municipioNovo(5006275, "Paraíso das Águas", "MS"))).toBe("MS");
  });

  it("sigla fora das 27 não vira UF, e o item é recusado depois", () => {
    expect(ufDoMunicipio(municipio(1234567, "Lugar Nenhum", "XX"))).toBeNull();
  });
});

describe("o transform da carga do IBGE", () => {
  /**
   * ─ O CASO QUE SEPARA "CHAVE CERTA" DE "CHAVE QUASE CERTA" ────────────────────────────────────
   *
   * HÁ CINCO "Bom Jesus" NO BRASIL (PB, PI, RN, RS e SC), contados na base carregada em homologação,
   * e os cinco são municípios de verdade.
   * Qualquer deduplicação por NOME (ou por `nome+uf`, que é a tentação seguinte) apagaria três deles
   * ou os fundiria, e a vaga de Bom Jesus do Piauí passaria a apontar para o de Santa Catarina. O
   * código do IBGE é a chave EXATAMENTE por isso.
   */
  it("HOMÔNIMOS de estados diferentes sobrevivem, todos", () => {
    // OS CÓDIGOS SÃO OS REAIS, lidos da base depois da carga: PB, PI, RN, RS e SC.
    const { linhas, duplicados } = municipiosDoIbge([
      municipio(2502201, "Bom Jesus", "PB"),
      municipio(2201903, "Bom Jesus", "PI"),
      municipio(2401701, "Bom Jesus", "RN"),
      municipio(4302303, "Bom Jesus", "RS"),
      municipio(4202537, "Bom Jesus", "SC"),
    ]);
    expect(linhas).toHaveLength(5);
    expect(duplicados).toBe(0);
    expect(new Set(linhas.map((l) => l.uf)).size).toBe(5);
  });

  /** Duplicata é pelo CÓDIGO, e é contada em vez de virar erro: a primeira ocorrência vale. */
  it("o MESMO código repetido entra uma vez só, e a repetição é contada", () => {
    const { linhas, duplicados } = municipiosDoIbge([
      municipio(3550308, "São Paulo", "SP"),
      municipio(3550308, "Sao Paulo", "SP"),
    ]);
    expect(linhas).toEqual([{ id: 3550308, nome: "São Paulo", uf: "SP" }]);
    expect(duplicados).toBe(1);
  });

  /**
   * ITEM INVÁLIDO É CONTADO, NUNCA DESCARTADO EM SILÊNCIO. É essa contagem que o runner usa para
   * ABORTAR: recusa quer dizer que o formato da fonte mudou, e gravar "o que sobrou" seria a carga
   * pela metade com cara de sucesso.
   */
  it.each([
    ["código curto demais (é a resposta de outro endpoint)", { id: 35, nome: "São Paulo", microrregiao: { mesorregiao: { UF: { sigla: "SP" } } } }],
    ["nome vazio", municipio(3550308, "   ", "SP")],
    ["sem UF reconhecível", { id: 3550308, nome: "São Paulo" }],
    ["código não numérico", { id: "3550308", nome: "São Paulo", microrregiao: { mesorregiao: { UF: { sigla: "SP" } } } }],
  ])("recusa e CONTA o item com %s", (_motivo, item) => {
    const { linhas, recusados } = municipiosDoIbge([item as MunicipioIbge]);
    expect(linhas).toHaveLength(0);
    expect(recusados).toHaveLength(1);
    expect(recusados[0]!.indice).toBe(0);
  });

  /** Resposta que não é lista (uma página de erro com 200, por exemplo) não vira zero linhas mudas. */
  it("resposta que não é lista é recusada, e não interpretada como base vazia", () => {
    const { linhas, recusados } = municipiosDoIbge({ erro: "manutenção" });
    expect(linhas).toHaveLength(0);
    expect(recusados).toHaveLength(1);
  });

  it("o nome vem com os espaços aparados, e a sigla em caixa alta", () => {
    const { linhas } = municipiosDoIbge([municipio(3550308, "  São Paulo  ", "sp")]);
    expect(linhas[0]).toEqual({ id: 3550308, nome: "São Paulo", uf: "SP" });
  });
});

describe("as constantes da carga são as que a auditoria exigiu", () => {
  /**
   * A URL É CONSTANTE NO CÓDIGO, e este teste existe para o dia em que alguém "parametrizar" a
   * fonte: quem pudesse definir uma variável de ambiente escolheria de onde vêm 5.570 linhas que a
   * tela de abertura de vaga vai oferecer como verdade.
   */
  it("a fonte é a oficial do IBGE, fixa no código", () => {
    expect(FONTE_IBGE).toBe("https://servicodados.ibge.gov.br/api/v1/localidades/municipios");
  });

  /** O piso pega a resposta TRUNCADA, que é o modo de falha que não dá erro. */
  it("o piso de contagem é alto o bastante para recusar meia base", () => {
    expect(MINIMO_MUNICIPIOS).toBeGreaterThanOrEqual(5_000);
    // E baixo o bastante para não recusar a base real, que tem 5.570 (5.571 com Brasília).
    expect(MINIMO_MUNICIPIOS).toBeLessThanOrEqual(5_570);
  });
});
