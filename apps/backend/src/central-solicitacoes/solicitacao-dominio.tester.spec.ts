import { describe, expect, it } from "vitest";
import {
  SOLICITACAO_ACAO_GESTAO,
  SOLICITACAO_MENUS_CATALOGO,
  SOLICITACAO_STATUS,
  SOLICITACAO_STATUS_TERMINAIS,
  type SolicitacaoAcaoGestao,
} from "@ea/shared-types";
import {
  diasParado,
  mensagemPadraoDaAcao,
  notificacaoDaAcao,
  resolverMenuDoCatalogo,
  statusDaAcao,
} from "./solicitacao-dominio";

/**
 * ─ REGRAS PURAS DA CENTRAL DE SOLICITAÇÕES (cobertura independente, §A.38) ───────────────────────
 *
 * O backend extraiu a lógica sem I/O para `solicitacao-dominio.ts`: a validação do par
 * (tela + seção), o `diasParado` e o mapeamento ação→status. Estas provas codificam o REQUISITO
 * sobre essas funções puras, não a suposição de quem as escreveu. Onde um requisito só é alcançável
 * pelo service/controller (CREATE, notificações, RBAC), a prova vive em arquivo separado desta
 * mesma pasta e é vermelha até o service existir.
 */

describe("resolverMenuDoCatalogo: o par (tela, seção) e o rótulo (req.1)", () => {
  it("um par VÁLIDO resolve, e o rótulo vem do CATÁLOGO (não do cliente)", () => {
    const r = resolverMenuDoCatalogo("esteira-admissional", "Auditoria");
    expect(r).not.toBeNull();
    // o rótulo é o do catálogo compartilhado, nunca um texto que o cliente mandaria
    const doCatalogo = SOLICITACAO_MENUS_CATALOGO.find((m) => m.codigo === "esteira-admissional");
    expect(r?.rotulo).toBe(doCatalogo?.rotulo);
    expect(r?.rotulo).toBe("Esteira Admissional");
  });

  it("TODO par do catálogo resolve para o rótulo daquela tela", () => {
    for (const tela of SOLICITACAO_MENUS_CATALOGO) {
      for (const sub of tela.submenus) {
        expect(resolverMenuDoCatalogo(tela.codigo, sub), `${tela.codigo}/${sub}`).toEqual({
          rotulo: tela.rotulo,
        });
      }
    }
  });

  it("submenu que NÃO pertence àquela tela é rejeitado (null), mesmo existindo em outra", () => {
    // "Fila" existe em sala-de-espera, NÃO em esteira-admissional
    expect(resolverMenuDoCatalogo("esteira-admissional", "Fila")).toBeNull();
  });

  it("código de tela inexistente é rejeitado (null)", () => {
    expect(resolverMenuDoCatalogo("tela-que-nao-existe", "Auditoria")).toBeNull();
  });

  it("não confia em rótulo do cliente: o par casa por código+submenu, não por rótulo digitado", () => {
    // mandar o rótulo no lugar do código não resolve
    expect(resolverMenuDoCatalogo("Esteira Admissional", "Auditoria")).toBeNull();
  });
});

describe("diasParado: congela em terminal, conta dias inteiros no aberto (req.3)", () => {
  const base = new Date("2026-10-17T12:00:00.000Z");

  it("é ZERO em QUALQUER status terminal, mesmo criado há muito tempo", () => {
    const criadoHaDezDias = new Date(base.getTime() - 10 * 86_400_000);
    for (const terminal of SOLICITACAO_STATUS_TERMINAIS) {
      expect(diasParado(terminal, criadoHaDezDias, base), terminal).toBe(0);
    }
  });

  it("status ABERTO criado há ~3 dias devolve 3 (floor de (agora - criadoEm)/1 dia)", () => {
    const criadoHaTresDias = new Date(base.getTime() - 3 * 86_400_000);
    expect(diasParado("NOVO", criadoHaTresDias, base)).toBe(3);
  });

  it("faz FLOOR: 3 dias e 23h ainda é 3, não arredonda para cima", () => {
    const quase4 = new Date(base.getTime() - (3 * 86_400_000 + 23 * 3_600_000));
    expect(diasParado("EM_ANDAMENTO", quase4, base)).toBe(3);
  });

  it("todos os status NÃO terminais contam o tempo (não são congelados)", () => {
    const criadoHaCincoDias = new Date(base.getTime() - 5 * 86_400_000);
    for (const s of SOLICITACAO_STATUS) {
      if (SOLICITACAO_STATUS_TERMINAIS.includes(s)) continue;
      expect(diasParado(s, criadoHaCincoDias, base), s).toBe(5);
    }
  });
});

describe("statusDaAcao: cada ação da gestão leva a UM status (req.4)", () => {
  it("APROVAR→APROVADO, REPROVAR→REPROVADO, ENVIAR_DUVIDA→EM_DUVIDA, EM_ANDAMENTO→EM_ANDAMENTO, CONCLUIR→CONCLUIDO", () => {
    const esperado: Record<SolicitacaoAcaoGestao, string> = {
      APROVAR: "APROVADO",
      REPROVAR: "REPROVADO",
      ENVIAR_DUVIDA: "EM_DUVIDA",
      EM_ANDAMENTO: "EM_ANDAMENTO",
      CONCLUIR: "CONCLUIDO",
    };
    for (const acao of SOLICITACAO_ACAO_GESTAO) {
      expect(statusDaAcao(acao), acao).toBe(esperado[acao]);
    }
  });

  it("toda ação do contrato tem um destino, e o destino é um status de verdade", () => {
    for (const acao of SOLICITACAO_ACAO_GESTAO) {
      expect(SOLICITACAO_STATUS, acao).toContain(statusDaAcao(acao));
    }
  });
});

describe("mensagemPadraoDaAcao: toda ação gera texto de thread, sem travessão (apoio ao req.5)", () => {
  it("há mensagem padrão para cada ação e nenhuma usa o em dash (§A.11)", () => {
    for (const acao of SOLICITACAO_ACAO_GESTAO) {
      const msg = mensagemPadraoDaAcao(acao);
      expect(typeof msg, acao).toBe("string");
      expect(msg.length, acao).toBeGreaterThan(0);
      expect(msg.includes("—"), acao).toBe(false);
    }
  });
});

describe("notificacaoDaAcao: título e corpo ao solicitante (apoio ao req.5)", () => {
  it("ENVIAR_DUVIDA leva a pergunta da gestão no corpo", () => {
    const n = notificacaoDaAcao("ENVIAR_DUVIDA", "Qual tela exatamente?", "Esteira Admissional");
    expect(n.corpo).toContain("Qual tela exatamente?");
  });

  it("toda ação produz título e corpo não vazios, sem travessão (§A.11)", () => {
    for (const acao of SOLICITACAO_ACAO_GESTAO) {
      const n = notificacaoDaAcao(acao, undefined, "Central De Vagas");
      expect(n.titulo.length, acao).toBeGreaterThan(0);
      expect(n.corpo.length, acao).toBeGreaterThan(0);
      expect(n.titulo.includes("—"), acao).toBe(false);
      expect(n.corpo.includes("—"), acao).toBe(false);
    }
  });
});
