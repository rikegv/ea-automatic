import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { join, resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * A CHAVE RSA SUMIU DE VERDADE, E NEM A URL NEM O BILHETE APARECEM EM LUGAR NENHUM.
 *
 * TESTE INDEPENDENTE (§A.38), escrito a partir do REQUISITO e em paralelo a construcao (§A.40
 * regra 2). Duas provas que a secao 12 do desenho classifica como PROVAVEIS HOJE, sem balde e sem
 * nuvem, e que por isso nao tem desculpa para ficarem como declaracao.
 *
 * 1. A entrega desta frente e o DESAPARECIMENTO das quatro variaveis de credencial do Google e da
 *    assinatura RSA de dentro do EA. Isso se MEDE por varredura, e nao se afirma em relatorio.
 * 2. §A.6: a URL assinada e o bilhete SAO credenciais, e o nome do objeto atravessa o registro de
 *    acesso de um terceiro. Nenhum dos tres pode ser persistido nem logado, nem no caminho feliz
 *    nem no de erro, que e onde a mensagem costuma carregar o que ninguem queria gravar.
 */

const SRC = resolve(__dirname, "..");
const ESTE_ARQUIVO = "portal-sem-chave-e-sem-vazamento.tester.spec.ts";

function arquivosTs(dir: string, acumulado: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const alvo = join(dir, nome);
    if (statSync(alvo).isDirectory()) arquivosTs(alvo, acumulado);
    else if (alvo.endsWith(".ts")) acumulado.push(alvo);
  }
  return acumulado;
}

const TODOS = arquivosTs(SRC).filter((a) => !a.endsWith(ESTE_ARQUIVO));
const DO_PORTAL = TODOS.filter((a) => a.includes(`${"/"}portal${"/"}`) && !a.endsWith(".spec.ts"));

function relativo(caminho: string): string {
  return caminho.replace(`${SRC}/`, "");
}

/**
 * O UNICO ARQUIVO DO PORTAL COM PERMISSAO DE ASSINAR, e a permissao e de UMA coisa so.
 *
 * O correio do Portal assina o JWT de OAuth do Google (`createSign("RSA-SHA256")`, fluxo
 * `jwt-bearer`) para trocar por um token do Gmail. Isso NAO e a assinatura de URL de armazenamento
 * que esta frente removeu do EA: e outro assunto, outra chave e outro destino.
 *
 * EXCLUIR O ARQUIVO DA VARREDURA FOI RECUSADO PELA AUDITORIA. A excecao e NOMINAL e vem casada com
 * o teste "o correio assina O JWT do Gmail, e nada alem disso", logo abaixo, que afirma o valor
 * esperado dos dois lados.
 */
const ASSINA_JWT_DO_CORREIO = "portal/portal-correio.service.ts";

describe("A chave RSA saiu do EA, e isso e medida", () => {
  const VARIAVEIS = [
    "PORTAL_GCS_ESCRITA_SA_EMAIL",
    "PORTAL_GCS_ESCRITA_PRIVATE_KEY",
    "PORTAL_GCS_LEITURA_SA_EMAIL",
    "PORTAL_GCS_LEITURA_PRIVATE_KEY",
  ];

  for (const variavel of VARIAVEIS) {
    it(`zero ocorrencias de ${variavel} no backend`, () => {
      const achados = TODOS.filter((a) => readFileSync(a, "utf8").includes(variavel)).map(relativo);
      expect(
        achados,
        `${variavel} ainda existe no backend. Enquanto ela existir, a chave privada de escrita continua sendo lida por este processo, e a entrega desta frente nao aconteceu`,
      ).toEqual([]);
    });
  }

  it("o modulo de assinatura V4 foi REMOVIDO, e nao deixado morto", () => {
    // Item 6 da secao 11.1: arquivo com carregador de chave privada parado no repositorio e
    // convite para alguem religa-lo.
    expect(existsSync(join(__dirname, "gcs-assinatura-v4.ts")), "`gcs-assinatura-v4.ts` ainda existe").toBe(false);
    expect(existsSync(join(__dirname, "gcs-assinatura-v4.spec.ts"))).toBe(false);
  });

  it("nenhum arquivo do Portal assina com RSA nem carrega chave privada de conta de servico", () => {
    const marcas = ["GOOG4-RSA-SHA256", "createSign(", "RSA-SHA256", "carregarCredencialGcs", "BEGIN PRIVATE KEY"];
    const achados: string[] = [];
    for (const arquivo of DO_PORTAL) {
      if (relativo(arquivo) === ASSINA_JWT_DO_CORREIO) continue;
      const fonte = readFileSync(arquivo, "utf8");
      for (const marca of marcas) {
        if (fonte.includes(marca)) achados.push(`${relativo(arquivo)} -> ${marca}`);
      }
    }
    expect(achados, "a assinatura da URL tem de acontecer fora do EA, na identidade de runtime do emissor").toEqual([]);
  });

  /**
   * A EXCECAO NOMINAL NAO E UM ESCONDERIJO, E ELA TEM DE SER PROVADA TODO DIA.
   *
   * EXCLUIR O ARQUIVO DA VARREDURA FOI RECUSADO PELA AUDITORIA, e com razao: a garantia deste
   * teste e ser INVENTARIO FECHADO dos segredos do Portal, e foi exatamente assim que ele pegou o
   * segredo NOVO do correio. Um arquivo fora da varredura seria o lugar onde o proximo segredo
   * entra sem ninguem ver.
   *
   * O que o correio assina e o JWT de OAuth do Google (fluxo `jwt-bearer`), que NAO e a assinatura
   * de URL de armazenamento que esta frente tirou do EA: outro assunto, outra chave e outro
   * destino. Um manda e-mail em nome da caixa delegada; a outra concedia acesso direto ao balde.
   *
   * Por isso a excecao e NOMINAL e vem com o valor ESPERADO explicito, que e estritamente mais
   * forte do que pular o arquivo: falha tambem se o correio DEIXAR de assinar (a permissao virou
   * letra morta e a excecao tem de sair daqui) ou se ele passar a assinar OUTRA coisa.
   */
  it("o correio assina O JWT do Gmail, e nada alem disso", () => {
    const fonte = readFileSync(join(SRC, ASSINA_JWT_DO_CORREIO), "utf8");

    expect(
      fonte.includes("createSign("),
      `\`${ASSINA_JWT_DO_CORREIO}\` parou de assinar. A excecao nominal acima virou letra morta e tem de SAIR da varredura, senao ela vira esconderijo`,
    ).toBe(true);

    for (const proibida of ["GOOG4-RSA-SHA256", "carregarCredencialGcs", "BEGIN PRIVATE KEY", "PORTAL_GCS_"]) {
      expect(
        fonte.includes(proibida),
        `o correio passou a mexer com \`${proibida}\`. Ele tem permissao para assinar o JWT de OAuth do Gmail e NADA MAIS: assinatura de URL de armazenamento e chave de conta de servico do balde sairam do EA nesta frente e nao voltam por esta porta`,
      ).toBe(false);
    }
  });

  it("o unico segredo que sobra no Portal e a chave do BILHETE", () => {
    const fontes = DO_PORTAL.map((a) => readFileSync(a, "utf8")).join("\n");
    const variaveisDeChave = [...fontes.matchAll(/PORTAL_[A-Z0-9_]*(_KEY|_SECRET|_SA_EMAIL)\b/g)].map((m) => m[0]);
    const inesperadas = [...new Set(variaveisDeChave)].filter(
      (nome) =>
        ![
          "PORTAL_EMISSOR_BILHETE_PRIVATE_KEY",
          "PORTAL_SESSION_SECRET",
          "PORTAL_SESSION_PUBLIC_KEY",
          // AS DUAS CHAVES DA IDENTIDADE (decisao 10 do documento de regras), acrescentadas pela
          // frente que emite o link e a sessao. Elas NAO sao credencial de terceiro: sao chaves
          // Ed25519 do proprio EA, e sao PARES SEPARADOS de proposito. Com uma chave so, o dia em
          // que a checagem de `typ` cair numa refatoracao um link de 72 horas passa a valer como
          // sessao de 72 horas e nada falha.
          "PORTAL_LINK_PRIVATE_KEY",
          "PORTAL_SESSION_PRIVATE_KEY",
          // AS DUAS DO CORREIO (frente do envio do link). Elas entram NESTA LISTA, e nao numa
          // exclusao do arquivo da varredura, porque a garantia deste teste e o INVENTARIO: um
          // segredo novo no Portal so passa a existir depois de alguem editar esta lista e
          // escrever por que ele existe. Foi assim que o teste pegou o proprio correio.
          //
          // Sao a conta de servico e a chave RSA que assinam o JWT de OAuth do Gmail, reusando a
          // conta e a delegacao de dominio que ja rodam em producao no Drive. Nao concedem acesso
          // a balde nenhum: o escopo e `gmail.send`, afirmado logo abaixo.
          //
          // `PORTAL_CORREIO_REMETENTE` e `PORTAL_CORREIO_TIMEOUT_MS` NAO entram: nao sao segredo e
          // nem casam com o regex acima (`_KEY`, `_SECRET`, `_SA_EMAIL`).
          "PORTAL_CORREIO_SA_EMAIL",
          "PORTAL_CORREIO_PRIVATE_KEY",
        ].includes(nome),
    );
    expect(inesperadas, "variavel de chave inesperada no Portal").toEqual([]);
  });

  /**
   * A CHAVE DO CORREIO E LIDA EM UM ARQUIVO SO.
   *
   * Espalhar o segredo por um segundo arquivo multiplica as copias dele em memoria e multiplica os
   * caminhos por onde ele volta num log de erro (a mensagem do OpenSSL repete pedacos da chave, e
   * e por isso que o correio so loga o NOME da classe do erro). Um ponto de leitura e o que torna
   * essa disciplina conferivel de relance.
   */
  for (const variavel of ["PORTAL_CORREIO_PRIVATE_KEY", "PORTAL_CORREIO_SA_EMAIL"]) {
    it(`${variavel} e lida em UM arquivo so`, () => {
      const achados = TODOS.filter((a) => readFileSync(a, "utf8").includes(variavel)).map(relativo);
      expect(
        achados,
        `${variavel} passou a ser lida em mais de um lugar. Espalhar o segredo multiplica as copias dele em memoria e os caminhos por onde ele vaza num log de erro; quem precisa enviar e-mail chama o \`PortalCorreioService\``,
      ).toEqual([ASSINA_JWT_DO_CORREIO]);
    });
  }

  /**
   * O ESCOPO E `gmail.send` E NADA ALEM, e esta e a linha que mais importa deste arquivo.
   *
   * Hoje o escopo e uma constante em UMA linha do correio. Sem teste, alargar para `gmail.modify`
   * ou `gmail.readonly` e uma edicao de dez segundos que ninguem revisa, e o efeito e enorme: o
   * token passaria a dar ao processo a CAIXA INTEIRA do remetente (ler, apagar, responder), com a
   * delegacao de dominio ja concedida e sem nenhuma aprovacao nova.
   */
  it("o correio pede `gmail.send` e mais nenhum escopo do Google", () => {
    const fonte = readFileSync(join(SRC, ASSINA_JWT_DO_CORREIO), "utf8");
    const escopos = [...new Set([...fonte.matchAll(/googleapis\.com\/auth\/([a-z.]+)/g)].map((m) => m[1]))];
    expect(
      escopos,
      "o escopo do correio mudou. `gmail.send` so deixa MANDAR; qualquer escopo de leitura ou de modificacao entrega a caixa inteira do remetente ao processo, com a delegacao de dominio ja concedida",
    ).toEqual(["gmail.send"]);
  });
});

describe("§A.6: URL, bilhete e nome do objeto nao sao PERSISTIDOS", () => {
  it("a tabela da cota nao tem coluna de URL, de bilhete nem de token", () => {
    const schema = readFileSync(join(SRC, "db", "schema", "tables.ts"), "utf8");
    const inicio = schema.indexOf("portalCredenciais");
    expect(inicio).toBeGreaterThan(-1);
    const bloco = schema.slice(inicio, schema.indexOf("});", inicio));
    // So os NOMES DE COLUNA, nunca o comentario: o comentario fala de URL de proposito, para dizer
    // que ela NAO e guardada.
    const colunas = [...bloco.matchAll(/(?:varchar|text|integer|uuid|timestamp|boolean|jsonb)\("([a-z_]+)"/g)].map((m) => m[1]);
    for (const proibido of ["url", "bilhete", "token", "assinatura"]) {
      const achada = colunas.filter((coluna) => coluna.includes(proibido));
      expect(achada, `coluna com \`${proibido}\` em portal_credenciais, e credencial nao se guarda`).toEqual([]);
    }
  });

  it("nenhum arquivo do Portal grava a URL assinada em banco", () => {
    const achados = DO_PORTAL.filter((arquivo) => {
      const fonte = readFileSync(arquivo, "utf8");
      return /\.(insert|update)\([^)]*\)[\s\S]{0,400}(urlAssinada|url:\s*assinada|url:\s*resposta\.url)/.test(fonte);
    }).map(relativo);
    expect(achados).toEqual([]);
  });
});

describe("§A.6: URL, bilhete e nome do objeto nao vao para o LOG", () => {
  it("nenhuma chamada de log interpola url, bilhete ou token", () => {
    const suspeitas: string[] = [];
    for (const arquivo of DO_PORTAL) {
      const fonte = readFileSync(arquivo, "utf8");
      for (const chamada of fonte.match(/this\.log\.(log|warn|error|debug|verbose)\(([\s\S]*?)\);/g) ?? []) {
        if (/\$\{[^}]*\b(url|bilhete|token|authorization|assinada)\b/i.test(chamada)) {
          suspeitas.push(`${relativo(arquivo)} -> ${chamada.slice(0, 120)}`);
        }
        // O nome do objeto so pode ir em PREFIXO (secao 6 do desenho). Interpolar o objeto inteiro
        // grava o envio exato, que identifica o candidato no registro de acesso de um terceiro.
        if (/\$\{[^}]*\bobjeto\b/i.test(chamada) && !/split\(/.test(chamada)) {
          suspeitas.push(`${relativo(arquivo)} -> objeto inteiro em log: ${chamada.slice(0, 120)}`);
        }
      }
    }
    expect(suspeitas).toEqual([]);
  });
});

/**
 * A prova de comportamento, contra um servidor falso local: nem o caminho feliz nem o de erro do
 * cliente do emissor deixam a URL, o bilhete ou o nome do objeto no log.
 */
describe("§A.6 em execucao: o cliente do emissor nao vaza no caminho de erro", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const PEM_B64 = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "utf8").toString("base64");
  const OBJETO = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/RG__0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b.pdf";
  const URL_ASSINADA = "https://storage.googleapis.com/ea-portal-entrada/obj?X-Goog-Signature=deadbeef";

  let servidor: Server;
  let porta = 0;
  let corposRecebidos: string[] = [];
  let status = 500;

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      let corpo = "";
      req.on("data", (p) => (corpo += p));
      req.on("end", () => {
        corposRecebidos.push(corpo);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ url: URL_ASSINADA, cabecalhos: {}, metodo: "PUT" }));
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    porta = (servidor.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((ok) => servidor.close(() => ok()));
  });

  function config(valores: Record<string, string>) {
    return { get: (chave: string) => valores[chave] } as never;
  }

  it("emissor que devolve erro nao deixa URL, bilhete nem objeto no log", async () => {
    const mod = (await import("./portal-emissor.service")) as unknown as Record<string, unknown>;
    const Classe = mod.PortalEmissorService as unknown as new (cfg: unknown) => {
      assinarEscrita: (dados: unknown) => Promise<unknown>;
    };
    expect(Classe, "`portal/portal-emissor.service.ts` precisa exportar `PortalEmissorService`").toBeDefined();

    const capturado: string[] = [];
    for (const metodo of ["log", "warn", "error", "debug", "verbose"] as const) {
      vi.spyOn(Logger.prototype, metodo).mockImplementation(((...args: unknown[]) => {
        capturado.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      }) as never);
    }

    status = 500;
    corposRecebidos = [];
    const servico = new Classe(
      config({
        PORTAL_EMISSOR_URL: `http://127.0.0.1:${porta}`,
        PORTAL_EMISSOR_BILHETE_PRIVATE_KEY: PEM_B64,
        PORTAL_EMISSOR_TIMEOUT_MS: "2000",
        PORTAL_GCS_BUCKET: "ea-portal-entrada",
      }),
    );

    await servico
      .assinarEscrita({
        destino: "assinar-escrita",
        bucket: "ea-portal-entrada",
        objeto: OBJETO,
        metodo: "PUT",
        cabecalhos: {
          "content-type": "application/pdf",
          "x-goog-content-length-range": "0,512000",
          "x-goog-if-generation-match": "0",
        },
        ttlSegundos: 600,
        absEpoch: Math.floor(Date.now() / 1000) + 600,
      })
      .catch(() => undefined);

    vi.restoreAllMocks();

    const texto = capturado.join("\n");
    expect(texto.includes(URL_ASSINADA), "a URL assinada apareceu em log").toBe(false);
    expect(texto.includes("X-Goog-Signature"), "a assinatura apareceu em log").toBe(false);
    expect(texto.includes(OBJETO), "o nome completo do objeto apareceu em log").toBe(false);
    expect(/eyJ[A-Za-z0-9_-]{10,}/.test(texto), "o bilhete apareceu em log").toBe(false);
  });

  it("o bilhete de fato viaja no corpo, e o corpo nao carrega dado pessoal", () => {
    expect(corposRecebidos.length, "o cliente do emissor nao chegou a chamar o servidor falso").toBeGreaterThan(0);
    const corpo = corposRecebidos.join("\n");
    for (const pii of ["52998224725", "529.982.247-25", "Fulano De Tal", "fulano@exemplo.com.br"]) {
      expect(corpo.includes(pii)).toBe(false);
    }
  });
});
