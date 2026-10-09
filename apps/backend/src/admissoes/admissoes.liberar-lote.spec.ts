import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AdmissoesService } from "./admissoes.service";
import { LiberarEmLoteDto } from "./dto/liberar-lote.dto";

/**
 * Liberação Admissional EM LOTE. Cobre as regras que o lote adiciona sobre o nascimento já testado
 * do individual: teto de 50, par sem régua barrado, duplicata fora do lote, e o parcial-com-relatório
 * (uma falha no meio não derruba as boas).
 */

const USER: AuthUser = {
  id: "user-1",
  email: "c@ea.local",
  papel: "COMUM",
  senhaTemporaria: false,
};

// GATE DOS OBRIGATÓRIOS-PARA-LIBERAR (item 6): no LOTE o gate cobra 5 campos (Sexo é individual-only).
// O USER aqui é COMUM (sem override), então os dtos deste arquivo trazem os 5 preenchidos para liberar.
// Os campos NÃO-gate (salário, centro de custo, setor, gestor/BP) seguem em branco de propósito: é o
// que ainda prova o não-bloqueio (regra 5) e mantém o sinalizador fora de OK.
const GATE_LOTE = {
  tipoContrato: "Temporário",
  dataAdmissao: "2026-08-01",
  vagaFolha: { salarioUnidade: "MENSAL", escala: "12x36", beneficios: "VR" },
};

type Row = Record<string, unknown>;

/**
 * CPFs de teste com o dígito verificador conferido: desde o item 9 a liberação BARRA CPF inválido,
 * então o CPF do fixture precisa fechar de verdade (o antigo "12345678901" não fechava).
 */
const CPF_VALIDO = "52998224725";
const CPF_INVALIDO = "52998224726";
// CPF AUSENTE: marcador PROVISÓRIO ("CPF Pendente"), 11 chars começando com PROV. `isValidCpf` o
// reprova (sem 11 dígitos) e `ehCpfProvisorio` o reconhece: ele LIBERA, diferente do CPF_INVALIDO.
const CPF_PENDENTE = "PROV0ABCDEF";

interface Cenario {
  /** `null` = admissão sem origem Pandapé (nada a puxar). Ausente = veio do Pandapé. */
  integracao?: Row | null;
  admissoes: Row[];
  regua?: Row[];
  clienteExiste?: boolean;
  cargoExiste?: boolean;
}

/** Fake do Drizzle: só o que o `liberarEmLote` toca. Conta as transações efetivamente abertas. */
function montar(cen: Cenario, portalEnvio?: unknown) {
  const porId = new Map(cen.admissoes.map((a) => [a.id as string, a]));
  const inseridos: Row[] = [];
  let transacoes = 0;

  const atualizados: Row[] = [];
  const tx = {
    update: vi.fn(() => ({
      set: (valores: Row) => {
        atualizados.push(valores);
        return { where: async () => undefined };
      },
    })),
    insert: vi.fn(() => ({
      values: (rows: Row[]) => {
        inseridos.push(...rows);
        return Promise.resolve(undefined);
      },
    })),
  };

  const db = {
    query: {
      // Origem Pandapé da admissão: alimenta o pull enfileirado na liberação.
      integracaoPandape: {
        findFirst: async () =>
          cen.integracao === undefined ? { idPrecollaborator: "PC-1" } : cen.integracao,
      },
      clientes: { findFirst: async () => (cen.clienteExiste === false ? undefined : { id: "c1" }) },
      cargos: { findFirst: async () => (cen.cargoExiste === false ? undefined : { id: "cg1" }) },
      // O service passa o `where` por id; o fake resolve pelo id da chamada corrente do laço.
      admissoes: {
        findFirst: async (args: { where?: unknown }) => porId.get(idDoWhere(args)),
      },
      candidatos: {
        findFirst: async () => ({ nome: "Candidato Teste", cpf: CPF_VALIDO }),
      },
    },
    // Única leitura via select() no caminho do lote: a régua do par.
    select: vi.fn(() => ({ from: () => ({ where: async () => cen.regua ?? [] }) })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      transacoes += 1;
      return fn(tx);
    },
  };

  // O id que o laço está buscando é rastreado por fora (o fake não interpreta SQL).
  let idCorrente = "";
  function idDoWhere(_args: unknown): string {
    return idCorrente;
  }
  const fila = { enfileirarPullDocumentos: vi.fn().mockResolvedValue(true) };
  // O `portalEnvio` entra na QUARTA posição do construtor (@Optional), exatamente como o Nest injeta
  // e como o spec do gancho individual faz. Sem ele (caso 4), o ramo `if (this.portalEnvio)` nunca
  // roda e o lote funciona igual, que é o padrão de todos os demais testes deste arquivo.
  const service = new AdmissoesService(db as never, fila as never, undefined, portalEnvio as never);
  // Logger vira coletor: alimenta as asserções de §A.6 do gancho e silencia o warn do catch do laço.
  const logs: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (service as any).logger = {
    warn: (m: unknown) => logs.push(String(m)),
    error: (m: unknown) => logs.push(String(m)),
    log: () => {},
    debug: () => {},
    verbose: () => {},
  };
  // Envolve o findFirst para saber qual id o laço pede a cada volta: a ordem é a dos ids enviados.
  return {
    service,
    fila,
    inseridos,
    atualizados,
    logs,
    contarTransacoes: () => transacoes,
    setIdCorrente: (id: string) => {
      idCorrente = id;
    },
    db,
  };
}

/**
 * Roda o lote alimentando o fake com o id de cada volta. O service percorre os ids na ordem
 * recebida, então basta avançar o ponteiro a cada chamada de `admissoes.findFirst`.
 */
async function rodarLote(
  ctx: ReturnType<typeof montar>,
  ids: string[],
  dto: Parameters<AdmissoesService["liberarEmLote"]>[1] = {
    codCliente: "100",
    cargoId: "11111111-1111-4111-8111-111111111111",
    ...GATE_LOTE,
  },
) {
  let i = 0;
  const original = ctx.db.query.admissoes.findFirst;
  ctx.db.query.admissoes.findFirst = async (args: { where?: unknown }) => {
    ctx.setIdCorrente(ids[i] ?? "");
    i += 1;
    return original(args);
  };
  return ctx.service.liberarEmLote(ids, dto, USER);
}

const REGUA_OK = [{ tipoDocumentoId: "td1", exigencia: "OBRIGATORIO" }];
const aguardando = (id: string): Row => ({
  id,
  candidatoCpf: CPF_VALIDO,
  farolGlobal: "AGUARDANDO_LIBERACAO",
  isBanco: false,
  possivelDuplicata: false,
  tipoContrato: null,
  dataAdmissao: null,
});

describe("AdmissoesService.liberarEmLote", () => {
  it("libera as N com uma transação INDEPENDENTE por admissão", async () => {
    const ids = ["a1", "a2", "a3"];
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK });
    const r = await rodarLote(ctx, ids);

    expect(r.liberadas).toHaveLength(3);
    expect(r.falhas).toHaveLength(0);
    expect(ctx.contarTransacoes()).toBe(3); // uma por admissão, não uma para o lote todo
    // Nascimento reusado: 2 frentes + 1 documento da régua, por admissão.
    expect(ctx.inseridos.filter((x) => x.tipo === "AUDITORIA")).toHaveLength(3);
    expect(ctx.inseridos.filter((x) => x.tipoDocumentoId === "td1")).toHaveLength(3);
  });

  it("aplica os campos preenchidos a TODAS as N e deixa os vazios como pendência individual", async () => {
    const ids = ["a1", "a2"];
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK });
    const r = await rodarLote(ctx, ids, {
      codCliente: "100",
      cargoId: "11111111-1111-4111-8111-111111111111",
      tipoContrato: "Temporário",
      dataAdmissao: "2026-08-01",
      vagaFolha: { salario: "2500.00", salarioUnidade: "MENSAL", escala: "12x36", beneficios: "VR" },
    });
    expect(r.liberadas).toHaveLength(2);
    expect(r.falhas).toHaveLength(0);

    const admissoesAtualizadas = ctx.atualizados.filter((u) => u.farolGlobal === "EM_ADMISSAO");
    expect(admissoesAtualizadas).toHaveLength(2);
    for (const u of admissoesAtualizadas) {
      expect(u.tipoContrato).toBe("Temporário");
      expect(u.dataAdmissao).toBe("2026-08-01");
      // Campos NÃO-gate em branco no lote (centro de custo, gestor, setor) seguem como pendência
      // individual: o sinalizador da régua unificada §A.19 NÃO fecha em OK.
      expect(u.sinalizadorPreenchimento).not.toBe("OK");
    }
    const vagas = ctx.atualizados.filter((u) => "salario" in u);
    expect(vagas).toHaveLength(2);
    for (const v of vagas) {
      expect(v.salario).toBe("2500.00");
      expect(v.escala).toBe("12x36");
      expect(v.centroCusto).toBeNull(); // em branco no lote, segue pendência individual
      // A UNIDADE DO SALÁRIO NO LOTE: o gate passou a COBRÁ-LA, e cobrar sem gravar seria o pior dos
      // dois mundos (N folhas barradas por um campo que o sistema depois joga fora). O lote escreve
      // pelo MESMO miolo do individual (`aplicarLiberacao`), então grava a unidade E carimba o selo
      // de auditoria (autor + data), para as N.
      expect(v.salarioUnidade).toBe("MENSAL");
      expect(v.salarioAuditadoPor).toBe("user-1");
      expect(v.salarioAuditadoEm).toBeInstanceOf(Date);
    }
  });

  it("REGRESSÃO (OST salário): salário com VÍRGULA passa pelo DTO e libera as N (era 9/0)", async () => {
    // O caso que quebrou: salário "R$ 2.500,00" (o MESMO para as N) estourava 22P02 e derrubava
    // TODAS. Agora o DTO normaliza para "2500.00" ANTES do service, e o lote inteiro passa.
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    const dto = plainToInstance(LiberarEmLoteDto, {
      admissaoIds: ids,
      codCliente: "100",
      cargoId: "44444444-4444-4444-8444-444444444444",
      // GATE (item 6): os 6 do lote preenchidos, senão o COMUM não libera. O foco do teste é o salário.
      tipoContrato: "Temporário",
      dataAdmissao: "2026-08-01",
      vagaFolha: { salario: "R$ 2.500,00", salarioUnidade: "MENSAL", escala: "12x36", beneficios: "VR" },
    });
    // Validação real (o que o ValidationPipe roda): não deve haver erro e o salário vem canônico.
    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.vagaFolha?.salario).toBe("2500.00");

    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK });
    const r = await rodarLote(ctx, ids, dto);

    expect(r.liberadas).toHaveLength(3);
    expect(r.falhas).toHaveLength(0);
    const vagas = ctx.atualizados.filter((u) => "salario" in u);
    expect(vagas).toHaveLength(3);
    for (const v of vagas) expect(v.salario).toBe("2500.00");
  });

  it("observação livre do lote é gravada em TODAS as N (Bloco 2 da OST)", async () => {
    const ids = ["a1", "a2", "a3"];
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK });
    await rodarLote(ctx, ids, {
      codCliente: "100",
      cargoId: "11111111-1111-4111-8111-111111111111",
      ...GATE_LOTE,
      observacaoLiberacao: "VT possui 6% de desconto",
    });

    const admissoesAtualizadas = ctx.atualizados.filter((u) => u.farolGlobal === "EM_ADMISSAO");
    expect(admissoesAtualizadas).toHaveLength(3);
    for (const u of admissoesAtualizadas) {
      expect(u.observacaoLiberacao).toBe("VT possui 6% de desconto");
    }
  });

  it("observação em branco grava null (o modal do olho não abre bloco vazio)", async () => {
    const ctx = montar({ admissoes: [aguardando("a1")], regua: REGUA_OK });
    await rodarLote(ctx, ["a1"], {
      codCliente: "100",
      cargoId: "11111111-1111-4111-8111-111111111111",
      ...GATE_LOTE,
      observacaoLiberacao: "   ",
    });

    const [u] = ctx.atualizados.filter((x) => x.farolGlobal === "EM_ADMISSAO");
    expect(u.observacaoLiberacao).toBeNull();
  });

  it("observação NÃO conta como campo preenchido da régua unificada (é opcional)", async () => {
    const ctx = montar({ admissoes: [aguardando("a1")], regua: REGUA_OK });
    await rodarLote(ctx, ["a1"], {
      codCliente: "100",
      cargoId: "11111111-1111-4111-8111-111111111111",
      // Os 5 do gate (item 6) preenchidos; os demais campos NÃO-gate seguem em branco. Só a observação
      // é o extra sob teste.
      ...GATE_LOTE,
      observacaoLiberacao: "Recado do consultor",
    });

    const [u] = ctx.atualizados.filter((x) => x.farolGlobal === "EM_ADMISSAO");
    // A observação não maquia pendência: sem salário/centro de custo/setor/gestor, segue pendente.
    expect(u.sinalizadorPreenchimento).not.toBe("OK");
  });

  it("parcial-com-relatório: a falha do meio não derruba as boas", async () => {
    const ids = ["a1", "a2", "a3"];
    const ctx = montar({
      admissoes: [
        aguardando("a1"),
        { ...aguardando("a2"), farolGlobal: "EM_ADMISSAO" }, // já saiu da fila
        aguardando("a3"),
      ],
      regua: REGUA_OK,
    });
    const r = await rodarLote(ctx, ids);

    expect(r.liberadas.map((l) => l.admissaoId)).toEqual(["a1", "a3"]);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].motivo).toContain("aguardando liberação");
    expect(ctx.contarTransacoes()).toBe(2); // a que falhou nem abriu transação
  });

  it("pré-admissão marcada como possível duplicata NÃO é liberada em massa", async () => {
    const ids = ["a1", "a2"];
    const ctx = montar({
      admissoes: [aguardando("a1"), { ...aguardando("a2"), possivelDuplicata: true }],
      regua: REGUA_OK,
    });
    const r = await rodarLote(ctx, ids);

    expect(r.liberadas).toHaveLength(1);
    expect(r.falhas[0].motivo).toContain("duplicata");
  });

  it("pré-admissão com CPF INVÁLIDO não é liberada, e as boas seguem (item 9, Frente A)", async () => {
    // O CPF vem errado do Pandapé e a liberação é a porta de entrada: o dígito que não fecha para
    // aqui. Por linha, não pelo lote inteiro: uma digitação errada não segura as outras N.
    const ids = ["a1", "a2"];
    const ctx = montar({
      admissoes: [aguardando("a1"), { ...aguardando("a2"), candidatoCpf: CPF_INVALIDO }],
      regua: REGUA_OK,
    });
    const r = await rodarLote(ctx, ids);

    expect(r.liberadas.map((l) => l.admissaoId)).toEqual(["a1"]);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].motivo).toContain("dígito verificador");
    expect(ctx.contarTransacoes()).toBe(1); // a do CPF errado nem abriu transação
  });

  it("pré-admissão com CPF AUSENTE (marcador PROVISÓRIO) É liberada como CPF Pendente", async () => {
    // Continuidade do 66a0302: o marcador PROV é "CPF Pendente", NÃO "CPF inválido". Quem foi enviado
    // sem CPF entra na esteira; o CPF real chega depois pelo portal (corrigirCpf). Diferente do CPF
    // real com dígito errado (teste acima), que segue barrado por ser erro de digitação.
    const ids = ["a1", "a2"];
    const ctx = montar({
      admissoes: [aguardando("a1"), { ...aguardando("a2"), candidatoCpf: CPF_PENDENTE }],
      regua: REGUA_OK,
    });
    const r = await rodarLote(ctx, ids);

    expect(r.liberadas.map((l) => l.admissaoId)).toEqual(["a1", "a2"]);
    expect(r.falhas).toHaveLength(0);
    expect(ctx.contarTransacoes()).toBe(2); // a do marcador TAMBÉM nasceu na esteira
  });

  it("par sem régua documental barra o lote inteiro, antes de qualquer transação", async () => {
    const ctx = montar({ admissoes: [aguardando("a1")], regua: [] });
    await expect(rodarLote(ctx, ["a1"])).rejects.toThrow(/régua documental/i);
    expect(ctx.contarTransacoes()).toBe(0);
  });

  it("respeita o teto de 50 por lote", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `a${i}`);
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK });
    await expect(rodarLote(ctx, ids)).rejects.toThrow(/50/);
    expect(ctx.contarTransacoes()).toBe(0);
  });

  it("enfileira UM pull de documentos POR admissão liberada (massa não dispara N chamadas diretas)", async () => {
    const ids = ["a1", "a2", "a3"];
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK });

    await rodarLote(ctx, ids);

    expect(ctx.fila.enfileirarPullDocumentos).toHaveBeenCalledTimes(3);
    // o job carrega a admissão + o pré-colaborador de origem.
    expect(ctx.fila.enfileirarPullDocumentos).toHaveBeenCalledWith("a1", "PC-1");
  });

  it("admissão SEM origem Pandapé não enfileira pull", async () => {
    const ctx = montar({ admissoes: [aguardando("a1")], regua: REGUA_OK, integracao: null });

    await rodarLote(ctx, ["a1"]);

    expect(ctx.fila.enfileirarPullDocumentos).not.toHaveBeenCalled();
  });

  it("FALHA do pull NÃO trava nem reverte a liberação (Pandapé/Redis fora)", async () => {
    const ids = ["a1", "a2"];
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK });
    ctx.fila.enfileirarPullDocumentos.mockRejectedValue(new Error("Pandapé indisponível"));

    const r = await rodarLote(ctx, ids);

    // as duas seguem liberadas, sem falha reportada: o pull é efeito colateral, não gate.
    expect(r.liberadas).toHaveLength(2);
    expect(r.falhas).toHaveLength(0);
    expect(ctx.contarTransacoes()).toBe(2);
  });

  it("seleção vazia é recusada", async () => {
    const ctx = montar({ admissoes: [], regua: REGUA_OK });
    await expect(rodarLote(ctx, [])).rejects.toThrow(/ao menos uma/i);
  });

  it("cliente inexistente derruba o lote antes do laço", async () => {
    const ctx = montar({ admissoes: [aguardando("a1")], regua: REGUA_OK, clienteExiste: false });
    await expect(rodarLote(ctx, ["a1"])).rejects.toThrow(/Cliente não encontrado/);
    expect(ctx.contarTransacoes()).toBe(0);
  });
});

/**
 * ─ O GANCHO DO ENVIO DO LINK, AGORA LIGADO NA LIBERAÇÃO EM LOTE (`tester` §A.38/§A.40) ──────────
 *
 * Irmão do `admissoes.gancho-envio-liberacao.tester.spec.ts` (que cobre o `liberar` individual).
 * O serviço REAL roda contra um dublê de `PortalEnvioService` e o que se prova é o requisito, não o
 * texto. O gancho vive DEPOIS do laço de liberação e ANTES do `return { liberadas, falhas }`, e para
 * CADA admissão de `liberadas` chama `enviarParaAdmissao(admissaoId, user.id, "AUTOMATICO")`, dentro
 * de `if (this.portalEnvio)`, best-effort (try/catch, §A.6 sem PII).
 *
 * §A.6: todo CPF/nome que circula é sintético (CPF_VALIDO de família reservada, verificador válido).
 */
describe("liberarEmLote: o gancho do envio do link do Portal", () => {
  it("1) N liberadas → enviarParaAdmissao N vezes, uma por admissaoId, origem AUTOMATICO e autor user.id", async () => {
    const ids = ["a1", "a2", "a3"];
    const portal = { enviarParaAdmissao: vi.fn().mockResolvedValue({ enviado: true }) };
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK }, portal);

    const r = await rodarLote(ctx, ids);

    expect(r.liberadas.map((l) => l.admissaoId)).toEqual(["a1", "a2", "a3"]);
    expect(r.falhas).toHaveLength(0);
    // Exatamente N, uma por admissaoId de `liberadas`, com a assinatura (admissaoId, autor, origem).
    expect(portal.enviarParaAdmissao).toHaveBeenCalledTimes(3);
    expect(portal.enviarParaAdmissao).toHaveBeenNthCalledWith(1, "a1", USER.id, "AUTOMATICO");
    expect(portal.enviarParaAdmissao).toHaveBeenNthCalledWith(2, "a2", USER.id, "AUTOMATICO");
    expect(portal.enviarParaAdmissao).toHaveBeenNthCalledWith(3, "a3", USER.id, "AUTOMATICO");
    // Nenhum id fora de `liberadas` foi enviado.
    const enviados = portal.enviarParaAdmissao.mock.calls.map((c) => c[0]).sort();
    expect(enviados).toEqual(["a1", "a2", "a3"]);
    // Toda chamada carrega AUTOMATICO + o autor; nunca MANUAL nem outro autor.
    for (const chamada of portal.enviarParaAdmissao.mock.calls) {
      expect(chamada[1]).toBe(USER.id);
      expect(chamada[2]).toBe("AUTOMATICO");
    }
  });

  it("2) admissão que FALHOU a liberação (entra em falhas) NÃO recebe envio", async () => {
    const ids = ["a1", "a2", "a3"];
    const portal = { enviarParaAdmissao: vi.fn().mockResolvedValue({ enviado: true }) };
    // a2 já saiu da fila (EM_ADMISSAO): falha a liberação e cai em `falhas`, não em `liberadas`.
    const ctx = montar(
      {
        admissoes: [
          aguardando("a1"),
          { ...aguardando("a2"), farolGlobal: "EM_ADMISSAO" },
          aguardando("a3"),
        ],
        regua: REGUA_OK,
      },
      portal,
    );

    const r = await rodarLote(ctx, ids);

    expect(r.liberadas.map((l) => l.admissaoId)).toEqual(["a1", "a3"]);
    expect(r.falhas).toHaveLength(1);
    // O envio dispara SÓ para as liberadas: a2 não é passada a enviarParaAdmissao.
    expect(portal.enviarParaAdmissao).toHaveBeenCalledTimes(2);
    const enviados = portal.enviarParaAdmissao.mock.calls.map((c) => c[0]);
    expect(enviados).not.toContain("a2");
    expect(enviados.sort()).toEqual(["a1", "a3"]);
  });

  it("3a) BEST-EFFORT: um envio que LANÇA não muda liberadas/falhas nem derruba o lote", async () => {
    const ids = ["a1", "a2", "a3"];
    // O do meio lança; os vizinhos resolvem. Se o throw derrubasse o lote, `rodarLote` rejeitaria.
    const portal = {
      enviarParaAdmissao: vi
        .fn()
        .mockResolvedValueOnce({ enviado: true })
        .mockRejectedValueOnce(new Error("correio fora do ar"))
        .mockResolvedValueOnce({ enviado: true }),
    };
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK }, portal);

    const r = await rodarLote(ctx, ids);

    // O resultado do lote é o MESMO: as 3 liberadas, zero falha, apesar do envio do meio ter lançado.
    expect(r.liberadas.map((l) => l.admissaoId)).toEqual(["a1", "a2", "a3"]);
    expect(r.falhas).toHaveLength(0);
    // As demais SEGUIRAM depois do throw: a3 foi tentada mesmo com a2 lançando.
    expect(portal.enviarParaAdmissao).toHaveBeenCalledTimes(3);
  });

  it("3b) BEST-EFFORT: envio que devolve enviado:false não vira falha do lote", async () => {
    const ids = ["a1", "a2"];
    const portal = {
      enviarParaAdmissao: vi.fn().mockResolvedValue({ enviado: false, motivo: "SEM_DESTINATARIO" }),
    };
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK }, portal);

    const r = await rodarLote(ctx, ids);

    expect(r.liberadas).toHaveLength(2);
    expect(r.falhas).toHaveLength(0);
    expect(portal.enviarParaAdmissao).toHaveBeenCalledTimes(2);
  });

  it("4) sem portalEnvio injetado (@Optional), o lote funciona igual e não envia nada", async () => {
    const ids = ["a1", "a2"];
    // Construído SEM o dublê (segundo argumento ausente): o ramo `if (this.portalEnvio)` nem existe
    // no caminho. A não-emissão é por AUSÊNCIA de dependência, como o caso (e) do spec individual.
    const ctx = montar({ admissoes: ids.map(aguardando), regua: REGUA_OK });

    const r = await rodarLote(ctx, ids);

    expect(r.liberadas).toHaveLength(2);
    expect(r.falhas).toHaveLength(0);
    // Nascimento intacto: as frentes nasceram, então a liberação rodou por inteiro sem o gancho.
    expect(ctx.inseridos.filter((x) => x.tipo === "AUDITORIA")).toHaveLength(2);
  });

  it("5) §A.6: na recusa o log leva só o CÓDIGO do motivo, nunca CPF nem nome de pessoa", async () => {
    const portal = {
      enviarParaAdmissao: vi.fn().mockResolvedValue({ enviado: false, motivo: "SEM_DESTINATARIO" }),
    };
    const ctx = montar({ admissoes: [aguardando("a1")], regua: REGUA_OK }, portal);

    await rodarLote(ctx, ["a1"]);

    const log = ctx.logs.join("\n");
    expect(log).toContain("SEM_DESTINATARIO"); // o código do motivo pode sair
    expect(log).not.toContain(CPF_VALIDO); // CPF nunca
    expect(log).not.toContain("Candidato Teste"); // nome da pessoa nunca
  });

  it("5) §A.6: no erro inesperado sai só o NOME do erro, nunca a mensagem (que pode trazer link/token)", async () => {
    const portal = {
      // A mensagem do erro carrega, de propósito, link + token + CPF: nada disso pode ir ao log.
      enviarParaAdmissao: vi
        .fn()
        .mockRejectedValue(
          new Error(`token=abc123 https://portal/x cpf=${CPF_VALIDO} fulano@exemplo.test`),
        ),
    };
    const ctx = montar({ admissoes: [aguardando("a1")], regua: REGUA_OK }, portal);

    await rodarLote(ctx, ["a1"]);

    const log = ctx.logs.join("\n");
    expect(log).toContain("Error"); // só o name do erro
    expect(log).not.toContain("token=abc123");
    expect(log).not.toContain("https://portal/x");
    expect(log).not.toContain(CPF_VALIDO);
    expect(log).not.toContain("fulano@exemplo.test");
  });
});
