// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsCandidaturaItem, AsShortlist } from "@ea/shared-types";
import { ApiError } from "@/lib/api";

/**
 * ─ O ENVIO DA SHORTLIST: as réguas que moram no JSX (Frente E, pontos 10 e 11) ────────────────
 *
 * ┌─ POR QUE DE COMPONENTE ─────────────────────────────────────────────────────────────────────┐
 * │ Três decisões desta caixa não são funções exportadas: elas são condicional de renderização e │
 * │ `disabled` dentro do formulário, e régua que só existe no JSX é régua que ninguém afirma.     │
 * │   1. O AVISO DA LISTA CURTA NÃO BLOQUEIA: o 409 vira pergunta, e o MESMO botão reenvia com a  │
 * │      ciência. Perdida essa segunda chamada, o consultor lê o aviso e não consegue enviar.     │
 * │   2. O MOTIVO DO REENVIO só existe a partir do segundo envio, e ali ele TRAVA o botão. No     │
 * │      primeiro o servidor RECUSA o campo, então oferecê-lo seria oferecer um 400.              │
 * │   3. QUEM JÁ SAIU DO PROCESSO não vai ao cliente, e a tela diz QUEM tirar: a recusa do        │
 * │      servidor é por CONTAGEM (§A.6) e sozinha não mostra a linha a desmarcar.                 │
 * │   4. O AVISO DA LISTA CURTA VALE PARA TODO ENVIO, inclusive reenvio (decisão do diretor), e   │
 * │      o motivo do reenvio é CATÁLOGO: o que viaja é o ID da linha, e não texto digitado.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const { enviarShortlist } = vi.hoisted(() => ({ enviarShortlist: vi.fn() }));

vi.mock("@/lib/as-shortlists", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-shortlists")>("@/lib/as-shortlists");
  // SÓ A ESCRITA É DUBLADA: o número do próximo envio, o rótulo e a leitura do 409 são as réguas
  // de verdade, e trocá-las por dublê faria o teste afirmar o dublê.
  return { ...real, enviarShortlist };
});

/**
 * O CATÁLOGO DE MOTIVOS DE REENVIO, FINGIDO, porque o campo virou seletor alimentado por
 * `GET /as/motivos-reenvio-shortlist`. Sem esta dublê ele abriria vazio, e o teste do reenvio
 * afirmaria um seletor desabilitado em vez da régua.
 */
const MOTIVO = { id: "mr1", nome: "O cliente pediu mais nomes", ativo: true };
vi.mock("@/lib/as-motivos-reenvio-shortlist", () => ({
  listarMotivosReenvioAtivos: vi.fn(async () => []),
  useMotivosReenvioShortlist: (_token: string | null, ativo: boolean) => ({
    motivos: ativo ? [MOTIVO] : [],
    carregando: false,
    erro: null,
  }),
}));

import { EnviarShortlistModal } from "./EnviarShortlistModal";

function candidatura(
  id: string,
  nome: string,
  situacao: AsCandidaturaItem["situacao"] = "ATIVO",
): AsCandidaturaItem {
  return {
    id,
    candidatoId: `p-${id}`,
    candidatoNome: nome,
    vagaId: "vaga-1",
    vagaCodigo: "PS-2026-001",
    vagaNome: "Vaga de teste",
    etapa: "TRIAGEM",
    situacao,
    posicaoLado: null,
    motivoDescarte: null,
    alocadoEm: "2026-09-01T12:00:00.000Z",
    alocadoPorNome: "Ana",
    atualizadoEm: "2026-09-01T12:00:00.000Z",
    ultimoContatoEm: null,
    pretensaoSalarial: null,
  };
}

function enviada(numero: number): AsShortlist {
  return {
    id: `s${numero}`,
    vagaId: "vaga-1",
    numero,
    enviadaEm: "2026-09-20",
    enviadaPorNome: "Ana",
    motivoReenvioId: null,
    motivoReenvioNome: null,
    avisoCurtaAceito: false,
    itens: [],
  };
}

function abrir(opts: { selecionadas?: AsCandidaturaItem[]; enviadas?: AsShortlist[] } = {}) {
  const onEnviada = vi.fn();
  render(
    <EnviarShortlistModal
      vagaId="vaga-1"
      selecionadas={opts.selecionadas ?? [candidatura("c1", "Fulano De Tal")]}
      enviadas={opts.enviadas ?? []}
      carregandoEnviadas={false}
      token="t"
      onCancelar={() => {}}
      onEnviada={onEnviada}
    />,
  );
  return { onEnviada };
}

const botao = (nome: string) => screen.getByRole("button", { name: nome }) as HTMLButtonElement;

/** O seletor do design system: abre pelo gatilho e escolhe a opção, como nas demais telas. */
function escolherMotivoDoReenvio() {
  fireEvent.click(screen.getByRole("button", { name: "Motivo do reenvio" }));
  fireEvent.click(screen.getByRole("option", { name: MOTIVO.nome }));
}

afterEach(() => {
  cleanup();
  enviarShortlist.mockReset();
});

describe("o primeiro envio", () => {
  it("não oferece o motivo do reenvio, porque o servidor o RECUSA ali", () => {
    abrir();
    expect(screen.queryByRole("button", { name: "Motivo do reenvio" })).toBeNull();
    expect(screen.getByText(/Shortlist 1/)).toBeTruthy();
  });

  it("manda a lista sem ciência nenhuma na primeira tentativa", async () => {
    enviarShortlist.mockResolvedValueOnce(enviada(1));
    const { onEnviada } = abrir();

    fireEvent.click(botao("Enviar shortlist"));

    await waitFor(() => expect(enviarShortlist).toHaveBeenCalledTimes(1));
    const [vagaId, corpo] = enviarShortlist.mock.calls[0];
    expect(vagaId).toBe("vaga-1");
    expect(corpo.candidaturaIds).toEqual(["c1"]);
    expect(corpo.motivoReenvioId).toBeUndefined();
    expect(corpo.cienteShortlistCurta).toBe(false);
    await waitFor(() => expect(onEnviada).toHaveBeenCalled());
  });
});

describe("o aviso da lista curta AVISA e não impede", () => {
  it("mostra a pergunta do servidor e reenvia com a ciência no mesmo botão", async () => {
    enviarShortlist
      .mockRejectedValueOnce(
        new ApiError("curta", 409, {
          needsConfirmation: true,
          quantidade: 1,
          minimoSugerido: 3,
          mensagem: "Esta primeira shortlist tem 1 candidato(s).",
        }),
      )
      .mockResolvedValueOnce(enviada(1));
    const { onEnviada } = abrir();

    fireEvent.click(botao("Enviar shortlist"));

    // A PERGUNTA APARECE COM O NÚMERO DENTRO, e o envio NÃO aconteceu ainda.
    await waitFor(() => expect(screen.getByText(/1 candidato/)).toBeTruthy());
    expect(onEnviada).not.toHaveBeenCalled();

    /*
     * ─ A ESPERA É PELO BOTÃO, E NÃO PELO AVISO, E ISSO ERA UMA CORRIDA MEDIDA ────────────────────
     *
     * O aviso e o rótulo do botão voltam em MOMENTOS DIFERENTES: o texto "1 candidato" aparece
     * assim que a recusa é tratada, e o botão só deixa de dizer "Enviando…" quando o estado de
     * envio baixa. Esperando só o texto, o clique caía no intervalo entre os dois e o teste
     * quebrava com "não achei o botão", sem defeito nenhum no componente.
     *
     * MEDIDO ANTES DE CONSERTAR: 2 falhas em 5 execuções do arquivo, o que derrubava o gate inteiro
     * de forma intermitente e mandava quem o visse procurar regressão onde não havia.
     *
     * A ASSERÇÃO NÃO MUDOU, e é isso que torna o conserto seguro: continua sendo "o MESMO botão
     * passa a dizer o que ele faz, e enviar com ele registra a ciência". O que mudou é que a espera
     * passou a ser pelo estado que a PESSOA veria antes de clicar, que é o que o teste sempre quis
     * dizer.
     */
    await waitFor(() => expect(botao("Enviar assim mesmo")).toBeTruthy());
    fireEvent.click(botao("Enviar assim mesmo"));
    await waitFor(() => expect(enviarShortlist).toHaveBeenCalledTimes(2));
    expect(enviarShortlist.mock.calls[1][1].cienteShortlistCurta).toBe(true);
    await waitFor(() => expect(onEnviada).toHaveBeenCalled());
  });

  it("um 409 de OUTRA natureza continua sendo erro, e não vira pergunta", async () => {
    // O caso real: a vaga saiu do processo entre a abertura do formulário e o clique. Tratado como
    // a pergunta, o reenvio com a ciência levaria a um segundo erro.
    enviarShortlist.mockRejectedValueOnce(
      new ApiError("Esta vaga está em Fechada e não recebe shortlist.", 409, {}),
    );
    abrir();

    fireEvent.click(botao("Enviar shortlist"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/não recebe/i));
    expect(screen.queryByRole("button", { name: "Enviar assim mesmo" })).toBeNull();
  });
});

describe("o reenvio", () => {
  it("pede o motivo DO CATÁLOGO e trava o botão enquanto nenhuma linha for escolhida", () => {
    abrir({ enviadas: [enviada(1)] });

    expect(screen.getByText(/Reenvio 2/)).toBeTruthy();
    expect(botao("Enviar shortlist").disabled).toBe(true);

    escolherMotivoDoReenvio();
    expect(botao("Enviar shortlist").disabled).toBe(false);
  });

  it("manda o ID da linha escolhida, e não o nome", async () => {
    // O ID É O DADO E O NOME É A LEITURA: é o id que sustenta a contagem por motivo e sobrevive ao
    // diretor renomear a linha. Mandar o nome faria a contagem quebrar no primeiro ajuste de grafia.
    enviarShortlist.mockResolvedValueOnce(enviada(2));
    abrir({ enviadas: [enviada(1)] });

    escolherMotivoDoReenvio();
    fireEvent.click(botao("Enviar shortlist"));

    await waitFor(() => expect(enviarShortlist).toHaveBeenCalledTimes(1));
    expect(enviarShortlist.mock.calls[0][1].motivoReenvioId).toBe(MOTIVO.id);
  });

  it("recebe o MESMO aviso de lista curta que o primeiro envio (decisão do diretor)", async () => {
    // A RÉGUA ANTIGA SÓ MEDIA A SHORTLIST 1, e o reenvio curto passava calado. Justamente a lista
    // que encolheu porque a vaga perdeu gente é a que precisa da pergunta, e o aviso continua NÃO
    // BLOQUEANTE: o mesmo botão reenvia com a ciência.
    enviarShortlist
      .mockRejectedValueOnce(
        new ApiError("curta", 409, {
          needsConfirmation: true,
          quantidade: 2,
          minimoSugerido: 3,
          mensagem: "Este reenvio tem 2 candidatos.",
        }),
      )
      .mockResolvedValueOnce(enviada(2));
    const { onEnviada } = abrir({ enviadas: [enviada(1)] });

    escolherMotivoDoReenvio();
    fireEvent.click(botao("Enviar shortlist"));

    await waitFor(() => expect(screen.getByText(/2 candidatos/)).toBeTruthy());
    expect(onEnviada).not.toHaveBeenCalled();

    fireEvent.click(botao("Enviar assim mesmo"));
    await waitFor(() => expect(enviarShortlist).toHaveBeenCalledTimes(2));
    expect(enviarShortlist.mock.calls[1][1].cienteShortlistCurta).toBe(true);
    expect(enviarShortlist.mock.calls[1][1].motivoReenvioId).toBe(MOTIVO.id);
    await waitFor(() => expect(onEnviada).toHaveBeenCalled());
  });
});

describe("quem já saiu do processo não vai ao cliente", () => {
  it("nomeia quem tirar da seleção e não deixa enviar", () => {
    abrir({
      selecionadas: [candidatura("c1", "Fulano De Tal"), candidatura("c2", "Beltrana", "DESISTIU")],
    });

    // O nome aparece duas vezes de propósito: na lista de quem vai e no aviso de quem impede.
    expect(screen.getByText(/já saiu do processo/)).toBeTruthy();
    expect(screen.getAllByText(/Beltrana/).length).toBeGreaterThan(0);
    expect(botao("Enviar shortlist").disabled).toBe(true);
  });
});
