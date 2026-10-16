import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import type { GiLeitorService } from "./gi-leitor.service";
import {
  codigoFuncionarioSinteticoGi,
  DE_PARA_GI_VAZIO,
  montarFuncionarioSelecao,
  type FuncionarioSelecao,
} from "../domain/portal-dados-gi";
import { PAR_CONHECIDO, PESSOA, contratacaoDeFolhaCompleta } from "./gi-automatico.arnes";

/**
 * A CHAVE DE DIFERENCIAÇÃO `codigoFuncionario` (decisão do suporte do G.I, 15/10/2026). O G.I usa
 * Empresa-Filial-CodigoFuncionario como chave; com `0` em todos, os registros colidem e o sincronizador
 * só mantém um. A matrícula real vem depois, então o EA manda um código SINTÉTICO único e estável por
 * admissão só para diferenciar. §A.6: entrada sintética, nada de PII. §A.11: sem travessão.
 */

afterEach(() => vi.restoreAllMocks());
const ADM = "66666666-6666-6666-6666-666666666666";
const ESTADO_VIVO = { farolGlobal: "EM_ADMISSAO", pausadaEm: null, origem: "MANUAL" };

describe("codigoFuncionarioSinteticoGi: estavel, unico na pratica, 6 digitos", () => {
  it("ESTAVEL: mesma admissao => mesmo codigo (reenviar nao cria chave nova)", () => {
    expect(codigoFuncionarioSinteticoGi(ADM)).toBe(codigoFuncionarioSinteticoGi(ADM));
  });

  it("tem EXATAMENTE 6 digitos, faixa [1e5, 1e6) (exigencia do suporte do G.I, 16/10/2026)", () => {
    for (const id of [ADM, "11111111-2222-3333-4444-555555555555", "abcdef01-0000-0000-0000-000000000001"]) {
      const c = codigoFuncionarioSinteticoGi(id);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(100_000);
      expect(c).toBeLessThan(1_000_000);
      expect(String(c)).toHaveLength(6); // o G.I aceita no maximo 6 digitos; o EA mandava 10
    }
  });

  it("UNICO na pratica para o volume vivo: 1000 ids geram >= 990 codigos distintos", () => {
    // Em 6 digitos o espaco e [1e5, 1e6) = 900 mil valores, entao a unicidade e PRATICA, nao absoluta
    // (o pombal de 10 digitos foi trocado pela exigencia do G.I de 6). Para as poucas dezenas de
    // pre-admissoes vivas a colisao e desprezivel; mesmo com 1000 ids a dispersao fica >= 99%, e a
    // matricula REAL (unica de verdade) e cadastrada depois pelo time. A funcao e determinista, entao
    // este numero nao e flaky: as mesmas 1000 strings dao sempre o mesmo resultado.
    const set = new Set<number>();
    for (let i = 0; i < 1000; i++) set.add(codigoFuncionarioSinteticoGi(`id-${i}-${ADM}`));
    expect(set.size).toBeGreaterThanOrEqual(990);
  });
});

describe("montador: emite codigoFuncionario das opcoes, com rede de runtime", () => {
  it("sem opcao: default 0 (o do fornecedor)", () => {
    const p = montarFuncionarioSelecao(PESSOA) as unknown as Record<string, unknown>;
    expect("codigoFuncionario" in p).toBe(true);
    expect(p.codigoFuncionario).toBe(0);
  });

  it("inteiro positivo passa; 0/negativo/decimal/string viram 0", () => {
    const ok = montarFuncionarioSelecao(PESSOA, undefined, undefined, {
      apiSincAdmissaoDigital: false,
      codigoFuncionario: 1_500_000_123,
    }) as unknown as Record<string, unknown>;
    expect(ok.codigoFuncionario).toBe(1_500_000_123);
    // ⚠️ acima de int32 (2^31-1) tambem cai em 0: a rede e a fronteira, nao so o produtor.
    for (const sujo of [0, -5, 3.14, "1500000000", null, undefined, NaN, Infinity, 3_000_000_000, 2_147_483_648]) {
      const p = montarFuncionarioSelecao(PESSOA, undefined, undefined, {
        apiSincAdmissaoDigital: false,
        codigoFuncionario: sujo,
      } as never) as unknown as Record<string, unknown>;
      expect(p.codigoFuncionario, `entrada ${JSON.stringify(sujo)}`).toBe(0);
    }
  });
});

describe("EnviarParaGiService: o envio manda o codigoFuncionario SINTETICO da admissao", () => {
  function servico() {
    const criar = vi.fn(
      async (_p: FuncionarioSelecao): Promise<GiCriacaoResultado> => ({ ok: true, funcionarioSelecaoId: "X" }),
    );
    const giApi = { configurado: () => true, criarFuncionarioSelecao: criar } as unknown as GiApiService;
    const leitor = {
      jaEnviado: async () => false,
      lerPessoa: async () => PESSOA,
      lerContratacao: async () => contratacaoDeFolhaCompleta(),
      marcarEnviado: vi.fn(async () => {}),
      lerEstado: async () => ESTADO_VIVO,
    } as unknown as GiLeitorService;
    const depara = { ...DE_PARA_GI_VAZIO, parEmpresaFilialConhecido: PAR_CONHECIDO } as unknown as GiDeParaService;
    const config = { get: (k: string) => ({ GI_DISPARO_ARMADO: "true" })[k] } as unknown as ConfigService;
    return { svc: new EnviarParaGiService(config, giApi, leitor, depara), criar };
  }

  it("manual: payload.codigoFuncionario = codigoFuncionarioSinteticoGi(admissaoId), nao-zero", async () => {
    const { svc, criar } = servico();
    await svc.enviarManual(ADM, "autor");
    const payload = criar.mock.calls[0]?.[0] as FuncionarioSelecao;
    expect(payload.codigoFuncionario).toBe(codigoFuncionarioSinteticoGi(ADM));
    expect(payload.codigoFuncionario).toBeGreaterThan(0);
  });

  it("automatico: idem (mesma cadeia unica)", async () => {
    const { svc, criar } = servico();
    await svc.enviar(ADM, { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: "a" });
    const payload = criar.mock.calls[0]?.[0] as FuncionarioSelecao;
    expect(payload.codigoFuncionario).toBe(codigoFuncionarioSinteticoGi(ADM));
  });
});
