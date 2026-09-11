import { sql } from "drizzle-orm";
import { SITUACOES_VIVAS } from "../../domain/candidatura";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA A CORREÇÃO DE LGPD DO EXPURGO (vaga encerrada) ───────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` é deliberado e tem motivo
 * registrado: na onda B1 o agente que construiu escolheu, de boa-fé, o mesmo nome de arquivo que o
 * `tester` havia escolhido, e sobrescreveu o teste em silêncio. Nome que ninguém mais escolheria é
 * a trava mais barata contra isso.
 *
 * ┌─ O QUE ESTE ARQUIVO É, E O QUE ELE NÃO É ───────────────────────────────────────────────────┐
 * │ O filtro inteiro do expurgo mora DENTRO de uma consulta em SQL CRU. Um banco fingido que      │
 * │ devolve linhas prontas passa igual com o filtro certo ou errado, então parte da cobertura     │
 * │ desta frente é, por construção, ASSERÇÃO DE FORMA sobre o texto da consulta.                  │
 * │                                                                                              │
 * │ ASSERÇÃO DE FORMA DÁ FALSO POSITIVO, e já deu nesta fábrica: procurar uma palavra no texto    │
 * │ cru passa mesmo com a cláusula removida, porque o COMENTÁRIO que explica a regra usa as       │
 * │ mesmas palavras da regra. As três defesas contra isso vivem aqui:                             │
 * │   1. os comentários são APAGADOS antes de qualquer leitura (só o SQL executável é olhado);    │
 * │   2. a leitura é por CLÁUSULA, não por substring do texto inteiro: o `where` é partido nos    │
 * │      seus pedaços de topo, e cada afirmação é feita sobre O PEDAÇO CERTO (a proteção não      │
 * │      passa porque a palavra apareceu no relógio, e vice-versa);                               │
 * │   3. o contrato é EXERCITADO CONTRA MUTANTES (`MUTANTES`, abaixo), num spec próprio, então    │
 * │      um contrato frouxo demais fica VERMELHO por si, sem depender de alguém desconfiar.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de dado pessoal entra aqui. O que se lê é o TEXTO de uma consulta, nunca o resultado.
 */

// ── 1. LER A CONSULTA QUE O SERVIÇO MONTOU ──────────────────────────────────

/**
 * Reconstrói o texto da consulta a partir dos pedaços do objeto SQL do drizzle.
 *
 * RECURSIVO de propósito: um `sql.raw(...)` interpolado dentro do template NÃO vira um pedaço de
 * texto, vira outro objeto SQL ANINHADO. Uma leitura rasa devolveria a consulta com um buraco
 * exatamente onde mora a lista de situações, e o teste passaria verde afirmando o contrário do que
 * quer afirmar. É o mesmo helper do `retencao-candidatos.spec.ts`, copiado em vez de importado
 * porque aquele arquivo é um spec e importá-lo registraria os testes dele duas vezes.
 */
export function textoDaConsulta(q: unknown): string {
  const no = q as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(no?.queryChunks)) return no.queryChunks.map(textoDaConsulta).join("");
  if (Array.isArray(no?.value)) return no.value.join("");
  return no?.value !== undefined ? String(no.value) : "";
}

/** Só o SQL que o banco executa: linha de comentário (--) fora, espaços colapsados, caixa baixa. */
export function sqlExecutavel(q: unknown): string {
  return textoDaConsulta(q)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Um serviço com `expurgar()`, que é tudo o que estas funções precisam saber dele. */
export interface ServicoDeExpurgo {
  expurgar(): Promise<number>;
}

/**
 * Roda UMA passada com um banco que só anota a consulta, e devolve o SQL executável.
 *
 * A afirmação de que houve UMA consulta só é parte do contrato: um expurgo partido em "buscar
 * depois atualizar" faria os ids das pessoas a expurgar circularem pela memória do processo, que é
 * exatamente o que o desenho recusa (§A.6).
 */
export async function sqlDaVarredura(
  criar: (db: never) => ServicoDeExpurgo,
): Promise<{ sql: string; quantasConsultas: number }> {
  const consultas: unknown[] = [];
  const db = {
    execute: (q: unknown) => {
      consultas.push(q);
      return Promise.resolve([]);
    },
  } as never;

  await criar(db).expurgar();
  return {
    sql: consultas.length === 1 ? sqlExecutavel(consultas[0]) : "",
    quantasConsultas: consultas.length,
  };
}

// ── 2. PARTIR O `where` NAS CLÁUSULAS DE TOPO ───────────────────────────────

/**
 * ─ POR QUE PARTIR, EM VEZ DE PROCURAR NO TEXTO INTEIRO ─────────────────────────────────────────
 *
 * As duas metades da correção falam das MESMAS palavras: a proteção olha situação e vaga, e o
 * relógio olha situação e vaga. Um `expect(sql).toContain("encerrada_em")` fica verde com o relógio
 * certo E a proteção destruída, e fica verde com a proteção certa E o relógio errado. Quem afirma
 * sobre "o pedaço da proteção" e "o pedaço do relógio" separadamente não tem como se enganar assim.
 *
 * A PARTIÇÃO É CONSCIENTE DE PARÊNTESE E DE ASPAS: um ` and ` dentro de subconsulta não parte nada,
 * senão a própria proteção viraria três pedaços e cada afirmação olharia um caco.
 */
export function clausulasDoWhere(sqlTexto: string): string[] {
  const t = sqlTexto.toLowerCase();
  const inicio = indiceDoWhereDeTopo(t);
  if (inicio < 0) return [];
  const corpo = t.slice(inicio + " where ".length);

  const pedacos: string[] = [];
  let atual = "";
  let profundidade = 0;
  let emAspas = false;

  for (let i = 0; i < corpo.length; i += 1) {
    const c = corpo[i];
    if (c === "'") emAspas = !emAspas;
    if (!emAspas) {
      if (c === "(") profundidade += 1;
      if (c === ")") profundidade -= 1;
      if (profundidade === 0 && corpo.startsWith(" and ", i)) {
        pedacos.push(atual.trim());
        atual = "";
        i += " and ".length - 1;
        continue;
      }
      // `returning` fecha o `where`: o que vem depois não é cláusula de filtro.
      if (profundidade === 0 && corpo.startsWith(" returning ", i)) break;
    }
    atual += c;
  }
  if (atual.trim()) pedacos.push(atual.trim());
  return pedacos;
}

/** O primeiro ` where ` que está FORA de qualquer parêntese: o da consulta, não o das subconsultas. */
function indiceDoWhereDeTopo(t: string): number {
  let profundidade = 0;
  let emAspas = false;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === "'") emAspas = !emAspas;
    if (emAspas) continue;
    if (c === "(") profundidade += 1;
    if (c === ")") profundidade -= 1;
    if (profundidade === 0 && t.startsWith(" where ", i)) return i;
  }
  return -1;
}

/** A cláusula da PROTEÇÃO: o `not exists` que decide quem nunca é alcançado pelo expurgo. */
export function clausulaDaProtecao(sqlTexto: string): string {
  return clausulasDoWhere(sqlTexto).find((c) => c.startsWith("not exists")) ?? "";
}

/**
 * A cláusula do RELÓGIO: a que compara uma data com o prazo de retenção.
 *
 * Procurada pelo `interval`, e não pela posição, porque a ordem das cláusulas é escolha de quem
 * escreve e não é o que o requisito manda.
 */
export function clausulaDoRelogio(sqlTexto: string): string {
  return clausulasDoWhere(sqlTexto).find((c) => c.includes("interval '")) ?? "";
}

/** A cláusula que exige AO MENOS UM processo encerrado (o `exists` simples). */
export function clausulaDoExistePlano(sqlTexto: string): string {
  return (
    clausulasDoWhere(sqlTexto).find((c) => c.startsWith("exists") && !c.includes("interval '")) ?? ""
  );
}

// ── 3. O CONTRATO ───────────────────────────────────────────────────────────

/** A lista de situações vivas, no formato em que ela aparece no SQL, DERIVADA do vocabulário. */
export const LISTA_DAS_VIVAS = SITUACOES_VIVAS.map((s) => `'${s.toLowerCase()}'`).join(", ");

/** Uma condição de "a vaga NÃO terminou", em qualquer das formas que o Postgres aceita. */
function exigeVagaNaoEncerrada(clausula: string): boolean {
  return (
    /encerra\s*(=|is)\s*false/.test(clausula) ||
    /not\s+[a-z_]*\.?encerra\b/.test(clausula) ||
    /encerra\s+is\s+not\s+true/.test(clausula)
  );
}

/**
 * Uma condição de "a vaga TERMINOU", que na PROTEÇÃO é o defeito que apaga gente em processo.
 *
 * O `not <alias>.encerra` É APAGADO ANTES DA LEITURA DO CASO NU, e essa linha nasceu de um vermelho
 * real deste arquivo: sem ela, a forma NEGADA (`not s.encerra`, que é a régua CERTA escrita de outro
 * jeito) era lida como se exigisse vaga encerrada, e o contrato reprovava uma consulta correta. Um
 * teste que morre com estilo mede desenho, e não a propriedade que o diretor pediu.
 */
function exigeVagaEncerrada(clausula: string): boolean {
  if (/encerra\s*(=|is)\s*true/.test(clausula)) return true;
  const semNegacao = clausula.replace(/not\s+[a-z_]*\.?encerra\b/g, " ");
  return /\b[a-z_]*\.?encerra\b(?!\s*(=|is))/.test(semNegacao);
}

/**
 * ─ O CONTRATO DA CORREÇÃO, EM REGRAS NOMEADAS ──────────────────────────────────────────────────
 *
 * Devolve a lista das VIOLAÇÕES. Vazia é o contrato cumprido. Cada regra é nomeada para o vermelho
 * dizer QUAL propriedade caiu, e não só "o SQL mudou".
 *
 * O QUE CADA REGRA PROTEGE está dito na string dela, porque é ela que o autor vai ler quando o
 * teste ficar vermelho, e não este comentário.
 */
export function violacoesDoContrato(sqlTexto: string): string[] {
  const v: string[] = [];
  const t = sqlTexto.toLowerCase();
  const protecao = clausulaDaProtecao(t);
  const relogio = clausulaDoRelogio(t);

  // ── A PROTEÇÃO ────────────────────────────────────────────────────────────
  if (!protecao) {
    v.push("PROTECAO_AUSENTE: não há cláusula `not exists` de topo. Sem ela o expurgo alcança quem está em processo.");
    return v;
  }
  if (!protecao.includes("as_vaga_status")) {
    v.push(
      "PROTECAO_SEM_CATALOGO: a proteção não faz join com `as_vaga_status`. Sem o catálogo não há como saber se a vaga ENCERROU, e a régua volta a ser a antiga.",
    );
  }
  if (!/\bencerra\b/.test(protecao)) {
    v.push(
      "PROTECAO_SEM_FLAG_ENCERRA: a proteção não lê o flag `encerra`. Quem fica vivo em vaga encerrada nunca começa a contar prazo, e o dado pessoal fica retido para sempre.",
    );
  }
  if (protecao.includes("recebe_candidato")) {
    v.push(
      "PROTECAO_LE_RECEBE_CANDIDATO: a proteção lê `recebe_candidato`, que é OUTRA pergunta. Status LIVRE do tipo Stand By tem `recebe_candidato = false` e `encerra = false`: vaga PAUSADA não é vaga TERMINADA, e ler o flag errado torna expurgável todo mundo numa vaga pausada.",
    );
  }
  if (!exigeVagaNaoEncerrada(protecao) || exigeVagaEncerrada(protecao)) {
    v.push(
      "PROTECAO_OLHA_A_VAGA_ERRADA: a proteção tem de exigir vaga NÃO encerrada. Exigindo vaga encerrada (ou não exigindo nada), quem está APROVADO numa vaga cancelada e ATIVO numa vaga aberta deixa de ser protegido, e o expurgo apaga alguém EM PROCESSO.",
    );
  }
  if (!/candidato_id\s*=\s*c\.id/.test(protecao)) {
    v.push(
      "PROTECAO_SEM_CORRELACAO: a proteção não se correlaciona com o candidato da linha (`k.candidato_id = c.id`). O alcance da proteção é a PESSOA, entre vagas, e nunca uma vaga só.",
    );
  }
  if (/\blimit\b/.test(protecao) || /\border\s+by\b/.test(protecao)) {
    v.push(
      "PROTECAO_OLHA_UMA_CANDIDATURA_SO: a proteção ordena ou limita. Ela tem de olhar TODAS as candidaturas da pessoa; olhando só a última, quem tem processo vivo em outra vaga é apagado.",
    );
  }
  if (!protecao.includes(LISTA_DAS_VIVAS)) {
    v.push(
      `PROTECAO_SEM_LISTA_DERIVADA: a proteção não usa a lista derivada de SITUACOES_VIVAS (${LISTA_DAS_VIVAS}). Lista digitada à mão concorda com o vocabulário por coincidência, e para de concordar no dia em que uma situação nova nascer.`,
    );
  }

  // ── O RELÓGIO ─────────────────────────────────────────────────────────────
  if (!relogio) {
    v.push("RELOGIO_AUSENTE: não há cláusula com `interval`. Sem prazo, o expurgo é imediato.");
    return v;
  }
  if (!relogio.includes("encerrada_em")) {
    v.push(
      "RELOGIO_SEM_ENCERRAMENTO_DA_VAGA: o relógio não lê `vagas.encerrada_em`. Quem foi aprovado em 03/2024 numa vaga cancelada HOJE fica elegível NA HORA, retroativamente, e a varredura de 1h o anonimiza sem nenhuma carência. É irreversível.",
    );
  }
  if (relogio.includes("data_fechamento")) {
    v.push(
      "RELOGIO_LE_DATA_FECHAMENTO: o relógio lê `data_fechamento`, que vem do CORPO da requisição, é `@IsISO8601()` sem piso e pode ser anterior ao clique. Um COMUM cancelando com data de 2019 vira gatilho remoto de exclusão.",
    );
  }
  if (!relogio.includes("atualizado_em")) {
    v.push(
      "RELOGIO_SEM_SAIDA_SEM_EXITO: o relógio não lê `k.atualizado_em`. Quem foi DESCARTADO continua contando prazo do próprio descarte; trocar isso pelo encerramento da vaga muda o prazo de todo mundo que já saiu.",
    );
  }
  if (!/\bmax\s*\(/.test(relogio)) {
    v.push(
      "RELOGIO_SEM_MAX: o relógio tem de correr do encerramento MAIS RECENTE. Com `min`, quem foi visto pelo time no mês passado é apagado por causa de um processo de três anos atrás.",
    );
  }

  // ── O RESTO DA REGRA, QUE A CORREÇÃO NÃO PODE ATROPELAR ───────────────────
  if (!t.includes("c.origem <> 'banco_talentos'")) {
    v.push("REGRESSAO_BANCO_DE_TALENTOS: candidato de banco não expira (decisão do diretor).");
  }
  if (!t.includes("interval '2 years'")) {
    v.push("REGRESSAO_PRAZO: o prazo do diretor é de 2 anos.");
  }
  if (!clausulaDoExistePlano(t)) {
    v.push(
      "REGRESSAO_SEM_PROCESSO_NAO_CONTA: sumiu a exigência de haver ao menos uma candidatura. Sem processo encerrado não há prazo a contar, e quem nunca se candidatou não pode ser alcançado.",
    );
  }
  return v;
}

// ── 4. A REFERÊNCIA E OS MUTANTES ───────────────────────────────────────────

/**
 * UMA implementação que cumpre o requisito, escrita AQUI e não em produção.
 *
 * ELA NÃO É A IMPLEMENTAÇÃO ESPERADA, e este ponto é importante: o requisito nomeia a propriedade,
 * não o desenho, e quem constrói pode escrever outra consulta que cumpra tudo. Esta existe por um
 * motivo só: dar ao contrato acima um texto SABIDAMENTE CORRETO para ele aprovar, e uma base de
 * onde derivar os mutantes que ele tem de reprovar. Sem isso, "meu teste pega o defeito?" seria
 * opinião.
 */
export const SQL_REFERENCIA = sqlExecutavel(sql`
  update as_candidatos c
     set nome = 'Candidato Expurgado',
         cpf = null,
         email = null,
         telefone = null,
         data_nascimento = null,
         id_candidate_pandape = null,
         anonimizado_em = now(),
         atualizado_em = now()
   where c.anonimizado_em is null
     and c.origem <> 'BANCO_TALENTOS'
     and exists (select 1 from as_candidaturas k where k.candidato_id = c.id)
     and not exists (
           select 1
             from as_candidaturas k
             join vagas v on v.id = k.vaga_id
             join as_vaga_status s on s.codigo = v.status
            where k.candidato_id = c.id
              and k.situacao in (${sql.raw(SITUACOES_VIVAS.map((s) => `'${s}'`).join(", "))})
              and s.encerra = false)
     and (select max(case
                       when k.situacao in (${sql.raw(SITUACOES_VIVAS.map((s) => `'${s}'`).join(", "))})
                       then coalesce(v.encerrada_em, now())
                       else k.atualizado_em
                     end)
            from as_candidaturas k
            join vagas v on v.id = k.vaga_id
           where k.candidato_id = c.id)
         <= now() - interval '2 years'
  returning c.id
`);

/** Um mutante: o que foi quebrado, o texto quebrado e a regra que TEM de acusar. */
export interface Mutante {
  nome: string;
  /** O dano que ele causaria em produção, para o spec não virar uma lista de trocas de string. */
  dano: string;
  sql: string;
  regraEsperada: string;
}

function trocar(de: string, para: string): string {
  const alvo = SQL_REFERENCIA.toLowerCase();
  const i = alvo.indexOf(de.toLowerCase());
  if (i < 0) throw new Error(`Mutante impossível: "${de}" não está na referência.`);
  return SQL_REFERENCIA.slice(0, i) + para + SQL_REFERENCIA.slice(i + de.length);
}

const VIVAS_NO_SQL = SITUACOES_VIVAS.map((s) => `'${s}'`).join(", ");
const PROTECAO_REFERENCIA =
  `not exists ( select 1 from as_candidaturas k join vagas v on v.id = k.vaga_id ` +
  `join as_vaga_status s on s.codigo = v.status where k.candidato_id = c.id ` +
  `and k.situacao in (${VIVAS_NO_SQL}) and s.encerra = false)`;
const RELOGIO_REFERENCIA =
  `(select max(case when k.situacao in (${VIVAS_NO_SQL}) then coalesce(v.encerrada_em, now()) ` +
  `else k.atualizado_em end) from as_candidaturas k join vagas v on v.id = k.vaga_id ` +
  `where k.candidato_id = c.id)`;

export const MUTANTES: Mutante[] = [
  {
    nome: "1. o relógio volta a ser só `k.atualizado_em`",
    dano: "aprovado em 2024 numa vaga cancelada hoje fica elegível na hora, sem carência, e a próxima varredura o apaga.",
    sql: trocar(
      RELOGIO_REFERENCIA,
      "(select max(k.atualizado_em) from as_candidaturas k where k.candidato_id = c.id)",
    ),
    regraEsperada: "RELOGIO_SEM_ENCERRAMENTO_DA_VAGA",
  },
  {
    nome: "2. o join lê `recebe_candidato` em vez de `encerra`",
    dano: "vaga PAUSADA (status LIVRE, Stand By) passa a contar como terminada, e todo mundo dentro dela vira expurgável.",
    sql: trocar("s.encerra = false", "s.recebe_candidato = true"),
    regraEsperada: "PROTECAO_LE_RECEBE_CANDIDATO",
  },
  {
    nome: "3. a cláusula protetora perde a condição da vaga",
    dano: "volta o buraco original: quem fica vivo em vaga encerrada nunca começa a contar prazo e retém CPF para sempre.",
    sql: trocar(
      PROTECAO_REFERENCIA,
      `not exists ( select 1 from as_candidaturas k where k.candidato_id = c.id and k.situacao in (${VIVAS_NO_SQL}))`,
    ),
    regraEsperada: "PROTECAO_SEM_CATALOGO",
  },
  {
    nome: "5. o relógio lê `data_fechamento` (o campo do corpo)",
    dano: "um COMUM cancelando com data de 2019 dispara a exclusão de quem estava naquela vaga.",
    sql: trocar("coalesce(v.encerrada_em, now())", "v.data_fechamento"),
    regraEsperada: "RELOGIO_LE_DATA_FECHAMENTO",
  },
  {
    nome: "6a. a proteção passa a olhar SÓ a candidatura da vaga encerrada",
    dano: "APROVADO em vaga cancelada e ATIVO em vaga aberta deixa de ser protegido: apaga alguém em processo.",
    sql: trocar("s.encerra = false)", "s.encerra = true)"),
    regraEsperada: "PROTECAO_OLHA_A_VAGA_ERRADA",
  },
  {
    nome: "6b. a proteção passa a olhar só a ÚLTIMA candidatura da pessoa",
    dano: "quem tem processo vivo numa vaga aberta, mas cuja última candidatura é de vaga encerrada, é apagado.",
    sql: trocar(
      PROTECAO_REFERENCIA,
      `not exists ( select 1 from as_candidaturas k join vagas v on v.id = k.vaga_id ` +
        `join as_vaga_status s on s.codigo = v.status where k.candidato_id = c.id ` +
        `and k.id = (select k2.id from as_candidaturas k2 where k2.candidato_id = c.id order by k2.atualizado_em desc limit 1) ` +
        `and k.situacao in (${VIVAS_NO_SQL}) and s.encerra = false)`,
    ),
    regraEsperada: "PROTECAO_OLHA_UMA_CANDIDATURA_SO",
  },
  {
    nome: "7. o relógio corre do encerramento MAIS ANTIGO (`min`)",
    dano: "quem o time viu no mês passado é apagado por causa de um processo de três anos atrás.",
    sql: trocar("max(case", "min(case"),
    regraEsperada: "RELOGIO_SEM_MAX",
  },
];
