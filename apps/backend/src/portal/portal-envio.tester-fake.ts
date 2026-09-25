import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA O ENVIO DO LINK DO PORTAL ───────────────────────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` é o da casa e tem motivo
 * registrado (ver `as/candidatos/retencao-lgpd.tester-fake.ts`): nome que ninguém mais escolheria
 * é a trava mais barata contra dois agentes sobrescreverem o arquivo um do outro em silêncio.
 *
 * ┌─ ESTE ARQUIVO FOI ESCRITO ANTES DO CÓDIGO (§A.40, regra 2) ──────────────────────────────────┐
 * │ O `tester` entra JUNTO com a construção e escreve contra o REQUISITO, não contra o código:    │
 * │ é o que preserva a independência da §A.38 (quem testa não é quem escreve) e o que tira o      │
 * │ teste do caminho crítico. Consequência esperada: enquanto os arquivos de produção não         │
 * │ existirem, os specs que os importam FALHAM na importação. Isso é o desenho, não o defeito.    │
 * │                                                                                              │
 * │ NADA AQUI SUPÕE A ORDEM DO CONSTRUTOR. `instanciarPorTipos` monta a classe lendo os           │
 * │ `design:paramtypes` que o Nest já emite, e casa cada dependência PELO NOME DO TIPO. Assim,    │
 * │ se o autor puser a trilha antes do correio, nada aqui precisa ser reescrito: o que este       │
 * │ arquivo afirma é COMPORTAMENTO, nunca a forma de montar a classe.                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: todo endereço, URL e CPF que aparecem aqui são SINTÉTICOS, e existem para serem procurados
 * nos escritos, nos logs e na trilha. Nenhum dado real entra em teste.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. OS SEGREDOS SINTÉTICOS, E ELES EXISTEM PARA SEREM CAÇADOS
//
// O teste de §A.6 não confere comentário nem intenção: ele pega ESTES valores e prova que nenhum
// deles reapareceu em escrita de banco, em payload de trilha, em fila ou em log.
// ══════════════════════════════════════════════════════════════════════════════════════════════

export const EMAIL_SINTETICO = "fulano.detal@exemplo-sintetico.test";
export const EMAIL_INVALIDO_SINTETICO = "fulano.detal@";
export const CPF_SINTETICO = "39053344705";
export const URL_SINTETICA = "https://portal.exemplo.test/p#token-sintetico-abcdef";
export const JTI_SINTETICO = "11111111-1111-4111-8111-111111111111";
export const ADMISSAO_SINTETICA = "22222222-2222-4222-8222-222222222222";
export const CANDIDATURA_SINTETICA = "33333333-3333-4333-8333-333333333333";
export const AUTOR_SINTETICO = "44444444-4444-4444-8444-444444444444";

/** Tudo que NÃO pode reaparecer em lugar nenhum que se persista, se logue ou se enfileire. */
export const SEGREDOS = [EMAIL_SINTETICO, CPF_SINTETICO, URL_SINTETICA, "token-sintetico-abcdef"];

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. LEITURA DE FONTE (as asserções de forma, e as três defesas contra o falso positivo)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Só o código executável: comentário de bloco e de linha fora. */
export function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

export const RAIZ_BACKEND = join(__dirname, "..");

/** Lê um arquivo do backend, ou devolve `null` quando ele ainda não existe (código em construção). */
export function fonteOuNulo(...caminho: string[]): string | null {
  try {
    return readFileSync(join(RAIZ_BACKEND, ...caminho), "utf8");
  } catch {
    return null;
  }
}

/**
 * O CORPO DE UM MÉTODO, por contagem de chaves.
 *
 * É ISTO QUE DÁ MORDIDA AO TESTE DE COLOCAÇÃO (S19): "o gancho está a UMA LINHA de distância do
 * lugar errado" só se prova sabendo onde termina um método e começa o outro. Procurar a chamada no
 * arquivo inteiro passaria igual com o gancho pendurado na `aprovar`.
 */
export function corpoDoMetodo(fonte: string, nome: string): string | null {
  const limpo = semComentarios(fonte);
  /**
   * ANCORADO NA DEFINIÇÃO, e não em qualquer ocorrência do nome: `this.aprovar(` é uma CHAMADA, e
   * um casamento ali devolveria o corpo do método errado, com o teste passando por acidente.
   */
  const marca = new RegExp(
    `^  (?:private |protected |public )?(?:readonly )?(?:async )?${nome}\\s*\\(`,
    "m",
  );
  const achado = limpo.search(marca);
  if (achado < 0) return null;
  const abre = limpo.indexOf("{", achado);
  if (abre < 0) return null;
  let profundidade = 0;
  for (let i = abre; i < limpo.length; i += 1) {
    if (limpo[i] === "{") profundidade += 1;
    if (limpo[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return limpo.slice(abre, i + 1);
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O BANCO DE MENTIRINHA
//
// No molde dos vizinhos (`portal-identidade.service.tester.spec.ts`): responde pelo QUE FOI
// PEDIDO (a projeção e os valores mencionados), nunca pela ORDEM das chamadas, porque a ordem das
// consultas é detalhe de implementação e um dublê que responda por ordem entrega a resposta
// errada no dia em que o autor acrescentar uma leitura.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Coletor de TODA string alcançável a partir de um valor.
 *
 * A GUARDA DE CICLO E O TETO SÃO OBRIGATÓRIOS: o argumento de uma consulta Drizzle é um grafo que
 * aponta de volta para a tabela, e varrer sem guarda TRAVA o teste sem falhar, que é o pior
 * desfecho possível.
 */
export function coletarStrings(valor: unknown, destino: string[] = []): string[] {
  const vistos = new WeakSet<object>();
  const anda = (v: unknown, profundidade: number) => {
    if (profundidade > 14 || v == null || destino.length > 20000) return;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
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

export interface PessoaFake {
  id?: string;
  nome?: string;
  /** `null` = cadastro sem e-mail, que é a regra 3 da OST. */
  email?: string | null;
  cpf?: string;
  admissaoId?: string | null;
  cargo?: string;
  cliente?: string;
}

export interface LinkFake {
  id: string;
  admissaoId: string;
  expiraEm?: Date | null;
  revogadoEm?: Date | null;
  suspensoAte?: Date | null;
  bloqueadoEm?: Date | null;
  primeiroAcessoEm?: Date | null;
  /**
   * O CARIMBO DO ENVIO (migration 0122). Ausente é "nunca foi enviado por e-mail", que é o caso de
   * todo link entregue à mão e de todo link anterior àquela migration.
   */
  enviadoEm?: Date | null;
  /**
   * O NASCIMENTO DA LINHA, e ele passou a decidir junto com o de cima (correção do achado 14).
   *
   * A janela de reenvio deixou de contar do ENVIO e passou a contar da ENTREGA: `enviado_em`
   * quando existe, `criado_em` quando não. É o que faz o link entregue À MÃO (que nasce sem
   * `enviado_em` de propósito) também ser protegido do reenvio que o mataria segundos depois.
   *
   * AUSENTE AQUI É "SEM CARIMBO NENHUM", situação que no banco real não existe (`criado_em` tem
   * valor padrão). Os cenários que o omitem estão dizendo "link antigo, fora de qualquer janela".
   */
  criadoEm?: Date | null;
}

export interface CenarioDoEnvio {
  /** A pessoa que o serviço vai achar, qualquer que seja a tabela de onde ele a leia. */
  pessoa?: PessoaFake | null;
  /** Várias, para a prévia e o disparo do lote. */
  pessoas?: PessoaFake[];
  /** Links JÁ existentes da admissão (para a idempotência da regra 5 e para a revogação). */
  links?: LinkFake[];
}

export interface Escrita {
  tipo: "insert" | "update";
  valores: Record<string, unknown>;
  argumentos: string[];
}

export function bancoDoEnvio(cenario: CenarioDoEnvio = {}) {
  const pessoas = cenario.pessoas ?? (cenario.pessoa ? [cenario.pessoa] : []);
  const links = cenario.links ?? [];
  const escritas: Escrita[] = [];
  const consultas: string[][] = [];

  const linhaDaPessoa = (p: PessoaFake) => ({
    id: p.id ?? CANDIDATURA_SINTETICA,
    candidaturaId: p.id ?? CANDIDATURA_SINTETICA,
    candidatoId: p.id ?? CANDIDATURA_SINTETICA,
    admissaoId: p.admissaoId === undefined ? ADMISSAO_SINTETICA : p.admissaoId,
    nome: p.nome ?? "Candidato Sintético",
    email: p.email === undefined ? EMAIL_SINTETICO : p.email,
    cpf: p.cpf ?? CPF_SINTETICO,
    cargo: p.cargo ?? "Auxiliar",
    cliente: p.cliente ?? "Cliente Sintético",
  });

  const resolver = (argumentos: string[], projecao?: Record<string, unknown>): unknown[] => {
    consultas.push(argumentos);
    const alvo = Object.keys(projecao ?? {}).join(",").toLowerCase();

    // Consulta de LINK: a projeção pede estado do link, ou o argumento menciona um jti conhecido.
    const linkMencionado = links.find((l) => argumentos.includes(l.id));
    if (linkMencionado) return [linkMencionado];
    if (/revogad|expira|suspens|bloquead|primeiroacesso|jti/.test(alvo)) {
      return links.filter((l) => l.revogadoEm == null);
    }

    /**
     * Consulta de PESSOA, e ela devolve TODAS as mencionadas, não a primeira.
     *
     * O lote pergunta por três ids de uma vez (`inArray`). Um dublê que devolvesse só a primeira
     * faria a prévia parecer certa com UM item e esconderia justamente o que a prévia existe para
     * mostrar: quem fica de fora. Medido nesta frente, com `recusados` vindo zero.
     */
    const mencionadas = pessoas.filter(
      (p) =>
        argumentos.includes(p.id ?? "") ||
        argumentos.includes(p.admissaoId ?? "") ||
        argumentos.includes(p.cpf ?? ""),
    );
    if (mencionadas.length > 0) return mencionadas.map(linhaDaPessoa);
    if (/email|nome|cargo|cliente|admissao|candidat/.test(alvo)) return pessoas.map(linhaDaPessoa);
    return pessoas.map(linhaDaPessoa);
  };

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

  const escrita = (tipo: "insert" | "update"): any => {
    const argumentos: string[] = [];
    let valores: Record<string, unknown> = {};

    /**
     * A ESCRITA PASSOU A SER APLICADA, E É ISSO QUE TORNA A CLASSE ENUNCIÁVEL (achado da 5ª
     * auditoria). O dublê antigo só REGISTRAVA em `escritas` e devolvia sempre a mesma linha, então
     * a pergunta "a leitura SEGUINTE enxerga o que a escrita gravou?" não podia ser feita: a janela
     * de reenvio (`ENVIADO_HA_POUCO`) só era testável semeando `enviado_em` à mão. Agora o `insert`
     * aparece no `links` (com o `criado_em` que o banco preenche por padrão) e o `set` do
     * `marcarEnvioDoLink` carimba o `enviado_em` na linha, então uma segunda emissão logo depois lê
     * o estado REAL e se abstém. A guarda de nulidade da revogação (`where isNull(revogado_em)`) é
     * honrada: revogar não toca quem já está revogado.
     */
    const aplicar = () => {
      if (tipo === "insert" && valores.id) {
        links.push({
          id: String(valores.id),
          admissaoId: String(valores.admissaoId ?? ADMISSAO_SINTETICA),
          expiraEm: (valores.expiraEm as Date) ?? null,
          revogadoEm: null,
          suspensoAte: null,
          bloqueadoEm: null,
          primeiroAcessoEm: null,
          enviadoEm: (valores.enviadoEm as Date) ?? null,
          // O BANCO PREENCHE `criado_em` POR PADRÃO: link recém-inserido nasce carimbado AGORA, que
          // é o que a correção do achado 14 usa para segurar o reenvio também do entregue à mão.
          criadoEm: (valores.criadoEm as Date) ?? new Date(),
        });
        return;
      }
      if (tipo === "update") {
        // `marcarEnvioDoLink` casa por `id` (jti no `where`); a revogação casa por `admissaoId`.
        const alvos = links.filter(
          (l) => argumentos.includes(l.id) || argumentos.includes(l.admissaoId),
        );
        const soVivos = "revogadoEm" in valores; // where da revogação: `isNull(revogado_em)`.
        for (const l of alvos) {
          if (soVivos && l.revogadoEm != null) continue;
          Object.assign(l, valores);
        }
      }
    };

    const proxy: any = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => {
              aplicar();
              return Promise.resolve([{ id: JTI_SINTETICO }]).then(ok, erro);
            };
          }
          return (...args: unknown[]) => {
            for (const a of args) coletarStrings(a, argumentos);
            if (prop === "values" || prop === "set") {
              valores = (args[0] ?? {}) as Record<string, unknown>;
              escritas.push({ tipo, valores, argumentos });
            }
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const findFirst = async (args?: unknown, projecao?: Record<string, unknown>) =>
    resolver(coletarStrings(args), projecao)[0];

  const db: any = {
    select: (projecao?: Record<string, unknown>) => cadeia(projecao),
    selectDistinct: (projecao?: Record<string, unknown>) => cadeia(projecao),
    insert: () => escrita("insert"),
    update: () => escrita("update"),
    delete: () => escrita("update"),
    execute: async (consulta: unknown) => resolver(coletarStrings(consulta)),
    query: new Proxy(
      {},
      {
        get: () => ({ findFirst: (a?: unknown) => findFirst(a), findMany: async () => [] }),
      },
    ),
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);

  return { db, escritas, consultas };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. OS COLABORADORES DE MENTIRINHA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * O EMISSOR DE LINK.
 *
 * A EMISSÃO É O ATO PERIGOSO DESTA FRENTE, e por isso ela é dublê e é CONTADA: `emitirLink` REVOGA
 * todos os links vivos da admissão (§A.5 do desenho do Portal / achado 4 do mapa). Cada chamada
 * aqui é uma sessão de candidato morta em produção, então "quantas vezes foi chamado" é a asserção
 * central de metade das regras desta frente.
 */
export function identidadeFake(
  opcoes: {
    falhaAoEmitir?: boolean;
    /**
     * `motivo` é o código da abstenção, e ele é OPCIONAL: os cenários que já existiam simulam o
     * link vivo JÁ ABERTO, que é o que a ausência significa para quem lê. A janela de reenvio
     * (item b da S15) é a segunda abstenção, e ela precisa dizer qual das duas é.
     */
    jaAtivo?: {
      jti: string;
      expiraEm: Date;
      motivo?: "LINK_VIVO_EM_USO" | "ENVIADO_HA_POUCO";
    } | null;
  } = {},
) {
  const emitidos: { admissaoId: string; autorId: string }[] = [];
  const revogados: { jti: string; autorId?: string; motivo?: string }[] = [];
  const carimbos: { jti: string; envio: Record<string, unknown> }[] = [];
  const expiraEm = new Date(Date.now() + 72 * 3_600_000);

  const fake = {
    /** A emissão da TELA (contrato antigo): só URL e prazo. */
    emitirLink: async (admissaoId: string, autorId: string) => {
      if (opcoes.falhaAoEmitir) throw new Error("emissao indisponivel");
      emitidos.push({ admissaoId, autorId });
      return { link: URL_SINTETICA, expiraEm: expiraEm.toISOString() };
    },
    /**
     * A emissão do ENVIO: devolve o `jti` e PODE SE ABSTER (S15).
     *
     * A abstenção é simulada, e não medida, aqui: ela mora DENTRO da transação do serviço de
     * identidade, então quem a prova é `portal-envio-abstencao.tester.spec.ts`, contra o serviço
     * REAL. Este dublê existe para provar o que o SERVIÇO DE ENVIO faz quando ela acontece.
     */
    emitirLinkParaEnvio: async (admissaoId: string, autorId: string) => {
      if (opcoes.falhaAoEmitir) throw new Error("emissao indisponivel");
      if (opcoes.jaAtivo) return { emitido: null, jaAtivo: { ...opcoes.jaAtivo, enviadoEm: null } };
      emitidos.push({ admissaoId, autorId });
      return { emitido: { jti: JTI_SINTETICO, link: URL_SINTETICA, expiraEm }, jaAtivo: null };
    },
    revogarLink: async (jti: string, autorId?: string, motivo?: string) => {
      revogados.push({ jti, autorId, motivo });
      return { revogado: true };
    },
    marcarEnvioDoLink: async (jti: string, envio: Record<string, unknown>) => {
      carimbos.push({ jti, envio });
    },
  };
  return { fake, emitidos, revogados, carimbos };
}

/**
 * O CORREIO. `configurado()` falso é a INÉRCIA do canal (S8): sem credencial, recusa, e o link NÃO
 * é emitido. `falhaAoEnviar` é a outra metade (regra 4): o envio morre DEPOIS da emissão.
 *
 * DUAS FORMAS DE FALHAR, e as duas existem porque as duas acontecem: o correio pode DEVOLVER falso
 * (é o que a implementação faz com erro de rede, tempo limite e resposta de erro do Google) ou
 * LANÇAR (é o que um `throw` não previsto faz). Tratar só a primeira deixa a segunda produzir
 * exatamente a credencial órfã que a regra 4 existe para impedir.
 *
 * `enviar` E `enviarLink`: o briefing combinou o primeiro nome e a implementação escolheu o
 * segundo. O dublê responde aos dois para que o teste afirme o COMPORTAMENTO, e a divergência de
 * nome vira item de relatório, não teste vermelho por motivo errado.
 */
export function correioFake(
  opcoes: { configurado?: boolean; falhaAoEnviar?: boolean; lancaAoEnviar?: boolean } = {},
) {
  const enviados: unknown[][] = [];
  const despachar = async (...args: unknown[]) => {
    enviados.push(args);
    if (opcoes.lancaAoEnviar) throw new Error("correio recusou");
    return !opcoes.falhaAoEnviar;
  };
  const fake = {
    configurado: () => opcoes.configurado !== false,
    descrever: () => ({ configurado: opcoes.configurado !== false, timeoutMs: 1 }),
    enviar: despachar,
    enviarLink: despachar,
  };
  return { fake, enviados };
}

/** A trilha, que é onde a PII costuma voltar a aparecer sem ninguém reparar. */
export function trilhaFake() {
  const registros: { tipo: string; dados: unknown }[] = [];
  const fake = {
    configurada: () => true,
    registrar: async (tipo: string, dados: unknown) => {
      registros.push({ tipo, dados });
    },
  };
  return { fake, registros };
}

/** Uma fila de mentirinha, para provar o S9 (o job leva id, nunca a URL nem o endereço). */
export function filaFake() {
  const jobs: unknown[][] = [];
  const fake = { add: async (...args: unknown[]) => void jobs.push(args) };
  return { fake, jobs };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. MONTAR A CLASSE SEM SUPOR A ORDEM DO CONSTRUTOR
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * OS TIPOS DO CONSTRUTOR, LIDOS DA FONTE, e não do `design:paramtypes`.
 *
 * ┌─ POR QUE NÃO PELO METADADO, que era o caminho óbvio ────────────────────────────────────────┐
 * │ O vitest transpila com esbuild, e o esbuild NÃO EMITE `emitDecoratorMetadata`. Em teste,     │
 * │ `Reflect.getMetadata("design:paramtypes", Classe)` devolve VAZIO para toda classe do Nest.   │
 * │ Um auxiliar apoiado nele montaria a classe com ZERO argumento e o teste morreria com         │
 * │ "cannot read property of undefined", que se lê como defeito do código sob teste.             │
 * │ Medido nesta frente, não deduzido: a primeira versão deste arquivo fazia exatamente isso.    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A leitura é do texto do construtor: `private readonly correio: PortalCorreioService`.
 */
export function tiposDoConstrutorDaFonte(fonte: string, classe: string): string[] {
  const limpo = semComentarios(fonte);
  const daClasse = limpo.slice(limpo.indexOf(`class ${classe}`));
  const abre = daClasse.indexOf("constructor(");
  if (abre < 0) return [];
  let profundidade = 0;
  let fim = abre;
  for (let i = daClasse.indexOf("(", abre); i < daClasse.length; i += 1) {
    if (daClasse[i] === "(") profundidade += 1;
    if (daClasse[i] === ")") {
      profundidade -= 1;
      if (profundidade === 0) {
        fim = i;
        break;
      }
    }
  }
  const lista = daClasse.slice(daClasse.indexOf("(", abre) + 1, fim);
  // Um parâmetro por vírgula de TOPO: `@Inject(X) private readonly y: Tipo`.
  const partes: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const ch of lista) {
    if (ch === "(" || ch === "<" || ch === "[") nivel += 1;
    if (ch === ")" || ch === ">" || ch === "]") nivel -= 1;
    if (ch === "," && nivel === 0) {
      partes.push(atual);
      atual = "";
      continue;
    }
    atual += ch;
  }
  if (atual.trim()) partes.push(atual);
  return partes
    .map((p) => p.split(":").slice(1).join(":").trim().replace(/[<[].*$/, ""))
    .filter(Boolean);
}

/**
 * Monta a classe casando cada parâmetro PELO NOME DO TIPO declarado na fonte.
 *
 * O que não estiver no mapa vira um objeto vazio, e não `undefined`, para o erro ser "método não
 * existe" em vez de "cannot read property of undefined", que se lê como qualquer outra coisa.
 */
export function instanciarPorTipos<T>(
  classe: new (...args: any[]) => T,
  mapa: Record<string, unknown>,
  fonte: { arquivo: string[]; classe: string },
): T {
  const texto = fonteOuNulo(...fonte.arquivo);
  if (texto === null) throw new Error(`fonte ausente: ${fonte.arquivo.join("/")}`);
  const tipos = tiposDoConstrutorDaFonte(texto, fonte.classe);
  if (tipos.length === 0) {
    throw new Error(`construtor de ${fonte.classe} não foi lido: o auxiliar precisa de ajuste`);
  }
  const args = tipos.map((nome) => (nome in mapa ? mapa[nome] : {}));
  return new classe(...args);
}

/** Tudo o que foi escrito, registrado, enfileirado e logado, em uma string só, para a caça. */
export function textoDeTudo(partes: unknown[]): string {
  return coletarStrings(partes).join("\n");
}
