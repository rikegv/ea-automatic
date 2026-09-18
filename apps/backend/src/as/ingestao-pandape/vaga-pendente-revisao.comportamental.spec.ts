import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import { RetencaoCandidatosService } from "../candidatos/retencao-candidatos.service";
import { sqlDaVarredura } from "../candidatos/retencao-lgpd.tester-fake";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { VagasService } from "../vagas/vagas.service";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import {
  CODIGO,
  DESENHO_DO_MAPA,
  MUTANTES_DA_LIBERACAO,
  MUTANTES_DA_REABERTURA,
  REABERTURAS_CORRETAS,
  MUTANTES_DO_CATALOGO,
  MUTANTES_DO_ENCERRAMENTO,
  MUTANTES_DO_MOVER,
  MUTANTES_DO_NASCIMENTO,
  PAPEIS_CANDIDATOS,
  SQL_ENCERRAMENTO_REFERENCIA,
  catalogoDaRevisao,
  desenhoDaFila,
  lerEmitidoDaVaga,
  linhaDoStatusNovo,
  linhasDaRevisao,
  nomeDaPortaDeLiberacao,
  reaberturaCorreta,
  rodarEncerramento,
  rodarLiberacao,
  rodarMoverStatus,
  rodarNascimento,
  rodarReabertura,
  violacoesDaLiberacao,
  violacoesDaReabertura,
  violacoesDoAbrigoDoExpurgo,
  violacoesDoAlcanceDoEncerramento,
  violacoesDoFailClosed,
  violacoesDoMoverStatus,
  violacoesDoNascimento,
  violacoesDoStatusNovo,
} from "./vaga-pendente-revisao.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE DA VAGA PENDENTE DE REVISÃO (§A.38, §A.40 regra 2) ───────────────────
 *
 * ESCRITO PELO `tester`, A PARTIR DO REQUISITO, ANTES DO CÓDIGO. As afirmações que dependem da
 * construção nascem VERMELHAS de propósito; as que são regressão nascem verdes, porque medem o que
 * já está certo e é justamente o que esta frente pode derrubar.
 *
 * ┌─ A ORDEM DOS BLOCOS É A ORDEM DO CUSTO ─────────────────────────────────────────────────────┐
 * │ 1. o encerramento continua alcançando o status novo (regressão, e a mais cara);              │
 * │ 2. a reabertura não contorna a fila;                                                          │
 * │ 3. a liberação é do servidor, e o mover status não é a segunda porta;                         │
 * │ 4. o destino é o código do PAPEL, resolvido no catálogo;                                      │
 * │ 5. o nascimento;                                                                              │
 * │ 6. o que não pode regredir do ciclo de vida que já estava coberto.                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: dado sintético do começo ao fim. §A.11: sem travessão.
 */

const criarRepositorio = (db: never, catalogo: never): IngestaoRepositorio =>
  new IngestaoRepositorio(db, catalogo, null as never);

const criarServicoDeVagas = (db: never, catalogo: never): VagasService =>
  new VagasService(db as unknown as Database, catalogoDeEtapasFingido() as never, catalogo);

async function sqlDoExpurgo(): Promise<string> {
  const { sql } = await sqlDaVarredura((db: never) => new RetencaoCandidatosService(db));
  return sql.toLowerCase();
}

// ── 0. OS CONTRATOS SE PROVAM ANTES DE ACUSAR ALGUÉM ───────────────────────────────────────────

describe("os contratos, exercitados contra mutantes e contra a referência", () => {
  it.each(PAPEIS_CANDIDATOS)(
    "APROVA o desenho de status com o papel $nome, porque o contrato não escolhe papel",
    ({ papel }) => {
      const desenho = desenhoDaFila(papel);
      expect(
        violacoesDoStatusNovo(linhaDoStatusNovo(desenho), linhasDaRevisao({ desenho })),
      ).toEqual([]);
    },
  );

  it.each(MUTANTES_DO_CATALOGO)(
    "REPROVA o desenho de status $nome, pela regra certa",
    ({ desenho, regraEsperada, dano }) => {
      const linhas = linhasDaRevisao({ desenho });
      const violacoes = violacoesDoStatusNovo(linhaDoStatusNovo(desenho), linhas);
      expect(
        violacoes.filter((x) => x.startsWith(`${regraEsperada}:`)),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );

  it("APROVA um encerramento sabidamente correto", () => {
    expect(
      violacoesDoAlcanceDoEncerramento(SQL_ENCERRAMENTO_REFERENCIA, catalogoDaRevisao()),
    ).toEqual([]);
  });

  it.each(MUTANTES_DO_ENCERRAMENTO)(
    "REPROVA o encerramento mutante $nome, pela regra certa",
    ({ sql, regraEsperada, dano }) => {
      expect(
        violacoesDoAlcanceDoEncerramento(sql, catalogoDaRevisao()).filter((x) =>
          x.startsWith(`${regraEsperada}:`),
        ),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );

  it.each(MUTANTES_DA_REABERTURA)(
    "REPROVA a reabertura mutante $nome, pela regra certa",
    ({ emitido, statusAntes, regraEsperada, dano }) => {
      expect(
        violacoesDaReabertura(emitido, catalogoDaRevisao(), statusAntes).filter((x) =>
          x.startsWith(`${regraEsperada}:`),
        ),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );

  it.each(REABERTURAS_CORRETAS)(
    "APROVA a reabertura que retoma o estado anterior: $nome",
    ({ guardado }) => {
      /*
       * A REFERÊNCIA VEM DO CONTRATO, e não é remontada aqui: o SQL da reabertura certa estava
       * escrito duas vezes, e duas cópias divergem na primeira correção. Quando isso acontece, o
       * caso positivo passa a aprovar um texto que ninguém mais produz, e o teste vira enfeite.
       */
      expect(violacoesDaReabertura(reaberturaCorreta(guardado), catalogoDaRevisao(), guardado)).toEqual([]);
    },
  );

  it.each(MUTANTES_DA_LIBERACAO)(
    "REPROVA a liberação mutante $nome, pela regra certa",
    ({ emitido, cenario, regraEsperada, dano }) => {
      expect(
        violacoesDaLiberacao(emitido, catalogoDaRevisao(), cenario).filter((x) =>
          x.startsWith(`${regraEsperada}:`),
        ),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );

  it("APROVA a liberação que recusa sem cliente e libera com cliente", () => {
    const cat = catalogoDaRevisao();
    expect(
      violacoesDaLiberacao(
        { existe: true, recusou: true, escritas: [], papeisPedidos: [] },
        cat,
        { temCliente: false, naFila: true },
      ),
    ).toEqual([]);
    expect(
      violacoesDaLiberacao(
        {
          existe: true,
          recusou: false,
          escritas: [{ verbo: "update", tabela: "vagas", valores: { status: CODIGO.abertura } }],
          papeisPedidos: ["ABERTURA"],
        },
        cat,
        { temCliente: true, naFila: true },
      ),
    ).toEqual([]);
  });

  it.each(MUTANTES_DO_MOVER)(
    "REPROVA o mover status mutante $nome, pela regra certa",
    ({ emitido, naFila, regraEsperada, dano }) => {
      expect(
        violacoesDoMoverStatus(emitido, naFila).filter((x) => x.startsWith(`${regraEsperada}:`)),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );

  it("APROVA o mover status que recusa a saída da fila e move a vaga comum", () => {
    expect(violacoesDoMoverStatus({ recusou: true, escritas: [] }, true)).toEqual([]);
    expect(
      violacoesDoMoverStatus(
        {
          recusou: false,
          escritas: [{ verbo: "update", tabela: "vagas", valores: { status: CODIGO.standBy } }],
        },
        false,
      ),
    ).toEqual([]);
  });

  it.each(MUTANTES_DO_NASCIMENTO)(
    "REPROVA o nascimento mutante $nome, pela regra certa",
    ({ consultas, temClienteResolvido, regraEsperada, dano }) => {
      const cat = catalogoDaRevisao();
      expect(
        violacoesDoNascimento(lerEmitidoDaVaga(consultas), cat, temClienteResolvido).filter((x) =>
          x.startsWith(`${regraEsperada}:`),
        ),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );
});

// ── 1. A TRAVA MAIS CARA: O ENCERRAMENTO CONTINUA ALCANÇANDO A VAGA PENDENTE ───────────────────

describe("o encerramento automático, medido contra a regressão que esta frente pode causar", () => {
  it.each(PAPEIS_CANDIDATOS)(
    "com o papel $nome, decide o alcance por PROPRIEDADE do catálogo, e não por lista de códigos nem de papéis",
    async ({ papel }) => {
    const r = await rodarEncerramento(criarRepositorio, [9001, 9002], catalogoDaRevisao({ desenho: desenhoDaFila(papel) }));
    expect(r.sql, "o encerramento não emitiu update em `vagas`").not.toBeNull();
    expect(violacoesDoAlcanceDoEncerramento(r.sql as string, r.catalogo)).toEqual([]);
    },
  );

  /**
   * A PROVA DE QUE A GUARDA MORDE O CÓDIGO REAL, e não só os mutantes que eu escrevi: a instrução
   * DE PRODUÇÃO tem a propriedade trocada por uma lista de códigos, que é o mutante do enunciado.
   */
  it("trocar a propriedade pela lista `rascunho e aberta` NA INSTRUÇÃO REAL fica vermelho", async () => {
    const r = await rodarEncerramento(criarRepositorio, [9001]);
    /*
     * O RECORTE MIRA A CLÁUSULA DA PROPRIEDADE, E SÓ ELA. A primeira redação casava até o primeiro
     * par de parênteses adjacentes e, na instrução de hoje, ou não casa nada (e o mutante fica
     * idêntico ao original, medindo coisa nenhuma) ou levaria junto a CTE que guarda de onde a vaga
     * foi fechada. O alvo do mutante é `encerra = false`, então o recorte termina nele.
     */
    const mutante = (r.sql as string).replace(
      /and\s+exists\s*\(\s*select\s+1\s+from\s+as_vaga_status\s[\s\S]*?encerra\s*=\s*false\s*\)/i,
      `and v.status in ('${CODIGO.rascunho}', '${CODIGO.abertura}')`,
    );
    expect(mutante, "a substituição não mudou nada: a afirmação seguinte não mediria o mutante").not.toEqual(r.sql);
    const violacoes = violacoesDoAlcanceDoEncerramento(mutante, r.catalogo);
    expect(violacoes.filter((x) => x.startsWith("ALCANCE_POR_LISTA_DE_CODIGOS:"))).not.toEqual([]);
  });

  it("e o expurgo continua protegendo por `encerra = false`, que é o que abriga o status novo", async () => {
    expect(violacoesDoAbrigoDoExpurgo(await sqlDoExpurgo())).toEqual([]);
  });

  it("lista de ativos VAZIA continua não encerrando ninguém", async () => {
    const r = await rodarEncerramento(criarRepositorio, []);
    expect(r.devolvido).toBe(0);
    expect(r.sql).toBeNull();
  });
});

// ── 2. O STATUS NOVO, E O PAPEL QUE O BANCO ADMITE ─────────────────────────────────────────────

describe("a linha nova do catálogo", () => {
  it("o papel RASCUNHO é IMPOSSÍVEL, e a prova é o índice único do banco", () => {
    const migration = readFileSync(
      join(__dirname, "../../../drizzle/0102_as_status_da_vaga.sql"),
      "utf8",
    ).toLowerCase();
    expect(
      /create unique index[^;]*"?as_vaga_status_papel_unico"?[^;]*\("papel"\)[^;]*where[^;]*'livre'/.test(
        migration.replace(/\s+/g, " "),
      ),
      "o índice único por papel sumiu da migration 0102. Com ele fora, dois status disputam o mesmo papel e `codigoDoPapel` passa a devolver o que vier por último, em silêncio.",
    ).toBe(true);
    expect(
      violacoesDoStatusNovo(
        linhaDoStatusNovo(DESENHO_DO_MAPA),
        linhasDaRevisao({ desenho: DESENHO_DO_MAPA }),
      ).filter((x) => x.startsWith("PAPEL_DE_SISTEMA_DISPUTADO:")),
    ).not.toEqual([]);
  });

  it("o status novo existe no catálogo, recebe candidato, não encerra e tem rótulo humano", () => {
    const cat = catalogoDaRevisao();
    const linha = cat.linhas.find((l) => l.codigo === CODIGO.pendenteRevisao);
    expect(violacoesDoStatusNovo(linha, cat.linhas)).toEqual([]);
  });
});

// ── 3. O NASCIMENTO DA VAGA ESPELHADA ──────────────────────────────────────────────────────────

describe("a vaga espelhada, no repositório de produção", () => {
  it.each(PAPEIS_CANDIDATOS)(
    "com o papel $nome, nasce na fila de revisão quando o cliente não foi resolvido",
    async ({ papel }) => {
      const r = await rodarNascimento(criarRepositorio, {
        catalogo: catalogoDaRevisao({ desenho: desenhoDaFila(papel) }),
      });
      expect(violacoesDoNascimento(r.emitido, r.catalogo, false)).toEqual([]);
    },
  );

  it("nunca inventa `cod_cliente`, e isto vale mesmo depois da frente", async () => {
    const r = await rodarNascimento(criarRepositorio);
    expect(
      violacoesDoNascimento(r.emitido, r.catalogo, false).filter((x) =>
        x.startsWith("CLIENTE_INVENTADO_NO_NASCIMENTO:"),
      ),
    ).toEqual([]);
  });

  it("PARA quando o catálogo não tem o status novo, em vez de gravar um código qualquer", async () => {
    const r = await rodarNascimento(criarRepositorio, {
      catalogo: catalogoDaRevisao({ semPendente: true }),
    });
    expect(violacoesDoFailClosed(r.emitido)).toEqual([]);
  });
});

// ── 4. A REABERTURA NÃO CONTORNA A FILA ────────────────────────────────────────────────────────

describe("a vaga espelhada que saiu das ativas do ATS e voltou", () => {
  it.each(PAPEIS_CANDIDATOS)(
    "com o papel $nome, a vaga que estava na FILA volta para a fila, e nunca para a abertura",
    async ({ papel }) => {
      const r = await rodarReabertura(
        criarRepositorio,
        { statusAntes: CODIGO.pendenteRevisao },
        catalogoDaRevisao({ desenho: desenhoDaFila(papel) }),
      );
      expect(violacoesDaReabertura(r.emitido, r.catalogo, CODIGO.pendenteRevisao)).toEqual([]);
    },
  );

  it("a que estava PUBLICADA volta para onde estava, e o cliente não tem voto nisso", async () => {
    const r = await rodarReabertura(criarRepositorio, { statusAntes: CODIGO.abertura });
    expect(violacoesDaReabertura(r.emitido, r.catalogo, CODIGO.abertura)).toEqual([]);
  });

  /*
   * O CENÁRIO DO VETO, medido aqui pela forma da instrução e contra banco na prova da frente: a
   * vaga está na FILA (o Master a devolveu) e TEM cliente, porque ele não trocou o vínculo, só o pôs
   * em dúvida. Decidir pelo cliente republicaria a vaga na primeira volta do ATS.
   */
  it("a que o Master devolveu para a fila COM cliente volta para a FILA", async () => {
    const r = await rodarReabertura(criarRepositorio, {
      statusAntes: CODIGO.pendenteRevisao,
      temCliente: true,
    });
    expect(violacoesDaReabertura(r.emitido, r.catalogo, CODIGO.pendenteRevisao)).toEqual([]);
  });

  it("sem memória do estado anterior, cai na FILA, que é o fail-closed", async () => {
    const r = await rodarReabertura(criarRepositorio, { statusAntes: null });
    expect(violacoesDaReabertura(r.emitido, r.catalogo, null)).toEqual([]);
  });

  it("com um estado guardado que o catálogo não tem mais, também cai na FILA", async () => {
    const r = await rodarReabertura(criarRepositorio, { statusAntes: "codigo-que-o-diretor-apagou" });
    expect(violacoesDaReabertura(r.emitido, r.catalogo, "codigo-que-o-diretor-apagou")).toEqual([]);
  });

  it("o destino nunca é um literal digitado: ele é sempre uma linha do catálogo", async () => {
    const r = await rodarReabertura(criarRepositorio, { statusAntes: CODIGO.abertura });
    expect(
      violacoesDaReabertura(r.emitido, r.catalogo, CODIGO.abertura).filter((x) =>
        x.startsWith("REABERTURA_POR_LITERAL:"),
      ),
    ).toEqual([]);
  });
});

// ── 5. A LIBERAÇÃO É DO SERVIDOR ───────────────────────────────────────────────────────────────

describe("a liberação da vaga pendente de revisão", () => {
  it("a porta existe no servidor, e não só na tela", () => {
    expect(
      nomeDaPortaDeLiberacao(VagasService.prototype),
      "nenhuma porta de liberação foi achada no serviço de vagas. Guarda só de tela é contornável pela rota: a tela avisa, o servidor recusa.",
    ).not.toBeNull();
  });

  it("SEM cliente vinculado, o servidor RECUSA, e recusa antes de escrever", async () => {
    const e = await rodarLiberacao(VagasService.prototype, criarServicoDeVagas, {
      temCliente: false,
      naFila: true,
    });
    expect(violacoesDaLiberacao(e, catalogoDaRevisao(), { temCliente: false, naFila: true })).toEqual([]);
  });

  it("COM cliente vinculado, libera, e o destino é o código do papel ABERTURA", async () => {
    const cat = catalogoDaRevisao();
    const e = await rodarLiberacao(
      VagasService.prototype,
      criarServicoDeVagas,
      { temCliente: true, naFila: true },
      cat,
    );
    expect(violacoesDaLiberacao(e, cat, { temCliente: true, naFila: true })).toEqual([]);
  });

  it("não move vaga que não está na fila: ela não é uma segunda porta para a abertura", async () => {
    const e = await rodarLiberacao(VagasService.prototype, criarServicoDeVagas, {
      temCliente: true,
      naFila: false,
    });
    expect(violacoesDaLiberacao(e, catalogoDaRevisao(), { temCliente: true, naFila: false })).toEqual([]);
  });
});

// ── 6. O MOVER STATUS NÃO É A SEGUNDA PORTA ────────────────────────────────────────────────────

describe("o mover status, diante da vaga que está na fila de revisão", () => {
  /**
   * A PROPRIEDADE QUE O VETO REVELOU, e ela vale para QUALQUER papel: o status novo não sai para
   * ABERTURA por movimento manual. A guarda de hoje decide pelo papel RASCUNHO, que é o único papel
   * que o status novo NÃO pode ter, então ela não o cobre em nenhum dos cenários abaixo.
   */
  it.each(PAPEIS_CANDIDATOS)(
    "com o papel $nome, NÃO tira da fila, para ABERTURA, uma vaga sem cliente",
    async ({ papel }) => {
      const e = await rodarMoverStatus(
        criarServicoDeVagas,
        CODIGO.pendenteRevisao,
        CODIGO.abertura,
        catalogoDaRevisao({ desenho: desenhoDaFila(papel) }),
      );
      expect(violacoesDoMoverStatus(e, true)).toEqual([]);
    },
  );

  it("e continua movendo a vaga comum, porque a correção não pode virar imobilidade", async () => {
    const e = await rodarMoverStatus(criarServicoDeVagas, CODIGO.abertura, CODIGO.standBy);
    expect(violacoesDoMoverStatus(e, false)).toEqual([]);
  });
});
