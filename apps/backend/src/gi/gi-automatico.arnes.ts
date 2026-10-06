import { vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import type { AuthUser } from "../auth/auth.types";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiDeParaService } from "./gi-depara.service";
import type { GiLeitorService } from "./gi-leitor.service";
import {
  DE_PARA_GI_VAZIO,
  montarContratacaoGi,
  type ContratacaoGi,
  type FuncionarioSelecao,
  type ParEmpresaFilialConhecido,
  type PessoaParaGi,
} from "../domain/portal-dados-gi";

/**
 * ARNES do GATILHO AUTOMATICO do GI (fechamento da auditoria). NAO e um `spec`: e o duble
 * compartilhado pelos dois arquivos de teste que medem o gatilho, por isso o nome nao casa com o
 * padrao que o vitest coleta.
 *
 * ┌─ A DECISAO DE DESENHO DO ARNES, e ela e o que torna os testes uteis ───────────────────────────┐
 * │ A `AuditoriaService` roda sobre dubles, mas o `EnviarParaGiService` entra INTEIRO, de verdade,  │
 * │ ligado a um `GiApiService` espiao. O requisito do diretor fala de EFEITO ("zero chamada ao      │
 * │ cliente do GI"), nao de onde o portao da transicao mora: ele pode nascer no `aplicarPosVeredito`│
 * │ ou dentro do proprio servico do GI. Espionar o metodo `enviar` reprovaria uma das duas          │
 * │ implementacoes por motivo de FORMA. Espionar `criarFuncionarioSelecao` mede a REGRA: a pessoa    │
 * │ foi, ou nao foi, para a folha. E deixa o teste indiferente a assinatura que o `backend` escolher │
 * │ para `enviar`, porque quem a chama e o codigo de producao, nunca o teste.                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A TRANSICAO, como o desenho a define: a frente AUDITORIA NAO estava concluida e passou a estar
 * NESTA chamada. O "antes" sai de `frentes_admissao.concluida`, que ja e persistido (regra 2 do
 * §A.3). O cenario controla as duas pontas: `frenteAuditoriaConcluida` e o ANTES, `reguaCompleta`
 * e o DEPOIS.
 *
 * §A.6: toda entrada e SINTETICA. CPF da faixa reservada 999 (classe que a Receita nunca emitiu),
 * nome inventado, dominio de homologacao, salario inventado. §A.11: nenhum travessao.
 */

export const USER: AuthUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "consultor@homolog.local",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** O par `1/4`, REAL, medido em `Empresa/GetAll` no fornecedor. */
export const PAR_CONHECIDO: ParEmpresaFilialConhecido = (empresa, filial) =>
  empresa === 1 && filial === 4;

/** §A.6: CPF da faixa reservada 999, nome inventado, dominio de homologacao. */
export const PESSOA: PessoaParaGi = {
  nome: "Marcilene Tubarossi Quenhapa",
  cpf: "99955544433",
  email: "marcilene@homolog.local",
};

/** A admissao que o `select` do pos-veredito devolve. §A.6: tudo sintetico. */
export const ADM_SELECT = {
  id: "adm-sintetica",
  codCliente: "123",
  cargoId: "cargo-sintetico",
  tipoContrato: "Temporário",
  dataAdmissao: new Date("2026-11-03"),
  // Com pasta JA criada de proposito: o arquivamento no Drive nao e o objeto destes testes, e
  // `precisaArquivarDrive` com link real mantem o caminho do Drive fora do caminho medido.
  drivePastaUrl: "https://drive.google.com/drive/folders/sintetico",
  driveAsoUrl: null,
  driveDuplicatasBaixadas: null,
  candidatoNome: PESSOA.nome,
  candidatoCpf: PESSOA.cpf,
  candidatoSexo: "FEMININO",
  candidatoBanco: null,
  candidatoAgencia: null,
  candidatoConta: null,
  clienteOperacao: "Operacao Sintetica",
};

/** Contratacao COMPLETA do ponto de vista da FOLHA: passa as seis guardas do passo 6. */
export function contratacaoDeFolhaCompleta(
  patch: Partial<Parameters<typeof montarContratacaoGi>[0]> = {},
): ContratacaoGi {
  return montarContratacaoGi({
    salario: "2750.00",
    salarioUnidade: "MENSAL",
    dataAdmissao: "2026-11-03",
    tipoContrato: "Temporário",
    vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "4", ativo: true }],
    codCliente: "123",
    ...patch,
  });
}

export interface CenarioAutomatico {
  /** O ANTES: a frente AUDITORIA ja estava concluida quando a chamada comecou? */
  frenteAuditoriaConcluida: boolean;
  /** O DEPOIS: a regua obrigatoria esta completa ao fim do veredito? */
  reguaCompleta: boolean;
  /** `GI_DISPARO_ARMADO`. Sem `true`, o automatico monta e para. */
  armado: boolean;
  giConfigurado?: boolean;
  jaEnviado?: boolean;
  contratacao?: ContratacaoGi;
  pessoa?: PessoaParaGi | null;
  /** O GI fora do ar: `criarFuncionarioSelecao` LANCA, em vez de devolver `ok: false`. */
  giLanca?: boolean;
  /** O GI devolvendo falha limpa (`ok: false`), que e o outro modo de falha. */
  giRecusa?: boolean;
  /** `admissoes.farol_global` que o leitor devolve. Padrao: admissao VIVA. */
  farolGlobal?: string | null;
  /** `admissoes.pausada_em` que o leitor devolve. Padrao: nao pausada. */
  pausadaEm?: Date | null;
  /** `admissoes.origem` que o leitor devolve. Padrao: `MANUAL`, o fluxo NOVO, que ENVIA. */
  origem?: unknown;
}

export function montarArnesAutomatico(cen: CenarioAutomatico) {
  // ── O ESPIAO QUE DECIDE TODOS OS INVARIANTES: a porta do POST para a folha. ──
  const criar = vi.fn(async (_payload: FuncionarioSelecao): Promise<GiCriacaoResultado> => {
    if (cen.giLanca) throw new Error("GI fora do ar (sintetico)");
    if (cen.giRecusa) return { ok: false, motivo: "RECUSADO", status: 400 };
    return { ok: true, funcionarioSelecaoId: "GI-SINTETICO" };
  });
  const marcarEnviado = vi.fn(async (_id: string, _giId?: string) => {});

  const giApi = {
    configurado: () => cen.giConfigurado !== false,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: async () => cen.jaEnviado ?? false,
    lerPessoa: async () => (cen.pessoa === undefined ? PESSOA : cen.pessoa),
    lerContratacao: async () => cen.contratacao ?? contratacaoDeFolhaCompleta(),
    // O ESTADO que as travas de envio leem (farol, pausa, origem). O cenario base e admissao VIVA do
    // fluxo NOVO, que e o mundo em que o gatilho DEVE enviar: assim os zeros destes arquivos continuam
    // vindo da guarda que cada um mede, e nao da trava de origem nem da de encerramento.
    lerEstado: async () => ({
      farolGlobal: cen.farolGlobal ?? "EM_ADMISSAO",
      pausadaEm: cen.pausadaEm ?? null,
      origem: cen.origem ?? "MANUAL",
    }),
    marcarEnviado,
  } as unknown as GiLeitorService;
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: PAR_CONHECIDO,
  } as unknown as GiDeParaService;
  const config = {
    get: (k: string) => ({ GI_DISPARO_ARMADO: cen.armado ? "true" : "false" })[k],
  } as unknown as ConfigService;

  // O SERVICO DO GI INTEIRO, de verdade. E o unico nao-duble do caminho medido.
  const gi = new EnviarParaGiService(config, giApi, leitor, depara);

  const frentes = [
    {
      id: "frente-auditoria",
      tipo: "AUDITORIA",
      status: cen.frenteAuditoriaConcluida ? "ANALISE_OK" : "ANALISE_PENDENTE",
      concluida: cen.frenteAuditoriaConcluida,
    },
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
    };
    return builder;
  });

  const tx = {
    /**
     * O `UPDATE` devolve a CONTAGEM DE LINHAS AFETADAS, e isso nao e detalhe de duble: e o sinal da
     * TRANSICAO. A conclusao da frente virou um UPDATE CONDICIONAL (`WHERE id = ? AND concluida =
     * false`) dentro da transacao, e `count === 1` e o que distingue "fechou NESTA chamada" de "ja
     * estava fechada". O driver desta casa e o `postgres-js`, que carrega a contagem em `count`.
     *
     * `count: 1` aqui significa "a frente estava aberta e este UPDATE a fechou", que e o cenario que
     * o arnes monta quando `frenteAuditoriaConcluida` e `false`. Quando ela e `true`, o codigo de
     * producao nem chega a este UPDATE (sai pela pre-checagem idempotente), entao um valor fixo nao
     * falseia o caso do ESTADO: ele continua medido pelo caminho de verdade.
     */
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve({ count: 1 }) }) })),
    insert: vi.fn(() => ({ values: () => Promise.resolve(undefined) })),
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
      admissoes: {
        findFirst: vi.fn(async () => ({
          id: ADM_SELECT.id,
          codCliente: ADM_SELECT.codCliente,
          farolGlobal: "EM_ADMISSAO",
          isBanco: false,
          dataAdmissao: ADM_SELECT.dataAdmissao,
          clicksignStatus: "SEM_ENVELOPE",
          kitAssinaturaPath: null,
          kitAssinaturaEm: null,
        })),
      },
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
        completa: cen.reguaCompleta,
        obrigatoriosTotal: 5,
        obrigatoriosOk: cen.reguaCompleta ? 5 : 4,
      })),
    } as never,
    { resolver: async () => resolvePastaPaiId(null, null, {}) } as never,
    {} as never,
    gi as never,
  );

  return { svc, criar, marcarEnviado };
}

/** O atalho dos cenarios: a TRANSICAO perfeita, com a flag armada, variando so o que o teste pede. */
export function transicaoArmada(patch: Partial<CenarioAutomatico> = {}): CenarioAutomatico {
  return { frenteAuditoriaConcluida: false, reguaCompleta: true, armado: true, ...patch };
}
