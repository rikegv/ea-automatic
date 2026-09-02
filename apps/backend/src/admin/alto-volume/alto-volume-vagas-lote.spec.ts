import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { AltoVolumeService } from "./alto-volume.service";
import { RemoverVagasEmLoteDto } from "./alto-volume.dto";
import { motivoCotasAntes } from "./meta-detalhamento";

/**
 * REMOÇÃO EM LOTE das linhas de vagas (peça 3 do pacote de usabilidade).
 *
 * O QUE ESTES TESTES PROTEGEM, e não é comodidade de tela: distribuir um cargo por loja cria uma
 * linha POR LOJA, e apagar a linha GERAL do cargo deixando as cotas de pé deixa o cargo sem meta com
 * lojas ainda prometendo vaga. Não é erro que apareça: é o quadro da diretoria lendo um plano que
 * não existe mais, semanas depois, numa reunião. A regra A (`meta-detalhamento.ts`) diz que a meta
 * do cargo é a soma das linhas SEM loja; zerá-la sem tirar as cotas quebra essa identidade.
 *
 * A ORDEM É OBRIGATÓRIA por decisão do diretor: cota primeiro, linha do cargo depois. Selecionar as
 * duas juntas não vale, e há teste só para isso, porque era exatamente assim que o lote burlava a
 * regra que a tela ensina.
 *
 * O segundo grupo protege a promessa do lote: uma linha ruim NÃO derruba as outras, a mesma régua do
 * lote de vínculos, e o lote NUNCA apaga o que não foi selecionado.
 */

const PROJETO = "22222222-2222-4222-8222-222222222222";
const CARGO = "cargo-1";
const OUTRO_CARGO = "cargo-2";

type Linha = { id: string; cargoId: string; lojaId: string | null; grupoId: string | null };

const GERAL: Linha = { id: "geral", cargoId: CARGO, lojaId: null, grupoId: null };
const COTA_A: Linha = { id: "cota-a", cargoId: CARGO, lojaId: "loja-a", grupoId: null };
const COTA_B: Linha = { id: "cota-b", cargoId: CARGO, lojaId: "loja-b", grupoId: null };
const OUTRO: Linha = { id: "outro", cargoId: OUTRO_CARGO, lojaId: null, grupoId: null };

function montar(linhas: Linha[], projeto: unknown = { id: PROJETO, codCliente: "100" }) {
  /** Ids que o DELETE recebeu, que é a única forma de afirmar que nada além do lote saiu. */
  const apagados: string[][] = [];
  const leitura = {
    from: () => leitura,
    where: async () => linhas,
  };
  const db = {
    query: {
      projetosAltoVolume: { findFirst: vi.fn(async () => projeto) },
    },
    select: vi.fn(() => leitura),
    delete: vi.fn(() => ({
      where: async (cond: unknown) => {
        apagados.push(extrairIds(cond));
      },
    })),
  };
  return { apagados, service: new AltoVolumeService(db as never) };
}

/** Puxa os parâmetros do `in (…)` que o drizzle montou. */
function extrairIds(cond: unknown): string[] {
  const out: string[] = [];
  const visitar = (no: unknown) => {
    if (Array.isArray(no)) return no.forEach(visitar);
    if (!no || typeof no !== "object") return;
    const rec = no as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(rec.queryChunks)) return rec.queryChunks.forEach(visitar);
    if ("value" in rec && typeof rec.value === "string") out.push(rec.value);
  };
  visitar(cond);
  return out;
}

describe("remover vagas em lote: a trava da meta (regra A)", () => {
  it("RECUSA apagar a linha geral enquanto houver cota de loja, e ensina a ordem", async () => {
    const ctx = montar([GERAL, COTA_A, COTA_B]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, { vagaIds: [GERAL.id] });

    expect(r.removidas).toBe(0);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].motivo).toBe(motivoCotasAntes(2));
    expect(r.falhas[0].motivo).toContain("Remova primeiro a distribuição por loja");
    // Nada foi apagado: a recusa é ANTES do delete, não um rollback depois.
    expect(ctx.apagados).toHaveLength(0);
  });

  /**
   * A ORDEM É OBRIGATÓRIA, e este é o teste que fecha a porta dos fundos (decisão do diretor).
   *
   * Selecionar a linha do cargo JUNTO com as cotas era, até aqui, o jeito aceito de remover tudo de
   * uma vez. Deixou de ser: num lote único não há ordem garantida entre as linhas, então a tela
   * estaria ensinando um caminho que o banco não faz. As cotas saem, a linha do cargo FICA, e o
   * clique seguinte a remove, agora que o cargo não tem mais distribuição.
   */
  it("selecionar a linha geral JUNTO com as cotas NÃO burla a ordem", async () => {
    const ctx = montar([GERAL, COTA_A, COTA_B]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, {
      vagaIds: [GERAL.id, COTA_A.id, COTA_B.id],
    });

    expect(r.removidas).toBe(2);
    expect(ctx.apagados[0].sort()).toEqual(["cota-a", "cota-b"]);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].vagaId).toBe(GERAL.id);
  });

  it("removidas as cotas, a linha geral sai no clique seguinte", async () => {
    // O estado do banco DEPOIS da remoção das cotas: o cargo não tem mais distribuição.
    const ctx = montar([GERAL]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, { vagaIds: [GERAL.id] });

    expect(r.removidas).toBe(1);
    expect(r.falhas).toHaveLength(0);
    expect(ctx.apagados[0]).toEqual([GERAL.id]);
  });

  it("apagar SÓ cotas é sempre livre: a meta do cargo não depende delas", async () => {
    const ctx = montar([GERAL, COTA_A, COTA_B]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, { vagaIds: [COTA_A.id, COTA_B.id] });

    expect(r.removidas).toBe(2);
    expect(r.falhas).toHaveLength(0);
  });

  it("cargo SEM distribuição por loja sai sozinho, sem cerimônia", async () => {
    const ctx = montar([GERAL, OUTRO]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, { vagaIds: [OUTRO.id] });

    expect(r.removidas).toBe(1);
    expect(ctx.apagados[0]).toEqual([OUTRO.id]);
  });

  it("as cotas de OUTRO cargo não travam a linha geral deste", async () => {
    // O contador olha o cargo da linha, não o projeto inteiro: um cargo distribuído por loja não
    // pode impedir a remoção de um cargo vizinho que ninguém distribuiu.
    const ctx = montar([GERAL, COTA_A, OUTRO]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, { vagaIds: [OUTRO.id] });

    expect(r.removidas).toBe(1);
    expect(r.falhas).toHaveLength(0);
  });
});

describe("remover vagas em lote: uma linha ruim não derruba o lote", () => {
  it("id que não é deste projeto FALHA sozinho, e os outros saem", async () => {
    const ctx = montar([GERAL, OUTRO]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, {
      vagaIds: [GERAL.id, "de-outro-projeto", OUTRO.id],
    });

    expect(r.removidas).toBe(2);
    expect(r.falhas).toEqual([
      { vagaId: "de-outro-projeto", motivo: "Linha de vagas não encontrada neste projeto." },
    ]);
    expect(ctx.apagados[0].sort()).toEqual(["geral", "outro"]);
  });

  it("id REPETIDO no mesmo pedido vira um só, e não uma falha", async () => {
    const ctx = montar([GERAL]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, {
      vagaIds: [GERAL.id, GERAL.id, GERAL.id],
    });

    expect(r.removidas).toBe(1);
    expect(r.falhas).toHaveLength(0);
  });

  it("lote SÓ com id inválido não chama o delete", async () => {
    const ctx = montar([GERAL]);

    const r = await ctx.service.removerVagasEmLote(PROJETO, { vagaIds: ["fantasma"] });

    expect(r.removidas).toBe(0);
    expect(ctx.apagados).toHaveLength(0);
  });

  it("projeto inexistente recusa o lote inteiro, antes de qualquer leitura de linha", async () => {
    const ctx = montar([GERAL], null);

    await expect(ctx.service.removerVagasEmLote(PROJETO, { vagaIds: [GERAL.id] })).rejects.toThrow();
    expect(ctx.apagados).toHaveLength(0);
  });
});

describe("o DTO barra o pedido torto antes do serviço", () => {
  const erros = (body: unknown) =>
    validateSync(plainToInstance(RemoverVagasEmLoteDto, body)).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  it("lista vazia é recusada com frase de gente", () => {
    expect(erros({ vagaIds: [] }).join(" ")).toContain("Selecione pelo menos uma linha");
  });

  it("id que não é uuid é recusado", () => {
    expect(erros({ vagaIds: ["nao-e-uuid"] }).length).toBeGreaterThan(0);
  });

  it("uuid válido passa", () => {
    expect(erros({ vagaIds: [PROJETO] })).toEqual([]);
  });

  it("acima do teto é recusado: seleção de duzentas linhas é engano de tela", () => {
    const muitos = Array.from({ length: 201 }, () => PROJETO);
    expect(erros({ vagaIds: muitos }).join(" ")).toContain("no máximo 200");
  });
});
