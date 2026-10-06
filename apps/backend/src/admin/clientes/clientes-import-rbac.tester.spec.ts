import { describe, expect, it } from "vitest";
import { menuDaOperacao } from "../../domain/menus";

/**
 * TESTE INDEPENDENTE (§A.38), ponto de segurança #1 da frente de importação de clientes.
 *
 * REGRA DURA (§A.23 + `menu.guard.ts`): operação que menu NENHUM reivindica nasce ABERTA a qualquer
 * sessão autenticada. A importação em massa de clientes é ESCRITA administrativa; deixá-la aberta
 * entregaria o cadastro em lote a qualquer COMUM. Por isso as três operações do fluxo de importação
 * TÊM de ser reivindicadas pelo menu `clientes` (o mesmo que já governa create/update/remove).
 *
 * Espelha `grupos-cliente-rbac.spec.ts` e `lojas-escrita-aberta.spec.ts`: a ausência de reivindicação
 * não se defende sozinha, então ela vira asserção. Esquecer de reivindicar uma das três QUEBRA aqui,
 * antes de a rota nascer aberta em produção.
 *
 * Observação de recorte: NÃO pode virar coringa `ClientesController.*`. O `list` desta mesma
 * controller fica FORA de propósito (o consultor precisa listar clientes na Liberação e no wizard).
 * Por isso o teste exige as operações NOMINAIS, não a controller inteira.
 */

const OPERACOES_DE_IMPORTACAO = ["importarModelo", "importarPrevia", "importarConfirmar"] as const;

describe("importação de clientes: as três operações são reivindicadas pelo menu `clientes`", () => {
  for (const op of OPERACOES_DE_IMPORTACAO) {
    it(`ClientesController.${op} pertence ao menu 'clientes' (não nasce aberta)`, () => {
      expect(menuDaOperacao("ClientesController", op), `ClientesController.${op}`).toBe("clientes");
    });
  }

  it("NENHUMA das três está aberta (nenhuma devolve null em menuDaOperacao)", () => {
    for (const op of OPERACOES_DE_IMPORTACAO) {
      expect(menuDaOperacao("ClientesController", op), `${op} aberta`).not.toBeNull();
    }
  });

  it("o `list` do mesmo controller continua ABERTO (leitura de trabalho, não pode fechar junto)", () => {
    expect(menuDaOperacao("ClientesController", "list")).toBeNull();
  });
});
