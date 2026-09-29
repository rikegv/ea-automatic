import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  CPF_SINTETICO,
  PII_DO_EVENTO,
  configFingida,
  contextoFingido,
  eventoDigaiFingido,
  exigirExport,
  exigirPeca,
  fonteExigida,
  piiNaSaida,
  resultadoDigaiFingido,
  semComentario,
  sentinelaDasPecas,
  suspensoSem,
} from "./digai.tester-fake";

/**
 * ─ O RECEPTOR, A SEGUNDA CHAMADA, O TETO E A VAGA EM REVISAO ────────────────────────────────────
 *
 * ESTE ARQUIVO E DO `tester`, escrito ANTES do codigo (secao A.38, secao A.40 regra 2), a partir de
 * `docs/MAPA-ALCANCE-INGESTAO-DIGAI.md`, `docs/PROTOCOLO-LGPD-FABRICA.md` e do parecer adversarial
 * do `seguranca` sobre o mapa (29/09/2026). ZERO leitura de implementacao: ela nao existe.
 *
 * ┌─ O QUE O CONTRATO DE 21/09 NAO COBRIA, E POR ISSO ESTE ARQUIVO EXISTE ──────────────────────┐
 * │ Aquele contrato cobre a GRADE, o ZERO PII, o FUNIL e o REENGAJAR. Ele nao cobre o caminho    │
 * │ de ENTRADA: o evento `NEW_APPLICATION` que o Digai nos manda quando o candidato finaliza a   │
 * │ triagem, a SEGUNDA chamada que busca o que o evento nao traz, o TETO de vazao e a VAGA que   │
 * │ nasce sem cliente e cai na fila de revisao.                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SUSPENSO POR PECA (o mecanismo de 29/09) ───────────────────────────────────────────────────┐
 * │ Cada bloco declara de que pecas precisa e acorda sozinho quando elas existirem. As pecas do  │
 * │ receptor (`webhook`, `guardaWebhook`) e da fila (`fila`) NAO estao na OST de hoje: estes     │
 * │ blocos nascem suspensos e acordam no dia em que os arquivos nascerem, sem interruptor.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SECAO A.6 e protocolo: nenhum dado real. O CPF e sintetico com digito valido; o e-mail, o nome e
 * o telefone sao de fantasia e existem para serem PROCURADOS NA SAIDA e nao encontrados.
 */
sentinelaDasPecas("digai.webhook-e-teto.tester.spec.ts", [
  "grade",
  "dominio",
  "importacao",
  "webhook",
  "guardaWebhook",
  "fila",
]);

/** O receptor: a controller publica e o guard de origem. Nao estao na OST de 29/09. */
const comReceptor = suspensoSem("webhook", "guardaWebhook");
/** A fila propria do Digai, onde mora o limiter. Tambem fora da OST de 29/09. */
const comFila = suspensoSem("fila");
/** A grade, que nasce hoje. */
const comGrade = suspensoSem("grade");
/** O dominio puro mais o servico de importacao, os dois de hoje. */
const comIngestao = suspensoSem("dominio", "importacao");

/** O travessao por CODIGO, nunca digitado (secao A.11). */
const TRAVESSAO = String.fromCharCode(0x2014);

// ═══ (a) O WEBHOOK `NEW_APPLICATION` ═══════════════════════════════════════════════════════════

/**
 * ┌─ O CONTRATO DE CONSTRUCAO DO RECEPTOR, dito aqui porque e PROPOSTA e nao leitura ───────────┐
 * │ `new DigaiWebhookGuard(config)` e `new DigaiWebhookController(fila)`, no molde exato do      │
 * │ Pandape (`pandape-webhook.guard.ts`, `pandape-webhook.controller.ts`). Se a construcao       │
 * │ preferir outra forma, ajusta-se AQUI, nas duas funcoes abaixo, e nao em vinte testes.        │
 * │                                                                                              │
 * │ TOKEN-ONLY, UM MECANISMO SO. Nao se copia a allowlist de IP do Pandape: la ela existe por    │
 * │ causa do NAT do box do Fernando e esta VAZIA de proposito, e o guard de la autoriza por      │
 * │ QUALQUER um dos dois. Aqui seria superficie a mais sem necessidade nenhuma.                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
interface GuardDoDigai {
  canActivate(ctx: unknown): boolean | Promise<boolean>;
}

async function guarda(vars: Record<string, string | undefined>): Promise<GuardDoDigai> {
  const Guard = await exigirExport<new (config: unknown) => GuardDoDigai>(
    "guardaWebhook",
    "DigaiWebhookGuard",
  );
  return new Guard(configFingida(vars));
}

/** Devolve a mensagem da recusa, ou `null` quando o guard autorizou. */
async function recusaDoGuard(
  g: GuardDoDigai,
  headers: Record<string, string | undefined>,
  body: unknown,
): Promise<string | null> {
  try {
    const ok = await g.canActivate(contextoFingido({ headers, body }));
    return ok ? null : "recusado sem excecao";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const TOKEN_FINGIDO = "token-sintetico-de-teste-0000000000";

comReceptor("o receptor e FAIL-CLOSED, e a condicao e REAL", () => {
  it("SEM credencial configurada a rota responde 401, e nunca 200", async () => {
    /**
     * ┌─ O VETO 1 DE 16/09, E ELE E A ARMADILHA DESTE TESTE ────────────────────────────────────┐
     * │ Aquele veto foi um portao que testava CONDICAO IMPOSSIVEL: o teste passava porque a      │
     * │ condicao nunca podia ser satisfeita, e nao porque a guarda funcionava. Por isso este      │
     * │ caso usa uma requisicao LEGITIMA em tudo o mais (corpo valido, header de token presente   │
     * │ e correto) e muda UMA coisa: a credencial nao esta configurada no ambiente. O que barra   │
     * │ tem de ser o fail-closed, e nada alem dele.                                              │
     * └─────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const g = await guarda({ DIGAI_WEBHOOK_TOKEN: undefined });
    const motivo = await recusaDoGuard(
      g,
      { "x-digai-webhook-token": TOKEN_FINGIDO },
      eventoDigaiFingido(),
    );
    expect(
      motivo,
      "sem credencial a rota tem de ficar FECHADA (401). Rota publica que autoriza porque 'ainda nao ha token' e uma porta aberta esperando alguem descobrir a URL.",
    ).not.toBeNull();
  });

  it("com credencial configurada, o token ERRADO e recusado e o CERTO passa", async () => {
    const g = await guarda({ DIGAI_WEBHOOK_TOKEN: TOKEN_FINGIDO });
    expect(
      await recusaDoGuard(g, { "x-digai-webhook-token": "outro-token-qualquer" }, eventoDigaiFingido()),
      "token errado tem de ser recusado, senao a comparacao nao esta sendo feita.",
    ).not.toBeNull();
    expect(
      await recusaDoGuard(g, {}, eventoDigaiFingido()),
      "sem header nenhum tambem e recusa: a ausencia nao pode virar autorizacao.",
    ).not.toBeNull();
    expect(
      await recusaDoGuard(g, { "x-digai-webhook-token": TOKEN_FINGIDO }, eventoDigaiFingido()),
      "o token certo tem de passar. Guard que barra tudo nao protege nada: ele so adia a descoberta de que ninguem o usa.",
    ).toBeNull();
  });

  it("a comparacao do token e em TEMPO CONSTANTE, e nunca `===` de string", async () => {
    /**
     * `===` de string sai no primeiro caractere diferente, e a diferenca de tempo entre um token
     * que erra no primeiro caractere e um que erra no ultimo e mensuravel pela rede. O precedente
     * da casa e `timingSafeEqual` (`pandape-webhook.guard.ts:75`), com a comparacao de tamanho
     * ANTES, porque o `crypto` lanca quando os buffers tem comprimentos diferentes.
     */
    const fonte = semComentario(fonteExigida());
    expect(
      /timingSafeEqual/.test(fonte),
      "o receptor do Digai nao usa comparacao em tempo constante para o token de origem.",
    ).toBe(true);
    const comparacaoFrouxa = [
      ...fonte.matchAll(/\b(?:recebido|token|esperado|assinatura)\w*\s*(?:===|!==|==)\s*\w/gi),
    ].map((m) => m[0]);
    expect(
      comparacaoFrouxa,
      "comparacao de credencial por igualdade de string vaza tempo. Use `timingSafeEqual` com a checagem de comprimento antes.",
    ).toEqual([]);
  });

  it("o guard NAO aceita allowlist de IP como segundo caminho", async () => {
    /**
     * O `PandapeWebhookGuard` autoriza por token OU por IP (`:50-57`), e a allowlist de IP existe
     * la por causa do NAT do box do Fernando, VAZIA de proposito. Copiar o desenho para ca criaria
     * um segundo caminho de autorizacao que ninguem precisa, e cada caminho a mais e uma chance a
     * mais de um deles ficar frouxo sem que o outro acuse.
     */
    const g = await guarda({ DIGAI_WEBHOOK_IPS: "1.2.3.4", DIGAI_WEBHOOK_TOKEN: undefined });
    expect(
      await recusaDoGuard(
        g,
        { "x-forwarded-for": "1.2.3.4", "x-digai-webhook-token": undefined },
        eventoDigaiFingido(),
      ),
      "o Digai e TOKEN-ONLY: um IP na allowlist nao pode autorizar sozinho, e a variavel nem deveria ser lida.",
    ).not.toBeNull();
  });
});

/** O mundo falso do receptor: a fila que anota o que foi enfileirado, e a resposta que anota o status. */
interface BancadaDoReceptor {
  enfileirados: Array<{ jobId?: string; payload: unknown }>;
  statusRespondido: number[];
  chamadasDeEnriquecimento: string[];
  receber(corpo: unknown): Promise<unknown>;
}

async function bancadaDoReceptor(): Promise<BancadaDoReceptor> {
  const Controller = await exigirExport<new (fila: unknown, cliente?: unknown) => {
    receber(corpo: unknown, res: unknown): Promise<unknown>;
  }>("webhook", "DigaiWebhookController");

  const enfileirados: BancadaDoReceptor["enfileirados"] = [];
  const statusRespondido: number[] = [];
  const chamadasDeEnriquecimento: string[] = [];

  const fila = {
    enfileirarEvento: async (payload: unknown, opcoes?: { jobId?: string }) => {
      enfileirados.push({ jobId: opcoes?.jobId, payload });
      return true;
    },
  };

  /** Qualquer metodo do cliente conta como enriquecimento: ele e do WORKER, nunca da rota. */
  const cliente = new Proxy(
    {},
    {
      get:
        (_alvo, nome: string) =>
        (...args: unknown[]) => {
          chamadasDeEnriquecimento.push(`${nome}(${JSON.stringify(args)})`);
          return Promise.resolve({});
        },
    },
  );

  const controller = new Controller(fila, cliente);
  const res = { status: (n: number) => { statusRespondido.push(n); return res; } };

  return {
    enfileirados,
    statusRespondido,
    chamadasDeEnriquecimento,
    receber: (corpo: unknown) => controller.receber(corpo, res),
  };
}

comReceptor("o corpo do evento NAO vai para a fila, nem para o log, nem para o erro", () => {
  /**
   * ┌─ O QUE SE ENFILEIRA E A LISTA FECHADA DE IDENTIFICADORES TECNICOS, E NADA ALEM ──────────┐
   * │ O payload do BullMQ FICA NO REDIS, com `removeOnFail` e sem TTL, fora do alcance de um    │
   * │ expurgo que so conhece Postgres. Redis com e-mail e telefone dentro e banco de dados com  │
   * │ outro nome, e ninguem o auditaria. O precedente medido e o achado 2 do `seguranca` na      │
   * │ varredura do Pandape (`ingestao-varredura.queue.ts:44-51`: o job e `{ idVacancy, page }`). │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const CHAVES_PERMITIDAS = ["screeningId", "userId", "attemptId"];

  it("o que se enfileira sao SO identificadores tecnicos, e a PII do corpo nao vai junto", async () => {
    const b = await bancadaDoReceptor();
    await b.receber(eventoDigaiFingido());

    expect(b.enfileirados.length, "o evento tem de ser enfileirado.").toBe(1);
    const { payload } = b.enfileirados[0];
    expect(
      piiNaSaida(payload, [...PII_DO_EVENTO]),
      "o corpo do evento carrega nome, e-mail, telefone e CPF. Nada disso pode entrar no job: o payload do BullMQ persiste no Redis sem TTL.",
    ).toEqual([]);

    const chaves = Object.keys((payload ?? {}) as Record<string, unknown>);
    expect(chaves.length, "job vazio nao identifica nada: os ids tecnicos tem de estar la.").toBeGreaterThan(0);
    for (const chave of chaves) {
      expect(
        CHAVES_PERMITIDAS,
        `a chave '${chave}' entrou no job. A lista e FECHADA: ${CHAVES_PERMITIDAS.join(", ")}. Campo a mais hoje e campo esquecido no Redis amanha.`,
      ).toContain(chave);
    }
  });

  it("o corpo cru nao aparece na mensagem de erro de um evento invalido", async () => {
    /**
     * `throw new Error(\`payload invalido: ${"$"}{JSON.stringify(body)}\`)` e o jeito mais natural
     * de escrever esta linha, e ele poe o corpo no log da aplicacao E no `failedReason` do job.
     * O erro diz o MOTIVO; o corpo nao entra nele.
     */
    const b = await bancadaDoReceptor();
    let mensagem = "";
    try {
      await b.receber(eventoDigaiFingido({ screeningId: undefined, userId: undefined }));
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    expect(
      piiNaSaida(mensagem, [...PII_DO_EVENTO]),
      "a mensagem de erro carregou dado pessoal do corpo (protocolo, secao 1). O erro diz o motivo e o id tecnico, nada mais.",
    ).toEqual([]);
  });

  it("nenhuma linha do modulo serializa o corpo do evento para dentro de um erro ou de um log", async () => {
    const fonte = semComentario(fonteExigida());
    const serializacoes = [
      ...fonte.matchAll(/JSON\.stringify\(\s*(?:body|payload|corpo|evento|req\.body)\b/gi),
    ].map((m) => m[0]);
    expect(
      serializacoes,
      "serializar o corpo o poe no log, no stack trace e no `failedReason` do job de uma vez so. Se precisar de diagnostico, logue as CHAVES presentes, nunca os valores.",
    ).toEqual([]);
  });

  it("o corpo nao persiste: nem coluna de payload bruto, nem tabela de recebimento", async () => {
    const fonte = semComentario(fonteExigida());
    const persistencias = [
      ...fonte.matchAll(/payload_bruto|payloadBruto|corpo_bruto|corpoBruto|body_raw|rawBody/gi),
    ].map((m) => m[0]);
    expect(
      persistencias,
      "o corpo do evento nao se guarda em lugar nenhum: nem coluna, nem tabela de recebimento, nem arquivo. O que se guarda e o rastro (quem, o que, quando), sem o valor (protocolo, secao 4).",
    ).toEqual([]);
  });
});

comReceptor("responde rapido e enfileira: o enriquecimento e do WORKER", () => {
  it("responde 202 e NAO chama o Digai dentro da rota", async () => {
    const b = await bancadaDoReceptor();
    await b.receber(eventoDigaiFingido());
    expect(
      b.statusRespondido,
      "202 Accepted e 'aceito e enfileirado'. Processar sincrono na rota segura o fornecedor no timeout dele e transforma qualquer lentidao nossa em reentrega.",
    ).toContain(202);
    expect(
      b.chamadasDeEnriquecimento,
      "a rota chamou a API do Digai. A segunda chamada e do WORKER, que e quem roda sob o limiter: na rota ela fura o teto e amarra a resposta ao tempo do terceiro.",
    ).toEqual([]);
  });
});

comReceptor("idempotencia: o MESMO evento entregue duas vezes nao cria duas pessoas", () => {
  it("as duas entregas produzem a MESMA chave de deduplicacao, derivada do `userId`", async () => {
    /**
     * A chave e o `userId`, que a varredura provou ESTAVEL (o CPF aparece depois no MESMO
     * registro, entao chave por CPF duplicaria exatamente quem finalizou). E ela NUNCA e hash do
     * corpo: hash do corpo obriga a guardar ou a re-serializar o corpo, que e o que nao pode
     * existir, e ainda muda quando o fornecedor acrescenta um campo qualquer ao evento.
     */
    const b = await bancadaDoReceptor();
    await b.receber(eventoDigaiFingido());
    await b.receber(eventoDigaiFingido());

    expect(b.enfileirados.length, "as duas entregas chegam: quem deduplica e a chave, nao o receptor.").toBe(2);
    const [um, dois] = b.enfileirados;
    expect(
      um.jobId,
      "sem `jobId`, duas entregas viram dois jobs e a corrida entre eles cria duas pessoas para a mesma pessoa.",
    ).toBeTruthy();
    expect(um.jobId, "a chave de deduplicacao tem de ser a mesma para o mesmo evento.").toBe(dois.jobId);
    expect(
      um.jobId?.includes("usr-sintetico-1"),
      "a chave e derivada do `userId`, que e o identificador tecnico estavel.",
    ).toBe(true);
    expect(
      piiNaSaida(um.jobId ?? "", [...PII_DO_EVENTO]),
      "CPF nunca entra em `jobId`: a chave do job vive no Redis e aparece em toda tela de diagnostico de fila.",
    ).toEqual([]);
  });

  it("o mesmo `userId` com CPF novo ATUALIZA, e nao cria uma segunda pessoa", async () => {
    const plano = await exigirExport<
      (e: { registros: unknown[]; jaImportados: readonly string[] }) => { criar: unknown[] }
    >("dominio", "planoDaImportacao");
    const chave = await exigirExport<(r: unknown) => string>("dominio", "chaveDoRegistroDigai");
    const antes = resultadoDigaiFingido({ userId: "usr-a", cpf: null });
    const depois = resultadoDigaiFingido({ userId: "usr-a", cpf: CPF_SINTETICO.finalizou });
    expect(
      plano({ registros: [depois], jaImportados: [chave(antes)] }).criar,
      "o CPF aparece DEPOIS no mesmo registro. Criar de novo cria uma segunda pessoa para a mesma pessoa, e a fusao nao se desfaz.",
    ).toEqual([]);
  });
});

// ═══ (b) A SEGUNDA CHAMADA, E O ID DE PAYLOAD COMO DADO NAO CONFIAVEL ══════════════════════════

comReceptor("o id que vem do PAYLOAD e dado NAO CONFIAVEL", () => {
  const ALFABETO = /^[A-Za-z0-9._-]{1,64}$/;

  const HOSTIS = [
    "../workspaces",
    "%2e%2e",
    "a%2fb",
    "a%00b",
    "sc1?x=1",
    "sc1#frag",
    "sc 1",
    "@evil.com",
    "a".repeat(65),
    CPF_SINTETICO.finalizou,
  ];

  it("o id e validado contra o alfabeto FECHADO no ponto em que SAI do payload", async () => {
    /**
     * ┌─ POR QUE A VALIDACAO NAO PODE VIVER SO NA GRADE ────────────────────────────────────────┐
     * │ A grade e a ultima barreira, e ela protege a URL. Mas o id do payload e interpolado em   │
     * │ mais lugares que a URL: chave de job, mensagem de log, `where` de consulta, nome de       │
     * │ arquivo. Validar so na grade deixa todos os outros caminhos sem dono, e o evento e a      │
     * │ unica entrada do sistema cujo conteudo QUEM ESCREVE E O FORNECEDOR.                       │
     * └─────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const extrair = await exigirExport<(corpo: unknown) => Record<string, string> | null>(
      "dominio",
      "identificadoresDoEvento",
    );

    const bom = extrair(eventoDigaiFingido());
    expect(bom, "o evento legitimo tem de ser aceito, senao a rota nao funciona para ninguem.").not.toBeNull();
    for (const [nome, valor] of Object.entries(bom ?? {})) {
      expect(
        ALFABETO.test(valor),
        `o identificador '${nome}' saiu do extrator sem passar pelo alfabeto fechado.`,
      ).toBe(true);
    }

    for (const hostil of HOSTIS) {
      expect(
        extrair(eventoDigaiFingido({ screeningId: hostil })),
        `o id hostil (${hostil.length} caracteres) foi aceito. O alfabeto e [A-Za-z0-9._-]{1,64}, e o curinga generico aceita encoding percentual (veto 2, 16/09).`,
      ).toBeNull();
    }
  });

  it("o extrator devolve SO id tecnico, e nunca o dado pessoal que veio junto", async () => {
    const extrair = await exigirExport<(corpo: unknown) => Record<string, string> | null>(
      "dominio",
      "identificadoresDoEvento",
    );
    expect(
      piiNaSaida(extrair(eventoDigaiFingido()), [...PII_DO_EVENTO]),
      "o extrator e o funil entre o corpo cru e o resto do sistema: o que ele deixa passar e o que vai para a fila, para o log e para o banco.",
    ).toEqual([]);
  });

  it("o erro do BANCO passa por tradutor antes de virar log ou `failedReason`", async () => {
    /**
     * O driver do Postgres devolve `detail` com o VALOR que violou a restricao: `Key (cpf)=(...)
     * already exists`. Isso vaza CPF sem ninguem nunca ter escrito a palavra CPF, e vai parar no
     * `failedReason` do job, que fica no Redis sem TTL.
     */
    const traduzir = await exigirExport<(e: unknown) => string>("dominio", "traduzirErroDeBanco");
    const erroDoDriver = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      detail: `Key (cpf)=(${CPF_SINTETICO.finalizou}) already exists.`,
      table: "as_candidatos",
    });
    const saida = traduzir(erroDoDriver);
    expect(
      piiNaSaida(saida, [CPF_SINTETICO.finalizou]),
      "o `detail` do driver carrega o VALOR que violou a restricao. Todo erro de banco passa por tradutor antes de chegar a log, a resposta ou a `failedReason`.",
    ).toEqual([]);
    expect(saida.length, "o erro traduzido tem de dizer alguma coisa: silencio nao e diagnostico.").toBeGreaterThan(0);
  });
});

comIngestao("sem `partnerJobId` resolvido, a criacao e ADIADA e reprocessavel", () => {
  it("o registro sem elo com a vaga nao vira candidatura orfa", async () => {
    const plano = await exigirExport<
      (e: { registros: unknown[]; jaImportados: readonly string[] }) => {
        criar: unknown[];
        adiar?: unknown[];
      }
    >("dominio", "planoDaImportacao");
    const saida = plano({
      registros: [resultadoDigaiFingido({ partnerJobId: null })],
      jaImportados: [],
    });
    expect(
      saida.criar,
      "sem elo com a vaga a importacao e ADIADA, nunca inventada, pelo mesmo precedente do `cod_cliente` do Pandape (secao A.5): inventar identidade de cliente e pior do que esperar.",
    ).toEqual([]);
  });

  it("o adiamento e REPROCESSAVEL: o registro volta a ser criavel quando o elo aparece", async () => {
    const plano = await exigirExport<
      (e: { registros: unknown[]; jaImportados: readonly string[] }) => { criar: Array<{ chave: string }> }
    >("dominio", "planoDaImportacao");
    const resolvido = plano({
      registros: [resultadoDigaiFingido({ partnerJobId: "1234567" })],
      jaImportados: [],
    });
    expect(
      resolvido.criar.length,
      "adiar so e honesto se o registro VOLTAR. Adiamento que marca como processado e descarte com outro nome.",
    ).toBe(1);
  });
});

// ═══ (c) O TETO DE 120 REQ/MIN ════════════════════════════════════════════════════════════════

comFila("a vazao do Digai cabe no teto de 120 req/min, com folga", () => {
  /**
   * ┌─ O NUMERO, E POR QUE ELE E 120 E NAO 500 ───────────────────────────────────────────────┐
   * │ A documentacao do Digai diz 500 por minuto; o fornecedor disse 120. ADOTA-SE O MENOR, e   │
   * │ isso nao e cautela decorativa: estourar o teto de um terceiro nao falha do nosso lado, e   │
   * │ quem sente e a operacao. O teto do Digai e PROPRIO, e nao se soma nem se confunde com o do │
   * │ Pandape, que e compartilhado com o webhook do G.Infor que alimenta a FOLHA (secao A.5).    │
   * │                                                                                            │
   * │ O LIMITER DO BULLMQ E POR FILA: duas filas com limiter proprio SOMAM os dois tetos. Foi    │
   * │ medido e documentado nesta casa em `ingestao-varredura.queue.ts:8-16`, quando a fila nova   │
   * │ de 250/5min ao lado de uma de 800/5min daria 1.050 contra um teto de 1.000.                 │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const TETO_DO_DIGAI = 120;

  /** Converte o limiter do BullMQ (`max` por `duration` em ms) em requisicoes por minuto. */
  function porMinuto(limiter: { max: number; duration: number }): number {
    return (limiter.max * 60_000) / limiter.duration;
  }

  it("o teto adotado esta declarado em codigo, e e o MENOR dos dois numeros", async () => {
    const teto = await exigirExport<number>("fila", "DIGAI_TETO_REQ_POR_MINUTO");
    expect(
      teto,
      "o teto adotado e 120 (a doc diz 500, o fornecedor disse 120). Numero que vive so no comentario volta a ser 500 na primeira refatoracao.",
    ).toBe(TETO_DO_DIGAI);
  });

  it("a SOMA dos limiters de TODAS as filas do Digai cabe no teto, com folga", async () => {
    const mod = await exigirPeca("fila");
    const limiters = Object.entries(mod)
      .filter(([nome]) => /WORKER_OPTIONS$/.test(nome))
      .map(([nome, valor]) => [nome, (valor as { limiter?: { max: number; duration: number } }).limiter] as const);

    expect(
      limiters.length,
      "nenhuma opcao de worker exportada. Fila sem limiter declarado e fila que so respeita o teto por sorte de latencia.",
    ).toBeGreaterThan(0);

    let soma = 0;
    for (const [nome, limiter] of limiters) {
      expect(limiter, `${nome} nao declara \`limiter\`. O limiter e POR FILA, e fila sem ele nao conta contra nada.`).toBeTruthy();
      soma += porMinuto(limiter as { max: number; duration: number });
    }
    expect(
      soma,
      `a soma dos limiters do Digai da ${soma} req/min contra um teto de ${TETO_DO_DIGAI}. O limiter e por fila e os tetos SOMAM: duas filas com folga individual estouram juntas.`,
    ).toBeLessThanOrEqual(TETO_DO_DIGAI * 0.8);
    expect(soma, "limiter que permite zero requisicao para tudo, e a fila nunca anda.").toBeGreaterThan(0);
  });

  it("a fila do Digai e ISOLADA: nome, prefixo e banco Redis proprios", async () => {
    const mod = await exigirPeca("fila");
    const nome = await exigirExport<string>("fila", "DIGAI_QUEUE");
    expect(nome.toLowerCase(), "o nome da fila diz de quem ela e.").toContain("digai");
    const prefixo = Object.entries(mod).find(([k]) => /PREFIX/i.test(k))?.[1] as string | undefined;
    expect(
      prefixo,
      "prefixo proprio no Redis e o que permite medir, drenar ou limpar a fila do Digai sem encostar na do Pandape, que atende o webhook da folha.",
    ).toBeTruthy();
    const db = Object.entries(mod).find(([k]) => /REDIS_DB/i.test(k))?.[1] as number | undefined;
    expect(db, "banco Redis proprio, pelo mesmo motivo do prefixo.").toBeTypeOf("number");
  });

  it("o job que falha nao guarda payload para sempre no Redis", async () => {
    /**
     * `removeOnFail` nas filas desta casa chega a 5.000, e o BullMQ retem o payload, o
     * `failedReason` e o `stacktrace` junto, SEM TTL, fora do alcance de um expurgo que so conhece
     * Postgres. Mesmo com o job limpo de PII, a retencao tem de ser declarada: e a diferenca entre
     * "nao guardamos dado pessoal" e "nao guardamos dado pessoal nem por acidente".
     */
    const mod = await exigirPeca("fila");
    const opcoes = Object.entries(mod).find(([k]) => /QUEUE_OPTIONS$/.test(k))?.[1] as
      | { defaultJobOptions?: { removeOnFail?: unknown } }
      | undefined;
    const removeOnFail = opcoes?.defaultJobOptions?.removeOnFail;
    expect(removeOnFail, "`removeOnFail` nao declarado: o padrao do BullMQ retem o job falho indefinidamente.").toBeDefined();
    const temIdade =
      typeof removeOnFail === "object" && removeOnFail !== null && "age" in (removeOnFail as object);
    const contagemPequena = typeof removeOnFail === "number" && removeOnFail <= 1000;
    expect(
      temIdade || contagemPequena || removeOnFail === true,
      "declare `removeOnFail` com `age` (TTL, o padrao da casa e 48h) ou com contagem pequena. Retencao sem prazo e retencao para sempre (protocolo, secao 5).",
    ).toBe(true);
  });
});

// ═══ (d) A VAGA NASCE EM `PENDENTE_REVISAO`, E CASA COM A DO PANDAPE ══════════════════════════

comIngestao("a vaga do Digai nasce sem cliente, em revisao, e converge com o espelho do Pandape", () => {
  /**
   * ┌─ A REGUA E A MESMA DO PANDAPE, E ISSO NAO E EXCECAO ────────────────────────────────────┐
   * │ O screening do Digai nao tem cliente nem posicoes. `espelharVaga` do Pandape             │
   * │ (`ingestao-ciclo.ts:348`) ja faz exatamente isto: `cod_cliente` NULO e status de papel    │
   * │ REVISAO, e a vaga cai na fila de revisao para o time completar. Inventar `cod_cliente`    │
   * │ continua PROIBIDO (secao A.5), e aqui nao inventar nem custa adiar.                       │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async function espelho(): Promise<(r: unknown) => Record<string, unknown> | null> {
    return exigirExport("dominio", "espelhoDaVagaDigai");
  }

  it("nasce com `cod_cliente` NULO, e jamais inventado", async () => {
    const fn = await espelho();
    const vaga = fn(resultadoDigaiFingido({ partnerJobId: "1234567" }));
    expect(vaga, "o registro com `partnerJobId` resolve para uma vaga espelhada.").not.toBeNull();
    expect(
      vaga?.cod_cliente ?? null,
      "cliente inventado e pior do que cliente ausente: o ausente aparece na fila de revisao, o inventado passa despercebido para sempre.",
    ).toBeNull();
  });

  it("nasce em `PENDENTE_REVISAO`, que e a fila de quem completa o cadastro", async () => {
    const fn = await espelho();
    const vaga = fn(resultadoDigaiFingido({ partnerJobId: "1234567" }));
    expect(
      vaga?.status,
      "no rascunho a vaga espelhada ficava indistinguivel da que um consultor comecou a digitar, e ninguem sabia que faltava vincular o cliente. `PENDENTE_REVISAO` recebe candidato e sai pela liberacao.",
    ).toBe("PENDENTE_REVISAO");
  });

  it("a chave de convergencia e `id_vacancy_pandape` = `partnerJobId`, e nao uma coluna nova", async () => {
    /**
     * CONFIRMADO PELO IVAN: o `partnerJobId` do Digai E o id da vaga do Pandape. Entao o espelho
     * do Digai e o do Pandape convergem para a MESMA LINHA, pela MESMA chave de conflito. Coluna
     * propria para o Digai criaria duas vagas para a mesma vaga, e as candidaturas se dividiriam
     * entre elas sem ninguem notar, ate a contagem de posicoes nao fechar com a realidade.
     */
    const fn = await espelho();
    const vaga = fn(resultadoDigaiFingido({ partnerJobId: "1234567" }));
    expect(
      vaga?.id_vacancy_pandape,
      "a chave e o `partnerJobId`, gravado na MESMA coluna que o espelho do Pandape usa.",
    ).toBeTruthy();
    expect(
      String(vaga?.id_vacancy_pandape),
      "o valor e o proprio `partnerJobId`, sem prefixo nem sufixo: chave adulterada nao casa com a linha do Pandape.",
    ).toBe("1234567");
    const chaves = Object.keys(vaga ?? {});
    const colunaPropria = chaves.filter((c) => /digai/i.test(c) && /vaga|vacancy|job/i.test(c));
    expect(
      colunaPropria,
      "coluna de vaga propria do Digai duplica a vaga e divide as candidaturas entre as duas linhas.",
    ).toEqual([]);
  });

  it("sem `partnerJobId` nao ha espelho, e a criacao e adiada", async () => {
    const fn = await espelho();
    expect(
      fn(resultadoDigaiFingido({ partnerJobId: null })),
      "sem elo, nao se fabrica vaga: a importacao e adiada e reprocessavel (secao A.5).",
    ).toBeNull();
  });

  it("o `partnerJobId` do payload tambem passa pelo alfabeto fechado antes de virar chave", async () => {
    const fn = await espelho();
    for (const hostil of ["12345 67", "../1", "1'; drop", "1".repeat(65)]) {
      expect(
        fn(resultadoDigaiFingido({ partnerJobId: hostil })),
        `o elo '${hostil.slice(0, 12)}' veio do payload do fornecedor e foi aceito sem validacao.`,
      ).toBeNull();
    }
  });

  it("o texto que a vaga leva para a tela nao usa travessao (secao A.11)", async () => {
    const fn = await espelho();
    const vaga = fn(resultadoDigaiFingido({ partnerJobId: "1234567" }));
    expect(
      JSON.stringify(vaga ?? {}).includes(TRAVESSAO),
      "travessao e proibido em todo texto que chega ao usuario (secao A.11).",
    ).toBe(false);
  });
});

// ═══ OS VETOS DO `seguranca` SOBRE O MAPA (29/09/2026) ════════════════════════════════════════

comIngestao("a ingestao do Digai e o QUARTO escritor de `as_candidatos`, e a guarda e por escritor", () => {
  /**
   * ┌─ A PROTECAO NAO E UMA PROPRIEDADE DO `editar`: E A MESMA CLAUSULA, REPETIDA A MAO ───────┐
   * │ Nao ha guarda no schema, nao ha trigger, e ate 29/09 NENHUM teste enumerava os           │
   * │ escritores. Hoje sao tres, e todos a tem: `candidatos.service.ts` (recusa em memoria, o   │
   * │ `isNull(anonimizadoEm)` no `where` e a zero-linha virando recusa) e                        │
   * │ `ingestao-repositorio.ts:239,257` (a mesma coisa no SQL cru). O `digai-importacao` nasce   │
   * │ como o QUARTO, e pelo contrato de ontem nasceria sem a clausula.                           │
   * │                                                                                            │
   * │ POR QUE O TESTE ENUMERA EM VEZ DE OLHAR SO O DIGAI: teste que olha so o modulo novo deixa  │
   * │ o QUINTO escritor renascer o furo. A varredura e do repositorio inteiro.                   │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const RAIZ = join(__dirname, "../..");

  /**
   * Os arneses de demonstracao (`arnes-*`) fabricam base de homologacao e nunca tocam pessoa real.
   * A excecao e NOMINAL de proposito: um padrao amplo aqui seria a porta pela qual o quinto
   * escritor entraria sem ninguem ver.
   */
  const FORA_DA_REGRA = ["arnes-seed-demo-uma-vaga.ts", "arnes-seed-tres-vagas.ts"];

  function arquivosDeProducao(dir: string): string[] {
    const achados: string[] = [];
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        achados.push(...arquivosDeProducao(caminho));
        continue;
      }
      if (!nome.endsWith(".ts")) continue;
      if (nome.includes(".spec.") || nome.includes("tester-fake") || nome.includes(".fake.")) continue;
      achados.push(caminho);
    }
    return achados;
  }

  it("TODO escritor de `as_candidatos` carrega a clausula `anonimizado_em`, inclusive o do Digai", () => {
    const escreve = /\.(?:insert|update)\(\s*asCandidatos\s*\)|(?:insert\s+into|update)\s+as_candidatos/i;
    const semGuarda: string[] = [];
    let escritores = 0;

    for (const caminho of arquivosDeProducao(RAIZ)) {
      const nome = caminho.split("/").pop() as string;
      if (FORA_DA_REGRA.includes(nome)) continue;
      const texto = readFileSync(caminho, "utf8");
      if (!escreve.test(texto)) continue;
      escritores += 1;
      if (!/anonimizad/i.test(texto)) semGuarda.push(caminho.replace(RAIZ, "src"));
    }

    expect(
      escritores,
      "a varredura nao achou nenhum escritor de `as_candidatos`. Padrao que nao casa com nada passa verde sobre coisa nenhuma.",
    ).toBeGreaterThanOrEqual(3);
    expect(
      semGuarda,
      "escritor de `as_candidatos` SEM a clausula `anonimizado_em`. Uma escrita depois do expurgo devolve o dado pessoal a linha e desfaz a retencao, em silencio. A clausula e por ESCRITOR, porque nao ha guarda no schema nem trigger.",
    ).toEqual([]);
  });

  it("o modulo do Digai declara a clausula no proprio fonte", async () => {
    const fonte = semComentario(fonteExigida());
    if (!/as_candidatos|asCandidatos/.test(fonte)) {
      // A ingestao pode escrever por um repositorio compartilhado. Nesse caso a clausula e
      // cobrada no arquivo que escreve, e o teste acima ja a cobra la.
      return;
    }
    expect(
      /anonimizad/i.test(fonte),
      "o modulo do Digai escreve em `as_candidatos` sem olhar `anonimizado_em`.",
    ).toBe(true);
  });
});

comIngestao("o SEGUNDO portao: sem `DIGAI_INGESTAO_ATIVA`, NADA e escrito", () => {
  it("a flag ausente deixa a ingestao desligada, e o padrao e desligado", async () => {
    /**
     * O portao do TOKEN ja esta coberto (a integracao nasce muda sem credencial). Este e o
     * segundo, e ele e o que impede o banco de ser tocado por default: uma integracao que
     * comeca a escrever no dia em que o token chega nao foi ligada, foi surpreendida.
     */
    const ligada = await exigirExport<(env: Record<string, string | undefined>) => boolean>(
      "dominio",
      "ingestaoHabilitada",
    );
    expect(ligada({}), "sem a flag, desligada. Banco tocado por default e o modo de falha.").toBe(false);
    expect(ligada({ DIGAI_INGESTAO_ATIVA: "" }), "flag vazia e flag ausente.").toBe(false);
    expect(ligada({ DIGAI_INGESTAO_ATIVA: "false" }), "'false' nao liga nada.").toBe(false);
    expect(
      ligada({ DIGAI_INGESTAO_ATIVA: "true" }),
      "com a flag explicita, a ingestao roda. Portao que nunca abre e codigo morto.",
    ).toBe(true);
  });

  it("o servico de importacao CONSULTA a flag antes de escrever", async () => {
    const fonte = semComentario(fonteExigida());
    expect(
      /DIGAI_INGESTAO_ATIVA|ingestaoHabilitada/.test(fonte),
      "a flag existe no dominio e ninguem a consulta: portao declarado e nao usado e pior do que portao nenhum, porque parece que existe.",
    ).toBe(true);
  });
});

/** Os ONZE caminhos de leitura do autoteste Python (`grade_digai.py:322-335`). */
const LEITURAS_LEGITIMAS = [
  "/api/v1/public/workspaces",
  "/api/v1/public/workspaces/ws1/screenings",
  "/api/v1/public/screenings",
  "/api/v1/public/screenings/sc1",
  "/api/v2/public/screenings/sc1/results",
  "/api/v1/public/screenings/sc1/candidates/pre-signup",
  "/api/v2/public/screenings/sc1/results/u1",
  "/api/v2/public/screenings/6add1e2f-0000-4a00-8000-000000000000/results",
  "/api/v1/public/screenings/sc1/pre-sign-up",
  "/api/v2/public/screenings/sc1/pre-sign-up",
  "/api/v1/public/screenings/sc1/users/u1/results",
];

comGrade("a grade nao perde na traducao o que o desenho auditado em Python ja tinha", () => {
  /**
   * ┌─ CINCO COISAS SOMEM NA TRADUCAO DO PYTHON PARA O TYPESCRIPT, E NENHUMA FICA VERMELHA ────┐
   * │ A grade de producao e a traducao de `/home/henrique/digai-investigacao/grade_digai.py`,   │
   * │ que ja foi auditado. Traducao perde detalhe em silencio, e cada item abaixo e um detalhe  │
   * │ daquele arquivo com o numero da linha, para nao virar discussao.                          │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async function autorizar(): Promise<(path: string, metodo: string) => void> {
    return exigirExport<(path: string, metodo: string) => void>("grade", "autorizar");
  }

  function recusa(fn: (p: string, m: string) => void, path: string, metodo = "GET"): string | null {
    try {
      fn(path, metodo);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  for (const path of LEITURAS_LEGITIMAS) {
    it(`deixa passar a leitura legitima ${path}`, async () => {
      expect(
        recusa(await autorizar(), path),
        "a allowlist encolheu na traducao. Grade que barra leitura legitima empurra quem constroi a contornar a grade, e ai ela deixa de existir.",
      ).toBeNull();
    });
  }

  it("nao herda proxy do ambiente: o host pinado tem de valer de verdade", async () => {
    /**
     * `trust_env = False` (`grade_digai.py:190`). Com proxy de ambiente ligado, o host constante
     * deixa de ser garantia e o BEARER DE PRODUCAO vai para o proxy, que nao e nosso. Em Node o
     * equivalente e nao herdar `HTTP(S)_PROXY` nem instalar `ProxyAgent`/`EnvHttpProxyAgent`.
     *
     * A PROVA E ADVERSARIAL, E NAO UMA VARREDURA DE MENCAO, e a diferenca importa: a propria
     * grade PRECISA citar os nomes proibidos para poder acusa-los, entao um `includes` cru
     * acusaria a lista de bloqueio dela mesma. Aqui se INJETA o uso e se exige que ela acuse, e a
     * varredura do fonte olha USO (`new X(...)`, `setGlobalDispatcher(...)`), nunca mencao.
     */
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    expect(
      inspecionar(
        'const agent = new ProxyAgent(process.env.HTTPS_PROXY as string); setGlobalDispatcher(agent);',
      ),
      "a inspecao nao acusou a instalacao de um proxy de ambiente. O host constante e a unica garantia de destino, e um proxy a anula sem mudar mais nada.",
    ).not.toEqual([]);

    const fonte = semComentario(fonteExigida());
    const usos = [
      ...fonte.matchAll(/new\s+(?:Env)?(?:Http)?ProxyAgent\s*\(|setGlobalDispatcher\s*\(/g),
    ].map((m) => m[0]);
    expect(usos, "a grade instalou um proxy de ambiente no proprio modulo.").toEqual([]);
  });

  it("a CHAVE de query tem formato fechado, e nao so ausencia de barra", async () => {
    /** `[A-Za-z][A-Za-z0-9_]{0,39}` (`grade_digai.py:205`). */
    const validar = await exigirExport<(p: Record<string, unknown>) => unknown>("grade", "validarParams");
    const CHAVES_MAS: Array<[string, string]> = [
      ["1page", "chave comecando com digito"],
      ["pa ge", "chave com espaco"],
      ["page-1", "chave com hifen"],
      ["pa.ge", "chave com ponto"],
      ["", "chave vazia"],
      ["p".repeat(41), "chave acima de 40 caracteres"],
    ];
    for (const [chave, porque] of CHAVES_MAS) {
      let recusou = false;
      try {
        validar({ [chave]: "1" });
      } catch {
        recusou = true;
      }
      expect(recusou, `${porque} passou. O formato e [A-Za-z][A-Za-z0-9_]{0,39}.`).toBe(true);
    }
    expect(() => validar({ page: 2 }), "a paginacao e a unica query que a funcao usa, e ela tem de passar.").not.toThrow();
  });

  it("o VALOR de query tem teto de 64 e nao aceita `@`", async () => {
    /** Teto 64 e `@` fora (`grade_digai.py:215`): query string vai para o log do FORNECEDOR. */
    const validar = await exigirExport<(p: Record<string, unknown>) => unknown>("grade", "validarParams");
    for (const [valor, porque] of [
      ["x".repeat(65), "valor acima de 64 caracteres"],
      ["nome@dominio", "arroba fora, mesmo sem parecer e-mail"],
      ["quebra\nlinha", "caractere de controle"],
    ] as const) {
      let recusou = false;
      try {
        validar({ busca: valor });
      } catch {
        recusou = true;
      }
      expect(recusou, `${porque} passou.`).toBe(true);
    }
  });

  it("a inspecao ACUSA residuo de OAuth, que o Digai nao usa mais", async () => {
    /** O Digai trocou OAuth por Bearer pronto. O residuo volta pelo mesmo caminho que o POST. */
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    for (const residuo of [
      'const body = "grant_type=client_credentials";',
      'const s = process.env.DIGAI_CLIENT_SECRET;',
      'const url = base + "/oidc/token";',
    ]) {
      expect(
        inspecionar(residuo),
        `a inspecao nao acusou o residuo de OAuth: ${residuo.slice(0, 40)}. A comparacao tem de ser INSENSIVEL A CAIXA: em TypeScript o residuo aparece como \`process.env.DIGAI_CLIENT_SECRET\`, em maiusculas, e uma lista so em minusculas passa ao largo dele. Handshake e porta de escrita disfarcada de autenticacao.`,
      ).not.toEqual([]);
    }
  });
});

comGrade("o que foi AUTORIZADO e IDENTICO ao que CHEGA NA REDE", () => {
  /**
   * ┌─ O GAP MAIS CONCRETO DO PARECER DE 29/09 ────────────────────────────────────────────────┐
   * │ Em Python, `ler` autoriza o path e monta a URL com A MESMA string normalizada             │
   * │ (`grade_digai.py:228,233`). A traducao errada e a mais natural do mundo                    │
   * │ (`autorizar(path); fetch(BASE + path)`): autoriza a normalizada e envia a crua.            │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ CORRIGIDO EM 29/09 POR VETO DO `seguranca`, E A CORRECAO E O PONTO DE MEDIDA ───────────┐
   * │ A versao anterior deste bloco comparava o RETORNO de `montarUrlAutorizada`, que e a string │
   * │ ANTES do `new URL`. So que o cliente faz `new URL(url)` (`digai.cliente.ts:74`) e entrega  │
   * │ o OBJETO ao `fetch`, e o `new URL` do Node NORMALIZA dot-segments. Medido:                 │
   * │                                                                                            │
   * │   /api/v1/public/screenings/sc1/users/./results  ->  .../screenings/sc1/users/results      │
   * │                                                                                            │
   * │ A grade autoriza `screenings/{ID}/users/{ID}/results`, e o que vai para a rede e           │
   * │ `screenings/sc1/users/results`, que NAO CASA PADRAO NENHUM da allowlist. O segmento de um  │
   * │ ponto so e id VALIDO para a grade (`.` esta no alfabeto porque id legitimo o usa, e        │
   * │ `ehIdTecnicoDigai(".")` devolve `true`), entao nada acusa.                                 │
   * │                                                                                            │
   * │ POR ISSO A MEDIDA AGORA E `new URL(...).pathname`, que e o que o `fetch` executa, e nao o  │
   * │ texto que a grade devolveu. Comparar o texto declarava fechado um invariante ABERTO, que e │
   * │ o mesmo verde falso do veto 4 de 16/09 por outra porta.                                    │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async function montar(): Promise<(path: string, metodo: string) => string> {
    return exigirExport<(path: string, metodo: string) => string>("grade", "montarUrlAutorizada");
  }

  /** O que o `fetch` de fato executa: o path depois do `new URL`. */
  function pathQueVaiParaARede(url: string): string {
    return new URL(url).pathname;
  }

  it("a porta de saida devolve a URL EXATA que sera enviada, DEPOIS do `new URL`", async () => {
    const fn = await montar();
    const base = await exigirExport<string>("grade", "DIGAI_BASE_URL");
    const path = "/api/v2/public/screenings/sc1/results";
    const url = fn(path, "GET");
    expect(
      url,
      "quem autoriza tem de ser quem monta. Duas funcoes separadas e o chamador colando as pontas e o convite ao descompasso.",
    ).toBe(`${base}${path}`);
    expect(
      pathQueVaiParaARede(url),
      "o `new URL` do cliente nao pode mudar o path que a grade avaliou.",
    ).toBe(path);
  });

  const SUJOS: ReadonlyArray<[string, string]> = [
    ["/api/v2/public/screenings/sc1/results?x=1", "a query nao pode ir por dentro do path"],
    ["/api/v2/public/screenings/sc1/results#frag", "o fragmento e truncado pelo fetch, e a grade avaliaria outra coisa"],
    ["//api/v2/public/screenings/sc1/results", "a barra dupla e caminho classico de SSRF"],
    // OS TRES DOT-SEGMENTS MEDIDOS PELO `seguranca` EM 29/09. O primeiro e o que passa hoje.
    ["/api/v1/public/screenings/sc1/users/./results", "o `new URL` come o segmento de um ponto, e o que vai para a rede nao casa padrao nenhum"],
    ["/api/v2/public/screenings/./results", "idem, e aqui o que sobra nem e um recurso existente"],
    ["/api/v1/public/workspaces/./screenings", "idem, num caminho que a allowlist so autoriza COM o id no meio"],
    ["/api/v2/public/screenings/sc1/results/..", "dot-segment duplo sobe um nivel depois de autorizado"],
  ];

  for (const [sujo, porque] of SUJOS) {
    it(`para '${sujo.slice(-20)}', ou recusa, ou o que chega na rede continua autorizado`, async () => {
      const fn = await montar();
      const autorizar = await exigirExport<(p: string, m: string) => void>("grade", "autorizar");
      let url: string;
      try {
        url = fn(sujo, "GET");
      } catch {
        return; // recusar e a outra saida aceitavel, e e a mais segura
      }

      const enviado = pathQueVaiParaARede(url);
      /**
       * A INVARIANTE, dita do jeito que importa: o que a REDE executa tem de passar pela grade.
       * Nao basta o texto ter passado antes de o `new URL` mexer nele.
       */
      expect(
        () => autorizar(enviado, "GET"),
        `${porque}. O que foi autorizado nao e o que chega na rede: a URL executa '${enviado}'.`,
      ).not.toThrow();
      expect(url.includes("?"), "a URL enviada carrega query que a autorizacao nao avaliou.").toBe(false);
      expect(url.includes("#"), "a URL enviada carrega fragmento, que o fetch trunca depois da autorizacao.").toBe(false);
      expect(enviado.includes("//"), "barra dupla sobrevivente muda o destino sem mudar o que foi autorizado.").toBe(false);
    });
  }

  it("toda leitura legitima atravessa o `new URL` sem mudar de path", async () => {
    const fn = await montar();
    for (const path of LEITURAS_LEGITIMAS) {
      expect(
        pathQueVaiParaARede(fn(path, "GET")),
        `'${path}' muda ao virar URL. Qualquer diferenca aqui e uma chamada que a grade avaliou e a rede nao executou.`,
      ).toBe(path);
    }
  });
});

comGrade("a mensagem de recusa diz o MOTIVO, e nunca o path", () => {
  it("o path recusado nao volta na mensagem, nem quando o id e um CPF", async () => {
    /**
     * A versao Python lanca `f"path fora da allowlist de leitura: {p}"` (`grade_digai.py:138`).
     * Se o id vier do payload e for um CPF, a grade recusa (certo) e escreve o CPF NO NOSSO LOG
     * (errado), e o texto vai junto para o `failedReason` do job. A recusa diz o motivo e para ai.
     */
    const fn = await exigirExport<(p: string, m: string) => void>("grade", "autorizar");
    const caminho = `/api/v1/public/screenings/${CPF_SINTETICO.finalizou}/results`;
    let mensagem = "";
    try {
      fn(caminho, "GET");
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    expect(mensagem, "a grade tem de recusar este caminho.").not.toBe("");
    expect(
      piiNaSaida(mensagem, [CPF_SINTETICO.finalizou]),
      "a mensagem de recusa ecoou o path com o CPF dentro. A grade existe para o dado nao vazar, e nao para vaza-lo do nosso lado em vez do lado do fornecedor.",
    ).toEqual([]);
    expect(
      mensagem.includes(caminho),
      "a mensagem repete o path inteiro. O motivo basta: quem investiga tem o id tecnico do job.",
    ).toBe(false);
    expect(mensagem.length, "recusa muda nao e diagnostico.").toBeGreaterThan(0);
  });
});

// ═══ OS QUATRO GAPS DA AUDITORIA DO CODIGO (`seguranca`, 29/09/2026) ══════════════════════════

const comRota = suspensoSem("dto", "controller", "fila");

comRota("a ROTA de reprocessamento nao aceita identificador com cara de documento", () => {
  /**
   * ┌─ O GAP 1, E ELE E O QUE TODA A MINHA COBERTURA ANTERIOR NAO PEGAVA ─────────────────────┐
   * │ Todos os testes de PII em identificador batem em `identificadoresDoEvento`, e a rota      │
   * │ `POST admin/as/digai/reprocessar` NAO O CHAMA: ela le o DTO e enfileira. O DTO cobrava so │
   * │ o alfabeto `^[A-Za-z0-9._-]{1,64}$`, e ONZE DIGITOS cabem inteiros nele. Um documento      │
   * │ colado no campo pela tela de administracao vira a chave `digai-<documento>` no Redis, com  │
   * │ TTL de 24h a 48h, FORA do alcance de um expurgo que so conhece Postgres.                   │
   * │                                                                                            │
   * │ O alfabeto nao e o valor: a regra e `ehIdTecnicoDigai`, que soma alfabeto MAIS ausencia de │
   * │ cara de documento. Onde a rota so cobra o alfabeto, o valor entra.                          │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async function corpoValidado(valores: Record<string, unknown>) {
    const mod = await exigirPeca("dto");
    const Classe = mod.ReprocessarEventoDigaiDto as { new (): object } | undefined;
    expect(Classe, "FALTA IMPLEMENTAR: `ReprocessarEventoDigaiDto`.").toBeDefined();
    return validateSync(plainToInstance(Classe as never, valores));
  }

  const COM_CARA_DE_DOCUMENTO = [
    CPF_SINTETICO.finalizou,
    "111.222.333-96",
    "11900000001",
    "00000000000",
  ];

  for (const valor of COM_CARA_DE_DOCUMENTO) {
    it(`recusa o corpo cujo \`userId\` tem ${valor.replace(/\d/g, "9").length} caracteres com cara de documento`, async () => {
      expect(
        await corpoValidado({ screeningId: "sc1", userId: valor }),
        "onze digitos cabem no alfabeto tecnico, e e por isso que o alfabeto sozinho nao basta. O valor vira chave de job no Redis, com TTL proprio e sem expurgo nosso.",
      ).not.toEqual([]);
    });
  }

  it("recusa tambem no `screeningId` e no `attemptId`, e nao so no `userId`", async () => {
    expect(
      await corpoValidado({ screeningId: CPF_SINTETICO.finalizou, userId: "usr-1" }),
      "o campo que ninguem lembra de validar e por onde o valor entra.",
    ).not.toEqual([]);
    expect(
      await corpoValidado({ screeningId: "sc1", userId: "usr-1", attemptId: CPF_SINTETICO.outroFinalizou }),
    ).not.toEqual([]);
  });

  it("aceita o corpo tecnico legitimo, senao a rota nao serve para ninguem", async () => {
    expect(
      await corpoValidado({ screeningId: "sc-1.a_b", userId: "usr-sintetico-1", attemptId: "at-1" }),
      "id tecnico com ponto, hifen e sublinhado e id legitimo: barra-lo transformaria a guarda em obstaculo e empurraria alguem a contorna-la.",
    ).toEqual([]);
  });

  it("a rota RECUSA antes de enfileirar, e nada chega ao Redis", async () => {
    /**
     * O DTO e a primeira fechadura, e ela vale para quem passa pelo `ValidationPipe`. A segunda e
     * a rota nao confiar so nele: quem chama o metodo de dentro do processo (um script, um job,
     * uma tela futura) nao passa por pipe nenhum.
     */
    const mod = await exigirPeca("controller");
    const Controller = mod.DigaiController as
      | (new (fila: unknown, importacao: unknown) => {
          reprocessar(corpo: unknown): Promise<unknown>;
        })
      | undefined;
    expect(Controller, "FALTA IMPLEMENTAR: `DigaiController`.").toBeDefined();

    const enfileirados: Array<{ jobId?: string; ids: unknown }> = [];
    const controller = new Controller!(
      {
        enfileirarEvento: async (ids: unknown, opcoes?: { jobId?: string }) => {
          enfileirados.push({ jobId: opcoes?.jobId, ids });
          return true;
        },
      },
      { ativa: true },
    );

    let recusou = false;
    try {
      await controller.reprocessar({ screeningId: "sc1", userId: CPF_SINTETICO.finalizou });
    } catch {
      recusou = true;
    }
    expect(
      recusou,
      "a rota aceitou um identificador com cara de documento. O DTO e a primeira fechadura, nao a unica: metodo chamado de dentro do processo nao passa por pipe.",
    ).toBe(true);
    expect(
      piiNaSaida(enfileirados, [CPF_SINTETICO.finalizou]),
      "o valor chegou a fila. Uma vez no Redis, ele tem o TTL do BullMQ e nenhum expurgo nosso.",
    ).toEqual([]);
    expect(enfileirados, "recusado, nada pode ter sido enfileirado.").toEqual([]);
  });
});

comRota("a CHAVE DE JOB que chega ao Redis nunca tem cara de documento", () => {
  /**
   * O GAP 2: o teste de idempotencia prova que duas entregas dao a MESMA chave, e nao prova nada
   * sobre o CONTEUDO dela. A chave e `digai-<userId>` (`domain/digai.ts:523`), entao ela herda o
   * que o `userId` for: se o valor passar, ele vira chave, e chave de job aparece em toda tela de
   * diagnostico de fila, no Redis e no `failedReason`.
   */
  it("`chaveDoJobDigai` recusa, ou nunca produz, chave com onze digitos dentro", async () => {
    const chave = await exigirExport<(ids: { userId: string }) => string>("dominio", "chaveDoJobDigai");
    for (const valor of [CPF_SINTETICO.finalizou, "11900000001", "111.222.333-96"]) {
      let produzida: string | null = null;
      try {
        produzida = chave({ userId: valor });
      } catch {
        continue; // recusar e a saida mais segura
      }
      expect(
        piiNaSaida(produzida, [valor]),
        `a chave de job ficou '${produzida?.replace(/\d/g, "9")}'. Valor com cara de documento nao pode virar chave: ela vive no Redis com TTL proprio e aparece em toda tela de fila.`,
      ).toEqual([]);
    }
  });

  it("a chave do id tecnico legitimo continua estavel e derivada do `userId`", async () => {
    const chave = await exigirExport<(ids: { userId: string }) => string>("dominio", "chaveDoJobDigai");
    expect(chave({ userId: "usr-sintetico-1" })).toBe(chave({ userId: "usr-sintetico-1" }));
    expect(
      chave({ userId: "usr-sintetico-1" }).includes("usr-sintetico-1"),
      "a chave e derivada do identificador tecnico estavel: e ela que faz duas entregas do mesmo evento virarem um efeito so.",
    ).toBe(true);
  });
});

comGrade("nenhum proxy de ambiente e instalado em LUGAR NENHUM do backend", () => {
  /**
   * ┌─ O GAP 3, E ELE E O MAIS LONGE DO MODULO ────────────────────────────────────────────────┐
   * │ A inspecao da grade le DOIS arquivos (`fonteDaRede`, `digai-grade.ts:625-641`). Um        │
   * │ `setGlobalDispatcher(new EnvHttpProxyAgent())` em `main.ts` derrubaria o host pinado do    │
   * │ Digai e entregaria o BEARER DE PRODUCAO ao proxy, e nem a inspecao nem teste nenhum        │
   * │ acusaria: o dispatcher do undici e GLOBAL, e alcanca todo `fetch` do processo.             │
   * │                                                                                            │
   * │ Por isso esta varredura e sobre o BACKEND INTEIRO, e nao sobre o modulo. Medido em 29/09:  │
   * │ hoje nao ha nenhuma ocorrencia fora do Digai, entao o teste nasce VERDE e protege o futuro, │
   * │ que e exatamente para o que serve um teste de invariante.                                  │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o fonte inteiro do backend nao instala dispatcher global nem agente de proxy", () => {
    const RAIZ = join(__dirname, "../..");
    const USO = /setGlobalDispatcher\s*\(|new\s+(?:Env)?(?:Http)?ProxyAgent\s*\(|from\s+["']undici["']/;
    const achados: string[] = [];

    const andar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) {
          andar(caminho);
          continue;
        }
        if (!nome.endsWith(".ts")) continue;
        if (nome.includes(".spec.") || nome.includes("tester-fake") || nome.includes(".fake.")) continue;
        const texto = semComentario(readFileSync(caminho, "utf8"));
        if (USO.test(texto)) achados.push(caminho.replace(RAIZ, "src"));
      }
    };
    andar(RAIZ);

    expect(
      achados,
      "alguem instalou um dispatcher global ou um agente de proxy. O dispatcher do undici alcanca TODO `fetch` do processo, entao o host pinado da grade do Digai deixa de ser garantia e o Bearer de producao passa a ir para o proxy.",
    ).toEqual([]);
  });

  it("a inspecao da grade ACUSA o dispatcher global, e nao so o agente", async () => {
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    expect(
      inspecionar("setGlobalDispatcher(new EnvHttpProxyAgent());"),
      "`setGlobalDispatcher` e o nome que faz o estrago, e ele precisa estar na lista tanto quanto o `ProxyAgent`.",
    ).not.toEqual([]);
  });
});

comIngestao("pessoa ja anonimizada nao e REESCRITA, mas uma candidatura nova a RECRIA", () => {
  /**
   * ┌─ O GAP 4: A REGRA EXISTE NO CODIGO E NAO EXISTIA EM TESTE NENHUM ────────────────────────┐
   * │ O expurgo APAGA `as_identidades_externas` e NULA o documento, entao uma pessoa ja          │
   * │ anonimizada NAO CASA nem por identidade nem por documento, e uma candidatura nova pelo     │
   * │ Digai a RECRIA como ficha nova, com PII completa.                                          │
   * │                                                                                            │
   * │ ISTO NAO E FURO, E DECISAO DE NEGOCIO, e o `seguranca` a examinou e NAO vetou: a guarda do │
   * │ `anonimizado_em` protege contra REESCRITA de ficha expurgada, e nao contra RECOLETA de     │
   * │ quem se candidatou DE NOVO. Candidatura nova e base legal nova, e o precedente e o do      │
   * │ Pandape, ja validado. Nao ha "lista de nao perturbe" no desenho, e nao se inventa uma aqui.│
   * │                                                                                            │
   * │ O QUE ESTE BLOCO FAZ E FIXAR O COMPORTAMENTO QUE EXISTE, nos dois sentidos: que a          │
   * │ reescrita e BARRADA e que a recriacao e PERMITIDA. Enquanto a regra ficou so implicita no  │
   * │ codigo, ninguem provava nem uma coisa nem a outra, e a proxima refatoracao decidiria por   │
   * │ acidente qual das duas some.                                                               │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  async function repositorio(respostas: unknown[][]) {
    const mod = await exigirPeca("importacao").catch(() => null);
    void mod;
    const Repo = (await import("./digai-repositorio")).DigaiRepositorio as unknown as new (
      db: unknown,
      vagaStatus: unknown,
      etapas: unknown,
    ) => {
      candidatoPorIdentidade(id: string): Promise<{ id: string } | null>;
      candidatoPorDocumento(v: string): Promise<{ id: string } | null>;
      criarCandidato(d: Record<string, unknown>): Promise<{ id: string }>;
    };
    const fila = [...respostas];
    const db = { execute: async () => fila.shift() ?? [] };
    return new Repo(db, null, null);
  }

  it("quem foi anonimizado nao casa por identidade nem por documento", async () => {
    const repo = await repositorio([[], []]);
    expect(
      await repo.candidatoPorIdentidade("usr-sintetico-1"),
      "o expurgo apaga `as_identidades_externas`, entao a identidade some junto com a PII.",
    ).toBeNull();
    expect(
      await repo.candidatoPorDocumento(CPF_SINTETICO.finalizou),
      "o expurgo nula o documento, e a consulta ainda traz `anonimizado_em is null` como segunda fechadura.",
    ).toBeNull();
    // Tempo folgado: este bloco IMPORTA o repositorio, que puxa Nest e Drizzle junto. Com os 5s
    // padrao ele falhava por frieza de cache, e vermelho que nao fala do codigo ensina a ignorar
    // vermelho.
  }, 30_000);

  it("a consulta por documento carrega a clausula `anonimizado_em is null` no proprio SQL", () => {
    const fonte = semComentario(readFileSync(join(__dirname, "digai-repositorio.ts"), "utf8"));
    const consultas = [...fonte.matchAll(/select[\s\S]{0,200}?from as_candidatos[\s\S]{0,200}?;/gi)];
    expect(consultas.length, "a consulta por documento tem de existir.").toBeGreaterThan(0);
    expect(
      /anonimizado_em is null/.test(fonte),
      "sem a clausula, a ficha expurgada voltaria a ser alvo de escrita e a retencao se desfaria em silencio.",
    ).toBe(true);
  });

  it("nao casando ninguem, a candidatura NOVA cria ficha nova, e isso e permitido", async () => {
    const repo = await repositorio([[{ id: "cand-novo" }]]);
    const criada = await repo.criarCandidato({
      nome: "Fulano De Teste",
      cpf: CPF_SINTETICO.finalizou,
      email: "fulano.teste@exemplo.invalido",
      telefone: "11900000001",
    });
    expect(
      criada.id,
      "DECISAO DE NEGOCIO, examinada e nao vetada em 29/09: candidatura nova e base legal nova. Se um dia se quiser o contrario, e uma lista de nao perturbe, e ela e decisao do diretor, nao efeito colateral de refatoracao.",
    ).toBe("cand-novo");
  }, 30_000);
});

// ── AS FIXTURES DESTE ARQUIVO SAO SINTETICAS, E ISSO NAO DEPENDE DE PECA NENHUMA ──────────────

describe("as fixtures deste arquivo nao carregam dado real", () => {
  it("o evento fingido tem PII de fantasia, e ela e a que os testes procuram na saida", () => {
    const evento = eventoDigaiFingido();
    expect(
      piiNaSaida(evento, [...PII_DO_EVENTO]).length,
      "a fixture TEM de carregar a PII sintetica: e ela que os testes procuram NA SAIDA e exigem nao encontrar. Fixture higienizada provaria que payload limpo nao suja log, que e uma frase verdadeira sobre coisa nenhuma.",
    ).toBeGreaterThan(0);
    expect(String(evento.event), "o evento coberto e o `NEW_APPLICATION`.").toBe("NEW_APPLICATION");
  });
});
