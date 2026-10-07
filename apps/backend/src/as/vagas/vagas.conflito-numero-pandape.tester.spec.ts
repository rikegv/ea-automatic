import "reflect-metadata";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import { ConflictException } from "@nestjs/common";
import { VagasService } from "./vagas.service";
import { arquivosDeProducao, erroDe, instanciar, serializar } from "./vaga-status.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE (tester, §A.38): A COLISÃO DO NÚMERO DO PANDAPÉ NA EDIÇÃO MANUAL ──────
 *
 * ESCRITO A PARTIR DO REQUISITO, NÃO DO CÓDIGO (§A.38/§A.40 regra 2), em paralelo à construção.
 * Nada aqui importa o módulo que o autor escolheu: o reconhecedor e a frase são PROCURADOS pelo que
 * o requisito exige deles, e a busca falha com a especificação escrita na mensagem.
 *
 * O REQUISITO, na íntegra (o ramo da edição manual):
 *  - uma pessoa DIGITA o número na trilha da vaga;
 *  - número que já pertence a outra vaga responde erro de validação com mensagem CLARA;
 *  - status de CONFLITO ou de VALIDAÇÃO, nunca 500;
 *  - erro cru do Postgres NUNCA vaza para a tela.
 *
 * O QUE O REQUISITO NÃO DIZ, E ESTE ARQUIVO MEDE DO MESMO JEITO:
 *  - COMO a violação é reconhecida. Reconhecer por TEXTO da mensagem do Postgres quebra calado numa
 *    troca de versão do banco, de locale ou de driver, e o usuário volta a ver 500 sem ninguém
 *    perceber, porque caminho de erro não tem quem olhe. O reconhecimento tem de ser pelo SQLSTATE
 *    `23505` e pelo NOME DO ÍNDICE.
 *  - se a frase vaza dado (§A.6) e se ela tem travessão (§A.11).
 *  - a vaga que recebe o número que JÁ É DELA: não é conflito, é no-op.
 *  - número com espaço, em branco e zero.
 *
 * §A.6: números de vaga sintéticos. Nenhum CPF, nenhum nome de pessoa entra neste arquivo.
 */

const NUMERO = "9901501";
const OUTRO_NUMERO = "9901502";
const ID_DA_VAGA = "11111111-1111-4111-8111-111111111111";
const ID_DA_OUTRA = "22222222-2222-4222-8222-222222222222";

// ── 1. ACHAR O RECONHECEDOR, SEM FIXAR O NOME DELE ─────────────────────────────────────────────

/** O erro que o driver do Postgres entrega quando o unique parcial recusa a segunda vaga. */
function erroDoDriver(p: {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  message?: string;
  detail?: string;
}): unknown {
  return Object.assign(new Error(p.message ?? ""), p);
}

const NOME_DO_INDICE = "uq_vagas_id_vacancy_pandape";
const DIR_MIGRATIONS = join(__dirname, "..", "..", "..", "drizzle");

/** Todo `.sql` de migration, em ordem, sem comentário de linha. */
function sqlDasMigrations(): string[] {
  return readdirSync(DIR_MIGRATIONS)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) =>
      readFileSync(join(DIR_MIGRATIONS, n), "utf8")
        .split("\n")
        .map((l) => l.replace(/--.*$/, ""))
        .join("\n")
        .replace(/\s+/g, " "),
    );
}

/** A chave do unique VIGENTE sobre a coluna: a ÚLTIMA criação daquele nome é a que vale. */
function chaveDoUniqueVigente(): string {
  let chave = "";
  for (const sqlTexto of sqlDasMigrations()) {
    const padrao =
      /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?"?[a-z0-9_]+"?\s+on\s+"?vagas"?\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gi;
    for (const m of sqlTexto.matchAll(padrao)) {
      if (m[1].toLowerCase().includes("id_vacancy_pandape")) chave = m[1].trim().toLowerCase();
    }
  }
  expect(chave, "nenhuma migration cria índice UNIQUE sobre `vagas.id_vacancy_pandape`").not.toBe("");
  return chave;
}

/** Há CHECK vivo proibindo espaço nas bordas da coluna? `DROP CONSTRAINT` honrado. */
function temCheckDeEspaco(): boolean {
  let vivo = false;
  for (const sqlTexto of sqlDasMigrations()) {
    for (const pedaco of sqlTexto.split(";")) {
      const i = pedaco.trim();
      if (!/alter\s+table\s+"?vagas"?/i.test(i)) continue;
      if (/drop\s+constraint\s+(?:if\s+exists\s+)?"?ck_vagas_id_vacancy_pandape[a-z0-9_]*"?/i.test(i)) {
        vivo = false;
      }
      if (
        /add\s+constraint\s+"?[a-z0-9_]+"?\s+check\s*\(/i.test(i) &&
        /id_vacancy_pandape/i.test(i) &&
        /btrim|trim/i.test(i)
      ) {
        vivo = true;
      }
    }
  }
  return vivo;
}

interface Reconhecedor {
  caminho: string;
  nome: string;
  fn: (err: unknown) => unknown;
}

/**
 * Procura, nos módulos de produção que mencionam o nome do índice, a função exportada que diz SIM
 * para o erro canônico da colisão. É o contrato do requisito ("reconhecer a violação"), e não o
 * nome que alguém deu a ela.
 */
async function reconhecedores(): Promise<Reconhecedor[]> {
  const candidatos = arquivosDeProducao().filter((c) => {
    const fonte = readFileSync(c, "utf8");
    return fonte.includes(NOME_DO_INDICE) && !c.endsWith("tables.ts");
  });
  const saida: Reconhecedor[] = [];
  const falhas: string[] = [];
  for (const caminho of candidatos) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
    } catch (e) {
      falhas.push(`${caminho}: ${(e as Error).message}`);
      continue;
    }
    for (const [nome, valor] of Object.entries(mod)) {
      if (typeof valor !== "function") continue;
      const fn = valor as (err: unknown) => unknown;
      if (fn.length !== 1) continue;
      let diz: unknown;
      try {
        diz = fn(erroDoDriver({ code: "23505", constraint_name: NOME_DO_INDICE }));
      } catch {
        continue;
      }
      if (diz === true) saida.push({ caminho, nome, fn });
    }
  }
  expect(
    saida.length,
    "Nenhuma função de produção reconhece a violação do unique do número do Pandapé. " +
      `Arquivos que mencionam \`${NOME_DO_INDICE}\`: ${candidatos.join(", ") || "nenhum"}. ` +
      `Módulos que não importaram: ${falhas.join(" | ") || "nenhum"}. ` +
      "O requisito exige que a violação chegue ao usuário como frase, e para isso alguém tem de " +
      "reconhecê-la pelo SQLSTATE 23505 e pelo nome do índice.",
  ).toBeGreaterThan(0);
  return saida;
}

/**
 * O RECONHECEDOR DA NOSSA COLISÃO, e não o de qualquer unique.
 *
 * O módulo expõe, de propósito, peças de granularidade diferente (uma que só lê o SQLSTATE, outra
 * que só lê o nome da restrição, outra que exige as duas). O requisito é satisfeito pela que exige
 * AS DUAS: a que só lê o 23505 responderia pela colisão de qualquer unique da tabela, e responder
 * "número do Pandapé repetido" a uma colisão de candidatura mentiria sobre o campo que colidiu.
 * Então a escolha é pela ESPECIFICIDADE, não pela ordem do `Object.entries`.
 */
async function oReconhecedor(): Promise<Reconhecedor> {
  const todos = await reconhecedores();
  const outroUnique = erroDoDriver({ code: "23505", constraint_name: "uq_as_candidaturas_viva" });
  const estritos = todos.filter((r) => r.fn(outroUnique) === false);
  expect(
    estritos.map((r) => r.nome),
    "Nenhuma função reconhece ESTA colisão e recusa as outras. As candidatas achadas " +
      `(${todos.map((r) => r.nome).join(", ")}) dizem SIM para a violação de qualquer unique: com ` +
      "elas, uma colisão de candidatura chegaria ao usuário como frase sobre número do Pandapé.",
  ).not.toEqual([]);
  return estritos[0];
}

// ── 2. A DETECÇÃO: POR CÓDIGO E NOME, NUNCA POR TEXTO ──────────────────────────────────────────

describe("a detecção da violação é por SQLSTATE e nome de índice", () => {
  it("reconhece o erro do driver `postgres` (propriedade `constraint_name`)", async () => {
    const r = await oReconhecedor();
    expect(r.fn(erroDoDriver({ code: "23505", constraint_name: NOME_DO_INDICE }))).toBe(true);
  });

  it("reconhece o erro do driver `pg` (propriedade `constraint`)", async () => {
    /**
     * `postgres-js` expõe `constraint_name`; `node-postgres` expõe `constraint`. Ler só um deixa a
     * troca de driver virar regressão no caminho de erro, que é onde ninguém olha.
     */
    const r = await oReconhecedor();
    expect(
      r.fn(erroDoDriver({ code: "23505", constraint: NOME_DO_INDICE })),
      `\`${r.nome}\` (${r.caminho}) lê só uma das duas propriedades de nome de restrição. Uma troca ` +
        "de driver devolve 500 ao usuário sem nenhum teste ficar vermelho.",
    ).toBe(true);
  });

  it("reconhece MESMO SEM mensagem nenhuma (driver que não popula `message`)", async () => {
    const r = await oReconhecedor();
    expect(
      r.fn(erroDoDriver({ code: "23505", constraint_name: NOME_DO_INDICE, message: "" })),
      `\`${r.nome}\` depende do texto da mensagem para reconhecer a violação. Mensagem vazia é ` +
        "estado real de driver, e aí o usuário recebe 500.",
    ).toBe(true);
  });

  it("reconhece com a mensagem do Postgres em OUTRO IDIOMA", async () => {
    /**
     * A mensagem do Postgres é traduzida pelo `lc_messages` do servidor. Um `includes("duplicate
     * key")` funciona no laptop em inglês e quebra calado no servidor em outro locale.
     */
    const r = await oReconhecedor();
    expect(
      r.fn(
        erroDoDriver({
          code: "23505",
          constraint_name: NOME_DO_INDICE,
          message: 'llave duplicada viola restriccion de unicidad "uq_vagas_id_vacancy_pandape"',
        }),
      ),
      `\`${r.nome}\` casa a mensagem em inglês. Em servidor com outro locale isso vira 500.`,
    ).toBe(true);
  });

  it("NÃO reconhece quando SÓ a mensagem fala de chave duplicada (sem o 23505)", async () => {
    /**
     * ESTE É O TESTE QUE EXPÕE A DETECÇÃO POR TEXTO. Um reconhecedor que leia a mensagem diria SIM
     * aqui, e com isso passaria a chamar de "número do Pandapé repetido" qualquer erro cuja frase
     * mencione chave duplicada, inclusive um erro de outra tabela repassado por outra camada.
     */
    const r = await oReconhecedor();
    expect(
      r.fn(
        erroDoDriver({
          message: `duplicate key value violates unique constraint "${NOME_DO_INDICE}"`,
        }),
      ),
      `\`${r.nome}\` reconheceu a violação SÓ pelo texto da mensagem, sem o SQLSTATE. É a detecção ` +
        "frágil que o requisito proíbe.",
    ).toBe(false);
  });

  it("NÃO reconhece a violação de OUTRO unique da mesma tabela", async () => {
    const r = await oReconhecedor();
    expect(
      r.fn(erroDoDriver({ code: "23505", constraint_name: "uq_as_candidaturas_viva" })),
      `\`${r.nome}\` responde pela colisão de QUALQUER unique. Isso mente sobre qual campo colidiu: ` +
        "o usuário recebe uma frase sobre número do Pandapé para um erro que não é dele.",
    ).toBe(false);
  });

  it("NÃO reconhece outro SQLSTATE, mesmo citando o índice", async () => {
    const r = await oReconhecedor();
    for (const code of ["23503", "23502", "22001", "42P01"]) {
      expect(
        r.fn(erroDoDriver({ code, constraint_name: NOME_DO_INDICE })),
        `\`${r.nome}\` tratou o SQLSTATE ${code} como colisão de número. Só 23505 é violação de unique.`,
      ).toBe(false);
    }
  });

  it("não explode com `null`, `undefined` nem com erro sem propriedade nenhuma", async () => {
    const r = await oReconhecedor();
    for (const entrada of [null, undefined, new Error("qualquer coisa"), {}, "texto"]) {
      expect(() => r.fn(entrada)).not.toThrow();
      expect(r.fn(entrada)).toBe(false);
    }
  });
});

describe("nenhum arquivo de produção reconhece ESTA violação por texto de mensagem", () => {
  it("não há `message` sendo farejada perto do tratamento do índice", () => {
    /**
     * Varredura de FONTE, com os comentários retirados antes do casamento: comentário já produziu
     * três falsos vermelhos neste projeto, e a prosa deste conserto fala de propósito sobre o
     * `includes("duplicate key")` que ele evita.
     */
    const suspeitos: string[] = [];
    for (const caminho of arquivosDeProducao()) {
      const bruto = readFileSync(caminho, "utf8");
      if (!bruto.includes(NOME_DO_INDICE) && !/23505/.test(bruto)) continue;
      const semComentario = bruto
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, ""))
        .join("\n");
      const fareja =
        /\.message\b[\s\S]{0,80}?(includes|indexOf|match|test)\s*\(/.test(semComentario) ||
        /(duplicate key|unique constraint|already exists|llave duplicada)/i.test(semComentario);
      if (fareja) suspeitos.push(caminho);
    }
    expect(
      suspeitos,
      "Arquivo de produção que trata violação de unique lendo o TEXTO da mensagem do Postgres. " +
        "A mensagem é traduzida pelo locale e muda de formato entre releases: o reconhecimento tem " +
        "de ser por SQLSTATE e nome de índice.",
    ).toEqual([]);
  });
});

// ── 3. A FRASE QUE CHEGA AO USUÁRIO ────────────────────────────────────────────────────────────

/** §A.11: o glifo proibido, montado pelo ponto de código para não aparecer literalmente no fonte. */
const TRAVESSAO = String.fromCharCode(0x2014);
const MEIO_TRAVESSAO = String.fromCharCode(0x2013);

/** A frase do conflito, achada no mesmo módulo do reconhecedor, sem fixar o nome da constante. */
async function frases(): Promise<{ nome: string; texto: string }[]> {
  const r = await oReconhecedor();
  const mod = (await import(/* @vite-ignore */ r.caminho)) as Record<string, unknown>;
  return Object.entries(mod)
    .filter(([, v]) => typeof v === "string" && (v as string).length > 20)
    .map(([nome, v]) => ({ nome, texto: v as string }))
    .filter((f) => /vaga/i.test(f.texto));
}

describe("a frase da colisão é clara e não vaza nada", () => {
  it("existe uma frase sobre a vaga, e ela é fixa (sem interpolação)", async () => {
    const lista = await frases();
    expect(
      lista.length,
      "O módulo que reconhece a violação não expõe a frase que vai ao usuário. Frase embutida no " +
        "`throw` não é testável, e é assim que travessão e vazamento de valor passam.",
    ).toBeGreaterThan(0);
    for (const f of lista) {
      expect(f.texto, `a frase \`${f.nome}\` tem um buraco de interpolação`).not.toContain("${");
      expect(f.texto, `a frase \`${f.nome}\` tem placeholder`).not.toMatch(/\{\d\}|%s/);
    }
  });

  it("§A.11: nenhum travessão na frase", async () => {
    for (const f of await frases()) {
      expect(f.texto, `§A.11: a frase \`${f.nome}\` tem travessão (em dash)`).not.toContain(
        TRAVESSAO,
      );
      expect(
        f.texto,
        `a frase \`${f.nome}\` tem meio travessão (en dash), que é o mesmo glifo pelo outro nome`,
      ).not.toContain(MEIO_TRAVESSAO);
    }
  });

  it("§A.6: a frase não traz CPF, nome de pessoa nem id interno", async () => {
    for (const f of await frases()) {
      expect(f.texto, `§A.6: a frase \`${f.nome}\` fala de CPF`).not.toMatch(/\bcpf\b/i);
      expect(f.texto, `§A.6: a frase \`${f.nome}\` tem padrão de CPF`).not.toMatch(
        /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
      );
      expect(f.texto, `§A.6: a frase \`${f.nome}\` tem uuid`).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      expect(
        f.texto,
        `§A.6: a frase \`${f.nome}\` fala de candidato. A colisão é entre VAGAS: citar candidato ` +
          "aqui expõe quem está dentro da outra vaga a quem só digitou um número.",
      ).not.toMatch(/candidat[oa]/i);
      expect(
        f.texto,
        `a frase \`${f.nome}\` traz uma sequência longa de dígitos. O \`detail\` do 23505 carrega o ` +
          "valor que violou o índice, e repassá-lo publica dado de origem na resposta de erro.",
      ).not.toMatch(/\d{4,}/);
    }
  });

  it("a frase diz o que fazer, e não só que deu errado", async () => {
    const lista = await frases();
    const util = lista.some((f) => /procur|busq|confir|localiz|central/i.test(f.texto));
    expect(
      util,
      "A frase avisa do conflito e não diz o que fazer. Quem está cadastrando não sabe que a vaga " +
        "já existe em outra linha, e cadastra de novo com outro número. Mensagem clara, no " +
        "requisito, é mensagem acionável.",
    ).toBe(true);
  });
});

// ── 4. O CAMINHO MANUAL, EXERCITADO ────────────────────────────────────────────────────────────

interface LinhaDeVaga {
  id: string;
  idVacancyPandape: string | null;
}

interface BancoDaTrava {
  db: unknown;
  clausulas: string[];
}

function limpar(t: string): string {
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * O DUBLÊ, E ELE É UM POSTGRES POBRE DE PROPÓSITO. Ele aplica SÓ os predicados que a instrução
 * escreveu: a igualdade pelo número e a exclusão da própria linha. Predicado que o código não
 * escreveu, o banco não aplica, e a linha errada chega até a decisão, que é o que acontece em
 * produção. Um fake que filtrasse por conta própria deixaria verde justamente o esquecimento.
 */
function bancoDaTrava(linhas: LinhaDeVaga[]): BancoDaTrava {
  const clausulas: string[] = [];
  const construtor = () => {
    let tabela = "";
    let clausula = "";
    const b: Record<string, unknown> = {};
    const resolver = () => {
      clausulas.push(`${tabela}:${clausula}`);
      if (tabela !== "vagas") return [];
      const alvo = /id_vacancy_pandape\s*=\s*'?([^'\s)]*)'?/.exec(clausula);
      const excluido = /id\s*(?:<>|!=)\s*'?([0-9a-f-]+)'?/.exec(clausula);
      const procurado = alvo ? alvo[1] : null;
      return linhas
        .filter((l) => (procurado === null ? true : l.idVacancyPandape === procurado))
        .filter((l) => (excluido ? l.id !== excluido[1] : true))
        .map((l) => ({ id: l.id }));
    };
    b.from = (t: unknown) => {
      tabela = getTableName(t as never);
      return b;
    };
    b.where = (c: unknown) => {
      clausula += ` ${limpar(serializar(c))}`;
      return b;
    };
    b.limit = () => resolver();
    b.orderBy = () => b;
    b.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(ok, erro);
    return b;
  };
  return { db: { select: () => construtor() }, clausulas };
}

/**
 * CHAMADA ADAPTATIVA À TRAVA DO NÚMERO. O requisito nomeia a propriedade, não o método: a busca é
 * pelo método do serviço que recusa o número já usado, e a falha diz o que foi procurado.
 */
function travaDoNumero(service: VagasService): (...a: unknown[]) => Promise<unknown> {
  const dono = service as unknown as Record<string, unknown>;
  const candidatos = Object.getOwnPropertyNames(Object.getPrototypeOf(dono)).filter((n) => {
    const baixo = n.toLowerCase();
    return (
      typeof dono[n] === "function" &&
      /pandape|vacancy/.test(baixo) &&
      /trava|unico|unic|duplic|conflito/.test(baixo)
    );
  });
  expect(
    candidatos,
    "`VagasService` não tem método que recuse o número do Pandapé já usado. Sem pré-checagem, o " +
      "que chega ao usuário é o 23505 cru do banco, que é o que o requisito proíbe.",
  ).not.toEqual([]);
  return (dono[candidatos[0]] as (...a: unknown[]) => Promise<unknown>).bind(service);
}

function servicoCom(linhas: LinhaDeVaga[]): { service: VagasService; banco: BancoDaTrava } {
  const banco = bancoDaTrava(linhas);
  return {
    service: instanciar(VagasService, banco.db) as unknown as VagasService,
    banco,
  };
}

describe("edição manual: número que já pertence a outra vaga", () => {
  it("RECUSA com conflito, e não com 500", async () => {
    const { service } = servicoCom([{ id: ID_DA_OUTRA, idVacancyPandape: NUMERO }]);
    const err = await erroDe(() => travaDoNumero(service)(NUMERO, null) as Promise<unknown>);

    expect(err, "o número repetido passou sem recusa nenhuma").toBeTruthy();
    const status = (err as { getStatus?: () => number })?.getStatus?.();
    expect(
      status,
      `a recusa voltou com status ${String(status)}. O requisito pede conflito (409) ou validação ` +
        "(400), nunca 500.",
    ).toBeDefined();
    expect([400, 409, 422]).toContain(status);
  });

  it("a frase da recusa é a frase do usuário, e não a do Postgres", async () => {
    const { service } = servicoCom([{ id: ID_DA_OUTRA, idVacancyPandape: NUMERO }]);
    const err = await erroDe(() => travaDoNumero(service)(NUMERO, null) as Promise<unknown>);
    const corpo = JSON.stringify((err as ConflictException)?.getResponse?.() ?? err);

    expect(corpo).not.toMatch(/duplicate key|unique constraint|23505|llave duplicada/i);
    expect(
      corpo,
      "a recusa repassou o NÚMERO que colidiu. O `detail` do 23505 traz o valor violado, e §A.6 " +
        "proíbe publicá-lo na resposta de erro.",
    ).not.toContain(NUMERO);
    expect(corpo, "§A.11: travessão na recusa").not.toContain(TRAVESSAO);
    expect(
      corpo,
      "a recusa expôs o id interno da OUTRA vaga. Quem digitou o número não tem de receber o " +
        "identificador de uma linha que ele talvez não possa nem abrir.",
    ).not.toContain(ID_DA_OUTRA);
  });
});

describe("edição manual: os casos que NÃO são conflito", () => {
  it("número AUSENTE não colide, mesmo com várias vagas sem número", async () => {
    const { service } = servicoCom([
      { id: ID_DA_VAGA, idVacancyPandape: null },
      { id: ID_DA_OUTRA, idVacancyPandape: null },
    ]);
    for (const vazio of [null, "", "   "]) {
      const err = await erroDe(() => travaDoNumero(service)(vazio, null) as Promise<unknown>);
      expect(
        err,
        `vaga sem número foi recusada (entrada ${JSON.stringify(vazio)}). Número nulo é legítimo e ` +
          "é o estado da maioria das vagas manuais: barrá-lo impede toda vaga manual a partir da segunda.",
      ).toBeFalsy();
    }
  });

  it("número que NÃO existe em nenhuma outra vaga passa", async () => {
    const { service } = servicoCom([{ id: ID_DA_OUTRA, idVacancyPandape: OUTRO_NUMERO }]);
    const err = await erroDe(() => travaDoNumero(service)(NUMERO, null) as Promise<unknown>);
    expect(err, "número livre foi recusado: a trava está consultando sem filtrar pelo número").toBeFalsy();
  });

  it("a vaga que recebe O MESMO número que JÁ É DELA é no-op, não conflito", async () => {
    /**
     * Salvar de novo a mesma vaga, sem mexer no número, é o gesto mais comum da trilha. Sem a
     * exclusão da própria linha, a segunda gravação acusa o número dela como duplicado dela mesma,
     * e a pessoa não tem como salvar nada mais naquela vaga.
     */
    const { service, banco } = servicoCom([{ id: ID_DA_VAGA, idVacancyPandape: NUMERO }]);
    const err = await erroDe(
      () => travaDoNumero(service)(NUMERO, ID_DA_VAGA) as Promise<unknown>,
    );

    expect(
      err,
      "a vaga colidiu consigo mesma. O requisito não cobre este caso e ele é o mais frequente: " +
        "a própria linha tem de ficar fora da busca.",
    ).toBeFalsy();
    expect(
      banco.clausulas.join(" "),
      "a consulta da trava não excluiu a própria vaga (`id <> ...`). Sem isso, nenhuma vaga com " +
        "número consegue ser salva uma segunda vez.",
    ).toContain(ID_DA_VAGA.toLowerCase());
  });
});

describe("o número é TEXTO, e espaço é invisível para quem digita", () => {
  it("número digitado com espaço nas bordas COLIDE com o mesmo número sem espaço", async () => {
    /**
     * `" 9901501"` é o MESMO número para a pessoa que digitou. A trava tem de recusar, e recusar
     * ANTES de gravar: o banco proíbe espaço na coluna, então deixar passar não produziria uma
     * gêmea, produziria um erro de formato cru na cara de quem só encostou na barra de espaço.
     */
    const { service } = servicoCom([{ id: ID_DA_OUTRA, idVacancyPandape: NUMERO }]);
    for (const digitado of [` ${NUMERO}`, `${NUMERO} `, ` ${NUMERO} `]) {
      const err = await erroDe(() => travaDoNumero(service)(digitado, null) as Promise<unknown>);
      expect(
        err,
        `${JSON.stringify(digitado)} passou pela trava enquanto ${NUMERO} já existe. A trava tem ` +
          "de comparar o número aparado, e a gravação tem de gravar o aparado: é o que mantém a " +
          "pré-checagem e o índice de acordo.",
      ).toBeTruthy();
    }
  });

  it("PENDENTE DE DECISÃO DO DIRETOR: zero à esquerda é um número diferente", async () => {
    const { service } = servicoCom([{ id: ID_DA_OUTRA, idVacancyPandape: "9901501" }]);
    const err = await erroDe(() => travaDoNumero(service)("09901501", null) as Promise<unknown>);
    expect(
      err,
      "REGISTRO, NÃO COBRANÇA: `09901501` e `9901501` convivem. O ATS devolve inteiro, então a " +
        "varredura nunca gera zero à esquerda; quem gera é a digitação. Está com o diretor, e a " +
        "fábrica não normaliza por conta própria. O teste fixa o estado de hoje para que uma " +
        "mudança apareça como decisão e não como acidente.",
    ).toBeFalsy();
  });
});

describe("a pré-checagem e o ÍNDICE comparam pelo MESMO critério", () => {
  /**
   * ┌─ O QUE ESTE BLOCO TRANCA, E POR QUE ELE NÃO PODE FIXAR O MECANISMO ─────────────────────────┐
   * │ A pré-checagem é a primeira camada; a segunda é o índice. Elas só se completam se compararem │
   * │ a MESMA coisa. Enquanto a chave do índice foi `btrim(id_vacancy_pandape)` e a pré-checagem    │
   * │ comparava a coluna crua, uma linha gravada com espaço era invisível para a primeira e         │
   * │ colidente para a segunda, e isso travava a vaga da varredura para sempre.                     │
   * │                                                                                              │
   * │ HOJE A CHAVE É A COLUNA CRUA E O ESPAÇO É PROIBIDO NA COLUNA, então a coluna crua já É a      │
   * │ forma normalizada e a comparação crua está certa. O critério é LIDO DO DDL justamente para    │
   * │ este teste não exigir nenhum dos dois desenhos: ele exige a concordância.                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("linha gravada com espaço é invisível para a pré-checagem SÓ se o banco a proibir", async () => {
    const chaveNormaliza = /\b(btrim|trim|lower|upper)\s*\(/.test(chaveDoUniqueVigente());
    const colunaProibeEspaco = temCheckDeEspaco();

    const { service } = servicoCom([{ id: ID_DA_OUTRA, idVacancyPandape: ` ${NUMERO}` }]);
    const achou = !!(await erroDe(() => travaDoNumero(service)(NUMERO, null) as Promise<unknown>));

    if (colunaProibeEspaco) {
      expect(
        achou,
        "A pré-checagem não acha a linha gravada com espaço, e isso é CORRETO porque o banco não " +
          "deixa essa linha existir (há CHECK proibindo espaço na coluna). Este ramo registra o " +
          "estado; ele não cobra normalização de quem não precisa dela.",
      ).toBe(false);
      return;
    }

    expect(
      achou,
      "A coluna ACEITA espaço (não há CHECK proibindo) e a pré-checagem compara sem normalizar: " +
        `a linha " ${NUMERO}" existe, a trava não a vê, e quem decide o desfecho é o índice. Se a ` +
        `chave dele normaliza (${chaveNormaliza}), a gravação é recusada e a pré-checagem mentiu; ` +
        "se não normaliza, duas linhas que a operação lê como o mesmo número convivem. As duas " +
        "saídas são defeito: ou o banco proíbe o espaço, ou as duas pontas normalizam igual.",
    ).toBe(true);
  });

  it("a REDE do 23505 está LIGADA no caminho que insere a vaga", () => {
    /**
     * Função de tradução DEFINIDA e nunca CHAMADA é o modo de falha clássico deste conserto: o
     * módulo fica bonito, o teste de unidade dele passa, e a violação continua chegando como 500,
     * porque ninguém a embrulhou no `catch` do insert.
     */
    const fonte = readFileSync(
      arquivosDeProducao().find((c) => c.endsWith("as/vagas/vagas.service.ts")) ?? "",
      "utf8",
    );
    const semComentario = fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    const tradutor = /private\s+(\w*(?:Colisao|Conflito)\w*Pandape\w*)\s*\(/.exec(semComentario);
    expect(
      tradutor,
      "`VagasService` não tem tradutor da colisão do número do Pandapé. Sem ele, a corrida entre " +
        "duas gravações manuais do mesmo número chega à tela como 500.",
    ).not.toBeNull();
    const nome = tradutor?.[1] ?? "";
    const chamadas = semComentario.split(`this.${nome}(`).length - 1;
    expect(
      chamadas,
      `\`${nome}\` está definido e NUNCA é chamado. A pré-checagem é a primeira camada e ela perde a ` +
        "corrida por construção (duas requisições simultâneas leem as duas `não existe`): sem a " +
        "tradução no `catch` do insert, a segunda recebe o 23505 cru.",
    ).toBeGreaterThan(0);
  });
});

// ── 5. QUEM MAIS ESCREVE ESTE DADO (§A.40, regra 3) ────────────────────────────────────────────

describe("todos os caminhos que gravam `id_vacancy_pandape` tratam a violação", () => {
  it("a lista dos escritores é conhecida, e cada um tem o seu tratamento", () => {
    /**
     * A pergunta é a linha fixa do briefing de backend: QUEM MAIS ESCREVE ESTE DADO? Um unique novo
     * transforma todo escritor desprotegido numa queda nova. A varredura da planilha e o caminho
     * manual estão no requisito; os OUTROS não estão, e é justamente por isso que eles mordem.
     */
    const escritores: { caminho: string; fonte: string }[] = [];
    for (const caminho of arquivosDeProducao()) {
      /*
       * OS ARNESES FICAM DE FORA, e o motivo é de alcance, não de conveniência: `arnes-*` semeia a
       * HOMOLOGAÇÃO (§A.43) e roda à mão. Uma colisão ali é um vermelho de harness na frente de
       * quem o rodou, não um fluxo de produção caindo sozinho de 30 em 30 minutos. Eles continuam
       * sendo um caminho que grava o número, e é por isso que ficam NOMEADOS aqui em vez de
       * simplesmente não casarem a varredura.
       */
      if (/\/arnes-[^/]*\.ts$/.test(caminho)) continue;
      const fonte = readFileSync(caminho, "utf8");
      const escreve =
        /insert\s+into\s+vagas[\s\S]{0,400}?id_vacancy_pandape/i.test(fonte) ||
        /update\s+vagas[\s\S]{0,200}?set[\s\S]{0,200}?id_vacancy_pandape/i.test(fonte) ||
        /insert\(vagas\)[\s\S]{0,600}?idVacancyPandape/.test(fonte);
      if (escreve) escritores.push({ caminho, fonte });
    }

    const desprotegidos = escritores
      .filter(({ fonte }) => !fonte.includes(NOME_DO_INDICE) && !/23505/.test(fonte))
      .map(({ caminho }) => caminho.replace(/^.*apps\/backend\//, "apps/backend/"));

    expect(
      desprotegidos,
      "Estes caminhos GRAVAM `id_vacancy_pandape` e não tratam a violação do unique novo. Cada um " +
        "deles passa a poder derrubar o próprio fluxo com um 23505 cru a partir desta migration. " +
        "O caso que mais importa é o `espelharVaga` do Digai: ele faz `select` e depois `insert`, " +
        "o MESMO select-then-insert que a varredura acabou de consertar, e nele a violação sobe " +
        "crua pela importação inteira.",
    ).toEqual([]);
  });
});
