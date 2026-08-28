import {
  CANDIDATURA_ETAPAS,
  CANDIDATURA_SITUACOES,
  candidaturaViva,
  ehSaidaSemExito,
  type CandidaturaEtapa,
  type CandidaturaSituacao,
} from "@ea/shared-types";

/**
 * REGRAS DE DOMÍNIO DA CANDIDATURA (A&S, Central de Candidatos, onda 1).
 *
 * Funções PURAS, testáveis sem banco e sem HTTP, no mesmo espírito de `domain/vaga.ts` e
 * `domain/frentes.ts`. O service consome daqui e não reimplementa nada: ele sabe falar HTTP e
 * conversar com o banco, a régua é destas linhas.
 *
 * AS QUATRO TRAVAS DO MÓDULO se apoiam em duas coisas escritas aqui: `consomePosicao` (o que conta
 * como posição ocupada) e `cabeMaisUm` (se ainda cabe alguém). A quarta trava, a da CORRIDA entre
 * dois consultores, NÃO é uma regra: é o LUGAR onde `cabeMaisUm` é chamada, dentro da transação e
 * com a linha da vaga travada. Uma função pura não tem como garanti-la sozinha, e é por isso que o
 * service tem um comentário longo exatamente nesse ponto.
 */

// ── O FUNIL ─────────────────────────────────────────────────────────────────

/**
 * ─ O FUNIL DEIXOU DE SER UM TRILHO (decisão do diretor, 27/08) ────────────────────────────────
 *
 * O QUE ERA E POR QUE MUDOU. Até aqui a régua era `AVANCOS_PERMITIDOS`, um mapa que só deixava a
 * candidatura ANDAR PARA A FRENTE, uma etapa por vez (com o atalho da Entrevista Cliente como única
 * exceção). Isso descreve um processo que não existe: a operação real volta candidato de etapa
 * (a entrevista não aconteceu, o cliente remarcou, a triagem foi feita cedo demais) e pula etapa
 * (o cliente pediu para ver a pessoa direto). Com o trilho, o consultor não tinha como registrar o
 * que de fato aconteceu, e a etapa gravada passava a mentir sobre o processo.
 *
 * A RÉGUA DE HOJE: DE QUALQUER ETAPA PARA QUALQUER OUTRA, para a frente e para trás, com ou sem
 * pulo. A etapa é ONDE A PESSOA ESTÁ no funil, um retrato, e retrato se corrige.
 *
 * ┌─ O QUE ESTA LIBERAÇÃO **NÃO** ALCANÇA, E É O QUE A TORNA SEGURA ───────────────────────────┐
 * │ ETAPA E SITUAÇÃO SÃO INDEPENDENTES, e sempre foram. Quem consome posição da vaga é a        │
 * │ SITUAÇÃO (`consomePosicao`: APROVADO e CONTRATADO), nunca a etapa. Mover de etapa não muda  │
 * │ situação nenhuma, então nem a trava de vaga cheia (`cabeMaisUm`), nem a conta de ocupação   │
 * │ (`ocupacaoDaVaga`), nem a trava de encerramento da vaga (`vagaPodeEncerrar`) são tocadas    │
 * │ por esta mudança. Uma candidatura APROVADA sequer chega aqui: o service só move quem está   │
 * │ `ATIVO`, e essa trava CONTINUA DE PÉ. Voltar alguém de Aprovação para Triagem não desfaz    │
 * │ aprovação nenhuma, porque quem estava aprovado não é movível.                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE CONTINUA BARRADO, e é só isto: mover para a etapa em que a pessoa JÁ ESTÁ. Não é movimento,
 * é ruído, e aceitar em silêncio faria a tela achar que algo aconteceu.
 */
export function destinosDeEtapa(de: CandidaturaEtapa): CandidaturaEtapa[] {
  return CANDIDATURA_ETAPAS.filter((e) => e !== de);
}

/**
 * MANTIDA COM O NOME ANTIGO DE PROPÓSITO (`proximasEtapas`), porque o service e a tela já a chamam e
 * a pergunta que ela responde continua a mesma: "para onde esta candidatura pode ir daqui?". O que
 * mudou foi a RESPOSTA, não a pergunta.
 *
 * ELA NUNCA MAIS DEVOLVE LISTA VAZIA. Antes, `APROVACAO` era fim de linha e devolvia `[]`, e o
 * service usava esse vazio para dizer "já está na última etapa". Hoje a Aprovação tem quatro
 * destinos como qualquer outra etapa, e a frase de recusa do service foi ajustada junto.
 */
export function proximasEtapas(de: CandidaturaEtapa): CandidaturaEtapa[] {
  return destinosDeEtapa(de);
}

/**
 * A ENTREVISTA COM O CLIENTE É OPCIONAL, dito em uma função para o teste poder afirmar isso
 * diretamente em vez de inspecionar a régua. Com o funil livre ela passou a ser trivialmente
 * verdadeira, e a função fica porque o dia em que alguém tornar a etapa OBRIGATÓRIA (uma régua que
 * exija passar por ela) é o dia em que este teste tem de quebrar dizendo o que mudou.
 */
export function entrevistaClienteEhOpcional(): boolean {
  return destinosDeEtapa("ENTREVISTA_SOULAN").includes("APROVACAO");
}

/**
 * Este movimento de etapa é permitido? Vale para a frente, para trás e com pulo; só a etapa atual é
 * recusada.
 *
 * O NOME ANTIGO (`avancoPermitido`) FICA COMO APELIDO logo abaixo, para o service e os testes que já
 * o chamam continuarem valendo sem uma varredura de renomeação atravessar duas camadas validadas
 * (§A.26). O nome novo é o que descreve a régua de hoje, e é ele que o código novo usa.
 */
export function movimentoPermitido(de: CandidaturaEtapa, para: CandidaturaEtapa): boolean {
  return de !== para;
}

/** @deprecated Use `movimentoPermitido`. O funil não é mais um trilho de mão única. */
export function avancoPermitido(de: CandidaturaEtapa, para: CandidaturaEtapa): boolean {
  return movimentoPermitido(de, para);
}

/** A etapa é uma das cinco conhecidas? Guarda de borda para corpo montado fora da tela. */
export function ehEtapaConhecida(v: string): v is CandidaturaEtapa {
  return (CANDIDATURA_ETAPAS as readonly string[]).includes(v);
}

// ── AS SAÍDAS ───────────────────────────────────────────────────────────────

/**
 * AS SAÍDAS DE QUALQUER ETAPA. Sair não depende de onde a pessoa está no funil: desiste-se na
 * captação e desiste-se na véspera da aprovação, e as duas coisas são a mesma saída.
 *
 * `CONTRATADO` ESTÁ AQUI E É A SAÍDA DIFERENTE DAS OUTRAS: ela CONSOME POSIÇÃO. Por isso o service
 * trata as três pelo mesmo caminho de registro, mas passa `CONTRATADO` pela mesma trava de posição
 * que a aprovação.
 */
export const SITUACOES_DE_SAIDA: CandidaturaSituacao[] = ["DESCARTADO", "DESISTIU", "CONTRATADO"];

export function ehSaida(s: CandidaturaSituacao): boolean {
  return SITUACOES_DE_SAIDA.includes(s);
}

/**
 * SAÍDA QUE ENCERRA O PROCESSO SEM ÊXITO. Estas duas ficam FORA da conta de ocupação: nunca somam e
 * nunca subtraem. É a mesma disciplina da §A.16 na esteira, em que declínio não entra em fila nem
 * conta como pendência.
 */
export { ehSaidaSemExito };

// ── A OCUPAÇÃO, SEMPRE DERIVADA ─────────────────────────────────────────────

/**
 * O QUE CONSOME POSIÇÃO, e é só isto: `APROVADO` e `CONTRATADO`.
 *
 * `ATIVO` NÃO CONSOME, e essa é a regra que sustenta o módulo inteiro: gente EM SELEÇÃO não ocupa
 * posição, senão uma vaga de 10 travaria no 11º currículo triado. Quem consome é quem foi aprovado.
 */
export function consomePosicao(s: CandidaturaSituacao): boolean {
  return s === "APROVADO" || s === "CONTRATADO";
}

/** O retrato da ocupação de uma vaga, calculado e nunca lido de contador guardado. */
export interface Ocupacao {
  ocupadas: number;
  livres: number | null;
  emSelecao: number;
  fora: number;
  excedida: boolean;
}

/**
 * A RÉGUA DA OCUPAÇÃO, em uma função, e ela é a fonte única do módulo:
 *
 *   OCUPADAS   = candidaturas da vaga com situação APROVADO ou CONTRATADO
 *   LIVRES     = posições oficiais menos ocupadas
 *   EM SELEÇÃO = candidaturas ATIVAS, que NÃO consomem posição
 *   FORA       = DESCARTADO e DESISTIU, que nunca somam nem subtraem
 *
 * A OCUPAÇÃO É SEMPRE DERIVADA, NUNCA ARMAZENADA. É a mesma decisão que a vaga já tinha tomado com
 * os contadores dela, e pelo mesmo motivo: um contador guardado é um segundo número, e dois números
 * que deveriam ser iguais acabam discordando no dia em que uma aprovação for desfeita, um descarte
 * for revertido ou uma linha for corrigida à mão no banco.
 *
 * `posicoesOficiais` NULA é vaga sem meta definida (o rascunho): `livres` fica nula e `excedida`
 * fica falsa, porque ausência de meta não é meta zero. Quem decide o que fazer com isso é o service.
 *
 * LIVRES TEM PISO EM ZERO: uma vaga excedida (9 aprovados em 8 posições) mostra zero livres e
 * `excedida = true`, e não "menos uma livre", que não é coisa que exista.
 */
export function ocupacaoDaVaga(
  posicoesOficiais: number | null | undefined,
  situacoes: readonly CandidaturaSituacao[],
): Ocupacao {
  const ocupadas = situacoes.filter(consomePosicao).length;
  const emSelecao = situacoes.filter((s) => s === "ATIVO").length;
  const fora = situacoes.filter(ehSaidaSemExito).length;

  const meta = posicoesOficiais ?? null;
  return {
    ocupadas,
    livres: meta === null ? null : Math.max(0, meta - ocupadas),
    emSelecao,
    fora,
    excedida: meta !== null && ocupadas > meta,
  };
}

/**
 * A TRAVA 1, escrita como pergunta: ainda cabe mais um nesta vaga?
 *
 * `ocupadasSemEsta` é a contagem das OUTRAS candidaturas que consomem posição, EXCLUINDO a que está
 * sendo movida. A exclusão não é detalhe: sem ela, aprovar quem já estava APROVADO (ou contratar
 * quem já estava aprovado, que é o caminho normal) contaria a mesma pessoa duas vezes e recusaria um
 * movimento que não ocupa posição nenhuma nova.
 *
 * META NULA devolve `false`, e isto é o fail-closed: vaga sem número de posições definido não tem
 * como dizer que cabe mais um. O service transforma isso em uma frase que pede para definir a meta,
 * em vez de deixar passar uma aprovação contra um teto que ninguém configurou.
 */
export function cabeMaisUm(
  ocupadasSemEsta: number,
  posicoesOficiais: number | null | undefined,
): boolean {
  if (posicoesOficiais === null || posicoesOficiais === undefined) return false;
  return ocupadasSemEsta + 1 <= posicoesOficiais;
}

/**
 * A TRAVA 2, como régua pura: esta vaga recebe candidato novo?
 *
 * FECHADA, CANCELADA e ENTREGUE são as três que não recebem, e ENTREGUE está na lista por um motivo
 * que não é óbvio: ela é o fechamento BEM-SUCEDIDO, a vaga que já entregou gente. Deixá-la de fora
 * pareceria generoso e permitiria alocar candidato num processo terminado.
 *
 * O RASCUNHO RECEBE. A vaga salva pela metade é um estado legítimo de trabalho, e barrar a alocação
 * nela obrigaria o time a publicar antes de começar a captar. Quem trava o rascunho é a trava 1, na
 * hora de APROVAR, porque é lá que a meta ausente vira problema de verdade.
 */
export const STATUS_QUE_NAO_RECEBEM = ["FECHADA", "CANCELADA", "ENTREGUE"] as const;

export function vagaRecebeCandidato(status: string): boolean {
  return !(STATUS_QUE_NAO_RECEBEM as readonly string[]).includes(status);
}

// ── A TRAVA 5: A VAGA SÓ ENCERRA COM TODO MUNDO TRATADO ─────────────────────

/**
 * O QUE CONTA COMO CANDIDATO TRATADO, e é a lista inteira menos uma situação.
 *
 * TRATADO É TER RECEBIDO UMA DECISÃO, e não "ter dado certo": `DESCARTADO` e `DESISTIU` são
 * tratamentos tanto quanto `APROVADO` e `CONTRATADO`. O que a regra impede é a vaga fechar deixando
 * gente PENDURADA no funil, sem ninguém nunca ter dito o que aconteceu com ela.
 *
 * SÓ `ATIVO` É PENDENTE. É a mesma situação que não consome posição (`consomePosicao`), e a
 * coincidência não é acidente: `ATIVO` é exatamente "está em seleção, ainda não se decidiu nada".
 * São réguas diferentes, porém, e por isso duas funções: uma responde "ocupa posição?" e a outra
 * responde "já foi decidido?". No dia em que uma situação nova entrar, as duas perguntas terão de
 * ser respondidas separadamente para ela.
 */
export const SITUACOES_TRATADAS: CandidaturaSituacao[] = [
  "APROVADO",
  "CONTRATADO",
  "DESCARTADO",
  "DESISTIU",
];

/**
 * Esta candidatura já foi tratada?
 *
 * ESCRITO COMO PERTENCIMENTO À LISTA, e não como `s !== "ATIVO"`, e isso é fail-closed de propósito:
 * uma situação NOVA que alguém acrescente ao vocabulário sem passar por aqui nasce PENDENTE, e a
 * vaga não fecha até alguém decidir o que ela significa. A forma negativa faria o contrário: a
 * situação nova nasceria "tratada" em silêncio e a trava deixaria de valer para ela.
 */
export function candidaturaTratada(s: CandidaturaSituacao): boolean {
  return SITUACOES_TRATADAS.includes(s);
}

/**
 * QUEM AINDA ESTÁ PENDENTE, preservando a ordem e a forma do que entrou.
 *
 * GENÉRICA sobre `{ situacao }` para o service poder passar as linhas dele (com id, nome e etapa) e
 * receber as mesmas linhas de volta, prontas para virar o corpo do 409. A alternativa seria a função
 * devolver só os índices ou só as situações, e o service refiltrar: duas passagens, e a segunda é
 * onde a régua se perderia.
 */
export function pendentesDeTratamento<T extends { situacao: CandidaturaSituacao }>(
  candidaturas: readonly T[],
): T[] {
  return candidaturas.filter((c) => !candidaturaTratada(c.situacao));
}

/**
 * A TRAVA 5, escrita como pergunta: esta vaga pode ser encerrada?
 *
 * VAGA SEM NINGUÉM DENTRO PODE FECHAR. Lista vazia devolve `true`, e não é caso de borda esquecido:
 * vaga que não recebeu candidato nenhum é justamente a que se fecha sem entrega, e barrá-la seria
 * exigir tratar uma fila que não existe.
 */
export function vagaPodeEncerrar(situacoes: readonly CandidaturaSituacao[]): boolean {
  return situacoes.every(candidaturaTratada);
}

// ── A REENTRADA EM VAGA JÁ ENCERRADA (ajuste do diretor) ────────────────────

/**
 * AS SITUAÇÕES VIVAS: o conjunto que ocupa lugar no processo, e a única coisa que a trava de
 * duplicata precisa proteger.
 *
 * DERIVADA, e não redigitada. Ela é o COMPLEMENTO de `ehSaidaSemExito`: viva é tudo que não terminou
 * sem êxito, o que dá `ATIVO` (em seleção), `APROVADO` e `CONTRATADO` (que consomem posição, por
 * `consomePosicao`). Escrever a lista à mão aqui criaria uma SEGUNDA lista igual à primeira, e duas
 * listas iguais divergem no primeiro dia em que alguém acrescentar uma situação nova numa só.
 *
 * A DERIVAÇÃO É FAIL-CLOSED, e a direção importa: situação nova nasce VIVA, portanto PROTEGIDA pela
 * trava de duplicata, até alguém decidir que ela encerra o processo. O caminho contrário
 * (`s === "ATIVO" || consomePosicao(s)`) faria a situação nova nascer "encerrada" em silêncio e
 * abriria a duplicata sem ninguém pedir.
 *
 * ESTE É O MESMO CONJUNTO DO ÍNDICE PARCIAL `uq_as_candidaturas_viva` no banco, e o índice é
 * construído a partir DESTA constante (`db/schema/tables.ts`), não de uma lista digitada no schema.
 */
export const SITUACOES_VIVAS: CandidaturaSituacao[] = CANDIDATURA_SITUACOES.filter(
  (s) => !ehSaidaSemExito(s),
);

/**
 * Esta candidatura ainda ocupa lugar no processo? Complemento exato de `ehSaidaSemExito`.
 *
 * AS DUAS SUBIRAM PARA O `shared-types` e são REEXPORTADAS daqui, sem mudar de comportamento: a
 * tela passou a precisar da mesma régua (peça P1 do bug 1, a etapa só vale enquanto a candidatura
 * está viva), e manter uma cópia em cada lado é como esta régua começaria a divergir. Quem já
 * importava daqui continua importando daqui.
 */
export { candidaturaViva };

/**
 * O QUE FAZER COM UMA ALOCAÇÃO, olhando o que já existe daquele par pessoa/vaga.
 *
 * TRÊS RESPOSTAS, e a do meio é a novidade:
 *   `LIVRE`     nunca houve candidatura ali, aloca direto.
 *   `JA_ESTA`   existe candidatura VIVA, e isso continua barrado: é a duplicata acidental.
 *   `REENTRADA` só existem candidaturas ENCERRADAS, e a pessoa PODE voltar, com ciência.
 *
 * POR QUE A REENTRADA EXISTE: quem foi descartado em março e viu a vaga reabrir em agosto não voltava,
 * porque a trava de duplicata era um unique simples sobre (pessoa, vaga) e não sabia distinguir
 * "está na vaga" de "esteve na vaga". Processo encerrado no passado não é motivo para barrar o
 * futuro; duplo clique é. A régua separa as duas coisas.
 *
 * `anterior` É A ENCERRADA MAIS RECENTE, e é ela que vai para a tela: o consultor decide com "foi
 * descartada em março, por perfil não aderente" na mão, não com "já esteve aqui alguma vez".
 *
 * FUNÇÃO PURA E GENÉRICA sobre `{ situacao, encerradaEm }`: o service passa as linhas dele e recebe a
 * própria linha de volta, pronta para virar o corpo do 409, sem uma segunda passagem em que a régua
 * se perderia.
 */
export type DecisaoDeAlocacao<T> =
  | { tipo: "LIVRE" }
  | { tipo: "JA_ESTA"; viva: T }
  | { tipo: "REENTRADA"; anterior: T };

export function decidirAlocacao<
  T extends { situacao: CandidaturaSituacao; encerradaEm: Date | string | null },
>(anteriores: readonly T[]): DecisaoDeAlocacao<T> {
  const viva = anteriores.find((c) => candidaturaViva(c.situacao));
  if (viva) return { tipo: "JA_ESTA", viva };

  const encerradas = anteriores.filter((c) => ehSaidaSemExito(c.situacao));
  if (encerradas.length === 0) return { tipo: "LIVRE" };

  // A MAIS RECENTE. Ordem explícita, e não "a última do array": a ordem que chega do banco é
  // detalhe da consulta, e depender dela faria a resposta mudar quando alguém trocar o `order by`.
  const anterior = [...encerradas].sort(
    (a, b) => instante(b.encerradaEm) - instante(a.encerradaEm),
  )[0];
  return { tipo: "REENTRADA", anterior };
}

/** Data ausente vai para o começo do tempo: sem carimbo, nunca é a mais recente. */
function instante(v: Date | string | null): number {
  if (v === null) return 0;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}
