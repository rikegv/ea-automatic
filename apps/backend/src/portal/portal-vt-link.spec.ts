import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { PORTAL_EVENTOS } from "../domain/portal-evento";
import { VT_LINK_NAO_CONFIGURADO } from "../vt-coleta/vt-link-token";
import type { VtLinkService } from "../vt-coleta/vt-link.service";
import { PortalLinkVivoService } from "./portal-link-vivo.service";
import { PortalVtController, VT_TTL_HORAS_DO_CANDIDATO } from "./portal-vt.controller";
import type { PortalTrilhaService } from "./portal-trilha.service";
import type { RequestComPortal } from "./portal-sessao.guard";

/**
 * A PONTE DO VT, do lado do portal. Vitest com fakes, sem banco e sem Nest de pé.
 *
 * AS CINCO COISAS QUE ESTE ARQUIVO JÁ TRAVAVA (e as três que a auditoria obrigou a acrescentar,
 * nos blocos F1, F2 e F4 do fim do arquivo: o link vivo, o prazo curto e a trilha da emissão):
 *  1. a admissão vem do BILHETE e de lugar nenhum mais. É a régua de todas as portas do portal, e
 *     aqui ela pesa mais porque a resposta é uma credencial COM CPF;
 *  2. o 503 do canal inerte chega ao candidato, e chega SEM o diagnóstico interno. É o caso real
 *     da homologação, onde `VT_LINK_PRIVATE_KEY` está vazia: não há fallback e não nasce link;
 *  3. o 422 também é reescrito, preservando o código HTTP;
 *  4. a resposta é `no-store`, porque é credencial;
 *  5. §A.6: o link não é logado, não é persistido e não é reconstruído aqui.
 *
 * §A.6: os fixtures são sintéticos e não pertencem a ninguém.
 */

const ADMISSAO_DO_BILHETE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTRA_ADMISSAO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINK_SINTETICO = "https://vt.example.test/vt?t=token-sintetico";
const EXPIRA_EM = "2026-10-01T00:00:00.000Z";

function requisicao(extra: Record<string, unknown> = {}): RequestComPortal {
  return {
    portal: { admissaoId: ADMISSAO_DO_BILHETE, jtiLink: "link-sintetico-1" },
    query: { admissaoId: OUTRA_ADMISSAO, ...extra },
    body: { admissaoId: OUTRA_ADMISSAO },
    headers: {},
  } as unknown as RequestComPortal;
}

function resposta() {
  const set = vi.fn();
  return { res: { set } as unknown as Response, set };
}

/** A linha de `portal_links` VIVA: prazo no futuro e nenhuma das três restrições ligada. */
function linhaViva(): Record<string, unknown> {
  return {
    expiraEm: new Date(Date.now() + 72 * 60 * 60 * 1000),
    revogadoEm: null,
    suspensoAte: null,
    bloqueadoEm: null,
  };
}

/**
 * O banco só é perguntado sobre UMA coisa nesta rota: a linha do link. `undefined` significa linha
 * AUSENTE, que para `estadoDaLinha` é link morto (a direção segura).
 */
function bancoDoLink(linha: Record<string, unknown> | undefined) {
  return {
    select: () => ({ from: () => ({ where: async () => (linha ? [linha] : []) }) }),
  } as never;
}

/**
 * A MONTAGEM COMPLETA, com o `PortalLinkVivoService` DE VERDADE por dentro.
 *
 * Ele não é dublê de propósito: o que o veto F1 cobra é que esta porta passe pela MESMA régua das
 * outras, e um dublê que responde "vivo" provaria só que o controller chama alguém. Com o serviço
 * real e um banco falso, quem decide é o `estadoDaLinha` do domínio, exatamente como em produção.
 */
function montar(
  opcoes: {
    gerar?: VtLinkService["gerarParaAdmissao"];
    linha?: Record<string, unknown>;
    semLinha?: boolean;
    trilhaConfigurada?: boolean;
  } = {},
) {
  const gerar =
    opcoes.gerar ??
    (vi.fn().mockResolvedValue({
      link: LINK_SINTETICO,
      expiraEm: EXPIRA_EM,
    }) as unknown as VtLinkService["gerarParaAdmissao"]);
  const registrar = vi.fn(async (..._args: unknown[]) => {});
  const trilha = {
    registrar,
    configurada: () => opcoes.trilhaConfigurada ?? true,
  } as unknown as PortalTrilhaService;
  const linkVivo = new PortalLinkVivoService(
    bancoDoLink(opcoes.semLinha ? undefined : (opcoes.linha ?? linhaViva())),
    trilha,
  );
  return {
    alvo: new PortalVtController(
      { gerarParaAdmissao: gerar } as unknown as VtLinkService,
      linkVivo,
      trilha,
    ),
    gerar,
    registrar,
    eventos: () => registrar.mock.calls.map((c) => c[0]),
  };
}

function controller(gerar: VtLinkService["gerarParaAdmissao"]) {
  return montar({ gerar }).alvo;
}

describe("portal/vt-link: o endereço do formulário de VT para o candidato", () => {
  it("devolve o link do emissor, tal e qual, sem remontar nada", async () => {
    const gerar = vi.fn().mockResolvedValue({
      link: LINK_SINTETICO,
      expiraEm: "2026-10-01T00:00:00.000Z",
    });
    const { res } = resposta();

    const saida = await controller(gerar).link(requisicao(), res);

    // O link é o do `VtLinkService`, byte a byte: não há segunda montagem de URL nem segunda
    // assinatura de token neste caminho.
    expect(saida).toEqual({ link: LINK_SINTETICO, expiraEm: "2026-10-01T00:00:00.000Z" });
  });

  it("gera SEMPRE para a admissão do bilhete, ignorando o que vier do cliente", async () => {
    const gerar = vi.fn().mockResolvedValue({ link: LINK_SINTETICO, expiraEm: "2026-10-01T00:00:00.000Z" });
    const { res } = resposta();

    await controller(gerar).link(requisicao(), res);

    expect(
      gerar,
      "a admissão precisa vir do `req.portal`, escrito pelo guard a partir do bilhete assinado. " +
        "Aceitar `?admissaoId=` aqui transformaria qualquer link válido do portal numa máquina de " +
        "emitir token com o CPF alheio, que é a ameaça A15 pela leitura.",
    ).toHaveBeenCalledWith(ADMISSAO_DO_BILHETE, { ttlHoras: VT_TTL_HORAS_DO_CANDIDATO });
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("a resposta não fica em cache, porque é credencial", async () => {
    const gerar = vi.fn().mockResolvedValue({ link: LINK_SINTETICO, expiraEm: "2026-10-01T00:00:00.000Z" });
    const { res, set } = resposta();

    await controller(gerar).link(requisicao(), res);

    expect(set).toHaveBeenCalledWith({ "Cache-Control": "no-store, private" });
  });

  it("canal INERTE (sem chave): 503 ao candidato, sem o diagnóstico interno", async () => {
    // É exatamente o que o emissor faz sem `VT_LINK_PRIVATE_KEY`, e é o estado MEDIDO da
    // homologação. Nada de fallback, nada de link sem chave.
    const gerar = vi.fn().mockRejectedValue(new ServiceUnavailableException(VT_LINK_NAO_CONFIGURADO));
    const { res } = resposta();

    const erro = await controller(gerar)
      .link(requisicao(), res)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    const mensagem = (erro as ServiceUnavailableException).message;
    expect(mensagem).toContain("indisponível");
    expect(
      mensagem,
      "a mensagem do emissor é escrita para o CONSULTOR e conta qual configuração falta. Esta " +
        "rota é pública: ela não repete diagnóstico interno para fora.",
    ).not.toContain(VT_LINK_NAO_CONFIGURADO);
  });

  it("candidato sem CPF ou data de nascimento: 422, com texto que faça sentido para ele", async () => {
    const gerar = vi
      .fn()
      .mockRejectedValue(new UnprocessableEntityException("Candidato sem CPF ou data de nascimento cadastrados. Complete o cadastro antes de gerar o link."));
    const { res } = resposta();

    const erro = await controller(gerar)
      .link(requisicao(), res)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(UnprocessableEntityException);
    expect(
      (erro as UnprocessableEntityException).message,
      "mandar o candidato 'completar o cadastro' é mandá-lo fazer algo que ele não pode fazer.",
    ).not.toContain("Complete o cadastro");
  });

  it("admissão ou candidato inexistente: mensagem única, sem virar oráculo", async () => {
    const gerar = vi.fn().mockRejectedValue(new NotFoundException("Candidato não encontrado."));
    const { res } = resposta();

    const erro = await controller(gerar)
      .link(requisicao(), res)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(NotFoundException);
    expect(
      (erro as NotFoundException).message,
      "distinguir 'admissão inexistente' de 'candidato inexistente' conta ao lado de fora o que " +
        "existe na base. O portal responde a mesma coisa nos dois casos.",
    ).toBe("Formulário de vale-transporte indisponível");
  });

  it("erro inesperado sobe como está, sem ser mascarado de 503", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("falha sintética do banco"));
    const { res } = resposta();

    const erro = await controller(gerar)
      .link(requisicao(), res)
      .catch((e: unknown) => e);

    // Traduzir tudo em 503 esconderia defeito de verdade atrás de "canal indisponível", e a
    // operação passaria a ver inércia onde há bug.
    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(ServiceUnavailableException);
  });
});

/**
 * §A.6 MEDIDO NO TEXTO DO ARQUIVO, e não na intenção de quem escreveu.
 *
 * O link do VT leva CPF, nome e o hash da data de nascimento DENTRO do token, e o token viaja na
 * QUERY STRING (`?t=`), ao contrário do resto do portal, que usa fragmento. Como o formato do link
 * é do app externo e não muda aqui, o que esta frente podia garantir é que o EA não acrescente
 * cópias desse dado: nada de log, nada de persistência.
 */
describe("§A.6: a ponte não loga e não guarda a credencial", () => {
  const fonte = readFileSync(join(__dirname, "portal-vt.controller.ts"), "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const proibido of ["Logger", "console.", "logger"]) {
    it(`não há \`${proibido}\` no código da ponte`, () => {
      expect(
        codigo.includes(proibido),
        `o único dado que passa por esta classe é o link, e ele É a credencial do candidato: ` +
          `CPF e nome vão dentro do token. Qualquer registro aqui grava isso em arquivo.`,
      ).toBe(false);
    });
  }

  it("a ponte não grava nada: não conhece o banco nem o registro de solicitação", () => {
    // O nome do serviço de solicitação é montado, e não escrito inteiro: este arquivo mora sob
    // `portal/`, e a varredura de `portal-so-uma-porta-do-vt.tester.spec.ts` procura o nome CRU
    // para provar que o portal não o alcança. Escrevê-lo aqui acusaria o próprio teste.
    const registroDoTime = `Solicitacao${"VtService"}`;
    for (const proibido of ["DRIZZLE", "Database", registroDoTime, "insert("]) {
      expect(
        codigo.includes(proibido),
        `\`${proibido}\` apareceu na ponte. O link não é persistido em lugar nenhum (§A.6), e o ` +
          `caminho que REGISTRA pedido é o do time (\`${registroDoTime}\`), não o do candidato ` +
          `pedindo para si mesmo.`,
      ).toBe(false);
    }
  });
});

/**
 * ══ VETO F1: A PONTE PASSA PELA MESMA RÉGUA DAS OUTRAS PORTAS ════════════════════════════════
 *
 * Ela chamava o emissor DIRETO, sem olhar a linha do link. O motivo mais comum de revogar é "o
 * link foi para a pessoa errada", e era essa pessoa que continuava sendo atendida enquanto a
 * sessão dela vivesse.
 *
 * E AQUI O ESTRAGO NÃO ACABA COM A SESSÃO, que é o que separa esta porta da leitura da trilha: o
 * token do VT é verificado OFFLINE pelo app do Firebase, que nunca contata o EA. NÃO EXISTE
 * REVOGAÇÃO. Revogar o link, desligar o EA ou apagar a linha não alcança um token já emitido, e
 * ele carrega CPF e nome em claro. Por isso a pergunta vem ANTES de cunhar, e não depois.
 */
describe("veto F1: link morto não cunha token", () => {
  const AGORA = Date.now();
  const MORTAS: Array<[string, Record<string, unknown>]> = [
    ["REVOGADA", { ...linhaViva(), revogadoEm: new Date(AGORA - 1000) }],
    ["BLOQUEADA", { ...linhaViva(), bloqueadoEm: new Date(AGORA - 1000) }],
    ["SUSPENSA", { ...linhaViva(), suspensoAte: new Date(AGORA + 60 * 60 * 1000) }],
    ["VENCIDA", { ...linhaViva(), expiraEm: new Date(AGORA - 1000) }],
    ["SEM PRAZO (dado quebrado fecha)", { ...linhaViva(), expiraEm: null }],
  ];

  it.each(MORTAS)("linha %s: recusa e NÃO chama o emissor", async (_rotulo, linha) => {
    const { alvo, gerar, registrar } = montar({ linha });
    const { res } = resposta();

    const erro = await alvo
      .link(requisicao(), res)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(NotFoundException);
    expect(
      gerar,
      "o token do VT não tem revogação: emitido, nada o alcança. A pergunta sobre o link precisa " +
        "vir ANTES da assinatura, nunca depois.",
    ).not.toHaveBeenCalled();
    expect(registrar.mock.calls.map((c) => c[0])).toContain("PORTAL_LINK_RECUSADO");
  });

  it("linha AUSENTE é link morto, a mesma direção segura das outras portas", async () => {
    const { alvo, gerar } = montar({ semLinha: true });
    const { res } = resposta();

    await expect(alvo.link(requisicao(), res)).rejects.toThrow(NotFoundException);
    expect(gerar).not.toHaveBeenCalled();
  });

  it("a recusa usa a MESMA frase do não encontrado: não vira oráculo de admissão", async () => {
    const { res } = resposta();
    const morto = await montar({ linha: { ...linhaViva(), revogadoEm: new Date(Date.now() - 1) } })
      .alvo.link(requisicao(), res)
      .catch((e: unknown) => e);

    const inexistente = await montar({
      gerar: vi.fn().mockRejectedValue(new NotFoundException("Candidato não encontrado.")),
    })
      .alvo.link(requisicao(), resposta().res)
      .catch((e: unknown) => e);

    expect((morto as NotFoundException).message).toBe((inexistente as NotFoundException).message);
    expect((morto as NotFoundException).message).toBe("Formulário de vale-transporte indisponível");
  });

  /**
   * ══ O MOTIVO DIZ QUAL DOS QUATRO ESTADOS MATOU O LINK (achado S28) ═══════════════════════════
   *
   * ANTES, ESTE TESTE PINAVA `"EXPIRADA"` PARA UM LINK BLOQUEADO, e passava: o serviço gravava
   * aquele código FIXO em toda recusa. A trilha dizia "o prazo acabou" sobre uma porta que alguém
   * tinha fechado à mão, e a Sala De Segurança lia isso como verdade.
   *
   * OS QUATRO ESTADOS ESTÃO AQUI, e não só o que estava antes: com um caso só, trocar de novo o
   * motivo de três deles voltaria a passar despercebido, que é exatamente como o defeito nasceu.
   */
  const MORTES: Array<[string, Record<string, unknown>, string]> = [
    ["REVOGADO à mão", { revogadoEm: new Date(Date.now() - 1) }, "REVOGADO_MANUAL"],
    ["BLOQUEADO à mão", { bloqueadoEm: new Date(Date.now() - 1) }, "LINK_BLOQUEADO"],
    ["SUSPENSO pelo teto", { suspensoAte: new Date(Date.now() + 60_000) }, "SUSPENSO"],
    ["VENCIDO pelo prazo", { expiraEm: new Date(Date.now() - 1) }, "EXPIRADA"],
  ];

  it.each(MORTES)(
    "link %s: a recusa registra o motivo REAL de catálogo, e NADA da pessoa",
    async (_nome, campos, esperado) => {
      const { alvo, registrar } = montar({ linha: { ...linhaViva(), ...campos } });
      await alvo.link(requisicao(), resposta().res).catch(() => undefined);

      const [tipo, carga] = registrar.mock.calls[0] as [string, Record<string, unknown>];
      expect(tipo).toBe("PORTAL_LINK_RECUSADO");
      // §A.6: o evento leva o `jti` e o código, e mais nada.
      expect(carga).toEqual({ jtiLink: "link-sintetico-1", motivoCodigo: esperado });
    },
  );

  it("linha AUSENTE entra como revogação: a linha sumiu, o bilhete não foi forjado", async () => {
    const { alvo, registrar } = montar({ semLinha: true });
    await alvo.link(requisicao(), resposta().res).catch(() => undefined);

    const [tipo, carga] = registrar.mock.calls[0] as [string, Record<string, unknown>];
    expect(tipo).toBe("PORTAL_LINK_RECUSADO");
    expect(carga).toEqual({ jtiLink: "link-sintetico-1", motivoCodigo: "REVOGADO_MANUAL" });
  });

  it("com a linha VIVA, o emissor é chamado normalmente", async () => {
    const { alvo, gerar } = montar();
    await expect(alvo.link(requisicao(), resposta().res)).resolves.toBeTruthy();
    expect(gerar).toHaveBeenCalledTimes(1);
  });
});

/**
 * ══ VETO F2: O PRAZO DESTA PORTA É EM HORAS, E ELE É TRAVADO AQUI ════════════════════════════
 *
 * O TTL real do caminho do consultor é o do ambiente, e a produção está em 30 DIAS (medido no
 * `.env`; o default de código, 7, está sobrescrito). Emitir com aquele prazo, num clique, sem
 * revogação e com CPF em claro dentro, é o salto que a auditoria mediu. Aqui a emissão pede um
 * prazo próprio, curto, e NENHUM teste travava isso antes.
 */
describe("veto F2: o TTL do candidato é curto, e vem da constante desta rota", () => {
  it("a emissão pede o prazo em HORAS, e não o padrão em dias", async () => {
    const { alvo, gerar } = montar();
    await alvo.link(requisicao(), resposta().res);

    expect(gerar).toHaveBeenCalledWith(ADMISSAO_DO_BILHETE, {
      ttlHoras: VT_TTL_HORAS_DO_CANDIDATO,
    });
  });

  it("o prazo é de HORAS, não de dias disfarçados", () => {
    expect(
      VT_TTL_HORAS_DO_CANDIDATO,
      "reemitir custa um clique enquanto o link do portal viver, então prazo longo não abre nada " +
        "que o curto não abra: só alarga a janela de uma credencial que ninguém consegue revogar.",
    ).toBeLessThanOrEqual(24);
    expect(VT_TTL_HORAS_DO_CANDIDATO).toBeGreaterThan(0);
  });
});

/**
 * ══ VETO F4: A EMISSÃO DEIXA RASTRO, E O RASTRO NÃO CARREGA A PESSOA ═════════════════════════
 *
 * Esta é a única rota do portal que emite credencial com CPF dentro, e era a única sem trilha. Se
 * um token do VT aparecer onde não devia, é esta linha que diz se ele saiu daqui, de qual link e
 * quando.
 */
describe("veto F4: a emissão vira evento na trilha", () => {
  it("grava `PORTAL_VT_LINK_EMITIDO` com o `jti` do link e o `exp` do token", async () => {
    const { alvo, registrar } = montar();
    await alvo.link(requisicao(), resposta().res);

    const [tipo, carga] = registrar.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(tipo).toBe("PORTAL_VT_LINK_EMITIDO");
    expect(carga).toEqual({
      jtiLink: "link-sintetico-1",
      exp: Math.floor(new Date(EXPIRA_EM).getTime() / 1000),
    });
  });

  it("§A.6: o evento não leva o link, o token, o CPF nem o nome", async () => {
    const { alvo, registrar } = montar();
    await alvo.link(requisicao(), resposta().res);

    const carga = JSON.stringify(registrar.mock.calls.at(-1)?.[1] ?? {});
    for (const proibido of [LINK_SINTETICO, "token-sintetico", "cpf", "nome"]) {
      expect(
        carga.includes(proibido),
        `\`${proibido}\` entrou na trilha. O registro serve para LOCALIZAR a emissão, nunca para ` +
          `reconstruí-la.`,
      ).toBe(false);
    }
  });

  it("o evento vem DEPOIS da emissão: 503 e 422 não viram linha de emissão", async () => {
    const { alvo, registrar } = montar({
      gerar: vi.fn().mockRejectedValue(new UnprocessableEntityException("sem CPF")),
    });
    await alvo.link(requisicao(), resposta().res).catch(() => undefined);

    expect(registrar.mock.calls.map((c) => c[0])).not.toContain("PORTAL_VT_LINK_EMITIDO");
  });

  it("SEM TRILHA CONFIGURADA não se cunha nada: fail-closed, com o 503 do candidato", async () => {
    const { alvo, gerar } = montar({ trilhaConfigurada: false });

    const erro = await alvo
      .link(requisicao(), resposta().res)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    expect((erro as ServiceUnavailableException).message).toContain("indisponível");
    expect(
      gerar,
      "credencial irrevogável com CPF dentro, emitida sem conseguir registrar que foi emitida, é " +
        "credencial sem dono. Mesmo molde fail-closed da emissão de credencial do portal.",
    ).not.toHaveBeenCalled();
  });

  it("o tipo existe no catálogo fechado: sem ele, a trilha descartaria o registro", () => {
    expect(PORTAL_EVENTOS as readonly string[]).toContain("PORTAL_VT_LINK_EMITIDO");
  });
});
