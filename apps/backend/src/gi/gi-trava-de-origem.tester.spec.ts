import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ConfigService } from "@nestjs/config";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import {
  EnviarParaGiService,
  type ContextoEnvioAutomaticoGi,
} from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import type { GiLeitorService } from "./gi-leitor.service";
import { DE_PARA_GI_VAZIO, type FuncionarioSelecao } from "../domain/portal-dados-gi";
import {
  ADM_SELECT,
  PAR_CONHECIDO,
  PESSOA,
  USER,
  contratacaoDeFolhaCompleta,
} from "./gi-automatico.arnes";

/**
 * INVARIANTE 1: A TRAVA DE ORIGEM. Só a admissão do FLUXO NOVO vai para o GI.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO do diretor (§A.38 / §A.40 regra 2), ENQUANTO o
 * `backend` escreve o código.
 *
 * O requisito, nas palavras do diretor: "o gatilho só manda para o GI a admissão do fluxo NOVO. A
 * que veio do webhook do Pandapé NÃO vai, porque o Pandapé já manda para o G.I por fora e mandar de
 * novo duplicaria a pessoa."
 *
 * ┌─ A PERGUNTA QUE ESTE ARQUIVO EXISTE PARA RESPONDER, e ela é a mais cara da frente ────────────┐
 * │ ALLOWLIST ou DENYLIST? A diferença só aparece no TERCEIRO valor: hoje o enum `origem` tem dois  │
 * │ (`MANUAL` e `PANDAPE`), então `!== "PANDAPE"` e `=== "MANUAL"` dão o MESMO resultado, e nenhum  │
 * │ teste de `PANDAPE` distingue os dois. O que distingue é a origem DESCONHECIDA: numa denylist    │
 * │ ela ENVIA (autorizada por omissão), numa allowlist ela NÃO envia. O Digai é uma segunda ATS já  │
 * │ construída e inerte; `origem = "DIGAI"` numa denylist mandaria a pessoa para a folha sem        │
 * │ ninguém decidir, que é o dano que a §A.47 existe para impedir. É o bloco "A ORIGEM              │
 * │ DESCONHECIDA" que reprova a denylist, e nenhum outro.                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE É MEDIDO, em DOIS níveis de propósito ─────────────────────────────────────────────────┐
 * │ (a) PONTA A PONTA: o pós-veredito da auditoria inteiro, com a origem na linha da admissão. É o  │
 * │     nível que mede o REQUISITO ("o gatilho não manda"), e é indiferente a ONDE a trava mora.    │
 * │ (b) NO SERVIÇO, chamando `enviar()` direto. É o nível que diz COMO a trava recusa.              │
 * │ Os dois juntos: se (b) passar e (a) falhar, a trava existe e o gatilho não a alcança, que é o   │
 * │ pior dos mundos e o único que um nível só não distingue.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ESPIÃO É SEMPRE `criarFuncionarioSelecao`, a porta do `POST` para a folha do fornecedor: o
 * requisito fala de EFEITO ("zero chamada ao cliente do GI"), não de forma.
 *
 * §A.6: toda entrada é SINTÉTICA, reusada do arnês (CPF da faixa reservada 999, classe que a Receita
 * nunca emitiu, nome inventado, domínio de homologação). §A.11: nenhum travessão.
 */

afterEach(() => vi.restoreAllMocks());

const ADM = "44444444-4444-4444-4444-444444444444";

/** O contexto do gatilho automático: admissão VIVA e não pausada, para a origem ser a única variável. */
function contextoVivo(): ContextoEnvioAutomaticoGi {
  return { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: "autor-sintetico" };
}

/**
 * O ESTADO DA ADMISSÃO que as travas de envio leem, com a ORIGEM como única variável.
 *
 * ⚠️ MONTADO POR CAST deliberado, e o cast é o que mantém o teste medindo REGRA em vez de FORMA: o
 * `backend` está escrevendo a plumbing nesta mesma rodada, e ela pode trocar (contexto do chamador,
 * leitura própria no serviço, outro nome de campo). O que não pode trocar é o efeito.
 */
function estadoComOrigem(origem: unknown): unknown {
  return { farolGlobal: "EM_ADMISSAO", pausadaEm: null, origem };
}

/**
 * O serviço do GI INTEIRO, no estado MAIS PERIGOSO que existe: configurado, ARMADO, pessoa presente,
 * contratação que passa as seis guardas do passo 6, idempotência limpa. Se alguma origem fosse capaz
 * de enviar, é aqui que enviaria.
 *
 * O ESTADO é servido por VÁRIOS nomes de porta de propósito (`lerEstadoParaEnvio` é o que o
 * `backend` escolheu; os outros são nomes plausíveis). Dublê que responde por mais de um nome não
 * afrouxa nada, porque quem decide qual chamar é o código de produção: ele só evita que uma troca de
 * nome vire falso vermelho e queime uma rodada (§A.40).
 */
function servicoArmado(origem: unknown, estadoNulo = false) {
  const criar = vi.fn(
    async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
      ok: true,
      funcionarioSelecaoId: "GI-SINTETICO",
    }),
  );
  const marcarEnviado = vi.fn(async () => {});
  const estado = estadoNulo ? null : estadoComOrigem(origem);
  const giApi = {
    configurado: () => true,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => false,
    lerPessoa: async () => PESSOA,
    lerContratacao: async () => contratacaoDeFolhaCompleta(),
    marcarEnviado,
    lerEstadoParaEnvio: async () => estado,
    lerEstado: async () => estado,
    lerOrigem: async () => origem,
  } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: "true" })[k],
  } as unknown as ConfigService;
  return { svc: new EnviarParaGiService(config, giApi, leitor, depara), criar, marcarEnviado };
}

/**
 * ARNÊS PONTA A PONTA COM A ORIGEM, local a este arquivo.
 *
 * ┌─ POR QUE NÃO O `gi-ciclo.arnes` NEM O `gi-automatico.arnes`, que é o que o briefing pediu ─────┐
 * │ Os dois servem, e eu tentei: o `gi-ciclo` até expõe o `estado.admissao` mutável, onde a origem  │
 * │ caberia. O que NÃO cabe neles é a outra ponta: o dublê de LEITOR deles não tem a porta por onde │
 * │ o estado da admissão é lido, e ela não é alcançável de fora (o arnês devolve `estado`, nunca o  │
 * │ `leitor`). Sem a porta, a trava não encontra origem nenhuma, todo cenário dá zero, e o CANÁRIO  │
 * │ (`MANUAL` envia) reprova por falta de dublê e não por regra, que é falso vermelho.              │
 * │                                                                                                 │
 * │ E eu NÃO EDITO os arneses nesta rodada, por ordem explícita: o `backend` está escrevendo neles  │
 * │ agora, e dois agentes no mesmo arquivo se sobrescrevem em silêncio (§A.39). Então o arnês é     │
 * │ local, e as ENTRADAS SINTÉTICAS continuam vindo do arnês compartilhado por `import`, que é o    │
 * │ que importa não duplicar (§A.6: um só lugar define o CPF que não existe).                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O mundo é o do `gi-automatico.arnes` no cenário que ENVIA: frente AUDITORIA aberta (o ANTES),
 * régua obrigatória completa (o DEPOIS), `GI_DISPARO_ARMADO` armada, GI configurado, farol vivo. A
 * ORIGEM é a única variável.
 */
function montarArnesComOrigem(origem: unknown, semAChave = false) {
  const criar = vi.fn(
    async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
      ok: true,
      funcionarioSelecaoId: "GI-SINTETICO",
    }),
  );
  const marcarEnviado = vi.fn(async (_id: string, _giId?: string) => {});

  // A linha da admissão como o código de produção a lê. `semAChave` é o caso em que a coluna
  // `origem` NÃO foi projetada pelo `select`, que é como um campo novo deixa de chegar na prática.
  const linhaDaAdmissao = {
    id: ADM_SELECT.id,
    codCliente: ADM_SELECT.codCliente,
    farolGlobal: "EM_ADMISSAO",
    pausadaEm: null,
    isBanco: false,
    dataAdmissao: ADM_SELECT.dataAdmissao,
    clicksignStatus: "SEM_ENVELOPE",
    kitAssinaturaPath: null,
    kitAssinaturaEm: null,
    ...(semAChave ? {} : { origem }),
  };

  const giApi = {
    configurado: () => true,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => false,
    lerPessoa: async () => PESSOA,
    lerContratacao: async () => contratacaoDeFolhaCompleta(),
    marcarEnviado,
    // A porta do ESTADO serve a MESMA linha que o banco serviria, inclusive sem a chave quando o
    // cenário é o do `select` que esqueceu a coluna.
    lerEstadoParaEnvio: async () => ({
      farolGlobal: linhaDaAdmissao.farolGlobal,
      pausadaEm: linhaDaAdmissao.pausadaEm,
      ...(semAChave ? {} : { origem }),
    }),
    lerEstado: async () => linhaDaAdmissao,
    lerOrigem: async () => (semAChave ? undefined : origem),
  } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: "true" })[k],
  } as unknown as ConfigService;

  const gi = new EnviarParaGiService(config, giApi, leitor, depara);

  const frentes = [
    { id: "frente-auditoria", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false },
    { id: "frente-exame", tipo: "EXAME", status: "AGENDADO", concluida: false },
  ];

  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("candidatoNome")
      ? [ADM_SELECT]
      : keys.includes("concluida")
        ? frentes
        : [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => Promise.resolve(rows),
      limit: () => Promise.resolve(rows),
    };
    return builder;
  });

  // `count: 1` = a frente estava aberta e ESTE update a fechou: a TRANSIÇÃO aconteceu, que é a
  // condição de entrada do gatilho automático (ver o arnês compartilhado para o porquê).
  const tx = {
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve({ count: 1 }) }) })),
    insert: vi.fn(() => {
      const encadeado = {
        values: () => encadeado,
        onConflictDoNothing: () => encadeado,
        onConflictDoUpdate: () => Promise.resolve(undefined),
        returning: () => Promise.resolve([{ id: "frente-nascida" }]),
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
      };
      return encadeado;
    }),
    delete: vi.fn(() => ({ where: async () => undefined })),
    select,
  };

  const db = {
    select,
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve(undefined) }) })),
    insert: vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined) }),
    })),
    delete: vi.fn(() => ({ where: async () => undefined })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      admissoes: { findFirst: vi.fn(async () => ({ ...linhaDaAdmissao })) },
      dadosVagaFolha: { findFirst: vi.fn(async () => ({ salario: "2750.00" })) },
      tiposDocumento: { findFirst: vi.fn(async () => undefined) },
      clientes: { findFirst: vi.fn(async () => ({ exigeIntegracao: false })) },
    },
  };

  const svc = new AuditoriaService(
    db as never,
    { listar: vi.fn(async () => []), expurgar: vi.fn(async () => {}) } as never,
    {} as never,
    {
      progresso: vi.fn(async () => ({
        completa: true,
        obrigatoriosTotal: 5,
        obrigatoriosOk: 5,
      })),
    } as never,
    { resolver: async () => resolvePastaPaiId(null, null, {}) } as never,
    {} as never,
    gi as never,
  );

  return { svc, criar, marcarEnviado, frentes };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O CANÁRIO: a origem do FLUXO NOVO (`MANUAL`) ENVIA. Sem ele, nenhum zero abaixo prova nada.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("CANARIO da trava de origem: `MANUAL` (fluxo novo) ENVIA", () => {
  it("ponta a ponta: a transicao da auditoria com origem MANUAL manda a pessoa UMA vez", async () => {
    const ctx = montarArnesComOrigem("MANUAL");

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "a admissao do FLUXO NOVO (origem MANUAL) nao foi para a folha: a trava bloqueou o que devia passar",
    ).toHaveBeenCalledTimes(1);
    expect(ctx.marcarEnviado, "enviou e nao carimbou a idempotencia").toHaveBeenCalledTimes(1);
  });

  it("no servico: o gatilho automatico com origem MANUAL ENVIA uma vez", async () => {
    const { svc, criar } = servicoArmado("MANUAL");

    const r = await svc.enviar(ADM, contextoVivo());

    expect(
      criar,
      "o dubleh nao chega ao POST: todos os zeros deste arquivo passariam por acidente",
    ).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
  });

  it("o payload que vai no caminho autorizado e DAQUELA pessoa, nao um payload vazio", async () => {
    const { svc, criar } = servicoArmado("MANUAL");

    await svc.enviar(ADM, contextoVivo());
    const payload = criar.mock.calls[0]?.[0] as FuncionarioSelecao | undefined;

    expect(payload?.cpf, "a trava passou mas o payload saiu sem a pessoa").toBe(PESSOA.cpf);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A ORIGEM `PANDAPE`: ZERO envio, com TUDO O MAIS perfeito
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 1: origem PANDAPE nao vai para o GI, nem no cenario perfeito", () => {
  /**
   * POR QUE "TUDO O MAIS PERFEITO" É A CONDIÇÃO DO EXPERIMENTO: o mundo destes cenários é idêntico ao
   * do canário acima (transição acontecida, flag armada, farol vivo, GI configurado, contratação
   * completa, idempotência limpa). A ÚNICA variável é a origem. Sem isso, um zero aqui poderia vir de
   * qualquer outra guarda e o teste não mediria a trava.
   *
   * MEDIDO na produção em 06/10/2026 (`docs/MAPA-GI-TRAVA-DE-ORIGEM.md`): 70 das 71 admissões VIVAS
   * são `PANDAPE`, e as TRÊS que passam todas as guardas do passo 6 são as três `PANDAPE`. A trava
   * não é hipótese de futuro: ela decide o que acontece com a base viva de hoje.
   */
  it("ponta a ponta: a transicao da auditoria com origem PANDAPE da ZERO chamada ao cliente do GI", async () => {
    const ctx = montarArnesComOrigem("PANDAPE");

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "a admissao do webhook do Pandape foi mandada ao GI: o Pandape ja a manda por fora, a pessoa DUPLICA na folha",
    ).not.toHaveBeenCalled();
    expect(ctx.marcarEnviado, "carimbou envio que nao aconteceu").not.toHaveBeenCalled();
  });

  it("ponta a ponta: a auditoria FECHA normalmente mesmo com o envio barrado pela origem", async () => {
    /**
     * A trava recusa o ENVIO, não o trabalho do time. Se ela derrubasse o pós-veredito, o consultor
     * veria erro na tela depois de a auditoria já ter sido gravada, que é a falha da família do Drive
     * já paga nesta casa.
     */
    const ctx = montarArnesComOrigem("PANDAPE");

    const out = await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(out.progresso.completa, "a trava de origem derrubou o fechamento da auditoria").toBe(true);
  });

  it("no servico: origem PANDAPE nao chama o POST e devolve desfecho FECHADO", async () => {
    const { svc, criar, marcarEnviado } = servicoArmado("PANDAPE");

    const r = await svc.enviar(ADM, contextoVivo());

    expect(criar, "origem PANDAPE chegou ao POST do fornecedor").not.toHaveBeenCalled();
    expect(marcarEnviado).not.toHaveBeenCalled();
    expect(r.enviado, "o desfecho diz que enviou uma admissao do Pandape").toBe(false);
    // O CÓDIGO do motivo não é asserido de propósito: o diretor pediu o EFEITO, e o nome do desfecho
    // novo é escolha do `backend`. O que não pode é `enviado: true` nem motivo vazio.
    expect(r.motivo, "o desfecho precisa de um motivo fechado para a trilha").toBeTruthy();
  });

  it("A LEVA: 50 admissoes PANDAPE fechando a auditoria somam ZERO envio", async () => {
    /**
     * "O MEDO É A LEVA", nas palavras do diretor. São 50 MUNDOS, não 50 passagens sobre o mesmo: o
     * gate de transição já protege a repetição na MESMA admissão (`gi-fechamento-da-auditoria-envia`),
     * então repetir a mesma daria zero por OUTRA razão e não mediria a origem. Cada volta é uma
     * admissão diferente, com a frente AUDITORIA aberta e a régua completa, ou seja, 50 transições de
     * verdade, 50 vezes o cenário que ENVIA no canário.
     */
    let chamadas = 0;
    for (let i = 0; i < 50; i += 1) {
      const ctx = montarArnesComOrigem("PANDAPE");
      await ctx.svc.aplicarPosVeredito(`adm-sintetica-${i}`, USER);
      chamadas += ctx.criar.mock.calls.length;
    }

    expect(
      chamadas,
      "a leva do Pandape foi para a folha: cada fechamento de auditoria duplicou uma pessoa no GI",
    ).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A ORIGEM DESCONHECIDA: o único bloco que distingue ALLOWLIST de DENYLIST
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 1 (o que importa para o futuro): origem DESCONHECIDA nao envia, fail-closed", () => {
  /**
   * ⚠️ SE ALGUM TESTE DESTE BLOCO FALHAR E OS DE `PANDAPE` PASSAREM, A TRAVA SAIU DENYLIST
   * (`origem !== "PANDAPE"`), e esse é o achado mais caro da rodada. O resultado operacional de hoje
   * é idêntico, porque o enum tem dois valores; o que muda é QUEM PAGA A CONTA DO TERCEIRO VALOR.
   * `origem = "DIGAI"` numa denylist autoriza o envio sozinha, sem ninguém decidir, e a pessoa pode ir
   * duas vezes para a folha. Mesma lição do `FAROIS_VIVOS` e do `Record` fechado: fail-closed por
   * construção, nunca por lembrança.
   *
   * `DIGAI` não é hipótese de laboratório: a ingestão do Digai existe, construída e inerte (DIARIO,
   * 29/09/2026), e a §A.47 nasceu de uma ATS virando gatilho de admissão.
   */
  const DESCONHECIDAS: [string, unknown][] = [
    ["DIGAI (a segunda ATS, ingestao ja construida e inerte)", "DIGAI"],
    ["IFRACTAL (um valor futuro qualquer)", "IFRACTAL"],
    ["minuscula, que nao casa o enum", "manual"],
    ["vazia", ""],
    ["so espaco", "   "],
    ["ausente (undefined)", undefined],
    ["nula", null],
  ];

  for (const [rotulo, origem] of DESCONHECIDAS) {
    it(`no servico: origem ${rotulo} da ZERO envio`, async () => {
      const { svc, criar, marcarEnviado } = servicoArmado(origem);

      const r = await svc.enviar(ADM, contextoVivo());

      expect(
        criar,
        `origem nao autorizada (${JSON.stringify(origem)}) foi para a folha: a trava autoriza por omissao, e denylist e exatamente isso`,
      ).not.toHaveBeenCalled();
      expect(marcarEnviado).not.toHaveBeenCalled();
      expect(r.enviado).toBe(false);
    });

    it(`ponta a ponta: origem ${rotulo} da ZERO envio`, async () => {
      const ctx = montarArnesComOrigem(origem);

      await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

      expect(
        ctx.criar,
        `origem nao autorizada (${JSON.stringify(origem)}) atravessou o gatilho da auditoria`,
      ).not.toHaveBeenCalled();
    });
  }

  it("a chave `origem` AUSENTE da linha lida tambem nao envia (o select que esqueceu a coluna)", async () => {
    /**
     * DIFERENTE do `undefined` explícito acima, e a diferença é real: aqui a chave NÃO EXISTE no
     * objeto. É o caso do `select` com recorte de colunas que não projetou a `origem`, que é como um
     * campo novo deixa de chegar na prática. A coluna é `NOT NULL` com default `MANUAL` no banco,
     * então ausência NUNCA vem do dado: vem do CÓDIGO que esqueceu de ler. Fail-closed é o que
     * transforma esse esquecimento em "não enviou" em vez de "enviou sem conferir".
     */
    const ctx = montarArnesComOrigem(undefined, true);

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "sem a origem na linha lida o envio aconteceu: a ausencia do dado esta autorizando o envio",
    ).not.toHaveBeenCalled();
  });

  it("a admissao NAO ENCONTRADA (estado nulo) nao envia", async () => {
    const { svc, criar } = servicoArmado("MANUAL", true);

    const r = await svc.enviar(ADM, contextoVivo());

    expect(criar, "estado nulo (admissao inexistente) autorizou o envio").not.toHaveBeenCalled();
    expect(r.enviado).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A VARREDURA DO FONTE: a FORMA da trava, que os dublês não enxergam
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("a FORMA da trava: allowlist derivada de simbolo, nunca denylist literal", () => {
  /**
   * POR QUE A VARREDURA EXISTE AO LADO DOS DUBLÊS: os testes de comportamento provam o RESULTADO de
   * hoje. Nenhum deles impede que alguém, amanhã, troque a allowlist por `origem !== "PANDAPE"` e
   * continue verde nos casos de `PANDAPE` e `MANUAL`, porque com dois valores no enum as duas formas
   * são indistinguíveis ali. A varredura é a trava da FORMA, e é pedido explícito do diretor.
   *
   * Comentários saem antes de asserir: o fonte desta casa é densamente comentado, e tanto "PANDAPE"
   * quanto a explicação da própria decisão aparecem em prosa (§A.6 da memória: varredura de fonte casa
   * comentário, e já custou três falsos vermelhos numa frente).
   */
  const SRC = join(__dirname, "..");

  it("nenhum arquivo de producao decide o envio ao GI por `!== PANDAPE`", () => {
    const denylist = /!==?\s*["'`]PANDAPE["'`]|["'`]PANDAPE["'`]\s*!==?/;
    const achados = [
      ...arquivosQueCasam(join(SRC, "gi"), denylist),
      ...arquivosQueCasam(join(SRC, "domain"), denylist),
    ];

    expect(
      achados,
      "a trava de origem saiu DENYLIST: toda origem futura (DIGAI, iFractal) nasce AUTORIZADA a mandar para a folha",
    ).toEqual([]);
  });

  it("a origem autorizada NAO e literal solto dentro de `gi/`: ela vem de UM simbolo do dominio", () => {
    /**
     * A régua é a do `FAROIS_VIVOS`: a lista mora em UM lugar e os consumidores a derivam. Se a
     * palavra `"MANUAL"` aparecer em CÓDIGO dentro de `gi/` (fora de teste, fora de arnês, fora de
     * comentário), ou a lista foi copiada para cá, ou nasceu literal no serviço, que é exatamente como
     * as três cópias de `FAROIS_VIVOS` nasceram.
     */
    const literal = arquivosQueCasam(join(SRC, "gi"), /["'`]MANUAL["'`]/);

    expect(
      literal,
      "a origem autorizada virou literal dentro de `gi/`: a lista precisa morar em UM simbolo, como `FAROIS_VIVOS`",
    ).toEqual([]);
  });
});

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Nomes dos arquivos de PRODUÇÃO (fora de spec e de arnês) cujo CÓDIGO casa o padrão. */
function arquivosQueCasam(raiz: string, padrao: RegExp): string[] {
  const achados: string[] = [];
  const andar = (dir: string): void => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        if (nome !== "node_modules") andar(caminho);
        continue;
      }
      if (!nome.endsWith(".ts")) continue;
      if (nome.includes(".spec.") || nome.includes(".arnes.")) continue;
      if (padrao.test(semComentarios(readFileSync(caminho, "utf8")))) achados.push(nome);
    }
  };
  andar(raiz);
  return achados.sort();
}
