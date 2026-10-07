import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import type { Escrita } from "./ingestao-portas";
import { CODIGO, catalogoDaRevisao } from "./vaga-pendente-revisao.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE (tester, §A.38): A VARREDURA RELÊ, NÃO ESTOURA ────────────────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, NÃO DO CÓDIGO (§A.38/§A.40 regra 2), com a construção correndo em
 * paralelo. O dublê daqui não imita a instrução que o autor escreveu: ele faz o que o Postgres passa
 * a fazer a partir da migration 0150, recusar a segunda linha com o mesmo número, e deixa o código
 * provar que sabe se recompor.
 *
 * O REQUISITO, na íntegra (o ramo da varredura):
 *  - a varredura é processo automático, de 30 em 30 minutos, e NÃO tem usuário para avisar;
 *  - a violação do unique ali significa que outra volta simultânea GANHOU a corrida;
 *  - o certo é RELER a vaga por aquele número e SEGUIR COM ELA;
 *  - sem criar vaga nova e sem lançar exceção que derrube o job.
 *
 * O QUE O REQUISITO NÃO DIZ, E ESTE ARQUIVO MEDE DO MESMO JEITO:
 *  - a frase amigável NÃO pode aparecer aqui. Se a varredura passar a devolver "já existe vaga com
 *    esse número" como erro de usuário, o job falha de 30 em 30 minutos e ninguém vê: não há tela
 *    nenhuma olhando o retorno deste caminho;
 *  - a violação de OUTRO unique não pode ser engolida pela mesma recuperação, senão uma falha de
 *    banco qualquer vira "vaga reusada" e a ingestão segue sobre uma vaga que não é a dela;
 *  - a releitura pode NÃO achar nada (a vencedora foi apagada no intervalo). O desfecho não pode ser
 *    um id inventado nem um laço infinito;
 *  - a ADOÇÃO (o `update` que grava o número numa vaga que estava sem identidade) viola o MESMO
 *    índice, e o requisito só fala do insert;
 *  - a CHAVE do índice e o CRITÉRIO das buscas têm de concordar, e o critério é LIDO DO DDL em vez
 *    de fixado aqui. Foi uma chave normalizada ao lado de buscas cruas que travou a vaga para
 *    sempre, sem corrida nenhuma, e um teste que nomeasse o mecanismo impediria o conserto de ser
 *    trocado pelo caminho melhor, que foi o que aconteceu com a primeira versão deste arquivo.
 *
 * §A.6: números de vaga sintéticos. Nenhum dado pessoal entra neste arquivo.
 */

const ID_VACANCY = 9907701;
const CODIGO_DO_EVENTO = "codigo-sintetico-da-vaga";
const ID_DA_VENCEDORA = "33333333-3333-4333-8333-333333333333";
const ID_DA_CANDIDATA_DA_ADOCAO = "44444444-4444-4444-8444-444444444444";
const NOME_DO_INDICE = "uq_vagas_id_vacancy_pandape";

// ── 1. O DUBLÊ: O POSTGRES COM O UNIQUE PARCIAL LIGADO ─────────────────────────────────────────

/** O erro exatamente como o driver `postgres` desta casa o entrega. */
function violacaoDoUnique(indice: string = NOME_DO_INDICE): Error {
  return Object.assign(
    new Error(`duplicate key value violates unique constraint "${indice}"`),
    {
      code: "23505",
      constraint_name: indice,
      detail: `Key (id_vacancy_pandape)=(${ID_VACANCY}) already exists.`,
      table: "vagas",
    },
  );
}

function textoComValores(q: unknown): string {
  if (q === null || q === undefined) return "null";
  if (typeof q === "string" || typeof q === "number" || typeof q === "boolean") return String(q);
  const no = q as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(no.queryChunks)) return no.queryChunks.map(textoComValores).join("");
  if (Array.isArray(no.value)) return no.value.join("");
  if (no.value !== undefined) return String(no.value);
  return "";
}

function limpar(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface Cenario {
  /**
   * Quando a vencedora passa a ser visível. `depois-do-conflito` é o que a corrida real faz: a
   * volta vizinha comitou no intervalo, e é esse commit que ao mesmo tempo torna a linha legível e
   * faz a nossa escrita bater no índice. Amarrar a visibilidade ao INSERT em particular seria o
   * dublê decidindo por qual porta o conflito tem de chegar, e a adoção é a outra porta.
   */
  vencedoraAparece: "nunca" | "depois-do-conflito";
  /** Qual índice o banco acusa no insert. Nulo = o insert passa. */
  indiceViolado: string | null;
  /** Uma linha SEM identidade e com o mesmo código: a candidata da adoção. */
  candidataDaAdocao: boolean;
  /** O `update` da adoção também bate no unique. */
  adocaoViola: boolean;
}

interface Banco {
  db: never;
  consultas: string[];
  buscasPeloNumero: string[];
  insertsDeVaga: string[];
  updatesQueDaoIdentidade: string[];
  insertsDeMatricula: string[];
}

function bancoDaCorrida(c: Cenario): Banco {
  const consultas: string[] = [];
  const buscasPeloNumero: string[] = [];
  const insertsDeVaga: string[] = [];
  const updatesQueDaoIdentidade: string[] = [];
  const insertsDeMatricula: string[] = [];
  let conflitoJaOcorreu = false;

  const linhaDaVencedora = {
    id: ID_DA_VENCEDORA,
    status: CODIGO.pendenteRevisao,
    codigo: CODIGO_DO_EVENTO,
    nome_divulgacao: "titulo-conferido-por-pessoa",
    cidade_id: 10,
    posicoes_oficiais: 9,
    status_antes: null,
    // A VENCEDORA É DA VARREDURA: foi a volta vizinha que a criou, então ela já tem matrícula.
    da_varredura: true,
    recusada_em: null,
    encerrou: false,
  };

  const db = {
    execute: (q: unknown) => {
      const texto = limpar(textoComValores(q));
      consultas.push(texto);

      const tocaVagas = /from\s+vagas\b/.test(texto) || /update\s+vagas\b/.test(texto);
      const buscaPeloNumero =
        tocaVagas && /^select/.test(texto) && /id_vacancy_pandape\s*=\s*\d/.test(texto);

      if (buscaPeloNumero) {
        buscasPeloNumero.push(texto);
        const jaApareceu = c.vencedoraAparece === "depois-do-conflito" && conflitoJaOcorreu;
        return Promise.resolve(jaApareceu ? [linhaDaVencedora] : []);
      }

      /*
       * ESCREVER A IDENTIDADE é o que define a adoção, e o dublê a reconhece pelo `set` e não pelo
       * resto da instrução. A primeira versão deste fake reconhecia pela presença de `codigo =`, e
       * com isso casava TAMBÉM o `update` rotineiro de título e cidade (que faz `set codigo = ...`):
       * a volta normal passava a receber a violação da adoção, e o vermelho falava do dublê.
       */
      const daIdentidade = /update\s+vagas\b/.test(texto) && /set[^]*?id_vacancy_pandape\s*=/.test(texto);

      if (daIdentidade) {
        if (c.adocaoViola) {
          conflitoJaOcorreu = true;
          return Promise.reject(violacaoDoUnique());
        }
        updatesQueDaoIdentidade.push(texto);
        return Promise.resolve([
          { ...linhaDaVencedora, id: ID_DA_CANDIDATA_DA_ADOCAO },
        ]);
      }

      // A PERGUNTA DA ADOÇÃO: a leitura da linha de mesmo código e sem identidade.
      const procuraCandidata =
        /^select/.test(texto) && !buscaPeloNumero && /id_vacancy_pandape\s+is\s+null/.test(texto);

      if (procuraCandidata) {
        if (!c.candidataDaAdocao) return Promise.resolve([]);
        return Promise.resolve([
          { ...linhaDaVencedora, id: ID_DA_CANDIDATA_DA_ADOCAO, da_varredura: false },
        ]);
      }

      if (/^update\s+vagas\b/.test(texto)) {
        return Promise.resolve([{ id: ID_DA_VENCEDORA }]);
      }

      if (/^insert\s+into\s+vagas\b/.test(texto)) {
        insertsDeVaga.push(texto);
        if (c.indiceViolado) {
          conflitoJaOcorreu = true;
          return Promise.reject(violacaoDoUnique(c.indiceViolado));
        }
        return Promise.resolve([{ id: "55555555-5555-4555-8555-555555555555" }]);
      }

      if (/insert\s+into\s+as_varredura_vagas\b/.test(texto)) {
        insertsDeMatricula.push(texto);
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    },
  };

  return {
    db: db as never,
    consultas,
    buscasPeloNumero,
    insertsDeVaga,
    updatesQueDaoIdentidade,
    insertsDeMatricula,
  };
}

function escritaDoEvento(): Escrita {
  return {
    tabela: "vagas",
    acao: "upsert",
    chaveDeConflito: ["id_vacancy_pandape"],
    comparaAntes: ["codigo", "nome_divulgacao", "cidade_id", "posicoes_oficiais"],
    valores: {
      id_vacancy_pandape: ID_VACANCY,
      codigo: CODIGO_DO_EVENTO,
      nome_divulgacao: "titulo-que-veio-do-ats",
      cidade_id: "Cidade Sintetica - SP",
      posicoes_oficiais: 2,
      cod_cliente: null,
      cargo_id: null,
      status: "PENDENTE_REVISAO",
    },
  };
}

interface Volta {
  banco: Banco;
  id: string | null;
  linhasAfetadas: number | null;
  erro: unknown;
}

async function rodarVolta(c: Partial<Cenario> = {}): Promise<Volta> {
  const cenario: Cenario = {
    vencedoraAparece: "depois-do-conflito",
    indiceViolado: NOME_DO_INDICE,
    candidataDaAdocao: false,
    adocaoViola: false,
    ...c,
  };
  const banco = bancoDaCorrida(cenario);
  const cat = catalogoDaRevisao();
  const repo = new IngestaoRepositorio(banco.db, cat.servico as never, null as never);
  try {
    const r = (await repo.escrever(escritaDoEvento())) as { id: string; linhasAfetadas: number };
    return { banco, id: r?.id ?? null, linhasAfetadas: r?.linhasAfetadas ?? null, erro: null };
  } catch (e) {
    return { banco, id: null, linhasAfetadas: null, erro: e };
  }
}

// ── 2. O RAMO DO REQUISITO: PERDEU A CORRIDA, RELÊ E SEGUE ─────────────────────────────────────

describe("a varredura perde a corrida do número e SEGUE COM A VAGA que existe", () => {
  it("não estoura: nenhuma exceção escapa da escrita", async () => {
    const v = await rodarVolta();
    expect(
      v.erro,
      "A violação do unique subiu crua da varredura. O job roda de 30 em 30 minutos sem ninguém " +
        `olhando: ${v.erro instanceof Error ? v.erro.message : String(v.erro)}`,
    ).toBeNull();
  });

  it("segue com a vaga VENCEDORA, e devolve o id DELA", async () => {
    const v = await rodarVolta();
    expect(
      v.id,
      "a varredura não devolveu o id da vaga que ganhou a corrida: as inscrições desta volta vão " +
        "para a vaga errada, ou para nenhuma",
    ).toBe(ID_DA_VENCEDORA);
  });

  it("RELÊ pelo número DEPOIS do insert recusado", async () => {
    const v = await rodarVolta();
    const posicaoDoInsert = v.banco.consultas.findIndex((c) => /^insert\s+into\s+vagas\b/.test(c));
    const releituras = v.banco.consultas
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => i > posicaoDoInsert && /id_vacancy_pandape\s*=\s*\d/.test(c));

    expect(posicaoDoInsert, "o insert nem foi tentado: o cenário não é o da corrida").toBeGreaterThanOrEqual(0);
    expect(
      releituras.length,
      "Depois do insert recusado, a varredura NÃO releu a vaga pelo número. Sem a releitura não há " +
        "com o que seguir, e o requisito manda seguir com a vaga que existe.",
    ).toBeGreaterThan(0);
  });

  it("NÃO cria vaga nova: o insert é tentado UMA vez e não é repetido", async () => {
    const v = await rodarVolta();
    expect(
      v.banco.insertsDeVaga.length,
      "a varredura insistiu no insert depois da recusa. Retentar o mesmo insert só repete o 23505, " +
        "e no caminho do laço o job vira uma volta que nunca termina",
    ).toBe(1);
  });

  it("a volta é contada como escrita, e não como `nada aconteceu`", async () => {
    const v = await rodarVolta();
    expect(
      v.linhasAfetadas,
      "a volta que perdeu a corrida precisa de um número coerente: zero diz ao ciclo que nada foi " +
        "feito numa volta em que a vaga foi resolvida",
    ).not.toBeNull();
  });
});

// ── 3. A VIOLAÇÃO NO CAMINHO ERRADO ────────────────────────────────────────────────────────────

describe("a frase de usuário NÃO aparece no caminho automático", () => {
  it("nenhum arquivo da varredura importa a frase amigável da colisão", () => {
    /**
     * Se a varredura passar a lançar a mensagem de usuário, o que acontece é o pior dos dois mundos:
     * o job falha de 30 em 30 minutos, ninguém é avisado (não há tela olhando este retorno) e o
     * texto que explicaria o problema fica num log que ninguém lê.
     */
    const dir = __dirname;
    const arquivos = readdirSync(dir)
      .filter((n) => n.endsWith(".ts") && !n.includes(".spec.") && !n.includes("fake"))
      .map((n) => join(dir, n))
      .filter((c) => statSync(c).isFile());

    /*
     * A FRASE é proibida na pasta INTEIRA: ela foi escrita para quem digita na trilha, e não há
     * nenhum caminho desta pasta em que ela seja a resposta certa.
     */
    const comAFrase = arquivos.filter((c) =>
      /MENSAGEM_NUMERO_PANDAPE_DUPLICADO/.test(readFileSync(c, "utf8")),
    );
    expect(
      comAFrase.map((c) => c.replace(/^.*apps\/backend\//, "apps/backend/")),
      "A frase destinada a quem digita o número na trilha foi importada pela ingestão. A varredura " +
        "não tem usuário: a colisão ali é uma corrida perdida, e o desfecho é reler e seguir.",
    ).toEqual([]);

    /*
     * A EXCEÇÃO HTTP é proibida no caminho AUTOMÁTICO, e só nele. A pasta também tem a tela de
     * revisão de divergências (`*divergencias*`), que é controller com usuário de verdade do outro
     * lado: ali exceção de usuário é a resposta certa, e barrá-la aqui seria medir outra coisa.
     */
    const automaticos = arquivos.filter((c) => !/divergencias/.test(c));
    const comExcecaoDeUsuario = automaticos.filter((c) =>
      /\b(ConflictException|BadRequestException|UnprocessableEntityException)\b/.test(
        readFileSync(c, "utf8"),
      ),
    );
    expect(
      comExcecaoDeUsuario.map((c) => c.replace(/^.*apps\/backend\//, "apps/backend/")),
      "Arquivo do caminho automático da varredura usando exceção de usuário. Status HTTP num job " +
        "que ninguém chamou não chega a tela nenhuma: ele só derruba a volta de 30 em 30 minutos.",
    ).toEqual([]);
  });

  it("o erro que a varredura eventualmente lançar não traz a frase de usuário", async () => {
    /**
     * Cenário do buraco: o insert é recusado e a releitura NÃO acha ninguém (a vencedora foi apagada
     * no intervalo, ou o índice violado era outro). Aqui é legítimo parar, mas NÃO com a frase que
     * foi escrita para quem digitou um número na tela.
     */
    const v = await rodarVolta({ vencedoraAparece: "nunca" });
    const mensagem = v.erro instanceof Error ? v.erro.message : String(v.erro ?? "");

    expect(
      mensagem,
      "a varredura falhou com a frase destinada a quem digita na trilha. Ninguém digitou nada aqui.",
    ).not.toMatch(/procure a vaga pelo n|cadastrar outra/i);
    expect(
      (v.erro as { getStatus?: () => number })?.getStatus?.(),
      "a varredura devolveu uma exceção HTTP. O caminho automático não responde a requisição " +
        "nenhuma: status HTTP aqui é sinal de que a exceção do usuário vazou para o job.",
    ).toBeUndefined();
  });

  it("releitura vazia não devolve id inventado nem segue em silêncio", async () => {
    const v = await rodarVolta({ vencedoraAparece: "nunca" });
    expect(
      v.erro !== null || v.id === null,
      "A varredura perdeu a corrida, a releitura não achou ninguém, e ela devolveu um id de " +
        `qualquer jeito (${String(v.id)}). As inscrições desta volta vão para uma vaga que não é a ` +
        "delas, que é pior do que a volta falhar.",
    ).toBe(true);
  });
});

/**
 * A CHAVE DO UNIQUE VIGENTE, LIDA DO DDL. Não é o nome do mecanismo que importa, é o CRITÉRIO: se a
 * chave normaliza, as buscas têm de normalizar; se a chave é crua, as buscas têm de comparar cru.
 * Fixar `btrim` aqui foi erro meu na primeira versão, e ele impediu o conserto de ser trocado pelo
 * caminho melhor (proibir o espaço na coluna, sem tocar busca nenhuma).
 */
function chaveDoUniqueVigente(): { nome: string; expressao: string; normaliza: boolean } {
  const dir = join(__dirname, "..", "..", "..", "drizzle");
  let achado: { nome: string; expressao: string } | null = null;
  for (const nomeArquivo of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    const bruto = readFileSync(join(dir, nomeArquivo), "utf8")
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    for (const pedaco of bruto.split(/;|-->\s*statement-breakpoint/)) {
      const instrucao = pedaco.replace(/\s+/g, " ").trim();
      const m =
        /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?\s+on\s+"?vagas"?\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/i.exec(
          instrucao,
        );
      if (!m) continue;
      if (!m[2].toLowerCase().includes("id_vacancy_pandape")) continue;
      achado = { nome: m[1], expressao: m[2].replace(/"/g, "").trim().toLowerCase() };
    }
  }
  expect(
    achado,
    "nenhuma migration cria índice UNIQUE sobre `vagas.id_vacancy_pandape`: não há critério de " +
      "chave a comparar com o das buscas",
  ).not.toBeNull();
  const { nome, expressao } = achado as { nome: string; expressao: string };
  return { nome, expressao, normaliza: /\b(btrim|trim|lower|upper)\s*\(/.test(expressao) };
}

describe("a chave do índice e o critério das buscas CONCORDAM", () => {
  /**
   * ┌─ O DEFEITO QUE ESTE BLOCO EXISTE PARA IMPEDIR, E ELE JÁ ACONTECEU ────────────────────────┐
   * │ A 0150 indexou `btrim(id_vacancy_pandape)` enquanto TODAS as buscas comparam a coluna CRUA. │
   * │ Com as duas pontas discordando, UMA linha gravada com espaço travava a vaga PARA SEMPRE, e  │
   * │ sem corrida nenhuma: a busca de entrada não achava (comparação crua), a adoção não achava (a │
   * │ linha já tinha identidade), a segunda chance não achava, o insert era RECUSADO (o índice     │
   * │ compara aparado e vê a colisão) e a releitura voltava vazia. NÃO HAVIA VENCEDORA A RELER: a  │
   * │ vaga falhava a cada 30 minutos, para sempre, e as inscrições dela nunca entravam.            │
   * │                                                                                             │
   * │ A 0151 FECHOU, pelo outro lado: chave de volta na coluna CRUA e espaço PROIBIDO por CHECK,   │
   * │ então a coluna crua JÁ É a forma normalizada e nenhuma busca precisou ser tocada (§A.26).    │
   * │ O estado que causava o laço ficou proibido no nascimento, e por isso o laço não existe mais. │
   * │                                                                                             │
   * │ O QUE FICA TRANCADO AQUI É A CONCORDÂNCIA, derivada do DDL e não fixada em nenhum dos dois   │
   * │ desenhos: hoje verde com os dois crus, e vermelho de novo no dia em que alguém normalizar a  │
   * │ chave sem normalizar as buscas, que é exatamente como o defeito nasceu, de boa-fé.           │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a releitura compara pelo MESMO critério da chave do unique vigente", async () => {
    const chave = chaveDoUniqueVigente();
    const v = await rodarVolta();
    const posicaoDoInsert = v.banco.consultas.findIndex((c) => /^insert\s+into\s+vagas\b/.test(c));
    const releitura =
      v.banco.consultas.slice(posicaoDoInsert + 1).find((c) => /from\s+vagas\b/.test(c)) ?? "";

    expect(releitura, "não houve releitura depois do insert recusado").not.toBe("");
    const buscaNormaliza = /\b(btrim|trim|lower|upper)\s*\(\s*id_vacancy_pandape/.test(releitura);
    expect(
      buscaNormaliza,
      `A chave do unique \`${chave.nome}\` é \`${chave.expressao}\` (normaliza: ${chave.normaliza}) e ` +
        `a releitura ${buscaNormaliza ? "normaliza" : "compara cru"}. As duas pontas têm de usar o ` +
        "MESMO critério: discordando, o insert é recusado pelo índice e a releitura volta vazia, " +
        "então não há vencedora a reler e a vaga falha em TODA volta, de 30 em 30 minutos, sem " +
        "nunca se resolver. Normalizar as duas ou nenhuma das duas, nunca uma só.",
    ).toBe(chave.normaliza);
  });

  it("a busca de ENTRADA usa o mesmo critério da releitura", async () => {
    /**
     * Não basta a releitura concordar com o índice: é a busca de ENTRADA que decide se a volta
     * seguinte reconhece a vaga e nem chega ao insert. Divergindo dela, a vaga é reconhecida uma vez
     * e esquecida na próxima, que é a outra metade do mesmo laço.
     */
    const v = await rodarVolta();
    const normalizam = v.banco.buscasPeloNumero.map((c) =>
      /\b(btrim|trim|lower|upper)\s*\(\s*id_vacancy_pandape/.test(c),
    );
    expect(
      new Set(normalizam).size,
      "as buscas da varredura pelo número NÃO usam todas o mesmo critério: " +
        `${normalizam.filter(Boolean).length} normalizam e ${normalizam.filter((n) => !n).length} ` +
        "comparam cru. Entre duas voltas, a mesma vaga passa a ser achada e perdida.",
    ).toBeLessThanOrEqual(1);
  });

  it("a releitura vazia termina em falha declarada, e não em vaga errada", async () => {
    /**
     * A PROPRIEDADE SOBREVIVE À MUDANÇA DE DESENHO. Mesmo com o laço fechado pela 0151, a releitura
     * pode voltar vazia (a vencedora apagada no intervalo, por exemplo). Nesse caso o desfecho não
     * pode ser um id inventado: inscrições na vaga de outra pessoa é pior do que a volta falhar.
     */
    const v = await rodarVolta({ vencedoraAparece: "nunca" });

    expect(
      v.id,
      "a varredura seguiu com alguma vaga mesmo sem achar a colidente. Vaga errada é pior do que a " +
        "volta falhar: as inscrições vão para a vaga de outra pessoa e ninguém fica sabendo.",
    ).toBeNull();
    expect(
      v.erro,
      "a volta terminou em silêncio: nem seguiu, nem falhou. Esta vaga vai ser pulada em toda volta " +
        "e nada no sistema vai dizer isso.",
    ).not.toBeNull();
    /*
     * A RETENTATIVA É LIMITADA, e isso é desenho legítimo: a passada é repetida UMA vez, porque na
     * corrida de verdade a segunda busca acha a vencedora e o insert nem é alcançado. O que este
     * cenário mostra é que, quando a colidente é invisível para a busca, a segunda passada é
     * trabalho jogado fora que termina no MESMO 23505. Limitada é o que importa: laço sem teto numa
     * varredura de 137 mil inscrições não termina a volta.
     */
    expect(
      v.banco.insertsDeVaga.length,
      "a varredura insistiu no insert mais de uma vez por passada extra: sem teto, a volta não termina",
    ).toBeLessThanOrEqual(2);
  });

});

describe("a recuperação é SÓ da nossa colisão", () => {
  it("23505 de OUTRO índice sobe intacto, e não vira `vaga reusada`", async () => {
    /**
     * Engolir qualquer 23505 faria a violação de um unique diferente (um que apareça amanhã nesta
     * mesma tabela) ser tratada como corrida de número perdida: a varredura releria, não acharia
     * nada coerente, e no melhor caso seguiria sobre a vaga errada em silêncio.
     */
    const v = await rodarVolta({ indiceViolado: "uq_outro_qualquer" });
    expect(
      v.erro,
      "a varredura tratou a violação de OUTRO unique como se fosse a colisão do número. Falha de " +
        "banco virando `vaga reusada` é defeito que não deixa rastro nenhum.",
    ).not.toBeNull();
  });

  it("sem violação nenhuma, o caminho normal segue criando a vaga", async () => {
    const v = await rodarVolta({ indiceViolado: null });
    expect(v.erro, "o caminho feliz quebrou").toBeNull();
    expect(v.banco.insertsDeVaga.length, "a vaga nova deixou de ser criada").toBe(1);
    expect(
      v.banco.insertsDeMatricula.length,
      "a matrícula (`as_varredura_vagas`) não nasceu junto com a vaga",
    ).toBeGreaterThan(0);
  });
});

// ── 4. O OUTRO ESCRITOR DO NÚMERO NA MESMA VARREDURA: A ADOÇÃO ─────────────────────────────────

describe("GAP: a ADOÇÃO grava o mesmo número, e também viola o mesmo índice", () => {
  it("o `update` da adoção recusado pelo unique não derruba a volta", async () => {
    /**
     * O requisito fala do INSERT. Mas a adoção (`update vagas set id_vacancy_pandape = N where
     * id_vacancy_pandape is null`) escreve a MESMA coluna, e o unique a alcança do mesmo jeito: a
     * volta vizinha pode ter adotado a outra metade da gêmea no intervalo entre a leitura e a
     * escrita. O desfecho certo é o mesmo do insert, reler e seguir.
     */
    const v = await rodarVolta({ candidataDaAdocao: true, adocaoViola: true });
    expect(
      v.erro,
      "A adoção foi recusada pelo unique e a exceção subiu crua. É o MESMO caso do insert, pela " +
        `outra porta: ${v.erro instanceof Error ? v.erro.message : String(v.erro)}`,
    ).toBeNull();
  });

  it("adoção recusada termina na vaga que ganhou, não numa gêmea nova", async () => {
    const v = await rodarVolta({ candidataDaAdocao: true, adocaoViola: true });
    expect(
      v.banco.insertsDeVaga.length,
      "a adoção falhou e a varredura caiu no insert: a gêmea nasceu pela porta de trás",
    ).toBe(0);
  });
});
