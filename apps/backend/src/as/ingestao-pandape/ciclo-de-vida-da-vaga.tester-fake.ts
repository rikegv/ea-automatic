import { ctesDaConsulta } from "../candidatos/retencao-sem-candidatura.tester-fake";
import {
  alcanceDaEscrita,
  cteQueEscreveEm,
  setDaEscrita,
  whereDaEscrita,
} from "../candidatos/retencao-texto-livre.tester-fake";
import { bancoFingido, consultaQueCasa } from "./ingestao-repositorio.tester-fake";
import type { Escrita } from "./ingestao-portas";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA O CICLO DE VIDA DA VAGA ESPELHADA ───────────────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. Terceiro contrato da frente, e ele existe por um motivo que
 * merece ficar escrito: **a área que eu declarei NÃO ter coberto foi a área em que o `seguranca`
 * achou o defeito.** Cobertura declarada como ausente não é cobertura, é uma nota de rodapé.
 *
 * ┌─ O DEFEITO, medido pelo `seguranca` contra o banco ─────────────────────────────────────────┐
 * │ Espelhar ciclo de vida tem DUAS direções, e só o encerramento ganhou fronteira. A REABERTURA  │
 * │ não filtra por `as_varredura_vagas`: qualquer vaga no papel FECHAMENTO volta a ABERTA, com    │
 * │ `encerrada_em = null` e os campos digitados sobrescritos pelo ATS. Medido: vaga da trilha,    │
 * │ fechada por gente, com candidatura viva dentro, foi reaberta.                                 │
 * │                                                                                               │
 * │ O DANO NÃO É A VAGA, É O EXPURGO. A cláusula `... or v.encerrada_em is null` protege todo     │
 * │ mundo dentro de uma vaga não encerrada, então zerar aquele carimbo dá PROTEÇÃO ETERNA a quem  │
 * │ está lá dentro, com CPF, e-mail, telefone e nascimento retidos. E a varredura repete o gesto  │
 * │ a cada 30 minutos, sem nada falhar e sem tela nenhuma acusar.                                 │
 * │                                                                                               │
 * │ E A FRONTEIRA DO ENCERRAMENTO NÃO SEPARAVA NADA, porque `escreverMarca` MATRICULA em          │
 * │ `as_varredura_vagas` qualquer vaga varrida: a vaga digitada por gente era adotada na primeira │
 * │ passada e encerrada depois, pelo `exists` que deveria protegê-la.                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A MEDIÇÃO ACEITA AS DUAS FORMAS DA FRONTEIRA ──────────────────────────────────────┐
 * │ A fronteira pode viver no SQL (`and exists (select 1 from as_varredura_vagas ...)`) ou numa   │
 * │ leitura anterior que decide em TypeScript. As duas cumprem o requisito, e um contrato que     │
 * │ exigisse uma delas reprovaria implementação correta. Então o que se mede é o EFEITO: dito ao  │
 * │ repositório que a vaga NÃO é da varredura, a instrução que ele emite não pode reabrir, não    │
 * │ pode zerar `encerrada_em` e não pode sobrescrever o que gente digitou. Emitir um `update` com │
 * │ a fronteira DENTRO dele também passa, porque ali quem separa é o banco.                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: sem dado pessoal. Aqui só há id de vaga, código de status e data, e os valores são
 * sintéticos e reconhecíveis de propósito.
 */

// ── 1. O CATÁLOGO DE STATUS FINGIDO ────────────────────────────────────────────────────────────

/** Códigos sintéticos, feios de propósito: eles são PROCURADOS no texto da instrução. */
export const CODIGO = {
  rascunho: "codigo-sintetico-rascunho",
  abertura: "codigo-sintetico-abertura",
  fechamento: "codigo-sintetico-fechamento",
  entrega: "codigo-sintetico-entrega",
} as const;

export interface CatalogoFingido {
  servico: never;
  papeisPedidos: string[];
}

/**
 * O catálogo que ANOTA qual papel foi pedido.
 *
 * É assim que "FECHAMENTO e não ENTREGA" é medido sem ler texto: os dois `encerra`, e escolher
 * ENTREGA faria a vaga espelhada herdar a exceção que o expurgo dá a quem foi contratado, deixando
 * o furo aberto com outro nome.
 */
export function catalogoFingido(): CatalogoFingido {
  const papeisPedidos: string[] = [];
  const regua = {
    codigoDoPapel: (papel: string): string => {
      papeisPedidos.push(papel);
      return (CODIGO as Record<string, string>)[papel.toLowerCase()] ?? `codigo-sintetico-${papel}`;
    },
    ehDoPapel: (codigo: string, papel: string): boolean =>
      codigo === ((CODIGO as Record<string, string>)[papel.toLowerCase()] ?? null),
  };
  const servico = {
    regua: () => Promise.resolve(regua),
    codigoDoPapel: (papel: string) => Promise.resolve(regua.codigoDoPapel(papel)),
  };
  return { servico: servico as never, papeisPedidos };
}

// ── 2. AS ESCRITAS SINTÉTICAS ──────────────────────────────────────────────────────────────────

export const ID_VACANCY = 9001;

export const ESCRITA_DA_VAGA: Escrita = {
  tabela: "vagas",
  acao: "upsert",
  chaveDeConflito: ["id_vacancy_pandape"],
  comparaAntes: ["codigo", "nome_divulgacao", "cidade_id", "posicoes_oficiais"],
  valores: {
    id_vacancy_pandape: ID_VACANCY,
    codigo: "codigo-que-veio-do-ats",
    nome_divulgacao: "titulo-que-veio-do-ats",
    cidade_id: "Cidade Sintetica - SP",
    posicoes_oficiais: 2,
    cod_cliente: null,
    cargo_id: null,
    status: "RASCUNHO",
  },
};

export const ESCRITA_DA_MARCA: Escrita = {
  tabela: "as_varredura_vagas",
  acao: "upsert",
  chaveDeConflito: ["id_vacancy_pandape"],
  comparaAntes: ["ultimo_insert_date"],
  valores: { id_vacancy_pandape: ID_VACANCY, ultimo_insert_date: "2026-09-10T10:00:00Z" },
};

/**
 * A LINHA QUE A BUSCA DEVOLVE, com as duas perguntas que o cenário precisa responder.
 *
 * `da_varredura` diz se a vaga é do espelho (a matrícula), e `encerrou` se o encerramento EM PÉ foi
 * o da varredura. Os dois nomes acompanham a consulta de produção, e isso é de propósito: se ela
 * mudar de forma, este arquivo falha ALTO em vez de responder errado em silêncio, que é o modo de
 * falha de um fake que adivinha.
 */
export function vagaExistente(over: Record<string, unknown> = {}): Record<string, unknown>[] {
  return [
    {
      id: "00000000-0000-4000-8000-0000000000aa",
      status: CODIGO.fechamento,
      da_varredura: true,
      encerrou: true,
      ...over,
    },
  ];
}

// ── 3. O QUE SE LÊ DA INSTRUÇÃO EMITIDA ────────────────────────────────────────────────────────

export interface Emitido {
  consultas: string[];
  update: string | null;
  insertDaVaga: string | null;
  insertDaMatricula: string | null;
  /** O repositório RECUSOU a escrita. Recusar é uma forma legítima de não invadir a vaga alheia. */
  recusou: boolean;
}

export function lerEmitido(consultas: string[], recusou = false): Emitido {
  return {
    recusou,
    consultas: consultas.map((c) => c.toLowerCase()),
    update: consultaQueCasa(consultas, /update\s+vagas/),
    insertDaVaga: consultaQueCasa(consultas, /insert\s+into\s+vagas/),
    insertDaMatricula: consultaQueCasa(consultas, /insert\s+into\s+as_varredura_vagas/),
  };
}

/** A instrução decide sozinha pela fronteira? (a outra forma válida é a leitura anterior). */
function temFronteiraNoSql(instrucao: string): boolean {
  return /as_varredura_vagas/.test(whereDaEscrita(instrucao));
}

function reabre(instrucao: string): boolean {
  const s = setDaEscrita(instrucao);
  return /\bstatus\s*=/.test(s) || /encerrada_em\s*=/.test(s);
}

function zeraOEncerramento(instrucao: string): boolean {
  return /encerrada_em\s*=\s*null/.test(setDaEscrita(instrucao));
}

function sobrescreveOQueGenteDigitou(instrucao: string): boolean {
  const s = setDaEscrita(instrucao);
  return /\bcodigo\s*=/.test(s) || /\bnome_divulgacao\s*=/.test(s);
}

// ── 4. O CONTRATO ──────────────────────────────────────────────────────────────────────────────

/** A vaga é de DONO HUMANO: a varredura não a criou, e foi isso que se disse ao repositório. */
export function violacoesNaVagaDeDonoHumano(e: Emitido): string[] {
  const v: string[] = [];
  const upd = e.update;

  if (upd && reabre(upd) && !temFronteiraNoSql(upd)) {
    v.push(
      "REABERTURA_SEM_FRONTEIRA: a vaga que a varredura NÃO criou foi reaberta. Espelhar ciclo de vida tem duas direções, e só o encerramento ganhou fronteira: a reabertura pega qualquer vaga no papel FECHAMENTO, inclusive a da trilha, fechada por gente, com candidatura viva dentro. De 30 em 30 minutos, para sempre.",
    );
  }
  if (upd && zeraOEncerramento(upd) && !temFronteiraNoSql(upd)) {
    v.push(
      "ENCERRADA_EM_ZERADA_EM_VAGA_HUMANA: a instrução faz `encerrada_em = null` numa vaga de dono humano. O DANO NÃO É A VAGA, É O EXPURGO: a cláusula `or v.encerrada_em is null` protege todo mundo dentro de vaga não encerrada, então zerar o carimbo dá retenção ETERNA a quem está lá dentro, com CPF, e-mail, telefone e nascimento. É silencioso dos dois lados: ninguém vê a vaga reabrir, e ninguém vê a pessoa deixar de expirar.",
    );
  }
  if (upd && sobrescreveOQueGenteDigitou(upd) && !temFronteiraNoSql(upd)) {
    v.push(
      "CAMPOS_DIGITADOS_SOBRESCRITOS: a instrução reescreve `codigo` ou `nome_divulgacao` de uma vaga que a varredura não criou. O que um consultor digitou é apagado pelo título do ATS a cada volta, e não há como saber que se perdeu: não existe histórico daqueles campos.",
    );
  }
  if (e.insertDaMatricula) {
    v.push(
      "MATRICULA_FORA_DO_NASCIMENTO: a varredura MATRICULOU em `as_varredura_vagas` uma vaga que ela não criou. É o defeito que faz a fronteira do encerramento não separar NADA: a vaga digitada por gente é adotada na primeira passada e encerrada depois, pelo `exists` que deveria protegê-la. A matrícula é o registro de PROPRIEDADE, e propriedade nasce no insert, nunca na visita.",
    );
  }
  return v;
}

/** A vaga é DA VARREDURA: a fronteira não pode matar o comportamento legítimo. */
export function violacoesNaVagaDaVarredura(e: Emitido): string[] {
  const v: string[] = [];
  const upd = e.update;
  if (!upd) {
    v.push(
      "ESPELHO_NAO_ATUALIZA: a vaga espelhada, que é da varredura, não recebeu instrução nenhuma. A fronteira tem de separar o dono humano do espelho, e não desligar o espelho: a vaga que voltou às ativas no ATS precisa voltar a viver aqui, senão `encerrada_em` fica carimbado numa vaga viva e o relógio de retenção de quem está dentro dela segue correndo.",
    );
    return v;
  }
  if (!reabre(upd) && !temFronteiraNoSql(upd)) {
    v.push(
      "REABERTURA_NAO_ACONTECE: a vaga DA VARREDURA que estava em FECHAMENTO não foi reaberta. A correção da fronteira não pode virar imobilidade: o espelho que nunca reabre deixa o carimbo de encerramento numa vaga viva, e é o mesmo dano pelo avesso.",
    );
  }
  return v;
}

/**
 * A VAGA É DA VARREDURA, MAS QUEM A FECHOU FOI GENTE.
 *
 * ┌─ ESTA PROPRIEDADE É A SÉTIMA, e ela não estava na lista de seis ────────────────────────────┐
 * │ Ela vem do desenho que o `backend` escolheu (o carimbo `encerrada_pela_varredura_em`), e eu  │
 * │ a travo porque o dano é do mesmo tamanho: um consultor fecha a vaga espelhada à mão, e meia  │
 * │ hora depois ela está aberta de novo, sem ninguém ter pedido. A diferença para o caso do dono │
 * │ humano é sutil e importante: aqui a vaga É do espelho, então a fronteira de PROPRIEDADE não  │
 * │ basta, e o que separa é a fronteira do ENCERRAMENTO (quem encerrou desta vez).                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function violacoesNaVagaFechadaPorHumano(e: Emitido): string[] {
  const v: string[] = [];
  const upd = e.update;
  if (upd && reabre(upd) && !temFronteiraNoSql(upd)) {
    v.push(
      "REABRE_O_QUE_HUMANO_FECHOU: a vaga do espelho foi reaberta, e quem a tinha encerrado foi uma pessoa. O gesto de fechar à mão é desfeito a cada 30 minutos, e `encerrada_em` volta a nulo: quem está dentro da vaga volta a ficar protegido do expurgo para sempre, pela mesma cláusula `or v.encerrada_em is null`.",
    );
  }
  return v;
}

/** O nascimento: é aqui, e só aqui, que a matrícula acontece. */
export function violacoesDoNascimento(e: Emitido): string[] {
  const v: string[] = [];
  if (!e.insertDaVaga) {
    v.push("SEM_INSERT_DA_VAGA: a vaga nova não foi inserida, então o cenário não mede o que diz.");
    return v;
  }
  if (!e.insertDaMatricula) {
    v.push(
      "SEM_MATRICULA_NO_NASCIMENTO: a vaga nasceu sem linha em `as_varredura_vagas`. Sem o registro de propriedade, o encerramento automático teria de mirar `toda vaga com id_vacancy_pandape`, e aquela coluna também é DIGITADA por gente na trilha: a varredura passaria a encerrar vaga que um consultor cadastrou à mão.",
    );
  }
  return v;
}

/** A marca de água NÃO matricula: ela anda sobre quem já é da varredura. */
export function violacoesDaMarca(e: Emitido): string[] {
  const v: string[] = [];
  if (e.insertDaMatricula) {
    v.push(
      "MARCA_MATRICULA_QUALQUER_VAGA: a escrita da marca de água CRIA linha em `as_varredura_vagas`. É por essa porta que a vaga de dono humano vira propriedade da varredura, e a fronteira do encerramento deixa de separar qualquer coisa. A marca ANDA sobre quem já é da varredura: a forma que não adota ninguém é o `update`.",
    );
  }
  return v;
}

/** O encerramento, que já estava certo e não pode regredir. */
export function violacoesDoEncerramento(sqlEncerramento: string, papeisPedidos: string[]): string[] {
  const v: string[] = [];
  const t = sqlEncerramento.toLowerCase();
  /*
   * O CORPO CERTO, COM OU SEM CTE. A instrução pode ser um `update` solto ou uma CTE dentro de um
   * `with`, e as duas cumprem o requisito: ler o texto inteiro faria o `where` da escrita sumir no
   * dia em que alguém embrulhasse a instrução, e as afirmações ficariam vermelhas sem defeito
   * nenhum, que é a forma mais rápida de um acusador virar ruído que o time ignora.
   */
  const cte = cteQueEscreveEm(t, "vagas");
  const corpo = cte ? cte.corpo : t;
  const onde = whereDaEscrita(corpo);
  const setado = setDaEscrita(corpo);

  if (!/as_varredura_vagas/.test(onde)) {
    v.push(
      "ENCERRAMENTO_SEM_FRONTEIRA: o encerramento não exige que a vaga seja da varredura. `vagas.id_vacancy_pandape` também é digitado por gente na trilha, então sem a fronteira a varredura encerra, de 30 em 30 minutos, vaga que um consultor cadastrou à mão com o número do ATS dentro.",
    );
  }
  if (!/encerra\s*=\s*false/.test(onde)) {
    v.push(
      "ENCERRAMENTO_RECARIMBA: falta a guarda de `vaga ainda não encerrada`. Reescrever `encerrada_em` ADIA o prazo de retenção de quem está dentro dela a cada volta, que é o furo 1 pela terceira porta, e ainda move cancelamento e entrega feitos por humano.",
    );
  }
  if (!/encerrada_em\s*=\s*now\(\)/.test(setado)) {
    v.push(
      "ENCERRADA_EM_NAO_E_DO_SERVIDOR: o carimbo de encerramento não é `now()`. Data vinda do corpo da resposta do ATS seria gatilho REMOTO de exclusão irreversível: quem controla o payload passaria a controlar o relógio do expurgo, e o expurgo já recusou `data_fechamento` pelo mesmo motivo.",
    );
  }
  if (papeisPedidos.includes("ENTREGA")) {
    v.push(
      "ENCERRAMENTO_PELO_PAPEL_ERRADO: o encerramento usou o papel ENTREGA. `encerra` é verdadeiro nos dois, mas o expurgo POUPA de propósito quem estava em vaga de ENTREGA (é quem foi contratado, e o CPF dele continua na admissão, com retenção própria): a vaga espelhada herdaria aquela exceção e o furo continuaria aberto com outro nome.",
    );
  }
  if (!papeisPedidos.includes("FECHAMENTO")) {
    v.push(
      "ENCERRAMENTO_PELO_PAPEL_ERRADO: o encerramento não pediu o papel FECHAMENTO ao catálogo. O código do status não pode ser literal no SQL: o catálogo é do diretor e os códigos mudam.",
    );
  }
  return v;
}

// ── 5. O ACHADO B: O CONFLITO GUARDA O MESMO ID DA IDENTIDADE ──────────────────────────────────

/**
 * `as_ingestao_conflitos` guarda o MESMO `idCandidate` que `as_identidades_externas`, e o expurgo
 * apaga a segunda e não a primeira: sobra uma linha ligando a ficha ANONIMIZADA ao id de quem ela
 * era no ATS. Anonimização que deixa a chave de reidentificação ao lado não anonimiza nada.
 *
 * E A METADE QUE NINGUÉM LEMBRA: `as_varredura_vagas` NÃO PODE CAIR JUNTO. Ela é id de vaga e data,
 * sem pessoa nenhuma, e é o REGISTRO DE PROPRIEDADE da varredura: apagá-la por simetria devolveria
 * a vaga espelhada ao estado de "dono desconhecido", e o encerramento automático pararia de
 * alcançá-la, o que reabre o furo do `encerrada_em is null` pela terceira porta.
 */
export function violacoesDoExpurgoDoConflito(sqlDoExpurgo: string): string[] {
  const v: string[] = [];
  const t = sqlDoExpurgo.toLowerCase();
  const cte = ctesDaConsulta(t).find((c) =>
    /\b(delete\s+from|update)\s+as_ingestao_conflitos\b/.test(c.corpo),
  );

  if (!cte) {
    v.push(
      "CONFLITO_NAO_EXPURGADO: a varredura de retenção não toca `as_ingestao_conflitos`. A linha guarda o MESMO `idCandidate` que a identidade externa apagada, então ela sobra ligando a ficha anonimizada ao id de quem ela era no ATS: basta consultar aquele id na fonte para desfazer a anonimização inteira.",
    );
  } else {
    const alcance = alcanceDaEscrita(cte.corpo);
    if (!/\balvo\b/.test(alcance)) {
      v.push(
        "CONFLITO_NAO_ALCANCA_O_ALVO: a escrita não alcança quem está sendo anonimizado AGORA. A chave de reidentificação fica na linha ao lado do CPF que acabou de ser nulado.",
      );
    }
    if (!/\bja_anonimizados\b/.test(alcance) && !/anonimizado_em\s+is\s+not\s+null/.test(alcance)) {
      v.push(
        "CONFLITO_NAO_ALCANCA_OS_JA_ANONIMIZADOS: a escrita alcança só o `alvo` da passada. A varredura NUNCA volta a uma linha carimbada, então conflito registrado DEPOIS da anonimização, ou antes desta correção existir, fica retido PARA SEMPRE, em silêncio.",
      );
    }
  }

  if (ctesDaConsulta(t).some((c) => /\b(delete\s+from|update)\s+as_varredura_vagas\b/.test(c.corpo))) {
    v.push(
      "VARREDURA_EXPURGADA_POR_SIMETRIA: a retenção apaga `as_varredura_vagas`. Ali não há pessoa nenhuma: é id de vaga e data, e é o REGISTRO DE PROPRIEDADE da varredura. Apagá-la devolve a vaga espelhada ao estado de dono desconhecido, o encerramento automático para de alcançá-la, e o furo do `encerrada_em is null` volta pela terceira porta, protegendo para sempre quem está dentro dela.",
    );
  }
  return v;
}

// ── 6. A REFERÊNCIA DO EXPURGO E OS MUTANTES DELE ──────────────────────────────────────────────

const CTE_CONFLITOS = `conflitos_apagados as (
    delete from as_ingestao_conflitos
     where candidato_id in (select id from alvo)
        or candidato_id in (select id from ja_anonimizados)
  )`;

export const SQL_EXPURGO_REFERENCIA = `with alvo as (
    update as_candidatos c set cpf = null where c.anonimizado_em is null returning c.id
  ), ja_anonimizados as (
    select id from as_candidatos where anonimizado_em is not null
  ), ${CTE_CONFLITOS} select count(*)::int as n from alvo`;

export interface MutanteDoConflito {
  nome: string;
  dano: string;
  sql: string;
  regraEsperada: string;
}

export const MUTANTES_DO_CONFLITO: MutanteDoConflito[] = [
  {
    nome: "1. a CTE do conflito some",
    dano: "sobra a linha que liga a ficha anonimizada ao id de quem ela era no ATS: basta consultar aquele id na fonte para desfazer a anonimização inteira.",
    sql: SQL_EXPURGO_REFERENCIA.replace(`, ${CTE_CONFLITOS}`, ""),
    regraEsperada: "CONFLITO_NAO_EXPURGADO",
  },
  {
    nome: "2. o conflito alcança só o `alvo`",
    dano: "conflito registrado DEPOIS da anonimização, ou antes da correção existir, fica retido para sempre: a varredura nunca volta a uma linha carimbada.",
    sql: SQL_EXPURGO_REFERENCIA.replace(
      "\n     where candidato_id in (select id from alvo)\n        or candidato_id in (select id from ja_anonimizados)",
      "\n     where candidato_id in (select id from alvo)",
    ),
    regraEsperada: "CONFLITO_NAO_ALCANCA_OS_JA_ANONIMIZADOS",
  },
  {
    nome: "3. o conflito esquece o `alvo` e só cicatriza o passado",
    dano: "a chave de reidentificação fica na linha ao lado do CPF que acabou de ser nulado, e a passada seguinte também não a alcança.",
    sql: SQL_EXPURGO_REFERENCIA.replace(
      "\n     where candidato_id in (select id from alvo)\n        or candidato_id in (select id from ja_anonimizados)",
      "\n     where candidato_id in (select id from ja_anonimizados)",
    ),
    regraEsperada: "CONFLITO_NAO_ALCANCA_O_ALVO",
  },
  {
    nome: "4. a matrícula da varredura é apagada junto, por simetria",
    dano: "É O ERRO QUE A PRÓXIMA PESSOA VAI COMETER: as duas tabelas são da ingestão, e apagar as duas parece coerente. Ali não há pessoa nenhuma, e sem o registro de propriedade o encerramento automático para de alcançar a vaga espelhada, devolvendo a proteção eterna a quem está dentro dela.",
    sql: SQL_EXPURGO_REFERENCIA.replace(
      CTE_CONFLITOS,
      `${CTE_CONFLITOS}, varredura_apagada as (
    delete from as_varredura_vagas where id_vacancy_pandape is not null
  )`,
    ),
    regraEsperada: "VARREDURA_EXPURGADA_POR_SIMETRIA",
  },
];

// ── 7. OS MUTANTES DO CICLO DE VIDA, escritos como INSTRUÇÕES EMITIDAS ─────────────────────────

/**
 * Os mutantes daqui não são um `Ingestor` alternativo: são o EMITIDO, que é o que o contrato lê. É
 * o mesmo papel dos outros dois arquivos, e serve para a mesma coisa: provar que o acusador acusa.
 */
export interface MutanteDoCicloDeVida {
  nome: string;
  dano: string;
  emitido: Emitido;
  regraEsperada: string;
  cenario: "dono humano" | "da varredura" | "fechada por humano" | "nascimento" | "marca";
}

const UPDATE_QUE_REABRE =
  `update vagas set codigo = $1, nome_divulgacao = $2, cidade_id = $3, posicoes_oficiais = $4, ` +
  `status = ${CODIGO.abertura}, encerrada_em = null, atualizado_em = now() where id = $5::uuid and true returning id`;

const UPDATE_COM_FRONTEIRA =
  `update vagas set codigo = $1, nome_divulgacao = $2, status = ${CODIGO.abertura}, encerrada_em = null ` +
  `where id = $3::uuid and exists (select 1 from as_varredura_vagas m where m.id_vacancy_pandape = vagas.id_vacancy_pandape) returning id`;

const UPDATE_SO_DA_MARCA = `update as_varredura_vagas set ultimo_insert_date = $1 where id_vacancy_pandape = $2`;

function emitido(partes: Partial<Emitido>): Emitido {
  return {
    recusou: false,
    consultas: [],
    update: null,
    insertDaVaga: null,
    insertDaMatricula: null,
    ...partes,
  };
}

export const MUTANTES_DO_CICLO_DE_VIDA: MutanteDoCicloDeVida[] = [
  {
    nome: "1. a reabertura não tem fronteira (o código de hoje)",
    dano: "vaga da trilha, fechada por gente, com candidatura viva dentro, volta a ABERTA de 30 em 30 minutos.",
    emitido: emitido({ update: UPDATE_QUE_REABRE }),
    regraEsperada: "REABERTURA_SEM_FRONTEIRA",
    cenario: "dono humano",
  },
  {
    nome: "2. `encerrada_em` é zerado em vaga de dono humano",
    dano: "O MAIS CARO DOS QUATRO: com o carimbo nulo, a cláusula `or v.encerrada_em is null` do expurgo protege todo mundo dentro da vaga PARA SEMPRE, e o gesto se repete a cada volta. Silencioso dos dois lados.",
    emitido: emitido({ update: UPDATE_QUE_REABRE }),
    regraEsperada: "ENCERRADA_EM_ZERADA_EM_VAGA_HUMANA",
    cenario: "dono humano",
  },
  {
    nome: "3. os campos digitados são sobrescritos pelo ATS",
    dano: "o que o consultor digitou some sob o título do ATS, e não há histórico daqueles campos para saber que se perdeu.",
    emitido: emitido({ update: UPDATE_QUE_REABRE }),
    regraEsperada: "CAMPOS_DIGITADOS_SOBRESCRITOS",
    cenario: "dono humano",
  },
  {
    nome: "4. a visita matricula a vaga de dono humano",
    dano: "é o que faz a fronteira do encerramento não separar NADA: adotada na primeira passada, encerrada na segunda.",
    emitido: emitido({ update: UPDATE_COM_FRONTEIRA, insertDaMatricula: "insert into as_varredura_vagas (id_vacancy_pandape) values ($1)" }),
    regraEsperada: "MATRICULA_FORA_DO_NASCIMENTO",
    cenario: "dono humano",
  },
  {
    nome: "5. a fronteira vira imobilidade e o espelho nunca reabre",
    dano: "o avesso do defeito: `encerrada_em` fica carimbado numa vaga VIVA, e o relógio de retenção de quem está dentro dela segue correndo.",
    emitido: emitido({ update: "update vagas set codigo = $1 where id = $2::uuid returning id" }),
    regraEsperada: "REABERTURA_NAO_ACONTECE",
    cenario: "da varredura",
  },
  {
    nome: "8. a reabertura desfaz o fechamento que uma PESSOA fez",
    dano: "a vaga é do espelho, mas quem a fechou foi gente: meia hora depois ela está aberta de novo, com `encerrada_em` nulo, e quem está dentro dela volta a ficar protegido do expurgo para sempre.",
    emitido: emitido({ update: UPDATE_QUE_REABRE }),
    regraEsperada: "REABRE_O_QUE_HUMANO_FECHOU",
    cenario: "fechada por humano",
  },
  {
    nome: "6. a vaga nasce sem matrícula",
    dano: "sem o registro de propriedade, o encerramento teria de mirar toda vaga com `id_vacancy_pandape`, e aquela coluna também é digitada por gente.",
    emitido: emitido({ insertDaVaga: "insert into vagas (id_vacancy_pandape) values ($1) returning id" }),
    regraEsperada: "SEM_MATRICULA_NO_NASCIMENTO",
    cenario: "nascimento",
  },
  {
    nome: "7. a marca de água matricula qualquer vaga varrida (o código de hoje)",
    dano: "é a porta por onde a vaga de dono humano vira propriedade da varredura, e a fronteira do encerramento deixa de separar qualquer coisa.",
    emitido: emitido({ insertDaMatricula: "insert into as_varredura_vagas (id_vacancy_pandape, ultimo_insert_date) values ($1, $2) on conflict do update set ultimo_insert_date = excluded.ultimo_insert_date" }),
    regraEsperada: "MARCA_MATRICULA_QUALQUER_VAGA",
    cenario: "marca",
  },
];

/** A instrução da marca que NÃO adota ninguém, para a referência do cenário 4 existir. */
export const MARCA_QUE_NAO_MATRICULA = emitido({ consultas: [UPDATE_SO_DA_MARCA] });

// ── 8. RODAR O REPOSITÓRIO REAL NOS QUATRO CENÁRIOS ────────────────────────────────────────────

export interface EscritorDeVaga {
  escrever(e: Escrita): Promise<{ linhasAfetadas: number; id: string }>;
  encerrarAusentes(idsAtivos: number[]): Promise<number>;
}

export type CriarEscritor = (db: never, catalogo: never) => EscritorDeVaga;

/**
 * A VAGA DE DONO HUMANO: existe em FECHAMENTO, e a pergunta de propriedade devolve VAZIO.
 *
 * A resposta é por SENTIDO (um trecho do texto da consulta) e nunca pela ordem das chamadas: o
 * repositório pode passar a ler uma coisa a mais amanhã, e um fake por ordem entregaria a resposta
 * errada para a pergunta certa, deixando o teste verde com o defeito aberto.
 */
export async function rodarVagaDeDonoHumano(criar: CriarEscritor): Promise<Emitido> {
  return rodarBuscaQueAcha(criar, { da_varredura: false, encerrou: false });
}

/**
 * O tronco dos três cenários de vaga que JÁ EXISTE.
 *
 * A RECUSA É CAPTURADA, E NÃO PROPAGADA, porque recusar a vaga alheia é comportamento CERTO: o
 * repositório de produção lança "conflito para revisão humana" em vez de adotar em silêncio. Um
 * teste que deixasse a exceção subir reprovaria a implementação correta e ainda pareceria um defeito
 * de código, quando é o contrato que não sabia ler a resposta.
 */
async function rodarBuscaQueAcha(
  criar: CriarEscritor,
  linha: Record<string, unknown>,
): Promise<Emitido> {
  const cat = catalogoFingido();
  const banco = bancoFingido([
    { quando: /select[\s\S]*from\s+vagas\b/, devolve: vagaExistente(linha) },
    { quando: /from\s+as_varredura_vagas/, devolve: linha.da_varredura ? [{ vaga_id: "00000000-0000-4000-8000-0000000000aa" }] : [] },
  ]);
  let recusou = false;
  try {
    await criar(banco.db, cat.servico).escrever(ESCRITA_DA_VAGA);
  } catch {
    recusou = true;
  }
  return lerEmitido(banco.consultas, recusou);
}

/** A vaga do espelho que uma PESSOA fechou: propriedade nossa, encerramento dela. */
export async function rodarVagaFechadaPorHumano(criar: CriarEscritor): Promise<Emitido> {
  return rodarBuscaQueAcha(criar, { da_varredura: true, encerrou: false });
}

/** A VAGA DA VARREDURA: existe em FECHAMENTO, e a pergunta de propriedade devolve a matrícula. */
export async function rodarVagaDaVarredura(criar: CriarEscritor): Promise<Emitido> {
  return rodarBuscaQueAcha(criar, { da_varredura: true, encerrou: true });
}

/** O NASCIMENTO: a busca não acha nada, e a vaga entra. */
export async function rodarNascimento(criar: CriarEscritor): Promise<Emitido> {
  const cat = catalogoFingido();
  const banco = bancoFingido([
    { quando: /insert\s+into\s+vagas/, devolve: [{ id: "00000000-0000-4000-8000-0000000000bb" }] },
  ]);
  await criar(banco.db, cat.servico).escrever(ESCRITA_DA_VAGA);
  return lerEmitido(banco.consultas);
}

/** A MARCA DE ÁGUA, sozinha. */
export async function rodarMarca(criar: CriarEscritor): Promise<Emitido> {
  const cat = catalogoFingido();
  const banco = bancoFingido([]);
  await criar(banco.db, cat.servico).escrever(ESCRITA_DA_MARCA);
  return lerEmitido(banco.consultas);
}

/** O ENCERRAMENTO, com a lista de ativos dada. */
export async function rodarEncerramento(
  criar: CriarEscritor,
  idsAtivos: number[],
): Promise<{ sql: string | null; papeisPedidos: string[]; devolvido: number; consultas: string[] }> {
  const cat = catalogoFingido();
  const banco = bancoFingido([{ quando: /update\s+vagas/, devolve: [{ id: "uma" }, { id: "outra" }] }]);
  const devolvido = await criar(banco.db, cat.servico).encerrarAusentes(idsAtivos);
  return {
    sql: consultaQueCasa(banco.consultas, /update\s+vagas/),
    papeisPedidos: cat.papeisPedidos,
    devolvido,
    consultas: banco.consultas,
  };
}
