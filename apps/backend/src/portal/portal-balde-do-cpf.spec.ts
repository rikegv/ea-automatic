import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PORTAL_MOTIVOS } from "../domain/portal-evento";
import { cunharLink, PORTAL_LINK_TTL_HORAS } from "../domain/portal-identidade";
import { PortalIdentidadeService } from "./portal-identidade.service";

/**
 * ══ O BALDE DO CPF NÃO PODE TRANCAR O LINK DE QUEM NÃO ERROU NADA ═════════════════════════════
 *
 * A FAMÍLIA DO S37, PELA SEGUNDA PORTA. A rodada anterior tirou a escalada do `jti` declarado
 * (balde do token) e fechou o ataque de quem não tem link NENHUM. Sobrava esta: o balde do CPF é
 * escolhido por CAMPO DE FORMULÁRIO, e o gate `if (vivo)` exige UM link vivo, não O link da
 * vítima. Um atacante com link PRÓPRIO e legítimo (todo candidato da esteira tem um), sabendo SÓ o
 * CPF da vítima, enchia o balde dela e a vítima colhia o 429 e, insistindo, `suspenso_ate = +24h`
 * gravado no link DELA, com o bloqueio atribuído ao nome dela.
 *
 * A RÉGUA ESCOLHIDA (opção (a) do auditor): o estouro do CPF RECUSA e NÃO alimenta a escalada. A
 * outra saída, chavear o balde por `(jti, cpf)`, foi recusada e o motivo está medido no teste
 * "A PROTEÇÃO QUE O BALDE DO CPF EXISTE PARA DAR" logo abaixo: os dois baldes respondem a ataques
 * diferentes, e estreitar o do CPF daria 5 chutes de data de nascimento POR LINK contra a mesma
 * pessoa.
 *
 * AS DUAS PONTAS, uma em cada `describe`:
 *  1. o ataque descrito DEIXA de gravar `suspensoAte` na vítima (e nem toca o balde da escalada);
 *  2. a proteção do balde global por CPF CONTINUA EXISTINDO: quem tem MUITOS links e tenta UM CPF
 *     conhecido bate no teto na sexta tentativa, mesmo trocando de link a cada vez.
 *
 * O ARMAZÉM É O DE VERDADE (por chave, com janela e bloqueio, no contrato do `ThrottlerStorage`),
 * porque um limitador que devolve o mesmo `isBlocked` para qualquer chave não consegue nem enunciar
 * a pergunta, que é "o balde de QUEM foi enchido".
 *
 * §A.6: fixtures sintéticos, CPFs de teste que não pertencem a ninguém, nenhum token em asserção.
 */

const HORA_MS = 3_600_000;

const VITIMA = {
  admissaoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  jti: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  cpf: "00000000191",
  dataNascimento: "1990-01-01",
};

const ATACANTE = {
  admissaoId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  jti: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  cpf: "11111111111",
  dataNascimento: "1980-02-02",
};

const ARQUIVO_SERVICO = readFileSync(join(__dirname, "portal-identidade.service.ts"), "utf8");

function par() {
  const { privateKey } = generateKeyPairSync("ed25519");
  const b64 = Buffer.from(
    privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  ).toString("base64");
  return { privateKey, b64 };
}

const NOSSO = par();

function token(dados: { admissaoId: string; jti: string }, chave: KeyObject = NOSSO.privateKey) {
  return cunharLink(
    { admissaoId: dados.admissaoId, jti: dados.jti, agoraMs: Date.now(), ttlHoras: PORTAL_LINK_TTL_HORAS },
    chave,
  );
}

type Cadeia = PromiseLike<unknown[]> & Record<string, unknown>;

interface LinhaLink {
  id: string;
  admissaoId: string;
  expiraEm: Date | null;
  revogadoEm: Date | null;
  suspensoAte: Date | null;
  bloqueadoEm: Date | null;
}

const linkVivo = (id: string, admissaoId: string): LinhaLink => ({
  id,
  admissaoId,
  expiraEm: new Date(Date.now() + 70 * HORA_MS),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
});

/** Todas as strings de uma árvore de argumentos, que é como se acha o valor do `where`. */
function strings(valor: unknown, saida: string[] = [], nivel = 0, vistos = new WeakSet<object>()) {
  if (nivel > 10 || valor == null) return saida;
  if (typeof valor === "string") return void saida.push(valor), saida;
  if (typeof valor !== "object") return saida;
  if (vistos.has(valor as object)) return saida;
  vistos.add(valor as object);
  for (const v of Object.values(valor as Record<string, unknown>)) strings(v, saida, nivel + 1, vistos);
  return saida;
}

/**
 * BANCO DE MENTIRINHA COM DOIS LINKS E DOIS CANDIDATOS, e a diferença para o vizinho
 * (`portal-suspensao-verificada.spec.ts`) é o ponto deste arquivo: aqui a linha devolvida DEPENDE
 * do `jti` procurado, porque o ataque tem duas admissões e o dano é medido na linha de UMA delas.
 *
 * A resolução é preguiçosa (no `then`), porque o `where` só chega depois do `select`.
 */
function banco(links: LinhaLink[], pessoas: Record<string, { cpf: string; dataNascimento: string }>) {
  const atualizacoes: { set: Record<string, unknown>; alvos: string[] }[] = [];

  const cadeia = (resolver: () => unknown[], capturar: (args: unknown[]) => void): Cadeia =>
    new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(resolver()).then(ok, erro);
          }
          return (...args: unknown[]) => {
            capturar(args);
            return cadeia(resolver, capturar);
          };
        },
      },
    ) as unknown as Cadeia;

  const db: Record<string, unknown> = {
    select: (proj?: Record<string, unknown>) => {
      const vistos: string[] = [];
      const chaves = Object.keys(proj ?? {}).join(",").toLowerCase();
      return cadeia(
        () => {
          if (chaves.includes("suspensoate") || chaves.includes("revogadoem")) {
            const achado = links.find((l) => vistos.includes(l.id));
            return achado ? [achado] : [];
          }
          if (chaves.includes("datanascimento")) {
            const admissaoId = Object.keys(pessoas).find((id) => vistos.includes(id));
            return admissaoId ? [pessoas[admissaoId]] : [];
          }
          return [{ id: vistos[0] ?? null }];
        },
        (args) => strings(args, vistos),
      );
    },
    update: () => {
      const registro: { set: Record<string, unknown> | null; alvos: string[] } = { set: null, alvos: [] };
      return cadeia(
        () => [{ id: "linha-1" }],
        (args) => {
          const primeiro = args[0];
          if (
            registro.set === null &&
            primeiro &&
            typeof primeiro === "object" &&
            !Array.isArray(primeiro) &&
            ("suspensoAte" in primeiro || "ultimoAcessoEm" in primeiro || "revogadoEm" in primeiro)
          ) {
            registro.set = primeiro as Record<string, unknown>;
            atualizacoes.push(registro as { set: Record<string, unknown>; alvos: string[] });
          }
          strings(args, registro.alvos);
          // O `update` É APLICADO, e não só registrado (o conserto de método da quarta rodada da
          // família S37, gêmeo do de `portal-suspensao-verificada.spec.ts`). Sem isto a linha
          // nunca muda de estado, e a pergunta "o estado ESCRITO muda a decisão SEGUINTE?" é
          // inenunciável: foi assim que a auto-renovação da suspensão passou por quatro rodadas.
          if (registro.set) {
            const alvo = links.find((l) => registro.alvos.includes(l.id));
            if (alvo) {
              for (const col of ["expiraEm", "revogadoEm", "suspensoAte", "bloqueadoEm"] as const) {
                if (col in registro.set) alvo[col] = registro.set[col] as Date | null;
              }
            }
          }
        },
      );
    },
    execute: async () => [],
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);

  return { db: db as never, atualizacoes };
}

/** O limitador de verdade: por chave, com janela e bloqueio. */
function limitador() {
  const baldes = new Map<string, { hits: number; expira: number; bloqueadoAte: number }>();
  const chamadas: { chave: string; nome: string }[] = [];
  const increment = vi.fn(
    async (chave: string, ttl: number, limite: number, bloqueio: number, nome: string) => {
      chamadas.push({ chave, nome });
      const agora = Date.now();
      const atual = baldes.get(chave);
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
  return { storage: { increment } as never, chamadas };
}

const config = () =>
  ({
    get: (chave: string) => {
      if (/PRIVATE_KEY/.test(chave)) return NOSSO.b64;
      if (chave === "PORTAL_LOG_PEPPER") return "pepper-sintetico";
      return undefined;
    },
  }) as never;

function servico(b: ReturnType<typeof banco>, lim = limitador()) {
  const registrar = vi.fn(async () => {});
  const trilha = { configurada: () => true, registrar } as never;
  const s = new PortalIdentidadeService(b.db, config(), trilha, lim.storage);
  return { s, registrar, lim };
}

const eventos = (registrar: ReturnType<typeof vi.fn>) =>
  registrar.mock.calls.map((c) => (c as unknown as [string])[0]);

const status = (erro: unknown) => (erro as { getStatus?: () => number }).getStatus?.() ?? 0;

/** O cenário do ataque: dois links vivos, duas admissões, duas pessoas. */
function cenarioDeDoisLinks() {
  return banco(
    [linkVivo(VITIMA.jti, VITIMA.admissaoId), linkVivo(ATACANTE.jti, ATACANTE.admissaoId)],
    {
      [VITIMA.admissaoId]: { cpf: VITIMA.cpf, dataNascimento: VITIMA.dataNascimento },
      [ATACANTE.admissaoId]: { cpf: ATACANTE.cpf, dataNascimento: ATACANTE.dataNascimento },
    },
  );
}

// ══ PONTA 1: O ATAQUE MORRE ═══════════════════════════════════════════════════════════════════

describe("UM LINK PRÓPRIO E O CPF DA VÍTIMA NÃO TRANCAM O LINK DELA", () => {
  it("o cenário do auditor: 5 requisições do atacante, e a vítima NÃO colhe `suspensoAte`", async () => {
    const b = cenarioDeDoisLinks();
    const { s, registrar, lim } = servico(b);

    // O atacante usa o LINK DELE, que é legítimo, e o CPF DA VÍTIMA, que ele conhece. Ele não tem
    // o link dela nem a data de nascimento dela. Cinco tentativas: o balde POR LINK dele ainda não
    // estourou (o teto é 5), e o balde do CPF DELA fica na borda.
    const doAtacante = token({ admissaoId: ATACANTE.admissaoId, jti: ATACANTE.jti });
    for (let i = 0; i < 5; i += 1) {
      const erro = await s
        .identificar({ linkToken: doAtacante, cpf: VITIMA.cpf, dataNascimento: "1970-01-01" })
        .catch((e: unknown) => e);
      // Ele ouve "não casou", que é a resposta de sempre. Nada de 429 ainda.
      expect(status(erro)).toBe(401);
    }

    // A VÍTIMA CHEGA, com o link dela, o CPF certo e a data certa, e insiste três vezes.
    const dela = token({ admissaoId: VITIMA.admissaoId, jti: VITIMA.jti });
    for (let i = 0; i < 3; i += 1) {
      const erro = await s
        .identificar({ linkToken: dela, cpf: VITIMA.cpf, dataNascimento: VITIMA.dataNascimento })
        .catch((e: unknown) => e);
      // O 429 temporário CONTINUA acontecendo, e é o residual declarado: ele passa sozinho em 15
      // minutos. O que não pode acontecer é a escrita durável.
      expect(status(erro)).toBe(429);
    }

    // ── O DANO QUE ESTA RODADA FECHA ──────────────────────────────────────────────────────────
    expect(b.atualizacoes.filter((u) => "suspensoAte" in u.set)).toEqual([]);
    expect(eventos(registrar)).not.toContain("PORTAL_LINK_SUSPENSO");
    // A ESCALADA SEQUER É TOCADA pelo balde do CPF: sem entrada, não há terceiro estouro.
    expect(lim.chamadas.some((c) => c.nome === "portal-ident-estouros")).toBe(false);
  });

  it("nem repetindo o ciclo: 30 tentativas do atacante não escrevem nada na linha da vítima", async () => {
    // A janela da escalada é de 24 horas, então bastava o atacante repetir a cada 15 minutos para
    // o trancamento virar permanente. Aqui o ciclo se repete sem relógio: o que se mede é que
    // nenhuma repetição tem por onde virar escrita.
    const b = cenarioDeDoisLinks();
    const { s, lim } = servico(b);
    const doAtacante = token({ admissaoId: ATACANTE.admissaoId, jti: ATACANTE.jti });
    const dela = token({ admissaoId: VITIMA.admissaoId, jti: VITIMA.jti });

    for (let volta = 0; volta < 5; volta += 1) {
      for (let i = 0; i < 6; i += 1) {
        await s
          .identificar({ linkToken: doAtacante, cpf: VITIMA.cpf, dataNascimento: "1970-01-01" })
          .catch(() => undefined);
      }
      await s
        .identificar({ linkToken: dela, cpf: VITIMA.cpf, dataNascimento: VITIMA.dataNascimento })
        .catch(() => undefined);
    }

    const naLinhaDaVitima = b.atualizacoes.filter(
      (u) => "suspensoAte" in u.set && u.alvos.includes(VITIMA.jti),
    );
    expect(naLinhaDaVitima).toEqual([]);
    // A escalada que existir aqui é a do link DO ATACANTE, que estourou o próprio balde por link.
    const escaladas = lim.chamadas.filter((c) => c.nome === "portal-ident-estouros");
    expect(escaladas.every((c) => c.chave.includes(ATACANTE.jti))).toBe(true);
  });

  it("a trava estrutural: o balde do CPF chama `bloquear` com `escalar: false`", () => {
    // O defeito volta como uma palavra trocada. A régua fica pinada no texto, como a do S37.
    expect(ARQUIVO_SERVICO).toMatch(
      /portal-ident:cpf:[\s\S]{0,900}?bloquear\([\s\S]{0,400}?escalar: false, balde: "CPF"/,
    );
    // E O ÚNICO LUGAR QUE ESCALA É O DOS DOIS BALDES QUE O ATACANTE NÃO ESCOLHE. A escalada
    // INCONDICIONAL deixou de existir na terceira rodada (ver `portal-suspensao-verificada`): ela
    // passou a depender de a credencial estar ERRADA, então `{ escalar: true }` literal não pode
    // voltar, e o único ponto de escalada é o condicional.
    expect(ARQUIVO_SERVICO).not.toMatch(/escalar: true/);
    // NA QUARTA RODADA A CONDIÇÃO GANHOU NOME E DUAS METADES (`escaladaDevida`: link VIVO **e**
    // credencial ERRADA). O `!credencialCorreta` solto não pode voltar, porque foi ele que deixou
    // "link morto" satisfazer a condição por acidente e a escalada se auto-renovar.
    expect(ARQUIVO_SERVICO).not.toMatch(/escalar: !credencialCorreta/);
    expect(
      ARQUIVO_SERVICO.match(/escalar: await this\.escaladaDevida\(bilhete, agoraMs, entrada\)/g) ?? [],
    ).toHaveLength(1);
    // Sem padrão silencioso: quem chamar tem de dizer, e agora também QUAL balde mordeu.
    expect(ARQUIVO_SERVICO).toMatch(/opcoes: \{ escalar: boolean; balde: BaldeDoTeto \},/);
  });

  /**
   * O CENÁRIO QUE DE FATO ESTOURA O BALDE DO CPF, e ele precisa de LINKS DIFERENTES: com um link
   * só, quem morde primeiro é o balde POR LINK (a sexta tentativa já o estoura), e o evento sai
   * como `BLOQUEADO`. É o ataque do `describe` de baixo, visto pelo lado da trilha.
   */
  function seisLinksContraOMesmoCpf() {
    const links = Array.from({ length: 6 }, (_, i) => ({
      admissaoId: `aaaaaaaa-aaaa-4aaa-8aaa-11111111111${i}`,
      jti: `bbbbbbbb-bbbb-4bbb-8bbb-11111111111${i}`,
    }));
    const b = banco(
      [linkVivo(VITIMA.jti, VITIMA.admissaoId), ...links.map((l) => linkVivo(l.jti, l.admissaoId))],
      {
        [VITIMA.admissaoId]: { cpf: VITIMA.cpf, dataNascimento: VITIMA.dataNascimento },
        ...Object.fromEntries(
          links.map((l) => [
            l.admissaoId,
            { cpf: ATACANTE.cpf, dataNascimento: ATACANTE.dataNascimento },
          ]),
        ),
      },
    );
    return { b, links };
  }

  it("o estouro do balde do CPF tem CÓDIGO PRÓPRIO na trilha, e não o `BLOQUEADO` genérico", async () => {
    // A CICATRIZ DO S28: os dois estouros gravavam `BLOQUEADO`, e a Sala De Segurança lia com o
    // mesmo nome duas situações OPOSTAS, "o balde dela estourou" (suspeita) e "o balde global do
    // CPF dela estourou porque um terceiro o encheu" (ALVO). Sem o código separado, o ataque
    // inteiro não acende nada e o único nome no log é o da vítima.
    const { b, links } = seisLinksContraOMesmoCpf();
    const { s, registrar } = servico(b);

    let ultimo: unknown;
    for (const l of links) {
      ultimo = await s
        .identificar({ linkToken: token(l), cpf: VITIMA.cpf, dataNascimento: "1970-01-01" })
        .catch((e: unknown) => e);
    }
    expect(status(ultimo)).toBe(429);

    const bloqueios = registrar.mock.calls.filter(
      (c) => (c as unknown as [string])[0] === "PORTAL_IDENTIFICACAO_BLOQUEADA",
    ) as unknown as [string, Record<string, unknown>][];
    expect(bloqueios).toHaveLength(1);
    expect(bloqueios[0][1].motivoCodigo).toBe("BLOQUEADO_POR_CPF");
    // O código novo existe no catálogo FECHADO: fora dele, `montarEventoPortal` descarta e o
    // evento chega dizendo que recusou sem dizer por quê.
    expect(PORTAL_MOTIVOS as readonly string[]).toContain("BLOQUEADO_POR_CPF");
  });

  it("o estouro do balde do LINK continua sendo `BLOQUEADO`, que é a outra metade do par", async () => {
    // Sem esta ponta, trocar TODO bloqueio para o código novo passaria no teste de cima e apagaria
    // a distinção que ele existe para criar.
    const b = cenarioDeDoisLinks();
    const { s, registrar } = servico(b);
    const doAtacante = token({ admissaoId: ATACANTE.admissaoId, jti: ATACANTE.jti });

    for (let i = 0; i < 6; i += 1) {
      await s
        .identificar({ linkToken: doAtacante, cpf: VITIMA.cpf, dataNascimento: "1970-01-01" })
        .catch(() => undefined);
    }

    const bloqueios = registrar.mock.calls.filter(
      (c) => (c as unknown as [string])[0] === "PORTAL_IDENTIFICACAO_BLOQUEADA",
    ) as unknown as [string, Record<string, unknown>][];
    expect(bloqueios.length).toBeGreaterThan(0);
    expect(bloqueios.every((c) => c[1].motivoCodigo === "BLOQUEADO")).toBe(true);
  });

  it("e o candidato NÃO vê a diferença: o corpo do 429 é o MESMO nos dois baldes", async () => {
    // O código novo é de TRILHA. Chegasse à tela, o 429 viraria oráculo sobre qual balde mordeu.
    const { b, links } = seisLinksContraOMesmoCpf();
    const { s } = servico(b);
    let doCpf: unknown;
    for (const l of links) {
      doCpf = await s
        .identificar({ linkToken: token(l), cpf: VITIMA.cpf, dataNascimento: "1970-01-01" })
        .catch((e: unknown) => e);
    }

    const outro = servico(cenarioDeDoisLinks());
    const doAtacante = token({ admissaoId: ATACANTE.admissaoId, jti: ATACANTE.jti });
    let doLink: unknown;
    for (let i = 0; i < 6; i += 1) {
      doLink = await outro.s
        .identificar({ linkToken: doAtacante, cpf: VITIMA.cpf, dataNascimento: "1970-01-01" })
        .catch((e: unknown) => e);
    }

    const retrato = (e: unknown) => ({
      status: (e as { getStatus: () => number }).getStatus(),
      corpo: (e as { getResponse: () => unknown }).getResponse(),
      mensagem: (e as Error).message,
    });
    expect(retrato(doCpf).status).toBe(429);
    expect(retrato(doCpf)).toEqual(retrato(doLink));
  });
});

// ══ PONTA 2: A PROTEÇÃO CONTINUA EXISTINDO ════════════════════════════════════════════════════

describe("A PROTEÇÃO QUE O BALDE DO CPF EXISTE PARA DAR", () => {
  /**
   * O ATAQUE QUE ESTE BALDE BARRA, e que o balde POR LINK não barra: quem tem MUITOS links (uma
   * consultoria com vários candidatos, ou quem juntou links vazados) e tenta UM CPF conhecido,
   * trocando de link a cada tentativa para nunca estourar o teto de nenhum deles.
   *
   * É EXATAMENTE ISTO QUE MORRERIA com o balde chaveado por `(jti, cpf)`: cada link daria 5
   * tentativas frescas contra a mesma pessoa, ou seja, 5N chutes na data de nascimento dela.
   */
  it("6 links DIFERENTES tentando o MESMO CPF batem no teto na sexta", async () => {
    const links = Array.from({ length: 6 }, (_, i) => ({
      admissaoId: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${i}`,
      jti: `bbbbbbbb-bbbb-4bbb-8bbb-00000000000${i}`,
    }));
    const b = banco(
      [
        linkVivo(VITIMA.jti, VITIMA.admissaoId),
        ...links.map((l) => linkVivo(l.jti, l.admissaoId)),
      ],
      {
        [VITIMA.admissaoId]: { cpf: VITIMA.cpf, dataNascimento: VITIMA.dataNascimento },
        ...Object.fromEntries(
          links.map((l) => [l.admissaoId, { cpf: ATACANTE.cpf, dataNascimento: ATACANTE.dataNascimento }]),
        ),
      },
    );
    const { s } = servico(b);

    const codigos: number[] = [];
    for (const l of links) {
      const erro = await s
        .identificar({
          linkToken: token(l),
          cpf: VITIMA.cpf,
          // Uma data diferente a cada tentativa: é a varredura que o balde do CPF existe para
          // barrar, e cada tentativa vem de um link novo, com balde por link zerado.
          dataNascimento: `19${70 + links.indexOf(l)}-03-03`,
        })
        .catch((e: unknown) => e);
      codigos.push(status(erro));
    }

    // As cinco primeiras chegam ao casamento e falham; a SEXTA é recusada pelo teto do CPF, sem
    // que nenhum balde por link tenha estourado.
    expect(codigos).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("e o teto do CPF não contamina outro CPF: o candidato ao lado entra normalmente", async () => {
    const b = cenarioDeDoisLinks();
    const { s } = servico(b);
    const doAtacante = token({ admissaoId: ATACANTE.admissaoId, jti: ATACANTE.jti });

    for (let i = 0; i < 6; i += 1) {
      await s
        .identificar({ linkToken: doAtacante, cpf: VITIMA.cpf, dataNascimento: "1970-01-01" })
        .catch(() => undefined);
    }

    // O balde estourado é o do CPF da vítima. Um terceiro, com o seu link e o seu CPF, entra.
    const outro = banco([linkVivo(ATACANTE.jti, ATACANTE.admissaoId)], {
      [ATACANTE.admissaoId]: { cpf: ATACANTE.cpf, dataNascimento: ATACANTE.dataNascimento },
    });
    const vizinho = servico(outro);
    const sessao = await vizinho.s.identificar({
      linkToken: doAtacante,
      cpf: ATACANTE.cpf,
      dataNascimento: ATACANTE.dataNascimento,
    });
    expect(typeof sessao.sessao).toBe("string");
  });
});

// ══ VETO 2: A QUARTA PORTA PAROU DE DIVERGIR NO ESTADO "LINHA AUSENTE" ════════════════════════

describe("LINHA AUSENTE E DIVERGÊNCIA DE DONO SÃO ESTADOS DIFERENTES NA TRILHA", () => {
  const motivoDoRecusado = (registrar: ReturnType<typeof vi.fn>) => {
    const chamada = registrar.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "PORTAL_LINK_RECUSADO",
    ) as unknown as [string, Record<string, unknown>] | undefined;
    return chamada?.[1]?.motivoCodigo;
  };

  it("linha AUSENTE grava `REVOGADO_MANUAL`, o mesmo nome das outras três portas", async () => {
    // Antes: `linha?.admissaoId === bilhete.admissaoId` é falso com `linha` indefinida, e o ramo
    // da divergência de dono engolia a linha ausente, forçando `EXPIRADA`. Sobre o MESMO link,
    // `exigirVivo`, a emissão de credencial e a confirmação diziam `REVOGADO_MANUAL`.
    const b = banco([], { [VITIMA.admissaoId]: { cpf: VITIMA.cpf, dataNascimento: VITIMA.dataNascimento } });
    const { s, registrar } = servico(b);

    const erro = await s
      .identificar({
        linkToken: token({ admissaoId: VITIMA.admissaoId, jti: VITIMA.jti }),
        cpf: VITIMA.cpf,
        dataNascimento: VITIMA.dataNascimento,
      })
      .catch((e: unknown) => e);

    expect(status(erro)).toBe(401);
    expect(motivoDoRecusado(registrar)).toBe("REVOGADO_MANUAL");
  });

  it("linha que EXISTE e é de OUTRA admissão continua gravando `EXPIRADA`", async () => {
    const b = banco([linkVivo(VITIMA.jti, ATACANTE.admissaoId)], {
      [VITIMA.admissaoId]: { cpf: VITIMA.cpf, dataNascimento: VITIMA.dataNascimento },
    });
    const { s, registrar } = servico(b);

    await s
      .identificar({
        linkToken: token({ admissaoId: VITIMA.admissaoId, jti: VITIMA.jti }),
        cpf: VITIMA.cpf,
        dataNascimento: VITIMA.dataNascimento,
      })
      .catch(() => undefined);

    expect(motivoDoRecusado(registrar)).toBe("EXPIRADA");
  });

  it("a resposta ao candidato NÃO muda entre os dois estados, e é isso que impede o oráculo", async () => {
    const ausente = servico(banco([], {}));
    const divergente = servico(
      banco([linkVivo(VITIMA.jti, ATACANTE.admissaoId)], {
        [VITIMA.admissaoId]: { cpf: VITIMA.cpf, dataNascimento: VITIMA.dataNascimento },
      }),
    );
    const pedido = {
      linkToken: token({ admissaoId: VITIMA.admissaoId, jti: VITIMA.jti }),
      cpf: VITIMA.cpf,
      dataNascimento: VITIMA.dataNascimento,
    };

    const a = await ausente.s.identificar(pedido).catch((e: Error) => e.message);
    const c = await divergente.s.identificar(pedido).catch((e: Error) => e.message);

    expect(a).toBe(c);
  });
});
