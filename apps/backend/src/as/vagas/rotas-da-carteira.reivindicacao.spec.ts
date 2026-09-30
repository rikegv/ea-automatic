import { describe, expect, it } from "vitest";
import { menuDaOperacao } from "../../domain/menus";

/**
 * AS ROTAS QUE MUDAM O DONO DA CARTEIRA ESTAO REIVINDICADAS POR UM MENU. Ponto.
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, e ele e a ressalva R1 de uma auditoria de 30/09/2026 ──────────┐
 * │ `transferirConsultor` muda de QUEM E a vaga e nasceu **sem `@Roles`**, por decisao do diretor │
 * │ ("nivel consultor, qualquer consultor transfere"). Quem a segura, entao, e o `MenuGuard`.     │
 * │                                                                                              │
 * │ E o `MenuGuard` e **FAIL-OPEN** para operacao que nenhum menu reivindica: `menuDaOperacao`    │
 * │ devolve `null` e o handler fica alcancavel por QUALQUER autenticado. Hoje ele NAO fica, e o   │
 * │ motivo e que `VagasController` e `CandidatosController` sao reivindicados por **CURINGA**     │
 * │ (`Controller.*`), entao metodo novo nasce coberto.                                           │
 * │                                                                                              │
 * │ O RISCO QUE ESTE TESTE MATA e de MANUTENCAO, nao de hoje: o proprio `domain/menus.ts` diz,    │
 * │ em caixa alta e sobre OUTRO menu, "NOMINAL, NUNCA CURINGA", porque la o curinga faria handler │
 * │ novo herdar concessao sem decisao do diretor. Uma sessao futura lendo aquela linha "corrige"  │
 * │ o curinga daqui por coerencia, troca por lista nominal, esquece uma destas rotas, e a rota    │
 * │ que transfere carteira fica ABERTA. A varredura que ja existe nao pega: ela itera o registro, │
 * │ entao passa igual com curinga ou com lista nominal.                                          │
 * │                                                                                              │
 * │ AQUI A ASSERCAO E POR OPERACAO, NOMINAL, e e isso que a torna util: ela nao se importa com o  │
 * │ MECANISMO (curinga ou lista), ela exige o RESULTADO. Trocar o mecanismo continua permitido;   │
 * │ o que fica proibido e trocar e deixar uma destas quatro sem dono.                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("as rotas que mudam a carteira sao reivindicadas por menu", () => {
  const PARES: [string, string, string][] = [
    // Transferir a vaga de um consultor para outro: muda o DONO da carteira.
    ["VagasController", "transferirConsultor", "as-vagas"],
    // O catalogo que alimenta o seletor da transferencia. Ele devolve nome de usuario interno,
    // entao tambem nao pode nascer aberto.
    ["VagasController", "consultoresParaTransferencia", "as-vagas"],
    // A troca de vaga em lote: move N candidaturas de uma vaga para outra.
    ["CandidatosController", "trocarVagaEmLote", "as-candidatos"],
    // A individual, que e o caminho que o lote reusa. Se ela cair, o lote cai junto.
    ["CandidatosController", "trocarVaga", "as-candidatos"],
  ];

  it.each(PARES)("%s.%s pertence ao menu %s", (controller, handler, menu) => {
    expect(menuDaOperacao(controller, handler)).toBe(menu);
  });

  it("NENHUMA delas devolve null, que e o estado FAIL-OPEN do MenuGuard", () => {
    for (const [controller, handler] of PARES) {
      expect(menuDaOperacao(controller, handler), `${controller}.${handler}`).not.toBeNull();
    }
  });

  /*
   * O CONTROLE NEGATIVO, sem o qual os casos acima poderiam estar passando por acidente: se
   * `menuDaOperacao` devolvesse um menu para QUALQUER coisa, as assercoes de cima seriam vacuosas.
   */
  it("uma controller que nao existe devolve null, provando que a asserção acima nao e vacua", () => {
    expect(menuDaOperacao("ControllerQueNaoExiste", "metodo")).toBeNull();
  });
});
