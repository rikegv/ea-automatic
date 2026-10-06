import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import type { GiLeitorService } from "./gi-leitor.service";
import {
  DE_PARA_GI_VAZIO,
  montarFuncionarioSelecao,
  type FuncionarioSelecao,
} from "../domain/portal-dados-gi";
import { PAR_CONHECIDO, PESSOA, contratacaoDeFolhaCompleta } from "./gi-automatico.arnes";

/**
 * INVARIANTE 3: o `apiSincAdmissaoDigital` VEM DO AMBIENTE, com DEFAULT SEGURO, e entra pelo MONTADOR.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO do diretor (§A.38 / §A.40 regra 2), ENQUANTO o
 * `backend` escreve o código.
 *
 * ┌─ POR QUE ESTE CAMPO EXISTE, medido na produção do FORNECEDOR em 05/10/2026 ───────────────────┐
 * │ Com `apiSincAdmissaoDigital = false` (o default do G.I) a pré-admissão é consumida e SOME em    │
 * │ menos de 10 minutos. Com `true` ela PERMANECE (três leituras, aos 11 e aos 26 minutos). O       │
 * │ fundamento do diretor é OPERACIONAL: com `false`, a auditoria que fecha fora do horário de      │
 * │ trabalho faz o registro desaparecer antes de alguém ver, e o time PERDE a admissão.             │
 * │                                                                                                 │
 * │ E É POR ISSO QUE O EA ENTREGA O MECANISMO, NÃO O VALOR: o `seguranca` vetou `true` permanente   │
 * │ por retenção (PII e salário parados no fornecedor sem relógio e sem DELETE ao nosso alcance), e │
 * │ os dois lados são reais. Vindo de `.env`, a decisão é do diretor e é reversível numa linha, sem │
 * │ commit, sem build e sem nova rodada de fábrica.                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A FALHA SILENCIOSA QUE ESTE ARQUIVO EXISTE PARA PEGAR ───────────────────────────────────────┐
 * │ O payload do G.I sai de uma ALLOWLIST FECHADA: só os campos NOMEADOS no montador atravessam, e │
 * │ qualquer chave a mais é descartada EM SILÊNCIO (é a garantia do módulo, e ela é boa). Então um  │
 * │ campo novo que não esteja DENTRO do montador some sem nada falhar: a variável estaria ligada, o │
 * │ log diria que enviou, o fornecedor aplicaria o default `false` e a admissão do diretor sumiria  │
 * │ em 10 minutos. Ninguém veria. É esse o teste que custa a admissão se faltar.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE SE MEDE É O PAYLOAD QUE CHEGA AO CLIENTE DO GI, capturado no espião de
 * `criarFuncionarioSelecao`: é o último ponto antes do `POST`, então é o único lugar onde "o campo
 * saiu" quer dizer "o fornecedor recebeu".
 *
 * §A.6: toda entrada é SINTÉTICA, reusada do arnês (CPF da faixa reservada 999, classe que a Receita
 * nunca emitiu). O payload capturado carrega PII e SALÁRIO sintéticos: NÃO é impresso, nem em
 * mensagem de asserção. §A.11: nenhum travessão.
 */

afterEach(() => vi.restoreAllMocks());

const ADM = "66666666-6666-6666-6666-666666666666";

/** A CHAVE, escrita UMA vez: errar o nome dela no teste é "passar" sem medir nada. */
const CHAVE = "apiSincAdmissaoDigital";

/** A admissão VIVA, não pausada e de origem AUTORIZADA: nenhuma outra trava pode morder aqui. */
const ESTADO_VIVO = { farolGlobal: "EM_ADMISSAO", pausadaEm: null, origem: "MANUAL" };

/**
 * O serviço ARMADO, com o ambiente como ÚNICA variável.
 *
 * `env` é o `.env` do cenário: `undefined` significa variável NÃO DEFINIDA, que é o caso do diretor
 * ("sem a variável de ambiente definida"). O dublê do `ConfigService` devolve `undefined` para
 * qualquer chave que o cenário não declarou, como o Nest faz.
 */
function servicoComAmbiente(env: Record<string, string | undefined>) {
  const criar = vi.fn(
    async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
      ok: true,
      funcionarioSelecaoId: "GI-SINTETICO",
    }),
  );
  const giApi = {
    configurado: () => true,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => false,
    lerPessoa: async () => PESSOA,
    lerContratacao: async () => contratacaoDeFolhaCompleta(),
    marcarEnviado: vi.fn(async () => {}),
    // Estado VIVO e origem AUTORIZADA: as travas dos invariantes 1 e 2 não podem ser a razão de um
    // payload não sair, senão este arquivo mediria outra coisa. O estado é servido por mais de um
    // nome de porta de propósito: o `backend` renomeou essa porta no meio desta rodada
    // (`lerEstadoParaEnvio` virou `lerEstado`), e nome trocado não pode queimar uma rodada (§A.40).
    lerEstado: async () => ESTADO_VIVO,
    lerEstadoParaEnvio: async () => ESTADO_VIVO,
  } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: "true", ...env })[k],
  } as unknown as ConfigService;
  return { svc: new EnviarParaGiService(config, giApi, leitor, depara), criar };
}

/** O payload que CHEGOU ao cliente do GI naquele ambiente. Falha o teste se nada foi enviado. */
async function payloadDoEnvio(env: Record<string, string | undefined>) {
  const { svc, criar } = servicoComAmbiente(env);

  await svc.enviar(ADM, { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: "autor-sintetico" });

  expect(criar, "nada foi enviado: o cenario deste arquivo nao chegou ao POST").toHaveBeenCalledTimes(1);
  return criar.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O DEFAULT SEGURO: sem a variável, o EA não muda o comportamento do fornecedor
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 3: sem a variavel de ambiente, o campo sai no DEFAULT DO FORNECEDOR", () => {
  it("sem `GI_API_SINC_ADMISSAO_DIGITAL`: o campo SAI, e sai `false`", async () => {
    /**
     * ⚠️ ESTA ASSERÇÃO PINA UMA ESCOLHA DO `backend`, e o diretor pediu para confirmar QUAL foi: ele
     * emite o campo SEMPRE, com `false` quando ninguém decidiu. É a escolha mais forte das duas
     * possíveis, e por isso está asserida assim e não como "ausente ou false":
     *  - EXPLÍCITO (`false`): o payload diz o que quer, e não depende de o fornecedor manter o default
     *    dele. Default do outro lado é contrato que pode mudar sem aviso, e já custou caro nesta casa
     *    (empresa/filial e salário gravaram `0` por omissão, calados).
     *  - AUSENTE: daria o mesmo resultado HOJE, porque o default do G.I é `false`, e passaria a dar
     *    resultado diferente no dia em que ele mudasse de ideia.
     * Se algum dia o campo passar a ser omitido, este teste reprova, e a reprovação é o pedido de
     * revisão, não um estorvo.
     */
    const payload = await payloadDoEnvio({});

    expect(CHAVE in payload, "o campo nao saiu no payload: a allowlist fechada o descartou em silencio").toBe(
      true,
    );
    expect(payload[CHAVE], "sem decisao no `.env` o EA mudou o comportamento do fornecedor").toBe(false);
  });

  it("o campo e BOOLEANO, nunca a string do `.env`", async () => {
    /**
     * O contrato do G.I diz `boolean` não-anulável. `"false"` (string) é VERDADEIRO em JavaScript e,
     * num desserializador tolerante, viraria `true` do outro lado: o campo ligaria sozinho, pelo
     * caminho mais bobo possível, que é repassar o texto da variável.
     */
    const payload = await payloadDoEnvio({});

    expect(typeof payload[CHAVE], "o valor do `.env` foi repassado como TEXTO para o fornecedor").toBe(
      "boolean",
    );
  });

  for (const valor of ["", "   ", "1", "sim", "yes", "on", "false", "FALSO", "truee"]) {
    it(`\`GI_API_SINC_ADMISSAO_DIGITAL=${JSON.stringify(valor)}\` NAO liga o campo`, async () => {
      /**
       * UMA FORMA SÓ DE LIGAR, que é a mesma régua do `GI_DISPARO_ARMADO`: não existe meio-ligado. Um
       * `.env` com "1" ou "sim" é tentativa de ligar que NÃO ligou, e isso é melhor que ligar por
       * engano, porque o lado ligado é o que retém PII no fornecedor sem relógio.
       */
      const payload = await payloadDoEnvio({ GI_API_SINC_ADMISSAO_DIGITAL: valor });

      expect(payload[CHAVE], "um valor que nao e `true` ligou o sincronismo").toBe(false);
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LIGADA: o campo sai `true`, e ATRAVESSA a allowlist fechada
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 3: com a variavel LIGADA, o campo sai `true` e atravessa a allowlist", () => {
  it("`GI_API_SINC_ADMISSAO_DIGITAL=true`: o payload sai com o campo em `true`", async () => {
    const payload = await payloadDoEnvio({ GI_API_SINC_ADMISSAO_DIGITAL: "true" });

    expect(
      CHAVE in payload,
      "a variavel estava LIGADA e o campo NAO saiu: a allowlist fechada o descartou em silencio, e a pre-admissao do diretor vai sumir em 10 minutos sem nada falhar",
    ).toBe(true);
    expect(payload[CHAVE], "a variavel estava ligada e o fornecedor recebeu o contrario").toBe(true);
  });

  for (const valor of ["TRUE", "True", " true ", "true\n"]) {
    it(`\`${JSON.stringify(valor)}\` tambem liga (trim e caixa, como o GI_DISPARO_ARMADO)`, async () => {
      const payload = await payloadDoEnvio({ GI_API_SINC_ADMISSAO_DIGITAL: valor });

      expect(payload[CHAVE], "a leitura do `.env` divergiu da regua do GI_DISPARO_ARMADO").toBe(true);
    });
  }

  it("LIGAR O CAMPO NAO MEXE EM NENHUM OUTRO CAMPO DO PAYLOAD", async () => {
    /**
     * A prova de que o campo novo é CIRÚRGICO. Os dois payloads são comparados com a chave do
     * sincronismo removida, então qualquer diferença restante é efeito colateral: um campo de folha
     * que mudou de valor junto, uma chave que apareceu, uma que sumiu. §A.6: a comparação é entre
     * objetos, nada é impresso.
     */
    const desligado = await payloadDoEnvio({});
    const ligado = await payloadDoEnvio({ GI_API_SINC_ADMISSAO_DIGITAL: "true" });
    delete desligado[CHAVE];
    delete ligado[CHAVE];

    expect(ligado, "ligar o sincronismo alterou outro campo do payload").toEqual(desligado);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A PORTA: o campo entra pelo MONTADOR, dentro da allowlist, e não injetado depois dela
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 3: o campo entra pelo MONTADOR, nunca injetado depois da allowlist", () => {
  /**
   * POR QUE ESTE BLOCO NÃO É REDUNDANTE com os de cima: lá se mede o VALOR que chega ao cliente, e um
   * `{ ...payload, apiSincAdmissaoDigital: true }` colado depois do montador passaria naqueles testes
   * exatamente igual. O que ele NÃO teria é a rede de runtime da fronteira (a mesma que transforma
   * `"Temporário"` em `null` antes de ele atravessar para um campo de 1 caractere) nem a aparição nas
   * varreduras que provam o recorte do payload. O diretor pediu o campo DENTRO do montador, e é esta
   * medição que distingue as duas coisas.
   */
  it("o montador emite a chave por conta propria, com `false` quando ninguem decide", () => {
    const payload = montarFuncionarioSelecao(PESSOA) as unknown as Record<string, unknown>;

    expect(CHAVE in payload, "a chave nao nasce no montador: ela esta sendo injetada por fora").toBe(true);
    expect(payload[CHAVE]).toBe(false);
  });

  it("o montador aceita a DECISAO por parametro nomeado e emite `true`", () => {
    const payload = montarFuncionarioSelecao(PESSOA, undefined, undefined, {
      apiSincAdmissaoDigital: true,
    }) as unknown as Record<string, unknown>;

    expect(payload[CHAVE], "o montador ignorou a decisao recebida").toBe(true);
  });

  it("a REDE DE RUNTIME da fronteira vale para este campo: valor nao-booleano nao atravessa como `true`", () => {
    /**
     * A `OpcoesDeEnvioGi` montada POR FORA (de um `.env` lido errado, de um JSON, de um teste) pode
     * chegar com `"true"`, `1` ou `null`. A fronteira do payload é o único ponto que conserta isso, e é
     * a mesma lição já paga pelo `tipoSalario` e pelo `vinculo`: repasse cru deixou valor errado
     * atravessar para o fornecedor.
     */
    for (const sujo of ["true", 1, "1", {}, [], "yes"]) {
      const payload = montarFuncionarioSelecao(PESSOA, undefined, undefined, {
        apiSincAdmissaoDigital: sujo,
      } as never) as unknown as Record<string, unknown>;

      expect(typeof payload[CHAVE], "valor nao-booleano atravessou a fronteira do payload").toBe("boolean");
      expect(payload[CHAVE], "valor nao-booleano foi tratado como decisao de LIGAR").toBe(false);
    }
  });

  it("a opcao de sincronismo NAO vira campo de pessoa nem de contratacao (as allowlists seguem fechadas)", () => {
    /**
     * A garantia original do módulo: chave a mais no objeto de PESSOA não atravessa. O campo novo tem
     * porta própria (`opcoes`), então tentar entrar pela porta da pessoa tem de continuar não
     * funcionando, senão a allowlist 1 virou aberta.
     */
    const payload = montarFuncionarioSelecao({
      ...PESSOA,
      apiSincAdmissaoDigital: true,
    } as never) as unknown as Record<string, unknown>;

    expect(
      payload[CHAVE],
      "o campo entrou pela porta da PESSOA: a allowlist 1 deixou de ser fechada",
    ).toBe(false);
  });
});
