import { describe, expect, it } from "vitest";
import type { LinhaDoPainelPortal } from "@ea/shared-types";
import {
  COLUNAS_RELATORIO_PORTAL,
  celulaDoLink,
  colunasDoRelatorioPortal,
  montarLinhaRelatorioPortal,
  precisaResolverLink,
} from "./portal-relatorio";

/**
 * Regra do diretor (OST das ondas, Onda 2b): o Excel do Gerenciador do Portal leva o LINK VIVO de
 * cada candidato, usando SEMPRE o link vivo e NUNCA gerando um link novo à toa. Estes testes provam
 * que SÓ o estado VIVO resolve link e que os demais levam nota, sem link.
 */

function linhaBase(over: Partial<LinhaDoPainelPortal> = {}): LinhaDoPainelPortal {
  return {
    admissaoId: "a1",
    nome: "MARIA DA SILVA",
    cargo: "AUXILIAR",
    cliente: "OPERAÇÃO CENTRO",
    dataAdmissao: "2026-08-18",
    linkJti: "jti-1",
    documentoAtual: "RG",
    aceitos: 3,
    obrigatorios: 7,
    noTime: false,
    ultimoAcessoEm: "2026-08-19",
    estadoLink: "VIVO",
    origemEnvio: "MANUAL",
    ...over,
  } as LinhaDoPainelPortal;
}

describe("portal-relatorio: link vivo sempre, nunca gerar à toa", () => {
  it("só o estado VIVO precisa resolver link; os demais não", () => {
    expect(precisaResolverLink(linhaBase({ estadoLink: "VIVO" }))).toBe(true);
    for (const e of ["VENCIDO", "REVOGADO", "SUSPENSO", "BLOQUEADO"] as const) {
      expect(precisaResolverLink(linhaBase({ estadoLink: e }))).toBe(false);
    }
  });

  it("célula do link: VIVO recebe a URL resolvida; não vivo recebe nota e nenhum link", () => {
    expect(celulaDoLink("VIVO", "https://portal/abc")).toBe("https://portal/abc");
    expect(celulaDoLink("VIVO", null)).toBe("");
    expect(celulaDoLink("VENCIDO", null)).toBe("Link vencido (gerar na tela)");
    expect(celulaDoLink("REVOGADO", null)).toBe("Link revogado");
    expect(celulaDoLink("SUSPENSO", null)).toBe("Link suspenso");
    expect(celulaDoLink("BLOQUEADO", null)).toBe("Link bloqueado");
  });

  it("monta a linha com progresso, rótulos e a data em dd/mm/aaaa", () => {
    const linha = montarLinhaRelatorioPortal(linhaBase(), "https://portal/vivo");
    expect(linha.candidato).toBe("MARIA DA SILVA");
    expect(linha.dataAdmissao).toBe("18/08/2026");
    expect(linha.progresso).toBe("3/7");
    expect(linha.noTime).toBe("Não");
    expect(linha.estadoLink).toBe("Vivo");
    expect(linha.origem).toBe("Manual");
    expect(linha.link).toBe("https://portal/vivo");
  });

  it("linha de estado não vivo não carrega link, mesmo com uma URL passada por engano", () => {
    const linha = montarLinhaRelatorioPortal(linhaBase({ estadoLink: "VENCIDO" }), "https://x");
    expect(linha.link).toBe("Link vencido (gerar na tela)");
  });

  it("a coluna do link existe no catálogo de colunas", () => {
    expect(COLUNAS_RELATORIO_PORTAL.some((c) => c.chave === "link")).toBe(true);
  });

  // Onda 3.1: contato obrigatório (Nome/Telefone/E-mail) e seleção de colunas.
  it("preenche telefone e e-mail quando o contato é passado; vazio quando não", () => {
    const com = montarLinhaRelatorioPortal(linhaBase(), "https://portal/vivo", {
      telefone: "11999990000",
      email: "maria@exemplo.com",
    });
    expect(com.telefone).toBe("11999990000");
    expect(com.email).toBe("maria@exemplo.com");
    const sem = montarLinhaRelatorioPortal(linhaBase(), "https://portal/vivo");
    expect(sem.telefone).toBe("");
    expect(sem.email).toBe("");
  });

  it("sem seleção informada, devolve o catálogo completo de colunas", () => {
    expect(colunasDoRelatorioPortal(null)).toEqual(COLUNAS_RELATORIO_PORTAL);
    expect(colunasDoRelatorioPortal([])).toEqual(COLUNAS_RELATORIO_PORTAL);
  });

  it("com seleção, mantém sempre Nome/Telefone/E-mail e o link, e só as colunas marcadas", () => {
    const chaves = colunasDoRelatorioPortal(["cargo"]).map((c) => c.chave);
    // Obrigatórias e o link entram sempre:
    expect(chaves).toContain("candidato");
    expect(chaves).toContain("telefone");
    expect(chaves).toContain("email");
    expect(chaves).toContain("link");
    // A marcada entra:
    expect(chaves).toContain("cargo");
    // As não marcadas ficam de fora:
    expect(chaves).not.toContain("cliente");
    expect(chaves).not.toContain("documentoAtual");
  });
});
