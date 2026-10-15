// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * O ACESSO POR E-MAIL DO PORTAL, testado pelo COMPORTAMENTO da tela.
 *
 * O que estes testes travam são as PROIBIÇÕES DA AUDITORIA, e não o layout:
 *  1. o passo do e-mail avança para o código SEMPRE, exista ou não o endereço (anti-enumeração), e
 *     em nenhum estado aparece frase que diga que o e-mail não está cadastrado;
 *  2. o passo da identidade NÃO mostra nada da pessoa: nem nome, nem nome mascarado, nem cliente,
 *     nem cargo. Posse de caixa de e-mail não prova identidade;
 *  3. o sucesso NÃO entra no Portal: não existe botão nem link que leve para dentro da trilha;
 *  4. a trava tem frase neutra e não diz qual dado divergiu;
 *  5. o erro do código não diz quantas tentativas restam;
 *  6. §A.6: nada de e-mail, código, CPF ou data de nascimento em `localStorage`/`sessionStorage`.
 *
 * §A.11: nenhum travessão renderizado.
 */

const apiFetch = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { ...real, apiFetch: (...a: unknown[]) => apiFetch(...a) };
});

const { AcessoPorEmail } = await import("./AcessoPorEmail");
const { ApiError } = await import("@/lib/api");

const TRAVESSAO = String.fromCharCode(0x2014);
const EMAIL = "pessoa@empresa.com";
/** Dígitos sintéticos: §A.6, nenhum CPF real em teste. */
const CPF = "12345678901";
const NASCIMENTO = "10/05/1990";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
beforeEach(() => apiFetch.mockReset());

function campo(id: string): HTMLInputElement {
  const el = document.querySelector(`#${id}`);
  if (!el) throw new Error(`campo ${id} não existe na tela`);
  return el as HTMLInputElement;
}

/** Vai do zero até o passo do código. `identificado: true` é o que abre o campo (decisão 14/10). */
async function irAoCodigo() {
  apiFetch.mockResolvedValueOnce({ identificado: true, expiraEmMinutos: 10 });
  render(<AcessoPorEmail />);
  fireEvent.change(campo("portal-acesso-email"), { target: { value: EMAIL } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
  await waitFor(() => expect(campo("portal-acesso-codigo")).toBeTruthy());
}

/** Vai do zero até o passo da identidade, com o bilhete e NADA da pessoa. */
async function irAIdentidade() {
  await irAoCodigo();
  apiFetch.mockResolvedValueOnce({ bilhete: "bilhete-curto", expiraEmMinutos: 5 });
  fireEvent.change(campo("portal-acesso-codigo"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));
  await waitFor(() => expect(campo("portal-acesso-cpf")).toBeTruthy());
}

function preencherIdentidade() {
  fireEvent.change(campo("portal-acesso-cpf"), { target: { value: CPF } });
  fireEvent.change(campo("portal-acesso-nascimento"), { target: { value: NASCIMENTO } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
}

/** Como `irAIdentidade`, mas montando o componente COM as props (ex.: o gancho `aoAbrirSessao`). */
async function irAIdentidadeCom(props: { aoAbrirSessao?: (sessao: string) => void }) {
  apiFetch.mockResolvedValueOnce({ identificado: true, expiraEmMinutos: 10 });
  render(<AcessoPorEmail {...props} />);
  fireEvent.change(campo("portal-acesso-email"), { target: { value: EMAIL } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
  await waitFor(() => expect(campo("portal-acesso-codigo")).toBeTruthy());
  apiFetch.mockResolvedValueOnce({ bilhete: "bilhete-curto", expiraEmMinutos: 5 });
  fireEvent.change(campo("portal-acesso-codigo"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));
  await waitFor(() => expect(campo("portal-acesso-cpf")).toBeTruthy());
}

describe("P2: ACESSO_ABERTO faz o candidato ENTRAR direto, e nunca mente 'link enviado'", () => {
  it("com sessão e gancho: dispara aoAbrirSessao com a sessão e NÃO mostra a tela de link", async () => {
    const aoAbrirSessao = vi.fn();
    await irAIdentidadeCom({ aoAbrirSessao });
    apiFetch.mockResolvedValueOnce({
      situacao: "ACESSO_ABERTO",
      sessao: "SESS-TOKEN",
      expiraEm: "2026-10-15T15:00:00.000Z",
    });
    preencherIdentidade();
    await waitFor(() => expect(aoAbrirSessao).toHaveBeenCalledWith("SESS-TOKEN"));
    // A entrada é da PÁGINA (troca de tela); este componente não exibe "Enviamos O Seu Link".
    expect(document.body.textContent ?? "").not.toContain("Enviamos O Seu Link");
  });

  it("ACESSO_ABERTO SEM o gancho: desfecho NEUTRO (Recebemos), nunca 'Enviamos O Seu Link'", async () => {
    // Defesa contra a tela mentirosa: se o servidor abrir o acesso mas a página não tiver passado o
    // gancho (ou a sessão vier vazia), a tela NÃO pode dizer que enviou um link que nunca saiu.
    await irAIdentidadeCom({});
    apiFetch.mockResolvedValueOnce({
      situacao: "ACESSO_ABERTO",
      sessao: "SESS-TOKEN",
      expiraEm: "2026-10-15T15:00:00.000Z",
    });
    preencherIdentidade();
    await waitFor(() => expect(document.body.textContent ?? "").toContain("Recebemos Os Seus Dados"));
    expect(document.body.textContent ?? "").not.toContain("Enviamos O Seu Link");
    // §A.6: o CPF saiu do estado no desfecho (limparDadosPessoais roda antes de decidir a tela).
    expect(document.querySelector("#portal-acesso-cpf")).toBeNull();
  });
});

describe("1. porta de e-mail: identifica abre o código, nao identifica mostra a mensagem (decisao do diretor 14/10)", () => {
  // DECISÃO DO DIRETOR (14/10/2026): a usabilidade pesou mais que o anti-enumeração. A tela PODE
  // dizer "e-mail não identificado" e NÃO abre o campo do código nesse caso. O custo (revelar se o
  // e-mail existe) é aceito. Ver DIARIO 2026-10-14.
  it("quando o servidor IDENTIFICA (identificado:true), avança para o código", async () => {
    await irAoCodigo();
    expect(apiFetch).toHaveBeenCalledWith("/portal/acesso-email/solicitar", {
      method: "POST",
      body: { email: EMAIL },
    });
  });

  it("quando NÃO identifica (identificado:false), NÃO abre o campo do código e mostra a mensagem + RH", async () => {
    apiFetch.mockResolvedValueOnce({ identificado: false, expiraEmMinutos: 10 });
    render(<AcessoPorEmail />);
    fireEvent.change(campo("portal-acesso-email"), { target: { value: EMAIL } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    await waitFor(() =>
      expect(document.body.textContent?.toLowerCase()).toContain("não identificado"),
    );
    // O campo do código NÃO abre: a pessoa não fica com a sensação de que um código foi enviado.
    expect(document.querySelector("#portal-acesso-codigo")).toBeNull();
    // Fica no passo do e-mail, com o campo do e-mail ainda à vista para corrigir.
    expect(document.querySelector("#portal-acesso-email")).toBeTruthy();
    // E oferece falar com o RH.
    expect(document.body.textContent?.toLowerCase()).toContain("rh");
  });

  it("o passo do CÓDIGO (e-mail identificado) não afirma que o código chegou nem nomeia o e-mail", async () => {
    await irAoCodigo();
    const texto = document.body.textContent?.toLowerCase() ?? "";
    expect(texto).not.toContain("chegou nele");
    // A frase do passo do código é condicional ("se ... estiver cadastrado").
    expect(texto).toContain("estiver cadastrado");
  });

  it("REENVIO que volta identificado:false fica no passo do código, recado neutro, SEM 'não identificado'", async () => {
    // O e-mail JÁ foi identificado (está no passo do código). Um false no "pedir outro código" é
    // teto/trava, não "não existe": a tela não pode virar "e-mail não identificado" nem fechar o campo.
    await irAoCodigo();
    apiFetch.mockResolvedValueOnce({ identificado: false, expiraEmMinutos: 10 });
    fireEvent.click(screen.getByRole("button", { name: "Pedir outro código" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(document.querySelector("#portal-acesso-codigo")).toBeTruthy();
    expect(document.body.textContent?.toLowerCase()).not.toContain("não identificado");
  });

  it("corrigir o e-mail depois de 'não identificado' e identificar abre o campo e limpa a mensagem", async () => {
    apiFetch.mockResolvedValueOnce({ identificado: false, expiraEmMinutos: 10 });
    render(<AcessoPorEmail />);
    fireEvent.change(campo("portal-acesso-email"), { target: { value: EMAIL } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    await waitFor(() =>
      expect(document.body.textContent?.toLowerCase()).toContain("não identificado"),
    );
    apiFetch.mockResolvedValueOnce({ identificado: true, expiraEmMinutos: 10 });
    fireEvent.change(campo("portal-acesso-email"), { target: { value: "outro@exemplo.local" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    await waitFor(() => expect(campo("portal-acesso-codigo")).toBeTruthy());
    expect(document.body.textContent?.toLowerCase()).not.toContain("não identificado");
  });

  it("a porta DESLIGADA (503) é AVISO DE MANUTENÇÃO calmo, e não manda digitar código que nunca vem", async () => {
    apiFetch.mockRejectedValueOnce(new ApiError("Indisponível", 503));
    render(<AcessoPorEmail />);
    fireEvent.change(campo("portal-acesso-email"), { target: { value: EMAIL } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    // AVISO DE MANUTENÇÃO (desenho iii do diretor): tom de STATUS, não de erro vermelho (`alert`).
    // O 503 não é culpa de quem digitou, então a tela diz o que fazer, que é falar com o RH.
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Esta Opção Está Em Manutenção"),
    );
    expect(screen.getByRole("status").textContent).toContain(
      "Fale com o RH que está acompanhando a sua admissão",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    // O comportamento NÃO muda: a tela não avança para o código (mesmo gatilho 503 de antes).
    expect(document.querySelector("#portal-acesso-codigo")).toBeNull();
  });
});

describe("2. o passo do código", () => {
  it("mostra o prazo de validade e o botão de pedir outro", async () => {
    await irAoCodigo();
    expect(document.body.textContent).toContain("O código vale por mais");
    expect(screen.getByRole("button", { name: "Pedir outro código" })).toBeTruthy();
  });

  it("o erro do código é neutro e NÃO diz quantas tentativas restam", async () => {
    await irAoCodigo();
    apiFetch.mockRejectedValueOnce(new ApiError("recusado", 400));
    fireEvent.change(campo("portal-acesso-codigo"), { target: { value: "999999" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar código" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const alerta = screen.getByRole("alert").textContent ?? "";
    expect(alerta).toContain("inválido ou vencido");
    expect(alerta).not.toMatch(/\d+\s*tentativa/i);
    expect(alerta.toLowerCase()).not.toContain("restam");
  });

  it("o teto do pedido de código é recusa com calma, sem número", async () => {
    await irAoCodigo();
    apiFetch.mockRejectedValueOnce(new ApiError("teto", 429));
    fireEvent.click(screen.getByRole("button", { name: "Pedir outro código" }));
    await waitFor(() =>
      expect(document.body.textContent).toContain("Aguarde alguns minutos"),
    );
    expect(document.body.textContent).not.toMatch(/\d+\s*tentativa/i);
  });
});

describe("3. o passo da identidade NÃO mostra nada da pessoa", () => {
  it("pede CPF e data de nascimento, e o corpo leva o bilhete com a data em ISO", async () => {
    await irAIdentidade();
    apiFetch.mockResolvedValueOnce({ situacao: "LINK_ENVIADO" });
    preencherIdentidade();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3));
    expect(apiFetch).toHaveBeenLastCalledWith("/portal/acesso-email/identidade", {
      method: "POST",
      body: { bilhete: "bilhete-curto", cpf: CPF, dataNascimento: "1990-05-10" },
    });
  });

  it("NÃO existe nome, nome mascarado, cliente nem cargo nesta tela", async () => {
    await irAIdentidade();
    const texto = document.body.textContent ?? "";
    // A confirmação do código devolveu SÓ o bilhete: não há dado da pessoa para vazar, e a tela não
    // inventa um "confirme que é você, MARIA S.".
    expect(texto.toLowerCase()).not.toContain("confirme que é você,");
    expect(texto).not.toMatch(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\.$/m);
    expect(texto.toLowerCase()).not.toContain("cliente");
    expect(texto.toLowerCase()).not.toContain("cargo");
    expect(document.body.textContent).toContain("Confirme Seus Dados");
  });
});

describe("4. os desfechos", () => {
  it("LINK_ENVIADO diz EM QUAL CAIXA procurar, sem nenhum caractere do endereço", async () => {
    await irAIdentidade();
    apiFetch.mockResolvedValueOnce({ situacao: "LINK_ENVIADO" });
    preencherIdentidade();
    await waitFor(() => expect(document.body.textContent).toContain("Enviamos O Seu Link"));
    // O FATO NECESSÁRIO, dito inteiro: o link vai para a caixa da ADMISSÃO, que pode não ser a
    // mesma caixa do FUNIL pela qual a pessoa chegou até aqui.
    expect(document.body.textContent).toContain("e-mail cadastrado na sua admissão");
    expect(document.body.textContent).toContain("caixa de spam");
    // NENHUM botão ou link que finja entrar. O único destino humano é o RH.
    const rotulos = Array.from(document.querySelectorAll("button, a")).map((e) =>
      (e.textContent ?? "").toLowerCase(),
    );
    for (const r of rotulos) {
      expect(r).not.toContain("entrar no portal");
      expect(r).not.toContain("acessar");
      expect(r).not.toContain("continuar");
    }
    expect(rotulos.some((r) => r.includes("fale com o rh"))).toBe(true);
  });

  it("DADOS_RECEBIDOS diz que o time segue com a admissão", async () => {
    await irAIdentidade();
    apiFetch.mockResolvedValueOnce({ situacao: "DADOS_RECEBIDOS" });
    preencherIdentidade();
    await waitFor(() => expect(document.body.textContent).toContain("Recebemos Os Seus Dados"));
    expect(document.body.textContent).toContain("o time vai seguir com a sua admissão");
  });

  it("TRAVADO (reservado) é neutro: manda falar com o RH e não diz qual dado divergiu", async () => {
    await irAIdentidade();
    apiFetch.mockRejectedValueOnce(new ApiError("recusado", 409));
    preencherIdentidade();
    await waitFor(() =>
      expect(document.body.textContent).toContain("Precisamos Conferir Com Você"),
    );
    const texto = (document.body.textContent ?? "").toLowerCase();
    expect(texto).toContain("fale com o rh");
    expect(texto).not.toContain("divergente");
    expect(texto).not.toContain("já cadastrado");
    expect(texto).not.toContain("outro candidato");
    expect(texto).not.toContain("data de nascimento não");
  });

  it("A RECUSA REAL (401) mostra a frase DO SERVIDOR, e não a de sessão expirada do EA", async () => {
    // A porta tem DOIS desfechos de erro e só dois: a recusa única e o 503. Dado que não bateu,
    // bilhete vencido e trava chegam IGUAIS aqui, e é isso que fecha o oráculo. O cliente HTTP
    // reescreve o `message` do 401, então a frase autoritativa vem do `mensagem` do CORPO.
    await irAIdentidade();
    apiFetch.mockRejectedValueOnce(
      new ApiError("Sua sessão expirou. Entre novamente para continuar.", 401, {
        mensagem: "Não foi possível continuar. Confira os dados e tente de novo.",
      }),
    );
    preencherIdentidade();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const alerta = screen.getByRole("alert").textContent ?? "";
    expect(alerta).toContain("Não foi possível continuar");
    // O candidato não tem conta no EA: falar de sessão com ele é mandá-lo procurar um login que não
    // existe. Este era o defeito concreto que a leitura do corpo evita.
    expect(alerta.toLowerCase()).not.toContain("sessão");
    // Ele continua no formulário, com o conserto na mão, e tem a saída de começar de novo.
    expect(campo("portal-acesso-cpf")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Começar de novo" })).toBeTruthy();
  });

  it("'Começar de novo' devolve ao passo do e-mail, sem culpar a pessoa", async () => {
    await irAIdentidade();
    fireEvent.click(screen.getByRole("button", { name: "Começar de novo" }));
    await waitFor(() => expect(campo("portal-acesso-email")).toBeTruthy());
    expect(document.querySelector(".pill")).toBeNull();
  });
});

describe("5. §A.6 e §A.11", () => {
  it("nada de e-mail, código, CPF ou data vai para armazenamento do navegador", async () => {
    await irAIdentidade();
    apiFetch.mockResolvedValueOnce({ situacao: "LINK_ENVIADO" });
    preencherIdentidade();
    await waitFor(() => expect(document.body.textContent).toContain("Enviamos O Seu Link"));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("o CPF e a data SAEM da tela quando o desfecho chega", async () => {
    await irAIdentidade();
    apiFetch.mockResolvedValueOnce({ situacao: "DADOS_RECEBIDOS" });
    preencherIdentidade();
    await waitFor(() => expect(document.body.textContent).toContain("Recebemos Os Seus Dados"));
    expect(document.querySelector("#portal-acesso-cpf")).toBeNull();
    expect(document.body.textContent).not.toContain(CPF);
  });

  it('"E-mail" não quebra no hífen em nenhum passo, e o texto não muda', async () => {
    await irAoCodigo();
    // O passo do código fala de e-mail em três frases. Cada ocorrência tem de estar protegida, e é
    // por isso que a régua é uma FUNÇÃO (`emailInteiro`) e não um `<span>` escrito frase por frase.
    const protegidos = Array.from(document.querySelectorAll(".whitespace-nowrap")).map((e) =>
      (e.textContent ?? "").toLowerCase(),
    );
    expect(protegidos).toContain("e-mail");
    // Nenhuma palavra do texto foi trocada por hífen não separável, que estragaria busca e leitor.
    expect(document.body.innerHTML).not.toContain("\u2011");
    expect(document.body.textContent).toContain("e-mail");
  });

  it("nenhum travessão é renderizado em nenhum passo", async () => {
    await irAIdentidade();
    expect(document.body.textContent).not.toContain(TRAVESSAO);
    apiFetch.mockRejectedValueOnce(new ApiError("recusado", 403));
    preencherIdentidade();
    await waitFor(() =>
      expect(document.body.textContent).toContain("Precisamos Conferir Com Você"),
    );
    expect(document.body.textContent).not.toContain(TRAVESSAO);
  });
});

describe("6. NENHUM CARACTERE DE E-MAIL VINDO DA RESPOSTA DA IDENTIDADE, e a ausência é a defesa", () => {
  /**
   * POR QUE ESTA TRAVA EXISTE, e por que ela é sobre o ARGUMENTO e não sobre o campo.
   *
   * O link é enviado para `candidatos.email`, a ficha da ADMISSÃO. Quem chega neste passo provou a
   * posse de `as_candidatos.email`, a ficha do FUNIL, e os dois podem ser endereços DIFERENTES: no
   * caso-alvo desta porta (ficha com `cpf` nulo) ele não provou posse de mais nada. Mostrar a
   * primeira letra, a última e o DOMÍNIO INTEIRO de um endereço cuja posse ninguém provou é entregar
   * dado de terceiro, mesma família do achado que matou a v1.
   *
   * O campo `emailMascarado` já saiu do contrato. Esta trava impede que alguém o reintroduza "para a
   * pessoa saber onde procurar", que é exatamente o argumento simpático que criou o problema.
   */
  it("a tela IGNORA o campo mesmo que o servidor volte a mandá-lo", async () => {
    await irAIdentidade();
    // Resposta ADULTERADA de propósito, com os dois nomes prováveis de um campo assim. Se a tela
    // voltar a ler qualquer um, o endereço aparece na tela e este teste reprova.
    apiFetch.mockResolvedValueOnce({
      situacao: "LINK_ENVIADO",
      emailMascarado: "p****a@empresa-de-terceiro.com",
      email: "pessoa@empresa-de-terceiro.com",
    });
    preencherIdentidade();
    await waitFor(() => expect(document.body.textContent).toContain("Enviamos O Seu Link"));
    const texto = document.body.textContent ?? "";
    expect(texto).not.toContain("empresa-de-terceiro.com");
    expect(texto).not.toContain("p****a");
    // Nenhum arroba na tela: é o jeito mais curto de dizer "nenhum endereço aqui".
    expect(texto).not.toContain("@");
  });

  it("o FONTE não tem por onde renderizar e-mail da resposta da identidade", () => {
    const bruto = readFileSync(
      resolve(process.cwd(), "src/components/portal/AcessoPorEmail.tsx"),
      "utf8",
    );
    //
    // ┌─ VARREDURA DE FONTE OLHA CODIGO, NUNCA COMENTARIO (conserto do coordenador) ──────────────┐
    // │ Este teste reprovava o componente porque o comentario dele EXPLICA por que o e-mail        │
    // │ mascarado foi removido, e a palavra "mascarado" aparece ali. Ou seja, ele punia o arquivo   │
    // │ por DOCUMENTAR a propria regra, que e o oposto do que se quer incentivar. Foi a TERCEIRA    │
    // │ vez que este padrao apareceu nesta frente (antes: o `Math.random` do dominio).              │
    // │                                                                                           │
    // │ REGUA, para toda varredura de fonte daqui para frente: tire comentario de bloco e de linha  │
    // │ ANTES de asserir ausencia. Quem escreve o comentario esta do nosso lado.                    │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    // NENHUM IDENTIFICADOR DE VALOR MASCARADO. A régua é o `Mascarad` com M maiúsculo, que é como a
    // plataforma nomeia esses campos (`emailMascarado`, `destinoMascarado`): ela pega qualquer
    // reintrodução, inclusive por outro nome, e NÃO pega o `mascaraData`, que é a máscara da data
    // digitada e não tem nada a ver com endereço.
    expect(fonte).not.toContain("emailMascarado");
    expect(fonte).not.toMatch(/Mascarad/);
    // O `r` é a resposta da identidade: dela só se lê a `situacao`. Qualquer leitura de e-mail ali
    // seria a reintrodução do campo por outro nome.
    expect(fonte).not.toMatch(/\br\??\.email/);
    // O ÚNICO E-MAIL QUE A TELA CONHECE É O QUE A PRÓPRIA PESSOA DIGITOU, e ele vive no estado do
    // formulário. Ele aparece no `value` do campo dela (que é dado dela, na tela dela) e no corpo da
    // requisição, e NUNCA como texto exibido: nem em conteúdo de JSX, nem interpolado numa frase.
    expect(fonte).not.toMatch(/>\s*\{\s*email\s*\}/);
    expect(fonte).not.toContain("${email}");
    // E o campo dela é UM só: duas ocorrências seriam um segundo lugar por onde o valor sai.
    expect((fonte.match(/value=\{email\}/g) ?? [])).toHaveLength(1);
  });
});
