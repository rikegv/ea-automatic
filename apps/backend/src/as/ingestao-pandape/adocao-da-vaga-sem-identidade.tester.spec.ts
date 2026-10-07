import { describe, expect, it } from "vitest";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import type { Escrita } from "./ingestao-portas";
import { CODIGO, catalogoDaRevisao, valorNoSet } from "./vaga-pendente-revisao.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE (tester, §A.38): A ADOÇÃO DA VAGA SEM IDENTIDADE ─────────────────────
 *
 * ESCRITO A PARTIR DO REQUISITO, NÃO DO CÓDIGO (§A.38/§A.40 regra 2). O autor da regra estava
 * construindo `adotarVagaSemIdentidade` enquanto este arquivo nascia, e o valor dele é justamente
 * não herdar as suposições daquela construção: o dublê daqui não imita a consulta escrita, ele
 * aplica as PRÉ-CONDIÇÕES QUE O REQUISITO EXIGE e deixa o código provar que as pediu.
 *
 * O REQUISITO, na íntegra:
 *  - a varredura recebe um evento com `id_vacancy_pandape` e `codigo`;
 *  - não achando a vaga pelo id, tenta ADOTAR uma existente;
 *  - candidata = mesmo `codigo`, `id_vacancy_pandape` nulo, `recusada_em` nulo;
 *  - adota SÓ com EXATAMENTE UMA candidata; com zero ou com duas ou mais, cria como hoje;
 *  - adotar = gravar o `id_vacancy_pandape` e nada mais, sem tocar nenhum outro campo;
 *  - rodar duas vezes o mesmo evento não adota duas vezes nem cria nada.
 *
 * ┌─ POR QUE O DUBLÊ APLICA SÓ OS FILTROS QUE A CONSULTA PEDIU ─────────────────────────────────┐
 * │ Um fake que devolvesse a candidata "certa" independentemente do texto da consulta deixaria a │
 * │ metade mais fácil de errar da regra sem medição nenhuma: esquecer `recusada_em is null` ou    │
 * │ esquecer `id_vacancy_pandape is null` ficaria VERDE, porque o fake teria filtrado no lugar do │
 * │ código. Aqui o dublê é um Postgres pobre: ele lê quais predicados estão na instrução e aplica │
 * │ APENAS esses, honrando também o `limit`. Predicado que o código não escreveu, o banco não     │
 * │ aplica, e a candidata errada chega até a decisão, que é exatamente o que acontece em produção.│
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: dado 100% sintético (números de vaga inventados, zero PII). §A.11: sem travessão.
 */

// ── 1. O DUBLÊ: UM POSTGRES POBRE QUE APLICA SÓ O QUE A INSTRUÇÃO PEDIU ────────────────────────

const ID_VACANCY = 7701;
const CODIGO_DO_EVENTO = "codigo-sintetico-da-vaga";

interface LinhaFake {
  id: string;
  codigo: string | null;
  id_vacancy_pandape: number | null;
  recusada_em: string | null;
  status: string;
  nome_divulgacao: string | null;
  cidade_id: number | null;
  posicoes_oficiais: number | null;
}

function linha(p: Partial<LinhaFake> & { id: string }): LinhaFake {
  return {
    codigo: CODIGO_DO_EVENTO,
    id_vacancy_pandape: null,
    recusada_em: null,
    status: CODIGO.pendenteRevisao,
    nome_divulgacao: "titulo-conferido-por-pessoa",
    cidade_id: 10,
    posicoes_oficiais: 9,
    ...p,
  };
}

/** Resolve os valores interpolados do `sql` template desta casa (eles chegam crus). */
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

interface Banco {
  db: never;
  consultas: string[];
  tabela: LinhaFake[];
  /** As instruções que procuram a candidata (a pergunta da adoção, onde quer que ela viva). */
  perguntasDaAdocao: string[];
  /** As instruções que EFETIVAMENTE gravaram `id_vacancy_pandape` numa linha: adotar é isso. */
  updatesQueDaoIdentidade: string[];
  updatesDeVaga: string[];
  insertsDeVaga: string[];
  insertsDeMatricula: string[];
}

/**
 * O dublê. A linha da vaga achada PELO ID é servida com a forma que a busca de hoje devolve, e a
 * candidata é servida com a MESMA forma, porque quem adota tem de poder seguir o fluxo normal.
 */
function bancoDaAdocao(tabela: LinhaFake[]): Banco {
  const consultas: string[] = [];
  const perguntasDaAdocao: string[] = [];
  const updatesQueDaoIdentidade: string[] = [];
  const updatesDeVaga: string[] = [];
  const insertsDeVaga: string[] = [];
  const insertsDeMatricula: string[] = [];
  let sequencia = 0;
  /*
   * A MATRÍCULA (`as_varredura_vagas`) É A FRONTEIRA, e o dublê NÃO a presume. Vaga vinda da carga
   * não tem matrícula, e é dela que `da_varredura` sai no left join da busca. Fingir `true` aqui
   * esconderia o caminho que LANÇA ("vaga de outro dono") na volta seguinte à adoção.
   */
  const matriculas = new Set<string>();

  const comoLinhaDoFluxo = (l: LinhaFake) => ({
    id: l.id,
    status: l.status,
    codigo: l.codigo,
    nome_divulgacao: l.nome_divulgacao,
    cidade_id: l.cidade_id,
    posicoes_oficiais: l.posicoes_oficiais,
    status_antes: null,
    da_varredura: matriculas.has(l.id),
    recusada_em: l.recusada_em,
    encerrou: false,
  });

  const db = {
    execute: (q: unknown) => {
      const texto = limpar(textoComValores(q));
      consultas.push(texto);

      const tocaVagas = /from\s+vagas\b/.test(texto) || /update\s+vagas\b/.test(texto);
      const buscaPeloId =
        tocaVagas && /^select/.test(texto) && /id_vacancy_pandape\s*=\s*\d/.test(texto);

      if (buscaPeloId) {
        const achada = tabela.find((l) => l.id_vacancy_pandape === ID_VACANCY);
        return Promise.resolve(achada ? [comoLinhaDoFluxo(achada)] : []);
      }

      /*
       * A INSTRUÇÃO DA ADOÇÃO, e ela pode ser uma leitura solta OU uma só que lê e escreve (CTE).
       * Nos dois casos o dublê aplica APENAS os predicados escritos e, quando existe, a guarda de
       * unicidade. Guarda ausente = ambiguidade não barrada, que é o defeito aparecendo.
       */
      const procuraCandidata =
        tocaVagas && !buscaPeloId && (/id_vacancy_pandape\s+is\s+null/.test(texto) || /codigo\s*=/.test(texto) || /codigo\s*is\s+null/.test(texto));

      if (procuraCandidata) {
        perguntasDaAdocao.push(texto);
        const perguntouCodigoNulo = /codigo\s*(=\s*null\b|is\s+null)/.test(texto);
        const casaCodigo = (l: LinhaFake) =>
          !/codigo\s*=/.test(texto)
            ? true
            : perguntouCodigoNulo
              ? false
              : l.codigo === CODIGO_DO_EVENTO;
        const casaSemId = (l: LinhaFake) =>
          /id_vacancy_pandape\s+is\s+null/.test(texto) ? l.id_vacancy_pandape === null : true;
        const casaSemRecusa = (l: LinhaFake) =>
          /recusada_em\s+is\s+null/.test(texto) ? l.recusada_em === null : true;
        let achadas = tabela.filter((l) => casaCodigo(l) && casaSemId(l) && casaSemRecusa(l));
        const teto = /limit\s+(\d+)/.exec(texto);
        if (teto) achadas = achadas.slice(0, Number(teto[1]));

        const escreve = /update\s+vagas\b/.test(texto);
        if (!escreve) return Promise.resolve(achadas.map(comoLinhaDoFluxo));

        // Lê e escreve na mesma ida: a guarda de unicidade, se existir, decide se escreve.
        updatesDeVaga.push(texto);
        const temGuardaDeUnicidade = /count\(\s*\*\s*\)[\s\S]{0,40}=\s*1\b/.test(texto);
        const alvo = temGuardaDeUnicidade
          ? achadas.length === 1
            ? achadas[0]
            : null
          : (achadas[0] ?? null);
        if (!alvo) return Promise.resolve([]);
        if (valorNoSet(texto, "id_vacancy_pandape") !== null) {
          updatesQueDaoIdentidade.push(texto);
          alvo.id_vacancy_pandape = ID_VACANCY;
        }
        return Promise.resolve([comoLinhaDoFluxo(alvo)]);
      }

      if (/^update\s+vagas\b/.test(texto)) {
        updatesDeVaga.push(texto);
        if (valorNoSet(texto, "id_vacancy_pandape") !== null) {
          updatesQueDaoIdentidade.push(texto);
          const achado = tabela.find((l) => texto.includes(l.id)) ?? null;
          if (achado) achado.id_vacancy_pandape = ID_VACANCY;
        }
        const alvo = tabela.find((l) => texto.includes(l.id));
        return Promise.resolve(alvo ? [{ id: alvo.id }] : [{ id: tabela[0]?.id ?? "sem-linha" }]);
      }

      if (/^insert\s+into\s+vagas\b/.test(texto)) {
        insertsDeVaga.push(texto);
        sequencia += 1;
        const nova = linha({
          id: `00000000-0000-4000-8000-00000000nova${sequencia}`.slice(0, 36),
          id_vacancy_pandape: ID_VACANCY,
        });
        tabela.push(nova);
        return Promise.resolve([{ id: nova.id }]);
      }

      if (/insert\s+into\s+as_varredura_vagas\b/.test(texto)) {
        insertsDeMatricula.push(texto);
        for (const l of tabela) if (texto.includes(l.id)) matriculas.add(l.id);
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    },
  };

  return {
    db: db as never,
    consultas,
    tabela,
    perguntasDaAdocao,
    updatesQueDaoIdentidade,
    updatesDeVaga,
    insertsDeVaga,
    insertsDeMatricula,
  };
}

function escritaDoEvento(codigo: string | null): Escrita {
  return {
    tabela: "vagas",
    acao: "upsert",
    chaveDeConflito: ["id_vacancy_pandape"],
    comparaAntes: ["codigo", "nome_divulgacao", "cidade_id", "posicoes_oficiais"],
    valores: {
      id_vacancy_pandape: ID_VACANCY,
      codigo,
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
  adotou: boolean;
  criou: boolean;
  erro: string | null;
}

async function rodarVarredura(
  tabela: LinhaFake[],
  opcoes: { codigo?: string | null } = {},
): Promise<Volta> {
  const banco = bancoDaAdocao(tabela);
  return rodarNoBanco(banco, opcoes);
}

async function rodarNoBanco(banco: Banco, opcoes: { codigo?: string | null } = {}): Promise<Volta> {
  const cat = catalogoDaRevisao();
  const repo = new IngestaoRepositorio(banco.db, cat.servico as never, null as never);
  const antesAdocao = banco.updatesQueDaoIdentidade.length;
  const antesInsert = banco.insertsDeVaga.length;
  let erro: string | null = null;
  try {
    await repo.escrever(escritaDoEvento(opcoes.codigo === undefined ? CODIGO_DO_EVENTO : opcoes.codigo));
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  return {
    banco,
    adotou: banco.updatesQueDaoIdentidade.length > antesAdocao,
    criou: banco.insertsDeVaga.length > antesInsert,
    erro,
  };
}

// ── 2. O CAMINHO FELIZ: EXATAMENTE UMA CANDIDATA ───────────────────────────────────────────────

describe("adoção: EXATAMENTE UMA candidata (o caso dos 9 pares de produção)", () => {
  it("ADOTA a vaga sem identidade em vez de criar uma gêmea", async () => {
    const v = await rodarVarredura([linha({ id: "11111111-1111-4111-8111-111111111111" })]);

    expect(
      v.adotou,
      "a varredura não gravou o id na vaga de mesmo código que estava sem identidade: é exatamente assim que nascem as 9 gêmeas",
    ).toBe(true);
    expect(v.criou, "adotou E criou: a gêmea nasceu do mesmo jeito").toBe(false);
    expect(v.erro, "a adoção não pode terminar em exceção").toBeNull();
  });

  it("a instrução que adota grava SÓ `id_vacancy_pandape` (e nada mais)", async () => {
    const v = await rodarVarredura([linha({ id: "11111111-1111-4111-8111-111111111111" })]);
    const sql = v.banco.updatesQueDaoIdentidade[0] ?? "";

    for (const coluna of [
      "cod_cliente",
      "cargo_id",
      "status",
      "recusada_em",
      "codigo",
      "nome_divulgacao",
      "cidade_id",
      "posicoes_oficiais",
      "encerrada_em",
    ]) {
      expect(
        valorNoSet(sql, coluna),
        `a adoção escreveu \`${coluna}\`: adotar é dar identidade e NADA MAIS (requisito)`,
      ).toBeNull();
    }
  });

  it("a volta inteira não reescreve cliente, cargo, status nem a marca de recusa", async () => {
    const v = await rodarVarredura([linha({ id: "11111111-1111-4111-8111-111111111111" })]);

    for (const coluna of ["cod_cliente", "cargo_id", "status", "recusada_em"]) {
      const quemEscreve = v.banco.updatesDeVaga.filter((s) => valorNoSet(s, coluna) !== null);
      expect(
        quemEscreve,
        `a volta da adoção escreveu \`${coluna}\`, que é dado conferido por pessoa`,
      ).toEqual([]);
    }
  });

  it("a pergunta da candidata carrega os TRÊS predicados do requisito", async () => {
    const v = await rodarVarredura([linha({ id: "11111111-1111-4111-8111-111111111111" })]);
    const pergunta = v.banco.perguntasDaAdocao[0] ?? "";

    expect(pergunta, "nenhuma consulta procurou a candidata por código").not.toBe("");
    expect(/codigo\s*=/.test(pergunta), "a candidata tem de casar pelo `codigo`").toBe(true);
    expect(
      /id_vacancy_pandape\s+is\s+null/.test(pergunta),
      "sem `id_vacancy_pandape is null` a adoção pode roubar o id de uma vaga que já tem o seu",
    ).toBe(true);
    expect(
      /recusada_em\s+is\s+null/.test(pergunta),
      "sem `recusada_em is null` a varredura escreve numa vaga que uma pessoa recusou (§A.38/decisão 6)",
    ).toBe(true);
  });
});

// ── 3. OS RAMOS DE ABSTENÇÃO, QUE É ONDE ESTE TIPO DE REGRA COSTUMA ESTAR ERRADA ───────────────

describe("abstenção: a adoção só acontece com UMA candidata", () => {
  it("ZERO candidatas: cria a vaga como hoje", async () => {
    const v = await rodarVarredura([
      linha({ id: "22222222-2222-4222-8222-222222222222", codigo: "outro-codigo-sintetico" }),
    ]);

    expect(v.adotou, "adotou uma vaga de OUTRO código").toBe(false);
    expect(v.criou, "com zero candidatas a vaga tem de nascer, como hoje").toBe(true);
  });

  it("DUAS candidatas: NÃO adota nenhuma e cria a vaga (ambiguidade não se resolve no escuro)", async () => {
    const v = await rodarVarredura([
      linha({ id: "33333333-3333-4333-8333-333333333333" }),
      linha({ id: "44444444-4444-4444-8444-444444444444" }),
    ]);

    expect(
      v.adotou,
      "com duas candidatas a varredura escolheu uma: `limit 1` na pergunta esconde a ambiguidade e o id vai para a vaga errada",
    ).toBe(false);
    expect(v.criou, "não adotando, o comportamento de hoje (criar) tem de valer").toBe(true);
    expect(v.banco.updatesQueDaoIdentidade.length).toBe(0);
  });

  it("TRÊS candidatas: não degenera e segue sem adotar", async () => {
    const v = await rodarVarredura([
      linha({ id: "33333333-3333-4333-8333-333333333333" }),
      linha({ id: "44444444-4444-4444-8444-444444444444" }),
      linha({ id: "55555555-5555-4555-8555-555555555555" }),
    ]);

    expect(v.adotou).toBe(false);
    expect(v.criou).toBe(true);
  });

  it("a ÚNICA candidata está RECUSADA: não adota, e a vaga recusada fica intocada", async () => {
    const v = await rodarVarredura([
      linha({
        id: "66666666-6666-4666-8666-666666666666",
        recusada_em: "2026-10-06T12:00:00.000Z",
      }),
    ]);

    expect(
      v.adotou,
      "a varredura gravou o id numa vaga que uma pessoa RECUSOU: só o botão devolver escreve naquela linha",
    ).toBe(false);
    expect(v.criou, "a recusada não é candidata, então o caso é de ZERO candidatas: cria").toBe(true);
  });

  it("a única candidata de mesmo código JÁ TEM id próprio (e outro): não é candidata", async () => {
    const v = await rodarVarredura([
      linha({ id: "77777777-7777-4777-8777-777777777777", id_vacancy_pandape: 3498372 }),
    ]);

    expect(
      v.adotou,
      "a adoção sobrescreveu o `id_vacancy_pandape` de uma vaga que já tinha o seu: duas vagas do ATS viram uma",
    ).toBe(false);
    expect(v.criou).toBe(true);
  });
});

// ── 4. OS GRUPOS REAIS DO MAPA DE PRODUÇÃO (classe A e classe B), QUE NÃO PODEM SER TOCADOS ────

describe("os grupos legítimos do mapa de produção nunca são adotados", () => {
  it("classe A, o código 332225 com 30 vagas, todas COM id: nenhuma é tocada", async () => {
    const trinta = Array.from({ length: 30 }, (_, i) =>
      linha({
        id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`,
        codigo: "332225",
        id_vacancy_pandape: 3300000 + i,
      }),
    );
    const v = await rodarVarredura(trinta, { codigo: "332225" });

    expect(
      v.adotou,
      "a regra degenerou num grupo grande e adotou uma das 30 vagas reais do código 332225",
    ).toBe(false);
    expect(v.criou, "sem candidata (todas têm id), o comportamento é o de hoje: criar").toBe(true);
    expect(v.banco.tabela.filter((l) => l.id_vacancy_pandape === ID_VACANCY).length).toBe(1);
  });

  it("classe B, duas vagas de mesmo código ambas COM id PRÓPRIO e diferente: nenhuma é tocada", async () => {
    const tabela = [
      linha({ id: "bbbbbbbb-0000-4000-8000-000000000001", codigo: "2655079", id_vacancy_pandape: 3281893 }),
      linha({ id: "bbbbbbbb-0000-4000-8000-000000000002", codigo: "2655079", id_vacancy_pandape: 3498372 }),
    ];
    const v = await rodarVarredura(tabela, { codigo: "2655079" });

    expect(v.adotou, "a classe B tem duas vagas REAIS: adotar apaga a identidade de uma delas").toBe(false);
    expect(tabela[0].id_vacancy_pandape).toBe(3281893);
    expect(tabela[1].id_vacancy_pandape).toBe(3498372);
  });
});

// ── 5. O `codigo` VAZIO E O `codigo` NULO, QUE O REQUISITO NÃO MENCIONA ────────────────────────

describe("o código do evento vazio ou nulo nunca casa candidata", () => {
  it("`codigo` NULO no evento: não adota ninguém, mesmo havendo vaga de código nulo sem id", async () => {
    const v = await rodarVarredura(
      [linha({ id: "99999999-9999-4999-8999-999999999999", codigo: null })],
      { codigo: null },
    );

    expect(
      v.adotou,
      "o evento sem código adotou uma vaga de código nulo: duas vagas sem relação nenhuma viraram a mesma",
    ).toBe(false);
    expect(v.criou).toBe(true);
  });

  it("`codigo` VAZIO no evento: não adota a vaga de código vazio", async () => {
    const v = await rodarVarredura(
      [linha({ id: "99999999-9999-4999-8999-999999999998", codigo: "" })],
      { codigo: "" },
    );

    expect(
      v.adotou,
      "`codigo = ''` casa com qualquer outra vaga de código vazio: a adoção ligaria vagas sem relação",
    ).toBe(false);
    expect(v.criou).toBe(true);
  });

  it("`codigo` só com espaços: não adota (nem pela comparação crua, nem depois de aparado)", async () => {
    const v = await rodarVarredura(
      [linha({ id: "99999999-9999-4999-8999-999999999997", codigo: "" })],
      { codigo: "   " },
    );

    expect(v.adotou).toBe(false);
    expect(v.criou).toBe(true);
  });

  it("não PERGUNTA pela candidata quando o evento não tem código", async () => {
    const v = await rodarVarredura(
      [linha({ id: "99999999-9999-4999-8999-999999999996", codigo: null })],
      { codigo: null },
    );

    expect(
      v.banco.perguntasDaAdocao,
      "perguntar com código nulo é uma pergunta cuja resposta tem de ser ignorada: um `is not distinct from` futuro passa a casar tudo em silêncio",
    ).toEqual([]);
  });
});

// ── 6. IDEMPOTÊNCIA E CONCORRÊNCIA ─────────────────────────────────────────────────────────────

describe("idempotência: a mesma volta duas vezes", () => {
  it("roda duas vezes o mesmo evento: adota UMA vez e não cria nada", async () => {
    const tabela = [linha({ id: "12121212-1212-4121-8121-121212121212" })];
    const banco = bancoDaAdocao(tabela);

    const primeira = await rodarNoBanco(banco);
    const segunda = await rodarNoBanco(banco);

    expect(primeira.adotou, "a primeira volta tinha de adotar").toBe(true);
    expect(segunda.adotou, "a segunda volta adotou de novo: a adoção não é de uma vez só").toBe(false);
    expect(segunda.criou, "a segunda volta criou a gêmea que a primeira evitou").toBe(false);
    expect(banco.insertsDeVaga, "nenhuma volta podia inserir vaga").toEqual([]);
    expect(banco.updatesQueDaoIdentidade.length, "o id foi gravado mais de uma vez").toBe(1);
  });

  it("DUAS voltas ao mesmo tempo sobre a MESMA candidata: uma só adota", async () => {
    const tabela = [linha({ id: "13131313-1313-4131-8131-131313131313" })];
    const banco = bancoDaAdocao(tabela);

    await Promise.all([rodarNoBanco(banco), rodarNoBanco(banco)]);

    const escreveuDuasVezes = banco.updatesQueDaoIdentidade.length > 1;
    const comTrava = banco.perguntasDaAdocao.some((p) => /for\s+update/.test(p));
    const comCompareAndSwap = banco.updatesQueDaoIdentidade.every((u) =>
      /where[\s\S]*id_vacancy_pandape\s+is\s+null/.test(u),
    );
    expect(
      !escreveuDuasVezes || comTrava || comCompareAndSwap,
      "duas voltas simultâneas leram a mesma candidata e as duas gravaram: a adoção precisa de `for update` na leitura ou de `id_vacancy_pandape is null` no `where` do update",
    ).toBe(true);
    expect(
      banco.insertsDeVaga,
      "a volta PERDEDORA não achou mais candidata (a vencedora acabou de gravar o id) e caiu no caminho de criar: a gêmea nasce igual, e `vagas.id_vacancy_pandape` tem índice NÃO único, então nem o banco reclama. Hoje só a `concurrency: 1` da fila segura isso, e isso é propriedade da fila, não da regra",
    ).toEqual([]);
  });
});

// ── 7. A DECISÃO QUE O REQUISITO NÃO TOMA: ADOTAR UMA VAGA JÁ LIBERADA POR UMA PESSOA ──────────

/**
 * ─ ESTE BLOCO EXPÕE UMA DECISÃO, E O VERMELHO AQUI É A PERGUNTA, NÃO O DEFEITO ────────────────
 *
 * O requisito diz "mesmo `codigo`, sem id, não recusada" e NÃO distingue a candidata que está
 * PENDENTE_REVISAO da que já foi LIBERADA por uma pessoa (ABERTA, com autor e trilha). Quatro dos
 * nove pares do mapa de produção têm a vaga sem id justamente ABERTA (2161521, 3781129, 3781368,
 * 3784372), e o diretor TIROU 2161521 do lote de consolidação por esse exato motivo: "liberada,
 * ABERTA com autor".
 *
 * Adotar dá identidade e nada mais, mas a identidade é a FRONTEIRA da varredura: a partir dela a
 * vaga que uma pessoa liberou passa a ser alcançada pelo refresh dos campos do ATS, pelo
 * encerramento automático e pela reabertura. É mudança de regime, sem autor e sem trilha, numa
 * linha que tem autor e trilha.
 *
 * Os contratos abaixo medem o MÍNIMO inegociável (adotar não pode mexer no que a pessoa escreveu) e
 * registram a pergunta aberta: adotar vaga liberada, ou abster-se e registrar divergência?
 */
describe("a candidata está ABERTA (liberada por uma pessoa)", () => {
  const abertaSemId = () =>
    linha({ id: "14141414-1414-4141-8141-141414141414", status: CODIGO.abertura });

  it("MÍNIMO: adotar uma vaga liberada não reescreve os campos que a pessoa conferiu", async () => {
    const v = await rodarVarredura([abertaSemId()]);

    for (const coluna of ["posicoes_oficiais", "nome_divulgacao", "cidade_id", "cod_cliente", "status"]) {
      const quemEscreve = v.banco.updatesDeVaga.filter((s) => valorNoSet(s, coluna) !== null);
      expect(
        quemEscreve,
        `a adoção de uma vaga JÁ LIBERADA reescreveu \`${coluna}\` com o valor do ATS, desfazendo a conferência humana`,
      ).toEqual([]);
    }
  });

  it("DECISÃO EM ABERTO: a vaga liberada por uma pessoa não devia ser adotada em silêncio", async () => {
    const v = await rodarVarredura([abertaSemId()]);

    expect(
      v.adotou,
      "adotar uma vaga ABERTA a enrola no ciclo automático (refresh, encerramento, reabertura) sem autor e sem trilha; o diretor tirou a 2161521 do lote por este motivo. Se adotar for a decisão, este contrato se inverte DE PROPÓSITO, com a decisão citada",
    ).toBe(false);
  });

  it("a candidata FECHADA não é reaberta pela adoção", async () => {
    const v = await rodarVarredura([
      linha({ id: "15151515-1515-4151-8151-151515151515", status: CODIGO.fechamento }),
    ]);

    const mexeuNoStatus = v.banco.updatesDeVaga.filter((s) => valorNoSet(s, "status") !== null);
    expect(
      mexeuNoStatus,
      "a adoção mudou o status de uma vaga fechada: dar identidade não é reabrir",
    ).toEqual([]);
  });
});

// ── 8. A MATRÍCULA DA VARREDURA, QUE O REQUISITO NÃO MENCIONA ──────────────────────────────────

/**
 * `as_varredura_vagas` é o registro de PROPRIEDADE da varredura, e é dele que a busca, a reabertura
 * e o encerramento leem a fronteira. O requisito manda gravar o id "e nada mais", então a vaga
 * adotada fica COM id e SEM matrícula, e a volta seguinte a acha por número com `da_varredura` falso,
 * que é o caminho que LANÇA ("vaga de outro dono: conflito para revisão humana").
 *
 * Então ou a adoção cria a matrícula (e aí não é "nada mais"), ou a vaga adotada trava a varredura
 * toda volta. Este contrato mede a consequência, não escolhe a saída.
 */
describe("a fronteira da varredura depois da adoção", () => {
  it("a vaga adotada fica com matrícula OU a busca da volta seguinte a aceita sem matrícula", async () => {
    const tabela = [linha({ id: "17171717-1717-4171-8171-171717171717" })];
    const banco = bancoDaAdocao(tabela);

    await rodarNoBanco(banco);

    const ganhouMatricula = banco.insertsDeMatricula.length > 0;
    const segunda = await rodarNoBanco(banco);
    expect(
      ganhouMatricula || segunda.erro === null,
      "a vaga adotada ficou com id e SEM matrícula: na volta seguinte o left join devolve `da_varredura` falso e a varredura LANÇA 'vaga de outro dono', toda volta, para sempre",
    ).toBe(true);
  });

  it("a volta SEGUINTE acha a vaga adotada pelo id e não termina em exceção", async () => {
    const tabela = [linha({ id: "16161616-1616-4161-8161-161616161616" })];
    const banco = bancoDaAdocao(tabela);

    await rodarNoBanco(banco);
    const segunda = await rodarNoBanco(banco);

    expect(
      segunda.erro,
      "a vaga adotada trava a varredura na volta seguinte: a adoção precisa resolver a matrícula ou a busca precisa aceitar a vaga adotada",
    ).toBeNull();
  });
});
