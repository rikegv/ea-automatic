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
 * INVARIANTE 3 (reescrita 15/10/2026): o `apiSincAdmissaoDigital` do ENVIO e SEMPRE `false`, FIXO, e
 * o knob de ambiente `GI_API_SINC_ADMISSAO_DIGITAL` continua MORTO.
 *
 * ┌─ A DECISAO FINAL DO DIRETOR, com PROVA NA TELA DE CADASTRO (15/10/2026) ─────────────────────────┐
 * │ `false` e o valor que FUNCIONA: o registro enviado com `false` SAI da pre-selecao                  │
 * │ (`FuncionarioSelecao`) e o SINCRONIZADOR do G.I o PROMOVE para a tela de Cadastro de Funcionarios, │
 * │ como o diretor VALIDOU com Edmara, Kaua e Samuel aparecendo na tela dele. `true` PRENDE o          │
 * │ registro: ele FICA na pre-selecao (status 2) e NUNCA e promovido ao Cadastro (foi o que segurou    │
 * │ Kaua/Edson/Fabricio). Logo o ENVIO sai `false` por todos os caminhos: manual, automatico e         │
 * │ reconciliacao, todos `false`.                                                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A POLITICA (false) MORA NO SERVICO; O MONTADOR E FUNCAO PURA ──────────────────────────────────┐
 * │ `montarFuncionarioSelecao(PESSOA)` SEM opcoes continua com default `false`: o default do DOMINIO   │
 * │ nao mudou. Quem decide `false` e o `EnviarParaGiService`, que passa a opcao                        │
 * │ `apiSincAdmissaoDigital: false` FIXA ao montar, em todos os caminhos. Por isso os testes do        │
 * │ MONTADOR puro (default = false; coercao de nao-booleano = false) ficam COMO ESTAVAM, e os testes   │
 * │ do SERVICO tambem sao `false`.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTE TESTE E A TRAVA CONTRA REINVERTER ──────────────────────────────────────────────┐
 * │ A leitura de ambiente (`GI_API_SINC_ADMISSAO_DIGITAL`) foi REMOVIDA do servico: o knob esta       │
 * │ MORTO. Este arquivo prova que, mesmo com a variavel `true` (ou qualquer valor) no `.env`, o envio  │
 * │ sai `false` nos DOIS gatilhos. Se algum dia o envio sair `true`, este teste reprova, e a reprovacao │
 * │ e o pedido de revisao (seria o retorno do registro PRESO na pre-selecao, nunca promovido).        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE SE MEDE E O PAYLOAD QUE CHEGA AO CLIENTE DO GI, capturado no espiao de
 * `criarFuncionarioSelecao`: e o ultimo ponto antes do `POST`.
 *
 * §A.6: toda entrada e SINTETICA (arnes). O payload carrega PII e SALARIO sinteticos: NAO e impresso.
 * §A.11: nenhum travessao.
 */

afterEach(() => vi.restoreAllMocks());

const ADM = "66666666-6666-6666-6666-666666666666";
const CHAVE = "apiSincAdmissaoDigital";
const ESTADO_VIVO = { farolGlobal: "EM_ADMISSAO", pausadaEm: null, origem: "MANUAL" };

function servicoComAmbiente(env: Record<string, string | undefined>) {
  const criar = vi.fn(
    async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({
      ok: true,
      funcionarioSelecaoId: "GI-SINTETICO",
    }),
  );
  const giApi = { configurado: () => true, criarFuncionarioSelecao: criar } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => false,
    lerPessoa: async () => PESSOA,
    lerContratacao: async () => contratacaoDeFolhaCompleta(),
    marcarEnviado: vi.fn(async () => {}),
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

/** O payload que CHEGOU ao cliente do GI, pelo gatilho pedido. Falha o teste se nada foi enviado. */
async function payloadDoEnvio(
  env: Record<string, string | undefined>,
  gatilho: "manual" | "automatico",
) {
  const { svc, criar } = servicoComAmbiente(env);
  if (gatilho === "manual") await svc.enviarManual(ADM, "autor-sintetico");
  else await svc.enviar(ADM, { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: "autor-sintetico" });
  expect(criar, "nada foi enviado: o cenario nao chegou ao POST").toHaveBeenCalledTimes(1);
  return criar.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
}

describe("INVARIANTE 3: o envio sai SEMPRE false, nos dois gatilhos, qualquer que seja o ambiente", () => {
  for (const gatilho of ["manual", "automatico"] as const) {
    it(`${gatilho}: sem a variavel, o campo SAI e vale false`, async () => {
      const payload = await payloadDoEnvio({}, gatilho);
      expect(CHAVE in payload, "o campo nao saiu: a allowlist fechada o descartou").toBe(true);
      expect(payload[CHAVE]).toBe(false);
    });

    it(`${gatilho}: o campo e BOOLEANO, nunca a string do .env`, async () => {
      const payload = await payloadDoEnvio({}, gatilho);
      expect(typeof payload[CHAVE]).toBe("boolean");
    });

    for (const valor of ["true", "TRUE", " true ", "True", "1", "sim", "false", ""]) {
      it(`${gatilho}: GI_API_SINC_ADMISSAO_DIGITAL=${JSON.stringify(valor)} NAO liga (knob morto, sai false)`, async () => {
        const payload = await payloadDoEnvio({ GI_API_SINC_ADMISSAO_DIGITAL: valor }, gatilho);
        expect(payload[CHAVE], "o knob de ambiente reviveu e ligou o true: prenderia na pre-selecao").toBe(false);
      });
    }
  }
});

describe("INVARIANTE 3: o montador emite false por padrao e a rede de runtime coage nao-booleano a false", () => {
  it("o montador emite a chave por conta propria, com false quando ninguem decide", () => {
    const payload = montarFuncionarioSelecao(PESSOA) as unknown as Record<string, unknown>;
    expect(CHAVE in payload, "a chave nao nasce no montador: esta sendo injetada por fora").toBe(true);
    expect(payload[CHAVE]).toBe(false);
  });

  it("valor nao-booleano NAO atravessa como true (a fronteira do payload coage)", () => {
    for (const sujo of ["true", 1, "1", {}, [], "yes"]) {
      const payload = montarFuncionarioSelecao(PESSOA, undefined, undefined, {
        apiSincAdmissaoDigital: sujo,
      } as never) as unknown as Record<string, unknown>;
      expect(typeof payload[CHAVE]).toBe("boolean");
      expect(payload[CHAVE], "valor nao-booleano foi tratado como decisao de LIGAR").toBe(false);
    }
  });

  it("a opcao de sincronismo NAO vira campo de pessoa (allowlist 1 segue fechada)", () => {
    const payload = montarFuncionarioSelecao({
      ...PESSOA,
      apiSincAdmissaoDigital: true,
    } as never) as unknown as Record<string, unknown>;
    expect(payload[CHAVE], "o campo entrou pela porta da PESSOA: a allowlist 1 abriu").toBe(false);
  });
});
