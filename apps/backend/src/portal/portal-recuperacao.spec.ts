import { describe, expect, it, vi } from "vitest";
import { PortalIdentidadeService, PORTAL_RECUPERACAO_AVISO } from "./portal-identidade.service";

/**
 * ══ A VÁLVULA "NÃO CONSIGO ENTRAR", E QUEM PODE ESCREVER NA TRILHA POR ELA (achado S29) ══════
 *
 * ┌─ O DEFEITO ─────────────────────────────────────────────────────────────────────────────────┐
 * │ `POST /portal/recuperacao` é `@Public()`, sem sessão, e gravava UMA LINHA DE TRILHA POR       │
 * │ CHAMADA com um `jti` extraído do payload SEM conferir assinatura. Qualquer um enchia a        │
 * │ trilha, e ainda escolhia em nome de qual link. O balde global não separa ninguém: atrás da    │
 * │ barreira todo mundo chega como `127.0.0.1`.                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA PROVADA AQUI, e o porquê de cada metade está no cabeçalho do método `recuperacao`:
 *  1. grava só quando o `jti` é de uma LINHA QUE EXISTE (linha de trilha serve para um humano ir
 *     consertar o cadastro de ALGUÉM; `jti` que não casa com linha nenhuma não identifica ninguém);
 *  2. no máximo UMA linha por link por janela;
 *  3. e A RESPOSTA É SEMPRE A MESMA CONSTANTE, aconteça o que acontecer. Esta é a metade que não
 *     se negocia: resposta que varia conforme o link existir faz da rota um ORÁCULO, que é o que
 *     ela foi desenhada para não ser.
 *
 * §A.6: os valores são sintéticos e não pertencem a ninguém; a carga do evento leva só o `jti`.
 */

const LINHA_QUE_EXISTE = "11111111-1111-4111-8111-111111111111";
const LINHA_QUE_NAO_EXISTE = "99999999-9999-4999-8999-999999999999";
const IP = "203.0.113.7";

/** Um JWS de mentira: esta rota nunca confere assinatura, ela só lê o `jti` declarado. */
function tokenCom(jti: unknown): string {
  const payload = Buffer.from(JSON.stringify({ jti }), "utf8").toString("base64url");
  return `cabecalho.${payload}.assinatura`;
}

/**
 * Banco de mentirinha que responde à ÚNICA consulta desta rota: existe linha com este id?
 *
 * `consultas` guarda os ids perguntados, e é ele que prova o que o teste quer provar de verdade:
 * que o caminho barato (token torto, token lixo) NÃO chega ao banco.
 *
 * ┌─ ELE REGISTRA TODA CONSULTA, INCLUSIVE A DE VALOR DESCONHECIDO (achado S36) ────────────────┐
 * │ A primeira versão só reconhecia os DOIS UUIDs de uma constante, então `jti` fora de forma   │
 * │ nunca era registrado e o `expect(consultas).toEqual([])` passava COM OU SEM a checagem de   │
 * │ `FORMATO_UUID` no serviço. O teste chamado "nem chega ao banco" não distinguia "não chegou" │
 * │ de "chegou com um valor que o dublê não conhecia", ou seja, era falso verde: a auditoria    │
 * │ removeu a checagem e rodou 1.754 testes, todos verdes.                                       │
 * │                                                                                              │
 * │ AGORA O VALOR SAI DO `Param` DO DRIZZLE, e não de uma lista de valores esperados: `eq(col,  │
 * │ v)` monta `queryChunks` com a coluna e um `Param` (`brand`, `value`, `encoder`), e é o       │
 * │ `value` dele que é o parâmetro de verdade da consulta. Qualquer valor passa a ser visto,     │
 * │ inclusive `"' or 1=1"`, que é justamente o que precisa aparecer para o teste morder.         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A VARREDURA TEM GUARDA DE CICLO, e não é zelo: o argumento de um `eq` do Drizzle é um grafo de
 * objetos de coluna que aponta de volta para a tabela. `JSON.stringify` nele estoura em estrutura
 * circular, e a varredura sem guarda come a memória da máquina em vez de falhar.
 */
function banco(idsExistentes: string[]) {
  const consultas: string[] = [];

  /** É um `Param` do Drizzle? É ele que carrega o VALOR ligado à consulta, e não a coluna. */
  const ehParametro = (valor: object): valor is { value: unknown } =>
    "value" in valor && "encoder" in valor;

  const procurarId = (valor: unknown, vistos: WeakSet<object>, nivel = 0): string | null => {
    if (nivel > 8 || valor == null) return null;
    if (typeof valor !== "object") return null;
    if (vistos.has(valor as object)) return null;
    vistos.add(valor as object);
    if (ehParametro(valor) && typeof valor.value === "string") return valor.value;
    for (const v of Object.values(valor as Record<string, unknown>)) {
      const achado = procurarId(v, vistos, nivel + 1);
      if (achado) return achado;
    }
    return null;
  };

  const db = {
    select: () => {
      let pedido: string | null = null;
      const responder = (): unknown[] =>
        pedido !== null && idsExistentes.includes(pedido) ? [{ id: pedido }] : [];
      const cadeia = (): unknown =>
        new Proxy(
          {},
          {
            get(_alvo, prop) {
              if (prop === "then") {
                return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
                  Promise.resolve(responder()).then(ok, erro);
              }
              return (...args: unknown[]) => {
                const achado = procurarId(args, new WeakSet<object>());
                if (achado) {
                  pedido = achado;
                  if (!consultas.includes(achado)) consultas.push(achado);
                }
                return cadeia();
              };
            },
          },
        );
      return cadeia();
    },
  } as never;

  return { consultas, db };
}

function limitador(bloqueadoNaChamadaN = Infinity) {
  const chaves: string[] = [];
  let n = 0;
  const increment = vi.fn(async (chave: string, ttl: number, _l: number, bloqueio: number) => {
    chaves.push(chave);
    n += 1;
    return { totalHits: n, timeToExpire: ttl, isBlocked: n >= bloqueadoNaChamadaN, timeToBlockExpire: bloqueio };
  });
  return { storage: { increment } as never, chaves, increment };
}

const config = { get: () => "pepper-sintetico" } as never;

function servico(idsExistentes: string[], lim = limitador()) {
  const b = banco(idsExistentes);
  const registrar = vi.fn(async () => {});
  const trilha = { configurada: () => true, registrar } as never;
  return {
    alvo: new PortalIdentidadeService(b.db, config, trilha, lim.storage),
    registrar,
    consultas: b.consultas,
    lim,
  };
}

describe("a recuperação SÓ escreve na trilha por um link que EXISTE", () => {
  it("link real: grava UMA linha, com o `jti` e nada mais (§A.6)", async () => {
    const ctx = servico([LINHA_QUE_EXISTE]);

    await ctx.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_EXISTE), ip: IP });

    expect(ctx.registrar).toHaveBeenCalledTimes(1);
    const [tipo, cru, ipCompleto] = ctx.registrar.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(tipo).toBe("PORTAL_RECUPERACAO_SOLICITADA");
    expect(cru).toEqual({ jtiLink: LINHA_QUE_EXISTE });
    // O IP completo continua indo para a tabela restrita, como em todas as outras portas.
    expect(ipCompleto).toBe(IP);
  });

  it("`jti` que não casa com linha nenhuma NÃO vira linha de trilha", async () => {
    const ctx = servico([LINHA_QUE_EXISTE]);

    await ctx.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_NAO_EXISTE), ip: IP });

    // É o enchimento em si: `jti` inventado não identifica candidato nenhum, então não gera
    // trabalho para ninguém e não merece linha.
    expect(ctx.registrar).not.toHaveBeenCalled();
    expect(ctx.consultas).toEqual([LINHA_QUE_NAO_EXISTE]);
  });

  it("`jti` fora da forma de UUID nem chega ao banco: seria 500 no cast da coluna", async () => {
    const ctx = servico([LINHA_QUE_EXISTE]);

    await ctx.alvo.recuperacao({ linkToken: tokenCom("' or 1=1"), ip: IP });

    expect(ctx.registrar).not.toHaveBeenCalled();
    // O DUBLÊ VÊ QUALQUER VALOR (achado S36): se a checagem de forma sair do serviço, o valor
    // torto CHEGA aqui e esta lista deixa de estar vazia. Provado por mutação.
    expect(ctx.consultas).toEqual([]);
    // E o balde também não é tocado: a chave dele não pode ser escolhida por quem chama.
    expect(ctx.lim.chaves).toEqual([]);
  });

  it("o dublê ENXERGA o valor torto, então a lista vazia acima quer dizer alguma coisa", async () => {
    // A contraprova do teste de cima, e ela é o que separa "não chegou ao banco" de "chegou com
    // um valor que o dublê não conhecia". Aqui o valor torto é consultado DE PROPÓSITO, e ele
    // aparece; lá ele não aparece porque o serviço não consulta.
    const ctx = servico([LINHA_QUE_EXISTE]);
    await (ctx.alvo as unknown as { existeLinha(jti: string): Promise<boolean> }).existeLinha(
      "' or 1=1",
    );

    expect(ctx.consultas).toEqual(["' or 1=1"]);
  });

  it("token ausente, ilegível ou sem `jti`: nada é gravado e o banco não é consultado", async () => {
    for (const token of [null, "", "nao-e-um-jws", "a.b.c", tokenCom(42), tokenCom(undefined)]) {
      const ctx = servico([LINHA_QUE_EXISTE]);
      await ctx.alvo.recuperacao({ linkToken: token, ip: IP });
      expect(ctx.registrar, `token ${String(token)} gravou trilha`).not.toHaveBeenCalled();
      expect(ctx.consultas).toEqual([]);
    }
  });
});

describe("UMA linha por link por janela", () => {
  it("o segundo pedido do MESMO link, dentro da janela, não vira segunda linha", async () => {
    // O balde estoura a partir da segunda chamada, que é a régua (uma linha por janela).
    const ctx = servico([LINHA_QUE_EXISTE], limitador(2));

    await ctx.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_EXISTE), ip: IP });
    await ctx.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_EXISTE), ip: IP });

    expect(ctx.registrar).toHaveBeenCalledTimes(1);
    // A chave é do LINK, e não do IP: atrás da barreira o IP é sempre `127.0.0.1`.
    expect(ctx.lim.chaves).toEqual([
      `portal-recup:link:${LINHA_QUE_EXISTE}`,
      `portal-recup:link:${LINHA_QUE_EXISTE}`,
    ]);
  });

  it("o balde é tocado DEPOIS da conferência da linha, nunca antes", async () => {
    const ctx = servico([LINHA_QUE_EXISTE]);

    await ctx.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_NAO_EXISTE), ip: IP });

    // Fosse antes, o armazenamento do limitador viraria o novo lugar para despejar chave
    // escolhida por quem chama: troca-se um depósito de lixo por outro.
    expect(ctx.lim.chaves).toEqual([]);
  });
});

describe("A ROTA NÃO É ORÁCULO: a resposta é a mesma constante em TODOS os caminhos", () => {
  it("link real, link inexistente, `jti` torto, token lixo e balde estourado respondem igual", async () => {
    const respostas: unknown[] = [];

    const real = servico([LINHA_QUE_EXISTE]);
    respostas.push(await real.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_EXISTE), ip: IP }));

    const inexistente = servico([LINHA_QUE_EXISTE]);
    respostas.push(
      await inexistente.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_NAO_EXISTE), ip: IP }),
    );

    const torto = servico([LINHA_QUE_EXISTE]);
    respostas.push(await torto.alvo.recuperacao({ linkToken: tokenCom("nada-disso"), ip: IP }));

    const lixo = servico([LINHA_QUE_EXISTE]);
    respostas.push(await lixo.alvo.recuperacao({ linkToken: null, ip: IP }));

    // Balde estourado: o candidato NÃO ouve 429 nem frase diferente, ouve a mesma coisa.
    const estourado = servico([LINHA_QUE_EXISTE], limitador(1));
    respostas.push(
      await estourado.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_EXISTE), ip: IP }),
    );

    for (const r of respostas) expect(r).toEqual({ mensagem: PORTAL_RECUPERACAO_AVISO });
    // E a rota não deixou de existir nem virou autenticada: ela respondeu nos cinco caminhos.
    expect(respostas).toHaveLength(5);
  });

  it("estourar o balde não lança: a válvula nunca fecha na cara de quem pede socorro", async () => {
    const ctx = servico([LINHA_QUE_EXISTE], limitador(1));
    await expect(
      ctx.alvo.recuperacao({ linkToken: tokenCom(LINHA_QUE_EXISTE), ip: IP }),
    ).resolves.toEqual({ mensagem: PORTAL_RECUPERACAO_AVISO });
    expect(ctx.registrar).not.toHaveBeenCalled();
  });
});
