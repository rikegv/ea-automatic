import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ─ ONDA E NO CADASTRO DO CLIENTE: OS DOIS CAMPOS, OPCIONAIS, E A DÍVIDA DA §A.36 ───────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CÓDIGO (§A.38/§A.40 regra 2), por quem NÃO implementa.
 * A técnica (varredura de fonte, e o limite dela) está declarada no rodapé, e vale igual aqui.
 *
 * ┌─ O REQUISITO, ITEM 2 DA OST ────────────────────────────────────────────────────────────────┐
 * │ Dois campos no cadastro do cliente, seletores que leem os catálogos. **OPCIONAIS**: cliente  │
 * │ sem segmento e sem comercial continua salvando. Não é detalhe: no dia seguinte à subida, os  │
 * │ 232 clientes estão exatamente assim, e um campo obrigatório aqui trancaria TODA edição de    │
 * │ cliente até alguém preencher os dois, numa tela que a operação usa todo dia.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o seletor de COMERCIAL mostra NOME DE PESSOA. O que este arquivo afirma sobre ele é de
 * forma, e nenhum nome real aparece aqui.
 */

const PAGINA = new URL("../app/(app)/admin/clientes/page.tsx", import.meta.url).pathname;

function fonte(): string {
  const cru = readFileSync(PAGINA, "utf8");
  return cru.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * AS JANELAS EM VOLTA DE **TODAS** AS OCORRÊNCIAS do rótulo, e não só da primeira.
 *
 * A primeira ocorrência de "Segmento" nesta página é a DECLARAÇÃO DE TIPO, lá no topo, a 600 linhas
 * do formulário: uma janela só, na primeira, reprovaria a tela certa. O leitor junta todas as
 * janelas e pergunta sobre o conjunto, que é o que o requisito diz de verdade ("existe um seletor").
 *
 * A JANELA É GENEROSA de propósito: o `Select` do design system tem várias props e o bloco do campo
 * costuma passar de 20 linhas. Janela curta acharia metade da tag.
 */
function campo(src: string, rotulo: RegExp): string {
  const global = new RegExp(rotulo.source, "g");
  const janelas = [...src.matchAll(global)].map((m) =>
    src.slice(Math.max(0, m.index - 500), m.index + 900),
  );
  expect(
    janelas.length,
    `nenhum campo casando ${rotulo} no cadastro de cliente. O item 2 da OST pede os dois seletores.`,
  ).toBeGreaterThan(0);
  return janelas.join("\n/* ── outra ocorrência ── */\n");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. OS DOIS SELETORES EXISTEM, E SÃO DO DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe.each([
  ["segmento", /Segmento/],
  ["comercial", /Comercial/],
])("o seletor de %s no cadastro do cliente", (nome, rotulo) => {
  it("existe e usa o `Select`/`Combobox` do design system (§A.35)", () => {
    const bloco = campo(fonte(), rotulo);
    expect(
      /<Select|<Combobox/.test(bloco),
      "§A.35: o `<select>` do navegador abre o dropdown do sistema operacional e destoa do tema",
    ).toBe(true);
  });

  /**
   * OPCIONAL, E A PROVA É A OPÇÃO VAZIA. Sem ela, quem abriu o cliente para corrigir o CNPJ é
   * obrigado a escolher um segmento que ele não sabe, e escolhe qualquer um: o campo passa a ter
   * dado errado em vez de dado ausente, que é pior, porque dado errado ninguém procura.
   */
  it("é OPCIONAL: oferece a opção de não informar", () => {
    const bloco = campo(fonte(), rotulo);
    expect(
      /não informado|Não Informado|value: ""|value=""|placeholder=/i.test(bloco),
      "sem opção vazia, o campo vira obrigatório na prática",
    ).toBe(true);
    expect(bloco, "campo obrigatório trancaria a edição dos 232 clientes que nascem sem ele").not.toMatch(
      /\brequired\b/,
    );
  });

  /**
   * O QUE VAI NO CORPO É `null`, E NÃO `""` NEM `NaN`. `Number("")` é zero, e zero é um id que não
   * existe: o backend recusaria com "este segmento não existe" para quem só quis LIMPAR o campo.
   * Esta é a ponta frontend do achado "id inválido lança, nunca vira nulo": limpar tem de mandar
   * nulo de propósito, e não um zero por acidente.
   */
  it(`manda \`${nome}Id\` NULO quando ninguém escolheu, nunca "" nem NaN`, () => {
    const src = fonte();
    // TODAS AS ATRIBUIÇÕES, e não a primeira: a PRIMEIRA é o estado inicial do formulário
    // (`segmentoId: ""`), que é legítimo e não é o corpo da requisição. O requisito é sobre o que
    // SAI, então basta UMA das atribuições mandar o nulo explícito.
    const envios = [...src.matchAll(new RegExp(`${nome}Id:\\s*([^,\\n]+)`, "gi"))].map((m) => m[1]);
    expect(envios.length, `não achei nenhuma atribuição de ${nome}Id`).toBeGreaterThan(0);
    expect(
      envios.some((e) => /null/.test(e)),
      `nenhuma atribuição de \`${nome}Id\` manda nulo (achei: ${JSON.stringify(envios.map((e) => e.trim()))}). ` +
        `Sem o nulo explícito, limpar o campo vira id zero, e o backend recusa com "não existe".`,
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A DÍVIDA DA §A.36, QUE VENCEU NESTA ONDA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§A.35/§A.36: a tela de clientes não tem mais `<select>` nativo", () => {
  /**
   * ─ A DÍVIDA ERA CONHECIDA E TINHA GATILHO ────────────────────────────────────────────────────
   *
   * A §A.36 registra que o seletor de Tipo De Marcação é `<select>` nativo, anterior à §A.35, e
   * manda corrigir QUANDO A TELA FOR TRABALHADA. Ela foi: os dois campos novos moram nela. O mapa
   * da onda contou QUATRO (tipo de marcação, periodicidade do benefício, vínculo e o filtro por
   * tipo de serviço) e concluiu "cabe, e entra".
   *
   * O CASO É SOBRE A TELA INTEIRA, e não sobre os quatro nominalmente: nominal, ele passaria com o
   * quinto nativo que alguém acrescentasse amanhã.
   */
  it("nenhum `<select>` cru na página inteira", () => {
    const achados = [...fonte().matchAll(/.{0,60}<select[\s>].{0,60}/g)].map((m) => m[0]);
    expect(
      achados,
      "§A.35: nenhuma caixa de seleção do sistema usa o `<select>` do navegador",
    ).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. SE A TABELA GANHOU COLUNA, ELA NASCE COM FILTRO E COM ORDENAÇÃO (§A.37/§A.29)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("coluna nova na tabela de clientes nasce com filtro e ordenação", () => {
  /**
   * ─ O CASO NÃO EXIGE A COLUNA: ele exige COERÊNCIA ────────────────────────────────────────────
   *
   * A OST pede os dois CAMPOS no cadastro, e não uma coluna na tabela. Exigir a coluna seria o
   * teste inventando escopo (§A.31). Mas SE ela nascer, a §A.37 é automática e não se pergunta:
   * coluna nova = célula + ordenação + filtro, as três de uma vez. É o caso que pega a entrega
   * pela metade, que é como a §A.37 nasceu.
   */
  it.each([
    ["Segmento", "segmento"],
    ["Comercial", "comercial"],
  ])("se existe a coluna %s, existe o filtro e a ordenação dela", (rotulo, chave) => {
    const src = fonte();
    const i = src.indexOf("<thead");
    if (i < 0) return;
    const head = src.slice(i, src.indexOf("</thead>", i));
    if (!new RegExp(rotulo, "i").test(head)) return; // a coluna não nasceu, e isso é válido

    expect(head, `§A.29: a coluna ${rotulo} não é ordenável`).toMatch(
      new RegExp(`chave="${chave}[^"]*"`, "i"),
    );
    expect(
      new RegExp(`f${rotulo}|filtro${rotulo}|${chave}s?Filtro`, "i").test(src),
      `§A.37: a coluna ${rotulo} nasceu sem filtro`,
    ).toBe(true);
  });
});

/**
 * ─ O LIMITE DESTE ARQUIVO, DECLARADO (§A.13) ───────────────────────────────────────────────────
 *
 * VARREDURA DE FONTE NÃO É PROVA VISUAL. Ela afirma que o seletor existe, que é do design system e
 * que o corpo manda nulo; ela NÃO vê o dropdown cortado, a busca ausente numa lista longa nem o
 * campo espremido no formulário. A prova visual (§A.13/§A.20) é do coordenador.
 *
 * O PONTO CEGO, e é meu: os leitores casam por RÓTULO (`/Segmento/`, `/Comercial/`) e por NOME DE
 * CAMPO (`segmentoId`). Renomear qualquer um dos dois faz o leitor não achar o bloco, e o caso fica
 * VERMELHO, nunca verde: é fail-closed de propósito. Quem renomear vem aqui trocar a busca, e não
 * apagar o caso.
 *
 * SEGUNDO PONTO CEGO, DECLARADO: a janela de 1.300 caracteres em volta do rótulo pode alcançar um
 * `<Select>` VIZINHO. Se os dois campos novos ficarem colados a outro seletor, o caso "usa o design
 * system" pode passar por causa do vizinho. É o preço de não renderizar a tela, e é por isso que a
 * §A.35 também é conferida pela varredura global de `<select>` cru, logo acima, que não depende de
 * janela nenhuma.
 */
