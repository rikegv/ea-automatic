import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CABECALHOS_DA_PLANILHA_DE_CLIENTE } from "./as-planilha-cliente-colunas";
import {
  CAMPOS_DO_PRE_PREENCHIMENTO,
  PROCEDENCIA_DA_PLANILHA,
  agregarPrePreenchimentoPorCodigo,
  camposComProcedenciaDaPlanilha,
  cargoDaPlanilha,
  codigoDeLinhaDeServicoDaPlanilha,
  dataDaPlanilha,
  naturezaDaPlanilha,
  procedenciaALimpar,
  temAlgoAPrePreencher,
  type CatalogosDoPrePreenchimento,
  type LinhaDaPlanilhaParaPrePreenchimento,
} from "./as-planilha-prepreenchimento";

/**
 * ─ COBERTURA INDEPENDENTE (§A.38) DO PRÉ-PREENCHIMENTO DA VAGA EM REVISÃO ──────────────────────
 *
 * ESCRITO POR QUEM NÃO CONSTRUIU A FRENTE, e contra o REQUISITO do diretor, nunca contra a
 * suposição de quem a construiu. O arquivo do autor (`as-planilha-prepreenchimento.spec.ts`) já
 * cobre o caminho feliz de cada função; este procura o que a suposição não alcança:
 *
 *  1. a TOTALIDADE dos dois de/para (nenhum texto produz um sexto destino, nenhum cai no rótulo
 *     mais parecido), porque "o que casa" é fácil de testar e "o que NÃO pode casar" é o que
 *     protege a vaga de nascer classificada errado;
 *  2. a INDEPENDÊNCIA DA ORDEM, exercitada por PERMUTAÇÃO das linhas e dos catálogos, que é a
 *     própria régua declarada pelo módulo ("escolher a primeira linha é proibido");
 *  3. a abstenção POR CAMPO sob ambiguidade SIMULTÂNEA de dois campos;
 *  4. as datas no limite do formato (bissexto, serial do Excel, ISO, data com hora), e a
 *     independência de uma data em relação à outra;
 *  5. §A.6: nenhuma função desta frente devolve VALOR, texto de célula ou chave desconhecida.
 *
 * §A.6: todo dado é SINTÉTICO. Códigos de vaga na faixa 9xxxxx, cargos em UUID inventado, nomes de
 * cargo genéricos. Nenhum CPF, nenhum nome de pessoa, nenhum salário, nenhum cliente real.
 * §A.11: sem travessão.
 */

// ────────────────────────────────────────────────────────────────────────────────────────────────
// O CENÁRIO SINTÉTICO
// ────────────────────────────────────────────────────────────────────────────────────────────────

const CARGO_EXATO = "aaaaaaaa-0000-4000-8000-000000000001";
const CARGO_COLIDE_A = "aaaaaaaa-0000-4000-8000-000000000002";
const CARGO_COLIDE_B = "aaaaaaaa-0000-4000-8000-000000000003";
const CARGO_INATIVO = "aaaaaaaa-0000-4000-8000-000000000004";

const CATALOGOS: CatalogosDoPrePreenchimento = {
  cargos: [
    { id: CARGO_EXATO, nome: "Analista Fiscal Senior", ativo: true },
    /* O MESMO nome normalizado em DOIS ids: é a colisão medida no catálogo real (5 nomes). */
    { id: CARGO_COLIDE_A, nome: "Operador de Caixa", ativo: true },
    { id: CARGO_COLIDE_B, nome: "Operador De Caixa", ativo: true },
    { id: CARGO_INATIVO, nome: "Auxiliar Administrativo", ativo: false },
  ],
  linhasServico: [
    { id: 3, codigo: "PONTUAIS_ESTRATEGICAS" },
    { id: 5, codigo: "ONESHOT" },
    { id: 7, codigo: "ALTO_VOLUME" },
    { id: 9, codigo: "SOUFAST" },
    { id: 11, codigo: "RPO_BPO" },
  ],
};

const CODIGO = "900001";

const linha = (
  over: Partial<LinhaDaPlanilhaParaPrePreenchimento> = {},
): LinhaDaPlanilhaParaPrePreenchimento => ({
  codigo: CODIGO,
  tipoVaga: null,
  celulaAtendimento: null,
  cargo: null,
  dataAbertura: null,
  slaEntrega: null,
  ...over,
});

const doCodigo = (linhas: readonly LinhaDaPlanilhaParaPrePreenchimento[]) =>
  agregarPrePreenchimentoPorCodigo(linhas, CATALOGOS).get(CODIGO);

/** Todas as ORDENS possíveis de uma lista pequena. É assim que "não depende da ordem" se prova. */
function permutacoes<T>(itens: readonly T[]): T[][] {
  if (itens.length <= 1) return [[...itens]];
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += 1) {
    const resto = [...itens.slice(0, i), ...itens.slice(i + 1)];
    for (const p of permutacoes(resto)) saida.push([itens[i] as T, ...p]);
  }
  return saida;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. OS DOIS DE/PARA, PELA TOTALIDADE: o que NÃO pode casar é o que protege a vaga
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("o de/para do TIPO DE VAGA é fechado, e o fechamento é a proteção", () => {
  const APROVADOS: Record<string, string> = {
    Efetiva: "EFETIVA",
    Temporária: "TEMPORARIA",
    "Reposição Efetiva": "REPOSICAO_EFETIVA",
    "Reposição Temporária": "REPOSICAO_TEMPORARIA",
    Estágio: "ESTAGIO",
    Terceira: "TERCEIRA",
    "Vaga Banco": "VAGA_BANCO",
  };

  it("os SETE rótulos do diretor casam, e cada um no SEU valor", () => {
    for (const [texto, alvo] of Object.entries(APROVADOS)) {
      expect(naturezaDaPlanilha(texto), `o rótulo ${texto} parou de casar`).toBe(alvo);
    }
  });

  it("o conjunto de destinos possíveis é EXATAMENTE esses sete: nenhum oitavo nasce por engano", () => {
    const destinos = new Set(Object.values(APROVADOS));
    const candidatos = [
      "Reposição",
      "reposicao",
      "Efetivo",
      "Efetiva CLT",
      "Temporario",
      "Temporária 90 dias",
      "Estagiário",
      "Terceirizada",
      "Banco",
      "Banco de Talentos",
      "Aprendiz",
      "Jovem Aprendiz",
      "PJ",
      "Indeterminado",
      "-",
      "n/a",
      "0",
    ];
    for (const texto of candidatos) {
      const alvo = naturezaDaPlanilha(texto);
      expect(
        alvo === null || destinos.has(alvo),
        `o texto ${texto} produziu o valor ${alvo}, fora dos sete aprovados`,
      ).toBe(true);
    }
  });

  it("`Reposição` SOZINHA se abstém: ela não escolhe entre efetiva e temporária", () => {
    expect(naturezaDaPlanilha("Reposição")).toBeNull();
    expect(naturezaDaPlanilha("REPOSICAO")).toBeNull();
    /* E o valor genérico do enum NUNCA é produzido por este de/para. */
    expect(Object.values(APROVADOS)).not.toContain("REPOSICAO");
  });

  it("texto com ruído de digitação ao redor casa; texto com palavra A MAIS não", () => {
    expect(naturezaDaPlanilha("  efetiva  ")).toBe("EFETIVA");
    expect(naturezaDaPlanilha("EFETIVA.")).toBe("EFETIVA");
    expect(naturezaDaPlanilha("Efetiva / CLT")).toBeNull();
  });
});

describe("o de/para da CÉLULA é fechado, e dois textos vão ao mesmo destino", () => {
  it("os seis textos medidos caem nos CINCO códigos do catálogo, e nada mais", () => {
    expect(codigoDeLinhaDeServicoDaPlanilha("PONTUAIS")).toBe("PONTUAIS_ESTRATEGICAS");
    expect(codigoDeLinhaDeServicoDaPlanilha("ESTRATÉGICA")).toBe("PONTUAIS_ESTRATEGICAS");
    expect(codigoDeLinhaDeServicoDaPlanilha("PROJETOS | ONE SHOT")).toBe("ONESHOT");
    expect(codigoDeLinhaDeServicoDaPlanilha("ALTO VOLUME")).toBe("ALTO_VOLUME");
    expect(codigoDeLinhaDeServicoDaPlanilha("SouFast")).toBe("SOUFAST");
    expect(codigoDeLinhaDeServicoDaPlanilha("RPO / BPO")).toBe("RPO_BPO");
  });

  it("vizinho de vocabulário se abstém: `ONE SHOT` sozinho e `RPO` sozinho não casam", () => {
    for (const texto of ["ONE SHOT", "PROJETOS", "RPO", "BPO", "ESTRATEGIA", "ALTO"]) {
      expect(codigoDeLinhaDeServicoDaPlanilha(texto), `${texto} casou e não devia`).toBeNull();
    }
  });

  it("PONTUAIS e ESTRATÉGICA no MESMO código NÃO são ambiguidade: as duas dizem o mesmo", () => {
    const r = doCodigo([
      linha({ celulaAtendimento: "PONTUAIS" }),
      linha({ celulaAtendimento: "ESTRATÉGICA" }),
    ]);
    expect(r?.valores.linhaServicoId).toBe(3);
    expect(r?.veredictos.linhaServico).toBe("PREENCHIDO");
  });

  it("o `id` vem do CATÁLOGO: código que o catálogo não tem NÃO vira número inventado", () => {
    const semOneShot: CatalogosDoPrePreenchimento = {
      cargos: CATALOGOS.cargos,
      linhasServico: CATALOGOS.linhasServico.filter((l) => l.codigo !== "ONESHOT"),
    };
    const r = agregarPrePreenchimentoPorCodigo(
      [linha({ celulaAtendimento: "PROJETOS | ONE SHOT" })],
      semOneShot,
    ).get(CODIGO);
    expect(r?.valores.linhaServicoId).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. O CARGO, E A DISCIPLINA QUE ELE PROMETE REUSAR
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("o cargo casa pela disciplina do cliente, e o ambíguo se abstém", () => {
  it("o EXATO preenche; o PREFIXO é calculado e NÃO preenche (`SO_PROPOSTA`)", () => {
    expect(cargoDaPlanilha("analista fiscal senior", CATALOGOS.cargos)).toEqual({
      cargoId: CARGO_EXATO,
      grau: "EXATO",
    });
    expect(cargoDaPlanilha("Analista Fiscal", CATALOGOS.cargos)).toEqual({
      cargoId: CARGO_EXATO,
      grau: "PREFIXO",
    });
    const r = doCodigo([linha({ cargo: "Analista Fiscal" })]);
    expect(r?.valores.cargoId).toBeNull();
    expect(r?.veredictos.cargo).toBe("SO_PROPOSTA");
  });

  it("DOIS ids para o mesmo nome normalizado se abstêm, em QUALQUER ordem do catálogo", () => {
    for (const cargos of permutacoes(CATALOGOS.cargos)) {
      const r = agregarPrePreenchimentoPorCodigo([linha({ cargo: "Operador de Caixa" })], {
        cargos,
        linhasServico: CATALOGOS.linhasServico,
      }).get(CODIGO);
      expect(r?.valores.cargoId, "a ordem do catálogo mudou o resultado").toBeNull();
    }
  });

  it("cargo INATIVO se abstém, e o resultado não vaza para os outros campos", () => {
    const r = doCodigo([
      linha({ cargo: "Auxiliar Administrativo", tipoVaga: "Efetiva", dataAbertura: "01/02/2026" }),
    ]);
    expect(r?.valores.cargoId).toBeNull();
    expect(r?.valores.natureza).toBe("EFETIVA");
    expect(r?.valores.dataAbertura).toBe("2026-02-01");
  });

  /**
   * ─ GAP ABERTO PELA COBERTURA INDEPENDENTE ───────────────────────────────────────────────────
   *
   * A régua declarada do módulo é "o EXATO VENCE o prefixo" e "escolher a primeira linha é
   * proibido". Entre LINHAS do mesmo código, as duas deixam de valer: o agregador indexa por
   * `cargoId` e a ÚLTIMA linha sobrescreve a anterior, então o GRAU que sobrevive é o da última.
   * Com a linha exata ANTES da linha curta, a exata é jogada fora e o campo se abstém; invertendo
   * as duas, o mesmo código preenche. O resultado passa a depender da ORDEM da planilha.
   */
  it("GAP: o EXATO tem de vencer o PREFIXO também ENTRE LINHAS, em qualquer ordem", () => {
    const exata = linha({ cargo: "Analista Fiscal Senior" });
    const curta = linha({ cargo: "Analista Fiscal" });
    const comExataAntes = doCodigo([exata, curta]);
    const comCurtaAntes = doCodigo([curta, exata]);

    expect(
      comExataAntes?.valores.cargoId,
      "a ordem das linhas da planilha decidiu o cargo: com a linha EXATA primeiro o campo se abstém, com ela por último preenche",
    ).toBe(comCurtaAntes?.valores.cargoId);
    expect(
      comExataAntes?.valores.cargoId,
      "a linha com o nome EXATO do catálogo foi descartada por uma linha com o nome mais curto",
    ).toBe(CARGO_EXATO);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. A ABSTENÇÃO É POR CAMPO, E A ORDEM NÃO DECIDE NADA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a ambiguidade de um campo não contamina os outros, nem em dose dupla", () => {
  it("DOIS campos ambíguos ao mesmo tempo preservam os TRÊS restantes", () => {
    const a = linha({
      tipoVaga: "Efetiva",
      celulaAtendimento: "PONTUAIS",
      cargo: "Analista Fiscal Senior",
      dataAbertura: "01/02/2026",
      slaEntrega: "15/03/2026",
    });
    const b = linha({
      tipoVaga: "Temporária",
      celulaAtendimento: "ALTO VOLUME",
      cargo: "Analista Fiscal Senior",
      dataAbertura: "01/02/2026",
      slaEntrega: "15/03/2026",
    });
    const r = doCodigo([a, b]);
    expect(r?.valores.natureza).toBeNull();
    expect(r?.veredictos.natureza).toBe("AMBIGUO_NA_PLANILHA");
    expect(r?.valores.linhaServicoId).toBeNull();
    expect(r?.veredictos.linhaServico).toBe("AMBIGUO_NA_PLANILHA");
    expect(r?.valores.cargoId).toBe(CARGO_EXATO);
    expect(r?.valores.dataAbertura).toBe("2026-02-01");
    expect(r?.valores.dataLimite).toBe("2026-03-15");
  });

  it("a ORDEM das linhas não muda nenhum dos cinco campos (todas as permutações)", () => {
    const linhas = [
      linha({ tipoVaga: "Efetiva", celulaAtendimento: "PONTUAIS" }),
      linha({ tipoVaga: "Temporária", dataAbertura: "01/02/2026" }),
      linha({ celulaAtendimento: "ESTRATÉGICA", slaEntrega: "15/03/2026" }),
    ];
    const esperado = JSON.stringify(doCodigo(linhas));
    for (const ordem of permutacoes(linhas)) {
      expect(JSON.stringify(doCodigo(ordem)), "a ordem das linhas mudou o resultado").toBe(
        esperado,
      );
    }
  });

  it("o conflito de um CÓDIGO não alcança o outro, e cada código decide sozinho", () => {
    const mapa = agregarPrePreenchimentoPorCodigo(
      [
        { ...linha({ tipoVaga: "Efetiva" }), codigo: "900001" },
        { ...linha({ tipoVaga: "Temporária" }), codigo: "900001" },
        { ...linha({ tipoVaga: "Estágio" }), codigo: "900002" },
      ],
      CATALOGOS,
    );
    expect(mapa.get("900001")?.valores.natureza).toBeNull();
    expect(mapa.get("900002")?.valores.natureza).toBe("ESTAGIO");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. AS DUAS DATAS, NO LIMITE DO FORMATO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("as datas são literais da planilha, e o que não é `DD/MM/AAAA` se abstém", () => {
  it("a data VENCIDA entra literal, sem deslocamento e sem palpite de hoje", () => {
    expect(dataDaPlanilha("03/01/2019")).toBe("2019-01-03");
    expect(dataDaPlanilha("1/1/2020")).toBe("2020-01-01");
  });

  it("o calendário é conferido: 31/02, 30/02 e 29/02 de ano não bissexto se abstêm", () => {
    expect(dataDaPlanilha("31/02/2026")).toBeNull();
    expect(dataDaPlanilha("30/02/2026")).toBeNull();
    expect(dataDaPlanilha("29/02/2026")).toBeNull();
    /* 2024 É bissexto: a conferência não é um bloqueio geral de 29/02. */
    expect(dataDaPlanilha("29/02/2024")).toBe("2024-02-29");
  });

  it("formato de OUTRA origem se abstém: ISO, serial do Excel, data com hora, ano de dois dígitos", () => {
    for (const bruto of [
      "2026-02-01",
      "45678",
      45678,
      "01/02/2026 10:30",
      "01/02/26",
      "01-02-2026",
      "fevereiro/2026",
      "",
      "   ",
    ]) {
      expect(dataDaPlanilha(bruto), `${String(bruto)} virou data e não devia`).toBeNull();
    }
  });

  it("DOIS formatos do MESMO dia NÃO são ambiguidade: a contagem é sobre o ALVO", () => {
    const r = doCodigo([
      linha({ dataAbertura: "1/2/2026" }),
      linha({ dataAbertura: "01/02/2026" }),
    ]);
    expect(r?.valores.dataAbertura).toBe("2026-02-01");
    expect(r?.veredictos.dataAbertura).toBe("PREENCHIDO");
  });

  it("a data de ABERTURA inválida não derruba a data LIMITE da mesma linha", () => {
    const r = doCodigo([linha({ dataAbertura: "31/02/2026", slaEntrega: "15/03/2026" })]);
    expect(r?.valores.dataAbertura).toBeNull();
    expect(r?.veredictos.dataAbertura).toBe("NAO_CASOU");
    expect(r?.valores.dataLimite).toBe("2026-03-15");
  });

  it("as duas datas são campos DIFERENTES: a ambiguidade de uma não abstém a outra", () => {
    const r = doCodigo([
      linha({ dataAbertura: "01/02/2026", slaEntrega: "15/03/2026" }),
      linha({ dataAbertura: "02/02/2026", slaEntrega: "15/03/2026" }),
    ]);
    expect(r?.valores.dataAbertura).toBeNull();
    expect(r?.valores.dataLimite).toBe("2026-03-15");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 5. OS TRÊS SILÊNCIOS, E O QUE NÃO SE ESCREVE
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("AUSENTE, NAO_CASOU e AMBIGUO são silêncios diferentes, e os três se abstêm", () => {
  it("célula só com espaços é AUSENTE, e não `NAO_CASOU`", () => {
    const r = doCodigo([linha({ tipoVaga: "   " })]);
    expect(r?.veredictos.natureza).toBe("AUSENTE");
    expect(r?.valores.natureza).toBeNull();
  });

  it("célula com texto desconhecido é NAO_CASOU, e a distinção é o que acusa a coluna renomeada", () => {
    const r = doCodigo([linha({ tipoVaga: "Contrato Verde e Amarelo" })]);
    expect(r?.veredictos.natureza).toBe("NAO_CASOU");
  });

  it("uma célula VAZIA entre linhas iguais não abstém o campo (ausência não é discordância)", () => {
    const r = doCodigo([
      linha({ tipoVaga: "Efetiva" }),
      linha({ tipoVaga: "" }),
      linha({ tipoVaga: "Efetiva" }),
    ]);
    expect(r?.valores.natureza).toBe("EFETIVA");
  });

  it("texto que NÃO casa entre linhas que casam não abstém o campo, e isso é a assimetria", () => {
    const r = doCodigo([
      linha({ tipoVaga: "Efetiva" }),
      linha({ tipoVaga: "Contrato Verde e Amarelo" }),
    ]);
    expect(r?.valores.natureza).toBe("EFETIVA");
    expect(r?.veredictos.natureza).toBe("PREENCHIDO");
  });

  it("os cinco campos abstidos NÃO viram instrução de escrita", () => {
    const r = doCodigo([linha({ tipoVaga: "Contrato Verde e Amarelo", cargo: "Inexistente" })]);
    expect(temAlgoAPrePreencher(r!.valores)).toBe(false);
  });

  it("UM campo preenchido já basta para o escritor ir ao banco", () => {
    const r = doCodigo([linha({ slaEntrega: "15/03/2026" })]);
    expect(temAlgoAPrePreencher(r!.valores)).toBe(true);
  });

  it("linha sem código legível é descartada, e não vira um balde", () => {
    const mapa = agregarPrePreenchimentoPorCodigo(
      [
        { ...linha({ tipoVaga: "Efetiva" }), codigo: null },
        { ...linha({ tipoVaga: "Temporária" }), codigo: "   " },
      ],
      CATALOGOS,
    );
    expect(mapa.size).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 6. A PROCEDÊNCIA: §A.6 E A GRAVAÇÃO HUMANA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a procedência devolve NOME DE CAMPO, e nunca valor (§A.6)", () => {
  it("a linha da vaga pode trazer o que trouxer: só o vocabulário fechado sai", () => {
    const campos = camposComProcedenciaDaPlanilha({
      naturezaOrigem: PROCEDENCIA_DA_PLANILHA,
      cargoOrigem: PROCEDENCIA_DA_PLANILHA,
      /* Ruído deliberado: nada disto pode atravessar. */
      substituidoCpf: "000.000.000-00",
      solicitanteNome: "NOME SINTETICO",
      natureza: "EFETIVA",
      cargoId: CARGO_EXATO,
      salarioAbertura: "1234.56",
    });
    expect(campos).toEqual(["natureza", "cargo"]);
    for (const c of campos) expect(CAMPOS_DO_PRE_PREENCHIMENTO).toContain(c);
  });

  it("valor de procedência FORA do vocabulário não marca o campo", () => {
    expect(camposComProcedenciaDaPlanilha({ cargoOrigem: "ATS" })).toEqual([]);
    expect(camposComProcedenciaDaPlanilha({ cargoOrigem: "planilha" })).toEqual([]);
  });

  it("coluna de valor PREENCHIDA sem carimbo não conta como planilha", () => {
    expect(camposComProcedenciaDaPlanilha({ cargoId: CARGO_EXATO, cargoOrigem: null })).toEqual([]);
  });

  it("vaga sem nada devolve LISTA VAZIA, e a lista vazia não é nulo", () => {
    expect(camposComProcedenciaDaPlanilha({})).toEqual([]);
    expect(camposComProcedenciaDaPlanilha(null)).toEqual([]);
    expect(camposComProcedenciaDaPlanilha(undefined)).not.toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 7. O CONTRATO ENTRE AS DUAS LINGUAGENS, QUE HOJE SÓ ESTÁ ESCRITO LADO A LADO
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ─ OS RÓTULOS DAS COLUNAS SÃO LITERAIS DUPLICADOS EM PYTHON E EM TYPESCRIPT ────────────────────
 *
 * O `ai-service` procura os rótulos no cabeçalho (`COLUNAS_EXIGIDAS` + `COLUNAS_OPCIONAIS`) e o
 * backend reconhece os mesmos rótulos ao reprojetar a linha. O comentário do lado TypeScript diz,
 * com razão, que divergir ali NÃO dá erro: "o backend simplesmente nunca reconheceria a coluna que o
 * outro lado achou, e o pré-preenchimento ficaria vazio EM SILÊNCIO".
 *
 * ERA EXATAMENTE ISSO QUE NADA IMPEDIA: os dois lados ficavam escritos lado a lado e NENHUM TESTE
 * os comparava, em nenhuma das duas suítes. Corrigir o rótulo de um lado só (a planilha é editada à
 * mão, e renomear coluna é a edição mais comum que existe) desligaria a frente sem uma linha
 * vermelha em lugar nenhum, e o sintoma seria "o pré-preenchimento parou de chegar", que é
 * indistinguível de planilha sem a coluna.
 *
 * SÃO DOIS DEPLOYS DIFERENTES, com ciclos de release diferentes, e é por isso que a trava tem de ser
 * de teste e não de disciplina.
 */
describe("os rótulos do cabeçalho são os MESMOS nos dois lados da rede", () => {
  const PYTHON = readFileSync(
    join(__dirname, "..", "..", "..", "ai-service", "app", "planilha_viva.py"),
    "utf8",
  );

  /**
   * Os pares `"campo": "Rótulo"` de dentro de um dicionário nomeado, e só de dentro dele.
   *
   * O NOME É ANCORADO NO COMEÇO DA LINHA, e a âncora é o conserto de um falso vermelho que esta
   * própria asserção produziu: os dois nomes de dicionário aparecem ANTES, dentro da docstring do
   * módulo, e sem a âncora a busca atravessava a prosa e trazia o PRIMEIRO dicionário do arquivo,
   * qualquer que fosse o nome pedido. Comparação de contrato que lê o bloco errado é pior que
   * nenhuma: ela acusa divergência onde não há, e esconde a que existe.
   */
  function dicionario(nome: string): Record<string, string> {
    const bloco = new RegExp(`^${nome}[^{\\n]*\\{([\\s\\S]*?)\\n\\}`, "m").exec(PYTHON)?.[1];
    expect(bloco, `o dicionário ${nome} não foi achado em planilha_viva.py`).toBeDefined();
    const pares: Record<string, string> = {};
    for (const m of (bloco as string).matchAll(/"([A-Za-z]+)"\s*:\s*"([^"]+)"/g)) {
      pares[m[1] as string] = m[2] as string;
    }
    return pares;
  }

  it("o canário morde: os dois dicionários do Python foram lidos de verdade", () => {
    expect(Object.keys(dicionario("COLUNAS_EXIGIDAS"))).toHaveLength(4);
    expect(Object.keys(dicionario("COLUNAS_OPCIONAIS"))).toHaveLength(4);
  });

  it("os QUATRO rótulos opcionais (os do pré-preenchimento) batem exatamente", () => {
    const python = dicionario("COLUNAS_OPCIONAIS");
    expect(python).toEqual({
      tipoVaga: CABECALHOS_DA_PLANILHA_DE_CLIENTE.tipoVaga,
      celulaAtendimento: CABECALHOS_DA_PLANILHA_DE_CLIENTE.celulaAtendimento,
      dataAbertura: CABECALHOS_DA_PLANILHA_DE_CLIENTE.dataAbertura,
      slaEntrega: CABECALHOS_DA_PLANILHA_DE_CLIENTE.slaEntrega,
    });
  });

  it("e o rótulo do CARGO também, que é o quinto campo e vive entre os EXIGIDOS", () => {
    const python = dicionario("COLUNAS_EXIGIDAS");
    expect(python.cargo).toBe(CABECALHOS_DA_PLANILHA_DE_CLIENTE.cargo);
    expect(python.codigoVaga).toBe(CABECALHOS_DA_PLANILHA_DE_CLIENTE.codigo);
    expect(python.cliente).toBe(CABECALHOS_DA_PLANILHA_DE_CLIENTE.cliente);
    expect(python.status).toBe(CABECALHOS_DA_PLANILHA_DE_CLIENTE.status);
  });

  it("os quatro OPCIONAIS do Python são os quatro campos que o modelo da rede declara", () => {
    /*
     * O NOME DO CAMPO, não o rótulo: é por ele que o backend lê o JSON (`ALIAS_NA_REDE`). O modelo
     * Pydantic os declara em snake_case e os serializa em camelCase por alias, então o que se
     * confere aqui é que os quatro campos existem no modelo, com o nome que o de/para espera.
     */
    for (const campo of ["tipo_vaga", "celula_atendimento", "data_abertura", "sla_entrega"]) {
      expect(
        new RegExp(`${campo}:\\s*str\\s*\\|\\s*None`).test(PYTHON),
        `o campo ${campo} saiu do modelo da rede: o pré-preenchimento chegaria vazio em silêncio`,
      ).toBe(true);
    }
  });
});

describe("a gravação humana limpa o carimbo DO CAMPO que mudou, e de nenhum outro", () => {
  const vagaGravada = {
    natureza: "EFETIVA",
    linhaServicoId: 3,
    cargoId: CARGO_EXATO,
    dataAbertura: "2026-02-01",
    dataLimite: "2026-03-15",
  };

  it("trocar o CARGO limpa só `cargo_origem`, e a lista é só de nomes de coluna", () => {
    const limpar = procedenciaALimpar(vagaGravada, {
      ...vagaGravada,
      cargoId: CARGO_COLIDE_A,
    });
    expect(limpar).toEqual({ cargoOrigem: null });
  });

  it("SALVAR SEM MUDAR não limpa nada, mesmo com o formulário COMPLETO de volta", () => {
    expect(procedenciaALimpar(vagaGravada, { ...vagaGravada })).toEqual({});
  });

  it("a caixa do UUID e do token de enum não inventa mudança", () => {
    expect(
      procedenciaALimpar(vagaGravada, {
        ...vagaGravada,
        cargoId: CARGO_EXATO.toUpperCase(),
        natureza: "efetiva",
      }),
    ).toEqual({});
  });

  it("o número da linha de serviço e o texto do corpo são o mesmo fato", () => {
    expect(procedenciaALimpar(vagaGravada, { ...vagaGravada, linhaServicoId: "3" })).toEqual({});
    expect(procedenciaALimpar(vagaGravada, { ...vagaGravada, linhaServicoId: 7 })).toEqual({
      linhaServicoOrigem: null,
    });
  });

  it("ESVAZIAR o campo limpa o carimbo: carimbo sobre campo vazio é a mesma mentira", () => {
    expect(procedenciaALimpar(vagaGravada, { ...vagaGravada, dataLimite: "" })).toEqual({
      dataLimiteOrigem: null,
    });
    expect(procedenciaALimpar(vagaGravada, { ...vagaGravada, natureza: null })).toEqual({
      naturezaOrigem: null,
    });
  });

  it("campo que a porta NEM VAI GRAVAR é ignorado: preservar não é apagar", () => {
    expect(procedenciaALimpar(vagaGravada, { observacoes: "texto qualquer" })).toEqual({});
  });

  it("os cinco campos são alcançáveis, e nenhuma coluna de procedência se repete", () => {
    const limpar = procedenciaALimpar(vagaGravada, {
      natureza: "TEMPORARIA",
      linhaServicoId: 5,
      cargoId: CARGO_COLIDE_B,
      dataAbertura: "2026-02-02",
      dataLimite: "2026-03-16",
    });
    const colunas = Object.keys(limpar);
    expect(colunas).toHaveLength(CAMPOS_DO_PRE_PREENCHIMENTO.length);
    expect(new Set(colunas).size).toBe(colunas.length);
    for (const c of colunas) expect(c.endsWith("Origem")).toBe(true);
    for (const v of Object.values(limpar)) expect(v).toBeNull();
  });

  it("sem vaga ou sem corpo nada se limpa (a liberação que só vincula o cliente)", () => {
    expect(procedenciaALimpar(null, { ...vagaGravada })).toEqual({});
    expect(procedenciaALimpar(vagaGravada, null)).toEqual({});
  });
});
