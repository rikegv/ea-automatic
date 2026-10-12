import { describe, expect, it } from "vitest";
import { ReguaCompletudeService } from "./regua-completude.service";

/**
 * COBERTURA COMPORTAMENTAL de `sincronizarDocumentosDaRegua` (frente Auditoria -> Portal, item 2).
 *
 * Esta suíte fecha o gap apontado pela auditoria de cobertura independente (§A.38): o método que
 * materializa a exigência nova era injetado como stub inerte em todos os specs que o consomem, então
 * nem a chamada nem o recorte eram assertados. Aqui o banco é de mentirinha e PROVA o comportamento:
 *
 *  - SÓ admissão VIVA materializa (EM_ADMISSAO / BANCO_AGUARDAR). Finalizada e encerrada são no-op
 *    (§A.16/§A.19: a carga histórica não é recalculada, quem declinou não ganha pendência nova).
 *  - Só OBRIGATORIO/FACULTATIVO viram linha; NAO_OBRIGATORIO fica de fora (espelha o nascimento).
 *  - A exigência nova nasce em PENDENTE.
 *  - O insert é `onConflictDoNothing` sobre (admissão, tipo): preserva a linha existente, logo é
 *    idempotente e não destrói o estado de quem já enviou.
 *  - Pré-admissão (sem cliente/cargo) é no-op.
 *
 * §A.6: ids técnicos e estado nos fixtures, nenhum dado pessoal.
 */

const ADM = "adm-1";

type Exig = "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";
interface LinhaRegua {
  admissaoId: string;
  tipoDocumentoId: string;
  exigencia: Exig;
  clienteVinculoId: string | null;
}
const linha = (tipo: string, exigencia: Exig, clienteVinculoId: string | null = null): LinhaRegua => ({
  admissaoId: ADM,
  tipoDocumentoId: tipo,
  exigencia,
  clienteVinculoId,
});

/** Banco de mentirinha: responde a admissão e a régua, e GUARDA o que foi inserido. */
function montar(
  adm: Record<string, unknown> | null,
  reguaRows: LinhaRegua[],
) {
  const inserts: { values: unknown; opts: unknown }[] = [];
  const db = {
    query: { admissoes: { findFirst: async () => adm } },
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => reguaRows }) }) }),
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoNothing: (opts: unknown) => {
          inserts.push({ values: v, opts });
          return Promise.resolve();
        },
      }),
    }),
  };
  return { svc: new ReguaCompletudeService(db as never), inserts };
}

const admissao = (farolGlobal: string, over: Record<string, unknown> = {}) => ({
  id: ADM,
  farolGlobal,
  codCliente: "C-10",
  cargoId: "cargo-1",
  clienteVinculoId: null,
  ...over,
});

describe("sincronizarDocumentosDaRegua: materializa a exigência nova só para admissão viva", () => {
  it("admissão VIVA: materializa OBRIGATORIO e FACULTATIVO como PENDENTE, NAO_OBRIGATORIO fica de fora", async () => {
    const { svc, inserts } = montar(admissao("EM_ADMISSAO"), [
      linha("rg", "OBRIGATORIO"),
      linha("foto", "FACULTATIVO"),
      linha("curriculo", "NAO_OBRIGATORIO"),
    ]);

    await svc.sincronizarDocumentosDaRegua(ADM);

    expect(inserts).toHaveLength(1);
    const valores = inserts[0].values as { tipoDocumentoId: string; estado: string; admissaoId: string }[];
    expect(valores.map((v) => v.tipoDocumentoId).sort()).toEqual(["foto", "rg"]);
    expect(valores.every((v) => v.estado === "PENDENTE")).toBe(true);
    expect(valores.every((v) => v.admissaoId === ADM)).toBe(true);
  });

  it("é NÃO DESTRUTIVO: o insert usa onConflictDoNothing sobre (admissão, tipo)", async () => {
    const { svc, inserts } = montar(admissao("BANCO_AGUARDAR"), [linha("rg", "OBRIGATORIO")]);

    await svc.sincronizarDocumentosDaRegua(ADM);

    expect(inserts).toHaveLength(1);
    const opts = inserts[0].opts as { target: unknown[] };
    expect(Array.isArray(opts.target)).toBe(true);
    expect(opts.target).toHaveLength(2); // (admissaoId, tipoDocumentoId)
  });

  it("BANCO_AGUARDAR também é vivo e materializa", async () => {
    const { svc, inserts } = montar(admissao("BANCO_AGUARDAR"), [linha("rg", "OBRIGATORIO")]);
    await svc.sincronizarDocumentosDaRegua(ADM);
    expect(inserts).toHaveLength(1);
  });

  it("ADMISSAO_CONCLUIDA: NÃO materializa (carga finalizada não recalcula, §A.16)", async () => {
    const { svc, inserts } = montar(admissao("ADMISSAO_CONCLUIDA"), [linha("rg", "OBRIGATORIO")]);
    await svc.sincronizarDocumentosDaRegua(ADM);
    expect(inserts).toHaveLength(0);
  });

  it("DECLINOU e RESCISAO: NÃO materializam (encerrada não ganha pendência nova, §A.19)", async () => {
    for (const farol of ["DECLINOU", "RESCISAO"]) {
      const { svc, inserts } = montar(admissao(farol), [linha("rg", "OBRIGATORIO")]);
      await svc.sincronizarDocumentosDaRegua(ADM);
      expect(inserts, `farol ${farol}`).toHaveLength(0);
    }
  });

  it("admissão inexistente: no-op", async () => {
    const { svc, inserts } = montar(null, [linha("rg", "OBRIGATORIO")]);
    await svc.sincronizarDocumentosDaRegua(ADM);
    expect(inserts).toHaveLength(0);
  });

  it("pré-admissão sem cliente/cargo: NÃO materializa (não há régua a resolver, §A.3)", async () => {
    const { svc, inserts } = montar(admissao("EM_ADMISSAO", { codCliente: null, cargoId: null }), [
      linha("rg", "OBRIGATORIO"),
    ]);
    await svc.sincronizarDocumentosDaRegua(ADM);
    expect(inserts).toHaveLength(0);
  });

  it("régua só com NAO_OBRIGATORIO: nada a materializar, nenhum insert", async () => {
    const { svc, inserts } = montar(admissao("EM_ADMISSAO"), [
      linha("curriculo", "NAO_OBRIGATORIO"),
      linha("foto3x4", "NAO_OBRIGATORIO"),
    ]);
    await svc.sincronizarDocumentosDaRegua(ADM);
    expect(inserts).toHaveLength(0);
  });

  it("vínculo vence o cliente no MESMO documento (uma linha só por tipo)", async () => {
    const { svc, inserts } = montar(admissao("EM_ADMISSAO", { clienteVinculoId: "v-1" }), [
      linha("rg", "NAO_OBRIGATORIO", null), // linha do cliente
      linha("rg", "OBRIGATORIO", "v-1"), // linha do vínculo vence
    ]);
    await svc.sincronizarDocumentosDaRegua(ADM);
    const valores = inserts[0].values as { tipoDocumentoId: string }[];
    expect(valores).toHaveLength(1);
    expect(valores[0].tipoDocumentoId).toBe("rg");
  });

  it("IDEMPOTENTE: rodar duas vezes não lança e mantém o onConflictDoNothing", async () => {
    const { svc, inserts } = montar(admissao("EM_ADMISSAO"), [linha("rg", "OBRIGATORIO")]);
    await svc.sincronizarDocumentosDaRegua(ADM);
    await svc.sincronizarDocumentosDaRegua(ADM);
    expect(inserts).toHaveLength(2);
    expect(inserts.every((i) => (i.opts as { target: unknown[] }).target.length === 2)).toBe(true);
  });
});
