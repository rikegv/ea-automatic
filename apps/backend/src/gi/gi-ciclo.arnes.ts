import { vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import { frentesAdmissao, frenteStatusEventos } from "../db/schema";
import { EnviarParaGiService, type GiEnvioResultado } from "./enviar-para-gi.service";
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
 * ARNES COM ESTADO do gatilho automatico do GI. NAO e um `spec`: e o duble compartilhado pelos dois
 * arquivos da RODADA 2, por isso o nome nao casa com o padrao que o vitest coleta.
 *
 * ┌─ POR QUE UM SEGUNDO ARNES, e nao um patch no da rodada 1 ──────────────────────────────────────┐
 * │ O arnes da rodada 1 (`gi-automatico.arnes.ts`) e SEM ESTADO de proposito: cada cenario monta   │
 * │ um mundo fixo ("a frente ja estava concluida", "a regua esta completa") e mede UMA passagem.   │
 * │ Isso cobre bem o par evento/estado, e nao cobre NADA que dependa de o mundo MUDAR entre        │
 * │ passagens, que e exatamente o que a rodada 2 precisa medir:                                     │
 * │                                                                                                 │
 * │  - o CICLO fecha -> recua -> fecha de novo, em que o `concluida` da frente volta a `false` e a  │
 * │    segunda passagem e uma TRANSICAO de verdade (o gate da transicao NAO protege ali);           │
 * │  - a CORRIDA, em que o `UPDATE` condicional afeta ZERO linhas porque outra passagem ganhou.     │
 * │                                                                                                 │
 * │ Aqui o `UPDATE` e EMULADO contra o estado: a conclusao so afeta uma linha quando a frente       │
 * │ estava aberta, e o recuo reabre a frente. A contagem devolvida deixa de ser um `1` fixo e passa │
 * │ a ser a consequencia do mundo, que e a unica forma de o teste poder reprovar o gate.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: toda entrada e SINTETICA (reusada do arnes da rodada 1: CPF da faixa reservada 999, que a
 * Receita nunca emitiu, nome inventado, dominio de homologacao). §A.11: nenhum travessao.
 */

/** Como o `UPDATE` condicional da conclusao se comporta nesta passagem. */
export type ContagemDaConclusao =
  /** O mundo decide: 1 quando a frente estava aberta, 0 quando ja estava fechada. */
  | "pelo-mundo"
  /** A CORRIDA: outra passagem fechou a frente entre a leitura e o UPDATE. Escreve ZERO linhas. */
  | "zero"
  /** O driver NAO informou a contagem (`undefined`/`null`). A escrita ACONTECEU, o sinal nao veio. */
  | "desconhecida";

export interface CenarioCiclo {
  /** `GI_DISPARO_ARMADO`. Default `true`: a rodada 2 mede o caminho que chega ao POST. */
  armado?: boolean;
  /** A frente EXAME ja concluida (abre o gate da regra 3 e faz o Cadastro precisar nascer). */
  exameConcluido?: boolean;
  /** A admissao JA tem o carimbo de idempotencia do GI (`admissao_dados_gi.gi_enviado_em`). */
  carimboInicial?: boolean;
  contagemDaConclusao?: ContagemDaConclusao;
  giConfigurado?: boolean;
  /** `admissoes.farol_global` corrente. Default `EM_ADMISSAO` (vivo). */
  farolGlobal?: string;
  /** `admissoes.pausada_em`. */
  pausadaEm?: Date | null;
  /** `admissoes.origem`. Default `MANUAL`, o fluxo NOVO, que e a origem autorizada a enviar ao GI. */
  origem?: string;
}

export interface FrenteEmMemoria {
  id: string;
  tipo: string;
  status: string;
  concluida: boolean;
}

/**
 * OS NOMES DE COLUNA que uma clausula `where` do drizzle referencia, em profundidade.
 *
 * POR QUE ISSO EXISTE, e e a unica forma de um teste sem Postgres medir a CONDICAO do UPDATE: a
 * emulacao do `UPDATE` olha o que a escrita QUER fazer, nunca a clausula, entao tirar o
 * `eq(concluida, false)` do `where` nao mudaria nenhuma contagem em memoria e a mutacao passaria
 * calada. A clausula e um objeto do drizzle (`SQL`), com os `queryChunks` aninhados: a descida
 * recursiva junta os nomes das colunas, e `["id", "concluida"]` e a prova de que o UPDATE e
 * CONDICIONAL. Sem o segundo nome, ele voltou a ser incondicional.
 */
export function colunasDaClausula(no: unknown, saida: string[] = []): string[] {
  if (no == null || typeof no !== "object") return saida;
  const obj = no as { name?: unknown; queryChunks?: unknown[] };
  if (typeof obj.name === "string" && !Array.isArray(obj.queryChunks)) saida.push(obj.name);
  if (Array.isArray(obj.queryChunks)) obj.queryChunks.forEach((c) => colunasDaClausula(c, saida));
  return saida;
}

export function montarArnesCiclo(cen: CenarioCiclo = {}) {
  const estado = {
    /** O DEPOIS de cada passagem: a regua obrigatoria esta completa agora? Mutavel pelo teste. */
    reguaCompleta: true,
    /** A marca de idempotencia do GI. `marcarEnviado` a liga; o teste pode apaga-la (TTL). */
    carimbo: cen.carimboInicial ?? false,
    frentes: [
      {
        id: "frente-auditoria",
        tipo: "AUDITORIA",
        status: "ANALISE_PENDENTE",
        concluida: false,
      },
      {
        id: "frente-exame",
        tipo: "EXAME",
        status: cen.exameConcluido ? "APTO" : "A_AGENDAR",
        concluida: cen.exameConcluido ?? false,
      },
    ] as FrenteEmMemoria[],
    admissao: {
      id: ADM_SELECT.id,
      codCliente: ADM_SELECT.codCliente,
      farolGlobal: cen.farolGlobal ?? "EM_ADMISSAO",
      pausadaEm: cen.pausadaEm ?? null,
      // `admissoes.origem`: a coluna e NOT NULL com default `MANUAL` no banco, entao uma admissao de
      // verdade SEMPRE a tem. O padrao e o fluxo NOVO, que e a origem autorizada a enviar: assim o
      // mundo base deste arnes e o mundo em que o gatilho DEVE enviar, e os zeros de cada arquivo
      // seguem vindo da guarda que ele mede. Teste que queira outra origem sobrescreve a chave.
      origem: cen.origem ?? "MANUAL",
      isBanco: false,
      dataAdmissao: ADM_SELECT.dataAdmissao,
      clicksignStatus: "SEM_ENVELOPE",
      kitAssinaturaPath: null,
      kitAssinaturaEm: null,
    },
  };

  const auditoriaEmMemoria = () => estado.frentes.find((f) => f.tipo === "AUDITORIA");

  // ── O ESPIAO QUE DECIDE O INVARIANTE: a porta do POST para a folha do fornecedor. ──
  const criar = vi.fn(async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => {
    return { ok: true, funcionarioSelecaoId: "GI-SINTETICO" };
  });
  const marcarEnviado = vi.fn(async (_id: string, _giId?: string | null) => {
    estado.carimbo = true;
  });

  const giApi = {
    configurado: () => cen.giConfigurado !== false,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => estado.carimbo,
    lerPessoa: async () => PESSOA,
    lerContratacao: async () => contratacaoDeFolhaCompleta(),
    // O ESTADO que as travas de envio leem, servido da MESMA linha viva de `estado.admissao` que o
    // `findFirst` do arnes entrega ao codigo de producao. Serve da linha, e nao de constantes, para o
    // teste poder mexer no farol, na pausa e na origem sem tocar o arnes (que e compartilhado), e para
    // a AUSENCIA da chave `origem` continuar sendo ausencia de verdade (fail-closed de verdade).
    lerEstado: async () => {
      const linha = estado.admissao as unknown as Record<string, unknown>;
      return {
        farolGlobal: linha.farolGlobal,
        pausadaEm: linha.pausadaEm,
        origem: linha.origem,
      };
    },
    marcarEnviado,
  } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: (cen.armado ?? true) ? "true" : "false" })[k],
  } as unknown as ConfigService;

  // O SERVICO DO GI INTEIRO, de verdade, como na rodada 1. O `enviar` e ESPIONADO sem substituir a
  // implementacao, para o teste poder dizer QUAL trava mordeu (o desfecho fechado que ele devolve).
  const gi = new EnviarParaGiService(config, giApi, leitor, depara);
  const enviar = vi.spyOn(gi, "enviar");

  /** Os eventos de `frente_status_eventos` que a transacao gravou, na ordem. */
  const eventos: { frenteId: string; tipo: string; paraStatus: string; reversao: boolean }[] = [];
  /** As frentes que NASCERAM dentro da transacao (o Cadastro, a Integracao, o iFractal). */
  const frentesNascidas: string[] = [];

  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    // Copias, nao as linhas vivas: um `SELECT` de verdade devolve snapshot, e o codigo de producao
    // decide sobre o que leu. Devolver a referencia viva esconderia leitura obsoleta.
    const rows = keys.includes("candidatoNome")
      ? [ADM_SELECT]
      : keys.includes("concluida")
        ? estado.frentes.map((f) => ({ ...f }))
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

  /**
   * O `UPDATE` de `frentes_admissao` EMULADO contra o estado, que e o coracao deste arnes.
   *
   * A conclusao e a `set` com `concluida: true` + `status: ANALISE_OK`; o recuo e a `set` com
   * `concluida: false`. Nao se olha a clausula `where` (ela e um objeto do drizzle): olha-se o que a
   * escrita QUER fazer, e o estado responde se havia linha para afetar.
   */
  const updateDeFrente = (vals: Record<string, unknown>) => {
    const auditoria = auditoriaEmMemoria();
    if (vals.concluida === true) {
      if (cen.contagemDaConclusao === "zero") {
        // A CORRIDA: a outra passagem fechou a frente primeiro. O `WHERE concluida = false` nao
        // encontra linha, e nada e escrito.
        return { count: 0 };
      }
      if (!auditoria || auditoria.concluida) return { count: 0 };
      auditoria.concluida = true;
      auditoria.status = "ANALISE_OK";
      // A ESCRITA ACONTECEU e o driver nao informou a contagem: e esse o caso em que o
      // `linhasAfetadas` devolve `null` e o envio tem de CEDER.
      return cen.contagemDaConclusao === "desconhecida" ? {} : { count: 1 };
    }
    if (vals.concluida === false) {
      const alvo =
        vals.status === "ANALISE_PENDENTE"
          ? auditoria
          : estado.frentes.find((f) => f.status === vals.status || f.tipo === "CADASTRO_CONTRATO");
      if (alvo) {
        alvo.concluida = false;
        alvo.status = String(vals.status);
      }
      return { count: alvo ? 1 : 0 };
    }
    return { count: 0 };
  };

  /** As colunas que o `where` do UPDATE da CONCLUSAO referenciou (ver `colunasDaClausula`). */
  const whereDaConclusao: string[][] = [];

  const tx = {
    update: vi.fn((tabela: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (clausula: unknown) => {
          if (tabela === frentesAdmissao && vals.concluida === true) {
            whereDaConclusao.push(colunasDaClausula(clausula));
          }
          return Promise.resolve(tabela === frentesAdmissao ? updateDeFrente(vals) : { count: 1 });
        },
      }),
    })),
    insert: vi.fn((tabela: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        if (tabela === frenteStatusEventos) {
          eventos.push({
            frenteId: String(vals.frenteId),
            tipo: String(vals.tipo),
            paraStatus: String(vals.paraStatus),
            reversao: Boolean(vals.reversao),
          });
          return Promise.resolve(undefined);
        }
        if (tabela === frentesAdmissao) {
          const tipo = String(vals.tipo);
          frentesNascidas.push(tipo);
          estado.frentes.push({
            id: `frente-${tipo.toLowerCase()}`,
            tipo,
            status: String(vals.status),
            concluida: false,
          });
          const encadeado = {
            onConflictDoNothing: () => encadeado,
            returning: () => Promise.resolve([{ id: `frente-${tipo.toLowerCase()}` }]),
          };
          return encadeado;
        }
        const neutro = {
          onConflictDoNothing: () => neutro,
          onConflictDoUpdate: () => Promise.resolve(undefined),
          returning: () => Promise.resolve([]),
        };
        return neutro;
      },
    })),
    delete: vi.fn(() => ({ where: async () => undefined })),
    select,
  };

  const db = {
    select,
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve({ count: 1 }) }) })),
    insert: vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined) }),
    })),
    delete: vi.fn(() => ({ where: async () => undefined })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      admissoes: { findFirst: vi.fn(async () => ({ ...estado.admissao })) },
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
        completa: estado.reguaCompleta,
        obrigatoriosTotal: 5,
        obrigatoriosOk: estado.reguaCompleta ? 5 : 4,
      })),
    } as never,
    { resolver: async () => resolvePastaPaiId(null, null, {}) } as never,
    {} as never,
    gi as never,
  );

  /** Uma passagem do pos-veredito, com o mundo como o teste o deixou. */
  const passar = () => svc.aplicarPosVeredito(ADM_SELECT.id, USER);

  /** Os desfechos FECHADOS que o servico do GI devolveu, na ordem das chamadas de `enviar`. */
  const desfechos = async (): Promise<GiEnvioResultado[]> =>
    Promise.all(enviar.mock.results.map((r) => r.value as Promise<GiEnvioResultado>));

  return {
    svc,
    passar,
    estado,
    criar,
    marcarEnviado,
    enviar,
    desfechos,
    eventos,
    frentesNascidas,
    whereDaConclusao,
    tx,
    USER,
  };
}
