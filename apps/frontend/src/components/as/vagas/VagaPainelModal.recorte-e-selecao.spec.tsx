// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { candidaturaViva, type AsCandidaturaItem, type VagaListItem } from "@ea/shared-types";

/**
 * ─ O RECORTE À VISTA E A SELEÇÃO, NO PAINEL DA VAGA (cobertura independente, §A.38) ────────────
 *
 * ESCRITO PELO `tester` ANTES DE A CONSTRUÇÃO TERMINAR (§A.40 regra 2). É para ele estar VERMELHO
 * enquanto o `frontend` constrói, e é isso que preserva a independência: o teste codifica o
 * REQUISITO do diretor, e não a suposição de quem escreveu o código.
 *
 * ┌─ A RÉGUA CENTRAL, decidida pelo coordenador, e é ela que este arquivo existe para travar ────┐
 * │ A SELEÇÃO NUNCA SOBREVIVE INVISÍVEL. Linha que sai do recorte à vista, por busca ou por       │
 * │ filtro, SAI DA SELEÇÃO. "Selecionar todos" marca O RECORTE À VISTA, nunca a lista inteira.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E ELA NÃO É TEORIA: hoje a seleção é resolvida sobre a `lista` INTEIRA e o lote manda todos os
 * ids sem filtrar (`AcoesEmMassaDaVaga`, `selecionadas.map((c) => c.id)`). Sem esta cobertura, o
 * filtro novo transforma isso em "marcar 8, filtrar para 2, agir, e afetar 8", com seis pessoas
 * afetadas que ninguém está vendo.
 *
 * ─ POR QUE ESTE TESTE É DE COMPONENTE, E NÃO DA FUNÇÃO PURA ───────────────────────────────────
 *
 * A função pura que decide o recorte pode estar perfeita e a tela ainda agir sobre o invisível: o
 * que liga uma coisa à outra é a FIAÇÃO (que lista alimenta a tabela, que lista alimenta a barra de
 * ações em massa, o que a troca de aba limpa). Régua certa ligada no lugar errado é exatamente o
 * defeito que esta frente existe para não repetir, e ele só aparece montando a tela.
 *
 * A AFIRMAÇÃO MAIS FORTE DO ARQUIVO É NA FRONTEIRA DA REDE: o teste marca, filtra, dispara o lote e
 * confere os IDS QUE SAEM. É o único ponto em que "a tela conta certo e a régua conta errado" não
 * tem como se esconder, porque o que chega no backend é aquilo, e nada mais.
 *
 * ─ O QUE DESTE ARQUIVO SEGURA POR MÉRITO, E O QUE SEGURA POR ACIDENTE (medido, não suposto) ───
 *
 * A tela protege a régua central por DOIS caminhos independentes, e isso foi MEDIDO substituindo
 * `selecaoNoRecorte` por identidade (a implementação ingênua, o `Set` que nunca reconcilia) e
 * rodando esta suíte inteira contra ela:
 *
 *   1. A DERIVAÇÃO: `selecionadas` sai de `visiveis`, e não da `lista` (`VagaPainelModal`, a linha
 *      `visiveis.filter((c) => idsNoRecorte.includes(c.id))`). Enquanto ela estiver assim, o lote
 *      não tem COMO levar um invisível, e os testes de contador e de fronteira de rede passam ainda
 *      que a poda inteira suma. ELES SÃO A REDE DE BAIXO, e não a prova da poda.
 *   2. A PODA DO ESTADO, em `mudarRecorte`. É ela que impede a marca escondida de VOLTAR.
 *
 * DOS 46 TESTES, SÓ TRÊS FICAM VERMELHOS QUANDO A PODA SOME: "limpar o filtro NÃO ressuscita",
 * "apagar o termo da busca não devolve as marcas" e "o botão devolve a lista inteira sem ressuscitar
 * marca nenhuma". Se um dia alguém achar esses três redundantes e apagá-los, a poda passa a não ter
 * teste nenhum, e o defeito que volta é o contador saltando sozinho com gente que ninguém marcou.
 * ELES SÃO OS ÚNICOS DONOS DAQUELA LINHA.
 *
 * E A RECÍPROCA: a poda mora SÓ no gesto (`mudarRecorte`), não em efeito. Um caminho futuro que
 * estreite o recorte sem passar por lá (uma releitura da lista que não limpe a seleção, por exemplo)
 * não é coberto por teste nenhum daqui, e só não morde hoje porque `aposAcao` limpa a seleção.
 *
 * ─ O PONTO CEGO DECLARADO NA ONDA ANTERIOR ACONTECEU NA ONDA SEGUINTE, e virou correção ────────
 * Estava escrito aqui que `nomesVisiveis()` lia o `aria-label` das caixas e ficaria cego se alguém
 * renomeasse o rótulo. O conserto E renomeou o rótulo da linha ENCERRADA duas ondas depois, o leitor
 * perdeu duas das nove linhas, e SETE testes ficaram vermelhos acusando produto inocente (um deles
 * dizia "Fora Do Funil não acha ninguém"). O leitor passou a sair da TABELA (`tbody tr` mais a
 * célula de nome), que não depende de texto de rótulo nenhum. Ponto cego declarado é ponto cego que
 * se conserta em minutos; o mesmo defeito sem a declaração teria sido depurado no produto.
 *
 * §A.11 (sem travessão), §A.29 (filtro e ordenação convivem), §A.28 (filtro é múltiplo).
 * Nenhuma lista nova de situação ou de etapa se escreve aqui: o vocabulário é
 * `CANDIDATURA_SITUACOES`/`CANDIDATURA_SITUACAO_LABEL` e o catálogo de etapas é o de `useEtapas`.
 */

const { painelDaVaga } = vi.hoisted(() => ({ painelDaVaga: vi.fn() }));

const { finalizarPosicaoEmLote, registrarSaidaEmLote, moverEtapaEmLote } = vi.hoisted(() => ({
  finalizarPosicaoEmLote: vi.fn(async () => ({ aplicadas: 1, falhas: [] })),
  registrarSaidaEmLote: vi.fn(async () => ({ aplicadas: 1, falhas: [] })),
  moverEtapaEmLote: vi.fn(async () => ({ aplicadas: 1, falhas: [] })),
}));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return { ...real, painelDaVaga };
});

vi.mock("@/lib/as-candidatos-lote", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/as-candidatos-lote")>("@/lib/as-candidatos-lote");
  return { ...real, finalizarPosicaoEmLote, registrarSaidaEmLote, moverEtapaEmLote };
});

/**
 * O CATÁLOGO DE ETAPAS VEM DA REDE (`GET /as/etapas`), então ele é dublado com a SEMENTE do
 * vocabulário compartilhado. Dublar o gancho, e não o módulo inteiro: `rotuloDaEtapa` e
 * `ordemDaEtapa` são funções puras, e trocá-las por dublê faria o teste afirmar o dublê.
 */
vi.mock("@/lib/as-etapas", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-etapas")>("@/lib/as-etapas");
  const { ETAPAS_FUNIL_SEMENTE } = await vi.importActual<typeof import("@ea/shared-types")>(
    "@ea/shared-types",
  );
  const catalogo = ETAPAS_FUNIL_SEMENTE.map((e, i) => ({
    id: i + 1,
    codigo: e.codigo,
    rotulo: e.rotulo,
    ordem: e.ordem,
    tom: e.tom,
    inicial: e.ordem === 1,
    ativa: true,
  }));
  return {
    ...real,
    useEtapas: () => ({
      etapas: catalogo,
      ativas: catalogo,
      carregando: false,
      erro: null,
      recarregar: async () => {},
    }),
  };
});

/**
 * O CATÁLOGO DE STATUS DA VAGA também é de rede, e aqui ele só decide RÓTULO e se a vaga recebe
 * candidato novo. Com a lista vazia, `vagaRecebeCandidato` (que fica real) cai no catálogo corrente,
 * que é a semente, e "ABERTA" segue recebendo. Nada deste arquivo depende disso.
 */
vi.mock("@/lib/as-status-vaga", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/as-status-vaga")>("@/lib/as-status-vaga");
  return {
    ...real,
    useStatusVaga: () => ({
      status: [],
      ativos: [],
      carregando: false,
      erro: null,
      recarregar: async () => {},
    }),
  };
});

import { VagaPainelModal } from "./VagaPainelModal";

/**
 * A VAGA, NO RECORTE QUE ESTE ARQUIVO LÊ. O tipo tem 38 campos e nenhum dos outros é tocado aqui;
 * montá-los todos só faria o teste esconder o que ele afirma (a mesma escolha do
 * `AcoesEmMassaDaVaga.spec`).
 */
const VAGA = {
  id: "vaga-1",
  status: "ABERTA",
  codigo: "PS-2026-001",
  nomeDivulgacao: "Operador De Caixa",
  dataAbertura: "2026-08-20T12:00:00.000Z",
  abertoPorNome: "Ana",
  fechamentoForcado: null,
  /* A LISTA VAZIA É OBRIGATÓRIA, e não enfeite: o painel lê `metaReducoes.length` sem guarda, então
     um fixture sem o campo derruba o componente antes de qualquer asserção deste arquivo. */
  metaReducoes: [],
  posicoesOficiais: 5,
  posicoesBanco: 2,
  vagasFechadas: null,
  vagasFechadasBanco: null,
  ocupacao: { finalizadasOficial: 1, finalizadasBanco: 0, ocupadas: 1, livres: 4 },
} as unknown as VagaListItem;

function candidatura(over: Partial<AsCandidaturaItem>): AsCandidaturaItem {
  return {
    id: "c0",
    candidatoId: "p0",
    candidatoNome: "Sem Nome",
    vagaId: "vaga-1",
    vagaCodigo: "PS-2026-001",
    vagaNome: "Operador De Caixa",
    etapa: "TRIAGEM",
    situacao: "ATIVO",
    posicaoLado: null,
    motivoDescarte: null,
    alocadoEm: "2026-09-01T12:00:00.000Z",
    alocadoPorNome: "Ana",
    atualizadoEm: "2026-09-02T12:00:00.000Z",
    ultimoContatoEm: null,
    ...over,
  } as AsCandidaturaItem;
}

/**
 * ─ A LISTA, MONTADA PARA QUE CADA COMBINAÇÃO TENHA UMA RESPOSTA DIFERENTE ──────────────────────
 *
 * A ORDEM AQUI NÃO É ALFABÉTICA DE PROPÓSITO: é ela que permite provar que a ordenação por
 * "Candidato" fez alguma coisa. Uma lista já ordenada faria o teste da §A.29 passar sem que nenhuma
 * ordenação acontecesse, que é o tipo de teste que segura por acidente.
 *
 * OS ACENTOS SÃO PARTE DO DADO, e não enfeite: "Cláudia", "Décio", "Éder", "Nóbrega", "Assunção" e
 * "Sá" são o que a busca por nome tem de encontrar sem acento e sem caixa.
 *
 * TRÊS PESSOAS ENTREGARAM POSIÇÃO (`ALOCADO`/`ENVIADO_PARA_ADMISSAO`), e é esse o recorte da aba de
 * alocados. TRÊS estão `ATIVO` (Em Seleção), e delas só UMA está em Triagem: é esse par que separa
 * interseção de união nos dois filtros juntos.
 */
const LISTA: AsCandidaturaItem[] = [
  candidatura({ id: "c7", candidatoId: "p7", candidatoNome: "Gustavo Nóbrega", etapa: "TRIAGEM", situacao: "DESCARTADO" }),
  candidatura({ id: "c3", candidatoId: "p3", candidatoNome: "Cláudia Nogueira", etapa: "CAPTACAO", situacao: "ATIVO" }),
  candidatura({ id: "c9", candidatoId: "p9", candidatoNome: "Ícaro Machado", etapa: "ENTREVISTA_CLIENTE", situacao: "DESISTIU" }),
  candidatura({ id: "c1", candidatoId: "p1", candidatoNome: "Ana Paula Ribeiro", etapa: "TRIAGEM", situacao: "ATIVO" }),
  candidatura({ id: "c6", candidatoId: "p6", candidatoNome: "Fabiana Assunção", etapa: "APROVACAO", situacao: "ENVIADO_PARA_ADMISSAO", posicaoLado: "BANCO" }),
  candidatura({ id: "c4", candidatoId: "p4", candidatoNome: "Décio Araújo", etapa: "APROVACAO", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
  candidatura({ id: "c2", candidatoId: "p2", candidatoNome: "Bruno Carvalho", etapa: "TRIAGEM", situacao: "APROVADO" }),
  candidatura({ id: "c8", candidatoId: "p8", candidatoNome: "Helena Sá", etapa: "CAPTACAO", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
  candidatura({ id: "c5", candidatoId: "p5", candidatoNome: "Éder Gonçalves", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" }),
];

/** Quem entregou posição: o recorte que a aba de alocados mostra, e nada além dele. */
const ALOCADOS = ["Fabiana Assunção", "Décio Araújo", "Helena Sá"];

// ── MONTAGEM ────────────────────────────────────────────────────────────────

async function montar(abaInicial: "candidatos" | "alocados" = "candidatos") {
  painelDaVaga.mockResolvedValue({ candidaturas: LISTA });
  const onMudou = vi.fn();
  render(
    <VagaPainelModal
      vaga={VAGA}
      token="t"
      onClose={() => {}}
      onMudou={onMudou}
      abaInicial={abaInicial}
    >
      <p>A ficha da vaga</p>
    </VagaPainelModal>,
  );
  // A lista chega por rede (dublada): espera a tabela existir antes de qualquer gesto.
  await waitFor(() => expect(linhasVisiveis().length).toBeGreaterThan(0));
  return { onMudou };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── OS OLHOS DO TESTE: o que a tela está MOSTRANDO, e o que ela diz estar MARCADO ───────────────

/**
 * ─ AS LINHAS À VISTA, LIDAS DA TABELA E NÃO DO RÓTULO DA CAIXA (correção medida, onda B) ──────
 *
 * A PRIMEIRA VERSÃO LIA `aria-label^="Selecionar "`, e ELA QUEBROU EXATAMENTE COMO ESTE ARQUIVO
 * PREVIU. O conserto E fez a linha ENCERRADA trocar de rótulo (passou a ser "Fulano já saiu do
 * processo e não entra na seleção"), e o leitor antigo deixou de enxergar duas das nove linhas. O
 * sintoma foi um vermelho que parecia defeito de produto ("Fora Do Funil não acha ninguém") e era
 * cegueira do teste, que é o pior tipo de falso: ele acusa o inocente e, no cenário espelhado,
 * ficaria VERDE contando linha de menos.
 *
 * AGORA A FONTE É A TABELA: uma linha é um `<tr>` do `<tbody>`, o nome é a célula de nome e a caixa
 * é a caixa daquela linha. O rótulo pode mudar de texto quantas vezes quiser.
 */
function linhasVisiveis(): { nome: string; marcada: boolean; habilitada: boolean }[] {
  return Array.from(document.querySelectorAll("tbody tr")).map((tr) => {
    const caixa = tr.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const celulas = Array.from(tr.querySelectorAll("td"));
    /* A célula do NOME é a que vem logo depois da caixa: a de posição é opcional (só a aba de
       alocados a pede), então contar a partir do fim seria contar coisa diferente em cada aba. */
    const nome = (celulas[1]?.textContent ?? "").trim();
    return {
      nome,
      marcada: caixa?.checked === true,
      habilitada: caixa !== null && !caixa.disabled,
    };
  });
}

/** A caixa de marcação de uma linha, achada pelo NOME na célula, nunca pelo rótulo acessível. */
function caixaDaLinha(nome: string): HTMLInputElement {
  const tr = Array.from(document.querySelectorAll("tbody tr")).find(
    (linha) => (Array.from(linha.querySelectorAll("td"))[1]?.textContent ?? "").trim() === nome,
  );
  const caixa = tr?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!caixa) throw new Error(`Não há linha à vista para "${nome}".`);
  return caixa;
}

function nomesVisiveis(): string[] {
  return linhasVisiveis().map((l) => l.nome);
}

/**
 * O TEXTO DA LINHA INTEIRA de uma pessoa, para afirmar COERÊNCIA entre o filtro e a COLUNA.
 *
 * É a diferença entre "o filtro devolveu quem eu esperava" (que afirma o meu palpite) e "toda linha
 * devolvida MOSTRA o critério pedido" (que afirma a tela não estar mentindo). A segunda é a régua,
 * e sobrevive a qualquer decisão de produto sobre QUEM casa com o quê.
 */
function textoDaLinha(nome: string): string {
  return caixaDaLinha(nome).closest("tr")?.textContent ?? "";
}

function marcar(nome: string) {
  fireEvent.click(caixaDaLinha(nome));
}

/** O número que a BARRA DA SELEÇÃO mostra. Zero quando a barra nem existe (nada marcado). */
function contadorDaBarra(): number {
  const rotulo = screen.queryByText(/selecionadas:/i);
  if (!rotulo) return 0;
  const texto = rotulo.parentElement?.textContent ?? rotulo.textContent ?? "";
  const n = texto.match(/(\d+)/);
  return n ? Number(n[1]) : 0;
}

/**
 * O CABEÇALHO ORDENÁVEL DA COLUNA CANDIDATO, pelo nome EXATO.
 *
 * `/candidato/i` casava com QUATRO botões desta tela ("Cadastrar candidato", "Adicionar vários ao
 * funil" não, mas o filtro "Filtrar por situação da candidatura" sim, e o próprio cabeçalho). Foi
 * um ponto cego MEU, não da construção: o teste morria por ambiguidade de seletor e teria sido lido
 * como defeito de produção.
 */
function cabecalhoDeCandidato(): HTMLElement {
  return screen.getByRole("button", { name: "Candidato" });
}

function caixaDeTodos(): HTMLInputElement {
  return screen.getByLabelText(/^Selecionar todos/i) as HTMLInputElement;
}

// ── OS CONTROLES NOVOS: o CONTRATO que este arquivo exige da construção ─────────────────────────

/**
 * ─ POR QUE OS RESOLVEDORES SÃO FROUXOS NO TEXTO E DUROS NA SEMÂNTICA ──────────────────────────
 *
 * Este arquivo é escrito ANTES da construção, então ele não pode exigir a frase exata que o
 * `frontend` vai escolher: um teste que falha porque o rótulo é "Buscar candidato" em vez de
 * "Buscar por nome" está afirmando o gosto de quem escreveu o teste, não o requisito do diretor.
 *
 * O QUE ELE EXIGE, e isso não é frouxo: que exista UM campo de texto sobre NOME, e DOIS seletores
 * MÚLTIPLOS do design system (`aria-haspopup="listbox"`, que é o que o `MultiSelect` desenha), um
 * sobre SITUAÇÃO e outro sobre ETAPA. `<select>` cru não passa aqui, e é a §A.35 medida em vez de
 * confiada.
 *
 * A MENSAGEM DE FALTA É EXPLÍCITA: sem ela, o vermelho da construção inacabada sairia como
 * "Unable to find an element", que não diz a ninguém o que está faltando.
 */
function campoDeBusca(): HTMLInputElement {
  const achado = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((el) => {
    if (el.type === "checkbox" || el.type === "radio") return false;
    const nome = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`;
    return /nome/i.test(nome);
  });
  if (!achado) {
    throw new Error(
      "CONTRATO NÃO ATENDIDO: não existe campo de busca por NOME nesta aba do painel da vaga. " +
        'Esperado um <input> cujo aria-label ou placeholder fale de "nome".',
    );
  }
  return achado;
}

function buscar(termo: string) {
  fireEvent.change(campoDeBusca(), { target: { value: termo } });
}

function gatilhoDoFiltro(assunto: RegExp, comoChamar: string): HTMLElement {
  const gatilhos = Array.from(
    document.querySelectorAll<HTMLElement>('button[aria-haspopup="listbox"]'),
  );
  const achado = gatilhos.find((el) => assunto.test(el.getAttribute("aria-label") ?? ""));
  if (!achado) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: não existe filtro múltiplo de ${comoChamar} nesta aba do painel da vaga. ` +
        `Esperado o MultiSelect do design system (aria-haspopup="listbox") com aria-label falando de ${comoChamar}. ` +
        `Encontrados ${gatilhos.length} seletores múltiplos: ` +
        JSON.stringify(gatilhos.map((el) => el.getAttribute("aria-label"))),
    );
  }
  return achado;
}

/**
 * MARCA UMA OPÇÃO NO FILTRO MÚLTIPLO e fecha o popover em seguida.
 *
 * FECHAR FAZ PARTE DO GESTO: o menu do `MultiSelect` vive em um PORTAL no `body`, e deixá-lo aberto
 * despejaria as opções dele na mesma árvore que o teste consulta logo depois. O `role="option"` não
 * colide com a tabela, mas o texto do rótulo colide com a pill da linha, e um teste que lê a tela
 * inteira tem de ler a tela como ela fica DEPOIS do gesto, não no meio dele.
 */
function filtrarPor(assunto: RegExp, comoChamar: string, rotulo: string) {
  const gatilho = gatilhoDoFiltro(assunto, comoChamar);
  fireEvent.click(gatilho);
  const lista = screen.getByRole("listbox");
  const opcao = within(lista)
    .getAllByRole("option")
    .find((el) => (el.textContent ?? "").trim() === rotulo);
  if (!opcao) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: o filtro de ${comoChamar} não oferece a opção "${rotulo}". ` +
        `Ofereceu: ${JSON.stringify(within(lista).getAllByRole("option").map((el) => el.textContent?.trim()))}`,
    );
  }
  fireEvent.click(opcao);
  fireEvent.click(gatilho); // fecha
}

const porSituacao = (rotulo: string) => filtrarPor(/situa/i, "SITUAÇÃO", rotulo);
const porEtapa = (rotulo: string) => filtrarPor(/etapa/i, "ETAPA", rotulo);

/**
 * Desmarca um valor do filtro, clicando de novo na mesma opção (o `MultiSelect` alterna).
 * Tem nome próprio porque a INTENÇÃO do gesto é o oposto da de `porEtapa`, e no teste a intenção é
 * o que se lê.
 */
const limparEtapa = (rotulo: string) => porEtapa(rotulo);

function trocarPara(aba: "A Vaga" | "Ver Candidatos" | "Ver Candidatos Alocados") {
  const botao = screen
    .getAllByRole("button")
    .find((el) => (el.textContent ?? "").trim().startsWith(aba));
  if (!botao) throw new Error(`Aba "${aba}" não encontrada.`);
  fireEvent.click(botao);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A RÉGUA CENTRAL: A SELEÇÃO NUNCA SOBREVIVE INVISÍVEL
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a seleção não sobrevive invisível", () => {
  /**
   * O CASO DO DIRETOR, EM UMA LINHA: marca três, filtra para uma, e a barra tem de dizer UMA.
   *
   * NA IMPLEMENTAÇÃO INGÊNUA (um `Set` de ids que ninguém reconcilia com o recorte) a barra diria
   * TRÊS, porque `selecionadas` sai da lista inteira. É este número que o consultor lê antes de
   * clicar, e é ele que tem de ser o mesmo que o banco vai receber.
   */
  it("filtrar DEPOIS de marcar tira da conta quem saiu da vista", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    marcar("Cláudia Nogueira");
    marcar("Éder Gonçalves");
    expect(contadorDaBarra()).toBe(3);

    porEtapa("Triagem");

    // Gustavo Nóbrega também é de Triagem, mas está DESCARTADO: a etapa dele é memória, e a coluna
    // não a mostra. Ver "quem saiu do funil" mais abaixo, onde essa régua é afirmada de frente.
    expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro", "Bruno Carvalho"]);
    expect(contadorDaBarra()).toBe(1);
  });

  /**
   * A AFIRMAÇÃO MAIS FORTE DO ARQUIVO: O QUE SAI PELA REDE.
   *
   * A barra pode contar certo e o lote ainda mandar a lista inteira: são dois caminhos diferentes
   * (`selecionadas.length` na tela, `selecionadas.map(c => c.id)` na chamada), e foi exatamente essa
   * divergência que a auditoria já achou nesta mesma barra. Só a fronteira prova as duas de uma vez.
   */
  it("o LOTE afeta só o que está à vista, e é isso que sai pela rede", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    marcar("Cláudia Nogueira");
    marcar("Éder Gonçalves");

    porEtapa("Triagem");

    fireEvent.click(screen.getByRole("button", { name: /finalizar posição \(1\)/i }));
    const confirmar = screen
      .getAllByRole("button", { name: "Finalizar posição" })
      .at(-1) as HTMLElement;
    fireEvent.click(confirmar);

    await waitFor(() => expect(finalizarPosicaoEmLote).toHaveBeenCalledTimes(1));
    const [ids] = finalizarPosicaoEmLote.mock.calls[0] as unknown as [string[]];
    // Ana Paula Ribeiro (c1) é a única em Triagem entre as três marcadas. As outras duas não podem
    // ir junto: ninguém está vendo nenhuma delas na hora do clique.
    expect(ids).toEqual(["c1"]);
  });

  /**
   * A OUTRA METADE DA RÉGUA, e é a que separa "escondi a marca" de "desmarquei".
   *
   * Uma implementação que apenas ESCONDE (guarda os oito ids e mostra dois) passa no teste de cima
   * se a barra contar o recorte, e entrega a marca de volta assim que o filtro sai. O consultor
   * limpa o filtro, vê oito marcados que ele não marcou, e o lote seguinte leva os oito.
   */
  it("limpar o filtro NÃO ressuscita quem saiu da seleção", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    marcar("Cláudia Nogueira");
    marcar("Éder Gonçalves");

    porEtapa("Triagem");
    expect(contadorDaBarra()).toBe(1);

    limparEtapa("Triagem");

    expect(nomesVisiveis()).toHaveLength(LISTA.length);
    expect(contadorDaBarra()).toBe(1);
    const marcadas = linhasVisiveis().filter((l) => l.marcada).map((l) => l.nome);
    expect(marcadas).toEqual(["Ana Paula Ribeiro"]);
  });

  /**
   * O SENTIDO CONTRÁRIO, e ele é o contrapeso: a régua PODA o que saiu da vista, e não pode podar
   * o que está à vista. Marcar sob filtro e limpar o filtro mantém as marcas, porque nenhuma delas
   * ficou invisível em momento nenhum.
   */
  it("marcar SOB filtro e depois limpar o filtro preserva as marcas", async () => {
    await montar();
    porEtapa("Captação");
    expect(nomesVisiveis()).toEqual(["Cláudia Nogueira", "Helena Sá"]);

    marcar("Cláudia Nogueira");
    marcar("Helena Sá");
    expect(contadorDaBarra()).toBe(2);

    limparEtapa("Captação");

    expect(contadorDaBarra()).toBe(2);
    const marcadas = linhasVisiveis().filter((l) => l.marcada).map((l) => l.nome);
    expect(marcadas.sort()).toEqual(["Cláudia Nogueira", "Helena Sá"]);
  });

  /** A BUSCA É O MESMO RECORTE QUE O FILTRO, e a régua não pode valer só para um dos dois. */
  it("a BUSCA também tira da seleção quem ela esconde", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    marcar("Cláudia Nogueira");
    marcar("Bruno Carvalho");
    expect(contadorDaBarra()).toBe(3);

    buscar("ana paula");

    expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro"]);
    expect(contadorDaBarra()).toBe(1);
  });

  /**
   * APAGAR A BUSCA É LIMPAR RECORTE, exatamente como tirar o filtro: quem saiu não volta marcado.
   * Este caso existe porque campo de texto costuma ser tratado como "estado de tela" e não como
   * recorte, e a poda esquece dele.
   */
  it("apagar o termo da busca não devolve as marcas que ela derrubou", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    marcar("Cláudia Nogueira");
    buscar("ana paula");
    expect(contadorDaBarra()).toBe(1);

    buscar("");

    expect(nomesVisiveis()).toHaveLength(LISTA.length);
    expect(contadorDaBarra()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. "SELECIONAR TODOS" MARCA O RECORTE À VISTA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('"selecionar todos" opera sobre o recorte', () => {
  /**
   * COM FILTRO ATIVO, "todos" É O RECORTE. Marcar a lista inteira a partir de um recorte de dois é
   * a forma mais barata de afetar sete pessoas invisíveis com um clique só, e é o gesto que a
   * pessoa faz com mais confiança, justamente porque a tela está mostrando pouca coisa.
   */
  it("marca só quem está à vista, nunca a lista inteira", async () => {
    await montar();
    porSituacao("Em Seleção");
    expect(nomesVisiveis()).toEqual([
      "Cláudia Nogueira",
      "Ana Paula Ribeiro",
      "Éder Gonçalves",
    ]);

    fireEvent.click(caixaDeTodos());

    expect(contadorDaBarra()).toBe(3);
    expect(linhasVisiveis().every((l) => l.marcada)).toBe(true);
  });

  /**
   * ─ ESTE TESTE MUDOU DE RÉGUA NA ONDA B, e a mudança é do diretor, não minha ──────────────────
   *
   * Antes ele afirmava "todos os VISÍVEIS", e o conserto E estreitou para "todos os visíveis QUE
   * ACEITAM DECISÃO": a caixa da linha encerrada nasce desabilitada. Ele passou a comparar contra
   * `SELECIONAVEIS`, derivado da mesma régua de domínio, para não voltar a codificar o número.
   */
  it("o recorte inteiro marcado deixa a caixa do cabeçalho marcada, e o clique seguinte desmarca", async () => {
    await montar();
    buscar("a");
    const selecionaveis = linhasVisiveis().filter((l) => l.habilitada).length;
    expect(selecionaveis).toBeGreaterThan(1);
    expect(nomesVisiveis().length).toBeGreaterThan(selecionaveis);

    fireEvent.click(caixaDeTodos());
    expect(caixaDeTodos().checked).toBe(true);
    expect(contadorDaBarra()).toBe(selecionaveis);

    fireEvent.click(caixaDeTodos());
    expect(contadorDaBarra()).toBe(0);
  });

  /**
   * O TESTE QUE LIGA OS DOIS GESTOS, e é o pior caso real: "selecionar todos" sob um recorte, o
   * recorte muda, e o lote sai. O que sai tem de ser o recorte NOVO.
   */
  it('"todos" sob um recorte e o recorte muda: o lote leva o recorte novo', async () => {
    await montar();
    porSituacao("Em Seleção");
    fireEvent.click(caixaDeTodos());
    expect(contadorDaBarra()).toBe(3);

    porEtapa("Triagem"); // Em Seleção + Triagem = só Ana Paula Ribeiro

    expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro"]);
    expect(contadorDaBarra()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /finalizar posição \(1\)/i }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Finalizar posição" }).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(finalizarPosicaoEmLote).toHaveBeenCalledTimes(1));
    const [ids] = finalizarPosicaoEmLote.mock.calls[0] as unknown as [string[]];
    expect(ids).toEqual(["c1"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. A BUSCA POR NOME
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a busca por nome", () => {
  /**
   * ACENTO E CAIXA NÃO SEPARAM NOME, e o padrão já existe na casa: o `MultiSelect` normaliza com
   * `NFD` e derruba os diacríticos antes de comparar. Quem digita "claudia" está procurando a
   * Cláudia, e um `includes` cru devolveria nada, que é como uma busca vira inútil em silêncio.
   */
  it("ignora acento", async () => {
    await montar();
    buscar("claudia");
    expect(nomesVisiveis()).toEqual(["Cláudia Nogueira"]);
  });

  it("ignora caixa, nos dois sentidos", async () => {
    await montar();
    buscar("ÉDER");
    expect(nomesVisiveis()).toEqual(["Éder Gonçalves"]);
    buscar("helena");
    expect(nomesVisiveis()).toEqual(["Helena Sá"]);
  });

  it("acha pelo sobrenome, e não só pelo começo do nome", async () => {
    await montar();
    buscar("ribeiro");
    expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro"]);
  });

  /**
   * TRECHO NO MEIO DA PALAVRA, que é a semântica de `includes` do `MultiSelect`.
   *
   * ESTE É O ÚNICO TESTE DESTE ARQUIVO QUE AFIRMA UMA ESCOLHA DE IMPLEMENTAÇÃO, e está separado de
   * propósito: se a construção escolher casar por INÍCIO DE PALAVRA em vez de por trecho, só ele
   * fica vermelho, e a conversa é sobre a semântica da busca, não sobre a régua da seleção.
   */
  it("acha por trecho no meio da palavra (a mesma régua do MultiSelect)", async () => {
    await montar();
    buscar("arvalh");
    expect(nomesVisiveis()).toEqual(["Bruno Carvalho"]);
  });

  it("espaço em volta do termo não muda o resultado", async () => {
    await montar();
    buscar("   helena   ");
    expect(nomesVisiveis()).toEqual(["Helena Sá"]);
  });

  /**
   * ─ LISTA VAZIA POR RECORTE É ESTADO DIFERENTE DE VAGA SEM CANDIDATO ──────────────────────────
   *
   * As duas telas são idênticas (nenhuma linha) e as duas conclusões são opostas: uma manda mexer no
   * filtro, a outra manda trazer gente para a vaga. A frase que já existe ("Ninguém foi vinculado a
   * esta vaga ainda.") é uma AFIRMAÇÃO SOBRE A VAGA, e dizê-la com nove pessoas cadastradas é a tela
   * mentindo para quem está lendo.
   */
  it("nenhum resultado diz que foi o RECORTE, e não que a vaga está vazia", async () => {
    await montar();
    buscar("zzz não existe ninguém assim");

    expect(nomesVisiveis()).toHaveLength(0);
    expect(screen.queryByText("Ninguém foi vinculado a esta vaga ainda.")).toBeNull();
    // `getAllBy`, e não `getBy`: a barra do recorte também fala de busca e de filtro, e um `getBy`
    // aqui falharia por AMBIGUIDADE, não por ausência. Ponto cego meu na primeira rodada.
    expect(screen.getAllByText(/recorte|filtro|busca/i).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. OS DOIS FILTROS JUNTOS SÃO CONJUNÇÃO, NÃO UNIÃO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("busca e os dois filtros combinam por E, nunca por OU", () => {
  /**
   * A DIFERENÇA É GRANDE O SUFICIENTE PARA NÃO PASSAR POR ACIDENTE: a interseção é UMA pessoa, a
   * união seriam CINCO. Filtro que faz união devolve MAIS linhas quando se acrescenta um critério,
   * que é o oposto do que a pessoa está pedindo ao acrescentá-lo.
   */
  it("situação E etapa mostram a interseção", async () => {
    await montar();
    porSituacao("Em Seleção");
    expect(nomesVisiveis()).toHaveLength(3);

    porEtapa("Triagem");

    expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro"]);
  });

  /** DENTRO DE UM MESMO FILTRO É "OU" (§A.28): duas situações somam, porque uma linha só tem uma. */
  it("dois valores do MESMO filtro somam", async () => {
    await montar();
    porSituacao("Em Seleção");
    porSituacao("Descartado");

    expect(nomesVisiveis()).toEqual([
      "Gustavo Nóbrega",
      "Cláudia Nogueira",
      "Ana Paula Ribeiro",
      "Éder Gonçalves",
    ]);
  });

  it("a busca entra na mesma conjunção dos dois filtros", async () => {
    await montar();
    porSituacao("Em Seleção");
    porEtapa("Triagem");
    expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro"]);

    buscar("claudia"); // Cláudia é Em Seleção, mas é de Captação: a conjunção a exclui

    expect(nomesVisiveis()).toHaveLength(0);
  });

  /** Tirar um critério devolve o que ele tirava, e não mais do que isso. */
  it("desmarcar um valor do filtro devolve exatamente o que ele escondia", async () => {
    await montar();
    porSituacao("Em Seleção");
    porEtapa("Triagem");
    expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro"]);

    limparEtapa("Triagem");

    expect(nomesVisiveis()).toEqual([
      "Cláudia Nogueira",
      "Ana Paula Ribeiro",
      "Éder Gonçalves",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. CADA ABA TEM O SEU RECORTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("cada aba tem o seu recorte", () => {
  /** REGRESSÃO: a troca de aba JÁ limpa a seleção hoje, e o filtro novo não pode desligar isso. */
  it("trocar de aba limpa a seleção (comportamento que já existe)", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    marcar("Cláudia Nogueira");
    expect(contadorDaBarra()).toBe(2);

    trocarPara("Ver Candidatos Alocados");

    expect(contadorDaBarra()).toBe(0);
  });

  /**
   * O FILTRO NÃO VAZA DE UMA ABA PARA A OUTRA. Um filtro herdado esconderia linhas na aba nova sem
   * que ninguém tivesse pedido nada ali, e o pior é que a tela não teria como explicar por quê: a
   * pessoa acabou de chegar.
   */
  it("filtro de uma aba não recorta a outra", async () => {
    await montar();
    porEtapa("Triagem");
    expect(nomesVisiveis()).toEqual(["Ana Paula Ribeiro", "Bruno Carvalho"]);

    trocarPara("Ver Candidatos Alocados");

    // Nenhum dos três de Triagem entregou posição, e nenhum dos alocados é de Triagem: um filtro
    // herdado deixaria esta aba VAZIA, que é o sintoma exato do vazamento.
    expect(nomesVisiveis().sort()).toEqual([...ALOCADOS].sort());
  });

  it("busca de uma aba não recorta a outra", async () => {
    await montar();
    buscar("claudia");
    expect(nomesVisiveis()).toEqual(["Cláudia Nogueira"]);

    trocarPara("Ver Candidatos Alocados");

    expect(nomesVisiveis().sort()).toEqual([...ALOCADOS].sort());
  });

  /**
   * VOLTAR PARA A ABA NÃO TRAZ O FILTRO DE VOLTA, e isto está aqui como DECISÃO pinada, não como
   * acaso: a troca de aba ZERA o recorte (em vez de guardar um por aba). As duas leituras atendem
   * "não vaza", e a escolhida é a que não deixa filtro esquecido esperando quem voltar.
   *
   * SE O DIRETOR PREFERIR UM RECORTE POR ABA, é este teste que muda, e só ele.
   */
  it("voltar para a aba devolve a lista inteira, sem filtro esquecido", async () => {
    await montar();
    porEtapa("Triagem");
    expect(nomesVisiveis()).toHaveLength(2);

    trocarPara("Ver Candidatos Alocados");
    trocarPara("Ver Candidatos");

    expect(nomesVisiveis()).toHaveLength(LISTA.length);
  });

  /**
   * O CONTADOR DA ABA É O TOTAL, e o filtro não pode reescrevê-lo: ele responde "quantas
   * candidaturas esta vaga tem", que é outra pergunta. A tela pode dizer quantas está mostrando (e
   * deve), mas sem fingir que o total mudou.
   */
  it("o contador da aba continua dizendo o total mesmo com filtro ativo", async () => {
    await montar();
    porEtapa("Triagem");

    const botao = screen
      .getAllByRole("button")
      .find((el) => (el.textContent ?? "").trim().startsWith("Ver Candidatos")) as HTMLElement;
    expect(botao.textContent).toContain(String(LISTA.length));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5b. O BOTÃO DE LIMPAR E A FRASE DO RECORTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("limpar o recorte", () => {
  /**
   * O BOTÃO É UM TERCEIRO CAMINHO, e é o que mais some de teste: a busca e os dois filtros passam
   * pelos seus próprios controles, e o "Limpar o recorte" escreve o recorte inteiro de uma vez. Se
   * ele não passar pela mesma poda, ele vira a porta por onde a marca escondida volta, com todos os
   * outros caminhos cobertos e este não.
   */
  it("o botão devolve a lista inteira sem ressuscitar marca nenhuma", async () => {
    await montar();
    marcar("Ana Paula Ribeiro");
    marcar("Cláudia Nogueira");
    marcar("Éder Gonçalves");

    porEtapa("Triagem");
    expect(contadorDaBarra()).toBe(1);

    fireEvent.click(screen.getAllByRole("button", { name: /limpar o recorte/i })[0]);

    expect(nomesVisiveis()).toHaveLength(LISTA.length);
    expect(contadorDaBarra()).toBe(1);
  });

  /**
   * "MOSTRANDO N DE M" É A RESPOSTA DA OUTRA PERGUNTA, e ela só existe com recorte ligado: sem
   * filtro, "mostrando 9 de 9" seria ruído em toda vaga, todo dia. É esta frase que deixa o contador
   * da aba em paz para continuar dizendo o total.
   */
  it("com recorte ligado a tela diz quantos está mostrando, e sem recorte não diz nada", async () => {
    await montar();
    expect(screen.queryByText(/mostrando/i)).toBeNull();

    porEtapa("Triagem");

    const frase = screen.getByText(/mostrando/i).parentElement?.textContent ?? "";
    expect(frase).toMatch(/2/);
    expect(frase).toMatch(new RegExp(String(LISTA.length)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6. A ABA DE ALOCADOS JÁ É UM RECORTE, E O FILTRO OPERA DENTRO DELE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a aba de alocados é um recorte duro", () => {
  it("mostra só quem entregou posição, sem filtro nenhum", async () => {
    await montar("alocados");
    expect(nomesVisiveis().sort()).toEqual([...ALOCADOS].sort());
    expect(nomesVisiveis()).not.toContain("Ana Paula Ribeiro");
  });

  /**
   * ESTE É O TESTE QUE IMPEDE O FILTRO DE VIRAR UM "OU" POR CIMA DA ABA.
   *
   * Uma implementação que aplicasse o filtro sobre a LISTA INTEIRA (e não sobre a base da aba)
   * traria três pessoas EM SELEÇÃO para a aba de ALOCADOS. Elas apareceriam ali com a pill certa e
   * tudo, e a aba passaria a dizer que gente em seleção entregou posição, que é um fato falso escrito
   * na tela que o time usa para conferir a entrega da vaga.
   */
  it("filtrar por uma etapa que só existe fora da aba não traz ninguém de volta", async () => {
    await montar("alocados");
    // TRIAGEM não é etapa de ninguém que entregou posição, e é etapa de TRÊS que não entregaram.
    // O eixo ETAPA é o certo para esta prova: ele NÃO é pré-recortado pela aba (o de situação é),
    // então um filtro aplicado sobre a lista inteira apareceria aqui na hora.
    porEtapa("Triagem");

    expect(nomesVisiveis()).toHaveLength(0);
    expect(screen.queryByText("Ana Paula Ribeiro")).toBeNull();
    expect(screen.queryByText("Bruno Carvalho")).toBeNull();
    expect(screen.queryByText("Gustavo Nóbrega")).toBeNull();
  });

  /**
   * O FILTRO DE SITUAÇÃO DA ABA DE ALOCADOS SÓ OFERECE O QUE A ABA PODE CONTER, e isto está aqui
   * escrito como ESCOLHA, não como acaso: oferecer "Descartado" numa aba onde ele devolve zero por
   * construção é oferecer um clique que só sabe não achar nada.
   *
   * SE O DIRETOR DECIDIR O CONTRÁRIO, é este teste que muda, e a régua de cima ("não traz ninguém de
   * volta") continua valendo do mesmo jeito: as duas coisas são independentes.
   */
  it("o filtro de situação da aba só oferece as situações que a aba pode conter", async () => {
    await montar("alocados");
    const gatilho = gatilhoDoFiltro(/situa/i, "SITUAÇÃO");
    fireEvent.click(gatilho);
    const rotulos = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());

    expect(rotulos).toEqual(["Alocado", "Enviado Para Admissão"]);
  });

  it("vazio por filtro na aba de alocados também diz que foi o recorte", async () => {
    await montar("alocados");
    porEtapa("Triagem");

    expect(screen.queryByText("Ninguém foi marcado como alocado nesta vaga ainda.")).toBeNull();
    expect(screen.getAllByText(/recorte|filtro|busca/i).length).toBeGreaterThan(0);
  });

  it("o filtro recorta DENTRO da aba: alocado sim, enviado para admissão não", async () => {
    await montar("alocados");
    porSituacao("Alocado");

    expect(nomesVisiveis().sort()).toEqual(["Décio Araújo", "Helena Sá"]);
    expect(nomesVisiveis()).not.toContain("Fabiana Assunção");
  });

  /** A busca por nome vale nas DUAS abas, e não só na lista completa (pedido do diretor). */
  it("a busca por nome existe e funciona na aba de alocados", async () => {
    await montar("alocados");
    buscar("decio");
    expect(nomesVisiveis()).toEqual(["Décio Araújo"]);
  });

  /** A régua da seleção também vale aqui, e é onde o lote consome a meta da vaga. */
  it("a seleção da aba de alocados obedece ao recorte", async () => {
    await montar("alocados");
    fireEvent.click(caixaDeTodos());
    expect(contadorDaBarra()).toBe(3);

    buscar("decio");

    expect(contadorDaBarra()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 7. §A.29: FILTRO E ORDENAÇÃO CONVIVEM
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("filtro e ordenação convivem (§A.29)", () => {
  /**
   * ORDENAR COM FILTRO ATIVO ORDENA O RECORTE, e não a lista inteira. A falha que este teste pega é
   * silenciosa dos dois lados: ou a ordenação reintroduz as linhas filtradas, ou o filtro é aplicado
   * DEPOIS da ordenação e a ordem sai embaralhada.
   */
  it("ordenar por Candidato ordena o recorte, e não traz ninguém de volta", async () => {
    await montar();
    porSituacao("Em Seleção");
    // A ordem de chegada NÃO é alfabética: é isso que faz o clique abaixo ter o que provar.
    expect(nomesVisiveis()).toEqual([
      "Cláudia Nogueira",
      "Ana Paula Ribeiro",
      "Éder Gonçalves",
    ]);

    fireEvent.click(cabecalhoDeCandidato());

    expect(nomesVisiveis()).toEqual([
      "Ana Paula Ribeiro",
      "Cláudia Nogueira",
      "Éder Gonçalves",
    ]);
  });

  it("o segundo clique inverte, ainda dentro do recorte", async () => {
    await montar();
    porSituacao("Em Seleção");
    const cabecalho = cabecalhoDeCandidato();
    fireEvent.click(cabecalho);
    fireEvent.click(cabecalho);

    expect(nomesVisiveis()).toEqual([
      "Éder Gonçalves",
      "Cláudia Nogueira",
      "Ana Paula Ribeiro",
    ]);
  });

  /**
   * ORDENAR NÃO É RECORTAR: a ordem muda, a seleção fica. Este teste existe porque a poda da seleção
   * costuma ser escrita observando "a lista visível mudou", e reordenar muda a lista visível sem
   * esconder ninguém. Podar aqui apagaria a marca do consultor a cada clique de cabeçalho.
   */
  it("ordenar NÃO derruba a seleção", async () => {
    await montar();
    marcar("Cláudia Nogueira");
    marcar("Éder Gonçalves");
    expect(contadorDaBarra()).toBe(2);

    fireEvent.click(cabecalhoDeCandidato());

    expect(contadorDaBarra()).toBe(2);
  });

  /**
   * ─ O CONJUNTO É A RÉGUA; A ORDEM É UMA PROPOSTA, E ESTÁ SEPARADA DE PROPÓSITO ────────────────
   *
   * O QUE ESTE TESTE AFIRMA é o que o diretor pediu: com filtro E ordenação ativos, o lote leva
   * EXATAMENTE o recorte à vista, nem um id a mais. Por isso ele compara CONJUNTO.
   *
   * O QUE ELE NÃO AFIRMA, e é medição minha, não requisito: os ids saem na ordem da LISTA DE ORIGEM
   * (`c3, c1, c5`), e não na ordem que a tabela está desenhando depois de ordenar por nome
   * (`c1, c3, c5`). Isso não muda QUEM é afetado, só a ordem em que a lista de falhas do
   * `ResultadoLoteModal` volta a ser lida ao lado da tabela. Afirmar a ordem da tela aqui seria
   * codificar o meu gosto como régua, então ela vai no relatório como proposta de baixa gravidade.
   */
  it('"todos" com filtro e ordenação leva exatamente o recorte à vista, e nada além', async () => {
    await montar();
    porSituacao("Em Seleção");
    fireEvent.click(cabecalhoDeCandidato());
    fireEvent.click(caixaDeTodos());
    expect(nomesVisiveis()).toEqual([
      "Ana Paula Ribeiro",
      "Cláudia Nogueira",
      "Éder Gonçalves",
    ]);

    fireEvent.click(screen.getByRole("button", { name: /finalizar posição \(3\)/i }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Finalizar posição" }).at(-1) as HTMLElement,
    );

    await waitFor(() => expect(finalizarPosicaoEmLote).toHaveBeenCalledTimes(1));
    const [ids] = finalizarPosicaoEmLote.mock.calls[0] as unknown as [string[]];
    expect([...ids].sort()).toEqual(["c1", "c3", "c5"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 8. O CONTRATO DOS CONTROLES: §A.28 e §A.35 medidas, não confiadas
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("os controles obedecem ao design system", () => {
  /**
   * §A.35: NENHUM `<select>` CRU. O nativo abre o dropdown do sistema operacional, que não obedece
   * ao tema, e esta é a única parte da interface que o sistema não controla. A regra nasceu de o
   * seletor de loja repetir o erro com o `Select` do design system pronto e em uso.
   */
  it("os dois filtros são MultiSelect do design system, e não <select> nativo", async () => {
    await montar();
    gatilhoDoFiltro(/situa/i, "SITUAÇÃO");
    gatilhoDoFiltro(/etapa/i, "ETAPA");
    expect(document.querySelectorAll("select")).toHaveLength(0);
  });

  /** §A.28: múltipla seleção de verdade, os dois valores convivendo. */
  it("os filtros aceitam mais de um valor ao mesmo tempo", async () => {
    await montar();
    porEtapa("Triagem");
    porEtapa("Captação");

    expect(nomesVisiveis()).toEqual([
      "Cláudia Nogueira",
      "Ana Paula Ribeiro",
      "Bruno Carvalho",
      "Helena Sá",
    ]);
  });

  /**
   * O VOCABULÁRIO INTEIRO NA ABA DA LISTA COMPLETA. "Desistiu" e "Descartado" existem no domínio e
   * existem na lista, então eles têm de ser perguntáveis.
   */
  it("o filtro de situação oferece o vocabulário da aba, e não só as situações presentes", async () => {
    await montar();
    const gatilho = gatilhoDoFiltro(/situa/i, "SITUAÇÃO");
    fireEvent.click(gatilho);
    const rotulos = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());

    expect(rotulos).toEqual([
      "Em Seleção",
      "Aprovado",
      "Alocado",
      "Descartado",
      "Desistiu",
      "Enviado Para Admissão",
    ]);
  });

  /** O catálogo de ETAPA vem de `useEtapas` (endpoint), e não das linhas carregadas (§A.37). */
  it("o filtro de etapa oferece o catálogo do diretor, não só as etapas presentes", async () => {
    await montar("alocados"); // só Captação e Aprovação estão presentes nesta aba
    const gatilho = gatilhoDoFiltro(/etapa/i, "ETAPA");
    fireEvent.click(gatilho);
    const rotulos = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());

    expect(rotulos).toContain("Triagem");
    expect(rotulos).toContain("Entrevista Soulan");
    expect(rotulos).toContain("Entrevista Cliente");
  });

  /**
   * ─ §A.37 MEDIDO NO GESTO QUE O QUEBRA: A LISTA NÃO PODE ENCOLHER DEPOIS DA PRIMEIRA ESCOLHA ──
   *
   * É ESTE o defeito que a regra descreve, e ele não aparece abrindo o filtro uma vez: opção
   * derivada das LINHAS CARREGADAS parece completa no primeiro clique e desaba no segundo, porque as
   * linhas já são o recorte. Escolhido "Em Seleção", só sobraria "Em Seleção", e somar um segundo
   * valor passaria a exigir limpar o filtro, que é metade da pergunta que o filtro existe para fazer.
   *
   * O TESTE VALE PARA OS DOIS EIXOS, porque o defeito é de origem da lista, e não de qual lista é.
   */
  it("escolher um valor NÃO encolhe as opções oferecidas (§A.37)", async () => {
    await montar();
    porSituacao("Em Seleção");

    const gatilhoSit = gatilhoDoFiltro(/situa/i, "SITUAÇÃO");
    fireEvent.click(gatilhoSit);
    const situacoes = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());
    expect(situacoes).toContain("Descartado");
    expect(situacoes).toContain("Enviado Para Admissão");
    fireEvent.click(gatilhoSit);

    const gatilhoEtapa = gatilhoDoFiltro(/etapa/i, "ETAPA");
    fireEvent.click(gatilhoEtapa);
    const etapas = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());
    // Ninguém EM SELEÇÃO está em Entrevista Cliente, e a opção tem de continuar lá: é ela que
    // responde "e se eu somar a entrevista?", que é a pergunta seguinte de quem acabou de filtrar.
    expect(etapas).toContain("Entrevista Cliente");
    expect(etapas).toContain("Aprovação");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 9. QUEM SAIU DO FUNIL: NENHUMA LINHA PODE FICAR INALCANÇÁVEL PELO FILTRO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ O ACHADO QUE MUDOU ESTE BLOCO DE LUGAR ─────────────────────────────────────────────────────
 *
 * A primeira versão deste arquivo esperava que "Etapa = Triagem" devolvesse TAMBÉM o Gustavo, que
 * está em Triagem e DESCARTADO. A construção discorda, e está certa: a coluna Etapa não mostra etapa
 * nenhuma para quem saiu do funil (a etapa dele é memória, não posição), então devolvê-lo ali
 * desenharia uma linha em branco sob um filtro que pede "Triagem".
 *
 * MAS A RÉGUA NÃO PODE PARAR AÍ, e é isso que este bloco trava: se etapa nenhuma casa com quem saiu,
 * ele fica INALCANÇÁVEL pelo eixo de etapa, e o filtro passa a esconder gente sem oferecer como
 * encontrá-la. A saída é o VALOR ESPECIAL, que é exatamente o que a §A.37 manda ("os valores
 * especiais da coluna viram opções do filtro"), e sem ele metade da pergunta some.
 */
describe("quem saiu do funil continua alcançável", () => {
  /** A COERÊNCIA, e é ela a régua de verdade: o que o filtro devolve, a coluna MOSTRA. */
  it("toda linha devolvida por um filtro de etapa MOSTRA aquela etapa na coluna", async () => {
    await montar();
    porEtapa("Triagem");

    expect(nomesVisiveis().length).toBeGreaterThan(0);
    for (const nome of nomesVisiveis()) {
      expect(textoDaLinha(nome)).toContain("Triagem");
    }
  });

  /**
   * O VALOR ESPECIAL EXISTE E ACHA QUEM SAIU. Sem ele, Gustavo (descartado) e Ícaro (desistiu) não
   * teriam nenhum valor do eixo de etapa que os encontrasse.
   */
  it('"Fora Do Funil" é opção do filtro e acha quem saiu do processo', async () => {
    await montar();
    porEtapa("Fora Do Funil");

    expect(nomesVisiveis()).toEqual(["Gustavo Nóbrega", "Ícaro Machado"]);
  });

  /**
   * A PROPRIEDADE QUE FECHA O EIXO: marcando TODAS as opções do filtro de etapa, a lista volta
   * inteira. Nenhuma linha da aba pode ficar sem nenhum valor que a alcance, e este teste é o único
   * que pega o caso de alguém acrescentar uma situação de saída nova e esquecer do valor especial.
   */
  it("todas as opções de etapa juntas devolvem a aba inteira, sem sobrar ninguém", async () => {
    await montar();
    const gatilho = gatilhoDoFiltro(/etapa/i, "ETAPA");
    fireEvent.click(gatilho);
    const opcoes = within(screen.getByRole("listbox")).getAllByRole("option");
    for (const opcao of opcoes) fireEvent.click(opcao);
    fireEvent.click(gatilho);

    expect(nomesVisiveis()).toHaveLength(LISTA.length);
  });

  /** A opção só existe onde ela pode acontecer: na aba de alocados, todo mundo está vivo no funil. */
  it('"Fora Do Funil" não é oferecido na aba de alocados, onde ninguém saiu', async () => {
    await montar("alocados");
    const gatilho = gatilhoDoFiltro(/etapa/i, "ETAPA");
    fireEvent.click(gatilho);
    const rotulos = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((el) => (el.textContent ?? "").trim());

    expect(rotulos).not.toContain("Fora Do Funil");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 10. CONSERTO E (onda B): A LINHA ENCERRADA SAI DA SELEÇÃO, NÃO DA LISTA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE ESTA COBERTURA EXISTE, e por que ela é o PAR de uma trava de servidor ──────────────
 *
 * O backend passou a RECUSAR decisão sobre candidatura encerrada (a "terceira porta"). A tela
 * poderia ficar como estava e continuar correta: o lote iria, o servidor recusaria linha a linha, e
 * as pessoas voltariam em `falhas`. Correto e péssimo: a pessoa seleciona trinta, clica, espera, e
 * recebe uma lista de exceções que ela podia ter visto antes de clicar.
 *
 * A RÉGUA DA TELA É `podeDecidir`, A MESMA com que a barra de ações já conta os "parados". Aqui ela
 * deixa de OFERECER o que aquela barra já contava como impossível, e o número prometido pelo modal
 * volta a ser o número que sai.
 *
 * ┌─ A METADE QUE É FÁCIL DE ERRAR: SAI DA SELEÇÃO, NÃO DA LISTA ──────────────────────────────┐
 * │ Esconder a linha encerrada resolveria a seleção e QUEBRARIA o histórico: o texto de apoio da │
 * │ aba promete, com todas as letras, que "quem já saiu continua na lista, como histórico", e o  │
 * │ contador da aba conta a vaga inteira. Uma implementação que filtrasse as linhas passaria em  │
 * │ todo teste de seleção deste bloco e mentiria nas duas outras superfícies.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("a caixa da linha encerrada nasce desabilitada", () => {
  /** Os dois encerrados da lista, derivados da régua e não digitados: saída nova cai aqui sozinha. */
  const ENCERRADOS = LISTA.filter((c) => !candidaturaViva(c.situacao)).map((c) => c.candidatoNome);
  const VIVOS = LISTA.filter((c) => candidaturaViva(c.situacao)).map((c) => c.candidatoNome);

  it("os encerrados da lista são exatamente quem saiu sem êxito", () => {
    expect(ENCERRADOS.sort()).toEqual(["Gustavo Nóbrega", "Ícaro Machado"]);
  });

  for (const nome of ENCERRADOS) {
    it(`a caixa de ${nome} vem desabilitada`, async () => {
      await montar();
      expect(caixaDaLinha(nome).disabled).toBe(true);
    });

    /**
     * O `title` EXISTE E EXPLICA. Caixa cinza sem explicação é a tela recusando sem dizer o motivo,
     * e quem opera conclui que o sistema travou. É a mesma régua do §A.11 aplicada a um controle.
     */
    it(`a caixa de ${nome} diz POR QUE está desabilitada`, async () => {
      await montar();
      const caixa = caixaDaLinha(nome);
      const explicacao = `${caixa.getAttribute("title") ?? ""} ${caixa.getAttribute("aria-label") ?? ""}`;
      expect(explicacao.trim().length).toBeGreaterThan(0);
      expect(explicacao).toMatch(/saiu|terminou|encerrad/i);
    });
  }

  /** O contrapeso: a trava não pode pegar quem está vivo, inclusive o ALOCADO e o APROVADO. */
  for (const nome of VIVOS) {
    it(`a caixa de ${nome} continua habilitada`, async () => {
      await montar();
      expect(caixaDaLinha(nome).disabled).toBe(false);
    });
  }

  /**
   * A LINHA CONTINUA NA LISTA E NO TOTAL. É a metade que uma implementação por filtro quebraria em
   * silêncio, e ela é afirmada nas DUAS superfícies: a tabela e o contador da aba.
   */
  it("a linha encerrada continua visível e continua contando no total da aba", async () => {
    await montar();

    expect(nomesVisiveis()).toHaveLength(LISTA.length);
    for (const nome of ENCERRADOS) expect(nomesVisiveis()).toContain(nome);

    const botao = screen
      .getAllByRole("button")
      .find((el) => (el.textContent ?? "").trim().startsWith("Ver Candidatos")) as HTMLElement;
    expect(botao.textContent).toContain(String(LISTA.length));
  });

  /** Clicar na caixa desabilitada não marca nada: `disabled` de verdade, não só cinza. */
  it("clicar na caixa do encerrado não o coloca na seleção", async () => {
    await montar();

    for (const nome of ENCERRADOS) fireEvent.click(caixaDaLinha(nome));

    expect(contadorDaBarra()).toBe(0);
  });
});

describe('"selecionar todos" marca só quem aceita decisão', () => {
  it("sem filtro, marca os sete vivos e deixa os dois encerrados de fora", async () => {
    await montar();

    fireEvent.click(caixaDeTodos());

    const vivos = LISTA.filter((c) => candidaturaViva(c.situacao)).length;
    expect(contadorDaBarra()).toBe(vivos);
    expect(contadorDaBarra()).toBeLessThan(LISTA.length);
    for (const l of linhasVisiveis()) expect(l.marcada).toBe(l.habilitada);
  });

  /**
   * ─ O CASO QUE LIGA O CONSERTO E À RÉGUA DA ONDA ANTERIOR ─────────────────────────────────────
   *
   * Filtrando por "Fora Do Funil", TODAS as linhas à vista são encerradas. Nenhuma aceita decisão,
   * então "selecionar todos" não tem o que marcar e a caixa do cabeçalho fica DESABILITADA, em vez
   * de marcar linhas que o servidor vai recusar uma a uma.
   */
  it("num recorte só de encerrados, a caixa do cabeçalho fica desabilitada e nada é marcado", async () => {
    await montar();
    porEtapa("Fora Do Funil");
    expect(nomesVisiveis()).toEqual(["Gustavo Nóbrega", "Ícaro Machado"]);

    expect(caixaDeTodos().disabled).toBe(true);
    fireEvent.click(caixaDeTodos());
    expect(contadorDaBarra()).toBe(0);
  });

  /**
   * COM FILTRO MISTO, as duas réguas valem ao mesmo tempo: recorte à vista E aceita decisão. Este é
   * o único teste que exercita a interseção das duas ondas, e é onde uma delas costuma ser
   * esquecida quando a outra é implementada.
   */
  it("com filtro, marca a interseção: à vista E aceita decisão", async () => {
    await montar();
    porEtapa("Triagem");
    porEtapa("Fora Do Funil");
    // Triagem viva (Ana, Bruno) mais os dois que saíram do funil (Gustavo, Ícaro).
    expect(nomesVisiveis()).toHaveLength(4);

    fireEvent.click(caixaDeTodos());

    expect(contadorDaBarra()).toBe(2);
    expect(
      linhasVisiveis().filter((l) => l.marcada).map((l) => l.nome).sort(),
    ).toEqual(["Ana Paula Ribeiro", "Bruno Carvalho"]);
  });

  /**
   * E O QUE SAI PELA REDE CONTINUA SENDO SÓ ISSO. A barra pode contar certo e o lote ainda mandar a
   * linha encerrada: são dois caminhos diferentes, e foi essa divergência que a onda anterior mediu.
   */
  it("o lote disparado depois de \"todos\" não leva nenhum encerrado", async () => {
    await montar();
    fireEvent.click(caixaDeTodos());

    fireEvent.click(screen.getByRole("button", { name: /finalizar posição \(\d+\)/i }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Finalizar posição" }).at(-1) as HTMLElement,
    );

    await waitFor(() => expect(finalizarPosicaoEmLote).toHaveBeenCalledTimes(1));
    const [ids] = finalizarPosicaoEmLote.mock.calls[0] as unknown as [string[]];
    const encerrados = LISTA.filter((c) => !candidaturaViva(c.situacao)).map((c) => c.id);
    for (const id of encerrados) expect(ids).not.toContain(id);
  });
});
