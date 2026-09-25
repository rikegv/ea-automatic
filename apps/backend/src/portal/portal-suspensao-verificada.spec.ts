import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PORTAL_FRAGMENTO_LINK } from "@ea/shared-types";
import { cunharLink, estadoDaLinha, PORTAL_LINK_TTL_HORAS } from "../domain/portal-identidade";
import { PortalIdentidadeService } from "./portal-identidade.service";

/**
 * O QUE ESTE ARQUIVO TRAVA, e os quatro itens são os vetos da auditoria de código sobre a camada de
 * identidade.
 *
 *  1. VETO 1, E O ACHADO S37 QUE O FECHOU DE VERDADE: a SUSPENSÃO do link (escrita durável, 24
 *     horas) nunca nasce de um `jti` que ninguém verificou, E O BALDE QUE A DECIDE TAMBÉM NÃO.
 *     Antes da assinatura, o lixo conta no balde do HASH DO TOKEN; o balde POR LINK só é tocado
 *     com `bilhete.jti`. A primeira correção fechou só a escrita, e com isso quem conhecesse um
 *     `jti` enchia o balde da vítima e ela colhia o 429 e, insistindo, a suspensão. O arnês
 *     adversarial do fim do arquivo prova as duas metades: o ataque morreu, a varredura não.
 *  2. A escalada CONTINUA EXISTINDO com bilhete válido: o conserto não pode ter matado a trava.
 *  3. A emissão toma a mesma família de trava da emissão de credencial, então duas emissões
 *     simultâneas não deixam DOIS links vivos na mesma admissão.
 *  4. A linha do link e o bilhete têm de falar da MESMA admissão.
 *
 * E o quinto, que não é veto e sim o vocabulário: a URL usa a letra do CONTRATO, não a escrita à
 * mão, que foi o que fez o link nunca abrir (`#t=` contra `#l=`).
 *
 * §A.6: fixtures sintéticos, CPF de teste que não pertence a ninguém, e nenhum token em asserção
 * de log.
 */

const SINTETICO = {
  admissaoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  outraAdmissaoId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  autorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  jti: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  cpf: "00000000191",
  dataNascimento: "1990-01-01",
  ip: "203.0.113.7",
};

const HORA_MS = 3_600_000;

/** A fonte do serviço, para as travas que são ESTRUTURAIS (tipo e chave da trava). */
const ARQUIVO_SERVICO = readFileSync(join(__dirname, "portal-identidade.service.ts"), "utf8");

/** O par de verdade, e um SEGUNDO par que é o do forjador. */
function par() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const b64 = Buffer.from(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  ).toString("base64");
  return { privateKey, publicKey, b64 };
}

const NOSSO = par();
const DO_FORJADOR = par();

function token(chave: KeyObject, dados: { admissaoId?: string; jti?: string } = {}): string {
  return cunharLink(
    {
      admissaoId: dados.admissaoId ?? SINTETICO.admissaoId,
      jti: dados.jti ?? SINTETICO.jti,
      agoraMs: Date.now(),
      ttlHoras: PORTAL_LINK_TTL_HORAS,
    },
    chave,
  );
}

/** A cadeia do Drizzle de mentirinha: encadeável e awaitável, sem `any`. */
type Cadeia = PromiseLike<unknown[]> & Record<string, unknown>;

type LinhaLink = {
  id: string;
  admissaoId: string;
  expiraEm: Date | null;
  revogadoEm: Date | null;
  suspensoAte: Date | null;
  // O BLOQUEIO MANUAL FALTAVA AQUI, e a falta não era detalhe de fixture: sem a coluna, o dublê
  // não conseguia sequer ENUNCIAR o cenário "o time bloqueou o link à mão e o candidato insiste",
  // que é o dano da quarta rodada da família S37.
  bloqueadoEm: Date | null;
};

/** As colunas de ESTADO da linha, que é o que o `update` do serviço pode mexer. */
const COLUNAS_DE_ESTADO = ["expiraEm", "revogadoEm", "suspensoAte", "bloqueadoEm"] as const;

const linkVivo = (parcial: Partial<LinhaLink> = {}): LinhaLink => ({
  id: SINTETICO.jti,
  admissaoId: SINTETICO.admissaoId,
  expiraEm: new Date(Date.now() + 70 * HORA_MS),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
  ...parcial,
});

/**
 * Banco de mentirinha. Cadeia encadeável e awaitável, que responde pela PROJEÇÃO pedida, no molde
 * dos vizinhos deste diretório.
 *
 * ┌─ ELE APLICA O `update`, E ESSE É O CONSERTO DE MÉTODO DA QUARTA RODADA ────────────────────┐
 * │ Antes, o dublê REGISTRAVA a escrita e nunca a APLICAVA: a linha devolvida pela leitura era │
 * │ sempre a mesma, tentativa após tentativa. Com isso a pergunta que pegou as quatro rodadas  │
 * │ ("o estado ESCRITO muda a decisão SEGUINTE?") era literalmente INENUNCIÁVEL em teste, e a  │
 * │ auto-renovação da suspensão (cada tentativa regravando `+24h` em cima da suspensão que a   │
 * │ anterior gravou) era inobservável POR CONSTRUÇÃO, não por descuido de quem escreveu o      │
 * │ teste. O auditor só a viu porque usou um banco MUTÁVEL.                                     │
 * │                                                                                             │
 * │ Agora a linha é MUTÁVEL: o `set` do `update` é aplicado nas colunas de estado, e a leitura │
 * │ seguinte enxerga o novo estado, como no Postgres.                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function banco(cenario: { link?: LinhaLink | null } = {}) {
  const atualizacoes: Record<string, unknown>[] = [];
  // A LINHA VIVE AQUI, e é ela que o `update` muda.
  let linha: LinhaLink | null = cenario.link === undefined ? linkVivo() : cenario.link;
  const insercoes: Record<string, unknown>[] = [];
  const travas: string[] = [];
  const ordem: string[] = [];

  const strings = (valor: unknown, saida: string[] = [], nivel = 0, vistos = new WeakSet<object>()) => {
    if (nivel > 8 || valor == null) return saida;
    if (typeof valor === "string") return void saida.push(valor), saida;
    if (typeof valor !== "object") return saida;
    if (vistos.has(valor as object)) return saida;
    vistos.add(valor as object);
    for (const v of Object.values(valor as Record<string, unknown>)) strings(v, saida, nivel + 1, vistos);
    return saida;
  };

  const linhasPara = (proj?: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {}).join(",").toLowerCase();
    if (chaves.includes("suspensoate") || chaves.includes("revogadoem")) {
      // CÓPIA, para que quem leu não segure uma referência que muda por baixo.
      return linha ? [{ ...linha }] : [];
    }
    if (chaves.includes("datanascimento")) {
      return [{ cpf: SINTETICO.cpf, dataNascimento: SINTETICO.dataNascimento }];
    }
    return [{ id: SINTETICO.admissaoId }];
  };

  const cadeia = (linhas: unknown[], registro?: (args: unknown[]) => void): Cadeia =>
    new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(linhas).then(ok, erro);
          }
          return (...args: unknown[]) => {
            registro?.(args);
            return cadeia(linhas, registro);
          };
        },
      },
    ) as unknown as Cadeia;

  const escrita = (destino: Record<string, unknown>[], rotulo: string, chave: "set" | "values") =>
    cadeia([{ id: "linha-1" }], (args) => {
      const primeiro = args[0];
      if (primeiro && typeof primeiro === "object" && !Array.isArray(primeiro)) {
        // A cadeia inteira passa por aqui (`set`, `where`, `returning`), e só a primeira chamada
        // com objeto é o payload. O rótulo é registrado uma vez, com ele.
        if (!destino.includes(primeiro as Record<string, unknown>)) {
          const valores = primeiro as Record<string, unknown>;
          const ehPayload = chave === "set" ? "suspensoAte" in valores || "revogadoEm" in valores : "id" in valores;
          if (ehPayload) {
            destino.push(valores);
            ordem.push(rotulo);
          }
          // E AGORA ELA É APLICADA (ver o bloco de `banco`). Só as colunas de ESTADO, que são as
          // que decidem se o link está vivo; o carimbo de acesso não muda decisão nenhuma.
          if (chave === "set" && linha) {
            for (const col of COLUNAS_DE_ESTADO) {
              if (col in valores) linha = { ...linha, [col]: valores[col] as Date | null };
            }
          }
        }
      }
      return undefined;
    });

  const db: Record<string, unknown> = {
    select: (proj?: Record<string, unknown>) => cadeia(linhasPara(proj)),
    update: () => escrita(atualizacoes, "update", "set"),
    insert: () => escrita(insercoes, "insert", "values"),
    execute: async (consulta: unknown) => {
      const texto = strings(consulta).join(" ");
      if (texto.includes("advisory")) {
        travas.push(texto);
        ordem.push("trava");
      }
      return [];
    },
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);

  // A LINHA DE AGORA, para as asserções que precisam olhar o ESTADO e não só as escritas.
  return { db: db as never, atualizacoes, insercoes, travas, ordem, estado: () => linha };
}

/**
 * LIMITADOR de mentirinha, no formato do `ThrottlerStorage`. `bloqueado` liga o estouro do balde;
 * `estouros` conta separadamente o balde longo da escalada, que é o que decide a suspensão.
 */
function limitador(bloqueado = false) {
  const chamadas: { chave: string; nome: string }[] = [];
  let doEstouro = 0;
  const increment = vi.fn(
    async (chave: string, ttl: number, _limite: number, bloqueio: number, nome: string) => {
      chamadas.push({ chave, nome });
      const ehEscalada = nome === "portal-ident-estouros";
      if (ehEscalada) doEstouro += 1;
      return {
        totalHits: ehEscalada ? doEstouro : 1,
        timeToExpire: ttl,
        isBlocked: ehEscalada ? false : bloqueado,
        timeToBlockExpire: bloqueio,
      };
    },
  );
  return { storage: { increment } as never, chamadas, increment };
}

const config = (extra: Record<string, string> = {}) =>
  ({
    get: (chave: string) => {
      if (/PRIVATE_KEY/.test(chave)) return NOSSO.b64;
      if (chave === "PORTAL_LOG_PEPPER") return "pepper-sintetico";
      return extra[chave];
    },
  }) as never;

function servico(
  b: ReturnType<typeof banco>,
  lim = limitador(),
  extraConfig: Record<string, string> = {},
) {
  const registrar = vi.fn(async () => {});
  const trilha = { configurada: () => true, registrar } as never;
  const s = new PortalIdentidadeService(b.db, config(extraConfig), trilha, lim.storage);
  return { s, registrar, lim };
}

const pedido = (linkToken: string) => ({
  linkToken,
  cpf: SINTETICO.cpf,
  dataNascimento: SINTETICO.dataNascimento,
  ip: SINTETICO.ip,
});

const eventos = (registrar: ReturnType<typeof vi.fn>) =>
  registrar.mock.calls.map((c) => (c as unknown as [string])[0]);

// ══ VETO 1 ════════════════════════════════════════════════════════════════════════════════════

describe("A SUSPENSÃO DO LINK NUNCA NASCE DE UM `jti` NÃO VERIFICADO", () => {
  it("15 requisições com `jti` válido e bilhete FORJADO não suspendem o link", async () => {
    // O ataque que isto fecha: quem conhece um `jti` (link encaminhado, print, aba aberta de outra
    // pessoa) derrubava aquele link por 24 horas com requisições de lixo, sem nunca ter tido um
    // token válido. O balde estoura a cada pedido, e mesmo assim nada é escalado e nada é escrito.
    const b = banco();
    const { s, registrar, lim } = servico(b, limitador(true));
    const forjado = token(DO_FORJADOR.privateKey);

    for (let i = 0; i < 15; i += 1) {
      await expect(s.identificar(pedido(forjado))).rejects.toThrow();
    }

    expect(b.atualizacoes).toEqual([]);
    expect(eventos(registrar)).not.toContain("PORTAL_LINK_SUSPENSO");
    // A ESCALADA SEQUER É TOCADA: o balde longo só conta estouro de bilhete nosso.
    expect(lim.chamadas.some((c) => c.nome === "portal-ident-estouros")).toBe(false);
  });

  it("o desfecho do bilhete forjado é LINK MORTO, com o balde estourado ou não", async () => {
    // Não é oráculo novo: é a mesma resposta que ele já recebia na primeira tentativa.
    const comBalde = servico(banco(), limitador(true));
    const semBalde = servico(banco(), limitador(false));
    const forjado = token(DO_FORJADOR.privateKey);

    const a = await comBalde.s.identificar(pedido(forjado)).catch((e: Error) => e.message);
    const c = await semBalde.s.identificar(pedido(forjado)).catch((e: Error) => e.message);

    expect(a).toBe(c);
  });

  it("o balde PRÉ-ASSINATURA não é mais escolhido pelo `jti` declarado (achado S37)", async () => {
    // ANTES: a chave era `portal-ident:link:${jti declarado}`, e era o estouro DELA que abria a
    // escalada. Contar ali já era DECIDIR pelo valor declarado. Agora o lixo cai no balde do HASH
    // DO TOKEN, que quem só conhece o `jti` da vítima não consegue escolher.
    const { s, lim } = servico(banco(), limitador(false));
    await s.identificar(pedido(token(DO_FORJADOR.privateKey))).catch(() => undefined);

    expect(lim.chamadas.some((c) => c.chave.includes(SINTETICO.jti))).toBe(false);
    expect(lim.chamadas.map((c) => c.nome)).toEqual(["portal-ident-token"]);
    // §A.6: o token é credencial, e não vira chave do armazenamento do limitador.
    expect(lim.chamadas.some((c) => c.chave.includes(token(DO_FORJADOR.privateKey)))).toBe(false);
  });

  it("nenhum `update` do portal é decidido por valor lido sem assinatura", () => {
    // A trava de tipo: `bloquear` recebe `jti: string` (nunca `string | null`), e os dois
    // chamadores passam `bilhete.jti`. Um terceiro chamador futuro não consegue entregar aqui o
    // valor declarado sem que o compilador reclame.
    expect(ARQUIVO_SERVICO).not.toMatch(/bloquear\(\s*jtiDeclarado/);
    expect(ARQUIVO_SERVICO).toMatch(/private async bloquear\(\s*\n?\s*jti: string,/);
  });

  it("a trava estrutural: o balde por LINK só existe com o `jti` do BILHETE", () => {
    // O defeito voltaria como uma linha só, trocando a chave do balde de cima. A régua fica
    // pinada: o balde por link é `bilhete.jti`, e o pré-assinatura é o hash do token.
    expect(ARQUIVO_SERVICO).toContain("`portal-ident:link:${bilhete.jti}`");
    expect(ARQUIVO_SERVICO).toContain("`portal-ident:token:${this.hash(entrada.linkToken)}`");
    expect(ARQUIVO_SERVICO).not.toMatch(/portal-ident:link:\$\{jtiDeclarado/);
  });
});

describe("A ESCALADA CONTINUA EXISTINDO, com bilhete NOSSO E CREDENCIAL ERRADA", () => {
  /**
   * OS DOIS TESTES DESTE BLOCO PASSARAM A USAR CREDENCIAL ERRADA, e não é conveniência de
   * fixture: é o conserto da TERCEIRA rodada da família S37. A escalada existe para punir QUEM
   * ADIVINHA, e antes ela era calculada ANTES do casamento, então punia igual quem já sabia a
   * resposta. Era exatamente por aí que a vítima de um ataque ao balde global do CPF dela (a que
   * mais insiste, porque a credencial dela está certa) terminava com o PRÓPRIO link suspenso por
   * 24 horas. Escrito com a credencial CERTA, este teste travava o defeito, não a proteção.
   *
   * A metade oposta (credencial certa NÃO escala) está no `describe` logo abaixo.
   */
  it("o terceiro estouro suspende a linha do link de quem erra os dados", async () => {
    const b = banco();
    const { s, registrar } = servico(b, limitador(true));
    const nosso = token(NOSSO.privateKey);

    for (let i = 0; i < 3; i += 1) {
      // Data de nascimento errada: é o chute que a escalada existe para barrar.
      await expect(
        s.identificar({ ...pedido(nosso), dataNascimento: "1970-01-01" }),
      ).rejects.toThrow();
    }

    expect(b.atualizacoes).toHaveLength(1);
    expect(b.atualizacoes[0].suspensoAte).toBeInstanceOf(Date);
    expect(eventos(registrar)).toContain("PORTAL_LINK_SUSPENSO");
  });

  it("os dois primeiros estouros recusam sem suspender nada", async () => {
    const b = banco();
    const { s } = servico(b, limitador(true));
    const nosso = token(NOSSO.privateKey);

    for (let i = 0; i < 2; i += 1) {
      await expect(
        s.identificar({ ...pedido(nosso), dataNascimento: "1970-01-01" }),
      ).rejects.toThrow();
    }

    expect(b.atualizacoes).toEqual([]);
  });
});

// ══ A TERCEIRA RODADA: A ESCALADA NÃO ALCANÇA QUEM ACERTA A CREDENCIAL ════════════════════════

describe("QUEM JÁ SABE A RESPOSTA NÃO É PUNIDO PELA ESCALADA", () => {
  it("30 tentativas com CPF e data CORRETOS, balde estourado, e NADA é escrito na linha", async () => {
    // O `limitador(true)` devolve `isBlocked` em TODO balde, que é o pior caso: a vítima colhe 429
    // em todas as tentativas. Antes, cada uma dessas reentrava na escalada e a terceira gravava
    // `suspenso_ate = +24h` no link dela. Trinta voltas para deixar claro que não é questão de
    // contagem: não há por onde a escrita nascer.
    const b = banco();
    const { s, registrar } = servico(b, limitador(true));
    const nosso = token(NOSSO.privateKey);

    for (let i = 0; i < 30; i += 1) {
      const erro = await s.identificar(pedido(nosso)).catch((e: unknown) => e);
      expect((erro as { getStatus: () => number }).getStatus()).toBe(429);
    }

    expect(b.atualizacoes).toEqual([]);
    expect(eventos(registrar)).not.toContain("PORTAL_LINK_SUSPENSO");
  });

  it("a escalada NEM É TOCADA: sem entrada no balde longo, não há terceiro estouro", async () => {
    const { s, lim } = servico(banco(), limitador(true));

    await s.identificar(pedido(token(NOSSO.privateKey))).catch(() => undefined);

    expect(lim.chamadas.some((c) => c.nome === "portal-ident-estouros")).toBe(false);
  });

  it("a RESPOSTA é indistinguível entre acertar e errar a credencial, e isso é inegociável", async () => {
    // A diferença nova vive SÓ dentro da trilha. Fosse visível de fora, o 429 viraria o oráculo
    // "esta é a data certa", que é pior do que o dano que o conserto fecha.
    const certo = servico(banco(), limitador(true));
    const errado = servico(banco(), limitador(true));
    const nosso = token(NOSSO.privateKey);

    const a = await certo.s.identificar(pedido(nosso)).catch((e: unknown) => e);
    const c = await errado.s
      .identificar({ ...pedido(nosso), dataNascimento: "1970-01-01" })
      .catch((e: unknown) => e);

    const retrato = (e: unknown) => ({
      status: (e as { getStatus: () => number }).getStatus(),
      corpo: (e as { getResponse: () => unknown }).getResponse(),
      mensagem: (e as Error).message,
    });
    expect(retrato(a)).toEqual(retrato(c));
    expect(retrato(a).status).toBe(429);
  });

  it("a trava estrutural: a escalada consulta o casamento ANTES de decidir", () => {
    // O defeito volta como uma linha trocada. A régua fica pinada no texto, como as das rodadas
    // anteriores: quem escala é o ramo do token/link, e ele pergunta antes.
    expect(ARQUIVO_SERVICO).toContain(
      "{ escalar: await this.escaladaDevida(bilhete, agoraMs, entrada), balde: \"TOKEN_OU_LINK\" }",
    );
    // E A INVARIANTE NÃO VOLTA A SER UM `if` SOLTO: `!credencialCorreta` não existe mais no ponto
    // de decisão, e a condição inteira tem UM dono, que diz as duas metades.
    expect(ARQUIVO_SERVICO).not.toMatch(/escalar: !credencialCorreta/);
    expect(ARQUIVO_SERVICO).toMatch(/private async escaladaDevida\(/);
    // E a régua do casamento é UMA SÓ, compartilhada com o bloco (f).
    expect(ARQUIVO_SERVICO.match(/casamentoDaIdentificacao\(/g) ?? []).toHaveLength(3);
  });
});

// ══ A QUARTA RODADA: ESCALAR UM LINK JÁ MORTO É O DANO, E NÃO A PROTEÇÃO ═════════════════════

/**
 * O QUE ESTE BLOCO TRAVA, e por que ele SÓ AGORA É POSSÍVEL.
 *
 * A invariante escrita em `escaladaDevida` tem duas metades: **escala só com link VIVO e
 * credencial ERRADA**. A régua anterior era só a segunda, e "link morto" a satisfazia por
 * acidente, porque `estadoDaLinha` colapsa suspenso e bloqueado dentro de expirado. Resultado
 * medido pelo auditor com banco MUTÁVEL: 24 tentativas com credencial CORRETA davam 13 escritas
 * novas sobre linha suspensa, 13 sobre linha BLOQUEADA À MÃO (com `suspensoAte` NASCENDO ali) e
 * 13 sobre linha revogada. A suspensão que a escalada acabava de escrever matava o link, o link
 * morto reabria a escalada, e a escalada regravava `+24h`. Auto-renovação.
 *
 * NENHUM TESTE DA CASA CONSEGUIA VER ISSO: os dublês registravam o `update` e nunca o aplicavam,
 * então a linha nunca mudava de estado e a pergunta "o estado escrito muda a decisão seguinte?"
 * não tinha como ser feita. O dublê deste arquivo passou a APLICAR (ver o bloco de `banco`), e é
 * isso que torna as asserções abaixo possíveis.
 */
describe("ESCALAR CONTRA UM LINK JÁ MORTO: NENHUMA ESCRITA NOVA, EM NENHUM DOS TRÊS ESTADOS", () => {
  const MORTAS = [
    ["suspensa", { suspensoAte: new Date(Date.now() + 2 * HORA_MS) }],
    ["bloqueada à mão", { bloqueadoEm: new Date(Date.now() - 60_000) }],
    ["revogada", { revogadoEm: new Date(Date.now() - 60_000) }],
  ] as const;

  for (const [rotulo, morta] of MORTAS) {
    it(`24 tentativas com credencial CORRETA contra linha ${rotulo}: ZERO escritas`, async () => {
      // A LINHA DE PARTIDA É CAPTURADA, e a comparação do fim é contra ELA: `linkVivo()` calcula
      // `expiraEm` a partir do relógio, e reconstruí-la no fim compararia dois instantes.
      const partida = linkVivo({ ...morta });
      const b = banco({ link: { ...partida } });
      const { s, registrar, lim } = servico(b, limitador(true));
      const nosso = token(NOSSO.privateKey);

      for (let i = 0; i < 24; i += 1) {
        const erro = await s.identificar(pedido(nosso)).catch((e: unknown) => e);
        expect((erro as { getStatus: () => number }).getStatus()).toBe(429);
      }

      // O NÚMERO MEDIDO PELO AUDITOR ERA 13 EM CADA UM DOS TRÊS. Agora é zero.
      expect(b.atualizacoes).toEqual([]);
      expect(eventos(registrar)).not.toContain("PORTAL_LINK_SUSPENSO");
      // E a escalada não é nem TOCADA: não há balde longo enchendo para um terceiro estouro.
      expect(lim.chamadas.some((c) => c.nome === "portal-ident-estouros")).toBe(false);
      // A linha continua exatamente como estava: nada nasceu nela.
      expect(b.estado()).toEqual(partida);
    });
  }

  it("o BLOQUEIO MANUAL volta a acabar quando uma PESSOA decide, e não quando o candidato desiste", async () => {
    // O dano operacional, ponta a ponta: o time bloqueia o link à mão, o candidato insiste com CPF
    // e data CORRETOS, o RH clica em desbloquear. Antes, as tentativas dele tinham gravado uma
    // suspensão de 24 horas por baixo, e o desbloqueio não destravava nada: o bloqueio manual (que
    // o domínio declara SEM data de fim) passava a acabar quando o candidato desistia.
    const b = banco({ link: linkVivo({ bloqueadoEm: new Date(Date.now() - 60_000) }) });
    const { s } = servico(b, limitador(true));
    const nosso = token(NOSSO.privateKey);

    for (let i = 0; i < 24; i += 1) {
      await s.identificar(pedido(nosso)).catch(() => undefined);
    }

    expect(b.estado()?.suspensoAte).toBeNull();
    // O "desbloquear" do RH, que é o `update` da rota: só limpa `bloqueadoEm`.
    const destravada = { ...b.estado(), bloqueadoEm: null };
    expect(estadoDaLinha(destravada, Date.now()).vivo).toBe(true);
  });

  it("nem quem ERRA a credencial renova a própria suspensão: escalar link morto é no-op", async () => {
    // A metade oposta do mesmo defeito. O chutador alcança a suspensão no terceiro estouro (é a
    // proteção, e ela continua inteira), e a partir daí as tentativas dele param de REGRAVAR: a
    // suspensão vale 24 horas a contar de quando foi imposta, e não de quando ele desiste.
    const b = banco();
    const { s } = servico(b, limitador(true));
    const nosso = token(NOSSO.privateKey);

    for (let i = 0; i < 24; i += 1) {
      await s
        .identificar({ ...pedido(nosso), dataNascimento: "1970-01-01" })
        .catch(() => undefined);
    }

    // UMA escrita, a do terceiro estouro. Antes eram essa mais uma por tentativa seguinte.
    expect(b.atualizacoes).toHaveLength(1);
    expect(b.atualizacoes[0].suspensoAte).toBeInstanceOf(Date);
  });

  it("A METADE QUE NÃO PODE ENFRAQUECER: link VIVO e data varrida continua escalando até suspender", async () => {
    // A varredura de datas de nascimento, que é o ataque que a escalada existe para barrar. Link
    // vivo, credencial errada a cada volta, e a suspensão chega no terceiro estouro como sempre.
    const b = banco();
    const { s, registrar, lim } = servico(b, limitador(true));
    const nosso = token(NOSSO.privateKey);

    for (let i = 0; i < 3; i += 1) {
      await s
        .identificar({ ...pedido(nosso), dataNascimento: `19${70 + i}-03-04` })
        .catch(() => undefined);
    }

    expect(lim.chamadas.filter((c) => c.nome === "portal-ident-estouros")).toHaveLength(3);
    expect(b.atualizacoes).toHaveLength(1);
    expect(b.estado()?.suspensoAte).toBeInstanceOf(Date);
    expect(eventos(registrar)).toContain("PORTAL_LINK_SUSPENSO");
  });

  it("A CLASSE, e não só este caso: só UMA escrita anônima pode matar um link, e ela é esta", () => {
    // A pergunta que pegou as quatro rodadas: para toda escrita durável contra um link, QUEM
    // escolhe a chave e QUEM escolhe a condição? A varredura de `update(portalLinks)` dá oito
    // escritas. Seis têm chave escolhida por CONSULTOR AUTENTICADO (revogar na emissão, carimbo de
    // envio, revogar por admissão, revogar por `jti`, bloquear à mão, desbloquear) e não são
    // alcançáveis por quem só tem um link. Sobram duas no caminho anônimo, as duas chaveadas por
    // `bilhete.jti` (verificado, não declarado):
    //
    //   - A SUSPENSÃO, a única que muda o ESTADO do link, agora sob a invariante das duas metades.
    //   - O CARIMBO DE ACESSO, que só escreve `primeiroAcessoEm`/`ultimoAcessoEm`.
    //
    // ESTA ASSERÇÃO É A DO CARIMBO, e ela é o que impede a classe de renascer por outra porta: no
    // dia em que ele ganhar uma coluna de estado, passa a existir uma segunda escrita anônima
    // capaz de matar um link, e a invariante de cima deixa de cobrir tudo sozinha.
    const carimbo = ARQUIVO_SERVICO.slice(
      ARQUIVO_SERVICO.indexOf("private async carimbarAcesso"),
      ARQUIVO_SERVICO.indexOf("private async existeLinha"),
    );
    expect(carimbo).toContain("primeiroAcessoEm");
    for (const coluna of COLUNAS_DE_ESTADO) expect(carimbo).not.toContain(coluna);
    // E a suspensão continua sendo a ÚNICA escrita de `suspensoAte` no serviço.
    expect(ARQUIVO_SERVICO.match(/set\(\{ suspensoAte:/g) ?? []).toHaveLength(1);
  });

  it("a RESPOSTA ao candidato não mudou: link morto e link vivo continuam indistinguíveis", async () => {
    // A condição inegociável, verificada pela quarta vez. O conserto vive na decisão de ESCALAR, e
    // não na mensagem: se a nova condição vazasse para fora, teria trocado um dano por um oráculo.
    const nosso = token(NOSSO.privateKey);
    const retrato = (e: unknown) => ({
      status: (e as { getStatus: () => number }).getStatus(),
      corpo: (e as { getResponse: () => unknown }).getResponse(),
      mensagem: (e as Error).message,
    });

    const vivos = servico(banco(), limitador(true));
    const suspensos = servico(
      banco({ link: linkVivo({ suspensoAte: new Date(Date.now() + 2 * HORA_MS) }) }),
      limitador(true),
    );
    const bloqueados = servico(
      banco({ link: linkVivo({ bloqueadoEm: new Date(Date.now() - 60_000) }) }),
      limitador(true),
    );

    const a = await vivos.s.identificar(pedido(nosso)).catch((e: unknown) => e);
    const c = await suspensos.s.identificar(pedido(nosso)).catch((e: unknown) => e);
    const d = await bloqueados.s.identificar(pedido(nosso)).catch((e: unknown) => e);

    expect(retrato(c)).toEqual(retrato(a));
    expect(retrato(d)).toEqual(retrato(a));
    expect(retrato(a).status).toBe(429);
  });
});

// ══ A LINHA E O BILHETE FALAM DA MESMA ADMISSÃO ═══════════════════════════════════════════════

describe("A LINHA DO LINK TEM DE SER DA ADMISSÃO DO BILHETE", () => {
  it("divergiu, é link morto: nenhuma sessão nasce", async () => {
    const b = banco({ link: linkVivo({ admissaoId: SINTETICO.outraAdmissaoId }) });
    const { s, registrar } = servico(b);

    await expect(s.identificar(pedido(token(NOSSO.privateKey)))).rejects.toThrow();

    expect(eventos(registrar)).toContain("PORTAL_LINK_RECUSADO");
    expect(eventos(registrar)).not.toContain("PORTAL_SESSAO_EMITIDA");
  });

  it("casando, a sessão nasce normalmente, que é o caso de todo dia", async () => {
    const { s } = servico(banco());
    const r = await s.identificar(pedido(token(NOSSO.privateKey)));
    expect(typeof r.sessao).toBe("string");
  });
});

// ══ A EMISSÃO ═════════════════════════════════════════════════════════════════════════════════

describe("EMITIR DUAS VEZES AO MESMO TEMPO NÃO DEIXA DOIS LINKS VIVOS", () => {
  it("a emissão toma a trava de admissão ANTES de revogar e inserir", async () => {
    const b = banco();
    const { s } = servico(b);

    await s.emitirLink(SINTETICO.admissaoId, SINTETICO.autorId);

    // A MESMA FAMÍLIA DA EMISSÃO DE CREDENCIAL: `pg_advisory_xact_lock`, no servidor Postgres, que
    // serializa duas INSTÂNCIAS do backend e não só duas requisições do mesmo processo.
    expect(b.travas).toHaveLength(1);
    expect(b.travas[0]).toContain("pg_advisory_xact_lock");
    expect(b.ordem[0]).toBe("trava");
    expect(b.ordem).toEqual(["trava", "update", "insert"]);
  });

  it("a chave da trava é a ADMISSÃO, porque é por admissão que a revogação varre", () => {
    expect(ARQUIVO_SERVICO).toMatch(/pg_advisory_xact_lock\(hashtextextended\(\$\{admissaoId\}, 0\)\)/);
  });
});

// ══ O VOCABULÁRIO DO FRAGMENTO ════════════════════════════════════════════════════════════════

describe("A URL USA A LETRA DO CONTRATO", () => {
  it("o fragmento sai com `PORTAL_FRAGMENTO_LINK`, e não com a letra escrita à mão", async () => {
    const { s } = servico(banco(), limitador(), { PORTAL_LINK_BASE_URL: "https://portal.exemplo/portal" });

    const { link } = await s.emitirLink(SINTETICO.admissaoId, SINTETICO.autorId);

    // Com a letra escrita nos dois lados à mão, o backend montou `#t=` enquanto a tela procurava
    // `#l=`, e o link NUNCA abria.
    expect(link).toContain(`#${PORTAL_FRAGMENTO_LINK}=`);
    const fragmento = link.split("#")[1] ?? "";
    expect(fragmento.startsWith(`${PORTAL_FRAGMENTO_LINK}=`)).toBe(true);
    expect(fragmento.slice(PORTAL_FRAGMENTO_LINK.length + 1).split(".")).toHaveLength(3);
  });
});


// ══ O ARNÊS ADVERSARIAL DO ACHADO S37 ═════════════════════════════════════════════════════════

/**
 * ┌─ POR QUE ESTE BLOCO EXISTE, e por que o limitador dele é DE VERDADE ────────────────────────┐
 * │ O `limitador()` de cima devolve o MESMO `isBlocked` para qualquer chave, então ele não       │
 * │ consegue nem enunciar a pergunta do S37, que é exatamente "o balde de QUEM foi enchido".     │
 * │ Aqui o balde é por CHAVE, com janela e bloqueio, no contrato do `ThrottlerStorage`.          │
 * │                                                                                              │
 * │ As duas provas que o auditor pediu, uma de cada lado da régua:                               │
 * │  1. o ataque PÁRA DE DERRUBAR A VÍTIMA: lixo com o `jti` dela não lhe custa nada;            │
 * │  2. a varredura legítima CONTINUA BARRADA: quem tem o link de verdade bate no teto e, na     │
 * │     insistência, colhe a suspensão de 24 horas, trocando de CPF a cada tentativa.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function limitadorDeVerdade() {
  const baldes = new Map<string, { hits: number; expira: number; bloqueadoAte: number }>();
  const chamadas: { chave: string; nome: string }[] = [];
  const increment = vi.fn(
    async (chave: string, ttl: number, limite: number, bloqueio: number, nome: string) => {
      chamadas.push({ chave, nome });
      const agora = Date.now();
      const atual = baldes.get(chave);
      // A janela vale enquanto não expirou OU enquanto o bloqueio dela está de pé, que é o que
      // faz a tentativa seguinte de quem já estourou continuar batendo no mesmo balde.
      const aindaVale = atual !== undefined && (atual.expira > agora || atual.bloqueadoAte > agora);
      const balde = aindaVale ? atual : { hits: 0, expira: agora + ttl, bloqueadoAte: 0 };
      balde.hits += 1;
      if (balde.hits > limite && balde.bloqueadoAte <= agora) balde.bloqueadoAte = agora + bloqueio;
      baldes.set(chave, balde);
      return {
        totalHits: balde.hits,
        timeToExpire: Math.max(0, balde.expira - agora),
        isBlocked: balde.bloqueadoAte > agora,
        timeToBlockExpire: Math.max(0, balde.bloqueadoAte - agora),
      };
    },
  );
  return { storage: { increment } as never, chamadas, increment };
}

/** O CPF muda a cada tentativa, que é a varredura que a escalada POR LINK existe para barrar. */
const cpfSintetico = (i: number) => String(10000000000 + i);

describe("S37: quem conhece um `jti` NÃO derruba o portal da vítima", () => {
  it("6 requisições de lixo com o `jti` da vítima, e a PRIMEIRA identificação dela passa", async () => {
    const b = banco();
    const { s, registrar } = servico(b, limitadorDeVerdade());
    // O atacante não tem o token: ele tem o `jti`, que é legível em base64 no link encaminhado.
    const lixo = token(DO_FORJADOR.privateKey);

    for (let i = 0; i < 6; i += 1) {
      await expect(s.identificar(pedido(lixo))).rejects.toThrow();
    }

    // Nada foi escrito pelo lixo, que é o que a rodada anterior já entregava.
    expect(b.atualizacoes).toEqual([]);
    expect(eventos(registrar)).not.toContain("PORTAL_LINK_SUSPENSO");

    // E AGORA O QUE FALTAVA: a vítima chega, com o token verdadeiro e o CPF certo, e ENTRA.
    const sessao = await s.identificar(pedido(token(NOSSO.privateKey)));
    expect(typeof sessao.sessao).toBe("string");
    expect(eventos(registrar)).toContain("PORTAL_SESSAO_EMITIDA");
  });

  it("nem insistindo: três tentativas legítimas seguidas não suspendem o link da vítima", async () => {
    // O dano medido pelo auditor não era o 429 da primeira: era a vítima reentrar na escalada a
    // cada retentativa e, na terceira, colher `suspenso_ate = +24h` no próprio nome.
    const b = banco();
    const { s, registrar } = servico(b, limitadorDeVerdade());

    for (let i = 0; i < 6; i += 1) {
      await expect(s.identificar(pedido(token(DO_FORJADOR.privateKey)))).rejects.toThrow();
    }
    for (let i = 0; i < 3; i += 1) {
      await expect(s.identificar(pedido(token(NOSSO.privateKey)))).resolves.toBeTruthy();
    }

    expect(b.atualizacoes.some((u) => "suspensoAte" in u)).toBe(false);
    expect(eventos(registrar)).not.toContain("PORTAL_IDENTIFICACAO_BLOQUEADA");
  });

  it("lixo VARIADO com o mesmo `jti` também não toca o balde da vítima", async () => {
    // Trocar o token a cada tentativa dá um balde novo por tentativa, e é isso que se quer: o
    // custo do lixo recai sobre quem o manda, nunca sobre o `jti` que ele citou.
    const b = banco();
    const { s, lim } = servico(b, limitadorDeVerdade());

    for (let i = 0; i < 6; i += 1) {
      const outro = par();
      await expect(s.identificar(pedido(token(outro.privateKey)))).rejects.toThrow();
    }

    expect(lim.chamadas.some((c) => c.chave.includes(SINTETICO.jti))).toBe(false);
    const sessao = await s.identificar(pedido(token(NOSSO.privateKey)));
    expect(typeof sessao.sessao).toBe("string");
  });
});

describe("S37: e a varredura legítima CONTINUA BARRADA, que é a metade que não podia enfraquecer", () => {
  it("quem tem o link varre CPFs, bate no teto de 5 e é recusado com 429", async () => {
    const b = banco();
    const { s } = servico(b, limitadorDeVerdade());
    const bom = token(NOSSO.privateKey);

    for (let i = 0; i < 5; i += 1) {
      const erro = await s
        .identificar({ ...pedido(bom), cpf: cpfSintetico(i) })
        .catch((e: { getStatus?: () => number }) => e);
      expect((erro as { getStatus: () => number }).getStatus()).toBe(401);
    }

    const sexta = await s
      .identificar({ ...pedido(bom), cpf: cpfSintetico(99) })
      .catch((e: { getStatus?: () => number }) => e);
    expect((sexta as { getStatus: () => number }).getStatus()).toBe(429);
  });

  it("insistindo, o TERCEIRO estouro suspende a linha do link, com o `jti` do BILHETE", async () => {
    const b = banco();
    const { s, registrar } = servico(b, limitadorDeVerdade());
    const bom = token(NOSSO.privateKey);

    // 5 passam pelo casamento e falham; da 6a em diante o balde por LINK está estourado, e cada
    // recusa reentra na escalada. Na terceira, a suspensão.
    for (let i = 0; i < 8; i += 1) {
      await expect(s.identificar({ ...pedido(bom), cpf: cpfSintetico(i) })).rejects.toThrow();
    }

    const suspensoes = b.atualizacoes.filter((u) => "suspensoAte" in u);
    expect(suspensoes).toHaveLength(1);
    expect(suspensoes[0].suspensoAte).toBeInstanceOf(Date);
    expect(eventos(registrar)).toContain("PORTAL_LINK_SUSPENSO");
  });
});
