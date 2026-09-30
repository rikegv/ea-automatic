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
 * A ROTA SEM ARTIGO É UMA QUE NÃO EXISTE, e essa escolha é o conserto de um defeito que já apareceu
 * DUAS vezes. O que se mede é a PROPRIEDADE (rota sem artigo não acende o botão), e a rota usada como
 * exemplo é só o veículo dela.
 *
 * ┌─ AS DUAS VEZES, E A CONCLUSÃO QUE ELAS FORÇAM ──────────────────────────────────────────────┐
 * │ Primeiro foi o `/gerenciador`, que ganhou quatro artigos na onda dos padrões. Trocou-se por    │
 * │ `/admin/menu-areas`, e em 30/09/2026 ELE TAMBÉM ganhou artigo, na onda dos catálogos. O teste  │
 * │ quebrou de novo, e quebrou por SUCESSO: o manual cobriu mais uma tela.                         │
 * │                                                                                                │
 * │ COM O INVENTÁRIO CAMINHANDO PARA COBRIR O SISTEMA INTEIRO, toda tela real vai ganhar artigo um │
 * │ dia. Escolher outra tela real só marca a data do próximo vermelho. Uma rota que NÃO EXISTE     │
 * │ nunca ganha artigo, e o detector de rota morta impede que alguém a declare por engano, então   │
 * │ ela é o único exemplo que não envelhece.                                                       │
 * │                                                                                                │
 * │ É a mesma correção já aplicada hoje em `ajuda/busca.spec.ts`, pelo mesmo motivo. Quando o       │
 * │ mesmo conserto serve a dois arquivos, ele deixou de ser conserto e virou a régua.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const SEM_ARTIGO = "/rota-que-nao-existe-e-nunca-vai-existir";

const rotaAtual = vi.hoisted(() => ({ valor: "/rota-que-nao-existe-e-nunca-vai-existir" }));
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
