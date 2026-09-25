import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";
import { AVISO_PENDENCIA_NO_TIME } from "../domain/portal-tentativas";

/**
 * O TETO DE TENTATIVAS, DO LADO DO SERVIÇO: onde o contador mora e como ele não é forjado.
 *
 * AS QUATRO COISAS QUE ESTE ARQUIVO TRAVA:
 *  1. o contador vem do BANCO, remontado a cada pedido, e não de claim, cookie ou memória;
 *  2. a CHAVE é (admissão, tipo de documento): link novo NÃO zera o teto, que é o furo mais provável
 *     da frente inteira;
 *  3. a leitura acontece DENTRO da transação que grava, que é o conserto de corrida que este módulo
 *     já usa para a cota de emissão;
 *  4. a recusa fala com o candidato, em vez de devolver um erro seco.
 *
 * §A.6: nada de dado pessoal nos fixtures.
 */

const MB = 1024 * 1024;

/**
 * Banco de mentirinha com o pouco que importa: as linhas de credencial, e um `select` que responde
 * pela PROJEÇÃO pedida (contagem de reprovações da pendência, ou o consumo do link).
 */
function banco(opts: { reprovacoes: number; emitidas?: number }) {
  const inseridas: Record<string, unknown>[] = [];
  const pedidosDeTrava: string[] = [];
  let selectsForaDaTransacao = 0;

  const handle = (dentroDaTransacao: boolean) => ({
    execute: async (consulta: unknown) => {
      if (JSON.stringify(consulta).includes("advisory")) pedidosDeTrava.push("jti");
      return [];
    },
    select: (proj: Record<string, unknown>) => {
      if (!dentroDaTransacao) selectsForaDaTransacao += 1;
      const chaves = Object.keys(proj ?? {});
      // O LINK VIVO, conferido pela emissão desde a frente da IDENTIDADE (a revogação tem de
      // valer na hora, e não só quando a sessão do candidato vencer). Aqui ele está sempre em pé,
      // porque o assunto deste arquivo é o teto de tentativas.
      const linhas = chaves.includes("suspensoAte")
        ? [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }]
        : chaves.includes("reprovacoes")
        ? [{ reprovacoes: opts.reprovacoes }]
        : chaves.includes("emitidas")
          ? [{ emitidas: opts.emitidas ?? 0, bytes: 0, extracoes: 0 }]
          : [];
      return { from: () => ({ where: async () => linhas }) };
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

const config = (v: Record<string, string> = { PORTAL_LOG_PEPPER: "pepper" }) =>
  ({ get: (c: string) => v[c] }) as never;

const armazenamento = {
  podeEmitir: () => true,
  assinarEscrita: () => ({ url: "https://storage.googleapis.com/b/o?X-Goog-Signature=x" }),
} as never;

function servico(b: ReturnType<typeof banco>, registrar = vi.fn(async () => {})) {
  const trilha = { configurada: () => true, registrar } as never;
  return new PortalCredencialService(b.db as never, config(), armazenamento, {} as never, trilha);
}

const pedido = (jtiLink = "jti-1") => ({
  admissaoId: "adm-1",
  jtiLink,
  codigoTipoDocumento: "RG",
  contentType: "application/pdf",
  bytes: 1 * MB,
});

describe("ANTES DO TETO, nada muda para o candidato", () => {
  it("com duas reprovações, a terceira tentativa ainda é concedida", async () => {
    const b = banco({ reprovacoes: 2 });

    const r = await servico(b).emitir(pedido());

    expect(r.url).toContain("X-Goog-Signature");
    expect(b.inseridas).toHaveLength(1);
  });

  it("sem reprovação nenhuma, o caminho é o de sempre", async () => {
    const b = banco({ reprovacoes: 0 });
    await expect(servico(b).emitir(pedido())).resolves.toBeTruthy();
  });
});

describe("NO TETO, o candidato para de tentar sozinho e É AVISADO", () => {
  it("a terceira reprovação fecha a pendência para o candidato", async () => {
    const b = banco({ reprovacoes: 3 });

    await expect(servico(b).emitir(pedido())).rejects.toThrow(AVISO_PENDENCIA_NO_TIME);
    // Nenhuma credencial é gravada: o candidato não recebe mais escrita para este tipo.
    expect(b.inseridas).toHaveLength(0);
  });

  it("a mensagem fala com a pessoa, não devolve um erro seco", async () => {
    const b = banco({ reprovacoes: 4 });
    await expect(servico(b).emitir(pedido())).rejects.toThrow(/equipe vai analisar/);
  });

  it("a recusa vai para a trilha com o motivo do teto, e com a contagem", async () => {
    const registrar = vi.fn(async () => {});
    const b = banco({ reprovacoes: 3 });

    await servico(b, registrar)
      .emitir(pedido())
      .catch(() => undefined);

    const motivos = registrar.mock.calls.map((c) => (c as unknown as [string, Record<string, unknown>])[1]?.motivoCodigo);
    expect(motivos).toContain("TENTATIVAS_ESGOTADAS");
  });
});

describe("A CHAVE É A PENDÊNCIA, e é isto que impede o teto de virar teatro", () => {
  it("LINK NOVO não zera o teto: a conta não é por link nem por credencial", async () => {
    const b = banco({ reprovacoes: 3 });

    // Outro `jti`, que é o que o candidato ganha ao pedir um link novo ou trocar de aparelho.
    await expect(servico(b).emitir(pedido("jti-OUTRO-LINK"))).rejects.toThrow(AVISO_PENDENCIA_NO_TIME);
  });
});

describe("A CORRIDA: a contagem é lida DENTRO da transação que grava", () => {
  it("nenhuma leitura do contador acontece fora da transação", async () => {
    const b = banco({ reprovacoes: 1 });

    await servico(b).emitir(pedido());

    // Ler do pool e gravar depois são dois atos, e entre eles cabe um pedido inteiro: dois envios
    // simultâneos leriam "2" os dois e passariam os dois.
    expect(b.selectsForaDaTransacao).toBe(0);
    expect(b.pedidosDeTrava).toEqual(["jti"]);
  });
});
