// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TelaDeIdentificacao } from "./Identificacao";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40), escrito A PARTIR DO REQUISITO da REPAGINAÇÃO da TELA DE ACESSO
 * do Portal do Candidato. A repaginação é SÓ pele (layout de dois painéis do Designer); a lógica do
 * motor de identificação NÃO pode mudar. Este arquivo TRAVA essa lógica por regressão.
 *
 * O contrato do componente `TelaDeIdentificacao` é a fronteira: ele recebe o handler REAL do motor
 * em `aoIdentificar` (que na página é `identificar`, o `POST /portal/identificar`) e a válvula em
 * `aoPedirAjuda` (`pedirAjuda`, o `POST /portal/recuperacao`). Testar pelo prop prova que o submit
 * continua ligado ao MOTOR, e não a um `router.push` mock que a repaginação poderia ter colado.
 *
 * AS INVARIANTES, do requisito:
 *  1. submit com CPF (11 dígitos) + data válida chama `aoIdentificar` (o handler do motor), 1 vez;
 *  2. a data agora é MASCARADA `dd/mm/aaaa`, e o que chega ao motor é `yyyy-mm-dd`, NUNCA `mm/dd/yyyy`
 *     nem o `dd/mm/aaaa` cru. Dia > 12 prova que a leitura é dd/mm e não mm/dd;
 *  3. o CPF chega ao motor SÓ com dígitos, mesmo digitado com pontuação;
 *  4. a válvula "Não consigo entrar" continua existindo e aciona `aoPedirAjuda`, exibindo o recado;
 *  5. o estado `bloqueado` (teto de tentativas) trava o submit e MANTÉM à vista o erro do servidor e
 *     a válvula do RH;
 *  6. os avisos de erro/sessão do servidor continuam exibidos como vieram (a tela não os reescreve);
 *  7. os ids/labels acessíveis que a automação e o leitor de tela usam permanecem: `#portal-cpf` e
 *     `#portal-nascimento`.
 *
 * §A.6: nenhum CPF/data reais, só dígitos sintéticos. §A.11: sem travessão neste arquivo.
 *
 * NOTA DE ESTADO (medida em 2026-09-24): enquanto a repaginação NÃO tiver trocado o campo de data
 * por um campo MASCARADO `dd/mm/aaaa` que converte para ISO na chamada, as invariantes 1, 2 e 3
 * ficam VERMELHAS: o `<input type="date">` nativo rejeita "10/05/1990" e o submit nem chama o motor.
 * Isso NÃO é regressão, é a pele ainda não aplicada. As invariantes 4 a 7 valem em qualquer pele.
 */

afterEach(cleanup);

const TRAVESSAO = String.fromCharCode(0x2014);

type Props = {
  erro?: string | null;
  aviso?: string | null;
  bloqueado?: boolean;
};

function montar(over: Props = {}) {
  // Tipagem dos parâmetros só para o `.mock.calls[0][1]` (a data) ser afirmável; nenhuma asserção
  // muda com isto. O motor manda (cpf, dataNascimento), então o mock declara os dois.
  const aoIdentificar = vi.fn(async (_cpf: string, _dataNascimento: string) => true);
  const aoPedirAjuda = vi.fn(async () => "Avisamos o RH que voce nao conseguiu entrar.");
  const { container } = render(
    <TelaDeIdentificacao
      aoIdentificar={aoIdentificar}
      aoPedirAjuda={aoPedirAjuda}
      erro={over.erro ?? null}
      aviso={over.aviso ?? null}
      bloqueado={over.bloqueado ?? false}
    />,
  );
  return { aoIdentificar, aoPedirAjuda, container };
}

const campoCpf = () => document.getElementById("portal-cpf") as HTMLInputElement;
const campoNasc = () => document.getElementById("portal-nascimento") as HTMLInputElement;
const formulario = (container: HTMLElement) => container.querySelector("form") as HTMLFormElement;
const valvula = () => screen.getByRole("button", { name: "Não consigo entrar" });

/** Preenche pelos ids que a automação usa, sem depender do tipo do campo (nativo ou mascarado). */
function preencher(cpf: string, nascimento: string) {
  fireEvent.change(campoCpf(), { target: { value: cpf } });
  fireEvent.change(campoNasc(), { target: { value: nascimento } });
}

describe("INVARIANTE 7: os ids/labels que a automação e o leitor de tela usam permanecem", () => {
  it("#portal-cpf e #portal-nascimento existem e têm rótulo acessível", () => {
    montar();
    expect(campoCpf()).toBeTruthy();
    expect(campoNasc()).toBeTruthy();
    // O label associa o campo pelo htmlFor; a automação e o leitor de tela dependem disso.
    expect(screen.getByLabelText("CPF")).toBe(campoCpf());
    expect(screen.getByLabelText(/Data De Nascimento/i)).toBe(campoNasc());
  });

  it("a ação primária 'Entrar' continua sendo o submit do formulário da tela", () => {
    montar();
    const botao = screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement;
    expect(botao.type).toBe("submit");
    // O botão vive DENTRO do formulário de identificação, então o submit dispara `enviar`.
    expect(botao.closest("form")).not.toBeNull();
  });
});

describe("INVARIANTE 1: o submit chama o handler REAL do motor, não um router.push mock", () => {
  it("CPF de 11 dígitos + data válida chama aoIdentificar exatamente uma vez", () => {
    const { aoIdentificar, container } = montar();
    preencher("12345678901", "10/05/1990");
    fireEvent.submit(formulario(container));
    // `enviar` chama `aoIdentificar` SINCRONAMENTE, antes do primeiro await: assert direto.
    expect(aoIdentificar).toHaveBeenCalledTimes(1);
  });
});

describe("INVARIANTE 2: a máscara dd/mm/aaaa vira ISO yyyy-mm-dd, nunca mm/dd/yyyy", () => {
  it("'10/05/1990' chega ao motor como '1990-05-10'", () => {
    const { aoIdentificar, container } = montar();
    preencher("12345678901", "10/05/1990");
    fireEvent.submit(formulario(container));
    expect(aoIdentificar).toHaveBeenCalledWith("12345678901", "1990-05-10");
  });

  it("dia > 12 prova que a leitura é dd/mm e não mm/dd: '25/12/1988' vira '1988-12-25'", () => {
    const { aoIdentificar, container } = montar();
    preencher("12345678901", "25/12/1988");
    fireEvent.submit(formulario(container));
    expect(aoIdentificar).toHaveBeenCalledWith("12345678901", "1988-12-25");
  });

  it("o que chega ao motor NUNCA está em formato brasileiro dd/mm/aaaa", () => {
    const { aoIdentificar, container } = montar();
    preencher("12345678901", "07/09/1995");
    fireEvent.submit(formulario(container));
    expect(aoIdentificar).toHaveBeenCalledTimes(1);
    const data = aoIdentificar.mock.calls[0]?.[1] as string;
    expect(data).not.toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("INVARIANTE 3: o CPF chega ao motor só com dígitos", () => {
  it("digitado com pontuação, submete só os 11 dígitos", () => {
    const { aoIdentificar, container } = montar();
    preencher("123.456.789-01", "10/05/1990");
    fireEvent.submit(formulario(container));
    expect(aoIdentificar).toHaveBeenCalledWith("12345678901", "1990-05-10");
  });
});

describe("INVARIANTE 4: a válvula 'Não consigo entrar' continua e aciona aoPedirAjuda", () => {
  it("existe e, ao clicar, chama aoPedirAjuda e mostra o recado do servidor", async () => {
    const { aoPedirAjuda } = montar();
    expect(valvula()).toBeTruthy();
    fireEvent.click(valvula());
    await waitFor(() => expect(aoPedirAjuda).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Avisamos o RH que voce nao conseguiu entrar."),
    ).toBeTruthy();
  });
});

describe("INVARIANTE 5: o teto de tentativas (bloqueado) trava o submit e mantém as saídas", () => {
  it("bloqueado: os campos e o botão Entrar saem de cena, então o motor fica inalcançável", () => {
    const { aoIdentificar } = montar({ bloqueado: true, erro: "Tentativas demais. Aguarde um pouco." });
    // "Os campos e o botão saem de cena" (Props): sem formulário, não há como chamar o motor.
    expect(campoCpf()).toBeNull();
    expect(campoNasc()).toBeNull();
    expect(screen.queryByRole("button", { name: "Entrar" })).toBeNull();
    expect(aoIdentificar).not.toHaveBeenCalled();
  });

  it("bloqueado: o erro do servidor continua exibido e a válvula do RH continua aberta", () => {
    montar({ bloqueado: true, erro: "Tentativas demais. Aguarde um pouco." });
    expect(screen.getByText("Tentativas demais. Aguarde um pouco.")).toBeTruthy();
    expect(valvula()).toBeTruthy();
  });
});

describe("INVARIANTE 6: os avisos do servidor são exibidos como vieram, sem reescrita", () => {
  it("o erro de não casamento aparece com o texto do servidor", () => {
    const texto = "Não encontramos esses dados. Confira e tente de novo.";
    montar({ erro: texto });
    expect(screen.getByText(texto)).toBeTruthy();
  });

  it("o aviso de sessão vencida aparece quando a identificação reabre", () => {
    const texto = "Sua sessão expirou por segurança. Confirme os seus dados de novo.";
    montar({ aviso: texto });
    expect(screen.getByText(texto)).toBeTruthy();
  });

  it("nenhum texto renderizado nesta tela contém travessão (A.11)", () => {
    const { container } = montar({ erro: "Não encontramos esses dados.", aviso: "Sua sessão expirou." });
    expect(container.textContent ?? "").not.toContain(TRAVESSAO);
  });
});
