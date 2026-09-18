import { sqlExecutavel } from "../candidatos/retencao-lgpd.tester-fake";
import { setDaEscrita, whereDaEscrita } from "../candidatos/retencao-texto-livre.tester-fake";
import { FONTES_EXTERNAS } from "../../domain/as-etapa-externa";
import type { Escrita } from "./ingestao-portas";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA O LADO DO BANCO DA INGESTÃO ─────────────────────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. Complementa `ingestao-varredura.tester-fake.ts`, que mede o
 * CICLO por efeito observado, e cobre o que aquele contrato declaradamente NÃO alcançava: a forma
 * da instrução que chega ao Postgres.
 *
 * ┌─ AS TRÊS COISAS QUE SÓ SE PROVAM AQUI, e por que nenhuma delas cabia no contrato do ciclo ──┐
 * │ 1. `origem = 'PANDAPE'`. Ela NÃO é dado do item que veio da API: é a ASSINATURA DE QUEM      │
 * │    ESCREVE, e o ciclo é o mesmo código para qualquer fonte, então ele não sabe por qual      │
 * │    adaptador está ligado. Quem carimba é o repositório, e por isso quem confere é este       │
 * │    arquivo. Apagado o literal, 137 mil linhas passam a jurar que foram cadastradas à mão     │
 * │    (`MANUAL` é o default da coluna) e NADA fica vermelho no contrato do ciclo.               │
 * │ 2. A COMPARAÇÃO CAMPO A CAMPO ESTÁ NO SQL, e não num `if` do TypeScript. O contrato do ciclo │
 * │    media o EFEITO (zero linha afetada na reentrega idêntica), que um `if` também produz; o   │
 * │    `if` perde a corrida entre dois ciclos, e o `where ... is distinct from` não.             │
 * │ 3. A GUARDA `anonimizado_em is null`. Sem ela, o desempate por CPF RE-IDENTIFICA de 30 em 30 │
 * │    minutos quem o expurgo acabou de anonimizar, e a varredura de retenção nunca mais volta a │
 * │    uma linha carimbada para consertar.                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E UMA QUE NÃO É DE TEXTO, E É A MAIS PERIGOSA: AS DUAS CAUSAS DE "ZERO LINHA" ─────────────┐
 * │ `update` que não devolve linha quer dizer DUAS coisas opostas: reentrega idêntica (o normal, │
 * │ e o que a trava do DIARIO exige) ou ficha ANONIMIZADA (recusa). Tratá-las igual faz a recusa │
 * │ PASSAR POR SUCESSO, que é o modo de falha da §A.33: nada falha, e a candidatura nova fica    │
 * │ pendurada numa ficha expurgada. Esta metade é medida por COMPORTAMENTO, com o repositório    │
 * │ real e um banco que responde as duas situações.                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de dado real. O que se lê é o TEXTO de uma instrução, com os valores já reduzidos a
 * `$1`, `$2` pelo driver, e as linhas sintéticas não têm dono.
 */

// ── 1. CAPTURAR A INSTRUÇÃO QUE O REPOSITÓRIO MANDARIA AO POSTGRES ─────────────────────────────

export interface RespostaFingida {
  /** Responde por SENTIDO (um trecho do texto da consulta), nunca pela ordem das chamadas. */
  quando: RegExp;
  devolve: unknown[];
}

export interface BancoFingido {
  db: never;
  consultas: string[];
}

/**
 * Um banco que ANOTA a instrução e responde por sentido.
 *
 * O despacho é por CONTEÚDO e não por ordem de chamada de propósito: o repositório pode passar a
 * fazer uma leitura a mais amanhã, e um fake que respondesse "a primeira chamada devolve isto"
 * entregaria a resposta do `update` para a sondagem da anonimização, deixando o teste verde com o
 * defeito aberto.
 */
export function bancoFingido(respostas: RespostaFingida[]): BancoFingido {
  const consultas: string[] = [];
  const db = {
    execute: (q: unknown) => {
      const texto = sqlExecutavel(q);
      consultas.push(texto);
      const r = respostas.find((x) => x.quando.test(texto.toLowerCase()));
      return Promise.resolve(r ? r.devolve : []);
    },
  };
  return { db: db as never, consultas };
}

/** A instrução capturada que casa com o padrão dado, em caixa baixa. */
export function consultaQueCasa(consultas: string[], padrao: RegExp): string | null {
  return consultas.map((c) => c.toLowerCase()).find((c) => padrao.test(c)) ?? null;
}

// ── 2. LER A FORMA DA INSTRUÇÃO, POR SENTIDO ───────────────────────────────────────────────────

/** Parte uma lista por vírgula de PROFUNDIDADE ZERO, respeitando parênteses e aspas. */
function partirPorVirgula(lista: string): string[] {
  const partes: string[] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;
  for (const c of lista) {
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (c === "," && profundidade === 0) {
        partes.push(atual.trim());
        atual = "";
        continue;
      }
    }
    atual += c;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

/** As colunas nomeadas no `insert into <tabela> (...)`. Nulo quer dizer que não há insert. */
export function colunasDoInsert(sqlTexto: string, tabela: string): string[] | null {
  const m = new RegExp(`insert\\s+into\\s+${tabela}\\s*\\(([^)]*)\\)`).exec(sqlTexto.toLowerCase());
  return m ? partirPorVirgula(m[1]).map((c) => c.trim()) : null;
}

/** Os valores do `values (...)` do insert, na mesma ordem das colunas. */
export function valoresDoInsert(sqlTexto: string): string[] {
  const m = /values\s*\(([\s\S]*?)\)\s*(returning|on\s+conflict|$)/.exec(sqlTexto.toLowerCase());
  return m ? partirPorVirgula(m[1]) : [];
}

/** O valor que o insert grava numa coluna, casando coluna com valor pela POSIÇÃO. */
export function valorGravadoNoInsert(
  sqlTexto: string,
  tabela: string,
  coluna: string,
): string | null {
  const colunas = colunasDoInsert(sqlTexto, tabela);
  if (!colunas) return null;
  const i = colunas.indexOf(coluna);
  if (i < 0) return null;
  const valores = valoresDoInsert(sqlTexto);
  return valores[i] ?? null;
}

/** As colunas que o `set` do update escreve. */
export function colunasDoSet(sqlTexto: string): string[] {
  return partirPorVirgula(setDaEscrita(sqlTexto.toLowerCase()))
    .map((p) => p.split("=")[0].trim())
    .filter((c) => c !== "");
}

/** A tupla comparada por `is distinct from`, que é a condição do upsert condicional. */
export function tuplaComparada(sqlTexto: string): string[] | null {
  const m = /\(([^()]*)\)\s*is\s+distinct\s+from/.exec(sqlTexto.toLowerCase());
  return m ? partirPorVirgula(m[1]).map((c) => c.trim()) : null;
}

// ── 3. O CONTRATO DO REPOSITÓRIO, EM REGRAS NOMEADAS ───────────────────────────────────────────

/** A ORIGEM esperada da ingestão do Pandapé, como literal no SQL. */
export const ORIGEM_ESPERADA = "PANDAPE";

export function violacoesDoRepositorioDeCandidato(sqlInsert: string, sqlUpdate: string): string[] {
  const v: string[] = [];
  const ins = sqlInsert.toLowerCase();
  const upd = sqlUpdate.toLowerCase();

  // ── O CARIMBO DE ORIGEM ─────────────────────────────────────────────────
  const colunas = colunasDoInsert(ins, "as_candidatos");
  if (!colunas) {
    v.push(
      "SEM_INSERT_NOMINAL: não há `insert into as_candidatos (...)` com lista nominal de colunas. É o espalhamento do objeto voltando, e é ele que mantém `banco_talentos` fora do alcance da ingestão: a proibição do schema só é executável enquanto a coluna não é citada.",
    );
    return v;
  }
  if (!colunas.includes("origem")) {
    v.push(
      "ORIGEM_NAO_CARIMBADA: o insert do candidato não lista `origem`. A coluna tem `MANUAL` por default, então 137 mil cadastros passam a JURAR que foram feitos à mão, e a pergunta `de onde veio esta pessoa` fica com a resposta errada para a maioria da base. Nada falha, nada fica vermelho no contrato do ciclo, e o erro só aparece no dia em que alguém for auditar a origem.",
    );
  } else {
    const valor = (valorGravadoNoInsert(ins, "as_candidatos", "origem") ?? "").replace(/'/g, "");
    if (valor !== ORIGEM_ESPERADA.toLowerCase()) {
      v.push(
        `ORIGEM_FORA_DO_VOCABULARIO: o insert grava \`${valor || "(parâmetro)"}\` em \`origem\`, e não o literal \`${ORIGEM_ESPERADA}\`. A origem é a ASSINATURA DE QUEM ESCREVE e não dado que veio no item: ela é uma constante do adaptador, e vir de parâmetro significaria que alguém, em algum lugar, pode passar outra coisa. As fontes conhecidas são ${FONTES_EXTERNAS.join(", ")}.`,
      );
    }
  }

  // ── E O AVESSO DELA, QUE É TÃO IMPORTANTE QUANTO ────────────────────────
  if (colunasDoSet(upd).includes("origem")) {
    v.push(
      "ORIGEM_REESCRITA_NA_ATUALIZACAO: o update do candidato escreve `origem`. Quem foi cadastrado À MÃO e depois apareceu no ATS continua sendo um cadastro manual: reescrever a origem apaga o fato, e o apaga de 30 em 30 minutos, em silêncio, para toda pessoa que a varredura reencontrar.",
    );
  }

  // ── A COMPARAÇÃO CAMPO A CAMPO, NO SQL ──────────────────────────────────
  const tupla = tuplaComparada(upd);
  const escritas = colunasDoSet(upd);
  if (!tupla) {
    v.push(
      "COMPARACAO_FORA_DO_SQL: o update do candidato não tem `is distinct from`. A trava do DIARIO exige que a condição viva no SQL: um `if` em TypeScript resolve o caso comum e PERDE A CORRIDA entre dois ciclos, e o preço do empate é o relógio do expurgo andando 48 vezes por dia, para sempre, para quem não tem candidatura.",
    );
  } else {
    const faltando = escritas.filter((c) => !tupla.includes(c));
    if (faltando.length > 0) {
      v.push(
        `COMPARACAO_INCOMPLETA: o update escreve ${escritas.join(", ")} e só compara ${tupla.join(", ")}. As colunas de fora (${faltando.join(", ")}) fazem a instrução afetar linha sem que aquele campo tenha mudado, e basta UMA para a reentrega idêntica voltar a escrever.`,
      );
    }
  }

  // ── A GUARDA DA ANONIMIZAÇÃO ────────────────────────────────────────────
  if (!/anonimizado_em\s+is\s+null/.test(whereDaEscrita(upd))) {
    v.push(
      "GUARDA_DA_ANONIMIZACAO_AUSENTE: o update do candidato não exige `anonimizado_em is null`. Sem ela, a ingestão RE-IDENTIFICA de 30 em 30 minutos quem o expurgo acabou de anonimizar, gravando nome, CPF, e-mail e telefone de volta numa ficha que a LGPD mandou apagar. A varredura de retenção nunca mais volta a uma linha carimbada para consertar.",
    );
  }

  // ── OS CARIMBOS, DE NOVO, AGORA NO TEXTO ────────────────────────────────
  for (const coluna of ["criado_em", "atualizado_em"]) {
    if (colunas.includes(coluna) || escritas.includes(coluna)) {
      v.push(
        `CARIMBO_CITADO_NO_SQL: a instrução cita \`${coluna}\`. As duas colunas têm default e não têm \`$onUpdate\`: basta não citá-las. Citar é escolher empurrar o relógio do expurgo, ou fazer a pessoa nascer com o prazo já vencido.`,
      );
    }
  }
  if (colunas.includes("banco_talentos") || escritas.includes("banco_talentos")) {
    v.push(
      "BANCO_TALENTOS_NO_SQL: a instrução cita `banco_talentos`. O único escritor daquela coluna é `aplicarRetencao`, com cadeado de SUPER_ADMIN, e a ingestão insere SEM usuário autor: marcar aqui concede retenção estendida a 137 mil pessoas sem ninguém decidir isso.",
    );
  }
  return v;
}

// ── 4. AS DUAS CAUSAS DE "ZERO LINHA", MEDIDAS POR COMPORTAMENTO ───────────────────────────────

export interface EscritorDeCandidato {
  escrever(e: Escrita): Promise<{ linhasAfetadas: number; id: string }>;
}

const ESCRITA_DE_TESTE: Escrita = {
  tabela: "as_candidatos",
  acao: "update",
  onde: { id: "00000000-0000-4000-8000-000000000001" },
  comparaAntes: ["nome", "cpf", "email", "telefone", "data_nascimento"],
  valores: {
    nome: "Pessoa Sintetica De Teste",
    cpf: null,
    email: null,
    telefone: null,
    data_nascimento: null,
  },
};

/**
 * Roda a escrita nas duas situações que o Postgres responde IGUAL e que significam o OPOSTO.
 *
 * A ficha anonimizada tem de LANÇAR, e a reentrega idêntica tem de devolver zero em paz. Um
 * repositório que trate as duas do mesmo jeito fica verde em qualquer teste que só olhe o número.
 */
export async function violacoesDaDistincaoDeZeroLinha(
  criar: (db: never) => EscritorDeCandidato,
): Promise<string[]> {
  const v: string[] = [];

  const reentrega = bancoFingido([]);
  let recusouReentrega = false;
  let linhas = -1;
  try {
    linhas = (await criar(reentrega.db).escrever(ESCRITA_DE_TESTE)).linhasAfetadas;
  } catch {
    recusouReentrega = true;
  }
  if (recusouReentrega) {
    v.push(
      "REENTREGA_IDENTICA_LANCA: a reentrega que não muda nada foi tratada como erro. Ela é o REGIME da varredura, não a exceção: a volta passa de 30 em 30 minutos sobre as mesmas 137 mil inscrições, e transformar o caso normal em exceção enche o log de falha e derruba a ingestão de quem não mudou.",
    );
  } else if (linhas !== 0) {
    v.push(
      `REENTREGA_IDENTICA_NAO_DEVOLVE_ZERO: a reentrega idêntica devolveu ${linhas} linha(s) afetada(s). É por esse número que a trava do DIARIO é medida do lado do ciclo, e um número inflado aqui esconde a escrita que não deveria ter acontecido.`,
    );
  }

  const anonimizada = bancoFingido([{ quando: /select\s+1\s+as\s+marca/, devolve: [{ marca: 1 }] }]);
  let recusouAnonimizada = false;
  try {
    await criar(anonimizada.db).escrever(ESCRITA_DE_TESTE);
  } catch {
    recusouAnonimizada = true;
  }
  if (!recusouAnonimizada) {
    v.push(
      "ANONIMIZADA_PASSA_POR_SUCESSO: a ficha ANONIMIZADA recebeu o mesmo tratamento da reentrega idêntica, e a escrita seguiu como se tivesse dado certo. É o modo de falha da §A.33 na letra: nada falha do ponto de vista do serviço, a candidatura nova fica pendurada numa ficha expurgada, e ninguém audita de novo uma linha que já consta como anonimizada. Zero linha tem DUAS causas, e distingui-las custa uma leitura.",
    );
  }
  return v;
}

// ── 5. A REFERÊNCIA E OS MUTANTES ──────────────────────────────────────────────────────────────

/**
 * A referência NÃO é a implementação esperada: é um texto SABIDAMENTE CORRETO para o contrato
 * aprovar, e a base de onde os mutantes saem. Sem ela, "meu contrato pega o defeito?" seria opinião.
 */
export const SQL_INSERT_REFERENCIA =
  "insert into as_candidatos (nome, cpf, email, telefone, data_nascimento, origem) " +
  "values ($1, $2, $3, $4, $5, 'PANDAPE') returning id";

export const SQL_UPDATE_REFERENCIA =
  "update as_candidatos set nome = $1, cpf = $2, email = $3, telefone = $4, data_nascimento = $5 " +
  "where id = $6::uuid and anonimizado_em is null " +
  "and (nome, cpf, email, telefone, data_nascimento) is distinct from ($1, $2, $3, $4, $5::date) " +
  "returning id";

export interface MutanteDoRepositorio {
  nome: string;
  dano: string;
  insert: string;
  update: string;
  regraEsperada: string;
}

function trocarNoInsert(de: string, para: string): string {
  if (!SQL_INSERT_REFERENCIA.includes(de)) throw new Error(`Mutante impossível: "${de}"`);
  return SQL_INSERT_REFERENCIA.replace(de, para);
}

function trocarNoUpdate(de: string, para: string): string {
  if (!SQL_UPDATE_REFERENCIA.includes(de)) throw new Error(`Mutante impossível: "${de}"`);
  return SQL_UPDATE_REFERENCIA.replace(de, para);
}

export const MUTANTES_DO_REPOSITORIO: MutanteDoRepositorio[] = [
  {
    nome: "1. o carimbo de origem some do insert",
    dano: "É O MAIS FÁCIL DE REINTRODUZIR: uma coluna a menos numa lista, numa refatoração. `MANUAL` é o default, então 137 mil linhas passam a jurar que foram cadastradas à mão, e nada fica vermelho no contrato do ciclo, porque `origem` não é dado do item e o ciclo nem a menciona.",
    insert: trocarNoInsert(
      "(nome, cpf, email, telefone, data_nascimento, origem) values ($1, $2, $3, $4, $5, 'PANDAPE')",
      "(nome, cpf, email, telefone, data_nascimento) values ($1, $2, $3, $4, $5)",
    ),
    update: SQL_UPDATE_REFERENCIA,
    regraEsperada: "ORIGEM_NAO_CARIMBADA",
  },
  {
    nome: "2. a origem vira parâmetro em vez de constante do adaptador",
    dano: "origem que vem de fora significa que alguém, em algum lugar, pode passar outra coisa. Ela é a assinatura de quem escreve, e assinatura que se recebe de terceiro não assina nada.",
    insert: trocarNoInsert("'PANDAPE'", "$6"),
    update: SQL_UPDATE_REFERENCIA,
    regraEsperada: "ORIGEM_FORA_DO_VOCABULARIO",
  },
  {
    nome: "3. a atualização passa a reescrever a origem",
    dano: "quem foi cadastrado à mão e depois apareceu no ATS vira, silenciosamente, um cadastro do ATS. O fato é apagado de 30 em 30 minutos, para toda pessoa que a varredura reencontrar.",
    insert: SQL_INSERT_REFERENCIA,
    update: trocarNoUpdate("set nome = $1", "set origem = 'PANDAPE', nome = $1"),
    regraEsperada: "ORIGEM_REESCRITA_NA_ATUALIZACAO",
  },
  {
    nome: "4. o `is distinct from` some, e a condição migra para um `if` do TypeScript",
    dano: "o `if` resolve o caso comum e PERDE A CORRIDA entre dois ciclos: dois trabalhadores lendo a mesma ficha no mesmo instante decidem os dois que nada mudou, ou os dois que mudou. O preço do empate é o relógio do expurgo andando 48 vezes por dia.",
    insert: SQL_INSERT_REFERENCIA,
    update: trocarNoUpdate(
      " and (nome, cpf, email, telefone, data_nascimento) is distinct from ($1, $2, $3, $4, $5::date)",
      "",
    ),
    regraEsperada: "COMPARACAO_FORA_DO_SQL",
  },
  {
    nome: "5. a comparação deixa o telefone de fora",
    dano: "basta UMA coluna fora da tupla para a reentrega idêntica voltar a escrever, e o defeito é invisível: a instrução continua tendo `is distinct from`, e quem lê por cima vê a trava no lugar.",
    insert: SQL_INSERT_REFERENCIA,
    update: trocarNoUpdate(
      "(nome, cpf, email, telefone, data_nascimento) is distinct from",
      "(nome, cpf, email, data_nascimento) is distinct from",
    ),
    regraEsperada: "COMPARACAO_INCOMPLETA",
  },
  {
    nome: "6. a guarda da anonimização some do update",
    dano: "a ingestão RE-IDENTIFICA de 30 em 30 minutos quem o expurgo acabou de anonimizar, gravando nome, CPF, e-mail e telefone de volta numa ficha que a LGPD mandou apagar.",
    insert: SQL_INSERT_REFERENCIA,
    update: trocarNoUpdate(" and anonimizado_em is null", ""),
    regraEsperada: "GUARDA_DA_ANONIMIZACAO_AUSENTE",
  },
  {
    nome: "7. o insert cita `criado_em`",
    dano: "a pessoa nasce com a data do ATS e, com ela, com o prazo de 2 anos possivelmente já vencido. A varredura seguinte a anonimiza, e é irreversível.",
    insert: trocarNoInsert(
      "(nome, cpf, email, telefone, data_nascimento, origem) values ($1, $2, $3, $4, $5, 'PANDAPE')",
      "(nome, cpf, email, telefone, data_nascimento, origem, criado_em) values ($1, $2, $3, $4, $5, 'PANDAPE', $6)",
    ),
    update: SQL_UPDATE_REFERENCIA,
    regraEsperada: "CARIMBO_CITADO_NO_SQL",
  },
  {
    nome: "8. o insert cita `banco_talentos`",
    dano: "concede retenção estendida a 137 mil pessoas sem ninguém decidir isso, e o único escritor legítimo daquela coluna tem cadeado de SUPER_ADMIN.",
    insert: trocarNoInsert(
      "(nome, cpf, email, telefone, data_nascimento, origem) values ($1, $2, $3, $4, $5, 'PANDAPE')",
      "(nome, cpf, email, telefone, data_nascimento, origem, banco_talentos) values ($1, $2, $3, $4, $5, 'PANDAPE', true)",
    ),
    update: SQL_UPDATE_REFERENCIA,
    regraEsperada: "BANCO_TALENTOS_NO_SQL",
  },
];

// ── 6. OS DOIS ESCRITORES MUTANTES, para o contrato do "zero linha" ter dentes ─────────────────

/** Trata as duas causas igual: zero linha é sempre sucesso. É a §A.33 na letra. */
export function escritorQueEngoleARecusa(): (db: never) => EscritorDeCandidato {
  return () => ({
    async escrever() {
      return { linhasAfetadas: 0, id: "qualquer" };
    },
  });
}

/** Trata as duas causas igual pelo outro lado: zero linha é sempre erro. */
export function escritorQueRecusaTudo(): (db: never) => EscritorDeCandidato {
  return () => ({
    async escrever(): Promise<{ linhasAfetadas: number; id: string }> {
      throw new Error("zero linha afetada");
    },
  });
}
