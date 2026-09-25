import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";
import { AVISO_ARQUIVO_UNICO } from "../domain/portal-arquivo-unico";

/**
 * UM ARQUIVO POR TIPO DE DOCUMENTO, DO LADO DO SERVIÇO: a régua vale NO SERVIDOR, e não na tela.
 *
 * ┌─ O QUE ESTE ARQUIVO PROVA, E POR QUE CADA UMA IMPORTA ────────────────────────────────────┐
 * │ 1. com um arquivo daquele tipo JÁ EM ABERTO, a credencial não é emitida e NADA é gravado:   │
 * │    é isto que impede o segundo objeto de existir e o sistema de ficar só com o verso;       │
 * │ 2. a recusa fala com o candidato (frente e verso no mesmo arquivo), não devolve erro seco;  │
 * │ 3. o envio REPROVADO não bloqueia o próximo: reenviar é o fluxo, e confundir as duas réguas │
 * │    trancaria a pessoa logo na primeira correção;                                            │
 * │ 4. a contagem é lida DENTRO da transação, sob a mesma trava por link das outras duas: fora  │
 * │    dela, dois toques simultâneos leem "zero em aberto" os dois e sobem dois arquivos;       │
 * │ 5. a consulta pede `confirmado_em is not null` E `reprovado_em is null`. Sem a primeira, a  │
 * │    credencial que morreu no 4G do candidato o trancaria; sem a segunda, ele nunca corrige.  │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: identificador técnico e contagem. Nenhum dado pessoal nos fixtures.
 */

const MB = 1024 * 1024;

/** Texto de um nó SQL do drizzle, para as afirmações sobre a CLÁUSULA (prova 5). */
function serializar(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (no instanceof Date) return no.toISOString();
  if (Array.isArray(no)) return no.map(serializar).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(serializar).join(" ");
  if ("value" in o && "encoder" in o) return serializar(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(serializar).join("");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

/**
 * Banco de mentirinha que responde pela PROJEÇÃO pedida. Ele não adivinha a regra: devolve o número
 * que o cenário diz existir, e guarda a cláusula para o teste poder afirmar o que ela pediu.
 */
function banco(opts: { emAberto: number; reprovacoes?: number }) {
  const inseridas: Record<string, unknown>[] = [];
  const pedidosDeTrava: string[] = [];
  const clausulas: string[] = [];
  let selectsForaDaTransacao = 0;

  const handle = (dentroDaTransacao: boolean) => ({
    execute: async (consulta: unknown) => {
      if (serializar(consulta).includes("advisory")) pedidosDeTrava.push("jti");
      return [];
    },
    select: (proj: Record<string, unknown>) => {
      if (!dentroDaTransacao) selectsForaDaTransacao += 1;
      const chaves = Object.keys(proj ?? {});
      return {
        from: () => ({
          where: async (c: unknown) => {
            const clausula = serializar(c);
            clausulas.push(clausula);
            // O LINK VIVO, conferido pela emissão desde a frente da IDENTIDADE. Sempre em pé
            // aqui: o assunto deste arquivo é um arquivo por tipo de documento.
            if (chaves.includes("suspensoAte")) return [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }];
            if (chaves.includes("emAberto")) return [{ emAberto: opts.emAberto }];
            if (chaves.includes("reprovacoes")) return [{ reprovacoes: opts.reprovacoes ?? 0 }];
            if (chaves.includes("emitidas")) return [{ emitidas: 0, bytes: 0, extracoes: 0 }];
            // Pendência sem marco de reabertura: o caso comum.
            return [];
          },
        }),
      };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          inseridas.push(v);
          return [{ id: `cred-${inseridas.length}` }];
        },
      }),
    }),
  });

  return {
    inseridas,
    pedidosDeTrava,
    clausulas,
    get selectsForaDaTransacao() {
      return selectsForaDaTransacao;
    },
    db: {
      ...handle(false),
      query: {
        tiposDocumento: { findFirst: async () => ({ id: "tipo-1", codigo: "RG", nome: "RG" }) },
        documentosAdmissao: { findFirst: async () => ({ id: "doc-1" }) },
      },
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(handle(true)),
    },
  };
}

const armazenamento = {
  podeEmitir: () => true,
  assinarEscrita: async () => ({ url: "https://storage.googleapis.com/b/o?X-Goog-Signature=x" }),
} as never;

function servico(b: ReturnType<typeof banco>, registrar = vi.fn(async () => {})) {
  const trilha = { configurada: () => true, registrar } as never;
  return new PortalCredencialService(
    b.db as never,
    { get: () => "pepper" } as never,
    armazenamento,
    {} as never,
    trilha,
  );
}

const pedido = () => ({
  admissaoId: "adm-1",
  jtiLink: "jti-1",
  codigoTipoDocumento: "RG",
  contentType: "application/pdf",
  bytes: 1 * MB,
});

describe("COM UM ARQUIVO EM ABERTO, o segundo não sobe", () => {
  it("a credencial é recusada e NENHUMA linha é gravada", async () => {
    const b = banco({ emAberto: 1 });

    await expect(servico(b).emitir(pedido())).rejects.toThrow(AVISO_ARQUIVO_UNICO);
    // Sem linha, sem objeto: é o segundo objeto que faria o sistema ficar só com o verso.
    expect(b.inseridas).toHaveLength(0);
  });

  it("a recusa diz o que fazer com frente e verso, em vez de um erro seco", async () => {
    const b = banco({ emAberto: 1 });
    await expect(servico(b).emitir(pedido())).rejects.toThrow(/frente e o verso/i);
  });

  it("a trilha recebe o motivo PRÓPRIO, distinguível do teto de tentativas", async () => {
    const registrar = vi.fn(async () => {});
    const b = banco({ emAberto: 1 });

    await servico(b, registrar)
      .emitir(pedido())
      .catch(() => undefined);

    const motivos = registrar.mock.calls.map(
      (c) => (c as unknown as [string, Record<string, unknown>])[1]?.motivoCodigo,
    );
    expect(motivos).toContain("ARQUIVO_JA_ENVIADO");
    expect(motivos).not.toContain("TENTATIVAS_ESGOTADAS");
  });
});

describe("SEM ARQUIVO EM ABERTO, o caminho é o de sempre", () => {
  it("o primeiro envio do tipo passa", async () => {
    const b = banco({ emAberto: 0 });

    const r = await servico(b).emitir(pedido());

    expect(r.url).toContain("X-Goog-Signature");
    expect(b.inseridas).toHaveLength(1);
  });

  it("um envio REPROVADO não bloqueia o próximo: reenviar é o fluxo", async () => {
    // Reprovado não está "em aberto" (a consulta pede `reprovado_em is null`), e a tentativa ainda
    // cabe no teto. Confundir as duas réguas trancaria a pessoa na primeira correção.
    const b = banco({ emAberto: 0, reprovacoes: 1 });

    await expect(servico(b).emitir(pedido())).resolves.toBeTruthy();
  });
});

describe("A CONSULTA PEDE AS DUAS CONDIÇÕES, e é isso que separa arquivo vivo de envio morto", () => {
  it("conta só o confirmado e ainda não reprovado", async () => {
    const b = banco({ emAberto: 0 });

    await servico(b).emitir(pedido());

    const daRegua = b.clausulas.find((c) => /confirmado_em\s+is\s+not\s+null/i.test(c));
    expect(
      daRegua,
      "a régua do arquivo único não exigiu `confirmado_em is not null`: uma credencial que morreu na rede trancaria o candidato",
    ).toBeTruthy();
    expect(
      daRegua,
      "a régua do arquivo único não exigiu `reprovado_em is null`: o candidato reprovado nunca conseguiria corrigir",
    ).toMatch(/reprovado_em\s+is\s+null/i);
  });
});

describe("A CORRIDA: a contagem é lida DENTRO da transação que grava", () => {
  it("nenhuma leitura acontece fora da transação, e a trava por link é pedida", async () => {
    const b = banco({ emAberto: 0 });

    await servico(b).emitir(pedido());

    expect(b.selectsForaDaTransacao).toBe(0);
    expect(b.pedidosDeTrava).toEqual(["jti"]);
  });
});
