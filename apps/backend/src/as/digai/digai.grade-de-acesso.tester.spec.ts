import { describe, expect, it } from "vitest";
import {
  carregar,
  describeSuspenso,
  exigirExport,
  fonteExigida,
  semComentario,
  sentinelaDoDigai,
} from "./digai.tester-fake";

/**
 * ┌─ SUITE SUSPENSA: A IMPLEMENTACAO DO DIGAI AINDA NAO EXISTE ─────────────────────────────────┐
 * │ Nada aqui foi apagado. Cada assercao, cada caso e cada `it` continua escrito, palavra por   │
 * │ palavra: este arquivo e o CONTRATO que a construcao vai ter de satisfazer, escrito antes do │
 * │ codigo de proposito (secao A.38 e secao A.40, regra 2). A frente esta parada por insumo do  │
 * │ diretor (o token do Digai, docs/PLATAFORMA-UNIFICADORA-DECISOES.md, secao 5).               │
 * │                                                                                             │
 * │ O QUE MUDA E SO QUANDO RODA. Os blocos abaixo usam `describeSuspenso`, que e `describe.skip` │
 * │ enquanto NENHUMA peca do Digai existir no disco, e vira `describe` de verdade sozinho no     │
 * │ minuto em que a primeira peca nascer. Nao ha interruptor para alguem esquecer de virar: a    │
 * │ suspensao e DERIVADA da ausencia medida (`pecasPresentes`, em digai.tester-fake.ts).         │
 * │                                                                                             │
 * │ A SENTINELA ABAIXO RODA SEMPRE, e e ela que impede este trabalho de dormir para sempre: no   │
 * │ dia em que a implementacao chegar, ela FICA VERMELHA dizendo o que fazer. `skip` puro        │
 * │ ninguem lembra de reativar, e cobertura esquecida e pior do que cobertura que nao existe,    │
 * │ porque parece que existe.                                                                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
sentinelaDoDigai("digai.grade-de-acesso.tester.spec.ts");


/**
 * ─ A GRADE DE ACESSO DO DIGAI, ESCRITA ANTES DO CODIGO (secao A.38, secao A.40 regra 2) ─────────
 *
 * ESTE ARQUIVO E DO `tester`, E NAO DE QUEM CONSTROI. Ele nasceu do REQUISITO
 * (docs/PROTOCOLO-LGPD-FABRICA.md secao 2, mais os quatro vetos do `seguranca` de 16/09 no
 * DIARIO.md), com ZERO leitura de implementacao, porque implementacao nao ha.
 *
 * ┌─ POR QUE A GRADE E O TESTE MAIS IMPORTANTE DESTA FRENTE ────────────────────────────────────┐
 * │ O Digai e PRODUCAO DE TERCEIRO, com CPF REAL de 12.445 pessoas, e o 401 dele ECOA O PATH.   │
 * │ Uma chamada mal formada nao devolve so um erro: ela GRAVA o dado pessoal no log do          │
 * │ fornecedor, onde nao temos como apagar. A grade e a unica coisa entre o nosso codigo e esse │
 * │ log, e ela e PRE-REDE: ela recusa ANTES de a chamada sair, nunca depois da resposta.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O DESENHO JA FOI AUDITADO em `/home/henrique/digai-investigacao/grade_digai.py` (Bearer,
 * GET-only, 26 bloqueios e 11 leituras). A grade de producao e a versao TypeScript dele, e este
 * arquivo e a traducao do autoteste daquele desenho para a suite da casa. Nenhuma regra nova foi
 * inventada aqui: cada bloqueio abaixo ja e bloqueio la.
 *
 * SECAO A.6: nenhum dado real. Os valores com cara de PII sao sinteticos e existem para serem
 * RECUSADOS, que e o ponto.
 */

/** A porta unica da grade. Recusar e LANCAR, nunca devolver `false`, para nao ter como ignorar. */
async function autorizar(): Promise<(path: string, metodo: string) => void> {
  return exigirExport<(path: string, metodo: string) => void>("grade", "autorizar");
}

/** Devolve a violacao (a mensagem) quando a grade recusa, ou `null` quando ela deixou passar. */
function recusa(fn: (p: string, m: string) => void, path: string, metodo: string): string | null {
  try {
    fn(path, metodo);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// ── 1. METODO: leitura e GET-only, declarado em codigo ──────────────────────

describeSuspenso("a grade recusa qualquer metodo que nao seja GET", () => {
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "get", ""]) {
    it(`recusa ${metodo || "(metodo vazio)"} num path que ate seria valido em GET`, async () => {
      const fn = await autorizar();
      expect(
        recusa(fn, "/api/v2/public/screenings/sc1/results", metodo),
        `metodo '${metodo}' passou. Integracao de leitura e GET-only (protocolo, secao 2), e escrita exige entrada propria e explicita na grade, uma por acao (protocolo, secao 6).`,
      ).not.toBeNull();
    });
  }

  it("deixa passar o GET de leitura da allowlist", async () => {
    const fn = await autorizar();
    expect(
      recusa(fn, "/api/v2/public/screenings/sc1/results", "GET"),
      "a grade recusou a leitura que a funcao EXIGE. Grade que barra tudo nao protege nada: ela so adia a descoberta de que ninguem a usa.",
    ).toBeNull();
  });
});

// ── 2. ROTA: allowlist fechada, recusada ANTES de a chamada sair ────────────

describeSuspenso("a grade recusa rota fora da allowlist", () => {
  const FORA = [
    ["/api/v1/private/admin/users", "rota privada: fail-closed e o padrao, nao a excecao"],
    ["/api/v1/public/search", "busca: poria criterio de pessoa na URL"],
    ["/api/v1/public/lgpd/removecandidate", "remocao de candidato no terceiro: escrita disfarcada de GET"],
    ["/api/v1/public/webhooks", "listener de webhook: a listagem pode trazer SEGREDO DE ASSINATURA de terceiro"],
    ["/api/v1/public/screenings/sc1/requirements", "requisito: nao responde nenhuma pergunta da OST (minimizacao, protocolo secao 3)"],
    ["/api/v1/public/screenings/sc1/questions", "pergunta: idem"],
    ["/api/v2/public/screenings/sc1/results/u1/attempts", "tentativa: idem"],
  ] as const;

  for (const [path, porque] of FORA) {
    it(`recusa GET ${path}`, async () => {
      const fn = await autorizar();
      expect(recusa(fn, path, "GET"), porque).not.toBeNull();
    });
  }

  it("a recusa acontece ANTES da rede, e por isso a grade e sincrona e nao precisa de token", async () => {
    const fn = await autorizar();
    expect(
      recusa(fn, "/api/v1/private/admin/users", "GET"),
      "se a grade so decidisse depois da resposta, o path ja teria ido para o log do fornecedor, que e exatamente o dano que ela existe para evitar.",
    ).not.toBeNull();
  });
});

// ── 3. O VETO 2 DE 16/09: ID COM ALFABETO FECHADO ──────────────────────────

describeSuspenso("o id de rota tem alfabeto FECHADO, e nunca curinga", () => {
  /**
   * ┌─ O VETO 2, na integra ──────────────────────────────────────────────────────────────────┐
   * │ Os ids usavam `[^/]+`, que ACEITA `%2f`, `%2e` e `%00`. Servidor que decodifica ANTES de │
   * │ rotear resolve para recurso FORA da allowlist, e a checagem de ".." literal nao pega a   │
   * │ forma percentual. O alfabeto passou a ser `[A-Za-z0-9._-]{1,64}`.                        │
   * └──────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const ATAQUES = [
    "/api/v1/public/screenings/%2e%2e/results",
    "/api/v1/public/screenings/abc%2f..%2f..%2fadmin/results",
    "/api/v1/public/screenings/a%00b/results",
    "/api/v1/public/screenings/x#/results",
    "/api/v1/public/screenings/@evil.com/results",
    "/api/v1/public/screenings/../workspaces",
    "/api/v1/public/screenings/a b/results",
    "/api/v1/public/screenings/a%2Fb/results",
    `/api/v1/public/screenings/${"a".repeat(65)}/results`,
  ];

  for (const path of ATAQUES) {
    it(`recusa o id adulterado em ${path}`, async () => {
      const fn = await autorizar();
      expect(
        recusa(fn, path, "GET"),
        "id de rota tem de ser `[A-Za-z0-9._-]{1,64}`. Curinga generico aceita encoding percentual, e foi VETADO em 16/09.",
      ).not.toBeNull();
    });
  }

  it("um UUID legitimo continua passando, inclusive contendo hex que parece palavra proibida", async () => {
    const fn = await autorizar();
    expect(
      recusa(fn, "/api/v2/public/screenings/6add1e2f-0000-4a00-8000-000000000000/results", "GET"),
      "a denylist tem de casar por SEGMENTO INTEIRO, nunca por substring: 'add' dentro de um hex nao e o recurso 'add'. Bloquear aqui quebra a leitura legitima e empurra quem constroi a contornar a grade.",
    ).toBeNull();
  });
});

// ── 4. PII NUNCA NA URL: nem no path, nem na query ─────────────────────────

describeSuspenso("a grade recusa dado pessoal no path e na query", () => {
  const NO_PATH = [
    "/api/v1/public/screenings/sc1/emails/fulano@exemplo.invalido/results",
    "/api/v1/public/screenings/sc1/phone-numbers/11900000001/results",
    "/api/v1/public/screenings/sc1/partner-user-id/11122233396/results",
    "/api/v1/public/screenings/sc1/users/11122233396/results",
    "/api/v1/public/screenings/sc1/users/111.222.333-96/results",
    "/api/v1/public/screenings/sc1/users/11900000001/results",
    "/api/v1/public/screenings/11122233396/results",
  ];

  for (const path of NO_PATH) {
    it(`recusa PII como segmento de path em ${path.replace(/\d{11}|[^/]+@[^/]+/g, "(sintetico)")}`, async () => {
      const fn = await autorizar();
      expect(
        recusa(fn, path, "GET"),
        "PII no path vai para o log do fornecedor pelo 401, que ECOA o path. Busca por dado pessoal vai no CORPO da requisicao (protocolo, secao 2).",
      ).not.toBeNull();
    });
  }

  /**
   * A QUERY E A METADE ESQUECIDA, e por isso ela tem teste proprio: `autorizar` recebe so o path,
   * entao um `validarParams` que nao exista deixa a query inteira sem dono, e a query vai para a
   * MESMA URL que o 401 ecoa.
   */
  describe("a query string tem coleira", () => {
    async function validar(): Promise<(p: Record<string, unknown>) => unknown> {
      return exigirExport<(p: Record<string, unknown>) => unknown>("grade", "validarParams");
    }

    const PROIBIDOS: Array<[string, Record<string, unknown>, string]> = [
      ["CPF em query", { cpf: "11122233396" }, "onze digitos numa query e CPF"],
      ["CPF mascarado em query", { documento: "111.222.333-96" }, "mascara nao deixa de ser o dado"],
      ["e-mail em query", { q: "fulano@exemplo.invalido" }, "e-mail em URL e PII em URL"],
      ["telefone em query", { telefone: "11900000001" }, "telefone em URL e PII em URL"],
      ["chave estranha", { "a/b": "1" }, "chave que carrega barra pode alterar a rota"],
      ["valor com controle", { page: "1\n2" }, "caractere de controle em URL"],
    ];

    for (const [nome, params, porque] of PROIBIDOS) {
      it(`recusa ${nome}`, async () => {
        const fn = await validar();
        let recusou = false;
        try {
          fn(params);
        } catch {
          recusou = true;
        }
        expect(recusou, porque).toBe(true);
      });
    }

    it("deixa passar a paginacao, que e a unica query que a funcao usa", async () => {
      const fn = await validar();
      expect(() => fn({ page: 2 })).not.toThrow();
    });
  });
});

// ── 5. ANTI-SSRF: host constante, https, sem redirecionamento ──────────────

describeSuspenso("o destino e constante, e o esquema e https", () => {
  it("o host e o constante medido, e nao o da doc legada", async () => {
    const base = await exigirExport<string>("grade", "DIGAI_BASE_URL");
    expect(
      base,
      "o host e `api-screening.digai.ai`. O `api.hiring.digai.ai` da doc tem CERTIFICADO INVALIDO (cert `CN=digai.ai`, SAN `*.digai.ai`, e wildcard cobre UM rotulo). Nao 'consertar' de volta.",
    ).toBe("https://api-screening.digai.ai");
  });

  it("a grade recusa URL absoluta, que e o caminho classico de SSRF", async () => {
    const fn = await autorizar();
    for (const alvo of [
      "https://evil.invalido/api/v1/public/workspaces",
      "//evil.invalido/api/v1/public/workspaces",
      "http://api-screening.digai.ai/api/v1/public/workspaces",
    ]) {
      expect(
        recusa(fn, alvo, "GET"),
        "o chamador controla o PATH e nada mais. Host vem de constante de configuracao, nunca de dado lido (protocolo, secao 2).",
      ).not.toBeNull();
    }
  });

  it("nao se segue redirecionamento automaticamente", async () => {
    const fonte = semComentario(fonteExigida());
    expect(
      /redirect\s*:\s*["']manual["']|maxRedirects\s*:\s*0|allow_?[Rr]edirects\s*:\s*false/.test(fonte),
      "a grade e PRE-REDE e nao reavalia o destino final: seguir um 3xx executaria um GET em path que a allowlist nunca autorizou. Declare `redirect: 'manual'` (ou equivalente) no unico ponto de saida.",
    ).toBe(true);
  });
});

// ── 6. TLS: a proibicao e TESTE, nao lembranca (mesma logica da secao A.33) ─

describeSuspenso("desligar a verificacao de TLS esta impedido POR TESTE", () => {
  /**
   * ┌─ POR QUE ISTO E UM TESTE E NAO UM COMENTARIO ───────────────────────────────────────────┐
   * │ Cert quebrado significa HOST ERRADO, e foi o que aconteceu de verdade em 16/09. O atalho │
   * │ de desligar a verificacao entrega o BEARER DE PRODUCAO a quem responder no caminho. A    │
   * │ proibicao virou teste pela mesma razao da secao A.33: guarda com teste sobrevive a uma    │
   * │ refatoracao, lembranca nao.                                                              │
   * └──────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const ATALHOS = [
    "rejectUnauthorized",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "insecureHTTPParser",
    "checkServerIdentity",
    "strictSSL",
  ];

  it("nenhum atalho de TLS aparece no fonte do modulo", async () => {
    const fonte = semComentario(fonteExigida());
    const achados = ATALHOS.filter((a) => fonte.includes(a));
    expect(
      achados,
      "atalho de TLS no modulo Digai. Desativar verificacao de certificado esta VETADO em definitivo (protocolo, secao 2).",
    ).toEqual([]);
  });

  it("a propria inspecao ACUSA um atalho de TLS injetado", async () => {
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    const adulterado = 'const agent = new https.Agent({ rejectUnauthorized: false });';
    expect(
      inspecionar(adulterado).length,
      "a inspecao tem de ACUSAR o atalho de TLS quando ele existe. Inspecao que nao acusa e decoracao.",
    ).toBeGreaterThan(0);
  });
});

// ── 7. O VETO 3 DE 16/09: O AUTOTESTE E ADVERSARIAL ────────────────────────

describeSuspenso("a inspecao de fonte recebe o TEXTO por parametro, e o autoteste injeta o ataque", () => {
  /**
   * ┌─ O VETO 3, na integra, e ele e o mais dificil de acreditar ─────────────────────────────┐
   * │ A inspecao anterior recebia o CAMINHO do arquivo e lia sozinha. O `seguranca` COPIOU o   │
   * │ arquivo, injetou uma funcao de escrita DEPOIS do ponto onde a inspecao parava de olhar,  │
   * │ e obteve VERDE. A garantia era decoracao.                                               │
   * │                                                                                         │
   * │ A correcao tem DUAS metades, e a segunda e a que este bloco cobra: a inspecao recebe o   │
   * │ TEXTO por parametro (metade 1) E o autoteste INJETA o ataque exigindo que ela acuse      │
   * │ (metade 2). So a metade 1 continua sendo decoracao, porque ninguem prova que ela olha.   │
   * └─────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("`inspecionarFonte` recebe o texto, e nao um caminho de arquivo", async () => {
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    expect(
      inspecionar.length,
      "a inspecao tem de receber UM parametro, que e o TEXTO. Inspecao que abre o arquivo sozinha e enganavel por copia adulterada, e foi (veto 3, 16/09).",
    ).toBe(1);
    expect(
      inspecionar("const x = 1;"),
      "um fonte limpo tem de dar lista VAZIA, senao o verde nunca acontece e o teste e ignorado na pratica.",
    ).toEqual([]);
  });

  it("ACUSA uma porta de escrita injetada DEPOIS do fim da regiao que ela olharia", async () => {
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    const limpo = 'export function ler(path: string) { return http("GET", path); }';
    const injetado = `${limpo}\n\nfunction _autoteste() { return 0; }\n\nexport function gravar(p: string, corpo: unknown) { return http("POST", p, corpo); }\n`;
    expect(
      inspecionar(injetado),
      "ESTE E O VETO 3: a escrita foi injetada APOS o marcador que delimitava a regiao inspecionada, e a inspecao antiga deu verde. A inspecao tem de olhar o TEXTO INTEIRO.",
    ).not.toEqual([]);
  });

  it("ACUSA a escrita ainda que o literal do metodo seja montado em pedacos", async () => {
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    const disfarcado = 'const m = "PO" + "ST"; export function gravar(p: string) { return fetch(p, { method: m }); }';
    expect(
      inspecionar(disfarcado),
      "procurar so o literal 'POST' e frouxo demais: a porta de rede fora do ponto unico ja e o achado, independentemente de como o metodo foi escrito.",
    ).not.toEqual([]);
  });

  it("a porta de rede do modulo e UMA so", async () => {
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    const duasPortas =
      'export async function ler(p: string) { return fetch(base + p); }\nexport async function outra(p: string) { return fetch(p); }';
    expect(
      inspecionar(duasPortas),
      "duas saidas de rede significam uma que passa pela grade e outra que nao. O ponto de saida e unico, por construcao.",
    ).not.toEqual([]);
  });

  it("o autoteste da grade existe, e ele PROVA a grade sem rede", async () => {
    const autoteste = await exigirExport<() => string[]>("grade", "autotesteDaGrade");
    expect(
      autoteste(),
      "o autoteste roda a bateria adversarial inteira e devolve os FUROS. Lista vazia e a unica saida aceitavel, e ele tem de rodar contra o proprio fonte do modulo em producao.",
    ).toEqual([]);
  });
});

// ── 8. FECHADA E INERTE SEM CREDENCIAL ─────────────────────────────────────

describeSuspenso("a integracao nasce FECHADA E INERTE sem credencial", () => {
  it("nao ha token do Digai escrito em codigo", async () => {
    const fonte = semComentario(fonteExigida());
    expect(
      /Bearer\s+[A-Za-z0-9._-]{20,}/.test(fonte),
      "credencial vive em variavel de ambiente, nunca em arquivo versionado, nunca em codigo (protocolo, secao 5).",
    ).toBe(false);
  });

  it("sem `DIGAI_API_TOKEN` a leitura nao sai, e o erro nao carrega credencial", async () => {
    const { mod } = await carregar("cliente");
    expect(
      mod,
      "FALTA IMPLEMENTAR: o cliente do Digai. Ele tem de nascer inerte sem credencial, no mesmo padrao do Pandape (secao A.5), porque o token FOI EXPURGADO em 16/09 e nao esta no `.env`.",
    ).not.toBeNull();

    const Cliente = (mod as Record<string, unknown>).DigaiCliente as
      | (new (cfg: { token?: string }) => { ler(p: string): Promise<unknown>; ativo: boolean })
      | undefined;
    expect(Cliente, "FALTA IMPLEMENTAR: a classe `DigaiCliente`.").toBeDefined();

    const inerte = new Cliente!({ token: undefined });
    expect(inerte.ativo, "sem token, a integracao esta INERTE, e diz isso de si mesma.").toBe(false);
    await expect(
      inerte.ler("/api/v1/public/workspaces"),
      "sem credencial a chamada nao pode sair. Portao que testa uma condicao impossivel e codigo morto que funciona por acidente, e foi o veto 1 de 16/09.",
    ).rejects.toThrow();
  });
});
