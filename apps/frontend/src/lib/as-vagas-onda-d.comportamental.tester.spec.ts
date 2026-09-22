import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VAGA_OBRIGATORIOS } from "@ea/shared-types";
import { pendenciasComLinhaDeServico } from "./as-linhas-servico";

/**
 * ─ ONDA D NA TELA: A RÉGUA É UMA, A COLUNA CARGO SAI, E O BOTÃO VIRA ENGRENAGEM ────────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, ANTES DO CÓDIGO (§A.38/§A.40 regra 2), por quem NÃO implementa.
 *
 * ┌─ POR QUE VARREDURA DA FONTE, E NÃO RENDERIZAÇÃO ────────────────────────────────────────────┐
 * │ A Central De Vagas é uma página de ~4.800 linhas, cliente, com dezenas de chamadas de rede e │
 * │ estado de sessão. Montá-la no `happy-dom` exigiria dublar meia aplicação, e o teste passaria  │
 * │ a medir os dublês. O que esta onda muda na tela é ESTRUTURAL (uma coluna existe ou não, um    │
 * │ campo tem âncora ou não, o `colSpan` bate com o número de colunas), e estrutura se mede na    │
 * │ fonte com honestidade.                                                                        │
 * │                                                                                               │
 * │ O LIMITE ESTÁ DECLARADO NO RODAPÉ DESTE ARQUIVO: varredura de fonte NÃO substitui a prova     │
 * │ visual (§A.13/§A.20), que é do coordenador.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PONTO CEGO DE 11/09, E ELE É EXATAMENTE O ITEM 6 DESTA ONDA ─────────────────────────────┐
 * │ O leitor de linhas que casa por RÓTULO fica cego quando o rótulo é renomeado: o teste para   │
 * │ de achar a linha e, dependendo de como foi escrito, isso vira verde em vez de vermelho. O    │
 * │ item 6 RENOMEIA "Gestão Vaga" para "Gestão Da Vaga". A varredura feita aqui procura pelos    │
 * │ DOIS textos, o novo exigido e o velho proibido, para a renomeação não poder passar pela       │
 * │ metade (rótulo novo na tela e teste vizinho ainda casando pelo velho).                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal. A varredura lê marcação de tela.
 */

const PAGINA = new URL("../app/(app)/as/vagas/page.tsx", import.meta.url).pathname;
/**
 * A TRILHA SAIU DA PÁGINA e virou componente, para a tela de Liberar Vaga reusar o MESMO formulário
 * em vez de ganhar um segundo (§A.26). A varredura passou a ler os DOIS arquivos, porque a pergunta
 * que ela faz não mudou de dono: a âncora de cada obrigatório e a lista branca entregue à régua
 * continuam existindo, só que agora moram no componente. Ler só a página deixaria este teste verde
 * por não achar nada, que é o pior desfecho possível para ele.
 */
const TRILHA = new URL("../components/as/vagas/TrilhaDaVaga.tsx", import.meta.url).pathname;

/**
 * A FONTE SEM COMENTÁRIO, e isso não é preciosismo: esta página documenta as próprias decisões em
 * blocos enormes, e vários deles CITAM o que está sendo removido ("o rótulo Gestão Vaga", "a coluna
 * Cargo"). Procurar no texto cru acharia a citação e daria o teste por verde com a tela errada.
 */
function fonte(): string {
  const cru = `${readFileSync(PAGINA, "utf8")}\n${readFileSync(TRILHA, "utf8")}`;
  return cru.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** O bloco do cabeçalho da tabela. */
function cabecalho(src: string): string {
  const i = src.indexOf("<thead");
  const j = src.indexOf("</thead>", i);
  expect(i, "não achei o <thead> da tabela de vagas").toBeGreaterThan(-1);
  return src.slice(i, j);
}

/** O bloco de UMA linha da tabela (o `map` das vagas visíveis). */
function linha(src: string): string {
  const i = src.indexOf("visiveis.map((v) => (");
  expect(i, "não achei o map das linhas da tabela").toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("</tr>", i));
}

/** O objeto que a tela entrega à régua dos obrigatórios, seja qual for o nome da função. */
function objetoDaRegua(src: string): string {
  const nomes = ["pendenciasComLinhaDeServico(", "vagaPendencias("];
  for (const nome of nomes) {
    const i = src.indexOf(nome, src.indexOf("pendenciasAgora"));
    if (i > -1) return src.slice(i, src.indexOf("}),", i));
  }
  throw new Error(
    `a tela precisa calcular as pendências pela régua compartilhada (procurei por ${nomes.join(" ou ")})`,
  );
}

/**
 * OS NOMES DE CAMPO QUE A TELA ENTREGA À RÉGUA, lidos do objeto que ela monta.
 *
 * É uma LISTA BRANCA escrita à mão na página, e é ela o ponto frágil inteiro desta frente (achado
 * F1 da auditoria do mapa): a régua indexa por TEXTO e todo campo do contrato é OPCIONAL, então o
 * campo que a lista branca esquecer chega `undefined`, é lido como VAZIO, e a pendência passa a
 * existir em TODA vaga, com o campo preenchido na frente da pessoa e o typecheck verde.
 *
 * O PONTO CEGO DESTE LEITOR, DECLARADO: ele lê as chaves do objeto literal. Se um dia a tela passar
 * a espalhar o formulário inteiro (`{ ...form }`), que é a correção ESTRUTURAL deste risco e seria
 * bem-vinda, este leitor não acha chave nenhuma e o teste fica VERMELHO sem defeito nenhum. É
 * fail-closed de propósito (o erro aparece, e não some), mas quem fizer essa mudança precisa vir
 * aqui trocar a leitura, e não apagar o teste: a pergunta que ele faz continua valendo.
 */
function chavesEntreguesPelaTela(src: string): Set<string> {
  const objeto = objetoDaRegua(src);
  return new Set([...objeto.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]));
}

/** A abertura da tag que carrega aquele `id`, para conferir as props dela (o asterisco). */
function tagComId(src: string, id: string): string {
  const i = src.indexOf(`id="${id}"`);
  expect(
    i,
    `nenhum campo da tela tem id="${id}": a pendência clicável não levaria a lugar nenhum`,
  ).toBeGreaterThan(-1);
  return src.slice(src.lastIndexOf("<", i), src.indexOf(">", i) + 1);
}

// ── ITEM 3: A RÉGUA CONTINUA UMA, E TODA PENDÊNCIA TEM ONDE CAIR ───────────────────────────────

describe("a régua é UMA: o que o servidor cobra é o que a tela desenha e sabe apontar", () => {
  /**
   * O LAÇO É DERIVADO DA CONSTANTE, e por isso ele NÃO reprova quem APAGAR uma entrada da régua:
   * encolhe junto, em silêncio. Ele cobre o caso oposto, que é o que acontece de verdade numa onda
   * de acréscimo: entrada nova na lista sem campo correspondente na tela. Os dois campos da Onda D
   * têm caso ESCRITO À MÃO logo abaixo, e é lá que mora a trava contra a remoção.
   */
  it.each(VAGA_OBRIGATORIOS.map((p) => [p.campo, p.ancora] as const))(
    "o obrigatório %s tem um campo com id=%s na tela",
    (_campo, ancora) => {
      expect(fonte()).toContain(`id="${ancora}"`);
    },
  );

  it.each(VAGA_OBRIGATORIOS.map((p) => [p.campo] as const))(
    "a tela ENTREGA o campo %s à régua, senão a pendência fica eterna",
    (campo) => {
      // Não passar o campo é pior do que não cobrá-lo: o valor chega `undefined`, a régua lê
      // "vazio" e a tela acusa a pendência com o campo PREENCHIDO na frente da pessoa.
      expect(objetoDaRegua(fonte())).toMatch(new RegExp(`\\b${campo}\\s*:`));
    },
  );

  it("ESCRITO À MÃO: o Cliente tem âncora `vaga-cliente` e ganha o asterisco de obrigatório", () => {
    const tag = tagComId(fonte(), "vaga-cliente");
    expect(tag, "sem `obrigatorio` o campo não recebe o asterisco (§ item 1)").toContain(
      "obrigatorio",
    );
  });

  it("ESCRITO À MÃO: a Previsão de entrega tem âncora `vaga-previsao-entrega` e o asterisco", () => {
    const tag = tagComId(fonte(), "vaga-previsao-entrega");
    expect(tag).toContain("obrigatorio");
  });

  it("ESCRITO À MÃO: a tela entrega `codCliente` e `dataLimite` à régua", () => {
    const obj = objetoDaRegua(fonte());
    expect(obj).toMatch(/\bcodCliente\s*:/);
    expect(obj).toMatch(/\bdataLimite\s*:/);
  });

  /**
   * A ORDEM DA LISTA DE PENDÊNCIAS É A ORDEM DA TRILHA, e trilha é o que a pessoa VÊ: dentro de um
   * mesmo passo, a lista tem de seguir a ordem dos campos na tela. Fora disso, clicar as pendências
   * de cima para baixo faz o olho pular para trás no formulário.
   */
  it("dentro de cada passo, a ordem da régua acompanha a ordem dos campos na tela", () => {
    const src = fonte();
    const passos = [...new Set(VAGA_OBRIGATORIOS.map((p) => p.passo))];

    for (const passo of passos) {
      const posicoes = VAGA_OBRIGATORIOS.filter((p) => p.passo === passo).map((p) => ({
        campo: p.campo,
        onde: src.indexOf(`id="${p.ancora}"`),
      }));
      expect(
        posicoes.map((p) => p.onde),
        `passo ${passo + 1}: a régua lista ${posicoes.map((p) => p.campo).join(", ")}, e a tela pergunta em outra ordem`,
      ).toEqual([...posicoes.map((p) => p.onde)].sort((a, b) => a - b));
    }
  });

  /**
   * ┌─ O TESTE QUE MATA A CLASSE INTEIRA, E NÃO SÓ OS DOIS CAMPOS DE HOJE (achado F1) ───────────┐
   * │ O QUE ELE ENCENA: preenche TODO campo que a régua cobra, joga fora o que a lista branca da │
   * │ tela NÃO entrega (que é literalmente o que acontece em tempo de execução), e pergunta à     │
   * │ régua o que falta. A resposta certa é NADA. Qualquer campo esquecido na lista branca        │
   * │ aparece aqui como pendência de uma vaga COMPLETA, que é o defeito exato.                    │
   * │                                                                                             │
   * │ ELE VALE PARA O PRÓXIMO OBRIGATÓRIO TAMBÉM: quem acrescentar uma entrada na régua sem       │
   * │ tocar a lista branca da tela fica vermelho aqui sozinho, sem ninguém lembrar de vir editar   │
   * │ este arquivo. O efeito de deixar passar é o pior possível: NENHUMA vaga publica pela tela,   │
   * │ nunca, porque o `enviar()` barra antes de qualquer chamada.                                 │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("vaga COMPLETA não acusa pendência nenhuma depois de passar pela lista branca da tela", () => {
    const entregues = chavesEntreguesPelaTela(fonte());
    const esquecidos = VAGA_OBRIGATORIOS.filter((p) => !entregues.has(p.campo)).map((p) => p.campo);

    expect(
      esquecidos,
      "campo cobrado pela régua e NÃO entregue pela tela: a pendência dele fica eterna",
    ).toEqual([]);

    // E a prova pelo comportamento, e não só pela lista: o formulário cheio, filtrado pela lista
    // branca, tem de sair da régua sem pendência alguma.
    const cheio = Object.fromEntries(
      VAGA_OBRIGATORIOS.map((p) => [p.campo, p.campo === "posicoesOficiais" ? "2" : "preenchido"]),
    );
    const comoATelaEntrega = Object.fromEntries(
      Object.entries(cheio).filter(([campo]) => entregues.has(campo)),
    );

    expect(pendenciasComLinhaDeServico(comoATelaEntrega).map((p) => p.rotulo)).toEqual([]);
  });

  it("a tela não guarda uma SEGUNDA lista de obrigatórios escrita à mão", () => {
    const src = fonte();
    // Uma trava ad-hoc do tipo `if (!form.codCliente) return` no publicar seria a segunda régua, e
    // ela divergiria da primeira no campo seguinte que alguém acrescentasse.
    expect(src).not.toMatch(/if\s*\(\s*!\s*form\.(codCliente|dataLimite)\s*\)/);
  });
});

/**
 * ─ O CLONE, QUE É ONDE O OBRIGATÓRIO NOVO TENTA SER "CONSERTADO" DO JEITO ERRADO ───────────────
 *
 * CLONAR SEM MANTER O CÓDIGO já zerava a previsão de entrega e já mantinha o cliente, e com a
 * previsão virando obrigatória o clone passa a nascer rascunho PEDINDO a previsão de novo. Isso é
 * o efeito desejado, e não um incômodo a remover: PRAZO DE VAGA VELHA NÃO É PRAZO DE VAGA NOVA.
 *
 * A tentação, quando a pendência aparecer na tela do clone, é herdar a data da vaga de origem para
 * "não incomodar". Este teste é o que transforma essa mudança silenciosa em vermelho.
 */
describe("clonar continua zerando a previsão e mantendo o cliente", () => {
  /**
   * O NOME DA FUNÇÃO MUDOU NA EXTRAÇÃO (`preencherTrilhaCom` virou `estadoInicial`, porque a trilha
   * montada já nasce com a vaga dentro em vez de recebê-la por uma sequência de `set`), e o leitor
   * aceita os DOIS, do mesmo jeito que `objetoDaRegua` já aceitava dois nomes de régua. A pergunta
   * é sobre o clone, não sobre como a função se chama hoje.
   */
  function blocoDoClone(): string {
    const src = fonte();
    for (const nome of ["function estadoInicial", "function preencherTrilhaCom"]) {
      const i = src.indexOf(nome);
      if (i > -1) return src.slice(i, i + 4000);
    }
    throw new Error("não achei a função que monta a trilha a partir de outra vaga");
  }

  it("o clone não herda a previsão de entrega da vaga de origem", () => {
    expect(blocoDoClone()).toMatch(/dataLimite:\s*manterCodigo\s*\?/);
  });

  it("o clone MANTÉM o cliente, que é o que a vaga nova tem em comum com a de origem", () => {
    expect(blocoDoClone()).toMatch(/codCliente:\s*v\.codCliente/);
  });
});

describe("a régua compartilhada, chamada como a tela a chama", () => {
  const FORM = {
    codigo: "PV900003",
    nomeDivulgacao: "Auxiliar De Loja",
    cargoId: "11111111-1111-4111-8111-111111111111",
    posicoesOficiais: "2",
    natureza: "NOVA",
    sazonalidade: "OPERACAO_PADRAO",
    linhaServicoId: "3",
    status: "ABERTA",
    dataAbertura: "2026-09-12",
    codCliente: "9001",
    dataLimite: "2026-10-01",
  };

  it("form completo não acusa nada", () => {
    expect(pendenciasComLinhaDeServico(FORM)).toEqual([]);
  });

  it("sem cliente, a tela sabe dizer o que falta e para onde levar", () => {
    const [p] = pendenciasComLinhaDeServico({ ...FORM, codCliente: "" });
    expect(p?.campo).toBe("codCliente");
    expect(p?.ancora).toBe("vaga-cliente");
  });

  it("sem previsão de entrega, idem", () => {
    const [p] = pendenciasComLinhaDeServico({ ...FORM, dataLimite: "" });
    expect(p?.campo).toBe("dataLimite");
    expect(p?.ancora).toBe("vaga-previsao-entrega");
  });
});

// ── ITEM 5: A COLUNA CARGO SAI, E O QUE SEGURA A CONTA É O `colSpan` ───────────────────────────

describe("a coluna Cargo sai da tabela", () => {
  it("o cabeçalho ordenável de cargo não existe mais", () => {
    expect(cabecalho(fonte())).not.toContain('chave="cargo"');
  });

  it("a régua de ordenação não tem mais a entrada de cargo (§A.29)", () => {
    // A entrada órfã deixaria a coluna ordenável sem coluna: clique em nada, seta em lugar nenhum.
    expect(fonte()).not.toMatch(/\{\s*chave:\s*"cargo"/);
  });

  it("a célula de cargo sai da LINHA, e a busca global continua podendo ler o cargo", () => {
    const src = fonte();
    expect(linha(src), "a célula do cargo continua desenhada na linha").not.toContain(
      "v.cargoNome",
    );

    // O filtro e a busca PERMANECEM (recomendação do mapa, [P1]): tirar a COLUNA não é tirar a
    // pergunta "quais vagas são de Operador de Caixa".
    const busca = src.slice(src.indexOf("textoBuscavel(["));
    expect(busca.slice(0, busca.indexOf("])")), "a busca global perdeu o cargo").toContain(
      "v.cargoNome",
    );
  });

  it("o filtro `Cargo Da Vaga` permanece, multiselect, alimentado pelo endpoint (§A.28/§A.37)", () => {
    const src = fonte();
    expect(src).toContain("Cargo Da Vaga");
    expect(src).toContain("fCargos");
    expect(src).toContain("optCargos");
  });

  /**
   * A ARMADILHA SILENCIOSA DO MAPA: `colSpan` fora da conta não quebra nada visível até a tabela
   * ficar VAZIA, que é justamente quando ninguém está olhando. A conta é conferida contra o número
   * de colunas que o cabeçalho realmente desenha, e não contra o número 10 escrito à mão: assim a
   * próxima coluna que entrar ou sair também é cobrada aqui.
   */
  it("as linhas de estado vazio têm colSpan igual ao número de colunas do cabeçalho", () => {
    const src = fonte();
    const head = cabecalho(src);
    const colunas =
      (head.match(/<ColunaOrdenavel/g) ?? []).length + (head.match(/<th\b/g) ?? []).length;

    expect(colunas, "a tabela da Onda D tem 10 colunas: 9 ordenáveis mais Ações").toBe(10);

    const colspans = [...src.matchAll(/colSpan=\{(\d+)\}/g)].map((m) => Number(m[1]));
    expect(colspans.length, "as duas linhas de estado vazio (Carregando e Nenhuma vaga)").toBe(2);
    for (const c of colspans) expect(c).toBe(colunas);
  });

  it("a linha desenha uma célula por coluna do cabeçalho", () => {
    const src = fonte();
    const head = cabecalho(src);
    const colunas =
      (head.match(/<ColunaOrdenavel/g) ?? []).length + (head.match(/<th\b/g) ?? []).length;
    expect((linha(src).match(/<td\b/g) ?? []).length).toBe(colunas);
  });
});

// ── ITEM 6: O BOTÃO DA LINHA ───────────────────────────────────────────────────────────────────

describe("o botão da linha vira engrenagem, e o texto acessível não muda", () => {
  it("usa o ícone `cog`, e o olho sai", () => {
    const l = linha(fonte());
    expect(l).toContain('name="cog"');
    expect(l, "o olho era o ícone antigo do mesmo botão").not.toContain('name="eye"');
  });

  it("o rótulo é `Gestão Da Vaga`, em title case (§A.24), e o antigo não sobra", () => {
    const l = linha(fonte());
    expect(l).toContain("Gestão Da Vaga");
    expect(l).not.toContain("Gestão Vaga");
  });

  it("o `title` e o `aria-label` continuam dizendo 'Abrir a gestão da vaga'", () => {
    const l = linha(fonte());
    expect(l).toContain('title="Abrir a gestão da vaga"');
    expect(l).toContain("aria-label={`Abrir a gestão da vaga");
  });
});

// ── ITEM 4: O RÓTULO DO CLIENTE, DO LADO DA TELA ───────────────────────────────────────────────

describe("o nome do cliente não recebe o código de volta na tela", () => {
  it("o seletor e o filtro consomem o `rotulo` do endpoint, sem remontar nada", () => {
    const src = fonte();
    expect(src).toContain("label: c.rotulo");
    expect(src, "remontar o rótulo na tela recria a divergência que o item 4 elimina").not.toMatch(
      /\$\{c\.codCliente\}\s*-/,
    );
  });
});

/**
 * ─ O QUE ESTE ARQUIVO **NÃO** PROVA, declarado de propósito (§A.13) ────────────────────────────
 *
 * 1. NÃO PROVA QUE A TELA RENDERIZA. Varredura de fonte não monta componente: um erro de JSX que
 *    quebre a página passa por aqui. Quem pega isso é o build e a prova visual.
 * 2. NÃO PROVA LARGURA NEM ESMAGAMENTO (§A.20). O piso `min-w-[...]` da tabela vira herança quando
 *    uma coluna sai, e remedi-lo é medição no browser, do coordenador.
 * 3. NÃO PROVA O SALTO DA PENDÊNCIA. Ele afirma que o `id` existe; que o clique rola até o campo e
 *    põe o cursor nele depende do `requestAnimationFrame` e do DOM de verdade.
 */
