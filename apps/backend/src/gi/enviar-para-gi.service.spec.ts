import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiLeitorService } from "./gi-leitor.service";
import type { GiDeParaService } from "./gi-depara.service";
import {
  DE_PARA_GI_VAZIO,
  type ContratacaoGi,
  type FuncionarioSelecao,
  type PessoaParaGi,
} from "../domain/portal-dados-gi";

/**
 * PORTAL→GI, PEÇA 3: a garantia do "1 ENVIO SÓ" e o fail-closed do disparo.
 *
 * O ponto central provado aqui: o gatilho AUTOMÁTICO (`enviar`) é ESTRUTURALMENTE incapaz de criar no
 * GI (nunca chama `criarFuncionarioSelecao`), e o MANUAL (`enviarManual`) só cria com
 * `GI_DISPARO_ARMADO=true`. §A.6: nenhum valor de pessoa aparece nos motivos (códigos fechados).
 *
 * ⚠️ A IDEMPOTÊNCIA DE VERDADE NÃO SE PROVA AQUI, e é importante saber por quê: neste arquivo o leitor
 * é um DUBLÊ, e `jaEnviado` devolve o que o fixture mandar. Isso cobre a ORQUESTRAÇÃO (o serviço
 * consulta antes de criar), não a PERSISTÊNCIA da marca, que é onde o defeito real morava
 * (`marcarEnviado` era um UPDATE que não criava a linha, então a marca nunca passava a existir e o
 * segundo clique duplicava o registro na produção do fornecedor). O cenário das DUAS chamadas, com o
 * leitor REAL sobre banco falsificado, mora em `gi-leitor-idempotencia.tester.spec.ts`.
 */

const CPF_SINTETICO = "39053344705";
const PESSOA: PessoaParaGi = { nome: "Fulano De Tal", cpf: CPF_SINTETICO };

/**
 * A contratação COMPLETA, que passa as duas guardas de `recusaDaContratacaoGi`. É o default dos fixtures
 * para que os cenários de ORQUESTRAÇÃO (trava, idempotência, fail-closed de pessoa) continuem exercitando
 * exatamente o que exercitavam antes dos campos de contratação existirem.
 *
 * Empresa 1 / filial 4 é o par REAL mais comum da base (165 clientes), e existe no fornecedor. O salário
 * é sintético e redondo de propósito: nenhum valor de remuneração real entra em teste.
 *
 * A UNIDADE entrou no fixture como `M` (MENSAL), e isso é obrigatório para que os cenários de
 * ORQUESTRAÇÃO continuem exercitando o que exercitavam: sem ela, TODO caso cairia em
 * `GI_SALARIO_SEM_UNIDADE` e os testes da trava, da idempotência e do fail-closed de pessoa passariam a
 * provar outra coisa. `M` envia sem jornada; `H` exige a jornada da 0140 (ver o bloco da unidade).
 */
const CONTRATACAO_OK: ContratacaoGi = {
  salario: 2000,
  tipoSalario: "M",
  // `M` nao exige jornada, entao o fixture a deixa nula: e o caso comum, e o que os cenarios exercitam.
  qtdeHorasMes: null,
  qtdeHorasSem: null,
  dataAdmissao: "2026-11-03",
  vinculo: "4",
  // `4` (Temporário) passou a sair com prazo `D` (decisão do diretor, 01/10/2026).
  tipoContrato: "D",
  codigoEmpresa: 1,
  codigoFilial: 4,
  // CLIENTE FINAL resolvido (0141/02-10), pelo MESMO motivo que a unidade entrou aqui: a recusa do
  // cliente é a última da ordem, e sem ele TODO cenário deste arquivo cairia em
  // `GI_CLIENTE_NAO_RESOLVIDO` e passaria a provar outra coisa. ⚠️ É o TOMADOR
  // (`admissoes.cod_cliente`), não a empresa do Grupo Soulan (`codigoEmpresa`).
  codigoCliente: 4321,
};

function fakes(over: {
  configurado?: boolean;
  jaEnviado?: boolean;
  pessoa?: PessoaParaGi | null;
  contratacao?: ContratacaoGi | null;
  criar?: GiCriacaoResultado;
  /** `admissoes.farol_global` lido pela cadeia unica. Padrao: admissao VIVA. */
  farolGlobal?: string | null;
  /** `admissoes.pausada_em` lido pela cadeia unica. Padrao: nao pausada. */
  pausadaEm?: Date | null;
  /** `admissoes.origem` lida pela trava do automatico. Padrao: `MANUAL`, o fluxo NOVO. */
  origem?: unknown;
  /** A LINHA da admissao nao existe: a cadeia unica recusa (fail-closed). */
  semEstado?: boolean;
} = {}) {
  const criar = vi.fn(
    async (): Promise<GiCriacaoResultado> =>
      over.criar ?? { ok: true, funcionarioSelecaoId: "GI-123" },
  );
  const marcarEnviado = vi.fn(async () => {});
  const giApi = {
    configurado: () => over.configurado ?? true,
    criarFuncionarioSelecao: criar,
  } as unknown as GiApiService;
  const leitor = {
    jaEnviado: vi.fn(async () => over.jaEnviado ?? false),
    lerPessoa: vi.fn(async () => (over.pessoa === undefined ? PESSOA : over.pessoa)),
    lerContratacao: vi.fn(async () =>
      over.contratacao === undefined ? CONTRATACAO_OK : over.contratacao,
    ),
    // O ESTADO (farol, pausa, origem) que as duas travas de estado leem. O padrao e admissao VIVA do
    // fluxo NOVO, que e o mundo em que o envio DEVE acontecer: assim as recusas deste arquivo seguem
    // vindo da guarda que cada cenario mede, e nao da trava de encerramento nem da de origem.
    lerEstado: vi.fn(async () =>
      over.semEstado
        ? null
        : {
            farolGlobal: over.farolGlobal ?? "EM_ADMISSAO",
            pausadaEm: over.pausadaEm ?? null,
            // `in` e nao `?? "MANUAL"`: o cenario precisa poder dizer `origem: undefined` de proposito,
            // que e um dos casos de origem desconhecida, e o `??` o transformaria em MANUAL.
            origem: "origem" in over ? over.origem : "MANUAL",
          },
    ),
    marcarEnviado,
  } as unknown as GiLeitorService;
  /**
   * O de/para do fixture CONHECE os pares sintéticos usados aqui (empresa 1 / filial 4 é o par real mais
   * comum da base). Sem isso, a validação do PAR recusaria tudo, que é o comportamento fail-closed
   * correto em produção mas esconderia os cenários de orquestração que este arquivo existe para cobrir.
   */
  const depara = {
    ...DE_PARA_GI_VAZIO,
    parEmpresaFilialConhecido: (empresa: number, filial: number) =>
      new Set(["1|4", "1|0"]).has(`${empresa}|${filial}`),
  } as unknown as GiDeParaService;
  return { criar, marcarEnviado, giApi, leitor, depara };
}

function build(env: Record<string, string>, f: ReturnType<typeof fakes>): EnviarParaGiService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new EnviarParaGiService(config, f.giApi, f.leitor, f.depara);
}

/**
 * ⚠️ ESTE BLOCO MUDOU DE REQUISITO em 05/10/2026, por decisão do diretor: o gatilho AUTOMÁTICO passou
 * a ser o caminho PRINCIPAL e ENVIA de verdade, pela mesma cadeia de guardas do manual. Antes ele era
 * um no-op estrutural, e era isso que se media aqui.
 *
 * O que sobrou para medir, e é o que importa daqui para frente: a OPERABILIDADE da admissão
 * (`admissaoOperavel`) é condição de entrada do automático, e ela é fail-closed.
 */
const CONTEXTO_VIVO = { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: "autor-1" };

describe("EnviarParaGiService: gatilho AUTOMATICO (auditoria) e a operabilidade", () => {
  it("sem GI configurado: GI_NAO_CONFIGURADO", async () => {
    const f = fakes({ configurado: false });
    const svc = build({}, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000", CONTEXTO_VIVO);
    expect(r).toEqual({ enviado: false, motivo: "GI_NAO_CONFIGURADO" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("admissao DECLINADA: GI_ADMISSAO_NAO_OPERAVEL, nem com o disparo armado", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000", {
      ...CONTEXTO_VIVO,
      farolGlobal: "DECLINOU",
    });
    expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
    expect(f.criar, "um declinado foi mandado para a folha do fornecedor").not.toHaveBeenCalled();
    expect(f.leitor.lerPessoa, "leu PII de quem nao vai ser enviado").not.toHaveBeenCalled();
  });

  it("admissao PAUSADA (farol vivo): GI_ADMISSAO_NAO_OPERAVEL", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000", {
      ...CONTEXTO_VIVO,
      pausadaEm: new Date("2026-10-01T12:00:00Z"),
    });
    expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("contexto SEM farol: fail-closed, nao envia", async () => {
    // Chamador que esquecer de preencher o contexto não vira envio por omissão: a régua de
    // operabilidade recusa `undefined`.
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000", { autorId: "autor-1" });
    expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("admissao VIVA e disparo ARMADO: ENVIA e carimba, pela mesma cadeia do manual", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000", CONTEXTO_VIVO);
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
    expect(f.marcarEnviado).toHaveBeenCalledTimes(1);
  });

  it("ja enviado: o AUTOMATICO MANTEM a idempotencia (GI_JA_ENVIADO, nao re-dispara por estado)", async () => {
    // O automatico NAO herda o reenvio do manual: ele passa `ignorarJaEnviado=false` e para na marca.
    // O fechamento da auditoria passa pelos chamadores do pos-veredito, e re-disparar por estado
    // mandaria a mesma pessoa de novo a cada passagem.
    const f = fakes({ configurado: true, jaEnviado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000", CONTEXTO_VIVO);
    expect(r).toEqual({ enviado: false, motivo: "GI_JA_ENVIADO" });
    expect(f.criar).not.toHaveBeenCalled();
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });

  it("admissao VIVA e disparo DESARMADO: monta e PARA, como o manual", async () => {
    const f = fakes({ configurado: true });
    const svc = build({}, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000", CONTEXTO_VIVO);
    expect(r).toEqual({ enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("o cliente do GI LANCANDO nao propaga: desfecho GI_FALHA_ENVIO", async () => {
    // O automático é chamado de dentro do pós-veredito da auditoria: lançar ali derrubaria a
    // auditoria do candidato por causa do fornecedor.
    const f = fakes({ configurado: true });
    f.criar.mockImplementation(async () => {
      throw new Error("GI fora do ar (sintetico)");
    });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000", CONTEXTO_VIVO);
    expect(r).toEqual({ enviado: false, motivo: "GI_FALHA_ENVIO" });
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });
});

describe("EnviarParaGiService: gatilho MANUAL, fail-closed e REENVIO (ignora jaEnviado)", () => {
  it("nao configurado: nao le pessoa, nao cria", async () => {
    const f = fakes({ configurado: false });
    const svc = build({}, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_NAO_CONFIGURADO");
    expect(f.leitor.lerPessoa).not.toHaveBeenCalled();
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("ja enviado: o MANUAL REENVIA (ignora a idempotencia jaEnviado)", async () => {
    // Decisao do diretor (14/10/2026): o botao SEMPRE reenvia, inclusive admissao ja enviada, para
    // recuperar "sucesso falso" (carimbado no EA, ausente no G.I). A idempotencia `jaEnviado` nao barra
    // o manual (so o automatico a respeita, ver o bloco da idempotencia do automatico).
    const f = fakes({ configurado: true, jaEnviado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar, "o manual nao reenviou a admissao ja enviada").toHaveBeenCalledTimes(1);
    expect(f.marcarEnviado).toHaveBeenCalledTimes(1);
  });

  it("sem dados de pessoa: nao envia vazio", async () => {
    const f = fakes({ configurado: true, pessoa: null });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_SEM_DADOS_PESSOA");
    expect(f.criar).not.toHaveBeenCalled();
  });
});

describe("EnviarParaGiService: a TRAVA do disparo (GI_DISPARO_ARMADO)", () => {
  it("DESARMADO (default): monta o payload e PARA, sem criar no GI", async () => {
    const f = fakes({ configurado: true });
    const svc = build({}, f); // sem GI_DISPARO_ARMADO
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_MONTADO_NAO_DISPARADO" });
    expect(f.leitor.lerPessoa).toHaveBeenCalled(); // montou
    expect(f.criar).not.toHaveBeenCalled(); // mas NAO disparou
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });

  it("valor diferente de 'true' tambem NAO arma", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "1" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_MONTADO_NAO_DISPARADO");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("ARMADO: cria UMA vez e carimba a idempotencia", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
    expect(f.marcarEnviado).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000000",
      "GI-123",
    );
  });

  it("ARMADO mas a criacao falha: GI_FALHA_ENVIO, nao carimba", async () => {
    const f = fakes({ configurado: true, criar: { ok: false, motivo: "HTTP", status: 500 } });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_FALHA_ENVIO");
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });
});

/**
 * AS DUAS RECUSAS DURAS DA CONTRATAÇÃO (01/10/2026). Elas ficam ENCOSTADAS no `POST`, depois da trava
 * `GI_DISPARO_ARMADO`, então todo cenário aqui roda com a flag LIGADA: é só com ela ligada que existe
 * alguma chance de o payload chegar ao fornecedor, e é exatamente aí que a guarda tem de estar.
 *
 * §A.6: nenhum teste aqui imprime salário. O que se assere é o CÓDIGO do motivo.
 */
const ADMISSAO = "00000000-0000-0000-0000-000000000000";

describe("EnviarParaGiService: empresa+filial nao resolvidas RECUSAM o envio", () => {
  const SEM_CLIENTE: ContratacaoGi = { ...CONTRATACAO_OK, codigoEmpresa: null, codigoFilial: null };

  it("nada resolvido: GI_SEM_EMPRESA_FILIAL, sem tocar o cliente do GI", async () => {
    const f = fakes({ configurado: true, contratacao: SEM_CLIENTE });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_SEM_EMPRESA_FILIAL" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("SO a empresa resolvida (o caso mais comum) tambem recusa", async () => {
    // Meia resolução é o cenário que um `if (!empresa)` deixaria passar: a filial cairia em 0 e o
    // registro nasceria órfão de filial no fornecedor.
    const f = fakes({
      configurado: true,
      contratacao: { ...CONTRATACAO_OK, codigoFilial: null },
    });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_SEM_EMPRESA_FILIAL");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("empresa `0` recusa: empresa 0 nao existe em nenhum par do GI", async () => {
    // Nao e "0 e invalido": e que empresa 0 nao existe la. A FILIAL 0, ao contrario, e legitima.
    const f = fakes({
      configurado: true,
      contratacao: { ...CONTRATACAO_OK, codigoEmpresa: 0, codigoFilial: 0 },
    });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_SEM_EMPRESA_FILIAL");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("filial `0` RESOLVIDA e par conhecido: ENVIA (estabelecimento real, nao ausencia)", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, codigoFilial: 0 } });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
  });

  it("par FORA da lista autoritativa: GI_PAR_EMPRESA_FILIAL_DESCONHECIDO", async () => {
    // `1/37` e valido campo a campo e inexistente no fornecedor: campo a campo nao pega.
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, codigoFilial: 37 } });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_PAR_EMPRESA_FILIAL_DESCONHECIDO");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("recusado, a idempotencia NAO e carimbada: a admissao segue enviavel quando a filial chegar", async () => {
    const f = fakes({ configurado: true, contratacao: SEM_CLIENTE });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    await svc.enviarManual(ADMISSAO, "autor-1");
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });

  it("sem contratacao nenhuma (leitor devolve null): recusa, nao envia vazio", async () => {
    const f = fakes({ configurado: true, contratacao: null });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_SEM_EMPRESA_FILIAL");
    expect(f.criar).not.toHaveBeenCalled();
  });
});

describe("EnviarParaGiService: salario ausente, zero ou negativo RECUSA o envio", () => {
  it("ausente: GI_SALARIO_INVALIDO", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, salario: null } });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_INVALIDO" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("ZERO recusa: o campo tem default 0 no GI, e zero em folha e salario ERRADO", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, salario: 0 } });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_SALARIO_INVALIDO");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("NEGATIVO recusa: o pattern do GI aceita o sinal, entao a recusa e nossa", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, salario: -10 } });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_SALARIO_INVALIDO");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("o motivo e codigo FECHADO e nao carrega o valor do salario (§A.6)", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, salario: 1234.56 } });
    // Salário válido: envia. O que se prova aqui é que NENHUM motivo carrega numero de salario.
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toMatch(/^GI_[A-Z0-9_]+$/);
    expect(r.motivo).not.toContain("1234");
  });

  it("empresa/filial faltando VENCE o salario invalido: a recusa mais grave e reportada primeiro", async () => {
    const f = fakes({
      configurado: true,
      contratacao: { ...CONTRATACAO_OK, salario: 0, codigoEmpresa: null, codigoFilial: null },
    });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_SEM_EMPRESA_FILIAL");
  });
});

describe("EnviarParaGiService: a UNIDADE do salario nao declarada PASSA (o G.I aplica o default)", () => {
  /**
   * ⚠️ REGRA NOVA DO DIRETOR (14/10/2026, permanente): unidade NAO declarada deixou de travar o envio. A
   * recusa `GI_SALARIO_SEM_UNIDADE` FOI REMOVIDA de `recusaDaContratacaoGi`. Se o time não cadastrou a
   * unidade, ela é cadastrada DEPOIS na Folha (a Folha não deixa seguir sem ela), então o envio ao G.I
   * vai com `tipoSalario: null` e o fornecedor aplica o default dele. Vale para os DOIS gatilhos.
   *
   * O QUE NAO MUDOU, e este bloco continua provando: declarar HORA sem jornada RECUSA
   * (`GI_SALARIO_HORISTA_SEM_JORNADA`), e salário inválido RECUSA (`GI_SALARIO_INVALIDO`). A unidade
   * nula pula a checagem do `H` (não é `=== "H"`) e segue.
   */
  const env = { GI_DISPARO_ARMADO: "true" };

  it("unidade ausente: NAO trava mais, ENVIA com tipoSalario null", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: null } });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
    // E o nulo atravessa como NULO, nunca vira `M` sozinho no caminho ate o payload.
    expect((f.criar.mock.calls[0] as unknown[])[0]).toMatchObject({ tipoSalario: null });
  });

  it("NAO vira `M` sozinho: o nulo ATRAVESSA como null, o G.I e quem aplica o default", async () => {
    // Antes a regra era "nulo RECUSA para nao cair no default". Agora o nulo PASSA, mas segue sendo nulo
    // no payload: quem decide o default e o fornecedor, nao o EA deduzindo `M`.
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: null } });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r.enviado).toBe(true);
    const payload = (f.criar.mock.calls[0] as unknown[])[0] as FuncionarioSelecao;
    expect(payload.tipoSalario).toBeNull();
    expect(f.marcarEnviado).toHaveBeenCalledTimes(1);
  });

  it("declarada HORA sem jornada: GI_SALARIO_HORISTA_SEM_JORNADA, e o GI nao e tocado", async () => {
    /**
     * `tipoSalario = 'H'` exige `qtdeHorasMes`/`qtdeHorasSem` do outro lado, **ambos com default `0`**, e
     * o EA emite só os campos nomeados da allowlist: o envio gravaria "valor por hora vezes 0 horas".
     *
     * ⚠️ DESDE A 0140 ISTO É PENDÊNCIA PREENCHÍVEL, não recusa perpétua, e o nome do motivo passou a dizer
     * O QUE FALTA. Antes, a admissão auditada ficava recusada para sempre, indistinguível de uma admissão
     * quebrada: não havia o que preencher.
     */
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: "H" } });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_HORISTA_SEM_JORNADA" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("declarada HORA COM jornada: ENVIA, e e o destravamento que a 0140 trouxe", async () => {
    const f = fakes({
      configurado: true,
      contratacao: { ...CONTRATACAO_OK, tipoSalario: "H", qtdeHorasMes: 220, qtdeHorasSem: 44 },
    });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
  });

  it("declarada DIA: ENVIA sem jornada, porque a jornada e exigida SO do horista", async () => {
    // Antes a lista tinha dois valores e o diarista não tinha onde se declarar: marcava `MENSAL`, e o
    // valor errado passava a carregar um selo dizendo que alguém conferiu.
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: "D" } });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
  });

  it("declarada MENSAL: ENVIA", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: "M" } });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
  });

  it("HORA sem jornada segue recusando, e a idempotencia NAO e carimbada: a recusa que FICOU", async () => {
    // A remocao foi so da UNIDADE nula. Declarar HORA sem a jornada continua recusando, e recusa nao
    // carimba: a admissao segue enviavel quando o time informar a jornada.
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: "H" } });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_HORISTA_SEM_JORNADA" });
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });

  it("o motivo da recusa que FICOU e codigo FECHADO e nao carrega o valor do salario (§A.6)", async () => {
    // A §A.6 se prova na recusa que sobrou (HORISTA sem jornada): o motivo e codigo fechado e NUNCA o
    // salario `9.34`, que e um dos valores de HORA medidos na producao.
    const f = fakes({
      configurado: true,
      contratacao: { ...CONTRATACAO_OK, salario: 9.34, tipoSalario: "H" },
    });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r.motivo).toBe("GI_SALARIO_HORISTA_SEM_JORNADA");
    expect(JSON.stringify(r)).not.toContain("9.34");
  });
});

describe("EnviarParaGiService: a guarda da contratacao NAO desarma a trava do disparo", () => {
  it("DESARMADO com contratacao COMPLETA: continua parando em GI_MONTADO_NAO_DISPARADO", async () => {
    // A ordem importa: a trava é a garantia mais forte da frente, e ela responde primeiro.
    const f = fakes({ configurado: true });
    const svc = build({}, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_MONTADO_NAO_DISPARADO");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("DESARMADO com contratacao VAZIA: a trava responde primeiro, nao a guarda", async () => {
    const f = fakes({ configurado: true, contratacao: null });
    const svc = build({}, f);
    const r = await svc.enviarManual(ADMISSAO, "autor-1");
    expect(r.motivo).toBe("GI_MONTADO_NAO_DISPARADO");
    expect(f.criar).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A TRAVA DE ORIGEM (item 1): ALLOWLIST, e SÓ no gatilho automático
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("EnviarParaGiService: a TRAVA DE ORIGEM do gatilho automatico", () => {
  const ARMADO = { GI_DISPARO_ARMADO: "true" };
  const VIVO = { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: "autor-1" };

  it("origem MANUAL (fluxo novo) ENVIA: o canario, sem ele os zeros abaixo nao provam nada", async () => {
    const f = fakes({ configurado: true, origem: "MANUAL" });
    const r = await build(ARMADO, f).enviar(ADMISSAO, VIVO);
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
  });

  it("origem PANDAPE NAO envia: o Pandape ja manda ao G.I por fora, a pessoa duplicaria na folha", async () => {
    const f = fakes({ configurado: true, origem: "PANDAPE" });
    const r = await build(ARMADO, f).enviar(ADMISSAO, VIVO);
    expect(r).toEqual({ enviado: false, motivo: "GI_ORIGEM_NAO_AUTORIZADA" });
    expect(f.criar).not.toHaveBeenCalled();
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });

  /**
   * O TESTE QUE DISTINGUE ALLOWLIST DE DENYLIST, e e o unico que distingue: hoje o enum tem dois
   * valores, entao `=== "MANUAL"` e `!== "PANDAPE"` dao o MESMO resultado nos dois casos acima. Numa
   * denylist a origem DESCONHECIDA envia (autorizada por omissao); na allowlist, nao envia.
   */
  it.each([["DIGAI"], ["IFRACTAL"], ["manual"], [""], [null], [undefined]])(
    "origem desconhecida (%s) NAO envia: fail-closed, origem futura nasce BLOQUEADA",
    async (origem) => {
      const f = fakes({ configurado: true, origem });
      const r = await build(ARMADO, f).enviar(ADMISSAO, VIVO);
      expect(r).toEqual({ enviado: false, motivo: "GI_ORIGEM_NAO_AUTORIZADA" });
      expect(f.criar).not.toHaveBeenCalled();
    },
  );

  it("a linha da admissao ausente NAO envia pelo automatico (fail-closed)", async () => {
    const f = fakes({ configurado: true, semEstado: true });
    const r = await build(ARMADO, f).enviar(ADMISSAO, VIVO);
    expect(r.enviado).toBe(false);
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("a trava de origem NAO vale no botao MANUAL: PANDAPE a mao ENVIA", async () => {
    // Decisao do diretor que ele NAO tomou: enviar um Pandape a mao pode ser legitimo, entao o manual
    // nao consulta a allowlist. Este teste e a trava da DECISAO, nao do gosto de quem implementou.
    const f = fakes({ configurado: true, origem: "PANDAPE" });
    const r = await build(ARMADO, f).enviarManual(ADMISSAO, "autor-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O ENCERRAMENTO (item 2): declinado e rescindido nao saem por caminho NENHUM
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("EnviarParaGiService: admissao ENCERRADA nao sai por caminho nenhum", () => {
  const ARMADO = { GI_DISPARO_ARMADO: "true" };
  const VIVO = { farolGlobal: "EM_ADMISSAO", pausadaEm: null, autorId: "autor-1" };

  it.each([["DECLINOU"], ["RESCISAO"]])(
    "farol %s: o botao MANUAL recusa, e a saida operacional e mudar o farol antes",
    async (farolGlobal) => {
      const f = fakes({ configurado: true, farolGlobal });
      const r = await build(ARMADO, f).enviarManual(ADMISSAO, "autor-1");
      expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
      expect(f.criar).not.toHaveBeenCalled();
    },
  );

  it.each([["DECLINOU"], ["RESCISAO"]])(
    "farol %s: o gatilho AUTOMATICO tambem recusa",
    async (farolGlobal) => {
      const f = fakes({ configurado: true, farolGlobal });
      const r = await build(ARMADO, f).enviar(ADMISSAO, { ...VIVO, farolGlobal });
      expect(r.enviado).toBe(false);
      expect(f.criar).not.toHaveBeenCalled();
    },
  );

  /**
   * ⚠️ O TESTE QUE IMPEDE A VOLTA DO DEFEITO: a guarda da cadeia unica NAO e `admissaoOperavel`.
   * `ADMISSAO_CONCLUIDA` nao e farol VIVO, e sao 1.550 `MANUAL` + 452 `PANDAPE` na base (06/10/2026).
   * E quem TEM de estar na folha; o farol e flag manual e pegajosa, entao marca-la antes do envio
   * barraria a admissao para sempre. Quem trocar o predicado por `admissaoOperavel` quebra aqui.
   */
  it("farol ADMISSAO_CONCLUIDA ENVIA pelo botao manual: concluida e quem mais precisa ir a folha", async () => {
    const f = fakes({ configurado: true, farolGlobal: "ADMISSAO_CONCLUIDA" });
    const r = await build(ARMADO, f).enviarManual(ADMISSAO, "autor-1");
    expect(r).toEqual({ enviado: true, motivo: "GI_ENVIADO" });
    expect(f.criar).toHaveBeenCalledTimes(1);
  });

  it("admissao PAUSADA ENVIA pelo botao manual (regua literal do diretor, pendente de decisao)", async () => {
    const f = fakes({ configurado: true, pausadaEm: new Date("2026-10-01T12:00:00Z") });
    const r = await build(ARMADO, f).enviarManual(ADMISSAO, "autor-1");
    expect(r.enviado).toBe(true);
  });

  it("a linha da admissao ausente recusa o botao MANUAL (fail-closed)", async () => {
    const f = fakes({ configurado: true, semEstado: true });
    const r = await build(ARMADO, f).enviarManual(ADMISSAO, "autor-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("a IDEMPOTENCIA responde ANTES do encerramento NO AUTOMATICO: ja enviada segue GI_JA_ENVIADO", async () => {
    // ⚠️ SO VALE PARA O AUTOMATICO desde 14/10/2026: o manual nao consulta mais `jaEnviado` (sempre
    // reenvia), entao esta ordem e exclusiva do gatilho automatico. A ordem e deliberada: "ja foi" e
    // informacao mais util que "esta declinada". O contexto VIVO passa a operabilidade; a cadeia unica
    // ve a marca ANTES de ler o farol encerrado do banco.
    const f = fakes({ configurado: true, jaEnviado: true, farolGlobal: "DECLINOU" });
    const r = await build(ARMADO, f).enviar(ADMISSAO, VIVO);
    expect(r.motivo).toBe("GI_JA_ENVIADO");
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("no MANUAL, ja enviada E encerrada: o ENCERRAMENTO vence, porque o manual ignora jaEnviado", async () => {
    // Como o manual pula a idempotencia (sempre reenvia), ele chega na guarda de encerramento, que
    // recusa declinado/rescindido por caminho NENHUM. A marca de envio nao o salva de uma admissao
    // encerrada: o farol e que manda.
    const f = fakes({ configurado: true, jaEnviado: true, farolGlobal: "DECLINOU" });
    const r = await build(ARMADO, f).enviarManual(ADMISSAO, "autor-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_ADMISSAO_NAO_OPERAVEL" });
    expect(f.criar).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O `apiSincAdmissaoDigital` (item 3): SEMPRE `false`, FIXO, nos DOIS gatilhos (§A.48 reescrita 15/10)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("EnviarParaGiService: apiSincAdmissaoDigital e SEMPRE false, manual e automatico", () => {
  const ARMADO = { GI_DISPARO_ARMADO: "true" };

  // O AUTOMATICO (fechamento da auditoria). Passa pela trava de origem (o fixture atende com origem
  // MANUAL, autorizada) e cria com a contratacao OK.
  async function payloadAutomatico(env: Record<string, string>) {
    const f = fakes({ configurado: true });
    await build({ ...ARMADO, ...env }, f).enviar(ADMISSAO, CONTEXTO_VIVO);
    expect(f.criar).toHaveBeenCalledTimes(1);
    return (f.criar.mock.calls[0] as unknown[])[0] as FuncionarioSelecao;
  }

  // O MANUAL (botao do time).
  async function payloadManual(env: Record<string, string>) {
    const f = fakes({ configurado: true });
    await build({ ...ARMADO, ...env }, f).enviarManual(ADMISSAO, "autor-1");
    expect(f.criar).toHaveBeenCalledTimes(1);
    return (f.criar.mock.calls[0] as unknown[])[0] as FuncionarioSelecao;
  }

  // ⚠️ A DECISAO PERMANENTE (diretor, 15/10/2026): apiSinc=`false` PROMOVE o registro para a tela de
  // Cadastro de Funcionarios (onde o time trabalha); `true` prendia no limbo "Admissao Digital" que o
  // time nao acessa, e NUNCA deve ser usado. Nao ha mais leitura de ambiente: estes testes provam que
  // mesmo com `GI_API_SINC_ADMISSAO_DIGITAL=true` no `.env` o envio sai `false` (o knob esta morto),
  // que e a trava contra REINVERTER o valor por `.env`.
  it("AUTOMATICO sem a variavel: o campo SAI e vale false", async () => {
    expect((await payloadAutomatico({})).apiSincAdmissaoDigital).toBe(false);
  });

  it("MANUAL sem a variavel: o campo SAI e vale false (nao force mais true)", async () => {
    expect((await payloadManual({})).apiSincAdmissaoDigital).toBe(false);
  });

  it.each([["true"], [" TRUE "], ["True"], ["1"], ["sim"], ["false"], [""]])(
    "AUTOMATICO ignora GI_API_SINC_ADMISSAO_DIGITAL=%s: o knob esta morto, sai false",
    async (valor) => {
      const payload = await payloadAutomatico({ GI_API_SINC_ADMISSAO_DIGITAL: valor });
      expect(payload.apiSincAdmissaoDigital).toBe(false);
    },
  );

  it.each([["true"], [" TRUE "], ["1"], ["false"]])(
    "MANUAL ignora GI_API_SINC_ADMISSAO_DIGITAL=%s: o knob esta morto, sai false",
    async (valor) => {
      const payload = await payloadManual({ GI_API_SINC_ADMISSAO_DIGITAL: valor });
      expect(payload.apiSincAdmissaoDigital).toBe(false);
    },
  );

  it("a CHAVE existe sempre: campo booleano nao-anulavel no contrato do G.I", async () => {
    const payload = await payloadManual({});
    expect(Object.keys(payload)).toContain("apiSincAdmissaoDigital");
    expect(payload.apiSincAdmissaoDigital).not.toBeNull();
  });
});
