// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PainelDeAjuda } from "./PainelDeAjuda";
import { ARTIGOS, artigosDaRota } from "@/ajuda/registro";

/**
 * ─ A BUSCA DENTRO DO PAINEL LATERAL ────────────────────────────────────────────────────────────
 *
 * O buraco que estas afirmações fecham foi achado no uso: o painel abria com o artigo da tela e,
 * para achar qualquer outra coisa, a pessoa tinha de ROLAR. O que se mede aqui é o uso inteiro, e
 * não a existência do campo: digitar acha, limpar volta ao artigo da tela SEM fechar o painel, e as
 * duas saídas de teclado continuam a um toque (§A.41).
 *
 * As afirmações não dependem de QUANTOS artigos existem. Elas procuram por termo de um artigo REAL
 * do registro, resolvido em tempo de teste, para a busca continuar provada com 3 ou com 300.
 */

afterEach(cleanup);

// A lista dos artigos abre um link do Next, que precisa do roteador.
vi.mock("next/navigation", () => ({ usePathname: () => "/esteira" }));

/**
 * ─ O PAINEL RECEBE OS ARTIGOS POR PROPRIEDADE, E É ASSIM QUE ELE É MEDIDO ──────────────────────
 *
 * ┌─ POR QUE AQUI NÃO SE AFIRMA QUANTOS ARTIGOS A ESTEIRA TEM ───────────────────────────────────┐
 * │ O manual tem 196 peças aprovadas e elas pousam EM ONDAS. Estas afirmações passavam a lista       │
 * │ inteira da rota e liam `[0]`, contando com a Esteira ter UM artigo; na primeira onda de padrões  │
 * │ ela passou a ter onze, o painel passou a abrir na LISTA (que é o comportamento certo com vários) │
 * │ e três afirmações caíram sem nada estar quebrado.                                               │
 * │                                                                                                │
 * │ O painel tem dois caminhos de propósito, e os dois são medidos aqui: com UM artigo ele abre      │
 * │ direto nele; com VÁRIOS ele abre na lista, porque adivinhar qual a pessoa queria é pior do que   │
 * │ perguntar. Então cada afirmação diz de qual caminho ela fala, em vez de depender do tamanho do   │
 * │ inventário.                                                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const artigosDaEsteira = artigosDaRota("/esteira");
/** O caminho de UM artigo, escrito à mão para não depender de quantos a rota tem hoje. */
const UM = [artigosDaEsteira[0]];

function abrir(aoFechar = () => {}, artigos = UM) {
  return render(<PainelDeAjuda artigos={artigos} aoFechar={aoFechar} />);
}

function campo() {
  return screen.getByRole("searchbox", { name: "Procurar na Central De Ajuda" });
}

/**
 * O CARTÃO DE UM RESULTADO, achado pelo texto e não por nome acessível: o nome do botão junta módulo,
 * título e o trecho que bateu, e com o manual crescendo uma expressão regular sobre isso passa a
 * casar mais de um cartão. O que se procura é o cartão daquele artigo, então é o título que decide.
 */
function cartaoDe(titulo: string) {
  return screen.getAllByRole("button").find((b) => b.textContent?.includes(titulo));
}

describe("o painel lateral de ajuda tem a sua própria busca", () => {
  it("abre no artigo da tela e com o campo de busca à vista, sem rolar", () => {
    abrir();
    expect(screen.getByRole("heading", { name: UM[0].titulo })).toBeTruthy();
    expect(campo()).toBeTruthy();
    // O foco abre no campo: quem abre a ajuda no meio de uma tarefa digita em seguida.
    expect(document.activeElement).toBe(campo());
  });

  /**
   * COM VÁRIOS ARTIGOS NA MESMA TELA, o painel abre na LISTA e o campo continua no topo: é o caminho
   * que a primeira onda de padrões tornou o comum, porque a mesma tela passou a ter o artigo dela mais
   * os padrões que valem nela.
   */
  it("com vários artigos da mesma tela, abre na lista e não escolhe por conta própria", () => {
    abrir(() => {}, artigosDaEsteira.slice(0, 3));
    expect(screen.getByRole("heading", { name: "Artigos Desta Tela" })).toBeTruthy();
    expect(campo()).toBeTruthy();
  });

  it("acha artigo de OUTRA tela ali mesmo, pela mesma régua da página", () => {
    abrir();
    // Termo de um artigo que NÃO é o da tela aberta: é isso que exigia rolar antes.
    const outro = ARTIGOS.find((a) => !a.rotas.includes("/esteira"));
    expect(outro).toBeTruthy();
    fireEvent.change(campo(), { target: { value: outro!.titulo } });
    expect(cartaoDe(outro!.titulo)).toBeTruthy();
  });

  it("abre o resultado no painel e volta aos resultados sem refazer a busca", () => {
    abrir();
    const outro = ARTIGOS.find((a) => !a.rotas.includes("/esteira"))!;
    fireEvent.change(campo(), { target: { value: outro.titulo } });
    fireEvent.click(cartaoDe(outro.titulo)!);
    expect(screen.getByRole("heading", { name: outro.titulo })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Voltar aos resultados" }));
    expect(cartaoDe(outro.titulo)).toBeTruthy();
  });

  it("limpar a busca devolve o artigo da tela, e o painel continua aberto", () => {
    const aoFechar = vi.fn();
    abrir(aoFechar);
    fireEvent.change(campo(), { target: { value: "catalogo" } });
    fireEvent.click(screen.getByRole("button", { name: "Limpar a busca" }));

    expect(screen.getByRole("heading", { name: UM[0].titulo })).toBeTruthy();
    expect(aoFechar).not.toHaveBeenCalled();
    expect((campo() as HTMLInputElement).value).toBe("");
  });

  it("Escape com busca escrita limpa a busca; Escape com o campo vazio fecha o painel", () => {
    const aoFechar = vi.fn();
    abrir(aoFechar);

    fireEvent.change(campo(), { target: { value: "catalogo" } });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(aoFechar).not.toHaveBeenCalled();
    expect((campo() as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { name: UM[0].titulo })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("não fecha por clique fora, nem no que está atrás do painel (§A.41)", () => {
    const aoFechar = vi.fn();
    abrir(aoFechar);
    fireEvent.click(document.body);
    expect(aoFechar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("o vazio diz o tamanho real do manual e não promete artigo futuro", () => {
    abrir();
    fireEvent.change(campo(), { target: { value: "zzzznaoexiste" } });

    const vazio = screen.getByText("Nada Encontrado").closest("div")!;
    expect(vazio.textContent).toContain(String(ARTIGOS.length));
    expect(vazio.textContent).not.toMatch(/em breve/i);
    // §A.11: nenhum travessão em texto de usuário.
    expect(vazio.textContent).not.toContain("—");
  });
});
