import { describe, expect, it } from "vitest";
import { SOLICITACAO_MENUS_CATALOGO } from "@ea/shared-types";
import {
  diasParado,
  mensagemPadraoDaAcao,
  notificacaoDaAcao,
  resolverMenuDoCatalogo,
  statusDaAcao,
} from "./solicitacao-dominio";

const TRAVESSAO = "—";

describe("resolverMenuDoCatalogo", () => {
  it("resolve o rótulo de um par (tela, seção) que existe no catálogo", () => {
    const tela = SOLICITACAO_MENUS_CATALOGO[0];
    const r = resolverMenuDoCatalogo(tela.codigo, tela.submenus[0]);
    expect(r).toEqual({ rotulo: tela.rotulo });
  });

  it("rejeita tela inexistente", () => {
    expect(resolverMenuDoCatalogo("tela-que-nao-existe", "Qualquer")).toBeNull();
  });

  it("rejeita seção que não pertence à tela", () => {
    const tela = SOLICITACAO_MENUS_CATALOGO[0];
    expect(resolverMenuDoCatalogo(tela.codigo, "Seção Inventada")).toBeNull();
  });

  it("não aceita o rótulo da tela no lugar do código", () => {
    const tela = SOLICITACAO_MENUS_CATALOGO.find((m) => m.rotulo !== m.codigo)!;
    expect(resolverMenuDoCatalogo(tela.rotulo, tela.submenus[0])).toBeNull();
  });
});

describe("diasParado", () => {
  const agora = new Date("2026-01-20T12:00:00Z");

  it("conta os dias inteiros desde a criação quando o status é vivo", () => {
    expect(diasParado("NOVO", new Date("2026-01-15T12:00:00Z"), agora)).toBe(5);
    expect(diasParado("EM_DUVIDA", new Date("2026-01-20T00:00:00Z"), agora)).toBe(0);
    expect(diasParado("EM_ANDAMENTO", new Date("2026-01-18T11:00:00Z"), agora)).toBe(2);
    expect(diasParado("APROVADO", new Date("2026-01-10T12:00:00Z"), agora)).toBe(10);
  });

  it("congela em zero nos status terminais", () => {
    expect(diasParado("REPROVADO", new Date("2026-01-01T00:00:00Z"), agora)).toBe(0);
    expect(diasParado("CONCLUIDO", new Date("2026-01-01T00:00:00Z"), agora)).toBe(0);
  });

  it("nunca devolve negativo (relógio adiantado numa linha recém-criada)", () => {
    expect(diasParado("NOVO", new Date("2026-01-25T12:00:00Z"), agora)).toBe(0);
  });
});

describe("statusDaAcao", () => {
  it("mapeia cada ação da gestão ao status de destino", () => {
    expect(statusDaAcao("APROVAR")).toBe("APROVADO");
    expect(statusDaAcao("REPROVAR")).toBe("REPROVADO");
    expect(statusDaAcao("ENVIAR_DUVIDA")).toBe("EM_DUVIDA");
    expect(statusDaAcao("EM_ANDAMENTO")).toBe("EM_ANDAMENTO");
    expect(statusDaAcao("CONCLUIR")).toBe("CONCLUIDO");
  });
});

describe("textos das ações (§A.11: sem travessão)", () => {
  const acoes = ["APROVAR", "REPROVAR", "ENVIAR_DUVIDA", "EM_ANDAMENTO", "CONCLUIR"] as const;

  it("mensagem padrão existe e não usa travessão", () => {
    for (const a of acoes) {
      const m = mensagemPadraoDaAcao(a);
      expect(m.length).toBeGreaterThan(0);
      expect(m).not.toContain(TRAVESSAO);
    }
  });

  it("notificação tem título title case e corpo sem travessão", () => {
    for (const a of acoes) {
      const n = notificacaoDaAcao(a, undefined, "Esteira Admissional");
      expect(n.titulo.length).toBeGreaterThan(0);
      expect(n.titulo).not.toContain(TRAVESSAO);
      expect(n.corpo).not.toContain(TRAVESSAO);
    }
  });

  it("a dúvida carrega a pergunta da gestão no corpo", () => {
    const n = notificacaoDaAcao("ENVIAR_DUVIDA", "Qual tela exatamente?", "Esteira Admissional");
    expect(n.corpo).toContain("Qual tela exatamente?");
  });
});
