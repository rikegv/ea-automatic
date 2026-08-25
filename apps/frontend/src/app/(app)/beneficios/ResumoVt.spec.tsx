// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResumoVt } from "./page";

/**
 * O RESUMO DO VT EM UMA LINHA SÓ (item 2 da OST), e as verdades que ele precisa contar.
 *
 * POR QUE ESTE ARQUIVO EXISTE em vez de só uma screenshot: o caminho do OPTANTE ainda não tem
 * registro real para renderizar. Nenhum formulário optante chegou com os campos estruturados, que só
 * passam a existir quando a função externa gravar o JSON irmão no bucket. Sem este teste, a entrega
 * principal ficaria sem prova nenhuma até aquela peça entrar no ar.
 *
 * AS QUATRO VERDADES, e todas são sobre NÃO MENTIR quando falta dado:
 *  1. optante com valores: a linha soma e nomeia o cartão;
 *  2. NÃO-OPTANTE: frase própria, porque "Ida R$ 0,00" se leria como erro de cadastro;
 *  3. só o arquivo, sem os valores: diz que não sabe, em vez de mostrar zero;
 *  4. sem arquivo: não oferece um botão que não leva a lugar nenhum.
 */

const BASE = {
  versoes: 1,
  anteriores: [],
  optante: true,
  totalIda: "4.70",
  totalVolta: "4.70",
  totalDia: "9.40",
  cartao: "Bilhete Único",
  formularioUrl: "https://drive.google.com/file/d/abc/view",
};

describe("ResumoVt", () => {
  afterEach(() => cleanup());

  it("optante: mostra ida, volta, total do dia e o cartão, em reais", () => {
    render(<ResumoVt vt={BASE} />);
    expect(screen.getByText("R$ 9,40")).toBeTruthy();
    expect(screen.getAllByText("R$ 4,70")).toHaveLength(2);
    expect(screen.getByText("Bilhete Único")).toBeTruthy();
  });

  it("optante: o botão aponta para o arquivo no Drive e abre em outra aba", () => {
    render(<ResumoVt vt={BASE} />);
    const link = screen.getByRole("link", { name: /ver formulário/i }) as HTMLAnchorElement;
    expect(link.href).toBe(BASE.formularioUrl);
    expect(link.target).toBe("_blank");
  });

  it("NÃO-OPTANTE: frase própria, e nenhum valor em tela", () => {
    render(
      <ResumoVt
        vt={{
          ...BASE,
          optante: false,
          totalIda: "0.00",
          totalVolta: "0.00",
          totalDia: "0.00",
          cartao: null,
        }}
      />,
    );
    expect(screen.getByText(/não optou/i)).toBeTruthy();
    // O zero NÃO aparece: ele se leria como "não gasta nada", que é outra afirmação.
    expect(screen.queryByText("R$ 0,00")).toBeNull();
  });

  it("só o arquivo, sem os valores: admite que não sabe em vez de mostrar zero", () => {
    render(
      <ResumoVt
        vt={{
          versoes: 0,
          anteriores: [],
          optante: null,
          totalIda: null,
          totalVolta: null,
          totalDia: null,
          cartao: null,
          formularioUrl: BASE.formularioUrl,
        }}
      />,
    );
    expect(screen.getByText(/valores preenchidos não chegaram/i)).toBeTruthy();
    expect(screen.queryByText(/R\$/)).toBeNull();
    // O arquivo continua alcançável: é o que salva o acervo antigo, que é só PDF.
    expect(screen.getByRole("link", { name: /ver formulário/i })).toBeTruthy();
  });

  it("com UMA versão só, não desenha histórico: não há o que comparar", () => {
    render(<ResumoVt vt={BASE} />);
    expect(screen.queryByText(/envios anteriores/i)).toBeNull();
  });

  it("com REENVIO, lista as versões anteriores, cada uma com a SUA data, valor e documento", () => {
    render(
      <ResumoVt
        vt={{
          ...BASE,
          versoes: 3,
          anteriores: [
            { id: "v2", enviadoEm: "2026-07-10T14:30:00.000Z", totalDia: "8.80", formularioUrl: "https://drive/v2" },
            { id: "v1", enviadoEm: "2026-03-02T09:00:00.000Z", totalDia: "7.60", formularioUrl: null },
          ],
        }}
      />,
    );
    expect(screen.getByText(/envios anteriores/i)).toBeTruthy();
    expect(screen.getByText(/3 envios no total/i)).toBeTruthy();
    // Cada versão leva o SEU valor, e não o da vigente.
    expect(screen.getByText("R$ 8,80")).toBeTruthy();
    expect(screen.getByText("R$ 7,60")).toBeTruthy();
    // A versão com arquivo abre o dela; a sem arquivo não oferece link morto.
    const vers = screen.getAllByRole("link", { name: /^ver$/i }) as HTMLAnchorElement[];
    expect(vers).toHaveLength(1);
    expect(vers[0].href).toBe("https://drive/v2");
    expect(screen.getByText(/sem arquivo/i)).toBeTruthy();
  });

  it("sem arquivo: diz que ainda não foi arquivado, e não oferece botão morto", () => {
    render(<ResumoVt vt={{ ...BASE, formularioUrl: null }} />);
    expect(screen.queryByRole("link", { name: /ver formulário/i })).toBeNull();
    expect(screen.getByText(/ainda não foi arquivado/i)).toBeTruthy();
  });
});
