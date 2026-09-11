import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { menuDaOperacao } from "../../domain/menus";
import { CandidatosController } from "./candidatos.controller";

/**
 * ─ A AUTORIDADE DO DESVÍNCULO CHEGA INTEIRA NO SERVICE, E NÃO MORA NA ROTA ────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester`. Ela cobre a CAMADA que os testes de
 * service não alcançam, e é uma lacuna com precedente nesta casa: o `vagas.fechar-sem-roles.spec`
 * nasceu depois de o `tester` provar que um teste de service dizia proteger uma regra que vivia
 * num decorador de handler.
 *
 * ┌─ AS DUAS REGRESSÕES QUE SÓ EXISTEM AQUI, e as duas são de quatro linhas bem-intencionadas ──┐
 * │                                                                                             │
 * │ 1. ALGUÉM ACRESCENTA `@Roles("MASTER","SUPER_ADMIN")` no handler, achando que está aplicando │
 * │    a regra nova. O `RolesGuard` roda ANTES de o service existir na história, e o COMUM perde  │
 * │    o desvínculo NORMAL, que é a operação do dia a dia dele. A suíte de service fica INTEIRA   │
 * │    verde, porque nenhum teste de service passa por guard nenhum.                             │
 * │                                                                                             │
 * │ 2. ALGUÉM "ARRUMA" A CONTROLLER DE VOLTA PARA `user.id`, porque é o padrão das outras vinte  │
 * │    rotas deste mesmo arquivo. O service passa a receber uma STRING onde espera o usuário,     │
 * │    `user.papel` vira `undefined`, e `podeDesvincularEntregue` responde `false` PARA TODO      │
 * │    MUNDO: nem o MASTER nem o SUPER_ADMIN desvinculam um ALOCADO. A trava nova deixa de ser    │
 * │    uma trava e vira uma parede, e nenhum teste de service percebe, porque lá o usuário        │
 * │    sempre chega inteiro.                                                                     │
 * │                                                                                             │
 * │ A SEGUNDA É A MAIS PROVÁVEL DAS DUAS: `user.id` é o que as rotas vizinhas fazem, e "padronizar│
 * │ com as vizinhas" é exatamente a forma que a regressão toma numa revisão apressada.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o usuário fingido aqui é interno (id, papel, e-mail corporativo). Nenhum dado de candidato.
 */

/** As duas rotas de saída, individual e em lote. São as que carregam a autoridade nova. */
const ROTAS_DE_SAIDA = ["registrarSaida", "registrarSaidaEmLote"] as const;

const USUARIO = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM" as const,
  senhaTemporaria: false,
};

function controllerComServicoFingido() {
  /*
   * OS DUBLÊS DECLARAM OS ARGUMENTOS, e não é enfeite de tipo: um `vi.fn(async () => ...)` sem
   * parâmetros infere a tupla VAZIA para `mock.calls`, e a asserção sobre o terceiro argumento (que
   * é o ponto inteiro deste arquivo) não compila. Tipo frouxo aqui viraria `as never` na asserção,
   * e `as never` é como uma asserção deixa de afirmar.
   */
  const registrarSaida = vi.fn(async (..._args: unknown[]) => ({}) as never);
  const registrarSaidaEmLote = vi.fn(
    async (..._args: unknown[]) => ({ aplicadas: 0, falhas: [] }) as never,
  );
  const controller = new CandidatosController({
    registrarSaida,
    registrarSaidaEmLote,
  } as never);
  return { controller, registrarSaida, registrarSaidaEmLote };
}

describe("a autoridade do desvínculo NÃO mora num @Roles da rota", () => {
  it("não há @Roles em CLASSE: um decorador aqui barraria o COMUM em TODO o módulo", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CandidatosController)).toBeUndefined();
  });

  for (const rota of ROTAS_DE_SAIDA) {
    /**
     * A AUSÊNCIA É A REGRA, e ela não se defende sozinha. Sem este teste, acrescentar o papel no
     * handler parece a correção óbvia da regra nova, e o efeito é o oposto do pedido: o gesto que
     * o diretor mandou MANTER aberto (desvincular quem está EM SELEÇÃO) fecha para todo mundo.
     */
    it(`não há @Roles de método em ${rota}`, () => {
      const proto = CandidatosController.prototype as unknown as Record<string, object>;
      expect(Reflect.getMetadata(ROLES_KEY, proto[rota])).toBeUndefined();
    });

    /**
     * A CONTRAPARTIDA DA AUSÊNCIA: "sem `@Roles`" NÃO quer dizer "aberto a qualquer autenticado".
     * Quem controla a entrada é o MENU, e sem a reivindicação o módulo fica alcançável pela URL da
     * API por quem não o enxerga na tela.
     */
    it(`${rota} continua reivindicada por um menu do A&S`, () => {
      expect(menuDaOperacao("CandidatosController", rota)).toMatch(/^as-/);
    });
  }
});

describe("o USUÁRIO INTEIRO atravessa a rota, e não só o id", () => {
  /**
   * ─ O TESTE QUE PEGA A "PADRONIZAÇÃO" DE VOLTA PARA `user.id` ──────────────────────────────────
   *
   * Ele afirma a forma do que chega no service: um OBJETO com `papel`, e não uma string. Afirmar só
   * "foi chamado" deixaria passar exatamente a regressão, porque `registrarSaida(id, dto, "user-1")`
   * também é uma chamada.
   */
  it("registrarSaida entrega o objeto do usuário, com o papel dentro", async () => {
    const { controller, registrarSaida } = controllerComServicoFingido();

    await controller.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: "Perfil não aderente" } as never,
      USUARIO,
    );

    expect(registrarSaida).toHaveBeenCalledTimes(1);
    const terceiro = registrarSaida.mock.calls[0]?.[2] as unknown;
    expect(typeof terceiro).toBe("object");
    expect(terceiro).toMatchObject({ id: USUARIO.id, papel: USUARIO.papel });
  });

  it("registrarSaidaEmLote entrega o objeto do usuário, com o papel dentro", async () => {
    const { controller, registrarSaidaEmLote } = controllerComServicoFingido();

    await controller.registrarSaidaEmLote(
      {
        candidaturaIds: ["cand-1"],
        situacao: "DESCARTADO",
        motivo: "Perfil não aderente",
      } as never,
      USUARIO,
    );

    expect(registrarSaidaEmLote).toHaveBeenCalledTimes(1);
    const segundo = registrarSaidaEmLote.mock.calls[0]?.[1] as unknown;
    expect(typeof segundo).toBe("object");
    expect(segundo).toMatchObject({ id: USUARIO.id, papel: USUARIO.papel });
  });

  /**
   * O PAPEL NÃO PODE VIR DO CORPO, nunca. Um `papel` no DTO seria escalada de privilégio escrita
   * pelo próprio cliente: bastaria mandar `"MASTER"` no JSON para desvincular qualquer entrega.
   * O `@CurrentUser()` é a única fonte, e este teste prova que o corpo não a sobrepõe.
   */
  it("um papel enviado no CORPO não chega ao service nem sobrepõe o da sessão", async () => {
    const { controller, registrarSaida } = controllerComServicoFingido();

    await controller.registrarSaida(
      "cand-1",
      {
        situacao: "DESCARTADO",
        motivo: "Perfil não aderente",
        papel: "SUPER_ADMIN",
      } as never,
      USUARIO,
    );

    const terceiro = registrarSaida.mock.calls[0]?.[2] as unknown as { papel?: string };
    expect(terceiro.papel).toBe("COMUM");
  });
});
