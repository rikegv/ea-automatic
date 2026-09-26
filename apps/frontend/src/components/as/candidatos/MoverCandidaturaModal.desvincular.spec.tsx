// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsCandidaturaItem } from "@ea/shared-types";

/**
 * ─ DESVINCULAR DA VAGA: a tela é a PRIMEIRA barreira do motivo, e hoje ela é a mais firme ───────
 *
 * ┌─ POR QUE ESTE TESTE É DE COMPONENTE, E NÃO DE FUNÇÃO PURA ───────────────────────────────────┐
 * │ A REGRA MORA NO JSX. O motivo obrigatório do desvínculo é um `disabled` calculado dentro do   │
 * │ componente (`motivo.trim().length < 2`), e não uma função exportada que se possa chamar de    │
 * │ um teste de unidade. Régua que só existe dentro do JSX é régua que ninguém afirma, e é assim  │
 * │ que ela some numa refatoração sem nada ficar vermelho.                                        │
 * │                                                                                               │
 * │ ELA NÃO É MAIS A ÚNICA BARREIRA, e o texto anterior ficou defasado (achado do `tester`,       │
 * │ 09/09). Quando este arquivo nasceu, o `@MinLength(2)` do DTO media a string CRUA e um motivo  │
 * │ só com espaços passava no backend, gravado como NULO. **Isso foi corrigido**: o DTO ganhou um │
 * │ `@Transform` que apara ANTES da validação, e o backend recusa o mesmo valor com 400.          │
 * │                                                                                               │
 * │ O TEXTO É CORRIGIDO EM VEZ DE APAGADO porque a frase antiga dizia ao próximo leitor           │
 * │ exatamente o que autorizaria afrouxar o DTO ("a tela é a única barreira"), que é o inverso do │
 * │ que este arquivo sustenta. A régua da tela continua valendo pela razão de sempre: ela evita   │
 * │ a viagem até o servidor para receber um 400 previsível.                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A APRESENTAÇÃO MUDOU E O MECANISMO FICOU, que é exatamente quando ninguém escreve teste: as duas
 * saídas sem êxito passaram a se apresentar como MOTIVO de um gesto só, o desvínculo, e o envio para
 * a admissão saiu do grupo. Se o envio voltasse a cair no mesmo agrupamento, a tela chamaria de
 * saída o AVANÇO para a esteira, e a pessoa que ocupa a posição apareceria como quem a liberou.
 */

const { registrarSaida } = vi.hoisted(() => ({ registrarSaida: vi.fn(async () => ({})) }));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return { ...real, registrarSaida, aprovarCandidatura: vi.fn(), moverEtapa: vi.fn() };
});

/**
 * ─ O CATÁLOGO DE MOTIVOS DE DESCARTE, FINGIDO, porque agora o campo DEPENDE dele ───────────────
 *
 * O DESCARTE DEIXOU DE SER TEXTO LIVRE: o backend confere o motivo contra `motivos_descarte`, e a
 * tela passou a oferecer um SELETOR naquele card. Sem esta dublê, o componente sairia buscando a
 * lista pela rede no meio do teste, e o seletor nasceria vazio.
 *
 * A DESISTÊNCIA NÃO É AFETADA, e é isso que os dois caminhos deste arquivo afirmam: lá o campo
 * continua sendo PROSA, porque a pergunta é outra ("o que a pessoa disse ao desistir"). Quem decide
 * qual dos dois é `motivoVemDoCatalogo`, do vocabulário compartilhado, e NÃO uma comparação escrita
 * na tela.
 */
const MOTIVO_DO_CATALOGO = "Perfil não aderente";
vi.mock("@/lib/as-motivos-descarte", () => ({
  listarMotivosDescarteAtivos: vi.fn(async () => []),
  useMotivosDescarte: (_token: string | null, ativo: boolean) => ({
    motivos: ativo ? [{ id: "m1", nome: MOTIVO_DO_CATALOGO, ativo: true }] : [],
    carregando: false,
    erro: null,
  }),
}));

import { MoverCandidaturaModal } from "./MoverCandidaturaModal";

const ALOCADO: AsCandidaturaItem = {
  id: "cand-1",
  candidatoId: "pessoa-1",
  candidatoNome: "Fulano De Tal",
  vagaId: "vaga-1",
  vagaCodigo: "PS-2026-001",
  vagaNome: "Vaga de teste",
  etapa: "APROVACAO",
  situacao: "ALOCADO",
  // Alocado ocupa posição, e esta fixture é a do lado OFICIAL, que é o caso comum.
  posicaoLado: "OFICIAL",
  motivoDescarte: null,
  alocadoEm: "2026-09-01T12:00:00.000Z",
  alocadoPorNome: "Ana",
  atualizadoEm: "2026-09-01T12:00:00.000Z",
  ultimoContatoEm: null,
  // A PRETENSÃO SALARIAL entrou em `AsCandidaturaItem` na Frente E (ponto 9). NULA é o normal:
  // só quem foi descartado por um motivo marcado `pedePretensao` no catálogo tem valor.
  pretensaoSalarial: null,
};

function abrir(candidatura: AsCandidaturaItem = ALOCADO) {
  const onFeito = vi.fn();
  render(
    <MoverCandidaturaModal
      candidatura={candidatura}
      token="t"
      onClose={() => {}}
      onFeito={onFeito}
    />,
  );
  return { onFeito };
}

/**
 * ESCOLHER NO SELETOR DO CATÁLOGO: abrir o gatilho e clicar na opção, que é o gesto real de quem
 * opera. Mandar o valor direto ao estado passaria por cima justamente do componente que esta frente
 * introduziu, e o teste ficaria verde com o seletor quebrado.
 */
function escolherNoCatalogo(nome: string) {
  fireEvent.click(screen.getByRole("button", { name: "Motivo do descarte" }));
  fireEvent.click(screen.getByRole("option", { name: nome }));
}

/** O botão que CONFIRMA dentro da caixa de motivo (o diálogo tem outro com o mesmo rótulo). */
function botaoDoFormulario(rotulo: string) {
  const painel = screen.getByRole("dialog", { name: "Mover a candidatura" });
  return within(painel).getByRole("button", { name: rotulo });
}

const CARDS = [
  { card: "Descartado Pela Seleção", situacao: "DESCARTADO" as const },
  { card: "Desistiu Do Processo", situacao: "DESISTIU" as const },
];

describe("a seção de desvínculo: as duas saídas sem êxito, e SÓ elas", () => {
  afterEach(() => {
    cleanup();
    registrarSaida.mockClear();
  });

  it("oferece os dois motivos de saída sob o título do desvínculo", () => {
    abrir();
    expect(screen.getByText("Desvincular Da Vaga")).toBeTruthy();
    for (const { card } of CARDS) expect(screen.getByText(card)).toBeTruthy();
  });

  it("o envio para a admissão fica em seção PRÓPRIA: avançar não é sair da vaga", () => {
    abrir();
    // A régua é `ehSaidaSemExito`, do vocabulário compartilhado. Agrupar o envio com o desvínculo
    // faria a tela chamar de saída quem CONTINUA ocupando a posição.
    expect(screen.getByText("Enviar Para A Admissão")).toBeTruthy();
    expect(screen.getByText(/a posição volta a ficar livre/i)).toBeTruthy();
  });

  it("o ALOCADO continua se movendo no funil, e mesmo assim tem o desvínculo à mão", () => {
    abrir();
    // As DUAS coisas ao mesmo tempo, que é a régua do diretor: o alocado PREENCHEU a posição e
    // CONTINUA no funil, então ele não pode ler que foi encerrado nem ficar sem como sair da vaga.
    expect(screen.getByText("Mover No Funil")).toBeTruthy();
    expect(screen.queryByText(/já foi encerrada como/i)).toBeNull();
    expect(screen.getByText("Descartado Pela Seleção")).toBeTruthy();
  });
});

describe("o motivo é obrigatório NOS DOIS cards, e o branco não conta como motivo", () => {
  afterEach(() => {
    cleanup();
    registrarSaida.mockClear();
  });

  /**
   * O DESCARTE ESCOLHE NO CATÁLOGO, e por isso ele não cabe mais no laço dos dois cards: lá não há
   * o que digitar, e "só espaços não é motivo" nem chega a ser uma pergunta que o seletor permita
   * fazer. A régua equivalente aqui é OUTRA: sem escolha, o botão não libera.
   */
  it("Descartado Pela Seleção: o motivo vem do CATÁLOGO, e o botão só libera com uma opção escolhida", () => {
    abrir();
    fireEvent.click(screen.getByText("Descartado Pela Seleção"));

    // NÃO HÁ CAIXA DE TEXTO NESTE CARD. É esta ausência que impede a tela de mandar texto livre
    // para uma rota que agora confere o motivo contra a lista (e devolvia 400 em todo descarte).
    expect(screen.queryByRole("textbox")).toBeNull();
    expect((botaoDoFormulario("Desvincular da vaga") as HTMLButtonElement).disabled).toBe(true);

    escolherNoCatalogo(MOTIVO_DO_CATALOGO);
    expect((botaoDoFormulario("Desvincular da vaga") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Descartado Pela Seleção: confirmar manda o NOME do motivo do catálogo", async () => {
    abrir();
    fireEvent.click(screen.getByText("Descartado Pela Seleção"));
    escolherNoCatalogo(MOTIVO_DO_CATALOGO);
    fireEvent.click(botaoDoFormulario("Desvincular da vaga"));

    // NENHUMA AÇÃO DE ESTADO EXECUTA EM UM CLIQUE SÓ: o botão PERGUNTA, o diálogo executa.
    expect(registrarSaida).not.toHaveBeenCalled();

    const dialogo = screen.getByRole("dialog", { name: "Desvincular Da Vaga?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desvincular da vaga" }));

    await waitFor(() => expect(registrarSaida).toHaveBeenCalledTimes(1));
    // O QUE VAI NO CORPO É O NOME, e não o id: é o nome que o backend compara e é o nome que fica
    // gravado na candidatura.
    expect(registrarSaida).toHaveBeenCalledWith("cand-1", "DESCARTADO", MOTIVO_DO_CATALOGO, "t");
  });

  it("Desistiu Do Processo: o motivo continua sendo PROSA, e o branco não conta como motivo", () => {
    abrir();
    fireEvent.click(screen.getByText("Desistiu Do Processo"));

    const campo = screen.getByRole("textbox");
    expect((botaoDoFormulario("Desvincular da vaga") as HTMLButtonElement).disabled).toBe(true);

    // SÓ ESPAÇOS NÃO É MOTIVO, dos dois lados: aqui pelo `trim()` da tela, e no backend pelo
    // `@Transform` que apara antes do `@MinLength(2)` (era esse o buraco, e ele foi fechado).
    fireEvent.change(campo, { target: { value: "     " } });
    expect((botaoDoFormulario("Desvincular da vaga") as HTMLButtonElement).disabled).toBe(true);

    // UM caractere também não, e a régua da tela é a mesma do `@MinLength(2)`.
    fireEvent.change(campo, { target: { value: "x" } });
    expect((botaoDoFormulario("Desvincular da vaga") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(campo, { target: { value: "Outra proposta" } });
    expect((botaoDoFormulario("Desvincular da vaga") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Desistiu Do Processo: confirmar manda a situação do card e o motivo APARADO", async () => {
    abrir();
    fireEvent.click(screen.getByText("Desistiu Do Processo"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Outra proposta  " } });
    fireEvent.click(botaoDoFormulario("Desvincular da vaga"));

    expect(registrarSaida).not.toHaveBeenCalled();

    const dialogo = screen.getByRole("dialog", { name: "Desvincular Da Vaga?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Desvincular da vaga" }));

    await waitFor(() => expect(registrarSaida).toHaveBeenCalledTimes(1));
    expect(registrarSaida).toHaveBeenCalledWith("cand-1", "DESISTIU", "Outra proposta", "t");
  });

  it("o diálogo diz o que acontece com a POSIÇÃO antes de confirmar, e não só o nome do estado", () => {
    abrir();
    fireEvent.click(screen.getByText("Descartado Pela Seleção"));
    escolherNoCatalogo(MOTIVO_DO_CATALOGO);
    fireEvent.click(botaoDoFormulario("Desvincular da vaga"));

    const dialogo = screen.getByRole("dialog", { name: "Desvincular Da Vaga?" });
    expect(within(dialogo).getByText(/A posição volta a ficar livre na vaga/i)).toBeTruthy();
    expect(within(dialogo).getByText(/banco de candidatos/i)).toBeTruthy();
  });

  it("cancelar o diálogo NÃO desvincula ninguém", async () => {
    abrir();
    fireEvent.click(screen.getByText("Desistiu Do Processo"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Outra proposta" } });
    fireEvent.click(botaoDoFormulario("Desvincular da vaga"));

    const dialogo = screen.getByRole("dialog", { name: "Desvincular Da Vaga?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Desvincular Da Vaga?" })).toBeNull(),
    );
    expect(registrarSaida).not.toHaveBeenCalled();
  });
});

describe("quem JÁ saiu não é desvinculado de novo", () => {
  afterEach(() => {
    cleanup();
    registrarSaida.mockClear();
  });

  it("a candidatura encerrada mostra o motivo registrado e nenhum card de desvínculo", () => {
    abrir({ ...ALOCADO, situacao: "DESCARTADO", motivoDescarte: "Perfil não aderente" });

    expect(screen.getByText(/já foi encerrada como/i)).toBeTruthy();
    expect(screen.getByText(/Motivo registrado: Perfil não aderente/i)).toBeTruthy();
    expect(screen.queryByText("Desistiu Do Processo")).toBeNull();
    expect(screen.queryByText("Desvincular Da Vaga")).toBeNull();
  });
});
