// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsCandidaturaItem, VagaListItem } from "@ea/shared-types";

/**
 * ─ AS AÇÕES EM MASSA DA VAGA: as réguas que moram no JSX ──────────────────────────────────────
 *
 * ┌─ POR QUE ESTE TESTE É DE COMPONENTE ────────────────────────────────────────────────────────┐
 * │ Três decisões desta frente não são funções exportadas, elas são `disabled` e condicional de  │
 * │ renderização dentro do componente, e régua que só existe dentro do JSX é régua que ninguém   │
 * │ afirma:                                                                                      │
 * │   1. O `vagaId` SEMPRE vai na finalização em lote. É ele que liga as duas proteções do        │
 * │      backend (lote inteiro recusado com a vaga encerrada; linha recusada quando a candidatura │
 * │      não é daquela vaga). Omiti-lo não quebra nada, não falha nenhum teste e desliga as duas. │
 * │   2. O motivo do desvínculo é obrigatório com DOIS caracteres ÚTEIS, medidos APARADOS. Sem o  │
 * │      `trim`, três espaços habilitam o botão e trinta desfechos vão sem explicação de uma vez. │
 * │   3. AÇÃO QUE SÓ SABE FALHAR NÃO É OFERECIDA: quem já entregou posição não a entrega de novo, │
 * │      e a aba de alocados não pode mostrar o botão que consome a meta.                         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E A QUARTA: o RESULTADO mostra as DUAS metades. O lote é parcial de propósito, e um aviso dizendo
 * só "pronto" esconderia exatamente quem ficou de fora.
 */

const { finalizarPosicaoEmLote, registrarSaidaEmLote, moverEtapaEmLote } = vi.hoisted(() => ({
  finalizarPosicaoEmLote: vi.fn(async () => ({ aplicadas: 1, falhas: [] })),
  registrarSaidaEmLote: vi.fn(async () => ({ aplicadas: 1, falhas: [] })),
  moverEtapaEmLote: vi.fn(async () => ({ aplicadas: 1, falhas: [] })),
}));

/**
 * O CATÁLOGO DE ETAPAS VEM DA REDE AGORA, e por isso ele é dublado aqui.
 *
 * A lista do funil deixou de ser constante importada e virou dado do diretor (`as_etapas_funil`),
 * lido por `GET /as/etapas`. Sem este dublê o `Select` de destino abriria VAZIO no teste (a
 * requisição não acontece no jsdom) e o clique em "Triagem" não encontraria nada, que é exatamente
 * como este arquivo falhou na primeira execução depois da mudança.
 *
 * SÓ `useEtapas` É DUBLADO, e o resto do módulo é o de verdade (`importActual`): `rotuloDaEtapa` e
 * companhia são funções puras, e trocá-las por dublê faria o teste afirmar o dublê.
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
 * O CATÁLOGO DE MOTIVOS DE DESCARTE, FINGIDO, porque o campo de motivo do DESCARTE passou a ser um
 * seletor alimentado por `GET /as/motivos-descarte`. Sem esta dublê ele abriria vazio no teste, que
 * é exatamente como este arquivo falhou na primeira execução depois da mudança.
 *
 * A DESISTÊNCIA NÃO É AFETADA: lá o campo continua sendo prosa, e quem decide é
 * `motivoVemDoCatalogo`, do vocabulário compartilhado.
 */
const MOTIVO_DO_CATALOGO = "Perfil não aderente";
/**
 * O SEGUNDO MOTIVO É O MARCADO `pedePretensao`, e ele existe aqui para NÃO aparecer: o servidor
 * recusa esses motivos no lote, porque a pretensão salarial é valor de CADA pessoa e perguntá-la uma
 * vez para valer por N gravaria um número falso em todas menos uma. Os dois nomes são igualmente
 * plausíveis de propósito: quem filtra é a MARCA, nunca o nome.
 */
const MOTIVO_QUE_PEDE_PRETENSAO = "Fora da faixa salarial";
vi.mock("@/lib/as-motivos-descarte", () => ({
  listarMotivosDescarteAtivos: vi.fn(async () => []),
  useMotivosDescarte: (_token: string | null, ativo: boolean) => ({
    motivos: ativo
      ? [
          { id: "m1", nome: "Perfil não aderente", ativo: true, pedePretensao: false },
          { id: "m2", nome: "Fora da faixa salarial", ativo: true, pedePretensao: true },
        ]
      : [],
    carregando: false,
    erro: null,
  }),
}));

vi.mock("@/lib/as-candidatos-lote", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/as-candidatos-lote")>("@/lib/as-candidatos-lote");
  return { ...real, finalizarPosicaoEmLote, registrarSaidaEmLote, moverEtapaEmLote };
});

import { AcoesEmMassaDaVaga } from "./AcoesEmMassaDaVaga";

/**
 * A VAGA, NO RECORTE QUE ESTAS RÉGUAS LEEM. O tipo tem 38 campos e nenhum dos outros é tocado aqui;
 * montá-los todos só faria o teste esconder o que ele afirma (a mesma escolha do `as-vaga-acoes.spec`).
 */
const VAGA = {
  id: "vaga-1",
  status: "ABERTA",
  posicoesOficiais: 5,
  posicoesBanco: 2,
  vagasFechadas: null,
  vagasFechadasBanco: null,
  ocupacao: { finalizadasOficial: 1, finalizadasBanco: 0, ocupadas: 1, livres: 4 },
} as unknown as VagaListItem;

function candidatura(over: Partial<AsCandidaturaItem> = {}): AsCandidaturaItem {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    candidatoNome: "Fulano De Tal",
    vagaId: "vaga-1",
    vagaCodigo: "PS-2026-001",
    vagaNome: "Vaga de teste",
    etapa: "TRIAGEM",
    situacao: "ATIVO",
    posicaoLado: null,
    motivoDescarte: null,
    alocadoEm: "2026-09-01T12:00:00.000Z",
    alocadoPorNome: "Ana",
    atualizadoEm: "2026-09-01T12:00:00.000Z",
    ultimoContatoEm: null,
    // A PRETENSÃO SALARIAL entrou em `AsCandidaturaItem` na Frente E (ponto 9). NULA é o normal:
    // só quem foi descartado por um motivo marcado `pedePretensao` no catálogo tem valor.
    pretensaoSalarial: null,
    ...over,
  };
}

function montar(selecionadas: AsCandidaturaItem[]) {
  const onFeito = vi.fn();
  const onLimpar = vi.fn();
  render(
    <AcoesEmMassaDaVaga
      vaga={VAGA}
      selecionadas={selecionadas}
      token="t"
      onLimpar={onLimpar}
      onFeito={onFeito}
    />,
  );
  return { onFeito, onLimpar };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a barra da seleção", () => {
  it("não existe sem nada marcado", () => {
    montar([]);
    expect(screen.queryByText(/selecionadas:/i)).toBeNull();
  });

  it("oferece finalizar posição para quem ainda não entregou", () => {
    montar([candidatura()]);
    expect(screen.getByRole("button", { name: /finalizar posição/i })).toBeTruthy();
  });

  /*
   * A ABA DE ALOCADOS EM UMA LINHA: todo mundo lá já finalizou, então o botão que CONSOME a meta não
   * pode aparecer. Um botão que só sabe falhar gasta o clique e não diz o que fazer no lugar.
   */
  it("esconde finalizar posição quando toda a seleção já entregou posição", () => {
    montar([candidatura({ situacao: "ALOCADO", posicaoLado: "OFICIAL" })]);
    expect(screen.queryByRole("button", { name: /finalizar posição/i })).toBeNull();
    expect(screen.getByRole("button", { name: /mover no funil/i })).toBeTruthy();
  });

  it("não oferece decisão nenhuma para quem já saiu sem êxito", () => {
    montar([candidatura({ situacao: "DESCARTADO" })]);
    expect(screen.queryByRole("button", { name: /desvincular da vaga/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /enviar para admissão/i })).toBeNull();
  });
});

describe("finalizar posição em massa", () => {
  it("manda SEMPRE o vagaId, que é o que liga as duas proteções do backend", async () => {
    montar([candidatura(), candidatura({ id: "cand-2", candidatoNome: "Beltrana" })]);
    fireEvent.click(screen.getByRole("button", { name: /finalizar posição \(2\)/i }));
    // O clique da barra ABRE A PERGUNTA, não dispara: a confirmação é o botão do rodapé do modal.
    expect(finalizarPosicaoEmLote).not.toHaveBeenCalled();

    const confirmar = screen
      .getAllByRole("button", { name: "Finalizar posição" })
      .at(-1) as HTMLElement;
    fireEvent.click(confirmar);

    await waitFor(() => expect(finalizarPosicaoEmLote).toHaveBeenCalledTimes(1));
    const [ids, , opts] = finalizarPosicaoEmLote.mock.calls[0] as unknown as [
      string[],
      string | null,
      { vagaId: string; lado?: string; cienteBancoComOficiaisAbertas?: boolean },
    ];
    expect(ids).toEqual(["cand-1", "cand-2"]);
    expect(opts.vagaId).toBe("vaga-1");
    // A CIÊNCIA NÃO VAI DE SAÍDA: o lado padrão é o oficial, e ninguém pediu a reserva.
    expect(opts.cienteBancoComOficiaisAbertas).toBe(false);
  });

  /**
   * A CIÊNCIA DO BANCO É COLETADA ANTES, e sem ela o botão não confirma. Em massa o 409 do backend
   * viraria uma falha por linha, sem pergunta nenhuma: trinta recusas idênticas no lugar de uma
   * decisão consciente.
   */
  it("exige a ciência quando o lado é o banco e ainda há posição oficial aberta", async () => {
    montar([candidatura()]);
    fireEvent.click(screen.getByRole("button", { name: /finalizar posição \(1\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Posição De Banco/i }));

    const confirmar = screen
      .getAllByRole("button", { name: "Finalizar posição" })
      .at(-1) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmar.disabled).toBe(false);
    fireEvent.click(confirmar);

    await waitFor(() => expect(finalizarPosicaoEmLote).toHaveBeenCalledTimes(1));
    const [, , opts] = finalizarPosicaoEmLote.mock.calls[0] as unknown as [
      string[],
      string | null,
      { lado: string; cienteBancoComOficiaisAbertas: boolean },
    ];
    expect(opts.lado).toBe("BANCO");
    expect(opts.cienteBancoComOficiaisAbertas).toBe(true);
  });
});

describe("desvincular em massa", () => {
  /**
   * O DESCARTE (o desfecho que o lote abre por padrão) ESCOLHE NO CATÁLOGO, e o lote precisava
   * acompanhar tanto quanto a tela individual: `registrarSaidaEmLote` chama a MESMA `registrarSaida`
   * linha a linha, então texto livre aqui falharia trinta vezes de uma vez, com 400 em todas.
   */
  it("o descarte em massa escolhe o motivo no CATÁLOGO, e sem escolha não confirma", () => {
    montar([candidatura()]);
    fireEvent.click(screen.getByRole("button", { name: /desvincular da vaga \(1\)/i }));

    const confirmar = screen
      .getAllByRole("button", { name: "Desvincular da vaga" })
      .at(-1) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    // NÃO HÁ CAIXA DE TEXTO no desfecho de descarte: é esta ausência que impede a tela de mandar
    // texto livre para uma rota que agora confere o motivo contra a lista.
    expect(screen.queryByLabelText(/motivo da saída/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Motivo do descarte" }));
    fireEvent.click(screen.getByRole("option", { name: MOTIVO_DO_CATALOGO }));
    expect(confirmar.disabled).toBe(false);
  });

  /**
   * O MOTIVO QUE PEDE A PRETENSÃO NÃO É OFERECIDO NO LOTE, e a ausência é a metade da tela de uma
   * régua que o servidor passou a impor: perguntada UMA vez para valer por N pessoas, a pretensão
   * gravaria dado financeiro FALSO em todas menos uma. Oferecê-lo aqui faria o consultor escolher o
   * motivo certo na cabeça dele e levar a recusa depois de marcar trinta linhas.
   *
   * NO DESFECHO INDIVIDUAL NADA MUDA: lá a pergunta é feita para uma pessoa e a resposta é dela, e
   * é `MoverCandidaturaModal.pretensao.spec` que afirma isso.
   */
  it("NÃO oferece, no lote, o motivo marcado com a pretensão salarial", () => {
    montar([candidatura()]);
    fireEvent.click(screen.getByRole("button", { name: /desvincular da vaga \(1\)/i }));
    fireEvent.click(screen.getByRole("button", { name: "Motivo do descarte" }));

    expect(screen.getByRole("option", { name: MOTIVO_DO_CATALOGO })).toBeTruthy();
    expect(screen.queryByRole("option", { name: MOTIVO_QUE_PEDE_PRETENSAO })).toBeNull();
  });

  it("a desistência continua sendo PROSA, e menos de dois caracteres ÚTEIS não confirma", () => {
    montar([candidatura()]);
    fireEvent.click(screen.getByRole("button", { name: /desvincular da vaga \(1\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Desistiu Do Processo/i }));

    const confirmar = screen
      .getAllByRole("button", { name: "Desvincular da vaga" })
      .at(-1) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    // TRÊS ESPAÇOS NÃO SÃO MOTIVO. Sem o `trim`, isto habilitaria o botão e o histórico de todas as
    // pessoas do lote receberia um desfecho sem explicação.
    fireEvent.change(screen.getByLabelText(/motivo da saída/i), { target: { value: "   " } });
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/motivo da saída/i), { target: { value: " ok " } });
    expect(confirmar.disabled).toBe(false);
  });

  /**
   * TROCAR DE DESFECHO LIMPA O MOTIVO, e agora isso é integridade e não zelo: o campo muda de
   * NATUREZA entre os dois, e um nome do catálogo sobrevivente viraria a "prosa" que explica uma
   * desistência que ninguém explicou.
   */
  it("trocar de desfecho limpa o motivo que já estava escolhido", () => {
    montar([candidatura()]);
    fireEvent.click(screen.getByRole("button", { name: /desvincular da vaga \(1\)/i }));
    fireEvent.click(screen.getByRole("button", { name: "Motivo do descarte" }));
    fireEvent.click(screen.getByRole("option", { name: MOTIVO_DO_CATALOGO }));

    fireEvent.click(screen.getByRole("button", { name: /Desistiu Do Processo/i }));
    expect((screen.getByLabelText(/motivo da saída/i) as HTMLTextAreaElement).value).toBe("");
    expect(
      (
        screen.getAllByRole("button", { name: "Desvincular da vaga" }).at(-1) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("manda o motivo aparado e o desfecho escolhido", async () => {
    montar([candidatura()]);
    fireEvent.click(screen.getByRole("button", { name: /desvincular da vaga \(1\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Desistiu Do Processo/i }));
    fireEvent.change(screen.getByLabelText(/motivo da saída/i), {
      target: { value: "  achou outra vaga  " },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Desvincular da vaga" }).at(-1) as HTMLElement,
    );

    await waitFor(() => expect(registrarSaidaEmLote).toHaveBeenCalledTimes(1));
    const [, situacao, motivo] = registrarSaidaEmLote.mock.calls[0] as unknown as [
      string[],
      string,
      string,
    ];
    expect(situacao).toBe("DESISTIU");
    expect(motivo).toBe("achou outra vaga");
  });
});

describe("o resultado do lote", () => {
  /**
   * A METADE QUE UM TOAST ESCONDE. O consultor precisa ver QUEM ficou de fora e POR QUÊ, e o nome
   * vem da memória da tela: a resposta do backend traz só o id (§A.6).
   */
  it("mostra as aplicadas E as falhas, linha a linha, com o nome que a tela já tinha", async () => {
    moverEtapaEmLote.mockResolvedValueOnce({
      aplicadas: 1,
      falhas: [{ alvoId: "cand-2", motivo: "Esta candidatura já está em Triagem." }],
    } as never);

    montar([candidatura(), candidatura({ id: "cand-2", candidatoNome: "Beltrana De Tal" })]);
    fireEvent.click(screen.getByRole("button", { name: /mover no funil \(2\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /etapa de destino/i }));
    fireEvent.click(screen.getByText("Triagem"));
    fireEvent.click(screen.getAllByRole("button", { name: "Mover no funil" }).at(-1) as HTMLElement);

    await waitFor(() => expect(screen.getByText(/Lote Parcial/i)).toBeTruthy());
    expect(screen.getByText(/1 linha aplicada/)).toBeTruthy();
    expect(screen.getByText("Beltrana De Tal")).toBeTruthy();
    expect(screen.getByText(/já está em Triagem/)).toBeTruthy();
  });
});
