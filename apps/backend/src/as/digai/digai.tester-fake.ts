import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA A INTEGRACAO DIGAI ──────────────────────────────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUCAO. O sufixo `.tester-fake` e deliberado e tem motivo
 * registrado nesta casa: na onda B1 o agente que construiu escolheu, de boa-fe, o mesmo nome de
 * arquivo que o `tester` havia escolhido, e sobrescreveu o teste em silencio.
 *
 * ┌─ ESTE ARQUIVO FOI ESCRITO ANTES DO CODIGO (secao A.38 e secao A.40 regra 2) ────────────────┐
 * │ Nada aqui foi lido da implementacao, porque nao ha implementacao: o contrato vem do          │
 * │ REQUISITO (docs/MAPA-ALCANCE-DIGAI.md, docs/PROTOCOLO-LGPD-FABRICA.md e a PARTE 2 do         │
 * │ DIARIO.md). Os NOMES abaixo sao PROPOSTA deste arquivo. Por isso o carregamento e por        │
 * │ importacao dinamica resolvida em tempo de teste, e nao por `import` de topo: enquanto o      │
 * │ modulo nao existir, cada teste falha com UMA FRASE dizendo o que falta, em vez de o arquivo  │
 * │ inteiro morrer na coleta. Se a construcao escolher outros nomes, ajusta-se AQUI, num lugar.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SECAO A.6 e PROTOCOLO LGPD: nenhum dado real entra aqui. Os CPFs sao SINTETICOS, com digito
 * verificador valido (conferidos contra `isValidCpf`), porque um CPF invalido seria recusado antes
 * de o teste chegar na regra que ele quer provar, e o verde viria pelo motivo errado.
 */

// ── 1. O CONTRATO: onde cada peca deve morar ────────────────────────────────

export const CAMINHOS = {
  /** A grade de acesso: allowlist de metodo, de rota, anti-SSRF, anti-PII, inspecao de fonte. */
  grade: "./digai-grade",
  /** O dominio puro: etapas de triagem, situacao de nascimento, leitura do estagio. */
  dominio: "../../domain/digai",
  /** O cliente HTTP autenticado por Bearer, que so fala com a rede ATRAVES da grade. */
  cliente: "./digai.cliente",
  /** A importacao idempotente dos candidatos de triagem para o funil. */
  importacao: "./digai-importacao.service",
  /** O reengajamento (reenvio do link de triagem, do NOSSO lado). */
  reengajar: "./digai-reengajar.service",
  /** Os corpos das rotas (DTOs), inclusive o aceite do lote. */
  dto: "./digai.dto",
  /** A controller, que e onde o RBAC das rotas mora. */
  controller: "./digai.controller",
  /**
   * O RECEPTOR do evento `NEW_APPLICATION`: a rota publica que o Digai chama quando o candidato
   * finaliza a triagem. Espelha `pandape-webhook.controller.ts` (secao A.5).
   */
  webhook: "./digai-webhook.controller",
  /** O guard de ORIGEM do receptor, no molde do `PandapeWebhookGuard`: token proprio, fail-closed. */
  guardaWebhook: "./digai-webhook.guard",
  /** A fila do Digai: nome, prefixo, banco Redis e o LIMITER que cabe no teto de 120 req/min. */
  fila: "./digai.queue",
} as const;

export type PecaDoDigai = keyof typeof CAMINHOS;

/**
 * Carrega uma peca do contrato, ou devolve `null` quando ela ainda nao existe.
 *
 * NAO LANCA de proposito: quem chama transforma a ausencia numa assercao com frase util. O
 * `catch` e estreito por necessidade (um erro de sintaxe DENTRO do modulo tambem chega aqui), e e
 * por isso que a mensagem original e preservada em `erro`: teste que falha por defeito de
 * compilacao nao pode ser confundido com teste que falha por falta de implementacao.
 */
export async function carregar(
  peca: PecaDoDigai,
): Promise<{ mod: Record<string, unknown> | null; erro: string | null }> {
  try {
    const mod = (await import(CAMINHOS[peca])) as Record<string, unknown>;
    return { mod, erro: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ausente = /Cannot find module|Failed to load url|ERR_MODULE_NOT_FOUND/i.test(msg);
    return { mod: null, erro: ausente ? null : msg };
  }
}

/** Exige a peca inteira. Falha com a frase que diz QUAL arquivo falta. */
export async function exigirPeca(peca: PecaDoDigai): Promise<Record<string, unknown>> {
  const { mod, erro } = await carregar(peca);
  expect(erro, `a peca '${peca}' existe mas NAO CARREGA, e isto e defeito de codigo, nao ausencia de implementacao: ${erro}`).toBeNull();
  expect(
    mod,
    `FALTA IMPLEMENTAR: a peca '${peca}' da integracao Digai, esperada em '${CAMINHOS[peca]}' (relativo a apps/backend/src/as/digai/).`,
  ).not.toBeNull();
  return mod as Record<string, unknown>;
}

/** Exige um export nomeado da peca. */
export async function exigirExport<T = unknown>(peca: PecaDoDigai, nome: string): Promise<T> {
  const mod = await exigirPeca(peca);
  expect(
    mod[nome],
    `FALTA IMPLEMENTAR: '${nome}' nao e exportado por '${CAMINHOS[peca]}'. Presentes hoje: ${Object.keys(mod).join(", ") || "nenhum"}.`,
  ).toBeDefined();
  return mod[nome] as T;
}

// ── 2. DADOS SINTETICOS. ZERO PII REAL ──────────────────────────────────────

/**
 * CPFs SINTETICOS com digito verificador valido. Conferidos contra `isValidCpf` no proprio spec
 * de dominio, porque um numero que o validador recusa faria o teste de "com CPF finalizou" passar
 * pelo caminho errado.
 */
export const CPF_SINTETICO = {
  finalizou: "11122233396",
  outroFinalizou: "22233344405",
  terceiro: "55566677720",
} as const;

/**
 * ─ UM REGISTRO CRU DO DIGAI, NA FORMA QUE A PRODUCAO DO FORNECEDOR DEVOLVE DE VERDADE ──────────
 *
 * ┌─ A LICAO, E ELA CUSTOU 174 TESTES VERDES SOBRE UM CONTRATO ERRADO ───────────────────────────┐
 * │ ESTE FAKE TINHA UM CAMPO `name`, E `name` NAO EXISTE NO FORNECEDOR. A sondagem da producao em │
 * │ 29/09/2026 mediu `name` em 0 de 58 registros de um screening real: o que existe e `firstname` │
 * │ e `lastname`, SEPARADOS. Como o fake inventava o campo, toda a suite concordava com ele e     │
 * │ NINGUEM viu que a producao nasceria com candidato sem nome.                                    │
 * │                                                                                               │
 * │ FAKE QUE NAO COPIA O FORNECEDOR NAO TESTA A INTEGRACAO, TESTA A SI MESMO. Ele so vale se a    │
 * │ forma dele tiver sido MEDIDA contra o outro lado, e e por isso que os campos abaixo tem a      │
 * │ presenca anotada.                                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Presenca medida numa pagina de 58 registros: `userId` 58/58, `partnerJobId` 58/58 (numerico de 7
 * digitos, o id da vaga do Pandape), `appliedAt` 58/58, `email` 58/58, `phoneNumber` 58/58,
 * `stages` 58/58, `cpf` 4/58, `partnerUserId` 0/58, `name` 0/58.
 *
 * Os campos de JULGAMENTO entram aqui de proposito, para que a projecao tenha o que RECUSAR: eles
 * existem no fornecedor e nao podem existir do lado de ca (protocolo, secao 3).
 */
export function resultadoDigaiFingido(over: Partial<ResultadoDigai> = {}): ResultadoDigai {
  return {
    userId: "usr-sintetico-1",
    partnerJobId: "1234567",
    firstname: "Fulano",
    lastname: "De Teste",
    email: "fulano.teste@exemplo.invalido",
    phoneNumber: "11900000001",
    cpf: null,
    appliedAt: "2026-09-10T12:00:00.000Z",
    stages: [],
    ...over,
  };
}

export interface ResultadoDigai {
  userId: string;
  partnerJobId: string | null;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  phoneNumber: string | null;
  cpf: string | null;
  appliedAt: string | null;
  stages: unknown[];
}

/**
 * ─ O ENVELOPE DO FORNECEDOR, E TODA RESPOSTA VEM DENTRO DELE ───────────────────────────────────
 *
 * Forma medida em 29/09/2026: `{ message: [...], data: { value: <conteudo> } }`. `data` e OBJETO,
 * nunca array, e nao existe `results` no topo. Fake que devolve o conteudo PELADO faz a leitura
 * passar sem nunca ter desembrulhado nada, que e exatamente o verde falso que esta rodada corrigiu.
 */
export function respostaDigaiFingida(conteudo: unknown): unknown {
  return { message: [], data: { value: conteudo } };
}

/** A listagem de resultados de um screening: a lista chama-se `candidates`, e nao `results`. */
export function paginaDeCandidatosFingida(candidates: unknown[]): unknown {
  return respostaDigaiFingida({ page: 1, total: candidates.length, candidates });
}

// ── 3. A CACA AO VALOR REAL (armadilha 2 do protocolo, seccao 1.1) ──────────

/**
 * PROCURA O VALOR REAL NA SAIDA, e nao o placeholder.
 *
 * ┌─ POR QUE ESTA FUNCAO EXISTE, e ela e a licao do veto 4 de 16/09 ───────────────────────────┐
 * │ O teste de mascaramento anterior procurava `<5` na saida e passava, porque o `<5` ESTAVA la │
 * │ e o valor real estava ao lado. Teste que procura o placeholder nao prova mascaramento: prova │
 * │ que alguem imprimiu um placeholder em algum lugar.                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As VARIACOES importam tanto quanto o valor: um CPF vaza formatado, sem mascara, so os digitos,
 * ou dentro de JSON escapado. Procurar so a forma que o teste escreveu deixa tres portas abertas.
 */
export function variacoesDoValor(valor: string): string[] {
  const so = valor.replace(/\D/g, "");
  const formas = new Set<string>([valor, valor.toLowerCase(), valor.toUpperCase()]);
  if (so.length === 11) {
    formas.add(so);
    formas.add(`${so.slice(0, 3)}.${so.slice(3, 6)}.${so.slice(6, 9)}-${so.slice(9)}`);
    formas.add(`${so.slice(0, 3)} ${so.slice(3, 6)} ${so.slice(6, 9)} ${so.slice(9)}`);
  }
  return [...formas].filter((f) => f.length >= 4);
}

/** Devolve as ocorrencias de PII encontradas numa saida qualquer. Vazio = limpo. */
export function piiNaSaida(saida: unknown, valores: readonly string[]): string[] {
  const texto = typeof saida === "string" ? saida : JSON.stringify(saida ?? "");
  const alvo = texto.toLowerCase();
  const achados: string[] = [];
  for (const valor of valores) {
    for (const forma of variacoesDoValor(valor)) {
      if (alvo.includes(forma.toLowerCase())) achados.push(forma);
    }
  }
  return [...new Set(achados)];
}

// ── 4. LEITURA DO FONTE DO MODULO (para as asercoes de forma) ───────────────

export const PASTA_DO_DIGAI = __dirname;

/** Todo o codigo de producao do modulo Digai, concatenado, sem os arquivos de teste. */
export function fonteDoModulo(pasta: string = PASTA_DO_DIGAI): string {
  const pedacos: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        andar(caminho);
        continue;
      }
      if (!nome.endsWith(".ts")) continue;
      if (nome.includes(".spec.") || nome.includes(".tester-fake.") || nome.includes(".fake.")) {
        continue;
      }
      pedacos.push(readFileSync(caminho, "utf8"));
    }
  };
  andar(pasta);

  /*
   * ─ O DOMINIO ENTRA NA VARREDURA, E ELE MORA FORA DA PASTA (achado do `seguranca`, 29/09) ─────
   *
   * `CAMINHOS.dominio` aponta para `../../domain/digai`, entao ele NAO estava sendo alcancado por
   * nenhuma assercao de fonte: "nao ha atalho de TLS", "nao ha token em codigo" e "nao se loga
   * campo de pessoa" eram afirmacoes sobre a pasta `as/digai` apenas, e o dominio e justamente
   * onde a mascara, o resumo e a montagem de erro vivem, ou seja o codigo que MAIS toca o valor.
   */
  const doDominio = join(pasta, "../../domain/digai.ts");
  if (existsSync(doDominio)) pedacos.push(readFileSync(doDominio, "utf8"));

  return pedacos.join("\n");
}

/**
 * O fonte do modulo, EXIGINDO que ele exista.
 *
 * ┌─ POR QUE A EXIGENCIA E PARTE DO TESTE, e nao burocracia ────────────────────────────────────┐
 * │ Toda assercao do tipo "o fonte NAO contem X" e VACUAMENTE VERDADEIRA enquanto nao ha fonte. │
 * │ Um arquivo vazio nao contem atalho de TLS, nao contem token e nao loga CPF, e os tres testes │
 * │ nascem VERDES afirmando garantias que ninguem deu. E o mesmo verde falso do veto 4 de 16/09, │
 * │ por outra porta: o teste procurava a AUSENCIA em vez de o valor.                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function fonteExigida(): string {
  const fonte = fonteDoModulo();
  expect(
    fonte.trim().length,
    "FALTA IMPLEMENTAR: nao ha codigo de producao no modulo Digai. Sem fonte, toda assercao de AUSENCIA passa de graca.",
  ).toBeGreaterThan(0);
  return fonte;
}

/** So o SQL/TS que executa: linha de comentario fora, para asercao de forma nao ler comentario. */
export function semComentario(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

// ── 5. A SUSPENSAO POR AUSENCIA MEDIDA, E A SENTINELA QUE A DESFAZ ──────────

/**
 * POR QUE A MEDIDA E SINCRONA, LENDO O DISCO, e nao o `carregar` assincrono daqui de cima.
 *
 * O vitest monta os `describe` na COLETA, que e sincrona: quando a promessa do `import()` dinamico
 * resolvesse, os blocos ja estariam registrados e a decisao de suspender chegaria tarde. Um
 * `await` de topo resolveria no papel, mas so em ESM puro, e esta casa compila o backend em
 * CommonJS (o proprio arquivo usa `__dirname`). Entao a pergunta "a peca existe?" e respondida do
 * jeito mais honesto que responde a tempo: PROCURANDO O ARQUIVO NO DISCO.
 *
 * A diferenca entre as duas medidas e conhecida e aceita: o disco responde "o arquivo existe", o
 * `carregar` responde "o modulo carrega". Para decidir a SUSPENSAO, existir basta, e e o que se
 * quer: no instante em que a primeira peca aparecer, mesmo quebrada, a suite tem de acordar.
 */
const SUFIXOS_DE_MODULO = [".ts", ".tsx", ".js", "/index.ts", "/index.js"] as const;

/** As pecas do contrato que JA EXISTEM no disco. Vazio = a frente continua pendente. */
export function pecasPresentes(): PecaDoDigai[] {
  return (Object.keys(CAMINHOS) as PecaDoDigai[]).filter((peca) => {
    const base = join(PASTA_DO_DIGAI, CAMINHOS[peca]);
    if (SUFIXOS_DE_MODULO.some((sufixo) => existsSync(`${base}${sufixo}`))) return true;
    return existsSync(base) && statSync(base).isDirectory();
  });
}

/**
 * A medida, tirada UMA VEZ na coleta. Nao ha interruptor para alguem esquecer de virar: a
 * suspensao e DERIVADA da ausencia, e ela se desfaz sozinha quando a ausencia acabar.
 */
export const PECAS_PRESENTES: readonly PecaDoDigai[] = pecasPresentes();

/** Quais das pecas pedidas ainda NAO estao no disco. Vazio = o bloco pode rodar. */
export function pecasFaltando(...pecas: PecaDoDigai[]): PecaDoDigai[] {
  return pecas.filter((peca) => !PECAS_PRESENTES.includes(peca));
}

type BlocoDeSuite = (nome: string, corpo: () => void) => void;

/**
 * ─ A SUSPENSAO E POR PECA, E NAO GLOBAL (correcao de 29/09/2026) ────────────────────────────────
 *
 * ┌─ O QUE ESTAVA ERRADO NO DESENHO DE 21/09, e ele quebraria a construcao de hoje ──────────────┐
 * │ `DIGAI_SUSPENSO` era UM booleano para o modulo inteiro: suspendia TUDO enquanto NENHUMA peca │
 * │ existisse, e acordava TUDO no minuto em que a PRIMEIRA nascesse. Funciona quando a frente     │
 * │ nasce inteira de uma vez, e so entao. A OST de 29/09 constroi `grade`, `dominio`, `cliente`,  │
 * │ `importacao`, `dto` e `controller`, e NAO pede o `reengajar` (secao A.31: so o que a OST      │
 * │ pede; o que falta se PROPOE). Com a medida global, o nascimento da primeira peca acordaria    │
 * │ junto as 24 assercoes do reengajar, que ficariam vermelhas cobrando um arquivo que ninguem    │
 * │ pediu, e a saida mais facil dali seria apagar ou silenciar cobertura boa.                     │
 * │                                                                                                │
 * │ ENTAO CADA BLOCO DECLARA DE QUE PECAS ELE PRECISA, e so acorda quando TODAS elas existirem.   │
 * │ As duas propriedades que o desenho antigo tinha continuam valendo, e agora por bloco:          │
 * │  1. acorda SOZINHO, sem ninguem virar interruptor;                                             │
 * │  2. nao ha `skip` eterno, porque a sentinela deste arquivo diz, em toda rodada, exatamente     │
 * │     qual peca falta para cada arquivo (e `skip` que ninguem lembra de reativar e pior que      │
 * │     teste nenhum).                                                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function suspensoSem(...pecas: PecaDoDigai[]): BlocoDeSuite {
  return pecasFaltando(...pecas).length === 0 ? describe : describe.skip;
}

/**
 * A SENTINELA, agora POR ARQUIVO E POR PECA. Roda SEMPRE, e tem duas caras:
 *
 *  - com peca faltando, ela PASSA e o NOME do teste diz quais faltam. E o unico jeito de uma suite
 *    suspensa continuar aparecendo em toda rodada, em vez de virar um `skip` que ninguem le.
 *  - com todas presentes, ela vira TRABALHO DE VERDADE: exige que cada peca CARREGUE. Peca que
 *    existe e nao importa (erro de sintaxe, ciclo de import, export faltando no barril) produziria
 *    N vermelhos confusos espalhados pelos blocos; aqui produz UM, dizendo o nome do modulo e a
 *    mensagem original do carregador.
 *
 * O ARQUIVO SO PRECISA LISTAR AS PECAS DELE. A sentinela do `reengajar` continua dizendo "falta
 * reengajar" hoje, e no dia em que `digai-reengajar.service.ts` nascer aquele arquivo acorda
 * sozinho, inteiro, e fica vermelho ate a implementacao satisfazer o contrato de 21/09.
 */
export function sentinelaDasPecas(arquivo: string, pecas: readonly PecaDoDigai[]): void {
  const faltando = pecasFaltando(...pecas);

  if (faltando.length > 0) {
    it(`SENTINELA de ${arquivo}: suspenso enquanto faltar [${faltando.join(", ")}]`, () => {
      for (const peca of faltando) {
        expect(
          CAMINHOS[peca],
          `a peca '${peca}' nao esta em CAMINHOS. Nome de peca que ninguem registrou faz o bloco dormir para sempre acreditando que a implementacao nao chegou.`,
        ).toBeTruthy();
      }
      expect(
        pecas.length,
        "um arquivo que nao declara peca nenhuma nunca suspende e nunca acorda: a declaracao e obrigatoria.",
      ).toBeGreaterThan(0);
    });
    return;
  }

  it(`SENTINELA de ${arquivo}: as pecas [${pecas.join(", ")}] chegaram, e a suite ACORDOU`, async () => {
    for (const peca of pecas) {
      const { erro } = await carregar(peca);
      expect(
        erro,
        `a peca '${peca}' (${CAMINHOS[peca]}) existe no disco mas NAO CARREGA. Isto e defeito de codigo, nao ausencia de implementacao: ${erro}`,
      ).toBeNull();
    }
    // O TEMPO E FOLGADO DE PROPOSITO: este `it` IMPORTA as pecas, e a primeira importacao do modulo
    // do Digai puxa o Nest junto. Com o padrao de 5s ele falhava por frieza de cache, que e a pior
    // especie de vermelho: o que nao diz nada sobre o codigo e ensina a gente a ignorar vermelho.
  }, 30_000);
}

// ── 6. O EVENTO DO WEBHOOK, E OS DUBLES DE REQUISICAO ───────────────────────

/**
 * O CORPO CRU DO EVENTO `NEW_APPLICATION`, com PII SINTETICA DENTRO, de proposito.
 *
 * ┌─ POR QUE A FIXTURE CARREGA E-MAIL, TELEFONE E NOME ──────────────────────────────────────────┐
 * │ Porque o evento real carrega. Uma fixture higienizada provaria que um payload limpo nao suja  │
 * │ o log, que e uma frase verdadeira sobre coisa nenhuma. O que se quer provar e que o payload   │
 * │ SUJO nao chega ao log, a mensagem de erro nem a FILA, e para isso o dado tem de estar la e    │
 * │ ser procurado NA SAIDA pelo VALOR (`piiNaSaida`), nunca pelo placeholder (licao do veto 4).   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function eventoDigaiFingido(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event: "NEW_APPLICATION",
    screeningId: "sc-sintetico-1",
    userId: "usr-sintetico-1",
    candidate: {
      name: "Fulano De Teste",
      email: "fulano.teste@exemplo.invalido",
      phoneNumber: "11900000001",
      cpf: CPF_SINTETICO.finalizou,
    },
    occurredAt: "2026-09-29T12:00:00.000Z",
    ...over,
  };
}

/** A PII que o evento fingido carrega, que e exatamente o que nao pode sair em lugar nenhum. */
export const PII_DO_EVENTO = [
  "Fulano De Teste",
  "fulano.teste@exemplo.invalido",
  "11900000001",
  CPF_SINTETICO.finalizou,
] as const;

/**
 * Um `ExecutionContext` do Nest reduzido ao que um guard de origem usa: headers, corpo e socket.
 * Nao se importa `@nestjs/common` aqui de proposito: o guard so precisa do FORMATO, e o duble
 * mantem o teste sem Nest de pe.
 */
export function contextoFingido(req: {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
}): { switchToHttp: () => { getRequest: <T>() => T } } {
  const requisicao = {
    headers: req.headers ?? {},
    body: req.body ?? {},
    socket: req.socket ?? { remoteAddress: "127.0.0.1" },
  };
  return { switchToHttp: () => ({ getRequest: <T>() => requisicao as unknown as T }) };
}

/** Um `ConfigService` reduzido ao `get`, para provar o fail-closed SEM credencial e COM ela. */
export function configFingida(vars: Record<string, string | undefined>): {
  get: <T>(chave: string) => T | undefined;
} {
  return { get: <T>(chave: string) => vars[chave] as unknown as T | undefined };
}
