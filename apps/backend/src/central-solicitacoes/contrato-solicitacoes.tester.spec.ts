import { describe, expect, it } from "vitest";
import {
  SOLICITACAO_ACAO_GESTAO,
  SOLICITACAO_DESCRICAO_MIN,
  SOLICITACAO_MENUS_CATALOGO,
  SOLICITACAO_STATUS,
  SOLICITACAO_STATUS_TERMINAIS,
  SOLICITACAO_TIPO,
  type SolicitacaoMenuCatalogo,
} from "@ea/shared-types";

/**
 * ─ A FONTE ÚNICA DO CONTRATO DA CENTRAL DE SOLICITAÇÕES (cobertura independente, §A.38) ──────────
 *
 * Este arquivo é o ÂNCORA do contrato que backend e frontend leem de `@ea/shared-types`. Ele não
 * toca o service nem a controller: prova apenas que as CONSTANTES do contrato têm os valores que
 * todos os outros testes desta frente assumem. Se o diretor (ou uma refatoração) mexer num enum,
 * numa lista terminal ou no catálogo de menus, é AQUI que o vermelho aparece primeiro, antes de os
 * testes comportamentais virarem um quebra-cabeça de causa obscura.
 *
 * Os requisitos puramente de contrato moram aqui (tipo, mínimo da descrição, terminais, catálogo);
 * a parte COMPORTAMENTAL de cada um (validação do DTO, resolução do rótulo, mapeamento de ação)
 * mora nos arquivos de service/controller desta mesma pasta.
 */

describe("Contrato: SOLICITACAO_TIPO é exatamente FUNCIONALIDADE e BUG (req.1)", () => {
  it("tem os dois valores, nessa ordem, e nada além", () => {
    expect([...SOLICITACAO_TIPO]).toEqual(["FUNCIONALIDADE", "BUG"]);
  });

  it("não aceita um tipo fora do enum (o que a validação do CREATE precisa rejeitar)", () => {
    expect(SOLICITACAO_TIPO).not.toContain("MELHORIA" as never);
    expect(SOLICITACAO_TIPO).not.toContain("" as never);
  });
});

describe("Contrato: o mínimo da descrição é 50 (req.1)", () => {
  it("SOLICITACAO_DESCRICAO_MIN === 50", () => {
    expect(SOLICITACAO_DESCRICAO_MIN).toBe(50);
  });
});

describe("Contrato: o ciclo de status e os terminais (req.3)", () => {
  it("os seis status do ciclo, na ordem do fluxo", () => {
    expect([...SOLICITACAO_STATUS]).toEqual([
      "NOVO",
      "EM_DUVIDA",
      "APROVADO",
      "REPROVADO",
      "EM_ANDAMENTO",
      "CONCLUIDO",
    ]);
  });

  it("os terminais são EXATAMENTE REPROVADO e CONCLUIDO", () => {
    expect([...SOLICITACAO_STATUS_TERMINAIS].sort()).toEqual(["CONCLUIDO", "REPROVADO"]);
  });

  it("todo terminal é um status de verdade do ciclo", () => {
    for (const s of SOLICITACAO_STATUS_TERMINAIS) {
      expect(SOLICITACAO_STATUS).toContain(s);
    }
  });

  it("NOVO e EM_ANDAMENTO NÃO são terminais (o tempo parado ainda corre neles)", () => {
    expect(SOLICITACAO_STATUS_TERMINAIS).not.toContain("NOVO");
    expect(SOLICITACAO_STATUS_TERMINAIS).not.toContain("EM_ANDAMENTO");
  });
});

describe("Contrato: as cinco ações da gestão (req.4)", () => {
  it("são exatamente as cinco, na ordem do contrato", () => {
    expect([...SOLICITACAO_ACAO_GESTAO]).toEqual([
      "APROVAR",
      "REPROVAR",
      "ENVIAR_DUVIDA",
      "EM_ANDAMENTO",
      "CONCLUIR",
    ]);
  });
});

describe("Contrato: o catálogo de menus é a fonte do par (menu, submenu) (req.1)", () => {
  it("todo item tem codigo, rotulo e ao menos um submenu", () => {
    for (const m of SOLICITACAO_MENUS_CATALOGO) {
      expect(typeof m.codigo, `codigo de ${m.codigo}`).toBe("string");
      expect(m.codigo.length, `codigo de ${m.rotulo}`).toBeGreaterThan(0);
      expect(typeof m.rotulo, `rotulo de ${m.codigo}`).toBe("string");
      expect(m.rotulo.length, `rotulo de ${m.codigo}`).toBeGreaterThan(0);
      expect(Array.isArray(m.submenus), `submenus de ${m.codigo}`).toBe(true);
      expect(m.submenus.length, `submenus de ${m.codigo}`).toBeGreaterThan(0);
    }
  });

  it("os códigos de tela são únicos (o par (menu, submenu) precisa resolver sem ambiguidade)", () => {
    const codigos = SOLICITACAO_MENUS_CATALOGO.map((m) => m.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("nenhum rótulo ou submenu usa o travessão em dash (§A.11)", () => {
    for (const m of SOLICITACAO_MENUS_CATALOGO) {
      expect(m.rotulo.includes("—"), `rotulo de ${m.codigo}`).toBe(false);
      for (const s of m.submenus) {
        expect(s.includes("—"), `submenu "${s}" de ${m.codigo}`).toBe(false);
      }
    }
  });

  /**
   * Os pares que os testes de CREATE usam como "válido" existem MESMO no catálogo. Se o catálogo
   * mudar e esses pares sumirem, o teste de CREATE passaria a provar a regra com um par inexistente
   * (verde por engano); este caso trava isso.
   */
  it("os pares de referência dos testes de CREATE existem no catálogo", () => {
    const acha = (codigo: string, submenu: string): boolean =>
      SOLICITACAO_MENUS_CATALOGO.some(
        (m: SolicitacaoMenuCatalogo) => m.codigo === codigo && m.submenus.includes(submenu),
      );
    expect(acha("esteira-admissional", "Auditoria")).toBe(true);
    expect(acha("central-de-vagas", "Importação")).toBe(true);
    // par inexistente: submenu que não pertence àquela tela
    expect(acha("esteira-admissional", "Fila")).toBe(false);
    // código inexistente
    expect(acha("tela-que-nao-existe", "Qualquer")).toBe(false);
  });
});
