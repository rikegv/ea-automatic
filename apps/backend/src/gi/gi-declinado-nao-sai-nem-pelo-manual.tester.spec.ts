import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { AuthUser } from "../auth/auth.types";
import {
  EnviarParaGiService,
  type GiEnvioResultado,
} from "./enviar-para-gi.service";
import { EnviarParaGiController } from "./enviar-para-gi.controller";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import type { GiLeitorService } from "./gi-leitor.service";
import { DE_PARA_GI_VAZIO, type FuncionarioSelecao } from "../domain/portal-dados-gi";
import { PAR_CONHECIDO, PESSOA, contratacaoDeFolhaCompleta } from "./gi-automatico.arnes";

/**
 * INVARIANTE 2: DECLINADO E RESCINDIDO NÃO SAEM POR CAMINHO NENHUM, NEM PELO BOTÃO MANUAL.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO do diretor (§A.38 / §A.40 regra 2), ENQUANTO o
 * `backend` escreve o código. Medido em 06/10/2026, ANTES da correção: `enviarManual` vai DIRETO a
 * `enviarComGuardas`, e `admissaoOperavel` é consultada SÓ dentro de `enviar()`, o automático. Então
 * os testes deste arquivo DEVEM falhar agora, e passar quando a guarda subir para a cadeia comum.
 *
 * ┌─ A DECISÃO QUE ESTE ARQUIVO TRAVA, e ela CORRIGE um registro anterior ────────────────────────┐
 * │ O `seguranca` levantou a assimetria e o coordenador a registrou como "ato humano deliberado":  │
 * │ o controller até documenta que "um MASTER pode, deliberadamente, mandar à folha uma admissão    │
 * │ declinada". O DIRETOR DECIDIU O CONTRÁRIO: declinado e rescindido não saem por caminho nenhum,  │
 * │ nem por SUPER_ADMIN. Quem quiser enviar um declinado MUDA O FAROL ANTES, e é o desfecho da      │
 * │ recusa que tem de dizer isso, senão vira "o botão não funciona".                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ONDE A GUARDA TEM DE MORAR, e por que o teste mede os DOIS caminhos ─────────────────────────┐
 * │ Em `enviarComGuardas`, que é o ponto por onde os DOIS gatilhos passam e o único que alcança     │
 * │ `criarFuncionarioSelecao`. Posta só em `enviarManual`, ela vira a TERCEIRA cópia da mesma régua │
 * │ (automático, manual, e o próximo caminho que nascer), e duas cadeias de guarda divergem no      │
 * │ primeiro ajuste: a que divergir para o lado permissivo é a que manda gente errada para a folha. │
 * │ Por isso o arquivo mede o manual E reafirma o automático: o conserto não pode consertar um lado │
 * │ e afrouxar o outro.                                                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: toda entrada é SINTÉTICA, reusada do arnês (CPF da faixa reservada 999, classe que a Receita
 * nunca emitiu, nome inventado, domínio de homologação). §A.11: nenhum travessão.
 */

afterEach(() => vi.restoreAllMocks());

const ADM = "55555555-5555-5555-5555-555555555555";

/** O MASTER que clica o botão. §A.6: e-mail de domínio de homologação, id sintético. */
const MASTER: AuthUser = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "master@homolog.local",
  papel: "MASTER",
  senhaTemporaria: false,
};

const SUPER_ADMIN: AuthUser = { ...MASTER, papel: "SUPER_ADMIN", email: "super@homolog.local" };

interface EstadoDoCenario {
  farolGlobal: string;
  pausadaEm?: Date | null;
}

/**
 * O serviço do GI INTEIRO, no estado MAIS PERIGOSO: configurado, `GI_DISPARO_ARMADO` ARMADA, pessoa
 * presente, contratação que passa as seis guardas do passo 6, idempotência limpa, origem AUTORIZADA
 * (`MANUAL`, o fluxo novo). A ÚNICA variável é o farol, ou a pausa.
 *
 * ⚠️ A ORIGEM É `MANUAL` DE PROPÓSITO, e isso é o que torna o teste honesto: com `PANDAPE` a trava de
 * origem (invariante 1) daria zero por OUTRO motivo, e o arquivo passaria sem a guarda de farol
 * existir. Cada invariante tem de ser a única variável do seu experimento.
 *
 * O estado é servido por VÁRIOS nomes de porta de propósito, e o contexto também é oferecido na
 * chamada: o `backend` está escrevendo a plumbing agora, e o teste mede a REGRA, não a forma de
 * passar o dado. Nome que não casar simplesmente não é chamado (§A.40: nome trocado não pode queimar
 * uma rodada).
 */
function servicoArmado(estado: EstadoDoCenario) {
  const linha = {
    farolGlobal: estado.farolGlobal,
    pausadaEm: estado.pausadaEm ?? null,
    origem: "MANUAL",
  };
  const criar = vi.fn(
    async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
      ok: true,
      funcionarioSelecaoId: "GI-SINTETICO",
    }),
  );
  const marcarEnviado = vi.fn(async () => {});
  const giApi = {
    configurado: () => true,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => false,
    lerPessoa: async () => PESSOA,
    lerContratacao: async () => contratacaoDeFolhaCompleta(),
    marcarEnviado,
    lerEstadoParaEnvio: async () => linha,
    lerEstado: async () => linha,
    lerOrigem: async () => linha.origem,
  } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: "true" })[k],
  } as unknown as ConfigService;
  return { svc: new EnviarParaGiService(config, giApi, leitor, depara), criar, marcarEnviado, linha };
}

/**
 * O clique do botão, pela porta manual.
 *
 * O CONTEXTO VAI JUNTO por cast: hoje `enviarManual(id, autorId)` tem dois parâmetros, e o `backend`
 * pode precisar de um terceiro para receber o estado do chamador (é assim que o automático recebe o
 * farol). Em JavaScript, argumento a mais numa função de dois é ignorado, então a chamada funciona
 * nas duas assinaturas e o teste não reprova por FORMA.
 */
function clicar(
  svc: EnviarParaGiService,
  estado: EstadoDoCenario,
  autorId = MASTER.id,
): Promise<GiEnvioResultado> {
  const porta = svc.enviarManual as unknown as (
    id: string,
    autor: string,
    contexto?: unknown,
  ) => Promise<GiEnvioResultado>;
  return porta.call(svc, ADM, autorId, {
    farolGlobal: estado.farolGlobal,
    pausadaEm: estado.pausadaEm ?? null,
    autorId,
  });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O CANÁRIO: farol VIVO e não pausada, pela porta MANUAL, ENVIA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("CANARIO: farol VIVO e nao pausada ENVIA pelo botao manual", () => {
  /**
   * Sem este bloco, nenhum `not.toHaveBeenCalled()` deste arquivo prova coisa alguma: um dublê
   * quebrado, ou uma guarda nova que recusasse TUDO, faria todos os outros testes passarem por
   * acidente. E recusar tudo não é "seguro": é o botão que não funciona, que foi exatamente o risco
   * que o diretor nomeou ao decidir esta régua.
   */
  for (const farol of ["EM_ADMISSAO", "BANCO_AGUARDAR"]) {
    it(`farol ${farol} (vivo) pelo manual: UM envio e o carimbo`, async () => {
      const { svc, criar, marcarEnviado } = servicoArmado({ farolGlobal: farol });

      const r = await clicar(svc, { farolGlobal: farol });

      expect(
        criar,
        `o botao manual deixou de enviar admissao VIVA (${farol}): a guarda nova recusa o que devia passar`,
      ).toHaveBeenCalledTimes(1);
      expect(marcarEnviado).toHaveBeenCalledTimes(1);
      expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    });
  }

  it("o payload do caminho autorizado e DAQUELA pessoa", async () => {
    const { svc, criar } = servicoArmado({ farolGlobal: "EM_ADMISSAO" });

    await clicar(svc, { farolGlobal: "EM_ADMISSAO" });
    const payload = criar.mock.calls[0]?.[0] as FuncionarioSelecao | undefined;

    expect(payload?.cpf, "passou a guarda e o payload saiu sem a pessoa").toBe(PESSOA.cpf);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A REGRA: farol NÃO VIVO não sai pelo MANUAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 2: declinado e rescindido nao saem pelo botao MANUAL", () => {
  /**
   * O DIRETOR DECIDIU DUAS PALAVRAS, e a lista e exatamente ela: "declinado e rescindido nao saem por
   * caminho nenhum, nem por Super Admin". `ADMISSAO_CONCLUIDA` SAIU desta lista em 06/10/2026, e nao
   * por desleixo: a regua `admissaoOperavel` barraria tambem as **2002** admissoes concluidas da base
   * (1550 MANUAL + 452 PANDAPE), **todas nunca enviadas ao GI**, que sao precisamente quem TEM de
   * estar na folha. O farol e flag manual e PEGAJOSA, entao marcado antes do envio nenhum gatilho
   * enviaria mais, para sempre. Barrar ali deixaria de ser trava e viraria defeito.
   *
   * A regua implementada e `admissaoEncerrada` (so DECLINOU e RESCISAO), e nao `admissaoOperavel`.
   * As duas perguntas que SOBRARAM estao com o diretor e vivem como `it.todo` logo abaixo: concluida
   * sai pelo manual? pausada sai pelo manual? Enquanto ele nao responde, nada aqui assere nenhum dos
   * dois lados, para o teste nao congelar uma decisao que nao foi tomada.
   */
  const NAO_VIVOS = ["DECLINOU", "RESCISAO"];

  for (const farol of NAO_VIVOS) {
    it(`farol ${farol}: ZERO chamada ao cliente do GI, com a flag ARMADA`, async () => {
      const { svc, criar, marcarEnviado } = servicoArmado({ farolGlobal: farol });

      const r = await clicar(svc, { farolGlobal: farol });

      expect(
        criar,
        `farol ${farol} foi para a folha pelo botao manual: a guarda de operabilidade nao cobre a porta manual`,
      ).not.toHaveBeenCalled();
      expect(marcarEnviado, "carimbou envio que nao aconteceu").not.toHaveBeenCalled();
      expect(r.enviado).toBe(false);
      expect(r.motivo, "o desfecho precisa de um motivo fechado para a trilha").toBeTruthy();
    });

    it(`farol ${farol}: o desfecho NAO diz "enviado", e e por isso que ele vira texto de tela`, async () => {
      /**
       * O desfecho é CÓDIGO FECHADO e vai para a tela do time. A consequência operacional é
       * intencional (quem quiser enviar um declinado muda o farol antes), então o motivo tem de
       * distinguir "recusei por estado da admissão" de "falhei". `GI_FALHA_ENVIO` aqui seria mentira:
       * nada falhou, a régua recusou.
       */
      const { svc } = servicoArmado({ farolGlobal: farol });

      const r = await clicar(svc, { farolGlobal: farol });

      // A asserção de que NÃO enviou vem primeiro de propósito: sem ela, um `motivo` de sucesso
      // (`GI_ENVIADO`) satisfaria o `not.toBe("GI_FALHA_ENVIO")` e o teste passaria tendo mandado a
      // pessoa para a folha, que é o oposto do que ele existe para medir.
      expect(r.enviado, `farol ${farol} foi enviado`).toBe(false);
      expect(r.motivo, "recusa por farol virou falha de envio: a tela diria que o GI caiu").not.toBe(
        "GI_FALHA_ENVIO",
      );
    });
  }

  // PENDENTE DE DECISAO DO DIRETOR (06/10/2026), ver o cabecalho deste describe. Medido: ZERO
  // admissoes pausadas na base inteira, entao a decisao nao tem efeito imediato nenhum.
  it.todo("PERGUNTA AO DIRETOR: admissao PAUSADA sai pelo botao manual?");
  it.todo("PERGUNTA AO DIRETOR: farol ADMISSAO_CONCLUIDA sai pelo botao manual? (2002 admissoes)");

  it.skip("admissao PAUSADA nao sai pelo manual, mesmo com o farol VIVO", async () => {
    /**
     * A pausa é sobre o CLIENTE. AUDITAR admissão pausada continua permitido (decisão do diretor, o
     * trabalho interno de análise não para); MANDAR PARA A FOLHA do fornecedor, não. São perguntas
     * diferentes, e `admissaoOperavel` cobre as duas de uma vez, que é a razão de a régua ser única.
     */
    const pausada = { farolGlobal: "EM_ADMISSAO", pausadaEm: new Date("2026-10-01T12:00:00Z") };
    const { svc, criar } = servicoArmado(pausada);

    const r = await clicar(svc, pausada);

    expect(criar, "uma admissao PAUSADA foi mandada para a folha pelo botao manual").not.toHaveBeenCalled();
    expect(r.enviado).toBe(false);
  });

  it("nem SUPER_ADMIN passa: o papel nao abre excecao a esta regra", async () => {
    /**
     * Esta é a parte da decisão que CORRIGE o registro anterior: o padrão "responsabilização, não
     * verificação técnica" do §A.5 NÃO se aplica aqui, por decisão do diretor. Não há papel que mande
     * um declinado para a folha, e o teste mede isso pelo autor do ato.
     */
    for (const user of [MASTER, SUPER_ADMIN]) {
      const { svc, criar } = servicoArmado({ farolGlobal: "DECLINOU" });

      await clicar(svc, { farolGlobal: "DECLINOU" }, user.id);

      expect(
        criar,
        `${user.papel} mandou um DECLINOU para a folha: o papel esta abrindo excecao a uma regra que nao tem excecao`,
      ).not.toHaveBeenCalled();
    }
  });

  it("pelo CONTROLLER do botao (o caminho real do clique do MASTER): ZERO envio", async () => {
    /**
     * POR QUE PASSAR PELO CONTROLLER, e não só pelo serviço: o requisito do diretor é sobre o BOTÃO.
     * O controller é quem monta a chamada a partir do `@CurrentUser()`, e é nele que mora, hoje, o
     * comentário que autoriza o MASTER a mandar um declinado. Se a guarda exigir dado que o
     * controller não passa, o serviço recusaria por ausência e o teste do serviço passaria por
     * acidente: aqui ele passa ou falha pelo caminho de verdade.
     */
    const { svc, criar } = servicoArmado({ farolGlobal: "DECLINOU" });
    const controller = new EnviarParaGiController(svc);

    const r = (await controller.enviar(ADM, MASTER)) as GiEnvioResultado;

    expect(
      criar,
      "o clique do MASTER no botao mandou um DECLINOU para a folha: a guarda nao esta no caminho do controller",
    ).not.toHaveBeenCalled();
    expect(r.enviado).toBe(false);
  });

  it("pelo CONTROLLER, admissao VIVA continua enviando (o botao nao virou enfeite)", async () => {
    const { svc, criar } = servicoArmado({ farolGlobal: "EM_ADMISSAO" });
    const controller = new EnviarParaGiController(svc);

    const r = (await controller.enviar(ADM, MASTER)) as GiEnvioResultado;

    expect(criar, "o botao parou de enviar admissao viva: o conserto virou bloqueio geral").toHaveBeenCalledTimes(1);
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A OUTRA METADE: o conserto do manual não pode afrouxar o automático
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("o automatico CONTINUA recusando farol nao vivo e pausada (nenhum lado afrouxa)", () => {
  /**
   * Duplicação proposital com `gi-automatico-so-com-flag-e-operavel.tester.spec.ts`, e o motivo é o
   * desenho da correção: a guarda vai MUDAR DE LUGAR (de `enviar` para a cadeia comum). Mudança de
   * lugar é exatamente a hora em que um dos dois lados é esquecido, e reafirmar aqui faz o par ser
   * medido na mesma rodada e no mesmo arquivo.
   */
  for (const farol of ["DECLINOU", "RESCISAO", "ADMISSAO_CONCLUIDA"]) {
    it(`automatico com farol ${farol}: ZERO envio`, async () => {
      const { svc, criar } = servicoArmado({ farolGlobal: farol });

      const r = await svc.enviar(ADM, { farolGlobal: farol, pausadaEm: null, autorId: MASTER.id });

      expect(criar, `o automatico passou a enviar farol ${farol}`).not.toHaveBeenCalled();
      expect(r.enviado).toBe(false);
    });
  }

  it("automatico com admissao PAUSADA: ZERO envio", async () => {
    const { svc, criar } = servicoArmado({ farolGlobal: "EM_ADMISSAO" });

    const r = await svc.enviar(ADM, {
      farolGlobal: "EM_ADMISSAO",
      pausadaEm: new Date("2026-10-01T12:00:00Z"),
      autorId: MASTER.id,
    });

    expect(criar, "o automatico passou a enviar admissao pausada").not.toHaveBeenCalled();
    expect(r.enviado).toBe(false);
  });

  it("automatico com admissao VIVA: continua enviando", async () => {
    const { svc, criar } = servicoArmado({ farolGlobal: "EM_ADMISSAO" });

    await svc.enviar(ADM, { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: MASTER.id });

    expect(criar, "o conserto do manual travou o gatilho automatico").toHaveBeenCalledTimes(1);
  });
});
