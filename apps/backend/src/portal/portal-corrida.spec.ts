import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";

/**
 * A CONTAGEM DA EMISSÃO É INVIOLÁVEL POR CORRIDA, E NÃO SÓ DURÁVEL.
 *
 * ESTE ARQUIVO EXISTE PORQUE A SUÍTE FICOU VERDE COM O FURO ABERTO. Os testes de cota eram
 * SEQUENCIAIS: emitiam uma, depois outra, depois a 26ª, e provavam a régua. Régua nunca foi o
 * problema. O problema era a JANELA entre ler o consumo e gravar a credencial: dois pedidos
 * simultâneos com 24 emitidas liam 24 os dois, concluíam "cabe mais uma" os dois, e gravavam os
 * dois. Durável e inviolável são coisas diferentes, e teste sequencial não distingue uma da outra.
 *
 * O BANCO DE MENTIRINHA MODELA O QUE IMPORTA DO POSTGRES: uma transação é um ato, e
 * `pg_advisory_xact_lock` serializa por chave até o fim dela. Toda leitura e toda escrita cedem o
 * laço de eventos de propósito, para que o entrelaçamento aconteça de verdade em vez de depender de
 * sorte.
 *
 * O TESTE DE CONTROLE (último bloco) é o que impede este arquivo de ser teatro: ele roda o MESMO
 * banco com um emissor que NÃO pede a trava e mostra as duas credenciais a mais passando. Sem ele,
 * um banco falso frouxo faria o conserto parecer provado sem provar nada.
 */

const MB = 1024 * 1024;

/** Cede o laço de eventos: sem isto as "transações" correriam coladas e nunca se entrelaçariam. */
const respirar = () => new Promise((r) => setImmediate(r));

/**
 * Postgres de mentirinha, com o pouco que importa: linhas compartilhadas entre transações e travas
 * consultivas por chave, soltas no fim da transação (como o `xact` faz de verdade).
 */
function bancoComTravas(jaEmitidas: number) {
  const linhas: { jtiLink: string; bytes: number; criadoEm: Date }[] = [];
  for (let i = 0; i < jaEmitidas; i++) {
    linhas.push({ jtiLink: "jti", bytes: 1 * MB, criadoEm: new Date(Date.now() - 600_000) });
  }
  const travas = new Map<string, Promise<void>>();
  const pedidosDeTrava: string[] = [];

  async function tomarTrava(chave: string): Promise<() => void> {
    while (travas.has(chave)) await travas.get(chave);
    let soltar!: () => void;
    travas.set(chave, new Promise<void>((r) => (soltar = () => { travas.delete(chave); r(); })));
    return soltar;
  }

  const handle = (soltarNoFim: (f: () => void) => void) => {
    let selects = 0;
    return {
      execute: async (consulta: unknown) => {
        // A trava só é tomada se o código de fato a pedir. É isso que o controle explora.
        if (JSON.stringify(consulta).includes("advisory")) {
          pedidosDeTrava.push("jti");
          soltarNoFim(await tomarTrava("jti"));
        }
        return [];
      },
      select: (proj?: Record<string, unknown>) => ({
        from: () => ({
          where: async () => {
            await respirar();
            // O LINK VIVO, conferido pela emissao desde a frente da IDENTIDADE (a revogacao tem de
            // valer na hora, e nao so quando a sessao do candidato vencer). Ele e reconhecido pela
            // PROJECAO e NAO entra na contagem ordinal abaixo, senao acrescentar uma leitura ao
            // servico deslocaria em silencio todas as respostas deste banco de mentirinha.
            if (Object.keys(proj ?? {}).includes("suspensoAte")) {
              return [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }];
            }
            selects += 1;
            if (selects === 1) {
              return [
                {
                  emitidas: linhas.length,
                  bytes: linhas.reduce((t, l) => t + l.bytes, 0),
                  extracoes: 0,
                },
              ];
            }
            const desde = Date.now() - 60_000;
            return linhas.filter((l) => l.criadoEm.getTime() > desde).map((l) => ({ criadoEm: l.criadoEm }));
          },
        }),
      }),
      insert: () => ({
        values: (v: { jtiLink: string; bytesConcedidos: number }) => ({
          returning: async () => {
            await respirar();
            linhas.push({ jtiLink: v.jtiLink, bytes: v.bytesConcedidos, criadoEm: new Date() });
            return [{ id: `cred-${linhas.length}` }];
          },
        }),
      }),
    };
  };

  return {
    linhas,
    pedidosDeTrava,
    db: {
      query: {
        tiposDocumento: { findFirst: async () => ({ id: "tipo-1", codigo: "RG", nome: "RG" }) },
        documentosAdmissao: { findFirst: async () => ({ id: "doc-1" }) },
      },
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
        const aSoltar: (() => void)[] = [];
        try {
          return await cb(handle((f) => aSoltar.push(f)));
        } finally {
          for (const soltar of aSoltar) soltar();
        }
      },
    },
  };
}

const config = (v: Record<string, string> = { PORTAL_LOG_PEPPER: "pepper" }) =>
  ({ get: (c: string) => v[c] }) as never;

const armazenamento = {
  podeEmitir: () => true,
  assinarEscrita: () => ({ url: "https://storage.googleapis.com/b/o?X-Goog-Signature=x", cabecalhos: {}, expiraEm: new Date() }),
} as never;

const trilha = { configurada: () => true, registrar: vi.fn(async () => {}) } as never;

function pedido(jti = "jti") {
  return {
    admissaoId: "adm-1",
    jtiLink: jti,
    codigoTipoDocumento: "RG",
    contentType: "application/pdf",
    bytes: 1 * MB,
  };
}

/** Dispara N emissões ao mesmo tempo e conta quantas foram concedidas. */
async function emitirEmParalelo(servico: PortalCredencialService, n: number) {
  const r = await Promise.allSettled(Array.from({ length: n }, () => servico.emitir(pedido())));
  return {
    concedidas: r.filter((x) => x.status === "fulfilled").length,
    recusadas: r.filter((x) => x.status === "rejected").length,
  };
}

describe("Teto de QUANTIDADE sob corrida (25 arquivos por link)", () => {
  it("com 24 emitidas, QUATRO pedidos simultaneos concedem UMA so", async () => {
    const banco = bancoComTravas(24);
    const servico = new PortalCredencialService(banco.db as never, config(), armazenamento, {} as never, trilha);

    const { concedidas } = await emitirEmParalelo(servico, 4);

    expect(concedidas).toBe(1);
    expect(banco.linhas.length).toBe(25);
  });

  it("a trava e pedida ao SERVIDOR, que e o que serializa duas INSTANCIAS do backend", async () => {
    const banco = bancoComTravas(24);
    const servico = new PortalCredencialService(banco.db as never, config(), armazenamento, {} as never, trilha);
    await emitirEmParalelo(servico, 3);
    // Uma trava por pedido: a serializacao nao depende de nada que viva no processo Node.
    expect(banco.pedidosDeTrava.length).toBe(3);
  });

  it("o link ja cheio (25) nao concede nenhuma, nem sob corrida", async () => {
    const banco = bancoComTravas(25);
    const servico = new PortalCredencialService(banco.db as never, config(), armazenamento, {} as never, trilha);
    const { concedidas } = await emitirEmParalelo(servico, 5);
    expect(concedidas).toBe(0);
    expect(banco.linhas.length).toBe(25);
  });
});

describe("Teto de BYTES SOMADOS sob corrida (60 MB por link)", () => {
  it("com 59 MB concedidos, dois pedidos de 1 MB simultaneos concedem UM so", async () => {
    // 59 MB em SEIS linhas gordas, e nao em 59 de 1 MB: assim quem barra e o teto de BYTES, nao o
    // de quantidade, que estouraria antes e faria o teste provar a trava errada.
    const banco = bancoComTravas(0);
    const antigas = (bytes: number) => ({ jtiLink: "jti", bytes, criadoEm: new Date(Date.now() - 600_000) });
    for (let i = 0; i < 5; i++) banco.linhas.push(antigas(10 * MB));
    banco.linhas.push(antigas(9 * MB));
    // Sobra exatamente 1 MB: cabe UM pedido de 1 MB, e o segundo estoura.
    const servico = new PortalCredencialService(banco.db as never, config(), armazenamento, {} as never, trilha);

    const { concedidas } = await emitirEmParalelo(servico, 3);

    const somado = banco.linhas.reduce((t, l) => t + l.bytes, 0);
    expect(concedidas).toBe(1);
    expect(somado).toBeLessThanOrEqual(60 * MB);
  });
});

describe("Teto de RITMO sob corrida (10 por minuto por link)", () => {
  it("com 9 emissoes no ultimo minuto, quatro simultaneas concedem UMA so", async () => {
    const banco = bancoComTravas(0);
    for (let i = 0; i < 9; i++) {
      banco.linhas.push({ jtiLink: "jti", bytes: 1024, criadoEm: new Date(Date.now() - 1_000) });
    }
    const servico = new PortalCredencialService(banco.db as never, config(), armazenamento, {} as never, trilha);

    const { concedidas } = await emitirEmParalelo(servico, 4);

    expect(concedidas).toBe(1);
    expect(banco.linhas.length).toBe(10);
  });
});

describe("CONTROLE: o mesmo banco EXPOE a corrida quando a trava nao e pedida", () => {
  it("sem a trava, quatro pedidos com 24 emitidas passam TODOS (o furo que existia)", async () => {
    const banco = bancoComTravas(24);

    // Emissor ingenuo: le e grava sem transacao e sem trava, que era o codigo de antes.
    const emitirSemTrava = async () => {
      const tx = await new Promise<Record<string, (...a: never[]) => never>>((r) =>
        banco.db.transaction(async (h) => {
          r(h as never);
          await new Promise(() => {});
        }),
      );
      const [totais] = await (tx as never as { select: () => { from: () => { where: () => Promise<{ emitidas: number }[]> } } })
        .select().from().where();
      if (totais.emitidas >= 25) throw new Error("QUANTIDADE");
      await (tx as never as { insert: () => { values: (v: unknown) => { returning: () => Promise<unknown> } } })
        .insert().values({ jtiLink: "jti", bytesConcedidos: 1 * MB }).returning();
    };

    const r = await Promise.allSettled([emitirSemTrava(), emitirSemTrava(), emitirSemTrava(), emitirSemTrava()]);
    const passaram = r.filter((x) => x.status === "fulfilled").length;

    // ESTE E O PONTO DO ARQUIVO: sem a trava o banco falso DEIXA passar mais de uma, entao os
    // testes acima provam o conserto, e nao a frouxidao do harness.
    expect(passaram).toBeGreaterThan(1);
    expect(banco.linhas.length).toBeGreaterThan(25);
    expect(banco.pedidosDeTrava.length).toBe(0);
  });
});
