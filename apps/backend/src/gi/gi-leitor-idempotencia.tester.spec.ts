import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import { GiLeitorService } from "./gi-leitor.service";
import { DE_PARA_GI_VAZIO, RETENCAO_DADOS_GI_MS } from "../domain/portal-dados-gi";

/**
 * IDEMPOTÊNCIA DO ENVIO AO GI: a marca existe SEMPRE, inclusive quando a linha não existia.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO (§A.38/§A.40), com o banco FALSIFICADO (sem Postgres).
 *
 * ┌─ O QUE ESTA RÉGUA EXISTE PARA IMPEDIR ─────────────────────────────────────────────────────────┐
 * │ `marcarEnviado` era um `UPDATE ... WHERE admissao_id = ?`. Em Postgres, UPDATE que não encontra  │
 * │ linha afeta ZERO linhas e **não falha**: nenhum erro, nenhum log, nada. Então, para a admissão   │
 * │ cuja linha de `admissao_dados_gi` não existe (candidato que nunca passou pelo Portal, ou linha   │
 * │ já apagada pelo TTL), o carimbo simplesmente não acontecia, `jaEnviado` seguia `false`, e a      │
 * │ SEGUNDA tentativa criava um SEGUNDO `FuncionarioSelecao` na PRODUÇÃO DO FORNECEDOR, que é um     │
 * │ efeito que o EA não tem como desfazer.                                                          │
 * │                                                                                                 │
 * │ Por isso o teste que mais importa aqui não é o do upsert isolado: é o de baixo, com o serviço de │
 * │ envio real sobre o leitor real, chamando `enviarManual` DUAS vezes.                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de pessoa real. O CPF é sintético e válido no verificador só para o fluxo não recusar
 * antes de chegar ao ponto medido; nenhum valor é impresso em mensagem de falha.
 */

const ADM = "11111111-1111-1111-1111-111111111111";
const CPF_SINTETICO = "39053344705";

/** A linha de `admissao_dados_gi` no recorte que a idempotência usa. */
interface LinhaGi {
  admissaoId: string;
  giEnviadoEm: Date | null;
  giFuncionarioSelecaoId: string | null;
  expurgarEm: Date | null;
}

/**
 * Banco de mentirinha com UMA tabela e o unique de `admissao_id`, que é o que dá sentido ao upsert.
 *
 * Ele IMITA o Postgres no ponto que origina o defeito: `update` que não encontra linha **não falha**,
 * só não faz nada (e conta em `updatesSemLinha`, para a falha ficar legível).
 */
function bancoFalso(linhaInicial?: Partial<LinhaGi>) {
  const tabela = new Map<string, LinhaGi>();
  if (linhaInicial) {
    tabela.set(ADM, {
      admissaoId: ADM,
      giEnviadoEm: null,
      giFuncionarioSelecaoId: null,
      expurgarEm: null,
      ...linhaInicial,
    });
  }
  const trilha = { inseridas: 0, conflitos: 0, updates: 0, updatesSemLinha: 0 };

  function cadeiaSelect(chaves: string[]) {
    const c: Record<string, unknown> = {};
    for (const metodo of ["from", "innerJoin", "leftJoin", "where", "orderBy"]) {
      c[metodo] = () => c;
    }
    c.limit = async () => {
      if (chaves.includes("enviadoEm")) {
        const l = tabela.get(ADM);
        return l ? [{ enviadoEm: l.giEnviadoEm }] : [];
      }
      if (chaves.includes("cand")) {
        // A pessoa mínima que faz o envio seguir (nome + CPF). O resto do payload não importa aqui.
        return [{ cand: { nome: "Fulano De Tal", cpf: CPF_SINTETICO }, dados: {} }];
      }
      return [];
    };
    return c;
  }

  const db = {
    select: (proj: Record<string, unknown>) => cadeiaSelect(Object.keys(proj ?? {})),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        const aplicar = (set?: Record<string, unknown>) => {
          const chave = String(v.admissaoId);
          const existente = tabela.get(chave);
          if (existente) {
            trilha.conflitos += 1;
            Object.assign(existente, set ?? {});
            return;
          }
          trilha.inseridas += 1;
          tabela.set(chave, {
            admissaoId: chave,
            giEnviadoEm: (v.giEnviadoEm as Date | undefined) ?? null,
            giFuncionarioSelecaoId: (v.giFuncionarioSelecaoId as string | undefined) ?? null,
            expurgarEm: (v.expurgarEm as Date | undefined) ?? null,
          });
        };
        return {
          onConflictDoUpdate: async (arg: { set?: Record<string, unknown> }) => aplicar(arg?.set),
          // INSERT cru, sem tratar o conflito: no banco real o unique de `admissao_id` estouraria na
          // admissão que JÁ tem linha (o caso normal), e o envio quebraria depois de criado no GI.
          then: (_r: unknown, j?: (e: unknown) => void) => {
            const e = new Error(
              "INSERT sem onConflictDoUpdate: o unique de admissao_id derrubaria a admissao que ja tem linha",
            );
            if (j) return j(e);
            return Promise.reject(e);
          },
        };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          const l = tabela.get(ADM);
          if (!l) {
            // É AQUI que o defeito nascia: zero linhas afetadas, nenhum erro.
            trilha.updatesSemLinha += 1;
            return;
          }
          trilha.updates += 1;
          Object.assign(l, v);
        },
      }),
    }),
  };

  return { tabela, trilha, db };
}

function leitor(b: ReturnType<typeof bancoFalso>): GiLeitorService {
  return new GiLeitorService(b.db as never);
}

describe("marcarEnviado e UPSERT: a marca passa a existir mesmo sem linha previa", () => {
  it("CRIA a linha quando ela nao existe, e `jaEnviado` passa a devolver true", async () => {
    const b = bancoFalso(); // tabela VAZIA: a admissão nunca passou pelo Portal
    const l = leitor(b);

    expect(await l.jaEnviado(ADM)).toBe(false);
    await l.marcarEnviado(ADM, "GI-123");

    expect(
      b.trilha.updatesSemLinha,
      "o carimbo foi tentado por UPDATE e nao afetou linha nenhuma (o defeito)",
    ).toBe(0);
    expect(b.tabela.size).toBe(1);
    expect(b.tabela.get(ADM)?.giEnviadoEm).toBeInstanceOf(Date);
    expect(b.tabela.get(ADM)?.giFuncionarioSelecaoId).toBe("GI-123");
    expect(await l.jaEnviado(ADM)).toBe(true);
  });

  it("a linha CRIADA nasce com o teto de retencao (§A.6), nunca sem relogio", async () => {
    // Sem `expurgar_em`, o dado de documento (RG, PIS) ficaria no EA para sempre: o sweep só apaga o
    // que tem teto vencido, e nulo é tratado como "não expurga" de propósito.
    const b = bancoFalso();
    const antes = Date.now();
    await leitor(b).marcarEnviado(ADM, "GI-123");

    const teto = b.tabela.get(ADM)?.expurgarEm;
    expect(teto, "linha criada sem teto de retencao").toBeInstanceOf(Date);
    expect((teto as Date).getTime()).toBeGreaterThan(antes);
    // E o teto é a MESMA retenção que a confirmação do candidato usa, não um prazo inventado aqui.
    expect((teto as Date).getTime() - antes).toBeGreaterThanOrEqual(RETENCAO_DADOS_GI_MS - 5_000);
    expect((teto as Date).getTime() - antes).toBeLessThanOrEqual(RETENCAO_DADOS_GI_MS + 5_000);
  });

  it("ATUALIZA a linha que ja existe, sem criar uma segunda", async () => {
    const b = bancoFalso({ giEnviadoEm: null });
    const l = leitor(b);

    await l.marcarEnviado(ADM, "GI-123");

    expect(b.tabela.size, "o upsert duplicou a linha da admissao").toBe(1);
    expect(b.tabela.get(ADM)?.giEnviadoEm).toBeInstanceOf(Date);
    expect(b.tabela.get(ADM)?.giFuncionarioSelecaoId).toBe("GI-123");
    expect(await l.jaEnviado(ADM)).toBe(true);
  });

  it("no conflito, o teto de retencao de quem confirmou NAO e estendido", async () => {
    // Minimização (§A.6): a linha que já estava contando o prazo continua com o prazo dela. Re-carimbar
    // no envio ESTENDERIA a retenção de um dado de documento, na direção contrária da regra.
    const tetoDoCandidato = new Date("2026-11-01T00:00:00.000Z");
    const b = bancoFalso({ expurgarEm: tetoDoCandidato });

    await leitor(b).marcarEnviado(ADM, "GI-123");

    expect(b.tabela.get(ADM)?.expurgarEm?.toISOString()).toBe(tetoDoCandidato.toISOString());
  });

  it("o GI pode confirmar sem devolver id: o carimbo de data vale sozinho", async () => {
    const b = bancoFalso();
    await leitor(b).marcarEnviado(ADM, null);

    expect(b.tabela.get(ADM)?.giEnviadoEm).toBeInstanceOf(Date);
    expect(b.tabela.get(ADM)?.giFuncionarioSelecaoId).toBeNull();
    expect(await leitor(b).jaEnviado(ADM)).toBe(true);
  });
});

describe("O CENARIO QUE MOTIVOU O CONSERTO: duas chamadas de enviarManual, um registro so", () => {
  function envio(b: ReturnType<typeof bancoFalso>) {
    const criar = vi.fn(
      async (): Promise<GiCriacaoResultado> => ({ ok: true, funcionarioSelecaoId: "GI-123" }),
    );
    const giApi = {
      configurado: () => true,
      criarFuncionarioSelecao: criar,
    } as unknown as GiApiService;
    const config = { get: (k: string) => ({ GI_DISPARO_ARMADO: "true" })[k] } as unknown as ConfigService;
    const svc = new EnviarParaGiService(
      config,
      giApi,
      leitor(b),
      DE_PARA_GI_VAZIO as unknown as GiDeParaService,
    );
    return { svc, criar };
  }

  it("SEM linha previa (o caso que duplicava): o segundo clique NAO cria no GI", async () => {
    const b = bancoFalso(); // a admissão não tem linha em `admissao_dados_gi`
    const { svc, criar } = envio(b);

    const primeiro = await svc.enviarManual(ADM, "autor-1");
    const segundo = await svc.enviarManual(ADM, "autor-1");

    expect(primeiro).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(segundo.motivo, "o segundo clique voltou a enviar").toBe("GI_JA_ENVIADO");
    expect(criar, "dois FuncionarioSelecao criados na producao do fornecedor").toHaveBeenCalledTimes(
      1,
    );
    expect(b.tabela.size).toBe(1);
  });

  it("COM linha previa: segue valendo (o caminho que ja funcionava nao regrediu)", async () => {
    const b = bancoFalso({ giEnviadoEm: null });
    const { svc, criar } = envio(b);

    await svc.enviarManual(ADM, "autor-1");
    const segundo = await svc.enviarManual(ADM, "autor-1");

    expect(segundo.motivo).toBe("GI_JA_ENVIADO");
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it("TRES cliques tambem param no primeiro envio", async () => {
    const b = bancoFalso();
    const { svc, criar } = envio(b);

    const motivos = [
      (await svc.enviarManual(ADM, "autor-1")).motivo,
      (await svc.enviarManual(ADM, "autor-2")).motivo,
      (await svc.enviarManual(ADM, "autor-3")).motivo,
    ];

    expect(motivos).toEqual(["GI_ENVIADO", "GI_JA_ENVIADO", "GI_JA_ENVIADO"]);
    expect(criar).toHaveBeenCalledTimes(1);
  });
});
