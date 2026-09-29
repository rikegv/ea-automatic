/**
 * ─ A CONTAGEM DE LINHAS DE DADOS: O QUE IMPEDE UM PRINT DE LISTA VAZIA (§A.38) ──────────────────
 *
 * ESCRITO PELO `tester`, que não escreveu a contagem (§A.38).
 *
 * ┌─ POR QUE ESTA PEÇA É DE SEGURANÇA, E NÃO DE COSMÉTICA ───────────────────────────────────────┐
 * │ Print de fila VAZIA no manual ensina o errado com a autoridade da casa: o operador conclui que  │
 * │ a tela é assim, ou que o filtro dele quebrou algo. E é o defeito que MENOS aparece em revisão,   │
 * │ porque a imagem está nítida, a seta está no lugar e o passo está correto: só o conteúdo é que    │
 * │ não ensina nada.                                                                               │
 * │                                                                                                │
 * │ E ela nasceu porque o `LISTA_VAZIA` estava sendo CONTORNADO: o vazio das tabelas da casa é       │
 * │ desenhado DENTRO do `tbody`, como uma linha de `colSpan` ("Nenhum cliente neste filtro."), em 30 │
 * │ lugares do sistema. Uma contagem ingênua via UMA linha ali e aprovava a captura, então o achado  │
 * │ duro que existia justamente para pegar a fila vazia era desarmado pelo jeito que a casa desenha  │
 * │ o vazio. É por isso que quase toda asserção deste arquivo é sobre o que NÃO conta.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { contarLinhasDeDados } from "./captura";

/** Monta um DOM a partir de HTML e devolve a raiz, como o motor faz com a área capturada. */
function dom(html: string): HTMLElement {
  const raiz = document.createElement("div");
  raiz.innerHTML = html;
  return raiz;
}

const linhas = (html: string) => contarLinhasDeDados(dom(html)).linhas;
const listas = (html: string) => contarLinhasDeDados(dom(html)).listas;

describe("o que CONTA como linha de dado", () => {
  it("`tbody tr`, que é o idioma dominante das tabelas da casa", () => {
    expect(
      linhas(`<table><tbody>
        <tr><td>Mariana</td><td>Apto</td></tr>
        <tr><td>Carlos</td><td>A Agendar</td></tr>
      </tbody></table>`),
    ).toBe(2);
  });

  it("`.row` do design system, que é o idioma secundário", () => {
    expect(
      linhas(`<div class="list">
        <div class="row"><div>Mariana</div><div>Apto</div></div>
        <div class="row"><div>Carlos</div><div>A Agendar</div></div>
      </div>`),
    ).toBe(2);
  });

  it("`.row` com outras classes ao lado, que é como a tela escreve de verdade", () => {
    expect(linhas(`<div class="row hover:bg-soft cursor-pointer"><div>Mariana</div></div>`)).toBe(1);
  });

  it("`role='row'`, para a tabela acessível não escapar da conta", () => {
    expect(
      linhas(`<div role="table">
        <div role="row"><span>Mariana</span><span>Apto</span></div>
      </div>`),
    ).toBe(1);
  });

  /**
   * UMA CÉLULA SÓ **SEM** `colSpan` É LINHA DE DADO. A tabela de uma coluna existe (lista de cidade,
   * de motivo, de escala), e recusá-la seria transformar a régua contra o vazio num bloqueio de
   * catálogo simples. O que marca a linha de MENSAGEM é o `colSpan` esticando por todas as colunas,
   * não o número de células.
   */
  it("linha de uma célula SEM colSpan conta (tabela de uma coluna é tabela)", () => {
    expect(linhas(`<table><tbody><tr><td>Sao Paulo</td></tr></tbody></table>`)).toBe(1);
    expect(linhas(`<table><tbody><tr><td colspan="1">Sao Paulo</td></tr></tbody></table>`)).toBe(1);
  });

  /**
   * `<tr>` ESCRITO SEM `<tbody>` TAMBÉM CONTA, e isso não é generosidade do seletor: o parser do
   * navegador INSERE o `tbody` implícito, então `tbody tr` casa de todo jeito. Conferido aqui porque
   * a régua depende de um comportamento do parser, e não do HTML que alguém escreveu: se um dia a
   * contagem passar a exigir `tbody` no seletor de outra forma (por exemplo `> tbody > tr`), este
   * teste é o que avisa.
   */
  it("`<tr>` sem `<tbody>` explícito conta, pelo tbody implícito do parser", () => {
    expect(linhas(`<table><tr><td>Mariana</td><td>Apto</td></tr></table>`)).toBe(1);
  });

  /**
   * O MESMO ELEMENTO PODE CASAR NOS DOIS SELETORES (`tbody tr` e `class="row"`), e contá-lo duas
   * vezes faria uma fila de uma linha parecer povoada com duas. O dedupe é por ELEMENTO.
   */
  it("elemento que casa nos dois seletores conta UMA vez", () => {
    expect(linhas(`<table><tbody><tr class="row"><td>Mariana</td><td>Apto</td></tr></tbody></table>`)).toBe(
      1,
    );
  });
});

describe("o que NÃO conta, e é aqui que a régua se ganha ou se perde", () => {
  /**
   * ─ A LINHA DE `colSpan`: O ESTADO VAZIO MORA DENTRO DO `tbody` ────────────────────────────────
   *
   * É este o caso que desarmava o achado duro. A tabela está VAZIA, e ainda assim existe um `<tr>`
   * dentro do `tbody`, porque é ali que a casa desenha "Nenhum cliente neste filtro." (30 ocorrências
   * medidas). Contado, o print de fila vazia é aprovado, e o defeito chega ao manual com cara de
   * print correto.
   */
  it("a linha de mensagem com colSpan NÃO é linha de dado (o estado vazio da casa)", () => {
    const html = `<table><thead><tr><th>Candidato</th><th>Cliente</th></tr></thead><tbody>
      <tr><td colspan="10">Nenhum cliente neste filtro.</td></tr>
    </tbody></table>`;
    expect(linhas(html)).toBe(0);
    // E a lista continua sendo CONTADA: existe tabela na tela, ela é que está vazia. É a diferença
    // entre "não há lista aqui" (print de formulário) e "a lista está vazia" (print que não ensina).
    expect(listas(html)).toBe(1);
  });

  it("a linha de `Carregando` também não conta (mesmo formato, outra causa)", () => {
    expect(
      linhas(`<table><tbody><tr><td colspan="8">Carregando…</td></tr></tbody></table>`),
    ).toBe(0);
  });

  /**
   * CABEÇALHO NUNCA É DADO. Sem esta regra, TODA tabela vazia teria "uma linha" e a régua inteira
   * seria decorativa. É o erro mais fácil de cometer, porque `querySelectorAll("tr")` é o que se
   * escreve primeiro.
   */
  it("`thead tr` não conta", () => {
    expect(
      linhas(`<table>
        <thead><tr><th>Candidato</th><th>Cliente</th><th>Status</th></tr></thead>
        <tbody></tbody>
      </table>`),
    ).toBe(0);
  });

  it("`.list-head` não conta como linha, e conta como LISTA", () => {
    const html = `<div class="list">
      <div class="list-head row"><div>Candidato</div><div>Cliente</div></div>
    </div>`;
    expect(linhas(html)).toBe(0);
    expect(listas(html)).toBe(1);
  });

  it("tabela sem nenhuma linha devolve zero, e não explode", () => {
    expect(linhas(`<table><tbody></tbody></table>`)).toBe(0);
    expect(contarLinhasDeDados(dom(``))).toEqual({ listas: 0, linhas: 0 });
  });

  /**
   * O CASO COMPLETO DA FILA VAZIA, como ele chega de verdade: cabeçalho, `.list-head`, a linha de
   * mensagem, e nada de dado. Os três enganos somados dariam três linhas.
   */
  it("a fila vazia REAL, com cabeçalho e mensagem, conta ZERO linha", () => {
    const html = `<div class="list">
      <div class="list-head row"><div>Candidato</div><div>Exame</div></div>
      <table>
        <thead><tr><th>Candidato</th><th>Exame</th></tr></thead>
        <tbody><tr><td colspan="2">Nenhuma admissão com os filtros atuais</td></tr></tbody>
      </table>
    </div>`;
    expect(linhas(html)).toBe(0);
  });
});

describe("`listas`: distinguir `não há lista` de `a lista está vazia`", () => {
  it("conta `table`, `role='table'` e `.list-head`", () => {
    expect(listas(`<table><tbody></tbody></table>`)).toBe(1);
    expect(listas(`<div role="table"></div>`)).toBe(1);
    expect(listas(`<div class="list-head"></div>`)).toBe(1);
  });

  it("tela sem lista nenhuma (um formulário) devolve zero listas", () => {
    expect(
      listas(`<form><label>CPF<input placeholder="000.000.000-00" /></label></form>`),
    ).toBe(0);
  });

  it("duas tabelas na mesma tela contam duas listas", () => {
    expect(listas(`<table><tbody></tbody></table><table><tbody></tbody></table>`)).toBe(2);
  });
});

/**
 * ─ A CONTAGEM É DA **ÁREA**, NÃO DA PÁGINA, E ESSA DIFERENÇA É O PONTO INTEIRO ──────────────────
 *
 * ┌─ POR QUE CONTAR NA PÁGINA SERIA PIOR QUE NÃO CONTAR ────────────────────────────────────────┐
 * │ O print recortado (§3.4 item 4) é o instrumento de privacidade das telas agregadas: recorta-se  │
 * │ o controle que o passo ensina e o resto fica fora da imagem. Se a contagem olhasse a PÁGINA, uma │
 * │ tela com a fila vazia no recorte e uma OUTRA tabela povoada fora dele seria aprovada: a régua    │
 * │ mediria o que ninguém vai ver, e daria licença justamente para a imagem que não ensina.         │
 * │                                                                                                │
 * │ E o inverso é igualmente errado: recorte de FORMULÁRIO numa tela que tem tabela ao lado não pode │
 * │ ser reprovado por causa de uma lista que está fora da imagem.                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("contar na ÁREA RECORTADA, e não na página", () => {
  const pagina = dom(`<div>
    <section id="recorte">
      <table><thead><tr><th>Candidato</th></tr></thead>
        <tbody><tr><td colspan="4">Nenhuma admissão com os filtros atuais</td></tr></tbody>
      </table>
    </section>
    <section id="fora">
      <table><tbody>
        <tr><td>Mariana</td></tr><tr><td>Carlos</td></tr><tr><td>Fernanda</td></tr>
      </tbody></table>
    </section>
  </div>`);

  it("a página inteira parece povoada", () => {
    expect(contarLinhasDeDados(pagina).linhas).toBe(3);
  });

  it("MAS a área recortada está VAZIA, e é ela que vira imagem", () => {
    const area = pagina.querySelector("#recorte") as Element;
    expect(contarLinhasDeDados(area).linhas).toBe(0);
    expect(contarLinhasDeDados(area).listas).toBe(1);
  });

  it("recorte de formulário não herda a tabela que ficou fora da imagem", () => {
    const comFormulario = dom(`<div>
      <section id="recorte"><form><input placeholder="000.000.000-00" /></form></section>
      <table><tbody><tr><td>Mariana</td></tr></tbody></table>
    </div>`);
    const area = comFormulario.querySelector("#recorte") as Element;
    expect(contarLinhasDeDados(area)).toEqual({ listas: 0, linhas: 0 });
  });
});
