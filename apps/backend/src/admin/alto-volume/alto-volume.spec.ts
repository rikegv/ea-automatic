import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import {
  MENUS,
  MENUS_PADRAO_COMUM,
  codigosPadraoDoPapel,
  menuDaOperacao,
} from "../../domain/menus";
import { AltoVolumeController } from "./alto-volume.controller";

/**
 * RÉGUA DE ACESSO DO ALTO VOLUME (onda 1), travada em teste.
 *
 * Não é teste de formalidade: as três regras abaixo são exatamente as que já foram quebradas antes
 * neste sistema, cada uma com incidente registrado. `@Roles` em classe derrubou a Liberação;
 * reivindicar leitura por menu matou o dropdown do Gerador de Kit; e menu novo distribuído por conta
 * própria contraria a §A.23. Se alguém desfizer qualquer uma delas, quebra aqui antes de ir ao ar.
 */

const ESCRITAS = [
  "create",
  "update",
  "reativar",
  "remove",
  "criarGrupo",
  "atualizarGrupo",
  "removerGrupo",
  "criarVaga",
  "atualizarVaga",
  "removerVaga",
  // Onda 3 (vínculo por correção).
  "vincular",
  "vincularEmLote",
  "atualizarVinculo",
  "desvincular",
];

/**
 * As leituras da ONDA 3 são gatadas por menu, ao contrário de `list`/`obter`. Elas devolvem NOME DE
 * CANDIDATO e servem só à conferência do projeto: nenhuma tela da operação as consome, então não há
 * o risco de 403 que obrigou a deixar o cadastro aberto (§A.6).
 */
const LEITURAS_DE_VINCULO = ["listarVinculos", "listarOrfaos"];

describe("Alto Volume: classe sem @Roles (a régua que derrubou a Liberação não pode voltar)", () => {
  it("a controller NÃO tem @Roles em classe", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AltoVolumeController)).toBeUndefined();
  });

  it("nenhum método tem @Roles: quem governa a escrita é o MENU", () => {
    const proto = AltoVolumeController.prototype as unknown as Record<string, unknown>;
    for (const m of [...ESCRITAS, ...LEITURAS_DE_VINCULO, "list", "obter"]) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[m] as object), m).toBeUndefined();
    }
  });
});

describe("Alto Volume: escrita gated por menu, leitura aberta", () => {
  it("TODA escrita é reivindicada pelo menu alto-volume", () => {
    for (const m of ESCRITAS) {
      expect(menuDaOperacao("AltoVolumeController", m), `escrita ${m}`).toBe("alto-volume");
    }
  });

  /**
   * A leitura fica ABERTA porque na onda 2 o modal da Liberação vai listar os projetos do cliente, e
   * o consultor COMUM não tem o menu `alto-volume` (que é do Gerencial). Reivindicar a leitura faria
   * o seletor tomar 403 na cara dele.
   */
  it("a LEITURA DO CADASTRO (list/obter) NÃO é reivindicada por menu nenhum", () => {
    expect(menuDaOperacao("AltoVolumeController", "list")).toBeNull();
    expect(menuDaOperacao("AltoVolumeController", "obter")).toBeNull();
  });

  it("as leituras de VÍNCULO (onda 3) SÃO gatadas: devolvem nome de candidato", () => {
    for (const m of LEITURAS_DE_VINCULO) {
      expect(menuDaOperacao("AltoVolumeController", m), `leitura ${m}`).toBe("alto-volume");
    }
  });
});

describe("Alto Volume: o menu nasce só para o SUPER_ADMIN (§A.23)", () => {
  it("está registrado no catálogo, no grupo ADMIN", () => {
    const menu = MENUS.find((m) => m.codigo === "alto-volume");
    expect(menu, "o menu alto-volume precisa estar registrado em domain/menus").toBeDefined();
    expect(menu?.grupo).toBe("ADMIN");
    expect(menu?.href).toBe("/admin/alto-volume");
  });

  it("NÃO entra no padrão do COMUM: quem libera é o diretor, usuário a usuário", () => {
    expect(MENUS_PADRAO_COMUM).not.toContain("alto-volume");
    expect(codigosPadraoDoPapel("COMUM")).not.toContain("alto-volume");
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toContain("alto-volume");
  });
});
