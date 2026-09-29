// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BotaoDeAjuda } from "./BotaoDeAjuda";
import { PageHead } from "@/components/ui/PageHead";

/**
 * O BOTÃO DE AJUDA É UM ENXERTO NUM COMPONENTE QUE 45 TELAS USAM, e é isso que este arquivo mede.
 *
 * Duas afirmações, e as duas são sobre não estragar o que já existe: o cabeçalho continua mostrando
 * título, eyebrow e subtítulo, e o botão NÃO aparece na tela que ainda não tem artigo. A segunda é a
 * que protege as 45 telas de ganhar um botão que abriria um painel vazio.
 */

// A limpeza é explícita: o projeto não liga o `globals` do vitest, então sem isto o segundo
// render soma ao primeiro e a busca por papel acha dois botões.
afterEach(cleanup);

/**
 * A ROTA SEM ARTIGO É UMA QUE O MOTOR NÃO ALCANÇA HOJE, e não uma tela grande qualquer. O manual tem
 * 196 peças aprovadas, pousando em ondas: o `/gerenciador` estava aqui como exemplo de "tela sem
 * artigo" e, na primeira onda de padrões, ganhou quatro artigos, derrubando a afirmação. O que se
 * mede é a PROPRIEDADE (rota sem artigo não acende o botão), então quando um artigo ancorar nesta
 * rota, troque a rota e não a afirmação.
 */
const SEM_ARTIGO = "/admin/menu-areas";

const rotaAtual = vi.hoisted(() => ({ valor: "/admin/menu-areas" }));
vi.mock("next/navigation", () => ({ usePathname: () => rotaAtual.valor }));

describe("o botão de ajuda dentro do cabeçalho das telas", () => {
  it("não aparece na tela que ainda não tem artigo", () => {
    rotaAtual.valor = SEM_ARTIGO;
    render(<PageHead eyebrow="Configuração" title="Áreas De Menu" subtitle="Agrupa os menus." />);
    expect(screen.queryByRole("button", { name: "Abrir a ajuda desta tela" })).toBeNull();
  });

  it("aparece na tela que tem artigo, sem tirar nada do cabeçalho", () => {
    rotaAtual.valor = "/as/vagas";
    render(
      <PageHead
        eyebrow="Atração e Seleção"
        title="Central De Vagas"
        subtitle="Cada linha é uma vaga."
      />,
    );
    expect(screen.getByRole("heading", { name: "Central De Vagas" })).toBeTruthy();
    expect(screen.getByText("Atração e Seleção")).toBeTruthy();
    expect(screen.getByText("Cada linha é uma vaga.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir a ajuda desta tela" })).toBeTruthy();
  });

  it("fora de qualquer cabeçalho, ele decide sozinho pela rota", () => {
    rotaAtual.valor = "/esteira";
    render(<BotaoDeAjuda />);
    expect(screen.getByRole("button", { name: "Abrir a ajuda desta tela" })).toBeTruthy();
  });
});
