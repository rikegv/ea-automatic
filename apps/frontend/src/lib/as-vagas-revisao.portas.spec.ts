import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiOptions } from "@/lib/api";

/**
 * ─ AS PORTAS DE REDE DA FILA DE VAGAS PENDENTES DE REVISÃO ─────────────────────────────────────
 *
 * O QUE FALTAVA. `as-vaga-revisao.spec.ts` mede a régua de decisão (`reguaDeLiberacao`), que é
 * texto e booleano. As funções que FALAM COM O SERVIDOR não eram afirmadas por ninguém:
 * caminho, método e corpo passavam por nenhum teste.
 *
 * O DEFEITO CONCRETO QUE PASSARIA SEM ESTE ARQUIVO: `liberarVagaPendenteRevisao` deixar de mandar
 * o `codCliente` no corpo. A trava de verdade é do SERVIDOR (a tela só avisa), então a liberação
 * seria recusada lá, a vaga continuaria na fila, e NADA ficaria vermelho aqui: a função devolve
 * `Promise<void>` e a tela não tem como saber que o corpo saiu capenga.
 *
 * ESTE ARQUIVO É COBERTURA, E SÓ. Ele afirma o contrato que o módulo JÁ tem hoje, sem pedir
 * comportamento novo: nenhuma linha de `as-vagas-revisao.ts` muda por causa dele.
 *
 * §A.6: aqui só transitam vaga, cliente e cargo. Nenhum dado pessoal de candidato.
 */

const apiFetch = vi.fn();

vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

type Porta = typeof import("./as-vagas-revisao");
let porta: Porta;

/** A chamada que o dublê registrou, no formato que o `apiFetch` de verdade recebe. */
function chamada(i = 0): { caminho: string; opcoes: ApiOptions } {
  const [caminho, opcoes] = apiFetch.mock.calls[i] as [string, ApiOptions | undefined];
  return { caminho, opcoes: opcoes ?? {} };
}

beforeEach(async () => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue(undefined);
  porta = await import("./as-vagas-revisao");
});

describe("as leituras: caminho fixo, sem método (GET) e sem corpo", () => {
  /**
   * A FILA É SERVIDA RECORTADA PELO SERVIDOR, e o caminho é o contrato desse recorte. Trocar a rota
   * sem trocar o backend devolveria 404, mas trocá-la por uma rota IRMÃ que existe (a Central de
   * Vagas inteira, por exemplo) devolveria 200 com a lista ERRADA, que é a falha silenciosa.
   */
  it("a fila chama `/as/vagas/pendentes-revisao`, sem corpo, levando o token", async () => {
    apiFetch.mockResolvedValue([{ id: "v1" }]);
    const fila = await porta.carregarFilaDeRevisao("tk");

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const { caminho, opcoes } = chamada();
    expect(caminho).toBe("/as/vagas/pendentes-revisao");
    expect(opcoes.method).toBeUndefined();
    expect(opcoes.body).toBeUndefined();
    expect(opcoes.token).toBe("tk");
    // A LEITURA É REPASSADA CRUA: a fila NÃO é refiltrada aqui, senão nasce a segunda régua.
    expect(fila).toEqual([{ id: "v1" }]);
  });

  /**
   * AS LIBERADAS SÃO OUTRA ROTA, e a distinção importa: a fila é o estado "pendente", as liberadas
   * já saíram dele. Se as duas funções apontassem para o mesmo caminho, a tela de correção do
   * Master listaria as pendentes e nunca acharia a vaga liberada por engano.
   */
  it("as liberadas chamam a rota IRMÃ `/liberadas`, e não a da fila", async () => {
    await porta.carregarLiberadasDaRevisao("tk");

    const { caminho, opcoes } = chamada();
    expect(caminho).toBe("/as/vagas/pendentes-revisao/liberadas");
    expect(caminho).not.toBe("/as/vagas/pendentes-revisao");
    expect(opcoes.method).toBeUndefined();
    expect(opcoes.body).toBeUndefined();
  });

  /**
   * O CONTADOR TRATA A RESPOSTA: o servidor devolve `{ count }` e a tela quer o NÚMERO. Sem esta
   * afirmação, devolver o objeto inteiro por engano viraria um badge escrito `[object Object]`, ou
   * `NaN` na primeira conta, e o typecheck não pega porque o genérico é quem descreve o corpo.
   */
  it("a contagem chama `/contagem` e DESEMBRULHA o `count` da resposta", async () => {
    apiFetch.mockResolvedValue({ count: 7 });
    const n = await porta.contarPendentesDeRevisao("tk");

    expect(chamada().caminho).toBe("/as/vagas/pendentes-revisao/contagem");
    expect(chamada().opcoes.method).toBeUndefined();
    expect(n).toBe(7);
    expect(typeof n).toBe("number");
  });

  it("zero é preservado como zero, e não some num `??` distraído", async () => {
    apiFetch.mockResolvedValue({ count: 0 });
    expect(await porta.contarPendentesDeRevisao(null)).toBe(0);
  });
});

describe("a liberação: POST com o FORMULÁRIO INTEIRO no corpo", () => {
  /** O formulário como a trilha o monta, no tamanho que basta para afirmar o contrato. */
  const FORMULARIO = {
    codCliente: "51525",
    codigo: "511805",
    nomeDivulgacao: "Auxiliar de Limpeza",
    cargoId: "cg-1",
    posicoesOficiais: 2,
    natureza: "EFETIVA",
    sazonalidade: "OPERACAO_PADRAO",
    linhaServicoId: 3,
    dataAbertura: "2026-09-18",
    dataLimite: "2026-09-30",
  };

  /**
   * ─ O CASO QUE ORIGINOU O ARQUIVO, AGORA COM O CORPO INTEIRO ──────────────────────────────────
   * O `codCliente` no corpo É a liberação: é ele que vincula o cliente que a varredura do Pandapé
   * não tinha como trazer. Sem ele o servidor recusa, a vaga fica na fila, e a tela não mostra nada.
   * Os demais campos são o resto do que o ATS não manda, e eles saem NA MESMA chamada.
   */
  it("manda POST em `/as/vagas/{id}/liberar-revisao` com o formulário inteiro no corpo", async () => {
    await porta.liberarVagaPendenteRevisao("vaga-1", FORMULARIO, "tk");

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const { caminho, opcoes } = chamada();
    expect(caminho).toBe("/as/vagas/vaga-1/liberar-revisao");
    expect(opcoes.method).toBe("POST");
    expect(opcoes.body).toEqual(FORMULARIO);
    expect((opcoes.body as Record<string, unknown>).codCliente).toBe("51525");
    expect(opcoes.token).toBe("tk");
  });

  /**
   * ─ O STATUS NÃO VIAJA, E A AUSÊNCIA É A TRAVA ────────────────────────────────────────────────
   * Na fila quem move a vaga é a LIBERAÇÃO, e mais nada: o destino é o papel `ABERTURA`, resolvido
   * pelo catálogo NO SERVIDOR. Um `status` no corpo seria a tela decidindo um movimento que ela não
   * decide, e no `PATCH` irmão ele é ignorado justamente para a vaga não sair da fila por uma rota
   * de edição. Este caso PRENDE a ausência nas duas portas.
   */
  it("nenhuma das duas portas de escrita manda `status` no corpo", async () => {
    await porta.liberarVagaPendenteRevisao("vaga-1", FORMULARIO, "tk");
    await porta.salvarVagaEmRevisao("vaga-1", FORMULARIO, "tk");

    expect(chamada(0).opcoes.body).not.toHaveProperty("status");
    expect(chamada(1).opcoes.body).not.toHaveProperty("status");
  });

  it("o id da vaga vai no CAMINHO, nunca no corpo", async () => {
    await porta.liberarVagaPendenteRevisao("vaga-42", FORMULARIO, null);

    const { caminho, opcoes } = chamada();
    expect(caminho).toContain("vaga-42");
    expect(opcoes.body).not.toHaveProperty("id");
  });

  /**
   * ─ UMA CHAMADA SÓ, e a ausência da segunda é o desenho ────────────────────────────────────────
   * Gravar o formulário e liberar são UM gesto. Fossem duas chamadas, a falha da segunda deixaria a
   * vaga preenchida e ainda na fila, e a retentativa teria de adivinhar em que metade parou.
   */
  it("gravar e liberar é UMA chamada, não duas", async () => {
    await porta.liberarVagaPendenteRevisao("vaga-1", FORMULARIO, "tk");
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  /**
   * ─ O CLIENTE VAZIO: A PORTA NÃO GUARDA, E ISSO É PROPOSITAL ───────────────────────────────────
   * Quem recusa é o SERVIDOR; a régua da tela só impede que o clique seja OFERECIDO. Uma guarda
   * aqui seria uma terceira régua, contornável pela rota, dizendo o que o backend já diz. Este caso
   * PRENDE essa escolha: se alguém acrescentar um `throw` local, este teste fala antes da operação.
   */
  it("corpo sem cliente NÃO é barrado aqui: a chamada sai e o servidor é quem recusa", async () => {
    await porta.liberarVagaPendenteRevisao("vaga-1", { codigo: "511805" }, "tk");

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(chamada().opcoes.body).toEqual({ codigo: "511805" });
  });

  /**
   * O CORPO É UMA CÓPIA do objeto recebido: a porta não guarda a referência do estado da tela, e
   * uma edição posterior no formulário não reescreve um corpo já enviado.
   */
  it("o corpo é cópia, não a referência do formulário da tela", async () => {
    await porta.liberarVagaPendenteRevisao("vaga-1", FORMULARIO, "tk");

    expect(chamada().opcoes.body).not.toBe(FORMULARIO);
    expect(chamada().opcoes.body).toEqual(FORMULARIO);
  });

  /**
   * O ERRO SOBE INTEIRO: a porta não engole a recusa do servidor. Se ela resolvesse a promessa em
   * silêncio, a tela daria a liberação por feita com a vaga ainda na fila. É por este caminho que a
   * LISTA INTEIRA de pendências do 400 chega à tela.
   */
  it("a recusa do servidor PROPAGA, e não vira sucesso silencioso", async () => {
    const recusa = new Error("400");
    apiFetch.mockRejectedValue(recusa);
    await expect(porta.liberarVagaPendenteRevisao("vaga-1", FORMULARIO, "tk")).rejects.toBe(recusa);
  });
});

describe("salvar sem liberar: PATCH na vaga, e ela CONTINUA na fila", () => {
  /**
   * ─ POR QUE ELA É O `PATCH` DE SEMPRE ─────────────────────────────────────────────────────────
   * O service reconhece a vaga no papel `REVISAO`, grava os campos e MANTÉM o status. Apontar esta
   * porta para `liberar-revisao` por engano tiraria a vaga da fila num clique que promete o
   * contrário, e nada ficaria vermelho: as duas devolvem `Promise<void>`.
   */
  it("manda PATCH em `/as/vagas/{id}`, sem `/liberar-revisao` no caminho", async () => {
    await porta.salvarVagaEmRevisao("vaga-7", { codigo: "511805" }, "tk");

    const { caminho, opcoes } = chamada();
    expect(caminho).toBe("/as/vagas/vaga-7");
    expect(caminho).not.toContain("liberar-revisao");
    expect(opcoes.method).toBe("PATCH");
    expect(opcoes.body).toEqual({ codigo: "511805" });
    expect(opcoes.token).toBe("tk");
  });

  it("o corpo é cópia, e o id não vai nele", async () => {
    const corpo = { codigo: "511805" };
    await porta.salvarVagaEmRevisao("vaga-7", corpo, null);

    expect(chamada().opcoes.body).not.toBe(corpo);
    expect(chamada().opcoes.body).not.toHaveProperty("id");
  });

  it("a recusa do servidor PROPAGA também ao salvar sem liberar", async () => {
    const recusa = new Error("409");
    apiFetch.mockRejectedValue(recusa);
    await expect(porta.salvarVagaEmRevisao("vaga-7", {}, "tk")).rejects.toBe(recusa);
  });
});

describe("a correção do Master: POST com os DOIS campos", () => {
  /**
   * OS DOIS CAMPOS VÃO SEMPRE, inclusive quando o cliente é o mesmo, para o servidor não ter de
   * adivinhar. Perder o `devolverParaFila` faria a correção "trocar o cliente e pronto", e a vaga
   * que alguém mandou revisar de novo ficaria fora da fila sem ninguém notar.
   */
  it("manda POST em `/as/vagas/{id}/corrigir-revisao` com `codCliente` e `devolverParaFila`", async () => {
    await porta.corrigirLiberacaoDeRevisao(
      "vaga-9",
      { codCliente: "51525", devolverParaFila: true },
      "tk",
    );

    const { caminho, opcoes } = chamada();
    expect(caminho).toBe("/as/vagas/vaga-9/corrigir-revisao");
    expect(opcoes.method).toBe("POST");
    expect(opcoes.body).toEqual({ codCliente: "51525", devolverParaFila: true });
    expect(opcoes.token).toBe("tk");
  });

  it("`devolverParaFila: false` é enviado como false, e não omitido", async () => {
    await porta.corrigirLiberacaoDeRevisao(
      "vaga-9",
      { codCliente: "51525", devolverParaFila: false },
      null,
    );

    const corpo = chamada().opcoes.body as Record<string, unknown>;
    expect(corpo).toHaveProperty("devolverParaFila", false);
    expect(Object.keys(corpo).sort()).toEqual(["codCliente", "devolverParaFila"]);
  });

  /**
   * O CORPO É UMA CÓPIA do objeto recebido: a porta não guarda referência do que a tela lhe deu, e
   * uma edição posterior no estado da tela não reescreve um corpo já enviado.
   */
  it("o corpo é cópia, não a referência do objeto da tela", async () => {
    const correcao = { codCliente: "51525", devolverParaFila: true };
    await porta.corrigirLiberacaoDeRevisao("vaga-9", correcao, "tk");

    expect(chamada().opcoes.body).not.toBe(correcao);
    expect(chamada().opcoes.body).toEqual(correcao);
  });

  it("a recusa do servidor PROPAGA também na correção", async () => {
    const recusa = new Error("403");
    apiFetch.mockRejectedValue(recusa);
    await expect(
      porta.corrigirLiberacaoDeRevisao("vaga-9", { codCliente: "51525", devolverParaFila: true }, "tk"),
    ).rejects.toBe(recusa);
  });
});

describe("as seis portas, vistas juntas", () => {
  /**
   * TODAS PENDURADAS NO MESMO PREFIXO. Uma rota que escapa do `/as/vagas` é rota de outra frente, e
   * o erro de copiar e colar caminho entre módulos irmãos é exatamente assim que ele se parece.
   */
  it("nenhuma porta sai do prefixo `/as/vagas`", async () => {
    await porta.carregarFilaDeRevisao(null);
    await porta.carregarLiberadasDaRevisao(null);
    apiFetch.mockResolvedValue({ count: 0 });
    await porta.contarPendentesDeRevisao(null);
    apiFetch.mockResolvedValue(undefined);
    await porta.liberarVagaPendenteRevisao("v", { codCliente: "c" }, null);
    await porta.salvarVagaEmRevisao("v", { codCliente: "c" }, null);
    await porta.corrigirLiberacaoDeRevisao("v", { codCliente: "c", devolverParaFila: false }, null);

    expect(apiFetch).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 6; i++) expect(chamada(i).caminho, chamada(i).caminho).toMatch(/^\/as\/vagas\//);
  });

  /**
   * NÃO EXISTE LOTE AQUI, e a ausência é deliberada: a auditoria de segurança vetou aplicar um
   * cliente a centenas de vagas de uma vez. Este caso trava a ausência, que é o tipo de decisão que
   * volta sozinha numa refatoração distraída.
   */
  it("o módulo NÃO exporta nenhuma porta de lote", async () => {
    const exportados = Object.keys(porta);
    for (const nome of exportados) expect(nome.toLowerCase(), nome).not.toContain("lote");
    expect(exportados.filter((n) => typeof (porta as Record<string, unknown>)[n] === "function")
      .sort()).toEqual([
      "carregarFilaDeRevisao",
      "carregarLiberadasDaRevisao",
      "contarPendentesDeRevisao",
      "corrigirLiberacaoDeRevisao",
      "liberarVagaPendenteRevisao",
      "reguaDeLiberacao",
      "salvarVagaEmRevisao",
    ]);
  });
});
