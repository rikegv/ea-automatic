import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { PandapeApiService } from "../../pandape/pandape-api.service";
import { FONTE_DO_DEPARA_DE_CLIENTE } from "../depara-cliente/depara-cliente.fonte";
import { IngestaoDeParaCliente } from "../ingestao-pandape/ingestao-depara-cliente.service";
import { DigaiImportacaoService } from "./digai-importacao.service";
import type { DigaiRepositorio } from "./digai-repositorio";
import {
  DigaiVagaRastreioService,
  JANELA_DO_RASTREIO_MS,
  type VagaDaListaDoPandape,
} from "./digai-vaga-rastreio.service";

/**
 * ─ A VAGA-ESPELHO DO DIGAI PARA DE NASCER EM BRANCO: A COBERTURA DE QUEM CONSTRUIU ─────────────
 *
 * ┌─ O QUE SE MEDE AQUI E A INSTRUCAO QUE O DRIVER RECEBE, e isso e desenho ────────────────────┐
 * │ Nao ha Postgres nesta suite, e e o molde declarado da casa para esta frente                  │
 * │ (`ingestao-prepreenchimento.backend.spec.ts`, `ingestao-bind-array.backend.spec.ts`). E ainda │
 * │ mais apropriado aqui: as travas desta frente MORAM na instrucao, de proposito, e nao em `if`  │
 * │ de TypeScript. Quem assere `if` nao assere a trava.                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS SEIS COISAS QUE ESTE ARQUIVO PROVA, na ordem do que custa se quebrar:
 *  (a) a vaga do Digai recebe o PRE-PREENCHIMENTO DA PLANILHA quando ha linha, pelo servico que
 *      a varredura do Pandape ja usa (reuso, nao copia), e com a `reference` NULA;
 *  (b) recebe TITULO, CIDADE, POSICOES e o STATUS do ATS quando a vaga existe na lista;
 *  (c) O CACHE: N vagas na mesma janela gastam UMA chamada ao Pandape (a v1 nao tem busca por id e
 *      cada listagem custa 9,8 MB da cota compartilhada com o webhook da folha, §A.5);
 *  (d) NADA E SOBRESCRITO: `coalesce` no `set` e `is null` no `where`, as duas em SQL;
 *  (e) ZERO instrucao que toque `as_candidaturas` (a FK RESTRICT protege as 223 pessoas medidas em
 *      producao, e aqui nao ha nem caminho que as alcance);
 *  (f) a lista do Pandape indisponivel NAO derruba o ciclo, e a volta seguinte tenta de novo.
 *
 * §A.6: todo dado e SINTETICO. Numeros de vaga na faixa 9xxxxx, titulo de vaga inventado, nenhum
 * CPF, nenhum nome de pessoa, nenhum telefone.
 */

const dialeto = new PgDialect();
const VAGA_ID = "11111111-1111-4111-8111-111111111111";
const CARGO_ID = "99999999-9999-4999-8999-999999999999";
const NUMERO = "900001";
const CIDADE_ID = 3550308;

interface Instrucao {
  sql: string;
  params: unknown[];
}

/** Tira comentario de bloco e de linha. Fonte CRUA nunca e asserida (ver o bloco do item (e)). */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

/**
 * O BANCO QUE SO ANOTA, com a resposta escolhida pela FORMA da consulta e nao pela ordem.
 *
 * Responder por ordem amarraria o teste ao numero de consultas que as duas fontes fazem, e ai
 * acrescentar uma consulta em qualquer das duas quebraria testes que nao falam dela. Por forma, cada
 * caso declara so o que lhe interessa.
 */
function bancoQueAnota(respostas: { cidade?: unknown[]; deParaCliente?: unknown[] } = {}) {
  const instrucoes: Instrucao[] = [];
  const db = {
    execute: (consulta: unknown) => {
      const c = dialeto.sqlToQuery(consulta as never);
      instrucoes.push({ sql: c.sql, params: c.params });
      if (/from\s+as_cidades/i.test(c.sql)) return Promise.resolve(respostas.cidade ?? []);
      if (/from\s+as_depara_cliente_vaga/i.test(c.sql)) {
        return Promise.resolve(respostas.deParaCliente ?? []);
      }
      if (/^\s*update\s+vagas/i.test(c.sql)) return Promise.resolve([{ id: VAGA_ID }]);
      return Promise.resolve([]);
    },
  };
  return { db: db as never, instrucoes };
}

/** A linha da planilha como o banco a devolve (o espelho do de/para, com o pre-preenchimento). */
const linhaDaPlanilha = () => ({
  codigo_externo: NUMERO,
  nome_cliente: "ALFA SERVICOS LTDA",
  cod_cliente: "CLI-TESTE-1",
  confirmado: true,
  codigo_no_catalogo: "CLI-TESTE-1",
  natureza_planilha: "EFETIVA",
  linha_servico_id_planilha: 3,
  cargo_id_planilha: CARGO_ID,
  data_abertura_planilha: "2026-02-01",
  data_limite_planilha: "2026-03-15",
});

/** A vaga como a lista do ATS a entrega (os quatro campos que atravessam, e nada mais). */
const vagaDoAts = (over: Partial<VagaDaListaDoPandape> = {}): VagaDaListaDoPandape => ({
  idVacancy: Number(NUMERO),
  job: "AUXILIAR DE LOGISTICA NOTURNO",
  city: "Taubate - SP",
  numberVacancies: 4,
  status: 3,
  ...over,
});

/** O cliente do ATS como dublê. NUNCA se chama a API real (a cota e compartilhada com a folha). */
function pandapeFingido(vagas: VagaDaListaDoPandape[] | "FALHA") {
  const listarVagas = vi.fn(async () => {
    if (vagas === "FALHA") throw new Error("rede");
    return vagas;
  });
  return { listarVagas } as unknown as PandapeApiService & { listarVagas: typeof listarVagas };
}

function cenario(
  vagas: VagaDaListaDoPandape[] | "FALHA" = [vagaDoAts()],
  respostas: { cidade?: unknown[]; deParaCliente?: unknown[] } = {},
) {
  const { db, instrucoes } = bancoQueAnota(respostas);
  const pandape = pandapeFingido(vagas);
  const servico = new DigaiVagaRastreioService(db, pandape, new IngestaoDeParaCliente(db));
  return { servico, pandape, instrucoes, db };
}

const updates = (instrucoes: Instrucao[]) => instrucoes.filter((i) => /^\s*update/i.test(i.sql));
/** O `update` DO RASTREIO, distinguido pela coluna que so ele escreve. */
const oDoRastreio = (instrucoes: Instrucao[]) =>
  updates(instrucoes).find((i) => /status_pandape/.test(i.sql));
/** O `update` DO PRE-PREENCHIMENTO da planilha, pela coluna que so ele escreve. */
const oDaPlanilha = (instrucoes: Instrucao[]) =>
  updates(instrucoes).find((i) => /natureza_origem/.test(i.sql));
const setDoUpdate = (texto: string) => /set([\s\S]*?)\bwhere\b/i.exec(texto)?.[1] ?? "";

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (a) A PLANILHA: REUSO DO SERVICO QUE JA EXISTE, COM A `reference` NULA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("(a) a vaga do Digai recebe o pre-preenchimento da planilha", () => {
  it("pergunta a planilha pelo numero do Pandape, e SO por ele (o Digai nao tem `reference`)", async () => {
    const { servico, instrucoes } = cenario([vagaDoAts()], {
      deParaCliente: [linhaDaPlanilha()],
    });

    await servico.enriquecer(VAGA_ID, NUMERO);

    const leitura = instrucoes.find((i) => /from\s+as_depara_cliente_vaga/i.test(i.sql));
    expect(leitura, "a planilha nem foi consultada").toBeDefined();
    /*
     * UMA CHAVE SO, e isto e o requisito: o contrato do Digai tem oito campos e nao tem `reference`.
     * MUTANTE QUE ISTO MATA: passar o proprio numero como `reference` "para procurar nas duas
     * chaves", que faria a vaga herdar dado de uma CADEIA DE REABERTURA que ninguem conferiu.
     */
    expect(leitura?.params).toEqual([FONTE_DO_DEPARA_DE_CLIENTE, NUMERO]);
  });

  it("e o pre-preenchimento e ESCRITO pela instrucao do servico reusado, nao por uma copia", async () => {
    const { servico, instrucoes } = cenario([vagaDoAts()], {
      deParaCliente: [linhaDaPlanilha()],
    });

    await servico.enriquecer(VAGA_ID, NUMERO);

    const pre = oDaPlanilha(instrucoes);
    expect(pre, "a vaga do Digai continuou sem o pre-preenchimento da planilha").toBeDefined();
    const set = setDoUpdate(pre?.sql ?? "");
    for (const coluna of ["natureza", "linha_servico_id", "cargo_id", "data_abertura", "data_limite"]) {
      expect(set, `${coluna} ficou fora do pre-preenchimento`).toContain(`${coluna} = coalesce(`);
    }
  });

  it("numero de vaga NAO numerico nao vira chave: a planilha nem e consultada", async () => {
    /*
     * O alfabeto do Digai admite mais do que digito, e `Number("abc")` e `NaN`. Sem a guarda, a
     * chave "NaN" iria para a consulta e, pior, para o mapa de de/para como se fosse um codigo.
     */
    const { servico, instrucoes } = cenario([vagaDoAts()], {
      deParaCliente: [linhaDaPlanilha()],
    });

    await servico.enriquecer(VAGA_ID, "vaga-abc");

    expect(instrucoes.filter((i) => /as_depara_cliente_vaga/i.test(i.sql))).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (b) O PANDAPE: TITULO, CIDADE, POSICOES E O STATUS DA VAGA NO ATS
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("(b) a vaga recebe titulo, cidade, posicoes e o status do ATS", () => {
  it("as quatro colunas entram na instrucao, com os valores da lista", async () => {
    const { servico, instrucoes } = cenario([vagaDoAts()], { cidade: [{ id: CIDADE_ID }] });

    await servico.enriquecer(VAGA_ID, NUMERO);

    const up = oDoRastreio(instrucoes);
    expect(up, "o rastreio nao escreveu nada").toBeDefined();
    const set = setDoUpdate(up?.sql ?? "");
    expect(set).toContain("nome_divulgacao = coalesce(");
    expect(set).toContain("cidade_id = coalesce(");
    expect(set).toContain("posicoes_oficiais = coalesce(");
    expect(set).toContain("status_pandape =");
    expect(up?.params).toContain("AUXILIAR DE LOGISTICA NOTURNO");
    expect(up?.params).toContain(CIDADE_ID);
    expect(up?.params).toContain(4);
    expect(up?.params).toContain(3);
  });

  it("a cidade e resolvida contra o catalogo do IBGE, sem acento e por UF", async () => {
    const { servico, instrucoes } = cenario([vagaDoAts({ city: "Sao Paulo - SP" })], {
      cidade: [{ id: CIDADE_ID }],
    });

    await servico.enriquecer(VAGA_ID, NUMERO);

    const leitura = instrucoes.find((i) => /from\s+as_cidades/i.test(i.sql));
    expect(leitura?.params).toEqual(["SP", "sao paulo"]);
  });

  it("cidade que o catalogo nao tem fica NULA, e nao derruba as outras tres colunas", async () => {
    // Inventar cidade e pior do que nao ter: ela alimenta filtro e contagem regional.
    const { servico, instrucoes } = cenario([vagaDoAts()], { cidade: [] });

    await servico.enriquecer(VAGA_ID, NUMERO);

    const up = oDoRastreio(instrucoes);
    expect(up, "o rastreio desistiu da vaga inteira por causa da cidade").toBeDefined();
    expect(up?.params).toContain("AUXILIAR DE LOGISTICA NOTURNO");
  });

  it("a vaga que o ATS NAO conhece nao produz escrita nenhuma", async () => {
    // Cinco das 13 vagas medidas em producao estao neste caso: elas dependem de gente.
    const { servico, instrucoes } = cenario([vagaDoAts({ idVacancy: 999999 })]);

    await servico.enriquecer(VAGA_ID, NUMERO);

    expect(oDoRastreio(instrucoes)).toBeUndefined();
  });

  it("as duas guardas de vaga estao no `where`: RECUSADA e intocavel, e so vaga em REVISAO", async () => {
    /*
     * MUTANTE QUE ISTO MATA: um `where id = $1` so. A vaga RECUSADA volta da varredura intocada MAS
     * COM O ID, e a vaga JA LIBERADA receberia escrita automatica sem a trilha de edicao que toda
     * gravacao em vaga liberada tem. O papel vem do CATALOGO, nunca de um literal de status.
     */
    const { servico, instrucoes } = cenario();

    await servico.enriquecer(VAGA_ID, NUMERO);

    const up = oDoRastreio(instrucoes);
    expect(up?.sql).toContain("recusada_em is null");
    expect(up?.sql).toMatch(/as_vaga_status/);
    expect(up?.sql).toContain("'REVISAO'");
  });

  it("NAO empurra `atualizado_em`, que e o ruido de escrita que a volta de 15 min multiplicaria", async () => {
    const { servico, instrucoes } = cenario([vagaDoAts()], {
      deParaCliente: [linhaDaPlanilha()],
      cidade: [{ id: CIDADE_ID }],
    });

    await servico.enriquecer(VAGA_ID, NUMERO);

    for (const i of updates(instrucoes)) {
      expect(i.sql, "uma escrita desta volta empurrou `atualizado_em`").not.toContain(
        "atualizado_em",
      );
    }
  });

  it("e NAO move papel: nada de `status`, `status_manual_em` ou `encerrada_em`", async () => {
    const { servico, instrucoes } = cenario([vagaDoAts()], { cidade: [{ id: CIDADE_ID }] });

    await servico.enriquecer(VAGA_ID, NUMERO);

    const set = setDoUpdate(oDoRastreio(instrucoes)?.sql ?? "");
    expect(set).not.toMatch(/\bstatus\s*=/);
    expect(set).not.toContain("status_manual_em");
    expect(set).not.toContain("encerrada_em");
    expect(set).not.toContain("recusada_em =");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (c) O CACHE: UMA CHAMADA POR JANELA, E AS FILTRAGENS EM MEMORIA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("(c) o cache da lista do Pandape", () => {
  it("TRES vagas no mesmo ciclo fazem UMA chamada ao ATS", async () => {
    /*
     * ┌─ O MUTANTE QUE ISTO MATA E O CUSTO MEDIDO ────────────────────────────────────────────────┐
     * │ `getVacancy(id)` LISTA as 6.944 vagas (9,8 MB) a cada chamada, porque a v1 nao tem busca   │
     * │ por id. Uma chamada por vaga faria as 13 vagas medidas custarem ~128 MB e 13 requisicoes   │
     * │ de uma cota de 1.000 por 5 minutos COMPARTILHADA com o webhook que alimenta a folha: o     │
     * │ excesso do EA atrasa a folha, e isso e risco de seguranca (§A.5). Cache obrigatorio, por   │
     * │ decisao do diretor.                                                                        │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const vagas = [
      vagaDoAts({ idVacancy: 900001 }),
      vagaDoAts({ idVacancy: 900002 }),
      vagaDoAts({ idVacancy: 900003 }),
    ];
    const { servico, pandape } = cenario(vagas);

    await servico.enriquecer(VAGA_ID, "900001");
    await servico.enriquecer(VAGA_ID, "900002");
    await servico.enriquecer(VAGA_ID, "900003");

    expect(pandape.listarVagas).toHaveBeenCalledTimes(1);
  });

  it("e DUAS voltas simultaneas tambem fazem UMA: a promessa em voo e compartilhada", async () => {
    /*
     * Sem isto, o cache "de uma chamada" faria DUAS na primeira vaga de cada janela, porque a
     * segunda volta chega antes de a primeira ter guardado a foto. A fila do Digai e de concorrencia
     * 1 hoje, mas isso e propriedade da FILA e nao desta regra: mudar a fila reabriria o defeito.
     */
    const { servico, pandape } = cenario([vagaDoAts()]);

    await Promise.all([
      servico.enriquecer(VAGA_ID, NUMERO),
      servico.enriquecer(VAGA_ID, NUMERO),
    ]);

    expect(pandape.listarVagas).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (d) NADA E SOBRESCRITO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("(d) o campo que ja tem valor nao e tocado", () => {
  it("as tres colunas digitadas por gente so recebem `coalesce`, e o `where` exige coluna NULA", async () => {
    /*
     * ┌─ A REGRA E DO `espelharVaga`, E ELA ESTA ESCRITA LA ──────────────────────────────────────┐
     * │ "escrever qualquer coisa ali apagaria o que o Pandape ou uma pessoa colocou". A trava vive  │
     * │ na INSTRUCAO e nao num `if`: entre a leitura e a escrita cabe o salvamento de uma pessoa, e │
     * │ um `if` se perde numa refatoracao (argumento da §A.33 sobre o fallback removido).           │
     * │                                                                                            │
     * │ MUTANTE QUE ISTO MATA: `set nome_divulgacao = $1` sem o `coalesce`, que reescreveria o      │
     * │ titulo que alguem corrigiu a mao, de 15 em 15 minutos, com o texto do ATS.                  │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { servico, instrucoes } = cenario([vagaDoAts()], { cidade: [{ id: CIDADE_ID }] });

    await servico.enriquecer(VAGA_ID, NUMERO);

    const up = oDoRastreio(instrucoes);
    const set = setDoUpdate(up?.sql ?? "");
    for (const coluna of ["nome_divulgacao", "cidade_id", "posicoes_oficiais"]) {
      expect(set, `${coluna} foi escrita sem coalesce`).toContain(`${coluna} = coalesce(`);
      expect(up?.sql, `o where nao exige ${coluna} nula`).toContain(`${coluna} is null`);
    }
  });

  it("o ESPELHO DO ATS e ATUALIZAVEL, mas a AUSENCIA de status nao apaga o que ja se sabia", async () => {
    /*
     * ┌─ AS DUAS PROPRIEDADES SAO OPOSTAS, E E POR ISSO QUE SAO DUAS PECAS ───────────────────────┐
     * │ 1. ATUALIZAVEL: `status_pandape` nasceu com a 0152, nenhuma pessoa a digita e este arquivo  │
     * │    e o unico escritor dela. Congela-la no primeiro valor lido faria a tela afirmar "ativa"  │
     * │    sobre vaga que o ATS encerrou DEPOIS, que e a pergunta que a coluna existe para          │
     * │    responder. Por isso o `is distinct from` no `where`, e nao um `is null`.                  │
     * │ 2. NAO PERDE O QUE SABIA: vaga presente na lista SEM o campo de status projeta nulo. Sem a   │
     * │    protecao, a instrucao disparada por outro disjunto (titulo ainda nulo) trocaria o 3 por   │
     * │    NULO, e a vaga ENCERRADA voltaria a nao dizer nada. Achado do `tester`.                   │
     * │                                                                                             │
     * │ MUTANTE QUE ISTO MATA: `status_pandape = $n` cru, que satisfaz (1) e quebra (2).              │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { servico, instrucoes } = cenario([vagaDoAts()], { cidade: [{ id: CIDADE_ID }] });

    await servico.enriquecer(VAGA_ID, NUMERO);

    const up = oDoRastreio(instrucoes);
    expect(setDoUpdate(up?.sql ?? ""), "a ausencia de status apagaria o espelho gravado").toContain(
      "status_pandape = coalesce(",
    );
    expect(up?.sql, "o espelho ficou congelado no primeiro valor lido").toContain(
      "status_pandape is distinct from",
    );
    // E A CONDICAO EXCLUI O NULO: volta sem informacao nao vira instrucao de escrita.
    expect(up?.sql).toMatch(/is not null\s*\n?\s*and status_pandape is distinct from/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (e) CANDIDATURA: ZERO CAMINHO ATE ELA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("(e) nenhuma instrucao do rastreio toca `as_candidaturas`", () => {
  it("nem no caminho completo, com planilha e lista do ATS respondendo", async () => {
    /*
     * A FK de `as_candidaturas` para `vagas` e RESTRICT, e e ela que protege as 223 pessoas medidas
     * em producao. Esta assercao e a outra metade: a protecao nao depende so do banco recusar, mas
     * de nao existir instrucao nossa que chegue la.
     */
    const { servico, instrucoes } = cenario([vagaDoAts()], {
      deParaCliente: [linhaDaPlanilha()],
      cidade: [{ id: CIDADE_ID }],
    });

    await servico.enriquecer(VAGA_ID, NUMERO);

    expect(instrucoes.length, "nenhuma instrucao rodou: a medicao esta vazia").toBeGreaterThan(2);
    for (const i of instrucoes) {
      expect(i.sql, "uma instrucao do rastreio alcancou a candidatura").not.toContain(
        "as_candidaturas",
      );
    }
  });

  it("e o CODIGO do rastreio nao cita a tabela em lugar nenhum", async () => {
    /*
     * A VARREDURA E SOBRE O CODIGO SEM COMENTARIO, e isso e correcao e nao conveniencia: o arquivo
     * FALA de `as_candidaturas` em prosa, longamente, para explicar por que nao a alcanca. Varredura
     * sobre o texto cru daria vermelho contra uma implementacao CORRETA, que e o pior defeito que um
     * teste pode ter (precedente: `depara-cliente.escritores.backend.spec.ts`).
     *
     * OS DOIS CANARIOS VEM JUNTO: sem eles, uma limpeza com regex errada devolveria string vazia e
     * TODA assercao de ausencia passaria.
     */
    const cru = readFileSync(join(__dirname, "digai-vaga-rastreio.service.ts"), "utf8");
    const limpo = semComentarios(cru);

    expect(cru, "a prosa sobre a candidatura desapareceu do arquivo").toContain("as_candidaturas");
    expect(limpo, "a limpeza comeu o codigo").toContain("update vagas");
    expect(limpo.length).toBeGreaterThan(1500);
    expect(limpo, "o rastreio alcancou a candidatura").not.toContain("as_candidaturas");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (f) FALHA DO PANDAPE NAO DERRUBA A INGESTAO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("(f) a lista do Pandape indisponivel nao derruba o ciclo", () => {
  it("a chamada que falha nao lanca, e a vaga segue como nasceu hoje", async () => {
    const { servico, instrucoes } = cenario("FALHA", { deParaCliente: [linhaDaPlanilha()] });

    await expect(servico.enriquecer(VAGA_ID, NUMERO)).resolves.toBeUndefined();

    expect(oDoRastreio(instrucoes), "escreveu sem ter lido o ATS").toBeUndefined();
    // E O PRE-PREENCHIMENTO DA PLANILHA ACONTECEU MESMO ASSIM: as duas fontes sao independentes.
    expect(oDaPlanilha(instrucoes)).toBeDefined();
  });

  it("lista VAZIA nao vira foto, MAS fecha a janela: nao se lista de novo no mesmo ciclo", async () => {
    /*
     * ┌─ AS DUAS METADES SAO SEPARADAS, E CONFUNDI-LAS FOI O DEFEITO QUE O `tester` MEDIU ────────┐
     * │ 1. A integracao INERTE (sem credencial) devolve `[]` pelo mesmo caminho de uma falha        │
     * │    engolida no cliente, entao `[]` NAO e foto: o ATS medido tem 6.944 vagas, e gravar o     │
     * │    cache vazio afirmaria que ele nao tem nenhuma. A foto anterior sobrevive.                 │
     * │ 2. A JANELA FECHA DE TODO JEITO. O vazio tambem custou uma listagem de 9,8 MB, e deixar a   │
     * │    janela aberta fazia as 13 vagas da volta listarem UMA POR UMA: 128 MB, dentro da cota     │
     * │    compartilhada com o webhook da folha, exatamente quando o ATS esta ruim.                  │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { servico, pandape, instrucoes } = cenario([]);

    await servico.enriquecer(VAGA_ID, NUMERO);
    await servico.enriquecer(VAGA_ID, NUMERO);
    await servico.enriquecer(VAGA_ID, NUMERO);

    expect(oDoRastreio(instrucoes)).toBeUndefined();
    expect(pandape.listarVagas, "a lista vazia nao fechou a janela").toHaveBeenCalledTimes(1);
  });

  it("a falha tambem fecha a janela: 13 vagas no mesmo ciclo nao viram 13 listagens", async () => {
    /*
     * O RAMO QUE SO APARECE CONTANDO, e e o que custa caro: quando o ATS recusa por 429 de COTA, a
     * versao que abria a janela so no caminho feliz respondia com uma listagem por vaga. 13 vagas,
     * 13 pedidos de 9,8 MB, dentro da cota que o webhook que alimenta a folha divide com o EA: o
     * remedio aumentando a dose do veneno. Leitura que falhou vale pelo ciclo.
     */
    const { servico, pandape } = cenario("FALHA");

    for (let i = 0; i < 13; i += 1) await servico.enriquecer(VAGA_ID, NUMERO);

    expect(pandape.listarVagas, "a falha nao fechou a janela").toHaveBeenCalledTimes(1);
  });

  it("a janela VENCIDA tenta de novo, e ai preenche", async () => {
    const banco = bancoQueAnota({ cidade: [{ id: CIDADE_ID }] });
    let falhar = true;
    const listarVagas = vi.fn(async () => {
      if (falhar) throw new Error("rede");
      return [vagaDoAts()];
    });
    const servico = new DigaiVagaRastreioService(
      banco.db,
      { listarVagas } as unknown as PandapeApiService,
      new IngestaoDeParaCliente(banco.db),
    );

    await servico.enriquecer(VAGA_ID, NUMERO);
    expect(oDoRastreio(banco.instrucoes)).toBeUndefined();

    /*
     * O RELOGIO E AVANCADO DE PROPOSITO: dentro da MESMA janela a leitura NAO se repete, nem depois
     * de falhar (e a protecao de cota). Quem tenta de novo e o CICLO SEGUINTE, 15 minutos depois.
     */
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + JANELA_DO_RASTREIO_MS + 1_000);
      falhar = false;
      await servico.enriquecer(VAGA_ID, NUMERO);
    } finally {
      vi.useRealTimers();
    }
    expect(oDoRastreio(banco.instrucoes), "a janela vencida nao tentou de novo").toBeDefined();
    expect(listarVagas).toHaveBeenCalledTimes(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A COSTURA: A INGESTAO CHAMA O RASTREIO, E A CANDIDATURA NAO DEPENDE DELE
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** O repositorio do Digai como dublê: ANOTA o que seria escrito e nunca escreve. */
function repositorioFingido() {
  const escritas: string[] = [];
  return {
    escritas,
    deParaEtapa: vi.fn(async () => ({ etapaCodigo: "CAPTACAO", situacao: null, ativo: true })),
    candidatoPorIdentidade: vi.fn(async () => null),
    candidatoPorDocumento: vi.fn(async () => null),
    candidatoPorEmail: vi.fn(async () => null),
    criarCandidato: vi.fn(async () => {
      escritas.push("criarCandidato");
      return { id: "22222222-2222-4222-8222-222222222222" };
    }),
    atualizarCandidato: vi.fn(async () => ({ linhasAfetadas: 1 })),
    anexarIdentidade: vi.fn(async () => undefined),
    registrarConflito: vi.fn(async () => undefined),
    espelharVaga: vi.fn(async () => {
      escritas.push("espelharVaga");
      return { id: VAGA_ID };
    }),
    garantirCandidatura: vi.fn(async () => {
      escritas.push("garantirCandidatura");
      return { criada: true, id: "33333333-3333-4333-8333-333333333333" };
    }),
  };
}

/** O registro admitido pela regua de hoje (SO quem finalizou a triagem, e quem responde e o CPF). */
const REGISTRO = {
  userId: "usr-sintetico-9",
  partnerJobId: NUMERO,
  name: "Fulano De Teste",
  cpf: "11122233396",
  email: "fulano.teste@exemplo.invalido",
  phoneNumber: "11900000001",
  appliedAt: "2026-09-10T12:00:00.000Z",
};

function importacao(rastreio: { enriquecer: (v: string, n: string) => Promise<void> }) {
  const repo = repositorioFingido();
  const config = {
    get: <T,>(chave: string) =>
      ({ DIGAI_API_TOKEN: "token-sintetico", DIGAI_INGESTAO_ATIVA: "true" })[chave] as unknown as T,
  } as ConfigService;
  const servico = new DigaiImportacaoService(
    config,
    repo as unknown as DigaiRepositorio,
    rastreio as unknown as DigaiVagaRastreioService,
  );
  return { servico, repo };
}

describe("a costura: a vaga e enriquecida no mesmo ponto em que ela e espelhada", () => {
  it("o rastreio e chamado com o id da vaga e o numero do Pandape, ANTES da candidatura", async () => {
    const chamadas: [string, string][] = [];
    const { servico, repo } = importacao({
      enriquecer: async (v, n) => {
        chamadas.push([v, n]);
        repo.escritas.push("enriquecer");
      },
    });

    await servico.importar([REGISTRO]);

    expect(chamadas).toEqual([[VAGA_ID, NUMERO]]);
    expect(repo.escritas).toEqual([
      "criarCandidato",
      "espelharVaga",
      "enriquecer",
      "garantirCandidatura",
    ]);
  });

  it("e o rastreio que LANCA nao custa a candidatura de ninguem", async () => {
    /*
     * O rastreio nao lanca por desenho (cada caminho dele tem o seu `catch`), mas ele roda ANTES da
     * candidatura: a garantia nao pode depender de o arquivo vizinho continuar disciplinado. §A.6: o
     * aviso diz o numero da VAGA no ATS e mais nada.
     */
    const { servico, repo } = importacao({
      enriquecer: async () => {
        throw new Error("o rastreio explodiu");
      },
    });

    const resumo = await servico.importar([REGISTRO]);

    expect(repo.garantirCandidatura).toHaveBeenCalledTimes(1);
    expect(resumo.escritos).toBe(1);
  });
});
