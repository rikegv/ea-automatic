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
  "removerVagasEmLote",
  // Onda 3 (vínculo por correção), o que sobrou fechado: as duas ações da TELA do Alto Volume.
  "vincularEmLote",
  "atualizarVinculo",
  "trocarVinculosEmLote",
  "desvincularEmLote",
];

/**
 * ALOCAR E DESALOCAR PELA FICHA são a EXCEÇÃO entre as escritas, por decisão do diretor (28/08/2026):
 * abertas a QUALQUER autenticado, como o resto do trabalho.
 *
 * POR QUE ESTE TESTE EXISTE, e não é formalidade: reivindicar estas duas de volta para o menu
 * `alto-volume` reproduz exatamente o defeito que a decisão corrigiu. O menu é do Gerencial e nasce
 * só para o SUPER_ADMIN (§A.23), então o consultor COMUM tomava 403 para corrigir a alocação, embora
 * já alocasse no ato pela Liberação e pelo wizard (insert de origem LIBERACAO, dentro de
 * `liberar`/`criar`, sem menu). Se alguém fechar de novo, quebra aqui antes de ir ao ar.
 */
const ALOCACAO_PELA_FICHA = ["vincular", "desvincular"];

/**
 * As leituras da ONDA 3 são gatadas por menu, ao contrário de `list`/`obter`. Elas devolvem NOME DE
 * CANDIDATO e servem só à conferência do projeto: nenhuma tela da operação as consome, então não há
 * o risco de 403 que obrigou a deixar o cadastro aberto (§A.6).
 */
const LEITURAS_DE_VINCULO = ["listarVinculos", "listarOrfaos"];

/**
 * A ANÁLISE é leitura AGREGADA e fica ABERTA, ao contrário das duas acima. Ela devolve contagem,
 * código e rótulo de catálogo (cargo, cliente), sem CPF e sem nome de candidato, e a tela que a
 * consome deixou de ser do Menu Gerencial: virou a visão "Alto Volume" do Controle Gerencial
 * (`/diretoria/alto-volume`), governada pelo menu `diretoria` no guard de rota. Reivindicá-la para
 * `alto-volume` faria quem tem o painel liberado tomar 403 dentro da própria tela.
 */
const LEITURA_AGREGADA = ["analisar"];

/**
 * A LEITURA QUE DEVOLVE NOME (o modal "Ver Pessoas" do quadro por loja) é reivindicada pelo menu
 * `diretoria`, e NÃO pelo `alto-volume`.
 *
 * Os dois lados importam. Sem reivindicação nenhuma, a rota ficaria alcançável por qualquer
 * autenticado pela URL, devolvendo nome de candidato: é o mesmo defeito que `GerencialController.nomes`
 * já corrigiu. Reivindicada para `alto-volume`, quem tem o Controle Gerencial liberado tomaria 403
 * DENTRO do painel, que é o defeito que a nota do `analisar` documenta. O menu certo é o da tela.
 */
const LEITURA_COM_NOME = ["pessoasDaLoja"];

describe("Alto Volume: classe sem @Roles (a régua que derrubou a Liberação não pode voltar)", () => {
  it("a controller NÃO tem @Roles em classe", () => {
    expect(Reflect.getMetadata(ROLES_KEY, AltoVolumeController)).toBeUndefined();
  });

  it("nenhum método tem @Roles: quem governa a escrita é o MENU", () => {
    const proto = AltoVolumeController.prototype as unknown as Record<string, unknown>;
    for (const m of [
      ...ESCRITAS,
      ...ALOCACAO_PELA_FICHA,
      ...LEITURAS_DE_VINCULO,
      ...LEITURA_AGREGADA,
      ...LEITURA_COM_NOME,
      "list",
      "obter",
    ]) {
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

  it("alocar e desalocar PELA FICHA ficam abertas: é trabalho de qualquer consultor", () => {
    for (const m of ALOCACAO_PELA_FICHA) {
      expect(menuDaOperacao("AltoVolumeController", m), `alocação ${m}`).toBeNull();
    }
  });

  /**
   * O RECORTE É O PONTO: soltar a alocação NÃO pode soltar o cadastro junto. Se alguém tirar do menu
   * uma operação a mais, este teste quebra.
   */
  it("soltar a alocação não solta o cadastro: as demais escritas seguem fechadas", () => {
    for (const m of ["create", "update", "remove", "criarGrupo", "criarVaga", "vincularEmLote"]) {
      expect(menuDaOperacao("AltoVolumeController", m), `ainda fechada: ${m}`).toBe("alto-volume");
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

  /**
   * Se alguém reivindicar `analisar` para o menu `alto-volume` de novo, este teste quebra ANTES de a
   * visão "Alto Volume" do Controle Gerencial começar a responder 403 para quem tem o painel.
   */
  it("a leitura que devolve NOME é reivindicada pelo menu da TELA (diretoria), nunca aberta", () => {
    for (const m of LEITURA_COM_NOME) {
      // Não pode ser do `alto-volume`: daria 403 dentro do próprio painel.
      expect(menuDaOperacao("AltoVolumeController", m), `nome ${m}`).not.toBe("alto-volume");
      // E não pode ser aberta: é nome de pessoa.
      expect(menuDaOperacao("AltoVolumeController", m), `nome ${m}`).toBe("diretoria");
    }
  });

  it("a ANÁLISE (visão do Controle Gerencial) é leitura agregada e NÃO é reivindicada por menu", () => {
    for (const m of LEITURA_AGREGADA) {
      expect(menuDaOperacao("AltoVolumeController", m), `leitura ${m}`).toBeNull();
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
