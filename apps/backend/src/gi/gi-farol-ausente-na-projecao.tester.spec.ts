import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import type { GiLeitorService } from "./gi-leitor.service";
import { DE_PARA_GI_VAZIO, type FuncionarioSelecao } from "../domain/portal-dados-gi";
import { PAR_CONHECIDO, PESSOA, contratacaoDeFolhaCompleta } from "./gi-automatico.arnes";

/**
 * FAROL AUSENTE NA PROJECAO DA LEITURA: NAO ENVIA (fail-closed).
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, e ele e resultado de MUTACAO, nao de leitura ───────────────────┐
 * │ A guarda `if (!estado.farolGlobal)` de `enviarComGuardas` fecha a assimetria que o `tester`    │
 * │ apontou: `admissaoEncerrada(undefined)` devolve `false`, logo um `select` que esquecesse a      │
 * │ coluna `farol_global` passaria a ENVIAR, enquanto a trava de ORIGEM, no mesmo arquivo, falha    │
 * │ FECHADA no mesmo caso.                                                                          │
 * │                                                                                                 │
 * │ MEDIDO em 06/10/2026, na rodada de mutacao: REMOVER aquela guarda inteira deixou os 1.855       │
 * │ testes do escopo `src/gi src/auditoria src/domain` VERDES. Ela estava correta e NAO estava       │
 * │ coberta: nenhum teste servia um estado com farol vazio pela porta que a alcanca. Guarda sem     │
 * │ teste e guarda que a proxima refatoracao remove sem ninguem perceber, que e exatamente o modo   │
 * │ de falha que ela foi escrita para impedir.                                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A PORTA MEDIDA E A MANUAL, e isso e o que torna o experimento honesto ───────────────┐
 * │ No gatilho AUTOMATICO, `admissaoOperavel(contexto.farolGlobal, ...)` ja recusa antes da         │
 * │ leitura, entao um farol vazio daria zero por OUTRO motivo e o arquivo passaria sem a guarda     │
 * │ existir. `enviarManual` vai DIRETO a `enviarComGuardas`, sem cheque de contexto: e ali que a    │
 * │ projecao errada e a unica variavel do experimento.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A linha e servida no estado MAIS PERIGOSO possivel: GI configurado, `GI_DISPARO_ARMADO` ARMADA,
 * pessoa presente, contratacao que passa as seis guardas do passo 6, idempotencia limpa, origem
 * AUTORIZADA. A UNICA variavel e o farol da projecao.
 *
 * §A.6: toda entrada e SINTETICA, reusada do arnes (CPF de faixa reservada, dominio de homologacao).
 * §A.11: nenhum travessao.
 */

afterEach(() => vi.restoreAllMocks());

const ADM = "66666666-6666-6666-6666-666666666666";
const AUTOR = "77777777-7777-7777-7777-777777777777";

/** O servico inteiro armado, com a projecao de `lerEstado` sob controle do teste. */
function servicoComProjecao(linha: Record<string, unknown> | null) {
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
    lerEstado: async () => linha,
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O CANARIO: com farol VIVO na projecao, a MESMA montagem ENVIA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("CANARIO: projecao COMPLETA e farol vivo ENVIA pelo botao manual", () => {
  /**
   * Sem este bloco nenhum `not.toHaveBeenCalled()` abaixo prova nada: um duble quebrado, ou uma
   * guarda nova que recusasse TUDO, faria o arquivo inteiro passar por engano.
   */
  it("farol EM_ADMISSAO com a projecao completa: ENVIA e carimba a idempotencia", async () => {
    const { svc, criar, marcarEnviado } = servicoComProjecao({
      farolGlobal: "EM_ADMISSAO",
      pausadaEm: null,
      origem: "MANUAL",
    });

    const r = await svc.enviarManual(ADM, AUTOR);

    expect(r.enviado).toBe(true);
    expect(criar).toHaveBeenCalledTimes(1);
    expect(marcarEnviado).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A REGRA: farol VAZIO na projecao NAO ENVIA, por nenhuma das formas de "vazio"
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("projecao SEM farol: ZERO envio, desfecho GI_ADMISSAO_NAO_OPERAVEL", () => {
  const vazios: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["farol NULO (coluna lida, valor nulo)", { farolGlobal: null, pausadaEm: null, origem: "MANUAL" }],
    ["farol STRING VAZIA", { farolGlobal: "", pausadaEm: null, origem: "MANUAL" }],
    [
      "a CHAVE farolGlobal AUSENTE (o `select` que esqueceu a coluna)",
      { pausadaEm: null, origem: "MANUAL" },
    ],
  ];

  for (const [nome, linha] of vazios) {
    it(`${nome}: nao chama o cliente do GI, com a flag ARMADA`, async () => {
      const { svc, criar, marcarEnviado } = servicoComProjecao(linha);

      const r = await svc.enviarManual(ADM, AUTOR);

      expect(criar).not.toHaveBeenCalled();
      expect(marcarEnviado).not.toHaveBeenCalled();
      expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
    });
  }

  /**
   * A SIMETRIA COM A TRAVA DE ORIGEM, que e a razao de a guarda existir: as DUAS travas de estado do
   * mesmo caminho falham FECHADAS quando a projecao nao traz a coluna. Duas travas no mesmo caminho
   * com fail-closed OPOSTO e como a proxima refatoracao abre um furo sem ninguem perceber.
   */
  it("a linha AUSENTE (admissao que nao existe) tambem nao envia", async () => {
    const { svc, criar } = servicoComProjecao(null);

    const r = await svc.enviarManual(ADM, AUTOR);

    expect(criar).not.toHaveBeenCalled();
    expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
  });
});
