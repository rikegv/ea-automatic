import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { menuDaRota } from "./menu-rotas";

/**
 * ─ ONDA E NA CENTRAL DE VAGAS: DOIS FILTROS, ZERO COLUNA, E A FICHA QUE LÊ DE VOLTA ────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CÓDIGO (§A.38/§A.40 regra 2), por quem NÃO implementa.
 *
 * ┌─ POR QUE VARREDURA DA FONTE, E NÃO RENDERIZAÇÃO ────────────────────────────────────────────┐
 * │ A Central De Vagas é uma página de ~5.000 linhas, cliente, com dezenas de chamadas de rede e │
 * │ estado de sessão. Montá-la no `happy-dom` exigiria dublar meia aplicação, e o teste passaria │
 * │ a medir os dublês. O que esta onda muda na tela é ESTRUTURAL (um campo de filtro existe ou   │
 * │ não, a tabela ganhou coluna ou não, a ficha lê o valor resolvido ou o cru), e estrutura se    │
 * │ mede na fonte com honestidade.                                                                │
 * │                                                                                               │
 * │ O LIMITE ESTÁ DECLARADO NO RODAPÉ: varredura de fonte NÃO substitui a prova visual            │
 * │ (§A.13/§A.20), que é do coordenador.                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O DEFEITO MAIS PROVÁVEL DA ONDA INTEIRA, e ele mora aqui ──────────────────────────────────┐
 * │ O FILTRO ESCRITO CONTRA A COLUNA CRUA. `vagas.segmento_id` é NULO na vaga que HERDA, e herdar │
 * │ é a regra, não a exceção: filtrar por "Varejo" contra a coluna crua perde a MAIORIA das vagas │
 * │ e devolve uma lista curta que parece certa. Não há erro, há resposta a menos.                  │
 * │ O filtro casa pelo valor RESOLVIDO (`v.segmento.id`), e é isso que os casos abaixo cobram.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal. A varredura lê marcação de tela.
 */

const PAGINA = new URL("../app/(app)/as/vagas/page.tsx", import.meta.url).pathname;

/**
 * A FONTE SEM COMENTÁRIO, e isso não é preciosismo: esta página documenta as próprias decisões em
 * blocos enormes, e vários deles CITAM o que está sendo feito ("o filtro de segmento", "a coluna
 * que não nasce"). Procurar no texto cru acharia a citação e daria o teste por verde com a tela
 * errada.
 */
function fonte(): string {
  const cru = readFileSync(PAGINA, "utf8");
  return cru.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** O bloco do cabeçalho da tabela. */
function cabecalho(src: string): string {
  const i = src.indexOf("<thead");
  expect(i, "não achei o <thead> da tabela de vagas").toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("</thead>", i));
}

/** O bloco de UMA linha da tabela (o `map` das vagas visíveis). */
function linhaDaTabela(src: string): string {
  const i = src.indexOf("visiveis.map((v) => (");
  expect(i, "não achei o map das linhas da tabela").toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("</tr>", i));
}

/** O corpo do `useMemo` que aplica os filtros à lista. */
function blocoDoFiltro(src: string): string {
  const i = src.indexOf("return rows.filter((v) => {");
  expect(i, "não achei o filtro da lista (`rows.filter`)").toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("return true;", i));
}

/** O campo de filtro com aquele rótulo, do `<FiltroCampo label="X">` até o fechamento. */
function campoDeFiltro(src: string, label: string): string {
  const i = src.indexOf(`<FiltroCampo label="${label}"`);
  expect(
    i,
    `nenhum campo de filtro com label="${label}". §A.28/§A.37: o filtro nasce junto com o dado.`,
  ).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("</FiltroCampo>", i));
}

/** A ficha da vaga (o painel), da abertura do bloco "A Vaga" até o fim dele. */
function ficha(src: string): string {
  const i = src.indexOf('<BlocoFicha titulo="A Vaga">');
  expect(i, "não achei o bloco `A Vaga` da ficha").toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("</BlocoFicha>", i));
}

/** A `<Linha rotulo="X" ...>` da ficha, com as props dela. */
function linhaDaFicha(bloco: string, rotulo: string): string {
  const i = bloco.indexOf(`rotulo="${rotulo}"`);
  expect(
    i,
    `a ficha da vaga não mostra "${rotulo}". Campo que a vaga carrega e ninguém lê de volta é meio campo.`,
  ).toBeGreaterThan(-1);
  return bloco.slice(bloco.lastIndexOf("<Linha", i), bloco.indexOf("/>", i) + 2);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. OS DOIS FILTROS EXISTEM, SÃO MÚLTIPLOS E VÊM DE CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe.each([
  ["Segmento", "optSegmentos"],
  ["Comercial", "optComerciais"],
])("o filtro de %s", (label, _opt) => {
  /** §A.28, sem exceção: todo filtro do sistema aceita vários valores ao mesmo tempo. */
  it("é MÚLTIPLO, pelo componente compartilhado (nada de `<select>` cru, §A.35)", () => {
    const campo = campoDeFiltro(fonte(), label);
    expect(campo, "§A.28: filtro de um valor só").toMatch(/\bmultiple\b/);
    expect(campo, "§A.35: o `<select>` do navegador não obedece ao tema").not.toMatch(/<select[\s>]/);
    expect(campo, "o componente é o `Combobox` compartilhado dos demais campos").toMatch(/<Combobox/);
  });

  /**
   * §A.37: O CATÁLOGO VEM DE UM ENDPOINT, NUNCA DAS LINHAS CARREGADAS. Derivando das linhas, a
   * lista de opções ENCOLHE assim que o primeiro valor é escolhido (a tela passa a mostrar só as
   * vagas daquele segmento), e não há como somar o segundo sem limpar o filtro antes.
   */
  it("as opções NÃO são derivadas das linhas da página", () => {
    const campo = campoDeFiltro(fonte(), label);
    const options = /options=\{([^}]*)\}/.exec(campo)?.[1] ?? "";
    for (const proibido of ["rows", "visiveis", "filtradas", "ordenadas"]) {
      expect(options, `as opções saem de \`${proibido}\`, e encolhem no primeiro clique`).not.toContain(
        proibido,
      );
    }
  });

  /**
   * §A.37: OS VALORES ESPECIAIS VIRAM OPÇÃO. "De quem NÃO tem segmento definido" é metade da
   * pergunta que o campo cria, e sem um sentinela o filtro não sabe respondê-la: lista vazia
   * significa "todos" nesta tela, então não há como pedir "os sem".
   */
  it("oferece a opção de quem NÃO tem o valor definido", () => {
    const campo = campoDeFiltro(fonte(), label);
    expect(
      /SEM_|Não Informado|Sem /i.test(campo) || /SEM_/.test(fonte()),
      "sem sentinela, ninguém consegue perguntar quais vagas estão sem este campo",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O FILTRO CASA PELO VALOR RESOLVIDO, E NÃO PELA COLUNA CRUA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o recorte usa o valor RESOLVIDO (o que herda entra junto com o que sobrepõe)", () => {
  /**
   * OS DOIS LADOS NO MESMO CASO, e isso é deliberado: separados, o "não lê a coluna crua" passaria
   * VAZIO enquanto o filtro não existisse (nada escrito, nada a achar, verde), e verde vazio é a
   * pior forma de falso positivo, porque some no dia em que já não protege nada.
   */
  it.each([["segmento"], ["comercial"]])(
    "o recorte de %s existe E casa pelo valor resolvido, nunca pela coluna crua",
    (campo) => {
      const bloco = blocoDoFiltro(fonte());
      expect(
        bloco,
        "o campo de filtro existe na tela e o recorte não o aplica: o filtro MENTE, que é pior do que não existir",
      ).toMatch(new RegExp(`\\b${campo}`, "i"));
      expect(
        bloco,
        `\`v.${campo}Id\` é a coluna crua: nula na vaga que HERDA, e herdar é a regra. ` +
          `O recorte casa pelo resolvido (\`v.${campo}?.id\`).`,
      ).not.toMatch(new RegExp(`v\\.${campo}Id\\b`));
    },
  );

  /** Os dois filtros contam no badge e são apagados pelo "limpar", como todos os outros. */
  it("os dois entram na contagem de filtros ativos e no `limparFiltros`", () => {
    const src = fonte();
    const ativos = src.slice(src.indexOf("const filtrosAtivos ="), src.indexOf("const limparFiltros"));
    const limpar = src.slice(src.indexOf("const limparFiltros"), src.indexOf("const limparFiltros") + 700);
    for (const estado of ["Segmento", "Comercial"]) {
      expect(ativos, `o filtro de ${estado} não conta no badge do gatilho`).toMatch(
        new RegExp(`f${estado}s?\\b`),
      );
      expect(limpar, `o "limpar filtros" não apaga o de ${estado}`).toMatch(
        new RegExp(`setF${estado}s?\\(`),
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. NENHUMA COLUNA NOVA NA TABELA (item 4 da OST, e é medida)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a tabela NÃO ganha coluna (a Onda D acabou de tirar uma para caber)", () => {
  /**
   * A LARGURA JÁ FOI MEDIDA em produção: sobra 151,69px, e duas colunas de texto livre ("Varejo",
   * "Ana Paula Rodrigues") não cabem nisso sem devolver a rolagem lateral que a Onda B3 e a Onda D
   * acabaram de zerar. O diretor aprovou FILTRO SIM, COLUNA NÃO.
   */
  it("o cabeçalho não ganha Segmento nem Comercial", () => {
    const head = cabecalho(fonte());
    expect(head, "coluna nova aqui devolve a rolagem lateral (§A.20)").not.toMatch(/Segmento/i);
    expect(head, "coluna nova aqui devolve a rolagem lateral (§A.20)").not.toMatch(/Comercial/i);
  });

  it("a linha da tabela não desenha célula de segmento nem de comercial", () => {
    const linha = linhaDaTabela(fonte());
    expect(linha).not.toMatch(/v\.segmento\b/);
    expect(linha).not.toMatch(/v\.comercial\b/);
  });

  /**
   * O `colSpan` DA LINHA VAZIA TEM DE BATER com o número de colunas. É o defeito clássico de quem
   * mexe em tabela: a mensagem de "nenhuma vaga" passa a ocupar menos (ou mais) que a largura toda,
   * e ninguém repara até a tela ficar vazia na frente de alguém.
   */
  it("o colSpan da linha vazia continua batendo com o número de colunas", () => {
    const src = fonte();
    // AS COLUNAS SÃO `ColunaOrdenavel as="th"` (§A.29) MAIS os `<th>` literais que sobraram (Ações,
    // que não ordena). Contar só `<th` daria 2, e o teste reprovaria a tabela certa.
    const head = cabecalho(src);
    const colunas =
      (head.match(/as="th"/g) ?? []).length + (head.match(/<th[\s>]/g) ?? []).length;
    const colSpan = Number(/colSpan=\{(\d+)\}/.exec(src.slice(src.indexOf("</thead>")))?.[1] ?? 0);
    expect(colunas, "não achei as colunas do cabeçalho").toBeGreaterThan(0);
    expect(colSpan, `o colSpan (${colSpan}) não bate com as ${colunas} colunas`).toBe(colunas);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. A FICHA LÊ OS DOIS DE VOLTA, COM "NÃO INFORMADO" QUANDO NÃO HÁ VALOR
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a ficha da vaga mostra o segmento e o comercial", () => {
  it.each([["Segmento"], ["Comercial"]])("a ficha tem a linha %s", (rotulo) => {
    expect(linhaDaFicha(ficha(fonte()), rotulo).length).toBeGreaterThan(0);
  });

  /**
   * ─ O NULO TEM DE CHEGAR NULO ATÉ A `Linha` ───────────────────────────────────────────────────
   *
   * O componente `Linha` já escreve "não informado" quando o valor é nulo ou vazio (§A.11), e é ele
   * a fonte única desse texto na ficha inteira. Quem "ajuda" com um `?? "-"`, um `?? ""` ou um
   * travessão no meio do caminho REESCREVE a regra do lado de fora do componente, e a §A.11 proíbe
   * o glifo em qualquer texto que chegue ao usuário.
   *
   * O cenário é o do dia seguinte à subida: os 232 clientes nascem sem segmento e sem comercial, e
   * "não informado" é o que a ficha inteira vai mostrar até alguém preencher.
   */
  it.each([["Segmento"], ["Comercial"]])(
    "a linha %s não inventa marcador próprio: o nulo chega nulo na `Linha`",
    (rotulo) => {
      const linha = linhaDaFicha(ficha(fonte()), rotulo);
      expect(linha, "§A.11: travessão é proibido em texto de tela").not.toContain("—");
      expect(linha, 'marcador próprio: quem escreve "não informado" é a `Linha`').not.toMatch(
        /\?\?\s*"(-|--|\s*)"/,
      );
    },
  );

  /** O rótulo resolvido é o do contrato (`AsValorHerdado.rotulo`), não um `id` cru na tela. */
  it.each([["Segmento", "segmento"], ["Comercial", "comercial"]])(
    "a linha %s mostra o RÓTULO, e não o id",
    (rotulo, campo) => {
      const linha = linhaDaFicha(ficha(fonte()), rotulo);
      expect(linha, `a ficha mostraria o número em vez do nome`).toMatch(
        new RegExp(`${campo}[?.\\s]*\\.?(rotulo|Rotulo)`),
      );
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. O QUINTO LUGAR DO MENU (o que o backend não alcança) E A §A.11 NA PÁGINA INTEIRA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("as rotas dos dois gerenciadores são governadas por menu (§A.23)", () => {
  /**
   * É O QUINTO LUGAR do menu novo, e o único que mora no frontend: sem ele, a rota da tela não é
   * governada por menu nenhum e qualquer sessão que descubra a URL abre o gerenciador. Os outros
   * quatro estão travados no `onda-e.catalogos-rbac.tester.spec.ts`, do lado do backend.
   */
  it.each([
    ["/admin/as/segmentos", "as-segmentos"],
    ["/admin/as/comerciais", "as-comerciais"],
  ])("a rota %s responde pelo menu %s", (rota, codigo) => {
    expect(menuDaRota(rota), `a rota ${rota} não é governada por menu nenhum`).toBe(codigo);
  });

  /** REGRESSÃO: as rotas da Onda C continuam governadas. Lista editada à mão perde o vizinho. */
  it.each([
    ["/admin/as/linhas-servico", "as-linhas-servico"],
    ["/admin/as/etapas", "as-etapas"],
  ])("a rota %s continua respondendo pelo menu %s", (rota, codigo) => {
    expect(menuDaRota(rota)).toBe(codigo);
  });
});

describe("§A.11: a página inteira continua sem travessão", () => {
  it("nenhum U+2014 na Central De Vagas", () => {
    const cru = readFileSync(PAGINA, "utf8");
    const achados = [...cru.matchAll(/.{0,40}—.{0,40}/g)].map((m) => m[0]);
    expect(achados, "§A.11: travessão é proibido em todo texto do sistema").toEqual([]);
  });
});

/**
 * ─ O LIMITE DESTE ARQUIVO, DECLARADO (§A.13) ───────────────────────────────────────────────────
 *
 * VARREDURA DE FONTE NÃO É PROVA VISUAL. Ela afirma que o campo existe, que o recorte o aplica e
 * que a tabela não ganhou coluna; ela NÃO vê largura esmagada, dropdown cortado, nem o chip do
 * filtro sobrando na barra. A prova visual (§A.13/§A.20) é do coordenador, no browser, e este
 * arquivo não a substitui.
 *
 * SEGUNDO PONTO CEGO, e é meu: os leitores casam por RÓTULO (`label="Segmento"`,
 * `rotulo="Comercial"`). Renomear o rótulo na tela faz o leitor não achar o bloco e o teste ficar
 * VERMELHO, e não verde: é fail-closed de propósito. Quem renomear precisa vir aqui trocar a
 * busca, e não apagar o caso, porque a pergunta que ele faz continua valendo.
 */
