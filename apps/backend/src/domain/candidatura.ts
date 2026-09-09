import {
  CANDIDATURA_ETAPAS,
  CANDIDATURA_SITUACOES,
  candidaturaViva,
  consomePosicao,
  ehSaidaSemExito,
  finalizaPosicao,
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
 * │ SITUAÇÃO (`consomePosicao`), nunca a etapa. Mover de etapa não muda situação nenhuma, então │
 * │ nem a trava de vaga cheia (`cabeMaisUm`), nem a conta de ocupação                          │
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
 * `ENVIADO_PARA_ADMISSAO` ESTÁ AQUI E É A DIFERENTE DAS OUTRAS: ela CONSOME POSIÇÃO. Por isso o
 * service trata as três pelo mesmo caminho de registro, mas passa esta pela mesma trava de posição
 * que a aprovação.
 */
export const SITUACOES_DE_SAIDA = [
  "DESCARTADO",
  "DESISTIU",
  "ENVIADO_PARA_ADMISSAO",
] as const satisfies readonly CandidaturaSituacao[];

/**
 * O TIPO DAS SAÍDAS, DERIVADO DA LISTA. É ele que o `RegistrarSaidaDto` passou a usar, em vez de
 * repetir os três nomes à mão no `@IsIn` e mais uma vez na anotação do campo.
 *
 * POR QUE ISTO PRECISOU EXISTIR (achado do tester, 08/09): a lista estava REDIGITADA no DTO, e esta
 * constante não era usada por NENHUMA linha de produção, só pelo teste. A fonte estava morta e a
 * cópia é que mandava, que é a pior configuração possível das duas: mexer na fonte não muda nada, e
 * quem lê a fonte acredita estar lendo a régua.
 */
export type SituacaoDeSaida = (typeof SITUACOES_DE_SAIDA)[number];

export function ehSaida(s: CandidaturaSituacao): boolean {
  return (SITUACOES_DE_SAIDA as readonly CandidaturaSituacao[]).includes(s);
}

/**
 * ─ ESTA SITUAÇÃO OCUPA POSIÇÃO, com o TIPO ESTREITADO junto ───────────────────────────────────
 *
 * É `consomePosicao`, a fonte única, devolvendo `is` em vez de `boolean`. Não é uma segunda régua:
 * a resposta é literalmente a dela, e o teste de derivação afirma isso.
 *
 * PARA QUE ELA SERVE, e o perigo que ela desarma. `registrarSaida` escolhia o caminho por
 * `dto.situacao === "ENVIADO_PARA_ADMISSAO"`, uma comparação com um nome digitado. Bastava alguém
 * acrescentar `"ALOCADO"` às saídas, achando que unificava as rotas, para a alocação cair no
 * `update` direto: sem `FOR UPDATE`, sem `cabeMaisUm`, sem lado e sem aceite. Vaga de 5 aceitaria 6
 * alocados, em silêncio, porque a trava não teria sido pulada de propósito, apenas não consultada.
 *
 * COM A PERGUNTA FEITA À RÉGUA, situação nova que consome posição entra no caminho travado SOZINHA,
 * no dia em que for criada, sem depender de alguém lembrar de acrescentar um `if`.
 */
export function ocupaPosicao(s: CandidaturaSituacao): s is SituacaoQueOcupaPosicao {
  return consomePosicao(s);
}

/**
 * AS SITUAÇÕES QUE O CAMINHO TRAVADO SABE GRAVAR. É a assinatura de
 * `mudarSituacaoOcupandoPosicao`, escrita uma vez e conferida por teste contra `consomePosicao`:
 * situação nova que consuma posição e não esteja aqui quebra o teste antes de chegar em produção.
 */
export type SituacaoQueOcupaPosicao = Extract<
  CandidaturaSituacao,
  "APROVADO" | "ALOCADO" | "ENVIADO_PARA_ADMISSAO"
>;

/**
 * SAÍDA QUE ENCERRA O PROCESSO SEM ÊXITO. Estas duas ficam FORA da conta de ocupação: nunca somam e
 * nunca subtraem. É a mesma disciplina da §A.16 na esteira, em que declínio não entra em fila nem
 * conta como pendência.
 */
export { ehSaidaSemExito };

// ── A OCUPAÇÃO, SEMPRE DERIVADA ─────────────────────────────────────────────

/**
 * O QUE CONSOME POSIÇÃO, e a régua NÃO MORA MAIS AQUI: mora no `shared-types`, de onde estas duas
 * são REEXPORTADAS sem mudar de comportamento. É o mesmo movimento que `ehSaidaSemExito` já tinha
 * feito, e pelo mesmo motivo, agora com um motivo a mais.
 *
 * O MOTIVO A MAIS: a régua estava copiada em SQL cru, e a contagem final foi CINCO lugares, não
 * quatro. Medido arquivo por arquivo antes de corrigir: duas cópias da régua de CONSOME POSIÇÃO
 * (`candidatos.service.ts`, dentro das transações de troca de vaga e de mudança de situação) e duas
 * da régua de VIVA (`candidatos.service.ts` na busca de candidatos e
 * `retencao-candidatos.service.ts` no expurgo da LGPD), mais esta função. Cópias concordam por
 * coincidência, e no dia em que uma situação nova entrar em uma delas e não nas outras, a LEITURA da
 * tela e a TRAVA da vaga passam a dar números diferentes, e a vaga aceita aprovação a mais EM
 * SILÊNCIO. Uma lista só, e todas leem dela.
 *
 * A CÓPIA DO EXPURGO ERA A MAIS CARA DAS CINCO, e não estava mapeada: a varredura de retenção
 * anonimiza (irreversivelmente) quem não tem candidatura viva, e a lista dela era digitada à mão.
 * Uma situação nova fora daquela linha faz uma pessoa EM PROCESSO ser tratada como sem processo.
 *
 * SÃO DUAS PERGUNTAS, e por isso duas funções: `finalizaPosicao` responde "a posição foi
 * ENTREGUE?", que é o que enche o cilindro da vaga, e `consomePosicao` responde "a posição está
 * TOMADA?", que é a trava de cabe mais um. Quem já importava daqui continua importando daqui.
 */
export { consomePosicao, finalizaPosicao };

/**
 * AS SITUAÇÕES QUE CONSOMEM POSIÇÃO, como LISTA, para o SQL poder usá-las.
 *
 * ELA EXISTE PORQUE `inArray` PRECISA DE UM ARRAY, e não de uma função: as contagens de ocupação
 * dentro das transações do service passavam a lista escrita à mão (`["APROVADO", "..."]`), que é
 * exatamente a cópia que a fonte única veio eliminar. Com a constante, o SQL pergunta a mesma coisa
 * que a régua responde.
 *
 * DERIVADA POR FILTRO, e nunca redigitada, pelo mesmo motivo e na mesma forma de `SITUACOES_VIVAS`
 * logo abaixo: a lista escrita à mão concorda com a função por COINCIDÊNCIA, e para de concordar no
 * dia em que uma situação nova entrar em uma e não na outra. É esse dia, e não outro, que faz a
 * trava da vaga e a leitura da tela darem números diferentes em silêncio.
 *
 * NÃO CONFUNDIR COM `SITUACOES_QUE_FINALIZAM_POSICAO` (`shared-types`): aquela responde "a posição
 * foi ENTREGUE?" e enche o cilindro; esta responde "a posição está TOMADA?" e é a trava de cabe mais
 * um. Esta contém aquela, mais `APROVADO`, que reserva antes de entregar.
 */
export const SITUACOES_QUE_CONSOMEM_POSICAO: CandidaturaSituacao[] =
  CANDIDATURA_SITUACOES.filter(consomePosicao);

/**
 * O retrato da ocupação de uma vaga, calculado e nunca lido de contador guardado.
 *
 * SÃO QUATRO NÚMEROS DE POSIÇÃO, e nenhum deles é um contador duplicado: `ocupadas`,
 * `finalizadas` e os dois lados da entrega saem da MESMA leitura, na MESMA função, no MESMO
 * instante, e por construção `finalizadas <= ocupadas` e
 * `finalizadas === finalizadasOficial + finalizadasBanco`. O defeito que este módulo recusa é
 * GUARDAR um número que duplica outro, e nenhum dos quatro é guardado.
 */
export interface Ocupacao {
  ocupadas: number;
  /**
   * Posições ENTREGUES (`finalizaPosicao`), somando os DOIS lados. É o que enche o cilindro da vaga
   * e o que serve de gate do fechamento, e é sempre menor ou igual a `ocupadas`, porque quem entrega
   * também toma.
   */
  finalizadas: number;
  /**
   * ─ A ENTREGA PASSOU A TER DOIS NÚMEROS, e o total sozinho mentia ────────────────────────────
   *
   * MEDIDO NA VAGA REAL DE HOMOLOGAÇÃO (5 oficiais, 20 de banco), e não suposto: enquanto a entrega
   * era UM número, o cilindro OFICIAL contava quem tinha sido entregue à RESERVA, e a vaga aparecia
   * cheia do lado que ninguém tinha preenchido.
   *
   * ISTO NÃO É UM CONTADOR NOVO GUARDADO, e a distinção é a que este módulo inteiro defende: os
   * três números saem da MESMA leitura das candidaturas, na MESMA função, no MESMO instante,
   * separados pelo `posicao_lado` de cada linha. Vale sempre, por construção:
   *
   *   finalizadas === finalizadasOficial + finalizadasBanco
   *   finalizadas <= ocupadas
   *
   * Nenhum dos três é armazenado, então não existe o dia em que dois deles discordam.
   */
  finalizadasOficial: number;
  /** Entregues do lado BANCO. É o que o cilindro de Banco lê. */
  finalizadasBanco: number;
  /**
   * Posições oficiais menos a ocupação DO LADO OFICIAL, com piso em zero. Nula quando a vaga não tem
   * meta definida: ausência de meta não é meta zero.
   *
   * É A LEITURA DA TELA, NUNCA A TRAVA. Quem decide se cabe mais um conta de novo, por lado, dentro
   * da transação e com a linha da vaga travada.
   */
  livres: number | null;
  emSelecao: number;
  fora: number;
  /**
   * Mais gente no lado OFICIAL do que posições oficiais. Acontece quando a vaga DIMINUI depois de
   * aprovar, e o sistema NÃO desfaz aprovação nenhuma: mostra o excedente e deixa a correção para
   * gente.
   *
   * QUEM ESTÁ NA RESERVA NÃO EXCEDE A VAGA. A reserva tem meta própria e é medida contra ela; somar
   * os dois lados aqui declarava excedida a vaga de 5 oficiais VAZIAS com 20 pessoas no banco.
   */
  excedida: boolean;
}

/**
 * O QUE `ocupacaoDaVaga` ACEITA POR CANDIDATURA, e são DUAS FORMAS DA MESMA COISA.
 *
 * A FORMA CURTA (só a situação) É EXATAMENTE A LONGA COM O LADO NULO, e nulo é OFICIAL
 * (`ladoDaCandidatura`). Ela fica porque é o que toda linha de hoje é, e porque tirá-la obrigaria a
 * reescrever chamadas e testes já validados para dizer, com mais palavras, a mesma coisa.
 *
 * QUEM PRECISA SEPARAR OS LADOS PASSA A FORMA LONGA. Quem não precisa continua passando a curta e
 * recebe a resposta de antes, com toda a entrega no lado OFICIAL.
 */
export type ItemDeOcupacao =
  | CandidaturaSituacao
  | { situacao: CandidaturaSituacao; posicaoLado?: string | null };

function situacaoDoItem(i: ItemDeOcupacao): CandidaturaSituacao {
  return typeof i === "string" ? i : i.situacao;
}

function ladoDoItem(i: ItemDeOcupacao): PosicaoLado {
  return ladoDaCandidatura(typeof i === "string" ? null : i.posicaoLado);
}

/**
 * A RÉGUA DA OCUPAÇÃO, em uma função, e ela é a fonte única do módulo:
 *
 *   OCUPADAS    = candidaturas que TOMAM a posição (`consomePosicao`), somando os DOIS lados
 *   FINALIZADAS = candidaturas que ENTREGARAM a posição (`finalizaPosicao`), subconjunto das ocupadas
 *   ... OFICIAL  = as entregues cujo `posicao_lado` é OFICIAL (nulo vale OFICIAL)
 *   ... BANCO    = as entregues cujo `posicao_lado` é BANCO, e as duas somam FINALIZADAS
 *   LIVRES      = posições oficiais menos a ocupação DO LADO OFICIAL
 *   EXCEDIDA    = ocupação DO LADO OFICIAL maior que a meta oficial
 *   EM SELEÇÃO  = candidaturas ATIVAS, que NÃO consomem posição
 *   FORA        = DESCARTADO e DESISTIU, que nunca somam nem subtraem
 *
 * LIVRES CONTINUA SAINDO DE OCUPAÇÃO, E NÃO DE ENTREGA, e essa escolha é a que sustenta a trava 1:
 * quem foi aprovado tem a posição RESERVADA, mesmo antes da entrega, senão uma vaga de 10 aceitaria
 * 40 aprovações, cada uma dizendo à pessoa "você está dentro".
 *
 * ┌─ LIVRES E EXCEDIDA SÃO DO LADO OFICIAL, e era pela TERCEIRA porta que o mesmo defeito saía ─┐
 * │ META OFICIAL SÓ SE COMPARA COM OCUPAÇÃO OFICIAL. Enquanto as duas contas usavam o TOTAL, a  │
 * │ vaga de 5 oficiais com 20 pessoas na RESERVA devolvia `livres: 0` e `excedida: true`: a tela │
 * │ dizia que a vaga tinha estourado com as CINCO posições oficiais VAZIAS.                     │
 * │                                                                                            │
 * │ QUEM ESTÁ NA RESERVA NUNCA TORNA A VAGA EXCEDIDA, porque a reserva tem meta própria         │
 * │ (`tetoDoLado`) e é medida contra ela. É a mesma família dos outros dois defeitos: uma        │
 * │ contagem de dois lados medida contra um teto de um lado só.                                 │
 * │                                                                                            │
 * │ `ocupadas` NÃO MUDOU e continua sendo o total: ela responde outra pergunta ("quantas        │
 * │ posições desta vaga estão tomadas, no todo"), e é o service, dentro da transação, quem conta │
 * │ por lado para decidir se cabe mais um.                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A OCUPAÇÃO É SEMPRE DERIVADA, NUNCA ARMAZENADA. É a mesma decisão que a vaga já tinha tomado com
 * os contadores dela, e pelo mesmo motivo: um contador guardado é um segundo número, e dois números
 * que deveriam ser iguais acabam discordando no dia em que uma aprovação for desfeita, um descarte
 * for revertido ou uma linha for corrigida à mão no banco.
 *
 * `posicoesOficiais` NULA é vaga sem meta definida (o rascunho): `livres` fica nula e `excedida`
 * fica falsa, porque ausência de meta não é meta zero. Quem decide o que fazer com isso é o service.
 *
 * LIVRES TEM PISO EM ZERO: uma vaga excedida (9 aprovados NO OFICIAL em 8 posições) mostra zero
 * livres e `excedida = true`, e não "menos uma livre", que não é coisa que exista. Este caso é o
 * da vaga que ENCOLHEU depois de aprovar, e o sistema não desfaz aprovação nenhuma: mostra o
 * excedente e deixa a correção para gente.
 */
export function ocupacaoDaVaga(
  posicoesOficiais: number | null | undefined,
  itens: readonly ItemDeOcupacao[],
): Ocupacao {
  const situacoes = itens.map(situacaoDoItem);
  const ocupadas = situacoes.filter(consomePosicao).length;
  const emSelecao = situacoes.filter((s) => s === "ATIVO").length;
  const fora = situacoes.filter(ehSaidaSemExito).length;

  /*
   * OS TRÊS NÚMEROS DA ENTREGA SAEM DE UMA FILTRAGEM SÓ, e é isso que torna a invariante
   * `finalizadas === finalizadasOficial + finalizadasBanco` verdadeira POR CONSTRUÇÃO, e não por
   * três contagens que se conferem. Só existem dois lados (`POSICAO_LADOS`) e todo item cai em
   * exatamente um deles (`ladoDaCandidatura` coalesce o nulo e o desconhecido para OFICIAL), então
   * a soma das partes não tem como ser diferente do todo.
   */
  const entregues = itens.filter((i) => finalizaPosicao(situacaoDoItem(i)));
  const finalizadasBanco = entregues.filter((i) => ladoDoItem(i) === "BANCO").length;

  /*
   * A OCUPAÇÃO DO LADO OFICIAL sai da MESMA leitura, pela mesma separação de lado das entregues.
   * Não é contagem nova nem consulta nova: é o mesmo `itens`, filtrado por outra pergunta.
   *
   * É ELA, E NÃO O TOTAL, que a meta oficial enfrenta em `livres` e `excedida`. Quem está na
   * reserva é medido contra a meta DE BANCO, na trava, e não tem por que aparecer aqui.
   */
  const ocupadasOficial = itens.filter(
    (i) => consomePosicao(situacaoDoItem(i)) && ladoDoItem(i) === "OFICIAL",
  ).length;

  const meta = posicoesOficiais ?? null;
  return {
    ocupadas,
    finalizadas: entregues.length,
    finalizadasOficial: entregues.length - finalizadasBanco,
    finalizadasBanco,
    livres: meta === null ? null : Math.max(0, meta - ocupadasOficial),
    emSelecao,
    fora,
    excedida: meta !== null && ocupadasOficial > meta,
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
 * A CONTAGEM E O TETO TÊM DE SER DO MESMO LADO, e desde 08/09 é assim que o service a chama: a
 * ocupação do lado OFICIAL contra a meta oficial, a do lado BANCO contra a meta de banco
 * (`tetoDoLado`). Medir uma contagem TOTAL contra o teto de um lado só é o defeito que fazia a vaga
 * recusar o candidato oficial com zero posição oficial preenchida.
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

// ── O LADO DA POSIÇÃO: OFICIAL OU BANCO ─────────────────────────────────────

/**
 * ─ OS DOIS LADOS DA META DA VAGA, e por que a finalização precisa ESCOLHER um ──────────────────
 *
 * A vaga tem DUAS metas, e elas sempre existiram: `posicoes_oficiais` (a contratação de verdade) e
 * `posicoes_banco` (o excedente aprovado que fica de reserva). Até a finalização de posição existir,
 * ninguém precisava dizer de qual lado uma pessoa entrava, porque nada preenchia posição: o único
 * jeito de dizer "preenchi" era o número DIGITADO no fechamento, que já vinha separado em dois
 * campos.
 *
 * COM A FINALIZAÇÃO, A ESCOLHA VOLTA A EXISTIR, e ela é do consultor: alocar esta pessoa é entregar
 * uma posição OFICIAL, ou guardá-la no BANCO de reserva da vaga? As duas coisas acontecem na
 * operação, e adivinhar por ordem de chegada (as primeiras são oficiais, o resto é banco) apagaria a
 * intenção justamente no gesto que a cria.
 *
 * O LADO AUSENTE VALE OFICIAL, e isso não é chute: toda candidatura que existe hoje foi aprovada
 * contra a meta oficial, que era a única que a trava conhecia. Coalescer para OFICIAL é o que faz a
 * régua nova descrever, sem reescrever nada, o que o banco já tem gravado.
 */
export const POSICAO_LADOS = ["OFICIAL", "BANCO"] as const;
export type PosicaoLado = (typeof POSICAO_LADOS)[number];

/**
 * O lado de uma candidatura já gravada. NULO É OFICIAL (ver o bloco acima), e é por isso que a
 * coluna pode nascer nula em vez de exigir uma carga que reescreva as linhas antigas.
 */
export function ladoDaCandidatura(lado: string | null | undefined): PosicaoLado {
  return lado === "BANCO" ? "BANCO" : "OFICIAL";
}

/**
 * ─ O TETO DE POSIÇÕES DO LADO ESCOLHIDO, e ele é PRÓPRIO DE CADA LADO ─────────────────────────
 *
 * OFICIAL tem por teto a meta oficial. BANCO tem por teto a meta DE BANCO. Cada lado é medido
 * contra a ocupação DAQUELE lado, e o total da vaga continua sendo a soma dos dois: 5 oficiais e
 * 20 de banco comportam 25 pessoas, exatamente como antes.
 *
 * ┌─ POR QUE DEIXOU DE SER CUMULATIVO, e a premissa que mudou ─────────────────────────────────┐
 * │ O CUMULATIVO (banco medido contra oficiais MAIS banco) existia por UM motivo declarado: só  │
 * │ havia UMA contagem de ocupação, o `count(*)` sem lado, e somar as metas era o jeito de dois │
 * │ tetos conviverem com um número. Era coerente com a premissa, e a premissa acabou.           │
 * │                                                                                            │
 * │ COM A CONTAGEM SEPARADA, MANTER O CUMULATIVO PASSARIA A INFLAR A VAGA, e a conta é direta:  │
 * │ o lado BANCO passaria a comparar a ocupação DO BANCO (20) contra oficiais mais banco (25),  │
 * │ aceitando 25 pessoas SÓ no banco, e o lado oficial aceitaria mais 5 por cima. A vaga de 25  │
 * │ posições receberia 30. Misturar uma contagem por lado com um teto de dois lados soma a meta │
 * │ oficial duas vezes.                                                                        │
 * │                                                                                            │
 * │ E É O CUMULATIVO QUE PRODUZIA OS DOIS DEFEITOS MEDIDOS na vaga real de homologação (5       │
 * │ oficiais, 20 de banco): com 20 no banco, o candidato do lado OFICIAL batia em 25 e era      │
 * │ recusado com "as 5 posições já estão preenchidas", tendo ZERO posição oficial preenchida.   │
 * │                                                                                            │
 * │ ELE TAMBÉM DESCREVE O MODELO DO DIRETOR SEM RODEIO: "o banco é o excedente RESERVADO", e    │
 * │ reserva tem tamanho próprio. Uma vaga com 20 de banco tem 20 de banco, e não "até 25 se     │
 * │ ninguém for contratado".                                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * BANCO ZERO É TETO ZERO, e isso é resposta, não lacuna: a vaga que não reservou banco nenhum não
 * tem para onde mandar alguém no banco, e o cumulativo antigo deixava essa alocação consumir uma
 * posição OFICIAL em silêncio, que é a confusão que a separação existe para acabar. Quem transforma
 * o zero na frase que pede para reservar banco é o service.
 *
 * META OFICIAL NULA DEVOLVE NULO, DOS DOIS LADOS, e este fail-closed fica de pé mesmo com o teto do
 * banco não dependendo mais da meta oficial: vaga sem posições definidas é rascunho, e entregar
 * posição num rascunho é o caso em que a trava recusa pedindo a meta (`cabeMaisUm` devolve falso
 * para teto nulo). Mudar isto abriria a entrega de banco numa vaga que ninguém dimensionou.
 */
export function tetoDoLado(
  lado: PosicaoLado,
  posicoesOficiais: number | null | undefined,
  posicoesBanco: number | null | undefined,
): number | null {
  if (posicoesOficiais === null || posicoesOficiais === undefined) return null;
  return lado === "BANCO" ? (posicoesBanco ?? 0) : posicoesOficiais;
}

/**
 * A OCUPAÇÃO SEPARADA POR LADO, a partir do que o `group by posicao_lado` devolve.
 *
 * ELA EXISTE PARA O NULO NÃO VIRAR UM TERCEIRO LADO. O banco tem três valores possíveis na coluna
 * (`OFICIAL`, `BANCO` e `NULL`), e o domínio tem dois: dobrar o nulo em OFICIAL é `ladoDaCandidatura`,
 * e fazer isso aqui, em um lugar só, é o que impede cada consulta de escrever o próprio
 * `coalesce(posicao_lado, 'OFICIAL')` em SQL. Seria a mesma cópia de régua que este módulo já pagou
 * cinco vezes, com o agravante de a cópia em SQL não ser alcançada por nenhum teste de domínio.
 *
 * OS DOIS LADOS SEMPRE VOLTAM, mesmo zerados: quem lê precisa poder perguntar pelo lado que não tem
 * ninguém sem tratar `undefined`, e é justamente o lado vazio que a trava mais consulta.
 */
export function ocupadasPorLado(
  linhas: readonly { lado: string | null | undefined; quantas: number | string }[],
): Record<PosicaoLado, number> {
  const total: Record<PosicaoLado, number> = { OFICIAL: 0, BANCO: 0 };
  for (const l of linhas) total[ladoDaCandidatura(l.lado)] += Number(l.quantas);
  return total;
}

/**
 * ─ OS ACEITES REGISTRÁVEIS: quais guardas, ao serem destravadas, deixam log ────────────────────
 *
 * A RÉGUA É A §A.3 REGRA 8: aceite explícito que atravessa uma guarda gera log PERMANENTE e
 * CONSULTÁVEL, com quem, quando e o estado no instante da decisão. Esta lista diz QUAIS guardas
 * são essas, e é dela que sai tanto o valor gravado pelo service quanto o CHECK do banco: a lista
 * escrita duas vezes concorda por coincidência, e para de concordar na primeira guarda nova.
 *
 * LISTA FECHADA de propósito. Log de auditoria com valor livre vira texto que ninguém consulta
 * depois, e a pergunta "quantas vezes a guarda do banco foi atravessada" precisa de um `where`
 * exato, não de um `like`.
 *
 * `BANCO_COM_OFICIAIS_ABERTAS`: o consultor mandou alguém para a RESERVA sabendo que sobravam
 * posições OFICIAIS. O número guardado é quantas sobravam.
 *
 * `REENTRADA`: trazer de volta quem já esteve na vaga e saiu. PREVISTA E AINDA NÃO ESCRITA por
 * ninguém: aquele aceite mora na `alocar`, que é código validado e ficou fora do recorte da OST que
 * criou este log. O valor fica aqui para que ligá-lo seja uma linha de service, e não uma migration.
 */
export const ACEITE_BANCO_COM_OFICIAIS_ABERTAS = "BANCO_COM_OFICIAIS_ABERTAS";
export const ACEITE_REENTRADA = "REENTRADA";

/** A lista é MONTADA a partir dos nomes acima, e nunca redigitada: um nome, um lugar. */
export const ACEITES_REGISTRAVEIS = [
  ACEITE_BANCO_COM_OFICIAIS_ABERTAS,
  ACEITE_REENTRADA,
] as const;
export type AceiteRegistravel = (typeof ACEITES_REGISTRAVEIS)[number];

/**
 * QUANTAS POSIÇÕES OFICIAIS CONTINUAM ABERTAS se esta finalização for para o banco.
 *
 * É a conta do AVISO, e não de uma trava: o diretor decidiu que alocar no banco com oficial em
 * aberto AVISA e NÃO BLOQUEIA. Quem decide é o consultor, com o número na frente.
 *
 * ┌─ ELA PERGUNTA SOBRE AS OFICIAIS, E SÓ SOBRE ELAS (defeito medido, corrigido em 08/09) ─────┐
 * │ O PARÂMETRO É A OCUPAÇÃO DO LADO OFICIAL, e passar o total é o que fazia o aviso mentir e  │
 * │ depois sumir. Medido na vaga real de homologação (5 oficiais, 20 de banco): alocando um a  │
 * │ um NO BANCO, com as 5 oficiais SEMPRE vazias, o total subia 1, 2, 3, 4, 5 e a conta devolvia │
 * │ 5, 4, 3, 2, 1 e ZERO na quinta. O aviso desaparecia exatamente no caso que ele existe para │
 * │ dar: cinco posições oficiais abertas e ninguém indo para elas.                             │
 * │                                                                                            │
 * │ COM A OCUPAÇÃO OFICIAL, ELE RESPONDE 5 AS VINTE VEZES, porque é isso que está acontecendo. │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `ocupadasOficiaisSemEsta` exclui a candidatura que está sendo movida: se ela vai para o banco, a
 * posição oficial que ela poderia ter ocupado continua aberta, e é por isso que ela não entra na
 * conta.
 *
 * META NULA DEVOLVE ZERO, ou seja, não avisa. Não é omissão: sem meta oficial não existe "posição
 * oficial aberta" a informar, e a trava recusa a operação logo depois de qualquer jeito.
 */
export function oficiaisAindaAbertas(
  ocupadasOficiaisSemEsta: number,
  posicoesOficiais: number | null | undefined,
): number {
  if (posicoesOficiais === null || posicoesOficiais === undefined) return 0;
  return Math.max(0, posicoesOficiais - ocupadasOficiaisSemEsta);
}

// ── A TRAVA 5: A VAGA SÓ ENCERRA COM TODO MUNDO TRATADO ─────────────────────

/**
 * O QUE CONTA COMO CANDIDATO TRATADO, e é a lista inteira menos uma situação.
 *
 * TRATADO É TER RECEBIDO UMA DECISÃO, e não "ter dado certo": `DESCARTADO` e `DESISTIU` são
 * tratamentos tanto quanto `APROVADO` e `ENVIADO_PARA_ADMISSAO`. O que a regra impede é a vaga fechar deixando
 * gente PENDURADA no funil, sem ninguém nunca ter dito o que aconteceu com ela.
 *
 * `ALOCADO` ENTROU AQUI, e é a resposta separada que o parágrafo abaixo já exigia. Alocar é a
 * decisão MAIS definitiva de todas: a pessoa preencheu a posição oficial. Deixá-lo de fora faria
 * cada pessoa alocada contar como pendente de tratamento, e a vaga NÃO FECHARIA NUNCA pela trava 5,
 * justamente na vaga que deu certo. A falha seria barulhenta e imediata (a trava devolve a lista de
 * pendentes e o modal abre), que é o fail-closed prometido funcionando.
 *
 * SÓ `ATIVO` É PENDENTE. É a mesma situação que não consome posição (`consomePosicao`), e a
 * coincidência não é acidente: `ATIVO` é exatamente "está em seleção, ainda não se decidiu nada".
 * São réguas diferentes, porém, e por isso duas funções: uma responde "ocupa posição?" e a outra
 * responde "já foi decidido?". `ALOCADO` é a prova viva disso: ele é TRATADO desde já, e se ele
 * consome posição é pergunta de outra lista (`SITUACOES_QUE_FINALIZAM_POSICAO`, no `shared-types`).
 * No dia em que uma situação nova entrar, as duas perguntas terão de ser respondidas separadamente.
 */
export const SITUACOES_TRATADAS: CandidaturaSituacao[] = [
  "APROVADO",
  "ALOCADO",
  "ENVIADO_PARA_ADMISSAO",
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
 * sem êxito, o que dá `ATIVO` (em seleção), `APROVADO` e `ENVIADO_PARA_ADMISSAO` (que consomem posição, por
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
 * O OUTRO LADO DA MESMA MOEDA: as situações que ENCERRAM SEM ÊXITO.
 *
 * ELA EXISTE PARA O PREDICADO DO ÍNDICE PARCIAL no banco, que passou a descrever "viva" pelo
 * COMPLEMENTO (`db/schema/tables.ts`), e não pela lista positiva.
 *
 * A INVERSÃO NÃO É ESTILO, É A CORREÇÃO DE UM DEFEITO SILENCIOSO. O predicado de um índice parcial
 * guarda os valores COMPILADOS dentro dele, e `ALTER TYPE ... ADD VALUE` não o atualiza: com a lista
 * POSITIVA, toda situação nova nascia FORA da cobertura do índice, e o banco parava de barrar a
 * segunda linha viva do par pessoa/vaga sem nada falhar. Com o complemento, situação nova nasce
 * COBERTA, que é a mesma direção fail-closed de `SITUACOES_VIVAS` logo acima.
 *
 * DERIVADA, e nunca redigitada, pelo mesmo motivo de todas as outras deste arquivo: a lista escrita
 * à mão concorda com a função por coincidência.
 */
export const SITUACOES_ENCERRADAS_SEM_EXITO: CandidaturaSituacao[] =
  CANDIDATURA_SITUACOES.filter(ehSaidaSemExito);

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
