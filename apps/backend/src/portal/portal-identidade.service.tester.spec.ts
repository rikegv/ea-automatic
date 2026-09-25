import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  candidatoHashDe,
  montarEventoPortal,
  type PortalEventoTipo,
} from "../domain/portal-evento";
import { verificarLink } from "../domain/portal-identidade";
import { PortalIdentidadeService } from "./portal-identidade.service";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO E ANTES DO CÓDIGO (§A.40 regra 2).
 *
 * O ALVO: `PortalIdentidadeService`, a camada que LIGA a tela do Portal. Hoje a tela abre e para,
 * porque não existe emissor do link nem quem troque CPF e nascimento por uma sessão. Dois métodos:
 * `emitirLink(admissaoId, autorId)`, que é do consultor, e `identificar(...)`, que é do candidato.
 * Quem escreve o serviço é outro agente; este arquivo NÃO o cria, e rodado hoje FALHA por módulo
 * inexistente, que é o esperado.
 *
 * O REQUISITO: `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md`, decisões 2 (72 horas), 3 (não é de uso
 * único), 4 (revogação, que é o furo aberto do link do VT), 5 (5 tentativas por 15 minutos) e 10
 * (segredo próprio), mais os itens L1, L2, L5, L6, L7 e L9 do catálogo da seção 9.
 *
 * ┌ O QUE ESTE ARQUIVO EXISTE PARA PEGAR, e nenhum deles falha em produção fazendo barulho ┐
 * │                                                                                          │
 * │ 1. LINK ANTIGO QUE SOBREVIVE. Emitir o segundo link sem matar o primeiro é exatamente o   │
 * │    furo que a decisão 4 corrige no VT: o link vazado no WhatsApp continua valendo, e a    │
 * │    revogação vira um botão que não faz nada. Aqui se prova a REVOGAÇÃO, não a emissão.    │
 * │ 2. LIMITE CONFERIDO TARDE. Consultar o candidato e só depois contar a tentativa entrega a │
 * │    resposta antes de o teto existir: o laço de repetição percorre datas de nascimento com │
 * │    o limite ligado e sem efeito. A ordem é parte do requisito, então a ordem é testada.   │
 * │ 3. PII NA TRILHA. O jeito natural de registrar a falha é mandar o que se tem na mão, e o  │
 * │    que se tem na mão é CPF e data de nascimento. A varredura abaixo procura o CPF         │
 * │    SINTÉTICO dentro de TODO argumento que chegou à trilha, em qualquer profundidade.      │
 * │ 4. ORÁCULO DE CPF. Link revogado, link vencido e link que nunca existiu têm de devolver a │
 * │    MESMA exceção, com a MESMA frase. Frase diferente é resposta diferente, e resposta     │
 * │    diferente é informação de graça para quem está do outro lado.                          │
 * │ 5. CPF NA SESSÃO. É o veto V5, e o precedente contrário está em produção: o token do link │
 * │    do VT carrega CPF e nome. Repetir aquilo aqui põe dado pessoal no armazenamento do     │
 * │    navegador de um celular que anda na rua.                                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: todos os valores são SINTÉTICOS, inventados para este arquivo. O CPF e a data de
 * nascimento abaixo não pertencem a ninguém, e existem com um propósito único: ser PROCURADOS nas
 * saídas (trilha, chave do limitador, token de sessão).
 */

// Valores SINTÉTICOS (nenhum dado real; §A.6).
const SINTETICO = {
  admissaoId: "11111111-1111-4111-8111-111111111111",
  outraAdmissaoId: "99999999-9999-4999-8999-999999999999",
  autorId: "22222222-2222-4222-8222-222222222222",
  /** Sequência SINTÉTICA no formato de CPF. Serve para ser buscada nas saídas. */
  cpf: "00000000191",
  cpfPontuado: "000.000.001-91",
  /** CPF SINTÉTICO de outra pessoa, para o caso da admissão que não é a do link. */
  cpfDeOutro: "00000000272",
  dataNascimento: "1990-05-07",
  nome: "Candidata Sintetica De Teste",
  ip: "203.0.113.7",
};

const HORA_MS = 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;
/** Decisão 2. */
const TTL_LINK_HORAS = 72;
/** Decisão 5. */
const TENTATIVAS_LIMITE = 5;
const TENTATIVAS_JANELA_MS = 15 * MINUTO_MS;

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PRIVADA_B64 = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" }) as string).toString("base64");
const PUBLICA = createPublicKey(publicKey.export({ type: "spki", format: "pem" }) as string);

/**
 * Coletor de TODA string alcançável a partir de um valor.
 *
 * A GUARDA DE CICLO E O TETO SÃO OBRIGATÓRIOS, e não são zelo: o argumento de uma consulta Drizzle
 * é um grafo de objetos de coluna que aponta de volta para a tabela. Varrer sem guarda estoura em
 * leque e o teste TRAVA sem falhar, que é o pior desfecho possível (aconteceu, custou 31 minutos).
 */
function coletarStrings(valor: unknown, destino: string[] = []): string[] {
  const vistos = new WeakSet<object>();
  const anda = (v: unknown, profundidade: number) => {
    if (profundidade > 14 || v == null || destino.length > 20000) return;
    if (typeof v === "string") {
      destino.push(v);
      return;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      destino.push(String(v));
      return;
    }
    if (typeof v !== "object") return;
    if (vistos.has(v as object)) return;
    vistos.add(v as object);
    for (const item of Object.values(v as Record<string, unknown>)) anda(item, profundidade + 1);
  };
  anda(valor, 0);
  return destino;
}

type LinhaLink = {
  id: string;
  admissaoId: string;
  criadoPorId?: string;
  criadoEm?: Date;
  expiraEm?: Date;
  revogadoEm?: Date | null;
  revogadoPorId?: string | null;
};

type LinhaCandidato = { cpf: string; dataNascimento: string | null; nome: string };
type LinhaAdmissao = { id: string; candidatoCpf: string; farolGlobal?: string };

/**
 * BANCO DE MENTIRINHA, no molde dos vizinhos (`portal-documentos.tester.spec.ts`,
 * `portal-teto-tentativas.spec.ts`): vitest, sem banco real.
 *
 * Ele responde pelo QUE FOI PEDIDO (os valores que aparecem na consulta, e a projeção), e não pela
 * ORDEM das chamadas, porque a ordem das consultas é detalhe de implementação. A única ordem que
 * este arquivo prende é a do LIMITE antes da consulta, que é requisito.
 *
 * NOTA PARA QUEM FOR IMPLEMENTAR: se a sua consulta usar outros nomes de campo, ajuste o
 * despachante abaixo, nunca a asserção. O que este arquivo afirma é o COMPORTAMENTO.
 */
function banco(cenario: {
  links?: LinhaLink[];
  candidatos?: LinhaCandidato[];
  admissoes?: LinhaAdmissao[];
  /** Registro compartilhado da ordem dos atos (limite, consulta, escrita). */
  ordem: string[];
}) {
  const links = cenario.links ?? [];
  const candidatos = cenario.candidatos ?? [];
  const admissoes = cenario.admissoes ?? [];

  const inseridas: Record<string, unknown>[] = [];
  const atualizacoes: { set: Record<string, unknown>; argumentos: string[] }[] = [];
  const consultas: string[][] = [];

  /** Decide o que a consulta devolve, pelos valores que ela menciona e pela projeção. */
  const resolver = (argumentos: string[], projecao?: Record<string, unknown>) => {
    cenario.ordem.push("consulta");
    consultas.push(argumentos);
    const alvo = Object.keys(projecao ?? {}).join(",").toLowerCase();
    const mencionou = (v: string) => argumentos.includes(v);

    const linkMencionado = links.find((l) => mencionou(l.id));
    if (linkMencionado || /revogad|expira|jti|criadopor/.test(alvo)) {
      return linkMencionado ? [linkMencionado] : [];
    }
    const porCpf = candidatos.find((c) => mencionou(c.cpf));
    if (porCpf) return [porCpf];
    const admissaoMencionada = admissoes.find((a) => mencionou(a.id));
    if (admissaoMencionada) {
      if (/cpf|nascimento|nome/.test(alvo)) {
        const c = candidatos.find((x) => x.cpf === admissaoMencionada.candidatoCpf);
        return c ? [c] : [];
      }
      return [admissaoMencionada];
    }
    if (/cpf|nascimento|nome/.test(alvo)) return [];
    return [];
  };

  /** Cadeia encadeável e awaitável. Não obriga `from().where()` numa ordem, e não proíbe join. */
  const cadeia = (projecao?: Record<string, unknown>): any => {
    const argumentos: string[] = [];
    const proxy: any = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(resolver(argumentos, projecao)).then(ok, erro);
          }
          return (...args: unknown[]) => {
            for (const a of args) coletarStrings(a, argumentos);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const escrita = (registro: "insert" | "update"): any => {
    const argumentos: string[] = [];
    let valores: Record<string, unknown> = {};
    const proxy: any = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve([{ id: "linha-1" }]).then(ok, erro);
          }
          return (...args: unknown[]) => {
            for (const a of args) coletarStrings(a, argumentos);
            if (prop === "values") {
              valores = (args[0] ?? {}) as Record<string, unknown>;
              cenario.ordem.push("insert");
              inseridas.push(valores);
            }
            if (prop === "set") {
              valores = (args[0] ?? {}) as Record<string, unknown>;
              cenario.ordem.push("update");
              atualizacoes.push({ set: valores, argumentos });
            }
            return proxy;
          };
        },
      },
    );
    void registro;
    return proxy;
  };

  const findFirst = async (args?: unknown, projecao?: Record<string, unknown>) => {
    const argumentos = coletarStrings(args);
    const linhas = resolver(argumentos, projecao);
    return linhas[0];
  };

  const db: any = {
    select: (projecao?: Record<string, unknown>) => cadeia(projecao),
    selectDistinct: (projecao?: Record<string, unknown>) => cadeia(projecao),
    insert: () => escrita("insert"),
    update: () => escrita("update"),
    execute: async (consulta: unknown) => resolver(coletarStrings(consulta)),
    query: {
      portalLinks: { findFirst: (a?: unknown) => findFirst(a, { revogadoEm: 1, expiraEm: 1 }) },
      candidatos: { findFirst: (a?: unknown) => findFirst(a, { cpf: 1, dataNascimento: 1, nome: 1 }) },
      admissoes: { findFirst: (a?: unknown) => findFirst(a, { id: 1 }) },
    },
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);

  return { db, inseridas, atualizacoes, consultas };
}

/**
 * LIMITADOR de mentirinha, no formato do `ThrottlerStorage` que o `VtService` já usa em produção
 * (`increment(chave, ttl, limite, bloqueio, nome)`).
 */
function limitador(bloqueado = false, ordem: string[] = []) {
  const chamadas: { chave: string; ttl: number; limite: number; bloqueio: number; nome: string }[] = [];
  const increment = vi.fn(
    async (chave: string, ttl: number, limite: number, bloqueio: number, nome: string) => {
      ordem.push("limite");
      chamadas.push({ chave, ttl, limite, bloqueio, nome });
      return { totalHits: chamadas.length, timeToExpire: ttl, isBlocked: bloqueado, timeToBlockExpire: bloqueio };
    },
  );
  return { storage: { increment } as never, chamadas, increment };
}

const config = (extra: Record<string, string> = {}) =>
  ({
    get: (chave: string) => {
      if (/PRIVATE_KEY/.test(chave)) return PRIVADA_B64;
      if (chave === "PORTAL_LOG_PEPPER") return "pepper-sintetico";
      return extra[chave];
    },
    getOrThrow: (chave: string) => {
      if (/PRIVATE_KEY/.test(chave)) return PRIVADA_B64;
      if (chave === "PORTAL_LOG_PEPPER") return "pepper-sintetico";
      const v = extra[chave];
      if (v === undefined) throw new Error(`config ausente: ${chave}`);
      return v;
    },
  }) as never;

/**
 * NOTA PARA QUEM FOR IMPLEMENTAR: a ordem do construtor abaixo é a suposta por este tester, no
 * molde dos serviços vizinhos do Portal (banco, config, trilha, e o limitador ao fim, como no
 * `VtService`). Se a ordem final for outra, ajuste ESTE auxiliar e NADA MAIS: o que o arquivo
 * afirma é o comportamento dos dois métodos, não a forma de montar a classe.
 */
function servico(b: ReturnType<typeof banco>, lim = limitador(), registrar = vi.fn(async () => {})) {
  const trilha = { configurada: () => true, registrar } as never;
  const s = new (PortalIdentidadeService as unknown as new (...a: unknown[]) => PortalIdentidadeService)(
    b.db,
    config(),
    trilha,
    lim.storage,
  );
  return { s, registrar, lim };
}

/** O token que o método devolve, seja qual for o nome do campo. */
function tokenDe(resposta: unknown): string {
  const r = (resposta ?? {}) as Record<string, unknown>;
  const t = r.token ?? r.sessao ?? r.sessaoToken ?? r.linkToken ?? r.link;
  if (typeof t !== "string") {
    throw new Error(`resposta sem token reconhecível: ${JSON.stringify(Object.keys(r))}`);
  }
  return t;
}

/** O token do LINK, que pode vir cru ou dentro de uma URL. */
function tokenDoLink(resposta: unknown): string {
  const bruto = tokenDe(resposta);
  const pedacos = bruto.split(/[/?=#&]/).filter((p) => p.split(".").length === 3);
  return pedacos[pedacos.length - 1] ?? bruto;
}

function payloadDe(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

/**
 * Devolve o Erro que a chamada LANÇOU, já estreitado.
 *
 * Existe para não casar a união `SessaoDoCandidato | Error` com `as`: o cast compila e cala, e o
 * teste que compara as mensagens das três recusas passaria a olhar um valor que pode nem ser erro.
 * Aqui, chamada que RESOLVE reprova na hora, com a frase dizendo o que houve.
 */
async function erroDe(chamada: Promise<unknown>): Promise<Error> {
  try {
    await chamada;
  } catch (erro) {
    if (erro instanceof Error) return erro;
    throw new Error(`a recusa não veio como Error: ${String(erro)}`);
  }
  throw new Error("a chamada deveria ter recusado, e resolveu");
}

const AGORA = Date.now();

const linkVivo = (): LinhaLink => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  admissaoId: SINTETICO.admissaoId,
  criadoPorId: SINTETICO.autorId,
  criadoEm: new Date(AGORA - HORA_MS),
  expiraEm: new Date(AGORA + 70 * HORA_MS),
  revogadoEm: null,
  revogadoPorId: null,
});

const candidatoCerto = (): LinhaCandidato => ({
  cpf: SINTETICO.cpf,
  dataNascimento: SINTETICO.dataNascimento,
  nome: SINTETICO.nome,
});

const cenarioFeliz = (ordem: string[], link = linkVivo()) =>
  banco({
    ordem,
    links: [link],
    candidatos: [candidatoCerto()],
    admissoes: [{ id: SINTETICO.admissaoId, candidatoCpf: SINTETICO.cpf, farolGlobal: "EM_ADMISSAO" }],
  });

/**
 * Emite um link DE VERDADE pelo serviço e devolve o bilhete junto do `jti` dele. O `jti` é sorteado
 * na emissão, então o cenário da identificação tem de ser montado com ELE: link de fixture com id
 * fixo nunca casaria com o bilhete recém emitido, e o teste reprovaria por montagem, não por
 * comportamento.
 */
async function linkEmitido(): Promise<{ token: string; jti: string }> {
  const ordem: string[] = [];
  const { s } = servico(cenarioFeliz(ordem));
  const token = tokenDoLink(await s.emitirLink(SINTETICO.admissaoId, SINTETICO.autorId));
  return { token, jti: payloadDe(token).jti as string };
}

const pedido = (token: string, extra: Record<string, unknown> = {}) => ({
  linkToken: token,
  cpf: SINTETICO.cpf,
  dataNascimento: SINTETICO.dataNascimento,
  ip: SINTETICO.ip,
  ...extra,
});

describe("EMITIR O LINK: o novo MATA os anteriores (decisão 4)", () => {
  it("emitir grava a linha do link, que é o que torna a revogação possível", async () => {
    const ordem: string[] = [];
    const b = cenarioFeliz(ordem);
    const { s } = servico(b);

    const r = await s.emitirLink(SINTETICO.admissaoId, SINTETICO.autorId);

    expect(b.inseridas).toHaveLength(1);
    const linha = b.inseridas[0];
    // O id da linha é o `jti` do bilhete: é o que liga o token à linha revogável.
    const jti = payloadDe(tokenDoLink(r)).jti as string;
    expect(coletarStrings(linha)).toContain(jti);
    expect(coletarStrings(linha)).toContain(SINTETICO.admissaoId);
    expect(coletarStrings(linha)).toContain(SINTETICO.autorId);
  });

  it("emitir REVOGA os anteriores da MESMA admissão", async () => {
    const ordem: string[] = [];
    const b = cenarioFeliz(ordem);
    const { s } = servico(b);

    await s.emitirLink(SINTETICO.admissaoId, SINTETICO.autorId);

    const revogacoes = b.atualizacoes.filter((a) =>
      Object.entries(a.set).some(([campo, valor]) => /revogad/i.test(campo) && valor != null),
    );
    expect(revogacoes.length).toBeGreaterThanOrEqual(1);
    // A revogação é da admissão em questão, e não de qualquer link.
    expect(revogacoes.some((a) => a.argumentos.includes(SINTETICO.admissaoId))).toBe(true);
  });

  it("a revogação acontece ANTES de o link novo existir, nunca depois", async () => {
    const ordem: string[] = [];
    const b = cenarioFeliz(ordem);
    const { s } = servico(b);

    await s.emitirLink(SINTETICO.admissaoId, SINTETICO.autorId);

    // Revogar depois de inserir apagaria o link recém criado, ou dependeria de ele já ter um
    // carimbo que o poupe. O caminho seguro é matar o antigo primeiro.
    expect(ordem).toContain("update");
    expect(ordem).toContain("insert");
    expect(ordem.indexOf("update")).toBeLessThan(ordem.indexOf("insert"));
  });

  it("o prazo gravado é de 72 horas (decisão 2)", async () => {
    const ordem: string[] = [];
    const b = cenarioFeliz(ordem);
    const { s } = servico(b);

    const r = await s.emitirLink(SINTETICO.admissaoId, SINTETICO.autorId);

    const exp = payloadDe(tokenDoLink(r)).exp as number;
    expect(Math.round((exp * 1000 - Date.now()) / HORA_MS)).toBe(TTL_LINK_HORAS);

    const gravado = Object.values(b.inseridas[0]).find((v) => v instanceof Date && v.getTime() > Date.now());
    expect(gravado, "a linha precisa guardar expira_em, senão a revogação não sabe o prazo").toBeTruthy();
    expect(Math.round(((gravado as Date).getTime() - Date.now()) / HORA_MS)).toBe(TTL_LINK_HORAS);
  });

  it("o bilhete emitido é o que o verificador do domínio aceita", async () => {
    const { token } = await linkEmitido();
    const r = verificarLink(token, PUBLICA, Date.now());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.admissaoId).toBe(SINTETICO.admissaoId);
  });

  it("a trilha registra a emissão SEM o token (item L1)", async () => {
    const ordem: string[] = [];
    const b = cenarioFeliz(ordem);
    const { s, registrar } = servico(b);

    const r = await s.emitirLink(SINTETICO.admissaoId, SINTETICO.autorId);
    const token = tokenDoLink(r);

    const tipos = registrar.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(tipos).toContain("PORTAL_LINK_EMITIDO");
    const tudo = registrar.mock.calls.flatMap((c) => coletarStrings(c));
    expect(tudo.some((v) => v.includes(token))).toBe(false);
  });
});

describe("O LIMITE VEM PRIMEIRO, antes de qualquer consulta (decisão 5)", () => {
  it("nenhuma consulta acontece antes da contagem da tentativa", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const b = cenarioFeliz(ordem, { ...linkVivo(), id: jti });
    ordem.length = 0;
    const lim = limitador(false, ordem);
    const { s } = servico(b, lim);

    await s.identificar(pedido(token));

    expect(ordem.length).toBeGreaterThan(0);
    expect(ordem[0]).toBe("limite");
    expect(ordem.indexOf("limite")).toBeLessThan(ordem.indexOf("consulta"));
  });

  it("o limite é conferido mesmo quando o link é lixo: não existe atalho barato", async () => {
    const ordem: string[] = [];
    const b = cenarioFeliz(ordem);
    const lim = limitador();
    const { s } = servico(b, lim);

    await s.identificar(pedido("nao.e.token")).catch(() => undefined);

    expect(lim.increment).toHaveBeenCalled();
  });

  it("são 5 tentativas em 15 minutos, e o bloqueio existe", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const b = cenarioFeliz(ordem, { ...linkVivo(), id: jti });
    const lim = limitador();
    const { s } = servico(b, lim);

    await s.identificar(pedido(token));

    expect(lim.chamadas.length).toBeGreaterThanOrEqual(1);
    for (const c of lim.chamadas) {
      expect(c.limite).toBe(TENTATIVAS_LIMITE);
      expect(c.ttl).toBe(TENTATIVAS_JANELA_MS);
      expect(c.bloqueio).toBeGreaterThan(0);
    }
  });

  it("conta POR CPF e POR LINK, que são dois baldes e não um", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const b = cenarioFeliz(ordem, { ...linkVivo(), id: jti });
    const lim = limitador();
    const { s } = servico(b, lim);

    await s.identificar(pedido(token));

    // Só por CPF, e quem tem a lista de CPFs varre um link por vez. Só por link, e quem tem o link
    // varre datas de nascimento do mesmo CPF trocando de link.
    expect(lim.chamadas.length).toBeGreaterThanOrEqual(2);
    expect(lim.chamadas.some((c) => c.chave.includes(jti))).toBe(true);
    expect(new Set(lim.chamadas.map((c) => c.chave)).size).toBeGreaterThanOrEqual(2);
  });

  it("§A.6: o CPF NÃO é a chave do limitador, nem cru nem pontuado", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const b = cenarioFeliz(ordem, { ...linkVivo(), id: jti });
    const lim = limitador();
    const { s } = servico(b, lim);

    await s.identificar(pedido(token));

    for (const c of lim.chamadas) {
      expect(c.chave).not.toContain(SINTETICO.cpf);
      expect(c.chave).not.toContain(SINTETICO.cpfPontuado);
    }
  });

  it("bloqueado: o LIMITE vem primeiro, e a consulta que vem depois é a da escalada", async () => {
    /*
     * ESTE TESTE DIZIA "E NÃO CONSULTA O CANDIDATO", E MUDOU NA TERCEIRA RODADA DA FAMÍLIA S37.
     *
     * A escalada era decidida ANTES do casamento, então ela não distinguia quem ADIVINHA de quem
     * JÁ SABE A RESPOSTA, e a vítima de um ataque ao balde global do CPF dela (a que mais insiste,
     * porque a credencial dela está certa) terminava com o próprio link suspenso por 24 horas.
     * Hoje o ramo do teto CONSULTA, de propósito, para saber se pune: é uma consulta a mais no
     * caminho já recusado, e o auditor considerou o preço justo.
     *
     * O QUE O TESTE CONTINUA TRAVANDO, e é o que ele sempre existiu para travar: o LIMITE vem
     * PRIMEIRO, antes de qualquer consulta. Nenhuma leitura do candidato acontece antes de o balde
     * ser tocado, e a recusa continua sendo registrada.
     */
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const b = cenarioFeliz(ordem, { ...linkVivo(), id: jti });
    ordem.length = 0;
    const { s, registrar } = servico(b, limitador(true, ordem));

    await expect(s.identificar(pedido(token))).rejects.toThrow();

    expect(ordem[0]).toBe("limite");
    expect(ordem.indexOf("limite")).toBeLessThan(ordem.indexOf("consulta"));
    const tipos = registrar.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(tipos).toContain("PORTAL_IDENTIFICACAO_BLOQUEADA");
    // E NADA É ESCRITO: a credencial deste pedido está CORRETA, então a escalada é dispensada.
    expect(b.atualizacoes.some((u) => "suspensoAte" in u.set)).toBe(false);
  });
});

describe("A SESSÃO SÓ NASCE COM LINK VIVO **E** CASAMENTO", () => {
  it("link vivo e dados corretos: sessão emitida", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const b = cenarioFeliz(ordem, { ...linkVivo(), id: jti });
    const { s, registrar } = servico(b);

    const sessao = tokenDe(await s.identificar(pedido(token)));

    const payload = payloadDe(sessao);
    expect(payload.typ).toBe("portal");
    expect(payload.sub).toBe(SINTETICO.admissaoId);
    // O `jti` do LINK viaja na sessão: é a chave da cota, e ele vem do TOKEN, nunca do corpo.
    expect(payload.jti).toBe(payloadDe(token).jti);
    const tipos = registrar.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(tipos).toContain("PORTAL_IDENTIFICACAO_OK");
    expect(tipos).toContain("PORTAL_SESSAO_EMITIDA");
  });

  it("a sessão é CURTA, 30 minutos, e não herda as 72 horas do link", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    const payload = payloadDe(tokenDe(await s.identificar(pedido(token))));

    const minutos = Math.round(((payload.exp as number) * 1000 - Date.now()) / MINUTO_MS);
    expect(minutos).toBe(30);
  });

  it("link vivo, mas a DATA não bate: nenhuma sessão", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s, registrar } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    await expect(s.identificar(pedido(token, { dataNascimento: "1991-01-01" }))).rejects.toThrow();

    const tipos = registrar.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(tipos).toContain("PORTAL_IDENTIFICACAO_FALHA");
    expect(tipos).not.toContain("PORTAL_SESSAO_EMITIDA");
  });

  it("link vivo, mas o CPF não existe: nenhuma sessão, e a MESMA recusa da data errada", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const b = cenarioFeliz(ordem, { ...linkVivo(), id: jti });
    const { s } = servico(b);

    const erroCpf = await erroDe(s.identificar(pedido(token, { cpf: "00000000000" })));
    const erroData = await erroDe(s.identificar(pedido(token, { dataNascimento: "1991-01-01" })));

    expect(erroCpf.message).toBe(erroData.message);
    expect(erroCpf.constructor.name).toBe(erroData.constructor.name);
  });

  it("O CASAMENTO É CONTRA A ADMISSÃO DO LINK, não contra a base inteira", async () => {
    // Sem isto, qualquer link válido vira porta de entrada para QUALQUER CPF da base: a pessoa
    // acerta o próprio CPF e a própria data, e abre a trilha documental de um terceiro.
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const b = banco({
      ordem,
      // COM O `jti` DO BILHETE, e isto não é detalhe: com o id da fixture, o link não seria
      // encontrado e a recusa viria de "link inexistente", nunca do casamento. O teste passaria
      // pelo motivo errado, que é a forma silenciosa de um teste não provar nada.
      links: [{ ...linkVivo(), id: jti }],
      candidatos: [
        candidatoCerto(),
        { cpf: SINTETICO.cpfDeOutro, dataNascimento: "1985-03-02", nome: "Outra Pessoa Sintetica" },
      ],
      admissoes: [
        { id: SINTETICO.admissaoId, candidatoCpf: SINTETICO.cpf },
        { id: SINTETICO.outraAdmissaoId, candidatoCpf: SINTETICO.cpfDeOutro },
      ],
    });
    const { s } = servico(b);

    await expect(
      s.identificar(pedido(token, { cpf: SINTETICO.cpfDeOutro, dataNascimento: "1985-03-02" })),
    ).rejects.toThrow();
  });
});

describe("REVOGADO, EXPIRADO E INEXISTENTE: a MESMA resposta para fora", () => {
  const casos = async () => {
    const { token, jti } = await linkEmitido();

    const revogado: string[] = [];
    const bRevogado = banco({
      ordem: revogado,
      links: [{ ...linkVivo(), id: jti, revogadoEm: new Date(AGORA - MINUTO_MS), revogadoPorId: SINTETICO.autorId }],
      candidatos: [candidatoCerto()],
      admissoes: [{ id: SINTETICO.admissaoId, candidatoCpf: SINTETICO.cpf }],
    });

    const vencido: string[] = [];
    const bVencido = banco({
      ordem: vencido,
      links: [{ ...linkVivo(), id: jti, expiraEm: new Date(AGORA - HORA_MS) }],
      candidatos: [candidatoCerto()],
      admissoes: [{ id: SINTETICO.admissaoId, candidatoCpf: SINTETICO.cpf }],
    });

    const semLinha: string[] = [];
    const bSemLinha = banco({
      ordem: semLinha,
      links: [],
      candidatos: [candidatoCerto()],
      admissoes: [{ id: SINTETICO.admissaoId, candidatoCpf: SINTETICO.cpf }],
    });

    const pega = (b: ReturnType<typeof banco>) => erroDe(servico(b).s.identificar(pedido(token)));

    return { revogado: await pega(bRevogado), vencido: await pega(bVencido), semLinha: await pega(bSemLinha) };
  };

  it("os três recusam", async () => {
    const r = await casos();
    expect(r.revogado).toBeInstanceOf(Error);
    expect(r.vencido).toBeInstanceOf(Error);
    expect(r.semLinha).toBeInstanceOf(Error);
  });

  it("os três dizem a MESMA frase, e são o MESMO tipo de erro", async () => {
    const r = await casos();
    expect(r.vencido.message).toBe(r.revogado.message);
    expect(r.semLinha.message).toBe(r.revogado.message);
    expect(r.vencido.constructor.name).toBe(r.revogado.constructor.name);
    expect(r.semLinha.constructor.name).toBe(r.revogado.constructor.name);
  });

  it("a frase não conta qual foi o problema", async () => {
    const r = await casos();
    expect(r.revogado.message).not.toMatch(/revogad|expirad|vencid|inexistent|nao existe|não existe/i);
  });
});

describe("§A.6: O QUE VAI PARA O BANCO DA TRILHA NÃO TEM CPF, DATA, NOME NEM TOKEN", () => {
  /**
   * A FRONTEIRA CERTA É A SAÍDA DA REDUÇÃO, E A PRIMEIRA VERSÃO DESTE BLOCO MEDIU A ERRADA.
   *
   * Ela varria os ARGUMENTOS entregues a `trilha.registrar` atrás do CPF, e isso não é um defeito
   * da implementação: é o desenho. O `candidato_hash` é o campo que liga os eventos da MESMA pessoa
   * na Sala De Segurança (itens L5, L6 e L7 da seção 9), e o único jeito de preenchê-lo é
   * `montarEventoPortal` receber o CPF CRU em `cru.cpf` e hashear com o pepper. `candidatoHash` não
   * está em `CAMPOS_PERMITIDOS`, então não existe caminho para o chamador entregar o hash pronto:
   * exigir CPF fora de `registrar` seria exigir `candidato_hash` nulo para sempre, que é o oposto do
   * que o documento pede.
   *
   * A arquitetura é deliberada e está escrita no código: PII entra por UMA porta, e a redução
   * acontece DENTRO de `montarEventoPortal`, por allowlist. O `PortalTrilhaService` não tem caminho
   * alternativo de gravação, então não existe um segundo lugar por onde o CPF escape.
   *
   * ENTÃO O TESTE MEDE A SAÍDA: pega exatamente o que o serviço passou a `registrar`, roda a redução
   * e afirma sobre o OBJETO QUE VAI AO BANCO. Isso prova o que importava (o CPF não é persistido) e
   * prova uma coisa a mais, que ninguém provava: que a redução DE FATO REDUZ, no caminho real deste
   * serviço e não num exemplo de laboratório.
   *
   * A DATA DE NASCIMENTO CONTINUA PROIBIDA NAS DUAS PONTAS. Ela não está na allowlist, não vira
   * hash de correlação nenhum e não tem para que ser entregue: passá-la a `registrar` seria PII
   * atravessando a fronteira por hábito, salva só pelo descarte do outro lado. O mesmo vale para o
   * token do link, que é credencial.
   */
  const PEPPER_DE_TESTE = "pepper-sintetico-do-tester";

  /** O que o serviço passou a `registrar`, já REDUZIDO pela mesma função que grava em produção. */
  const reduzidos = (registrar: ReturnType<typeof vi.fn>) =>
    registrar.mock.calls.map((c) => {
      const [tipo, cru] = c as unknown as [PortalEventoTipo, Record<string, unknown> | undefined];
      return montarEventoPortal(tipo, cru ?? {}, PEPPER_DE_TESTE);
    });

  /** Tudo o que o chamador entregou, cru, em qualquer profundidade. */
  const entregue = (registrar: ReturnType<typeof vi.fn>) =>
    registrar.mock.calls.flatMap((c) => coletarStrings(c));

  /** Tudo o que sobrou depois da redução, em qualquer profundidade. */
  const persistido = (registrar: ReturnType<typeof vi.fn>) =>
    reduzidos(registrar).flatMap((e) => coletarStrings(e));

  const PESSOAIS = [SINTETICO.cpf, SINTETICO.cpfPontuado, SINTETICO.dataNascimento, "07/05/1990", SINTETICO.nome];

  it("no SUCESSO, o evento que vai ao banco não tem nada de pessoal", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s, registrar } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    await s.identificar(pedido(token));

    const tudo = persistido(registrar);
    expect(tudo.length).toBeGreaterThan(0);
    for (const alvo of PESSOAIS) expect(tudo.some((v) => v.includes(alvo))).toBe(false);
  });

  it("na FALHA, o evento que vai ao banco não tem nada de pessoal", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s, registrar } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    await s.identificar(pedido(token, { dataNascimento: "1991-01-01" })).catch(() => undefined);

    const tudo = persistido(registrar);
    expect(tudo.length).toBeGreaterThan(0);
    for (const alvo of [...PESSOAIS, "1991-01-01"]) expect(tudo.some((v) => v.includes(alvo))).toBe(false);
  });

  it("A REDUÇÃO DE FATO REDUZ: o CPF entra cru e sai como `candidatoHash`", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s, registrar } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    await s.identificar(pedido(token));

    // O campo de correlação da Sala De Segurança existe, e é o hash DAQUELE CPF, com pepper.
    const comHash = reduzidos(registrar).filter((e) => e.candidatoHash !== null);
    expect(comHash.length, "sem candidatoHash a Sala De Segurança não liga os eventos da pessoa").toBeGreaterThan(0);
    for (const evento of comHash) {
      expect(evento.candidatoHash).toBe(candidatoHashDe(SINTETICO.cpf, PEPPER_DE_TESTE));
      expect(evento.candidatoHash).not.toBe(SINTETICO.cpf);
      expect(evento.candidatoHash).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("A DATA DE NASCIMENTO NÃO É NEM ENTREGUE: proibida também na entrada", async () => {
    // Ao contrário do CPF, ela não compra nada do outro lado (não está na allowlist e não vira
    // hash), então entregá-la é PII cruzando a fronteira por hábito, salva só pelo descarte.
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s, registrar } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    await s.identificar(pedido(token));
    await s.identificar(pedido(token, { dataNascimento: "1991-01-01" })).catch(() => undefined);

    const cru = entregue(registrar);
    for (const alvo of [SINTETICO.dataNascimento, "07/05/1990", "1991-01-01"]) {
      expect(cru.some((v) => v.includes(alvo))).toBe(false);
    }
  });

  it("o evento de falha leva `NAO_CASOU`, e NADA que diga qual metade falhou (item L6)", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s, registrar } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    await s.identificar(pedido(token, { cpf: "00000000000" })).catch(() => undefined);

    const chamada = registrar.mock.calls.find(
      (c) => (c as unknown as [string])[0] === "PORTAL_IDENTIFICACAO_FALHA",
    ) as unknown as [PortalEventoTipo, Record<string, unknown>] | undefined;
    expect(chamada, "a falha precisa ser registrada").toBeTruthy();

    const carga = chamada?.[1] ?? {};
    expect(carga.motivoCodigo).toBe("NAO_CASOU");
    // O CPF PODE estar aqui, e só ele: é o insumo do `candidatoHash`. O motivo real, por qualquer
    // nome, não pode, porque é ele que transformaria o log no oráculo que a rota recusa ser.
    for (const campo of Object.keys(carga)) {
      expect(campo).not.toMatch(/nasc|data|nome|motivoReal|detalhe|mensagem/i);
    }

    // E o que chega ao banco continua dizendo só `NAO_CASOU`.
    const evento = montarEventoPortal("PORTAL_IDENTIFICACAO_FALHA", carga, PEPPER_DE_TESTE);
    expect(evento.motivoCodigo).toBe("NAO_CASOU");
    expect(evento.resultado).toBe("RECUSADO");
    for (const campo of Object.keys(evento.dados)) {
      expect(campo).not.toMatch(/cpf|nasc|data|nome/i);
    }
  });

  it("o token do LINK não é entregue à trilha NEM sobrevive à redução (é credencial)", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s, registrar } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    await s.identificar(pedido(token));

    expect(entregue(registrar).some((v) => v.includes(token))).toBe(false);
    expect(persistido(registrar).some((v) => v.includes(token))).toBe(false);
  });
});

describe("VETO V5: o CPF NÃO atravessa para a sessão", () => {
  it("o bilhete da sessão não carrega CPF, nome nem data de nascimento", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    const sessao = tokenDe(await s.identificar(pedido(token)));

    const claro = sessao
      .split(".")
      .map((p) => {
        try {
          return Buffer.from(p, "base64url").toString("utf8");
        } catch {
          return p;
        }
      })
      .join("|");
    for (const alvo of [SINTETICO.cpf, SINTETICO.cpfPontuado, SINTETICO.dataNascimento, SINTETICO.nome]) {
      expect(claro).not.toContain(alvo);
    }
    expect(Object.keys(payloadDe(sessao)).filter((c) => !["sub", "jti", "typ", "iat", "exp"].includes(c))).toEqual([]);
  });

  it("o CPF também não volta na resposta da identificação", async () => {
    const ordem: string[] = [];
    const { token, jti } = await linkEmitido();
    const { s } = servico(cenarioFeliz(ordem, { ...linkVivo(), id: jti }));

    const resposta = await s.identificar(pedido(token));

    const tudo = coletarStrings(resposta);
    expect(tudo.some((v) => v.includes(SINTETICO.cpf))).toBe(false);
    expect(tudo.some((v) => v.includes(SINTETICO.dataNascimento))).toBe(false);
  });
});
