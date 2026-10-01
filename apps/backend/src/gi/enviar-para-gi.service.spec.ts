import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { EnviarParaGiService } from "./enviar-para-gi.service";
import type { GiApiService, GiCriacaoResultado } from "./gi-api.service";
import type { GiLeitorService } from "./gi-leitor.service";
import type { GiDeParaService } from "./gi-depara.service";
import {
  DE_PARA_GI_VAZIO,
  type ContratacaoGi,
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
};

function fakes(over: {
  configurado?: boolean;
  jaEnviado?: boolean;
  pessoa?: PessoaParaGi | null;
  contratacao?: ContratacaoGi | null;
  criar?: GiCriacaoResultado;
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

describe("EnviarParaGiService: gatilho AUTOMATICO (auditoria) NUNCA envia", () => {
  it("sem GI configurado: GI_NAO_CONFIGURADO", async () => {
    const f = fakes({ configurado: false });
    const svc = build({}, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000");
    expect(r).toEqual({ enviado: false, motivo: "GI_NAO_CONFIGURADO" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("mesmo GI configurado E disparo armado, o automatico e inerte e NUNCA cria", async () => {
    const f = fakes({ configurado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviar("00000000-0000-0000-0000-000000000000");
    expect(r).toEqual({ enviado: false, motivo: "GI_AUTOMATICO_INERTE" });
    expect(f.criar).not.toHaveBeenCalled();
  });
});

describe("EnviarParaGiService: gatilho MANUAL, fail-closed e idempotencia", () => {
  it("nao configurado: nao le pessoa, nao cria", async () => {
    const f = fakes({ configurado: false });
    const svc = build({}, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_NAO_CONFIGURADO");
    expect(f.leitor.lerPessoa).not.toHaveBeenCalled();
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("ja enviado: idempotencia, nao recria", async () => {
    const f = fakes({ configurado: true, jaEnviado: true });
    const svc = build({ GI_DISPARO_ARMADO: "true" }, f);
    const r = await svc.enviarManual("00000000-0000-0000-0000-000000000000", "autor-1");
    expect(r.motivo).toBe("GI_JA_ENVIADO");
    expect(f.criar).not.toHaveBeenCalled();
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

describe("EnviarParaGiService: a UNIDADE do salario nao declarada RECUSA o envio", () => {
  /**
   * O BLOQUEIO, medido na produção em 01/10/2026: **7 admissões VIVAS com salário `9,34` e `10,90`**
   * (horistas) e o `tipoSalario` do GI com **`default 'M'` (Mês)**. Sem a declaração do time, as 7 entram
   * na folha como salário MENSAL de R$ 9,34, e **nada falha**: valor positivo, empresa e filial
   * resolvidas, par conhecido, o fornecedor responde sucesso e o EA carimba o envio (§A.33).
   *
   * Regra permanente do diretor: nenhum salário é gravado na folha sem auditoria do time, e DECLARAR a
   * unidade é esse ato de auditoria.
   */
  const env = { GI_DISPARO_ARMADO: "true" };

  it("unidade ausente: GI_SALARIO_SEM_UNIDADE, sem tocar o cliente do GI", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: null } });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r).toEqual({ enviado: false, motivo: "GI_SALARIO_SEM_UNIDADE" });
    expect(f.criar).not.toHaveBeenCalled();
  });

  it("NAO cai no default `M` do fornecedor: nulo RECUSA, nunca vira mensal", async () => {
    // Se a ausência virasse `M`, este teste passaria com `GI_ENVIADO` e o defeito estaria em produção.
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: null } });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r.enviado).toBe(false);
    expect(f.marcarEnviado).not.toHaveBeenCalled();
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

  it("recusado por unidade, a idempotencia NAO e carimbada: segue enviavel quando o time declarar", async () => {
    const f = fakes({ configurado: true, contratacao: { ...CONTRATACAO_OK, tipoSalario: null } });
    await build(env, f).enviarManual("adm-1", "user-1");
    expect(f.marcarEnviado).not.toHaveBeenCalled();
  });

  it("o motivo e codigo FECHADO e nao carrega o valor do salario (§A.6)", async () => {
    const f = fakes({
      configurado: true,
      contratacao: { ...CONTRATACAO_OK, salario: 9.34, tipoSalario: null },
    });
    const r = await build(env, f).enviarManual("adm-1", "user-1");
    expect(r.motivo).toBe("GI_SALARIO_SEM_UNIDADE");
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
