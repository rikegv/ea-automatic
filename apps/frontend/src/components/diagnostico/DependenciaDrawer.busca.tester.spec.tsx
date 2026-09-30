// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ─ A BUSCA POR NOME NO MODAL DA FILA DEGRADADA (OST 30/09/2026) ─────────────────────────────────
 *
 * Cobertura INDEPENDENTE (§A.38): escrita a partir do REQUISITO, por quem não escreveu a tela.
 *
 * ┌─ O REQUISITO, como o diretor pediu ──────────────────────────────────────────────────────────┐
 * │ Caixa de pesquisa DENTRO do modal, visível assim que ele abre; busca SÓ por nome (o CPF foi    │
 * │ dispensado); filtro na tela, conforme digita; o resto do modal e o botão de reprocessar        │
 * │ intocados. E, porque a lista não tinha nome, o nome de TODAS as linhas é resolvido de uma vez  │
 * │ ao abrir, por um lote.                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE DE COMPONENTE, E NÃO DE FUNÇÃO ────────────────────────────────────────────────────┐
 * │ Três regras desta caixa só existem no JSX, e nenhum teste de função as alcança:               │
 * │  1. O ÍNDICE DA LISTA FILTRADA. Reprocessar e Limpar agindo no job errado é o erro clássico de │
 * │     lista filtrada, e aqui ele é DESTRUTIVO: o job é o único rastro de um candidato real.      │
 * │  2. LISTA VAZIA POR BUSCA não pode parecer FILA SAUDÁVEL. Este defeito exato já foi corrigido  │
 * │     uma vez no outro modal desta mesma tela, e neste a leitura errada é pior: "a fila zerou".  │
 * │  3. UMA resolução por abertura. Cada ação do modal recarrega a lista; se o lote de nomes for   │
 * │     junto, cada clique gasta 132 requisições numa cota compartilhada com o webhook da FOLHA.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", async () => {
  // A `ApiError` é a de VERDADE: o componente decide a mensagem por `instanceof`, e uma classe falsa
  // faria o teste afirmar o dublê em vez da tela.
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ token: "t", isAdmin: true, usuario: null, temMenu: () => true }),
}));

import { DependenciaDrawer, type Dependencia } from "./DependenciaDrawer";

const DEP: Dependencia = {
  nome: "Fila (BullMQ)",
  estado: "degradado",
  detalhe: "ativos 0, aguardando 0, falhados 3, atrasados 0",
  verificadoEm: "2026-09-30T12:00:00.000Z",
};

/** Três candidatos do Pandapé, um com ACENTO e um com caixa alta: a régua da busca é medida neles. */
const JOBS = [
  { jobId: "j1", nome: "José Álvaro Nogueira", id: "406998" },
  { jobId: "j2", nome: "MARIA DA SILVA SOUZA", id: "421114" },
  { jobId: "j3", nome: "Ana Beatriz Lima", id: "433201" },
];

function estadoDasFilas(jobIds = JOBS.map((j) => j.jobId)) {
  return {
    disponivel: true,
    contagem: { ativos: 0, aguardando: 0, falhados: jobIds.length, atrasados: 0 },
    indisponiveis: [],
    jobs: jobIds.map((jobId, i) => ({
      fila: "pandape-sync",
      jobId,
      nome: "sync-candidate",
      alvo: `Candidato do Pandapé ${JOBS.find((j) => j.jobId === jobId)?.id ?? "000"}`,
      motivo: "CPF ausente no Pandapé",
      tentativas: 5,
      falhouEm: `2026-09-30T1${i}:00:00.000Z`,
      horas: 3 + i,
    })),
  };
}

/** Quem respondeu o quê, por rota. Cada teste ajusta só o que precisa. */
let resposta: {
  filas: () => unknown;
  nomes: () => unknown;
  reprocessar?: () => unknown;
};

/** Toda chamada feita à API, para provar tanto o que foi pedido quanto o que NÃO foi. */
let chamadas: { path: string; opts: { method?: string; body?: unknown } }[] = [];

beforeEach(() => {
  chamadas = [];
  resposta = {
    filas: () => estadoDasFilas(),
    nomes: () => ({
      nomes: JOBS.map((j) => ({ jobId: j.jobId, nome: j.nome })),
      restantes: 0,
    }),
  };
  apiFetch.mockImplementation(async (path: string, opts: { method?: string; body?: unknown } = {}) => {
    chamadas.push({ path, opts });
    if (path.startsWith("/diagnostico/filas/nomes")) return resposta.nomes();
    if (path.startsWith("/diagnostico/filas")) return resposta.filas();
    if (path.includes("reprocessar-job")) {
      return (
        resposta.reprocessar?.() ?? {
          fila: "pandape-sync",
          jobId: String((opts.body as { jobId?: string })?.jobId),
          nome: "sync-candidate",
          desfecho: "FALHOU",
          motivo: "CPF ausente no Pandapé",
          mensagem: "Não puxou: o CPF continua ausente no Pandapé.",
          esperouSegundos: 3,
        }
      );
    }
    if (path.includes("limpar-job")) return { removido: true };
    if (path.includes("testar-dependencia")) return DEP;
    return {};
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function abrir(dep: Dependencia = DEP) {
  const onMudou = vi.fn();
  const onClose = vi.fn();
  const r = render(<DependenciaDrawer dependencia={dep} onClose={onClose} onMudou={onMudou} />);
  return { ...r, onMudou, onClose };
}

const caixaDeBusca = () => screen.getByLabelText(/buscar.*nome/i) as HTMLInputElement;

/**
 * Os cards de job na ordem em que a tela os mostra. Achados pelo botão "Reprocessar", que TODA linha
 * tem, e não pelo motivo da falha: o motivo muda por fila, e uma fila misturada mediria só uma parte.
 */
function linhas(): HTMLElement[] {
  return screen
    .queryAllByText("Reprocessar")
    .map((b) => b.closest(".rounded-xl") as HTMLElement)
    .filter(Boolean);
}

async function abrirComOsTresNomes() {
  const util = abrir();
  await waitFor(() => expect(screen.getByText(JOBS[0].nome)).toBeTruthy());
  return util;
}

describe("a caixa de pesquisa", () => {
  it("está na tela ASSIM QUE o modal abre, sem ninguém rolar nem clicar", async () => {
    abrir();
    // Antes mesmo de a lista chegar, o campo já tem de existir: o diretor abre e digita.
    await waitFor(() => expect(caixaDeBusca()).toBeTruthy());
    expect(caixaDeBusca().value).toBe("");
  });

  it("fica FORA do container que rola, senão ela sumiria justamente enquanto se procura", async () => {
    await abrirComOsTresNomes();
    // Mesmo desenho do outro modal desta tela, e é uma decisão de estrutura, não de estilo: dentro
    // do container de rolagem o campo sai da vista na primeira rolagem da lista.
    expect(caixaDeBusca().closest(".overflow-y-auto")).toBeNull();
  });

  it("a lista traz o NOME de cada linha, senão não há por que buscar", async () => {
    await abrirComOsTresNomes();
    for (const j of JOBS) expect(screen.getByText(j.nome)).toBeTruthy();
  });

  it("o identificador do Pandapé NÃO desaparece: é por ele que se acha a pessoa no ATS", async () => {
    await abrirComOsTresNomes();
    expect(screen.getByText(/Candidato do Pandapé 406998/)).toBeTruthy();
  });
});

describe("o lote de nomes: UMA resolução por abertura", () => {
  it("resolve TODAS as linhas de uma vez, e NÃO uma chamada por linha", async () => {
    await abrirComOsTresNomes();
    const doLote = chamadas.filter((c) => c.path.startsWith("/diagnostico/filas/nomes"));
    const porLinha = chamadas.filter((c) => c.path.includes("/alvo"));
    expect(doLote).toHaveLength(1);
    expect(porLinha).toHaveLength(0);
  });

  it("pede por POST, com os jobIds que a tela está mostrando e SEM o id do pré-colaborador", async () => {
    await abrirComOsTresNomes();
    const lote = chamadas.find((c) => c.path.startsWith("/diagnostico/filas/nomes"));
    expect(lote?.opts.method).toBe("POST");
    expect(lote?.opts.body).toEqual({ jobIds: ["j1", "j2", "j3"] });
    // §A.6: a tela não escolhe o pré-colaborador. Mandar o id externo faria da rota um oráculo de
    // enumeração do ATS, e é o servidor que traduz job -> pré-colaborador.
    expect(JSON.stringify(lote?.opts.body)).not.toContain("idPrecollaborator");
    expect(JSON.stringify(lote?.opts.body)).not.toMatch(/40699|42111|43320/);
  });

  it("REPROCESSAR não refaz o lote de nomes (senão cada clique custa 132 requisições da cota)", async () => {
    await abrirComOsTresNomes();
    fireEvent.click(within(linhas()[0]).getByText("Reprocessar"));
    await waitFor(() => expect(chamadas.some((c) => c.path.includes("reprocessar-job"))).toBe(true));
    await waitFor(() =>
      expect(chamadas.filter((c) => c.path.startsWith("/diagnostico/filas")).length).toBeGreaterThan(1),
    );
    expect(chamadas.filter((c) => c.path.startsWith("/diagnostico/filas/nomes"))).toHaveLength(1);
  });

  it("LIMPAR JOB não refaz o lote de nomes", async () => {
    await abrirComOsTresNomes();
    fireEvent.click(within(linhas()[0]).getByText("Limpar job"));
    fireEvent.click(await screen.findByText("Limpar mesmo assim"));
    await waitFor(() => expect(chamadas.some((c) => c.path.includes("limpar-job"))).toBe(true));
    expect(chamadas.filter((c) => c.path.startsWith("/diagnostico/filas/nomes"))).toHaveLength(1);
  });

  it("TESTAR AGORA não refaz o lote de nomes", async () => {
    await abrirComOsTresNomes();
    fireEvent.click(screen.getByText("Testar agora"));
    await waitFor(() => expect(chamadas.some((c) => c.path.includes("testar-dependencia"))).toBe(true));
    expect(chamadas.filter((c) => c.path.startsWith("/diagnostico/filas/nomes"))).toHaveLength(1);
  });
});

describe("fila MISTURADA: quem nunca teve nome não pode sair calado", () => {
  /**
   * A fila do Diagnóstico soma TRÊS filas, e só a do Pandapé tem nome de candidato. Ciclo automático
   * e job de assinatura nunca terão nome, então TODA busca por nome os esconde, para sempre. Isso é
   * correto, e por isso mesmo tem de ser DITO: sem aviso, quem procura conclui que a fila encolheu.
   */
  function estadoMisturado() {
    const base = estadoDasFilas(["j1"]);
    return {
      ...base,
      contagem: { ...base.contagem, falhados: 2 },
      jobs: [
        ...base.jobs,
        {
          fila: "clicksign-sync",
          jobId: "c9",
          nome: "criar-envelope",
          alvo: "Admissão 640f7bc6",
          motivo: "Clicksign respondeu HTTP 422",
          tentativas: 3,
          falhouEm: "2026-09-30T09:00:00.000Z",
          horas: 6,
        },
      ],
    };
  }

  it("o lote pede nome SÓ dos jobs do Pandapé (os outros seriam cota gasta à toa)", async () => {
    resposta.filas = () => estadoMisturado();
    resposta.nomes = () => ({ nomes: [{ jobId: "j1", nome: JOBS[0].nome }], restantes: 0 });
    abrir();
    await waitFor(() => expect(screen.getByText(JOBS[0].nome)).toBeTruthy());

    const lote = chamadas.find((c) => c.path.startsWith("/diagnostico/filas/nomes"));
    expect(lote?.opts.body).toEqual({ jobIds: ["j1"] });
  });

  it("buscar esconde o job de assinatura, e a tela AVISA que ele ficou fora", async () => {
    resposta.filas = () => estadoMisturado();
    resposta.nomes = () => ({ nomes: [{ jobId: "j1", nome: JOBS[0].nome }], restantes: 0 });
    abrir();
    await waitFor(() => expect(screen.getByText(JOBS[0].nome)).toBeTruthy());
    expect(linhas()).toHaveLength(2);

    fireEvent.change(caixaDeBusca(), { target: { value: "jose" } });
    expect(linhas()).toHaveLength(1);
    const aviso = screen.getByText(/ficou fora desta busca|ficaram fora desta busca/i);
    expect(aviso.textContent).toMatch(/\b1\b/);
  });
});

describe("o filtro, conforme digita", () => {
  it("filtra por NOME sem acento e sem caixa: 'jose' acha 'José'", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "jose" } });

    expect(screen.getByText(JOBS[0].nome)).toBeTruthy();
    expect(screen.queryByText(JOBS[1].nome)).toBeNull();
    expect(screen.queryByText(JOBS[2].nome)).toBeNull();
    expect(linhas()).toHaveLength(1);
  });

  it("caixa alta na lista e minúscula na busca casam: 'maria' acha 'MARIA'", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "maria" } });
    expect(screen.getByText(JOBS[1].nome)).toBeTruthy();
    expect(linhas()).toHaveLength(1);
  });

  it("casa pelo MEIO do nome, não só pelo começo (quase todo mundo busca pelo sobrenome)", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "silva" } });
    expect(linhas()).toHaveLength(1);
    expect(screen.getByText(JOBS[1].nome)).toBeTruthy();
  });

  it("busca com ACENTO digitado também acha o nome sem acento", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "álvaro" } });
    expect(screen.getByText(JOBS[0].nome)).toBeTruthy();
  });

  it("busca VAZIA devolve a lista INTEIRA, intacta", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "jose" } });
    expect(linhas()).toHaveLength(1);
    fireEvent.change(caixaDeBusca(), { target: { value: "" } });
    expect(linhas()).toHaveLength(3);
    for (const j of JOBS) expect(screen.getByText(j.nome)).toBeTruthy();
  });

  it("só ESPAÇO não é busca: a lista continua inteira", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "   " } });
    expect(linhas()).toHaveLength(3);
  });

  it("o CPF foi DISPENSADO pelo diretor: digitar o CPF não acha ninguém", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "00000000191" } });
    expect(linhas()).toHaveLength(0);
  });

  it("o filtro é NA TELA: digitar não dispara chamada nenhuma ao servidor", async () => {
    await abrirComOsTresNomes();
    const antes = chamadas.length;
    fireEvent.change(caixaDeBusca(), { target: { value: "jos" } });
    fireEvent.change(caixaDeBusca(), { target: { value: "jose" } });
    expect(chamadas).toHaveLength(antes);
  });
});

describe("busca sem resultado NÃO pode parecer fila esvaziada", () => {
  it("diz que não achou E repete o total real de falhados", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "zorildo" } });

    expect(linhas()).toHaveLength(0);
    const aviso = screen.getByText(/nenhum nome encontrado/i);
    expect(aviso).toBeTruthy();
    // O número é o que impede a leitura "a fila ficou saudável": ela não ficou.
    expect(aviso.textContent).toMatch(/3/);
  });

  it("a caixa de busca CONTINUA na tela quando o filtro não achou nada", async () => {
    // Sumir com o campo prenderia a pessoa num modal vazio, sem como limpar a busca.
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "zorildo" } });
    expect(caixaDeBusca()).toBeTruthy();
  });

  it("avisa quando há linha SEM nome resolvido ficando fora da busca", async () => {
    // Cota estourada ou Pandapé fora: a linha existe na fila e não casa com busca por nome. Sem o
    // aviso, quem procura conclui que a pessoa não está na fila, e é o mesmo engano com outra causa.
    resposta.nomes = () => ({ nomes: [{ jobId: "j1", nome: JOBS[0].nome }], restantes: 2 });
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "jose" } });
    expect(linhas()).toHaveLength(1);
    // A ASSERÇÃO É DO FATO, NÃO DA REDAÇÃO: a frase deixou de dizer "sem nome RESOLVIDO" porque a
    // mesma linha conta os jobs de ciclo automático, que nunca tiveram nome a resolver, e chamar
    // aquilo de falha de resolução seria acusar um erro que não houve. O que o teste trava continua
    // sendo o comportamento: há aviso, e ele diz quantos ficaram fora.
    expect(screen.getByText(/jobs? sem nome fic(ou|aram) fora desta busca/i)).toBeTruthy();
  });

  it("lote de nomes que falha INTEIRO não apaga a lista de jobs, e avisa", async () => {
    const { ApiError } = await import("@/lib/api");
    resposta.nomes = () => {
      throw new ApiError("Falhou", 500);
    };
    abrir();
    await waitFor(() => expect(linhas()).toHaveLength(3));
    // O aviso chega no ciclo seguinte (a lista vem de uma chamada, o lote de outra), então espera-se
    // por ELE, e não pela lista: asserir na hora mediria a corrida, não a regra.
    await waitFor(() => expect(screen.getByText(/não carregaram|sem nome para buscar/i)).toBeTruthy());
    expect(linhas()).toHaveLength(3);
  });
});

describe("A AÇÃO AGE NO JOB CERTO com a lista FILTRADA (o erro clássico, e destrutivo)", () => {
  it("REPROCESSAR na única linha visível manda o jobId DELA, não o da primeira da lista original", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "ana" } }); // sobra só o j3
    expect(linhas()).toHaveLength(1);

    fireEvent.click(within(linhas()[0]).getByText("Reprocessar"));
    await waitFor(() => expect(chamadas.some((c) => c.path.includes("reprocessar-job"))).toBe(true));

    const acao = chamadas.find((c) => c.path.includes("reprocessar-job"));
    expect(acao?.opts.body).toEqual({ fila: "pandape-sync", jobId: "j3" });
  });

  it("LIMPAR na lista filtrada confirma e remove o job DAQUELA linha", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "maria" } }); // sobra só o j2
    fireEvent.click(within(linhas()[0]).getByText("Limpar job"));

    // A confirmação tem de nomear o alvo certo: é a última chance de ver que se ia apagar outro. A
    // busca é feita DENTRO do painel de confirmação: o mesmo rótulo existe na linha da lista atrás.
    const confirmacao = (await screen.findByText("Limpar Este Job")).closest("div")
      ?.parentElement as HTMLElement;
    expect(within(confirmacao).getByText(/Candidato do Pandapé 421114/)).toBeTruthy();
    expect(within(confirmacao).queryByText(/406998|433201/)).toBeNull();
    fireEvent.click(screen.getByText("Limpar mesmo assim"));

    await waitFor(() => expect(chamadas.some((c) => c.path.includes("limpar-job"))).toBe(true));
    const acao = chamadas.find((c) => c.path.includes("limpar-job"));
    expect(acao?.opts.body).toEqual({ fila: "pandape-sync", jobId: "j2" });
  });

  it("VER DADOS DO ALVO na lista filtrada consulta a linha visível", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "ana" } });
    fireEvent.click(within(linhas()[0]).getByText("Ver dados do alvo"));
    await waitFor(() => expect(chamadas.some((c) => c.path.includes("/alvo"))).toBe(true));
    expect(chamadas.find((c) => c.path.includes("/alvo"))?.path).toContain("/j3/alvo");
  });
});

describe("§A.6: o que se digita na busca não escapa da tela", () => {
  it("o termo não vai para a URL, nem para sessionStorage/localStorage", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "jose alvaro" } });

    expect(window.location.search).not.toContain("jose");
    expect(window.location.hash).not.toContain("jose");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("jose");
    expect(JSON.stringify({ ...localStorage })).not.toContain("jose");
  });

  it("nome nenhum é logado no console", async () => {
    const espioes = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "jose" } });

    for (const espiao of espioes) {
      for (const chamada of espiao.mock.calls) {
        const texto = chamada.map((a) => String(a)).join(" ");
        for (const j of JOBS) expect(texto).not.toContain(j.nome);
      }
      espiao.mockRestore();
    }
  });
});

describe("§A.11 e §A.24 nos textos novos", () => {
  it("nenhum travessão em nenhum texto do modal, com e sem busca ativa", async () => {
    const { container } = await abrirComOsTresNomes();
    expect(document.body.textContent ?? "").not.toContain("—");
    fireEvent.change(caixaDeBusca(), { target: { value: "zorildo" } });
    expect(document.body.textContent ?? "").not.toContain("—");
    expect(container.textContent ?? "").not.toContain("—");
  });

  it("o placeholder da busca é frase de apoio, não etiqueta: escrita normal", async () => {
    // §A.24: título e tag vão em Title Case; placeholder é apoio, então "Buscar por nome" e não
    // "Buscar Por Nome". Mesmo texto do outro modal desta tela, para as duas buscas não divergirem.
    await abrirComOsTresNomes();
    expect(caixaDeBusca().placeholder).toBe("Buscar por nome");
  });
});

describe("o resto do modal segue INTOCADO (§A.14)", () => {
  it("os quatro blocos continuam lá, com a busca no meio do caminho", async () => {
    await abrirComOsTresNomes();
    for (const titulo of ["O que é", "O que está acontecendo", "Desde quando", "O que fazer"]) {
      expect(screen.getByText(titulo)).toBeTruthy();
    }
  });

  it("o desfecho do reprocesso continua aparecendo, e não é engolido pelo filtro", async () => {
    await abrirComOsTresNomes();
    fireEvent.change(caixaDeBusca(), { target: { value: "ana" } });
    fireEvent.click(within(linhas()[0]).getByText("Reprocessar"));
    expect(await screen.findByText("Não Puxou")).toBeTruthy();
  });

  it("dependência que NÃO é fila não ganha caixa de busca", async () => {
    abrir({ ...DEP, nome: "Google Drive", estado: "ok", detalhe: "conta de serviço respondeu" });
    await waitFor(() => expect(screen.getByText("Google Drive")).toBeTruthy());
    expect(screen.queryByLabelText(/buscar.*nome/i)).toBeNull();
  });
});
