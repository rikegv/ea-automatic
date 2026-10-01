// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EntradaSemLink } from "./EntradaSemLink";

/**
 * A ENTRADA ABRE NO E-MAIL, e A PROVA DE QUE O CAMINHO DO LINK NÃO MUDOU.
 *
 * Desenho iii do diretor (e-mail primeiro): a entrada de quem chega SEM o link abre direto no passo
 * do e-mail, que é o caminho da maioria, e "Já tenho o link" vira um atalho secundário. A segunda
 * parte deste arquivo é a que importa mais, e é por isso que ele lê o FONTE da página: a régua dura
 * da entrega é "com o fragmento do link presente, a tela abre direto na identificação de hoje, byte a
 * byte idêntica". O jeito de travar isso por regressão não é renderizar a página inteira (que depende
 * de fragmento, `sessionStorage` e rede), é provar que a entrada aparece em UM lugar só, o estado
 * `semFragmento`, e que nenhum outro estado do render foi tocado.
 *
 * §A.11: sem travessão.
 */

afterEach(cleanup);

vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { ...real, apiFetch: vi.fn() };
});

const INSTRUCAO = (
  <div data-testid="instrucao-do-link">
    <h1>Abra O Link De Novo</h1>
    <p>
      Esta página só abre pelo link que você recebeu no WhatsApp ou no e-mail. Toque nesse mesmo link
      de novo e você continua de onde parou.
    </p>
  </div>
);

describe("a entrada abre no e-mail, e o link é o atalho secundário", () => {
  it("abre DIRETO no passo do e-mail, sem a escolha de dois cartões", () => {
    render(<EntradaSemLink instrucaoDoLink={INSTRUCAO} />);
    // O formulário do e-mail É a entrada: a maioria chega sem link, então não há pergunta antes dele.
    expect(document.querySelector("#portal-acesso-email")).toBeTruthy();
    // A instrução do link NÃO aparece antes de a pessoa pedir aquele caminho.
    expect(screen.queryByTestId("instrucao-do-link")).toBeNull();
    // E o atalho secundário de quem já tem o link está presente na entrada.
    expect(screen.getByRole("button", { name: "Já tenho o link" })).toBeTruthy();
  });

  it("'Já tenho o link' mostra a instrução DE SEMPRE, recebida pronta e não reescrita", () => {
    render(<EntradaSemLink instrucaoDoLink={INSTRUCAO} />);
    fireEvent.click(screen.getByRole("button", { name: "Já tenho o link" }));
    expect(screen.getByTestId("instrucao-do-link")).toBeTruthy();
    expect(document.body.textContent).toContain("Abra O Link De Novo");
    expect(document.body.textContent).toContain("Toque nesse mesmo link de novo");
    // No caminho do link, o formulário do e-mail sai de cena.
    expect(document.querySelector("#portal-acesso-email")).toBeNull();
  });

  it("o 'Voltar' do caminho do link devolve para o passo do e-mail", () => {
    render(<EntradaSemLink instrucaoDoLink={INSTRUCAO} />);
    fireEvent.click(screen.getByRole("button", { name: "Já tenho o link" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(document.querySelector("#portal-acesso-email")).toBeTruthy();
    expect(screen.queryByTestId("instrucao-do-link")).toBeNull();
  });

  it("não renderiza travessão (§A.11)", () => {
    render(<EntradaSemLink instrucaoDoLink={INSTRUCAO} />);
    expect(document.body.textContent).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("O CAMINHO DO LINK CONTINUA INTACTO, provado sobre o fonte da página", () => {
  // A raiz do vitest é `apps/frontend` (o `vitest.config.ts` mora lá). `import.meta.url` não serve
  // aqui: no ambiente de DOM ele não é uma URL de arquivo.
  const fonte = readFileSync(resolve(process.cwd(), "src/app/portal/page.tsx"), "utf8");

  it("a escolha aparece UMA vez, e dentro do estado `semFragmento`", () => {
    const usos = fonte.match(/<EntradaSemLink/g) ?? [];
    expect(usos).toHaveLength(1);

    const inicio = fonte.indexOf("if (semFragmento) {");
    const fim = fonte.indexOf("if (erroFatal) {");
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    const bloco = fonte.slice(inicio, fim);
    expect(bloco).toContain("<EntradaSemLink");
  });

  it("nenhum outro estado do render foi tocado pela porta de e-mail", () => {
    // O `AcessoPorEmail` não é referenciado pela página: quem o monta é a escolha, e só ela.
    expect(fonte).not.toContain("AcessoPorEmail");

    // As telas de sempre continuam onde estavam, na mesma ordem de precedência do render.
    const ordem = [
      "if (semFragmento) {",
      "if (erroFatal) {",
      "if (linkToken === null) {",
      "if (!sessao) {",
      "if (carregando) {",
    ].map((t) => fonte.indexOf(t));
    for (const i of ordem) expect(i).toBeGreaterThan(-1);
    expect([...ordem]).toEqual([...ordem].sort((a, b) => a - b));

    // A IDENTIFICAÇÃO segue recebendo exatamente os mesmos props do motor: a porta de e-mail não
    // emite sessão, então nada nesta chamada podia mudar.
    const i = fonte.indexOf("<TelaDeIdentificacao");
    expect(i).toBeGreaterThan(-1);
    const chamada = fonte.slice(i, fonte.indexOf("/>", i));
    for (const prop of [
      "aoIdentificar={identificar}",
      "aoPedirAjuda={pedirAjuda}",
      "erro={erroIdentificacao}",
      "aviso={avisoSessao}",
      "bloqueado={bloqueado}",
    ]) {
      expect(chamada).toContain(prop);
    }
  });

  it("a leitura do fragmento do link segue sendo a do contrato, e ainda apaga a barra", () => {
    expect(fonte).toContain("PORTAL_FRAGMENTO_LINK");
    expect(fonte).toContain("window.history.replaceState");
    // Com fragmento, `semFragmento` NÃO liga: é o `else if (!link)` que o liga. Se alguém trocar
    // essa condição, o caminho do link passa a cair na escolha, que é justamente o que não pode.
    expect(fonte).toContain("} else if (!link) {\n      setSemFragmento(true);");
  });
});
