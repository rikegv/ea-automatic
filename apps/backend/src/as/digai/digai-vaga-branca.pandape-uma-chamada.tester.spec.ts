import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PandapeApiService } from "../../pandape/pandape-api.service";

/**
 * A SEGUNDA FONTE: O PANDAPE, E O CUSTO DELE MEDIDO EM CHAMADAS.
 *
 * Arquivo do `tester` (secao A.38), escrito a partir do REQUISITO, em paralelo a construcao.
 *
 * ┌─ O NUMERO QUE MANDA NESTE ARQUIVO ───────────────────────────────────────────────────────────┐
 * │ `GET /v1/Vacancy/List` devolveu 6.944 vagas e 9,8 MB em UMA requisicao (medido 08/10/2026), e │
 * │ a v1 NAO tem busca por id: `getVacancy(id)` LISTA TUDO e filtra em memoria. Entao chamar       │
 * │ `getVacancy` por vaga, nas 13, sao 13 listagens de 9,8 MB (127 MB) dentro de uma cota que o    │
 * │ webhook que alimenta a folha divide com a gente. UMA chamada por ciclo, 13 filtragens em       │
 * │ memoria.                                                                                       │
 * │                                                                                                │
 * │ O TESTE CONTA AS CHAMADAS DE REDE. Nao pergunta se existe um campo de cache: campo de cache     │
 * │ existe e nao e usado, e a assercao ficaria verde sobre 13 listagens.                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUMA CHAMADA REAL SAI DAQUI: `globalThis.fetch` e substituido em todos os blocos, e um dos
 * testes PROVA que o servico nao toca a rede sem credencial.
 *
 * Secao A.6: a lista fingida tem numero de vaga, nome de vaga e cidade, que nao sao dado pessoal.
 * Nenhum CPF, nenhum nome de pessoa, nenhum e-mail, nenhum token real.
 */

const CAMINHO_DA_LISTA = "/v1/Vacancy/List";

/** As vagas que o duble devolve: as duas alcancaveis medidas, mais uma de controle. */
const VAGAS_FINGIDAS = [
  { idVacancy: 3703137, job: "AUXILIAR DE LIMPEZA - LOJA CENTRO", city: "Sao Paulo - SP", numberVacancies: 2, status: 3 },
  { idVacancy: 3421670, job: "ESCOLA DE ELETRICISTAS - TAUBATE", city: "Taubate - SP", numberVacancies: 1, status: 2 },
  { idVacancy: 900001, job: "VAGA DE CONTROLE DO TESTE", city: "Campinas - SP", numberVacancies: 5, status: 1 },
];

function config(valores: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => valores[k] } as unknown as ConfigService;
}

const comCredenciais = () =>
  config({ PANDAPE_CLIENT_ID: "client-de-teste", PANDAPE_CLIENT_SECRET: "secret-de-teste" });

/**
 * O duble de rede que CONTA por caminho.
 *
 * A LENTE QUE EU MESMO PEDI PARA APLICAR: "algum duble responde igual para consultas diferentes?".
 * Aqui NAO, e isso e deliberado. O endpoint de token e a lista sao rotas DISTINTAS, com corpos
 * distintos: um duble que respondesse a mesma coisa para os dois faria o contador de listagem somar
 * a emissao de token, e o teste de "uma chamada por ciclo" ficaria verde com duas listagens (ou
 * vermelho sem motivo). O contador que vale e so o do caminho da lista.
 */
function redeQueConta(opcoes: { corpo?: unknown; statusDaLista?: number; falha?: "rede" | "timeout" } = {}) {
  const chamadas: string[] = [];
  const fn = vi.fn(async (url: string) => {
    chamadas.push(url);
    if (url.includes("/connect/token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "TKN-DE-TESTE", expires_in: 3600, token_type: "Bearer" }),
      } as unknown as Response;
    }
    if (opcoes.falha === "timeout") throw Object.assign(new Error("abortado"), { name: "AbortError" });
    if (opcoes.falha === "rede") throw new Error("getaddrinfo ENOTFOUND");
    const status = opcoes.statusDaLista ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => opcoes.corpo ?? VAGAS_FINGIDAS,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return {
    chamadas,
    listagens: () => chamadas.filter((u) => u.includes(CAMINHO_DA_LISTA)).length,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── 1. O CUSTO MEDIDO: POR QUE O CACHE POR CICLO E OBRIGATORIO ────────────────────────────────

describe("o custo real de `getVacancy`, que e o que obriga o cache por ciclo", () => {
  it("duas perguntas por id = DUAS listagens de 6.944 vagas: o caminho cru nao serve", async () => {
    const rede = redeQueConta();
    const api = new PandapeApiService(comCredenciais());

    await api.getVacancy("3703137");
    await api.getVacancy("3421670");

    expect(
      rede.listagens(),
      "este numero e a MEDIDA do caminho cru, nao um defeito: a v1 nao tem busca por id, entao " +
        "cada `getVacancy` lista tudo. Se ele virar 1, a memoizacao passou a viver DENTRO do " +
        "cliente da API, e esse e um alcance que toca a varredura do Pandape inteira (secao A.26): " +
        "cache de processo serviria vaga encerrada como ativa na volta seguinte. O cache do " +
        "requisito e POR CICLO, e mora no enriquecimento.",
    ).toBe(2);
  });

  it("cada listagem carrega a lista INTEIRA, e nao a vaga perguntada", async () => {
    const rede = redeQueConta();
    const api = new PandapeApiService(comCredenciais());

    const vaga = await api.getVacancy("3703137");

    expect(vaga?.idVacancy, "o filtro por id em memoria deixou de funcionar").toBe(3703137);
    const url = rede.chamadas.find((u) => u.includes(CAMINHO_DA_LISTA))!;
    expect(
      url,
      "a URL passou a carregar o id: se a API tiver ganhado busca por id, o cache por ciclo deixa " +
        "de ser obrigatorio e esta frente tem de ser redesenhada, com medicao nova",
    ).not.toMatch(/3703137/);
  });
});

// ── 2. REGRA 4: A FALHA DO PANDAPE NAO DERRUBA A INGESTAO ─────────────────────────────────────

describe("lista indisponivel: a vaga nasce como hoje e o ciclo termina sem excecao", () => {
  it("HTTP 500 na listagem: lista vazia, vaga indefinida, zero excecao", async () => {
    redeQueConta({ statusDaLista: 500 });
    const api = new PandapeApiService(comCredenciais());

    await expect(api.listarVagas()).resolves.toEqual([]);
    await expect(
      api.getVacancy("3703137"),
      "o 500 do Pandape virou excecao e derrubaria a ingestao do Digai. O enriquecimento e um " +
        "BONUS: sem ele a vaga nasce em branco, como nasce hoje, e a candidatura e escrita do " +
        "mesmo jeito. Perder a pessoa por causa do enriquecimento e trocar um incomodo por um dano.",
    ).resolves.toBeUndefined();
  });

  it("queda de rede e tempo esgotado: os dois devolvem vazio, nenhum lanca", async () => {
    redeQueConta({ falha: "rede" });
    await expect(new PandapeApiService(comCredenciais()).getVacancy("3703137")).resolves.toBeUndefined();

    vi.unstubAllGlobals();
    redeQueConta({ falha: "timeout" });
    await expect(new PandapeApiService(comCredenciais()).getVacancy("3703137")).resolves.toBeUndefined();
  });

  it("corpo que nao e lista (objeto de erro do fornecedor): vazio, e nao quebra no `.find`", async () => {
    redeQueConta({ corpo: { message: "quota exceeded" } });
    const api = new PandapeApiService(comCredenciais());

    await expect(api.listarVagas()).resolves.toEqual([]);
    await expect(api.getVacancy("3703137")).resolves.toBeUndefined();
  });

  it("sem credencial: nao toca a rede, e nao finge que a vaga nao existe por outro motivo", async () => {
    const rede = redeQueConta();
    const api = new PandapeApiService(config({ PANDAPE_CLIENT_ID: "", PANDAPE_CLIENT_SECRET: "" }));

    await expect(api.getVacancy("3703137")).resolves.toBeUndefined();
    expect(rede.chamadas, "o modulo inerte tocou a rede, inclusive o endpoint de token").toEqual([]);
  });
});

// ── 3. A VAGA QUE NAO ESTA NA LISTA: SEGUE SEM ERRO E SEM INVENTAR NOME ───────────────────────

describe("a vaga fora da lista do Pandape (6 das 13 medidas)", () => {
  it("devolve indefinido, sem erro e sem nome aproximado de vaga vizinha", async () => {
    redeQueConta();
    const api = new PandapeApiService(comCredenciais());

    const orfas = ["3498580", "3500236", "3517382", "3586617", "3696629"];
    for (const numero of orfas) {
      const vaga = await api.getVacancy(numero);
      expect(
        vaga,
        `a vaga ${numero} nao esta na lista e algo foi devolvido. Inventar nome e pior do que ` +
          `linha em branco: a linha em branco se ve, o nome errado nao.`,
      ).toBeUndefined();
    }
  });

  it("o id casa por TEXTO, entao numero e string do fornecedor acham a mesma vaga", async () => {
    /*
     * `partnerJobId` do Digai e TEXTO, `idVacancy` do Pandape vem NUMERO. Comparar sem normalizar
     * daria "nao achei" em todas as 13, e o sintoma seria identico ao da vaga que realmente nao
     * esta na lista: enriquecimento que nunca acontece, sem nada vermelho.
     */
    redeQueConta({
      corpo: [{ idVacancy: "3703137", job: "VAGA COM ID EM TEXTO", city: "Sao Paulo - SP" }],
    });
    const api = new PandapeApiService(comCredenciais());
    await expect(api.getVacancy("3703137")).resolves.toBeTruthy();
  });
});

// ── 4. O QUE CHEGA DA LISTA CHEGA INTACTO: NADA DE DEFAULT NO MEIO DO CAMINHO ─────────────────

describe("o valor que vem do Pandape nao e substituido por default no cliente da API", () => {
  it("o status chega como o fornecedor mandou, inclusive 3 (ENCERRADA), e nao normalizado", async () => {
    /*
     * `status = 3` significa ENCERRADA (medido por cruzamento: 21 das que o EA conhece em 3 estao
     * FECHADA no EA). As 7 alcancaveis das 13 estao TODAS em 3, e e por isso que o status tem de
     * aparecer na linha: ha candidatura entrando em vaga encerrada no Pandape.
     *
     * O VALOR E NUMERO, e a interface `PandapeVacancy` declara `status?: string`. O cliente nao
     * converte (passa o JSON adiante), entao o numero chega cru. Quem comparar com "3" em texto
     * nunca vai casar, e o indicador da tela nasce sempre vazio, sem nada ficar vermelho.
     */
    redeQueConta();
    const api = new PandapeApiService(comCredenciais());

    const vaga = await api.getVacancy("3703137");
    expect(
      (vaga as { status?: unknown } | undefined)?.status,
      "o status deixou de chegar como o fornecedor mandou. Se alguem passou a normalizar aqui, o " +
        "indicador da tela deixa de ser o que veio do Pandape e passa a ser o default de alguem.",
    ).toBe(3);
  });

  it("`job` e `city` chegam literais, sem corte e sem corrigir espaco", async () => {
    redeQueConta({
      corpo: [{ idVacancy: 900002, job: "  AUXILIAR   DE  LIMPEZA  ", city: " Sao Paulo - SP " }],
    });
    const api = new PandapeApiService(comCredenciais());

    const vaga = await api.getVacancy("900002");
    expect(
      vaga?.job,
      "o cliente da API passou a limpar o texto. Limpar nao e errado, mas o LUGAR importa: " +
        "normalizar aqui alcanca a varredura do Pandape inteira (secao A.26), e o requisito desta " +
        "frente e normalizar no ENRIQUECIMENTO.",
    ).toBe("  AUXILIAR   DE  LIMPEZA  ");
  });

  it("`numberVacancies` sobrevive a travessia, mesmo nao estando na interface declarada", async () => {
    /*
     * GAP MEDIDO, e e um que o requisito depende: `PandapeVacancy` NAO declara `numberVacancies`
     * (nem `publishedDate`, nem `tags` com o tipo medido). O JSON passa adiante, entao o dado
     * CHEGA, mas o TypeScript nao o ve: quem escrever `vaga.numberVacancies` nao compila, e a saida
     * facil e um `as never`, que e exatamente como um campo errado entra sem ninguem notar.
     */
    redeQueConta();
    const api = new PandapeApiService(comCredenciais());

    const vaga = await api.getVacancy("3703137");
    expect(
      (vaga as { numberVacancies?: unknown } | undefined)?.numberVacancies,
      "o numero de posicoes nao chegou: sem ele a terceira parte do enriquecimento pelo Pandape " +
        "nao tem fonte",
    ).toBe(2);
  });
});

// ── 5. O CONTRATO DO TIPO: O CAMPO QUE A CONSTRUCAO PRECISA DECLARAR ──────────────────────────

const FONTE_DO_CLIENTE_DA_API = readFileSync(
  join(__dirname, "../../pandape/pandape-api.service.ts"),
  "utf8",
);

describe("a interface da vaga do Pandape declara os campos que o enriquecimento consome", () => {
  it("`numberVacancies` esta declarado em PandapeVacancy", () => {
    const declaracao = /export interface PandapeVacancy\s*\{([\s\S]*?)\n\}/.exec(FONTE_DO_CLIENTE_DA_API)?.[1] ?? "";
    expect(declaracao.length, "a interface PandapeVacancy nao foi encontrada no fonte").toBeGreaterThan(0);
    expect(
      declaracao,
      "`numberVacancies` nao esta na interface, e a API o devolve (medido). Consumir campo que o " +
        "tipo nao tem exige `as` em algum lugar, e `as` e onde nome de campo errado passa a " +
        "compilar: `numberVacancy`, `vacancies`, `numVacancies` ficariam todos verdes, devolvendo " +
        "indefinido para sempre.",
    ).toMatch(/\bnumberVacancies\b/);
  });

  it("`status` admite o NUMERO que a API devolve, e nao so texto", () => {
    const declaracao = /export interface PandapeVacancy\s*\{([\s\S]*?)\n\}/.exec(FONTE_DO_CLIENTE_DA_API)?.[1] ?? "";
    const linhaDoStatus = /status\?:[^;]+;/.exec(declaracao)?.[0] ?? "";
    expect(linhaDoStatus.length, "a interface nao declara `status`").toBeGreaterThan(0);
    expect(
      linhaDoStatus,
      "`status` esta declarado so como texto e a API devolve NUMERO (3 = ENCERRADA, medido em " +
        "6.408 vagas). O tipo afirma uma coisa e o dado e outra: a comparacao com '3' em texto " +
        "nunca casa, e o indicador da vaga encerrada nasce vazio em producao sem um teste ficar " +
        "vermelho.",
    ).toMatch(/number/);
  });
});

// ── 6. CANARIO: NINGUEM NO DIGAI PERGUNTA POR ID, PORQUE PERGUNTAR POR ID E LISTAR TUDO ───────

function fontesDeProducao(pasta: string): { nome: string; conteudo: string }[] {
  const saida: { nome: string; conteudo: string }[] = [];
  const andar = (dir: string, prefixo: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        andar(caminho, `${prefixo}${nome}/`);
        continue;
      }
      if (!nome.endsWith(".ts")) continue;
      if (nome.includes(".spec.") || nome.includes("tester-fake") || nome.includes(".fake.")) continue;
      saida.push({ nome: `${prefixo}${nome}`, conteudo: readFileSync(caminho, "utf8") });
    }
  };
  andar(pasta, "");
  return saida;
}

function semComentario(conteudo: string): string {
  return conteudo
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("*/");
    })
    .join("\n");
}

describe("canario do cache por ciclo: o Digai nao pergunta vaga por id", () => {
  it("nenhum arquivo de producao do Digai chama getVacancy", () => {
    /*
     * ESTE E O CANARIO QUE PEGA O JEITO MAIS NATURAL DE ESCREVER A FRENTE ERRADA: um
     * `await api.getVacancy(numero)` dentro do laco das candidaturas. Funciona, fica verde em
     * qualquer teste de resultado, e cobra 9,8 MB por vaga de uma cota compartilhada com o webhook
     * que alimenta a folha. O caminho certo e UMA `listarVagas()` por ciclo e filtragem em memoria.
     *
     * Vacuamente verde hoje e DECLARADO: a contagem de fontes entra na propria assercao, entao
     * "nao ha chamada" nunca sera verdade sobre o vazio.
     */
    const fontes = fontesDeProducao(__dirname);
    expect(fontes.length, "nao ha fonte de producao na pasta do Digai").toBeGreaterThan(5);

    const culpados = fontes
      .filter((f) => /\.getVacancy\s*\(/.test(semComentario(f.conteudo)))
      .map((f) => f.nome);
    expect(
      culpados,
      "ha chamada de `getVacancy` no modulo do Digai. A v1 do Pandape nao tem busca por id: cada " +
        "chamada lista 6.944 vagas e 9,8 MB. Nas 13 vagas em branco sao 127 MB por ciclo, e a cota " +
        "e dividida com o webhook do Pandape que alimenta a folha.",
    ).toEqual([]);
  });

  it("se o Digai ja lista as vagas, ele lista em UM lugar so", () => {
    /*
     * A assercao e sobre o NUMERO DE PONTOS DE CHAMADA, nao sobre existir campo de cache. Dois
     * pontos de chamada no mesmo ciclo sao duas listagens de 9,8 MB, mesmo com um campo chamado
     * `cache` no arquivo. Enquanto ninguem lista (hoje), a assercao e vacuamente verde e isso esta
     * declarado aqui; no dia em que a construcao chegar, ela cobra o ponto unico.
     */
    const fontes = fontesDeProducao(__dirname);
    const pontos: string[] = [];
    for (const f of fontes) {
      const ocorrencias = semComentario(f.conteudo).match(/\.listarVagas\s*\(/g) ?? [];
      for (let i = 0; i < ocorrencias.length; i += 1) pontos.push(f.nome);
    }
    expect(
      pontos.length,
      `a listagem de vagas do Pandape e chamada em ${pontos.length} pontos dentro do modulo do ` +
        `Digai (${pontos.join(", ")}). Cada ponto e uma listagem de 9,8 MB por ciclo: o requisito ` +
        "e UMA chamada por ciclo, com as 13 filtragens feitas em memoria sobre a mesma lista.",
    ).toBeLessThanOrEqual(1);
  });
});
