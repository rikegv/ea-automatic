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

type Row = Record<string, unknown>;

interface Cenario {
  /** `null` = admissão sem origem Pandapé (nada a puxar). Ausente = veio do Pandapé. */
  integracao?: Row | null;
  admissoes: Row[];
  regua?: Row[];
  clienteExiste?: boolean;
  cargoExiste?: boolean;
}

/** Fake do Drizzle: só o que o `liberarEmLote` toca. Conta as transações efetivamente abertas. */
function montar(cen: Cenario) {
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
        findFirst: async () => ({ nome: "Candidato Teste", cpf: "12345678901" }),
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
  const service = new AdmissoesService(db as never, fila as never);
  // Envolve o findFirst para saber qual id o laço pede a cada volta: a ordem é a dos ids enviados.
  return {
    service,
    fila,
    inseridos,
    atualizados,
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
  candidatoCpf: "12345678901",
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
      vagaFolha: { salario: "2500.00", escala: "12x36" },
    });
    expect(r.liberadas).toHaveLength(2);
    expect(r.falhas).toHaveLength(0);

    const admissoesAtualizadas = ctx.atualizados.filter((u) => u.farolGlobal === "EM_ADMISSAO");
    expect(admissoesAtualizadas).toHaveLength(2);
    for (const u of admissoesAtualizadas) {
      expect(u.tipoContrato).toBe("Temporário");
      expect(u.dataAdmissao).toBe("2026-08-01");
      // Campos em branco no lote (centro de custo, gestor, benefícios) seguem como pendência
      // individual: o sinalizador da régua unificada §A.19 NÃO fecha em OK.
      expect(u.sinalizadorPreenchimento).not.toBe("OK");
    }
    const vagas = ctx.atualizados.filter((u) => "salario" in u);
    expect(vagas).toHaveLength(2);
    for (const v of vagas) {
      expect(v.salario).toBe("2500.00");
      expect(v.escala).toBe("12x36");
      expect(v.centroCusto).toBeNull(); // em branco no lote, segue pendência individual
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
      vagaFolha: { salario: "R$ 2.500,00" },
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
      // Tudo o que a régua §A.19 cobra preenchido, MENOS nada: só a observação é extra.
      observacaoLiberacao: "Recado do consultor",
    });

    const [u] = ctx.atualizados.filter((x) => x.farolGlobal === "EM_ADMISSAO");
    // A observação não maquia pendência: sem salário/contrato/data/benefícios, segue pendente.
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
