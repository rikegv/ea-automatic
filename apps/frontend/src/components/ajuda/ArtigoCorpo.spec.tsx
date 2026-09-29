// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtigoCorpo } from "./ArtigoCorpo";
import { artigoPorSlug } from "@/ajuda/registro";

/**
 * A TELA DO ARTIGO NÃO SABE NADA SOBRE ALVO, e é isso que este arquivo trava.
 *
 * O `Print` do artigo declara QUAL imagem e O QUE ela mostra; ONDE AS SETAS VÃO é assunto do roteiro,
 * e a seta já vem desenhada dentro do PNG. Se a tela voltar a depender de `alvos` para renderizar,
 * a duplicação volta com ela, e a divergência entre o texto e a imagem volta em silêncio.
 *
 * A segunda afirmação é sobre a Fase 0 não parecer defeito: enquanto o PNG não existe, o passo mostra
 * a legenda, e não um retângulo quebrado.
 */

afterEach(cleanup);
vi.mock("next/navigation", () => ({ usePathname: () => "/ajuda" }));

const artigo = artigoPorSlug("anexar-o-aso-no-exame")!;

describe("o corpo do artigo", () => {
  it("desenha o passo a passo com o gesto de cada passo", () => {
    render(<ArtigoCorpo artigo={artigo} />);
    expect(screen.getByText("Passo A Passo")).toBeTruthy();
    expect(screen.getByText(artigo.passos[0].gesto)).toBeTruthy();
  });

  it("mostra a legenda da imagem, que é o que o artigo declara sobre ela", () => {
    render(<ArtigoCorpo artigo={artigo} />);
    const primeira = artigo.passos.find((p) => p.print)!.print!;
    // A legenda aparece duas vezes de propósito: como texto alternativo da imagem e como texto sob
    // ela. Quem não consegue ver a imagem lê a mesma frase que quem vê.
    expect(screen.getAllByText(primeira.legenda).length).toBeGreaterThan(0);
    const img = screen.getByAltText(primeira.legenda) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(`/ajuda/${artigo.slug}/${primeira.arquivo}`);
  });

  it("desenha as seções de apoio, que é onde o time procura quando travou", () => {
    render(<ArtigoCorpo artigo={artigo} />);
    expect(screen.getByText("Antes De Começar")).toBeTruthy();
    expect(screen.getByText("Se Der Errado")).toBeTruthy();
    expect(screen.getByText("Regras Que Valem Aqui")).toBeTruthy();
    expect(screen.getByText(artigo.seDerErrado[0].sintoma)).toBeTruthy();
  });
});
