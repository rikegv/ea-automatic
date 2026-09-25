import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * OS DOIS PONTOS QUE O TESTE DE UNIDADE PURO NÃO ALCANÇA, E QUE SÃO EXATAMENTE OS QUE MENTEM.
 *
 * 1. A CONTAGEM DA EMISSÃO É DURÁVEL. A régua pura (`domain/portal-credencial.ts`) recebe o estado
 *    pronto, então ela passa igualzinho com um estado que vive em memória. O furo não estaria na
 *    régua, estaria em QUEM a alimenta: se o consumo do link morasse no processo, 26 credenciais
 *    pedidas sobreviveriam a um `restart`, o teto do diretor viraria teatro e o teste unitário
 *    continuaria verde. Aqui o banco é o dono, e a prova é um serviço NOVO (processo reiniciado)
 *    enxergando o mesmo consumo.
 *
 * 2. O PEPPER FALHA FECHADO. Sem `PORTAL_LOG_PEPPER`, a gravação do evento FALHA. Em hipótese
 *    nenhuma cai para CPF cru, e em hipótese nenhuma grava com pepper vazio, que daria um hash
 *    quebrável por força bruta em segundos (CPF tem 11 dígitos) e seria um "hash" de fachada.
 */

/** Banco de mentirinha: devolve as linhas que o teste mandar, sem tocar Postgres. */
function bancoFake(linhas: {
  totais: { emitidas: number; bytes: number; extracoes: number };
  recentes: { criadoEm: Date }[];
}) {
  let chamada = 0;
  const cadeia = () => ({
    from: () => ({
      where: () => {
        chamada += 1;
        return chamada === 1 ? [linhas.totais] : linhas.recentes;
      },
    }),
  });
  return { select: vi.fn(cadeia) } as unknown as ConstructorParameters<typeof PortalCredencialService>[0];
}

const config = (valores: Record<string, string>) =>
  ({ get: (chave: string) => valores[chave] }) as never;

/**
 * Alcança o método privado sem afrouxar a visibilidade em produção.
 *
 * O HANDLE DE LEITURA É PARÂMETRO, e não um detalhe deste teste: em produção quem o recebe é a
 * TRANSAÇÃO que vai gravar a credencial, para que ler e escrever sejam um ato só. A prova de que
 * isso fecha a corrida está em `portal-corrida.spec.ts`; aqui prova-se a outra metade, que o estado
 * vem do banco e não da memória do processo.
 */
function estadoDoLink(servico: PortalCredencialService, leitor: unknown, jti: string) {
  return (
    servico as unknown as { estadoDoLink: (l: unknown, j: string) => Promise<unknown> }
  ).estadoDoLink(leitor, jti);
}

describe("A contagem da emissao vive no BANCO, e por isso sobrevive a reinicio", () => {
  const linhas = {
    totais: { emitidas: 25, bytes: 60 * 1024 * 1024, extracoes: 3 },
    recentes: [],
  };

  it("o estado e REMONTADO do banco, nao guardado no processo", async () => {
    const db = bancoFake(linhas);
    const servico = new PortalCredencialService(db, config({}), {} as never, {} as never, {} as never);
    const estado = await estadoDoLink(servico, db, "jti-do-link");
    expect(estado).toEqual({
      emitidas: 25,
      bytesConcedidos: 60 * 1024 * 1024,
      extracoes: 3,
      emissoesMs: [],
    });
    expect((db as unknown as { select: ReturnType<typeof vi.fn> }).select).toHaveBeenCalled();
  });

  it("uma instancia NOVA do servico (processo reiniciado) ve o mesmo consumo", async () => {
    const bancoA = bancoFake(linhas);
    const bancoB = bancoFake(linhas);
    const antes = await estadoDoLink(
      new PortalCredencialService(bancoA, config({}), {} as never, {} as never, {} as never),
      bancoA,
      "jti-do-link",
    );
    const depois = await estadoDoLink(
      new PortalCredencialService(bancoB, config({}), {} as never, {} as never, {} as never),
      bancoB,
      "jti-do-link",
    );
    expect(depois).toEqual(antes);
  });

  it("o ritmo le CARIMBOS do banco, entao ele tambem nao depende da memoria do processo", async () => {
    const agora = Date.now();
    const banco = bancoFake({
      totais: { emitidas: 10, bytes: 10, extracoes: 0 },
      recentes: [{ criadoEm: new Date(agora) }],
    });
    const servico = new PortalCredencialService(banco, config({}), {} as never, {} as never, {} as never);
    const estado = (await estadoDoLink(servico, banco, "j")) as { emissoesMs: number[] };
    expect(estado.emissoesMs).toEqual([agora]);
  });
});

describe("O pepper da trilha falha FECHADO (nunca cai para CPF cru)", () => {
  it("sem PORTAL_LOG_PEPPER, registrar LANCA e nao escreve nada no banco", async () => {
    const insert = vi.fn();
    const trilha = new PortalTrilhaService({ insert } as never, config({}));
    await expect(trilha.registrar("PORTAL_CREDENCIAL_EMITIDA", { cpf: "52998224725" })).rejects.toThrow(
      /PORTAL_LOG_PEPPER/,
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("pepper so de espacos em branco conta como ausente", async () => {
    const insert = vi.fn();
    const trilha = new PortalTrilhaService({ insert } as never, config({ PORTAL_LOG_PEPPER: "   " }));
    await expect(trilha.registrar("PORTAL_LINK_ABERTO", {})).rejects.toThrow(/PORTAL_LOG_PEPPER/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("`configurada()` diz NAO sem pepper, e e por isso que a emissao se recusa antes de conceder", () => {
    expect(new PortalTrilhaService({} as never, config({})).configurada()).toBe(false);
    expect(new PortalTrilhaService({} as never, config({ PORTAL_LOG_PEPPER: "x" })).configurada()).toBe(true);
  });

  it("com pepper, o CPF vira hash e o valor cru NAO chega ao insert", async () => {
    const values = vi.fn(() => ({ returning: async () => [{ id: "evento-1" }] }));
    const trilha = new PortalTrilhaService(
      { insert: vi.fn(() => ({ values })) } as never,
      config({ PORTAL_LOG_PEPPER: "pepper-de-teste" }),
    );
    await trilha.registrar("PORTAL_IDENTIFICACAO_OK", { cpf: "529.982.247-25" });
    const gravado = JSON.stringify(values.mock.calls[0]);
    expect(gravado).not.toContain("52998224725");
    expect(gravado).not.toContain("529.982.247-25");
    expect(gravado).toMatch(/[0-9a-f]{32}/);
  });
});
