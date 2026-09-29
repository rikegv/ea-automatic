// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultadosDaBusca } from "./BuscaDeAjuda";
import { ARTIGOS } from "@/ajuda/registro";
import { buscar, indexar, normalizar } from "@/ajuda/busca";

/**
 * ─ O QUE A TELA MOSTRA QUANDO O CASAMENTO É SÓ UMA MENÇÃO ──────────────────────────────────────
 *
 * O defeito que estas afirmações fecham foi achado pelo diretor testando: procurar "auditoria"
 * devolvia "Anexar O ASO Na Aba Exame", que é um artigo sobre EXAME, apresentado como resposta. A
 * palavra está escrita lá, então achar estava certo; o que faltava era a tela DIZER de onde veio o
 * casamento. Menção vendida como resposta é pior que "nada encontrado", que pelo menos dizia a
 * verdade: a pessoa abre, lê doze passos sobre ASO e conclui que o manual é ruim.
 *
 * ┌─ AS CONSULTAS SÃO DESCOBERTAS NO CONTEÚDO REAL, E NÃO ESCRITAS À MÃO ────────────────────────┐
 * │ O inventário aprovado é de 196 peças e pousa EM ONDAS. Uma consulta escrita à mão aqui muda de   │
 * │ classe a cada onda: "auditoria" era só menção com 3 artigos e, na Fase 1, passou a ter também    │
 * │ quem ensina, porque a coluna Auditoria virou controle de um artigo de padrão. Fixar a palavra    │
 * │ obrigaria a próxima sessão a afrouxar a afirmação, até ela não medir mais nada.                  │
 * │                                                                                               │
 * │ Então o teste PROCURA, no conteúdo de verdade, uma consulta de cada classe (só menção, e mista) │
 * │ e falha alto se ela não existir. O que se afirma é o COMPORTAMENTO DA TELA em cada classe, que é │
 * │ o que não muda com o tamanho do manual.                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

afterEach(cleanup);
vi.mock("next/navigation", () => ({ usePathname: () => "/esteira" }));

const indice = indexar(ARTIGOS);

/** Palavras longas o bastante para não casarem meio manual, tiradas do CONTEXTO dos artigos. */
function palavrasDoContexto(): string[] {
  const cru = ARTIGOS.flatMap((a) => [
    ...a.regras,
    ...a.preRequisitos,
    ...a.seDerErrado.flatMap((s) => [s.sintoma, s.acao]),
    ...a.passos.map((p) => p.detalhe ?? ""),
  ]).join(" ");
  return [...new Set(normalizar(cru).split(/[^a-z0-9]+/))].filter((p) => p.length >= 6);
}

/** A primeira consulta cujo resultado tem a mistura pedida, ou `undefined` se não houver nenhuma. */
function consultaCom({ ensinam, mencoes }: { ensinam: number; mencoes: number }) {
  return palavrasDoContexto().find((p) => {
    const r = buscar(p, indice);
    const m = r.filter((x) => x.mencaoIncidental).length;
    return r.length - m === ensinam && m >= mencoes;
  });
}

const SO_MENCAO = consultaCom({ ensinam: 0, mencoes: 1 });
const MISTA = consultaCom({ ensinam: 1, mencoes: 1 });

/** Uma palavra de TÍTULO, que por definição ensina: nenhum resultado dela pode virar menção. */
const SO_ENSINA = [...new Set(normalizar(ARTIGOS.map((a) => a.titulo).join(" ")).split(/\W+/))]
  .filter((p) => p.length >= 6)
  .find((p) => {
    const r = buscar(p, indice);
    return r.length > 0 && r.every((x) => !x.mencaoIncidental);
  });

describe("o resultado diz por que apareceu", () => {
  it("existe conteúdo real de cada classe para medir, senão o teste não vale nada", () => {
    expect(SO_MENCAO).toBeTruthy();
    expect(MISTA).toBeTruthy();
    expect(SO_ENSINA).toBeTruthy();
  });

  it("mostra o trecho que bateu, com a palavra procurada dentro dele", () => {
    render(<ResultadosDaBusca consulta={SO_MENCAO!} />);
    const cartoes = screen.getAllByRole("link");
    for (const cartao of cartoes) {
      expect(normalizar(cartao.textContent ?? "")).toContain(SO_MENCAO);
    }
  });

  it("marca a menção com a tag e explica em uma linha, sem prometer nada", () => {
    render(<ResultadosDaBusca consulta={SO_MENCAO!} />);
    expect(screen.getAllByText("Menção").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/é sobre outro assunto/i).length).toBeGreaterThan(0);
  });

  it("não marca como menção quem ensina o assunto", () => {
    render(<ResultadosDaBusca consulta={SO_ENSINA!} />);
    expect(screen.queryByText("Menção")).toBeNull();
    expect(screen.getByText(/artigos? encontrados?\./)).toBeTruthy();
    expect(screen.queryByText("Nada Que Ensine Isso")).toBeNull();
  });

  /**
   * O CASO QUE O DIRETOR VIVEU. Com todos os resultados sendo menção, a contagem sozinha já promete
   * ("1 artigo encontrado"), então ela não é mostrada: o que vem primeiro é a verdade.
   */
  it("quando TODOS os resultados são menção, a tela não parece uma resposta", () => {
    render(<ResultadosDaBusca consulta={SO_MENCAO!} />);
    const aviso = screen.getByText("Nada Que Ensine Isso").closest("div")!;
    expect(aviso.textContent).toContain(String(ARTIGOS.length));
    expect(aviso.textContent).not.toMatch(/em breve/i);
    // §A.11: nenhum travessão em texto de usuário.
    expect(aviso.textContent).not.toContain("—");
    expect(screen.queryByText(/artigos? encontrados?\./)).toBeNull();
  });

  /**
   * A MISTURA: quem ensina em cima, com a contagem, e as menções num bloco separado depois. A ordem
   * por pontos não resolve isso sozinha, porque gesto e detalhe dividem o mesmo peso e empatam.
   */
  it("separa quem ensina das menções, e a contagem conta só quem ensina", () => {
    render(<ResultadosDaBusca consulta={MISTA!} />);
    const ensinam = buscar(MISTA!, indice).filter((x) => !x.mencaoIncidental);
    const contagem = screen.getByText(/artigos? encontrados?\./).textContent ?? "";
    expect(contagem.startsWith(`${ensinam.length} `)).toBe(true);
    expect(screen.getByText("Menções Incidentais")).toBeTruthy();

    // O bloco das menções vem DEPOIS do último resultado que ensina, na ordem do documento.
    const cartoes = screen.getAllByRole("link");
    const primeiraMencao = cartoes.findIndex((c) => c.textContent?.includes("Menção"));
    expect(primeiraMencao).toBe(ensinam.length);
  });

  it("consulta que não acha nada segue caindo no vazio, e não no aviso de menção", () => {
    render(<ResultadosDaBusca consulta="zzzznaoexiste" />);
    expect(screen.getByText("Nada Encontrado")).toBeTruthy();
    expect(screen.queryByText("Nada Que Ensine Isso")).toBeNull();
  });
});
