import { consomePosicao, isValidCpf, type CandidaturaSituacao } from "@ea/shared-types";
import { ehIdTecnicoDigai, pareceDocumentoOuTelefone } from "../as/digai/digai-grade";

/**
 * ─ O DOMINIO DA INGESTAO DO DIGAI: PURO, SEM NEST, SEM DRIZZLE E SEM REDE ──────────────────────
 *
 * Toda decisao que a ingestao do Digai toma vive aqui, como funcao determinista por argumento. Quem
 * vai ao banco e `as/digai/digai-repositorio.ts`; quem toca a rede e `as/digai/digai.cliente.ts`;
 * quem orquestra e `as/digai/digai-importacao.service.ts`. A separacao e o que permite auditar as
 * regras sem Postgres e sem producao de terceiro.
 *
 * A UNICA IMPORTACAO DE FORA DO DOMINIO E O ALFABETO DA GRADE, e ela e DELIBERADA: em ATS o
 * `userId` as vezes E o documento da pessoa, e duas copias da regra que decide isso divergiriam no
 * primeiro ajuste. A dependencia e de uma direcao so (o dominio le a grade, a grade nao le o
 * dominio), entao nao ha ciclo.
 *
 * §A.6 e PROTOCOLO LGPD: nada aqui loga. As funcoes que produzem TEXTO (`mascararParaLog`,
 * `erroDoRegistro`, `resumoSeguro`, `resumoDaImportacao`) sao justamente as barreiras entre o dado
 * e a superficie, e cada uma tem o seu bloco explicando do que ela protege.
 */

// ── 1. O QUE SE COLETA: UMA ALLOWLIST DE OITO, E NUNCA UMA DENYLIST ────────────────────────────

/**
 * ─ OS OITO CAMPOS, DITADOS PELO `seguranca` EM 29/09/2026 ──────────────────────────────────────
 *
 * ┌─ POR QUE ALLOWLIST, E O QUE A DENYLIST DEIXAVA PASSAR ───────────────────────────────────────┐
 * │ A versao anterior listava dez campos PROIBIDOS, e tinha dois furos medidos na auditoria:      │
 * │  1. `stages` NAO ESTAVA na lista, e ele e o campo mais pesado da decisao de 16/09: carrega    │
 * │     resposta e JULGAMENTO SOBRE A PESSOA, e foi excluido de TODA coleta, nem contagem;        │
 * │  2. comparar por igualdade nao pega CAMINHO ANINHADO (`stages[0].answer` nao e "stages"),     │
 * │     entao o campo entrava pela porta de baixo.                                                │
 * │                                                                                               │
 * │ A allowlist inverte o onus: campo novo do fornecedor nasce FORA, e quem quiser coletar tem de │
 * │ vir aqui e justificar. Denylist so protege do que alguem lembrou de escrever.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * FICAM DE FORA, nominalmente, para o dia em que alguem perguntar: `stages`, `answers`,
 * `disability`, `criminalRecord`, `matchLevel`, `matchPct`, `dnaScore`, `proficiencyTest`,
 * `likelyReading` e `rating`. Os dois primeiros por carregarem resposta e julgamento; os demais por
 * serem julgamento sobre a pessoa (protocolo, secao 3).
 *
 * ┌─ A SONDAGEM DA PRODUCAO DO FORNECEDOR (29/09/2026) MEDIU 41 CAMPOS, E A ALLOWLIST AGUENTOU ──┐
 * │ O registro real traz, entre outros, `justification` (1.556 caracteres), `attemptFeedback`     │
 * │ (771), `summarizedAnalysis`, `profileAssessment`, `requirementDetails` e `stages`: TODOS      │
 * │ julgamento sobre a pessoa, e todos FORA por serem campo novo que a allowlist nunca convidou.  │
 * │ `curriculumUrl` tambem fica de fora, e por razao propria: e URL de curriculo, PII pura, na    │
 * │ mesma regua da URL do Pandape (secao A.6), que nao se persiste nem se loga.                   │
 * │                                                                                               │
 * │ O QUE A SONDAGEM MUDOU: o campo `name` NAO EXISTE no fornecedor. O registro real traz         │
 * │ `firstname` e `lastname` SEPARADOS (`name` apareceu em 0 de 58 registros de um screening      │
 * │ real). Ler `o.name` devolvia `undefined` sempre, e todo candidato do Digai nasceria SEM NOME. │
 * │ Por isso a allowlist passa a ter OITO nomes de origem: sao os campos LIDOS do fornecedor, e o │
 * │ `name` da projecao e derivado dos dois, nao lido de lugar nenhum.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const CAMPOS_COLETADOS_DO_DIGAI = [
  "userId",
  "partnerJobId",
  "firstname",
  "lastname",
  "cpf",
  "email",
  "phoneNumber",
  "appliedAt",
] as const;

export type CampoColetadoDoDigai = (typeof CAMPOS_COLETADOS_DO_DIGAI)[number];

/**
 * O registro do Digai DEPOIS da projecao. Nenhum campo fora da allowlist chega a existir por aqui.
 *
 * `name` e DERIVADO (`firstname` mais `lastname`), e nao um campo do fornecedor: quem escreve no
 * banco recebe UM nome, e compor aqui evita que cada consumidor invente a sua propria juncao.
 */
export interface ResultadoDigai {
  userId: string;
  partnerJobId: string | null;
  name: string | null;
  cpf: string | null;
  email: string | null;
  phoneNumber: string | null;
  appliedAt: string | null;
}

/**
 * A PROJECAO POR ALLOWLIST, e ela acontece ANTES de o dado chegar ao dominio.
 *
 * O Pandape faz a mesma coisa em DOIS lugares (no servico que toca a rede e de novo no ciclo que
 * escreve), e a repeticao e o desenho: o dado que nao tem caminho ate o dominio tambem nao tem
 * caminho ate o banco, o log ou a fila. Aqui a segunda projecao acontece no repositorio, que so
 * cita colunas nominalmente.
 *
 * Devolve `null` quando nem o `userId` veio: sem chave estavel nao ha o que acompanhar, e inventar
 * uma criaria uma pessoa nova a cada volta.
 */
export function projetarResultadoDigai(cru: unknown): ResultadoDigai | null {
  if (typeof cru !== "object" || cru === null) return null;
  const o = cru as Record<string, unknown>;
  const userId = texto(o.userId);
  if (userId === null || !ehIdTecnicoDigai(userId)) return null;
  return {
    userId,
    partnerJobId: texto(o.partnerJobId),
    name: nomeComposto(o),
    cpf: texto(o.cpf),
    email: texto(o.email),
    phoneNumber: texto(o.phoneNumber),
    appliedAt: texto(o.appliedAt),
  };
}

/**
 * ─ O NOME, QUE O FORNECEDOR ENTREGA PARTIDO EM DOIS ────────────────────────────────────────────
 *
 * ┌─ COMO SE COMPOE, E POR QUE ASSIM ────────────────────────────────────────────────────────────┐
 * │ `firstname` e `lastname`, nesta ordem, unidos por UM espaco. A ordem e a da lingua e a mesma  │
 * │ que o resto da casa guarda em `as_candidatos.nome`, que e um campo unico: inverter produziria │
 * │ ficha que ninguem reconhece na busca por nome.                                                 │
 * │                                                                                               │
 * │ FALTANDO UM, VALE O OUTRO: meio nome e pior do que nome completo e melhor do que nada, porque │
 * │ ainda permite reconhecer a pessoa na fila de revisao. FALTANDO OS DOIS, e `null`, e quem      │
 * │ grava trata isso como "sem identificacao minima" e NAO cria a pessoa. Inventar rotulo aqui    │
 * │ encheria a base de linhas que ninguem reconhece.                                               │
 * │                                                                                               │
 * │ ESPACO INTERNO E COLAPSADO: o fornecedor entrega o campo como a pessoa digitou, e nome com    │
 * │ dois espacos no meio nao casa com o mesmo nome digitado de novo no cadastro manual.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function nomeComposto(o: Record<string, unknown>): string | null {
  const partes = [texto(o.firstname), texto(o.lastname)].filter((p): p is string => p !== null);
  if (partes.length === 0) return null;
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

// ── 1.1. O ENVELOPE DO FORNECEDOR, E ELE E O UNICO PONTO QUE CONHECE ESSE FORMATO ──────────────

/**
 * ─ TODA RESPOSTA DO DIGAI VEM EMBRULHADA EM `data.value`, E ISSO FOI MEDIDO ────────────────────
 *
 * ┌─ A FORMA REAL, sondada na producao do fornecedor em 29/09/2026 (somente leitura) ────────────┐
 * │ `{ message: [...], data: { value: <conteudo> } }`. NAO e array no topo, NAO tem `results` no │
 * │ topo, e `data` e OBJETO, nunca array. O `<conteudo>` varia por rota:                          │
 * │   listagem de screenings  -> `{ page, total, screenings: [...] }`                             │
 * │   listagem de resultados  -> `{ page, total, candidates: [...] }`   (e `candidates`, nao      │
 * │                                                                     `results`)                │
 * │   resultado de UM usuario -> UM registro plano                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O CODIGO ANTERIOR FAZIA, E POR QUE NINGUEM VIA ───────────────────────────────────────┐
 * │ A leitura aceitava `array no topo`, `{ results: [] }` ou `{ data: [] }`. NENHUMA DAS TRES     │
 * │ existe no fornecedor. Contra a resposta real ela devolvia lista VAZIA, e a projecao do        │
 * │ envelope inteiro devolvia `null` (o envelope nao tem `userId`). Resultado: TODO evento saia   │
 * │ por "sem registro correspondente", com zero escrito, zero erro e zero alarme. Falha silenciosa │
 * │ completa, que e o modo de falha mais caro que uma ingestao fail-closed pode ter.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTA FUNCAO E O UNICO PONTO DO SISTEMA QUE CONHECE O FORMATO DO FORNECEDOR. Um segundo lugar que
 * desembrulhasse por conta propria divergiria no primeiro ajuste, e a divergencia seria outra falha
 * silenciosa: o formato nao reconhecido nao levanta erro, some.
 *
 * ┌─ NAO TOLERA NADA FORA DA FORMA MEDIDA, E ESSA E A CORRECAO INTEIRA ──────────────────────────┐
 * │ Array no topo, `{ results: [...] }` e `data` como ARRAY sao FICCAO: o fornecedor nao emite   │
 * │ nenhuma das tres. Tolerar a forma inexistente foi exatamente o que deixou a implementacao    │
 * │ antiga passar sem nunca encostar na forma verdadeira, porque o duble mentiroso continuava    │
 * │ verde. Sem `data.value` nao se inventa conteudo: fail-closed, lista VAZIA, e o que nao e     │
 * │ reconhecido nao e ingerido.                                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function desembrulharRespostaDigai(resposta: unknown): {
  /** O conteudo de dentro de `data.value`. E ele que vira registro unico. */
  conteudo: unknown;
  /** A lista de dentro do conteudo (`candidates` ou `screenings`), ou vazia. */
  lista: unknown[];
} {
  const envelope = comoObjetoSimples(resposta);
  const dados = comoObjetoSimples(envelope?.data);
  // `data` como ARRAY cai aqui tambem, e cai de proposito: `comoObjetoSimples` recusa array.
  if (dados === null || !("value" in dados)) return { conteudo: null, lista: [] };

  const conteudo = dados.value;
  const c = comoObjetoSimples(conteudo);
  if (c === null) return { conteudo, lista: [] };
  if (Array.isArray(c.candidates)) return { conteudo, lista: c.candidates };
  if (Array.isArray(c.screenings)) return { conteudo, lista: c.screenings };
  return { conteudo, lista: [] };
}

// ── 2. OS DOIS ESTAGIOS DO DIGAI, E O DE/PARA QUE OS TRADUZ ────────────────────────────────────

/**
 * ─ POR QUE SAO DOIS ESTAGIOS, E NAO UMA LISTA DE ETAPAS DO FORNECEDOR ──────────────────────────
 *
 * O campo `stages` do resultado v2 foi excluido de TODA coleta por minimizacao (decisao do
 * `seguranca`, 16/09), entao NAO HA uma lista de etapas do Digai medida, e nao vai haver. O que FOI
 * medido e mais simples e mais forte:
 *
 *   SEM CPF = nao finalizou a triagem. COM CPF = finalizou.
 *
 * 12% tem CPF (1.656 de 13.248), e o CPF ATUALIZA NO MESMO REGISTRO: o `userId` nao muda.
 */
export const ETAPA_DIGAI_NAO_FINALIZOU = "triagem em andamento";
export const ETAPA_DIGAI_FINALIZOU = "triagem finalizada";

/** Uma linha do de/para, no molde das colunas da migration 0110. Nao e linha de funil. */
export interface DeParaEtapaDigai {
  /** A forma NORMALIZADA do rotulo externo, que e o que o unique (fonte, chave) guarda. */
  chaveExterna: string;
  /** O nome como o Digai o escreve, e como ele aparece na tela do de/para. Title Case (secao A.24). */
  rotuloExterno: string;
  /** O destino no catalogo `as_etapas_funil`. Codigo que JA EXISTE, nunca etapa nova. */
  etapaCodigo: string;
}

/**
 * ─ AS DUAS LINHAS DE DE/PARA DO DIGAI, E O ALVO E `CAPTACAO` NAS DUAS ──────────────────────────
 *
 * ┌─ O QUE DECIDIU O ALVO, e foi MEDIDO nos dois bancos em 29/09/2026 ───────────────────────────┐
 * │ `ea_automatic` (producao, 118 migrations) e `ea_automatic_homolog` (132) TEM CATALOGOS        │
 * │ DIFERENTES. `CANDIDATURA` so existe na homologacao, e a FK de `as_depara_etapa_externa` e     │
 * │ RESTRICT: semear para ela DERRUBA A MIGRATION EM PRODUCAO. `TRIAGEM` existe nos dois e esta   │
 * │ INATIVA na homologacao: a pessoa entra e ninguem a ve no seletor do funil.                    │
 * │                                                                                               │
 * │ O UNICO CONJUNTO PRESENTE E ATIVO NOS DOIS e `CAPTACAO`, `ENTREVISTA_SOULAN`,                 │
 * │ `ENTREVISTA_CLIENTE`, `APROVACAO` e `STAND_BY`. Duas chaves externas apontando para a MESMA   │
 * │ etapa JA E O PADRAO DA CASA (`lead` e `inscritos` do Pandape, migration 0110).                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NENHUM ALVO PODE TER `entrega_ao_cliente`, E ESTA REGRA E NOVA ─────────────────────────────┐
 * │ `as/vagas/derivar-status-da-vaga.ts:118` MUDA O STATUS DA VAGA SOZINHO quando existe          │
 * │ candidatura VIVA numa etapa marcada `entrega_ao_cliente`. A chegada em massa da triagem       │
 * │ (12.445 pessoas medidas) moveria o status de vagas sem autor, com `porId` nulo. Hoje so       │
 * │ `ENTREVISTA_CLIENTE` tem a marca, entao `CAPTACAO` esta segura; a regra fica escrita porque a │
 * │ marca e EDITAVEL pelo diretor na tela do funil, e um dia ela pode estar em outro caneco.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE O DIRETOR AINDA DECIDE: para qual etapa deve ir quem FINALIZOU a triagem. A resposta
 * natural seria `TRIAGEM`, e ela esta INATIVA na homologacao. Trocar isso e edicao de catalogo, que
 * e decisao dele (secao A.31), nao da fabrica. Mudando a decisao, muda ESTA lista e a semente, e
 * nada mais: o estagio da pessoa continua distinguivel pela CHAVE EXTERNA, que e estavel.
 */
export const ETAPAS_DIGAI: readonly DeParaEtapaDigai[] = [
  {
    chaveExterna: ETAPA_DIGAI_NAO_FINALIZOU,
    rotuloExterno: "Triagem Em Andamento",
    etapaCodigo: "CAPTACAO",
  },
  {
    chaveExterna: ETAPA_DIGAI_FINALIZOU,
    rotuloExterno: "Triagem Finalizada",
    etapaCodigo: "CAPTACAO",
  },
];

/**
 * O ESTAGIO DE UM REGISTRO, e quem responde e o CPF.
 *
 * CPF INVALIDO NAO E CPF: tratar lixo como finalizacao carimbaria conclusao em quem nao concluiu, e
 * o ATS repete `00000000000` com frequencia. O validador e o mesmo do resto do sistema, pelo mesmo
 * motivo do desempate do Pandape: uma regra propria aqui divergiria da que o cadastro manual usa.
 */
export function etapaDoResultadoDigai(registro: unknown): string {
  const r = comoRegistro(registro);
  const cpf = (r?.cpf ?? "").toString().replace(/\D/g, "");
  return cpf !== "" && isValidCpf(cpf) ? ETAPA_DIGAI_FINALIZOU : ETAPA_DIGAI_NAO_FINALIZOU;
}

/**
 * ─ A SITUACAO EM QUE A CANDIDATURA DO DIGAI NASCE, E ELA NAO PODE CONSUMIR POSICAO ─────────────
 *
 * A OCUPACAO da vaga e DERIVADA (`consomePosicao`, `@ea/shared-types`), contando `APROVADO` mais o
 * que finaliza. Trazer 13.248 candidatos de TRIAGEM numa situacao que consome posicao NAO GERA ERRO
 * NENHUM: apenas TRANCA todas as vagas, porque o numero que decide se ainda cabe alguem passa a
 * contar quem so foi triado. Triagem nao e entrega.
 */
export const SITUACAO_NASCIMENTO_DIGAI: CandidaturaSituacao = "ATIVO";

/**
 * ─ A ASSERCAO QUE FALTAVA: A SITUACAO ESCRITA REPROVA EM `consomePosicao`, EM CODIGO ────────────
 *
 * ┌─ O BURACO, achado pelo `seguranca` em 29/09/2026 ────────────────────────────────────────────┐
 * │ A gravacao usava `resolucao.situacao ?? SITUACAO_NASCIMENTO_DIGAI`, e o primeiro termo vem da │
 * │ LINHA do de/para, que e DADO e nao codigo. O comentario ao lado jurava que a situacao de      │
 * │ nascimento nao consome posicao, e isso so era verdade do FALLBACK: uma linha editada por SQL  │
 * │ cru poria a triagem inteira numa situacao que consome, e isso TRANCA as vagas em massa sem    │
 * │ NADA FALHAR, porque a ocupacao e derivada e ninguem a valida.                                  │
 * │                                                                                               │
 * │ Era pedido explicito do mapa de alcance, secao 5, e nao tinha sido construido. Comentario nao │
 * │ e guarda: o que garante a regra e esta funcao, que TODA gravacao atravessa.                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * RECUSAR A LINHA HOSTIL, E NAO A PESSOA: a situacao que consome posicao e DESCARTADA e o
 * nascimento volta ao padrao seguro. Barrar a ingestao inteira punia o candidato por um erro de
 * configuracao, e deixar passar trancava a vaga. O chamador avisa, para que a linha errada seja
 * corrigida em vez de seguir ignorada para sempre.
 */
export function situacaoDeNascimentoDigai(daLinhaDeDePara: CandidaturaSituacao | null | undefined): {
  situacao: CandidaturaSituacao;
  /** A situacao da linha foi descartada por consumir posicao? Quem grava usa isto para avisar. */
  descartada: boolean;
} {
  if (daLinhaDeDePara === null || daLinhaDeDePara === undefined) {
    return { situacao: SITUACAO_NASCIMENTO_DIGAI, descartada: false };
  }
  if (consomePosicao(daLinhaDeDePara)) {
    return { situacao: SITUACAO_NASCIMENTO_DIGAI, descartada: true };
  }
  return { situacao: daLinhaDeDePara, descartada: false };
}

// ── 2.1. A REGUA DE ADMISSAO: QUEM DA TRIAGEM ENTRA, E QUEM AINDA NAO ENTRA ────────────────────

/**
 * ─ O PORTAO DA ADMISSAO, E ELE TEM NOME PORQUE UM DIA VAI SER TROCADO ──────────────────────────
 *
 * ┌─ A DECISAO DO DIRETOR (29/09/2026) ──────────────────────────────────────────────────────────┐
 * │ A ingestao traz APENAS quem FINALIZOU a triagem. Medido na producao do fornecedor: 4 de 58    │
 * │ numa pagina e 382 de 2.298 em 60 screenings, ou seja 12% a 17% do universo. Sao os que        │
 * │ avancaram de verdade, e sao eles que a operacao quer ver na fila.                              │
 * │                                                                                               │
 * │ O TERRENO FICA PREPARADO PARA OS DEMAIS, e preparado nao e construido: o ponto de decisao      │
 * │ EXISTE, tem NOME, e esta testado dos DOIS lados. A ingestao dos nao finalizados NAO foi        │
 * │ construida (secao A.31), e nao precisa ser: ela ja funciona, basta abrir o portao.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ COMO SE ABRE, NO DIA EM QUE O DIRETOR QUISER OS DEMAIS ─────────────────────────────────────┐
 * │ Trocar esta constante para `false`. E SO ISSO, e e de proposito: `admitidoNaIngestaoDigai`     │
 * │ passa a devolver `true` para todo registro, `separarPorFinalizacaoDigai` devolve a lista       │
 * │ inteira em `admitidos`, e o resto da ingestao (plano, espelho de vaga, dedup, de/para,         │
 * │ gravacao) JA TRATA quem nao finalizou: o de/para tem a linha `triagem em andamento` desde      │
 * │ sempre, e `etapaDoResultadoDigai` ja o distingue. Nenhuma outra linha muda.                    │
 * │                                                                                               │
 * │ O QUE NAO SE FAZ: espalhar a pergunta "finalizou?" pelo servico, em `if` solto. Um `if` no     │
 * │ orquestrador nao e testavel sem Nest, nao tem nome para o diretor apontar, e reaparece em      │
 * │ segunda copia no primeiro caminho novo de ingestao (a varredura em lote, por exemplo).         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const INGERIR_SOMENTE_QUEM_FINALIZOU = true;

/**
 * O REGISTRO ENTRA NA INGESTAO?
 *
 * Com o portao fechado (o padrao de hoje), so entra quem FINALIZOU, e quem responde por isso e o
 * CPF, pelo mesmo criterio medido da secao 2. Quem nao entra NAO VIRA PESSOA, NAO VIRA CANDIDATURA
 * e NAO VIRA VAGA: nada e escrito por causa dele, que e a diferenca entre "nao mostrar" e "nao
 * coletar". Minimizacao (protocolo, secao 3) e nao filtro de tela.
 */
export function admitidoNaIngestaoDigai(
  registro: unknown,
  /**
   * O PORTAO E PARAMETRO COM PADRAO NOMEADO, e nao uma constante lida por dentro, POR UMA RAZAO DE
   * PROVA: constante lida por dentro so e testavel do lado em que ela esta hoje, e o outro lado
   * teria de ser "provado" lendo o codigo-fonte, que e afirmar sobre o texto e nao sobre o
   * comportamento. Assim os DOIS lados sao exercitados de verdade, e o padrao continua sendo a
   * decisao do diretor: quem chama sem dizer nada obtem o portao FECHADO.
   */
  somenteQuemFinalizou: boolean = INGERIR_SOMENTE_QUEM_FINALIZOU,
): boolean {
  if (!somenteQuemFinalizou) return true;
  return etapaDoResultadoDigai(registro) === ETAPA_DIGAI_FINALIZOU;
}

/**
 * ─ A SEPARACAO, E ELA E O QUE FAZ O NUMERO FECHAR ──────────────────────────────────────────────
 *
 * ┌─ POR QUE "NAO FINALIZOU" E UM QUARTO CASO, E NAO UM ADIADO ──────────────────────────────────┐
 * │ O resumo da importacao ja tinha tres: ESCRITO, ADIADO e IGNORADO. ADIADO e falta de ELO COM A │
 * │ VAGA, e e REPROCESSAVEL: o registro volta quando o `partnerJobId` aparecer. IGNORADO e quem a │
 * │ base JA CONHECE. Quem nao finalizou nao e nenhum dos dois, e contabiliza-lo como adiado faria │
 * │ o log MENTIR SOBRE O MOTIVO: quem lesse iria procurar o elo da vaga que nunca faltou.          │
 * │                                                                                               │
 * │ E ele PRECISA ser contado, com nome proprio, senao a soma nao fecha com o total lido e a       │
 * │ diferenca vira "sumiu no caminho", que e o modo de falha mais caro de uma ingestao.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Generica no tipo de proposito: serve ao registro CRU (antes da projecao) e ao ja projetado, sem
 * que exista uma segunda copia da regra para cada forma.
 */
export function separarPorFinalizacaoDigai<T>(
  registros: readonly T[],
  somenteQuemFinalizou: boolean = INGERIR_SOMENTE_QUEM_FINALIZOU,
): { admitidos: T[]; naoFinalizaram: T[] } {
  const admitidos: T[] = [];
  const naoFinalizaram: T[] = [];
  for (const r of registros) {
    if (admitidoNaIngestaoDigai(r, somenteQuemFinalizou)) admitidos.push(r);
    else naoFinalizaram.push(r);
  }
  return { admitidos, naoFinalizaram };
}

// ── 3. A IDEMPOTENCIA, E ELA E EXPLICITA ───────────────────────────────────────────────────────

/**
 * A CHAVE DO REGISTRO E O `userId`, QUE A VARREDURA PROVOU ESTAVEL.
 *
 * NAO PODE SER O CPF: 88% dos registros nao o tem, e ele APARECE DEPOIS no MESMO registro. Chave
 * que muda quando a pessoa finaliza duplicaria exatamente quem finalizou, que e a unica populacao
 * que importa.
 */
export function chaveDoRegistroDigai(registro: unknown): string {
  return (comoRegistro(registro)?.userId ?? "").toString();
}

/** Um item do plano. So a CHAVE tecnica, nunca o registro: plano nao e lugar de dado pessoal. */
export interface ItemDoPlanoDigai {
  chave: string;
}

export interface PlanoDaImportacaoDigai {
  /** Registros novos, com elo de vaga resolvido. */
  criar: ItemDoPlanoDigai[];
  /** Registros que a base ja conhece pela chave. */
  ignorar: ItemDoPlanoDigai[];
  /**
   * Registros sem `partnerJobId` utilizavel: a criacao e ADIADA e REPROCESSAVEL, nunca inventada.
   * Mesmo precedente do `cod_cliente` do Pandape (secao A.5). Adiamento que marcasse o registro
   * como processado seria descarte com outro nome.
   */
  adiar: ItemDoPlanoDigai[];
}

/**
 * ─ O PLANO, DECIDIDO ANTES DE QUALQUER ESCRITA ─────────────────────────────────────────────────
 *
 * `as_candidaturas` tem UNIQUE PARCIAL `(candidato_id, vaga_id)` sobre as situacoes VIVAS.
 * Reprocessar o mesmo par BATE no unique, e o que se ganha ao planejar antes e a diferenca entre
 * "nao duplicou" e "estourou a transacao no meio do lote e perdeu as linhas boas".
 *
 * A DEDUPLICACAO TAMBEM VALE DENTRO DO LOTE: o mesmo `userId` repetido na mesma pagina entra uma
 * vez so. Sem isso a corrida seria interna, e a segunda linha bateria no unique que a primeira
 * acabou de criar.
 */
export function planoDaImportacao(entrada: {
  registros: unknown[];
  jaImportados: readonly string[];
}): PlanoDaImportacaoDigai {
  const conhecidas = new Set(entrada.jaImportados.map((c) => String(c)));
  const vistas = new Set<string>();
  const plano: PlanoDaImportacaoDigai = { criar: [], ignorar: [], adiar: [] };

  for (const registro of entrada.registros) {
    const chave = chaveDoRegistroDigai(registro);
    if (chave === "" || vistas.has(chave)) continue;
    vistas.add(chave);
    if (conhecidas.has(chave)) {
      plano.ignorar.push({ chave });
      continue;
    }
    if (espelhoDaVagaDigai(registro) === null) {
      plano.adiar.push({ chave });
      continue;
    }
    plano.criar.push({ chave });
  }
  return plano;
}

// ── 4. A VAGA ESPELHADA, QUE CONVERGE COM A DO PANDAPE ─────────────────────────────────────────

/**
 * ─ A VAGA DO DIGAI NASCE SEM CLIENTE, EM REVISAO, NA MESMA LINHA DO ESPELHO DO PANDAPE ─────────
 *
 * ┌─ A CHAVE E `id_vacancy_pandape`, E ISSO E DESENHO E NAO COINCIDENCIA ────────────────────────┐
 * │ O `partnerJobId` do Digai E o id da vaga do Pandape (confirmado pelo Ivan). Logo o espelho do │
 * │ Digai e o do Pandape convergem para a MESMA LINHA, pela MESMA chave de conflito. Uma coluna   │
 * │ propria do Digai criaria DUAS vagas para a mesma vaga, e as candidaturas se dividiriam entre  │
 * │ elas sem ninguem notar, ate a contagem de posicoes parar de fechar com a realidade.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `cod_cliente` NULO E O CERTO, e nao contradiz a secao A.5: o screening do Digai NAO TEM cliente
 * nem posicoes. Em `vagas` a coluna e NULAVEL de proposito, e a decisao registrada e "vaga sem
 * cliente resolvido ENTRA, marcada para vinculo manual". Cliente inventado passa despercebido para
 * sempre; cliente ausente aparece na fila de revisao.
 *
 * `PENDENTE_REVISAO` E A FILA, e nao o rascunho: no rascunho a vaga espelhada ficava
 * indistinguivel da que um consultor comecou a digitar, e ninguem sabia que faltava vincular o
 * cliente. O papel REVISAO recebe candidato (a candidatura entra desde o primeiro ciclo) e so sai
 * pela liberacao, que confere o cliente.
 *
 * O `partnerJobId` VEM DO PAYLOAD DO FORNECEDOR, entao ele passa pelo alfabeto fechado antes de
 * virar chave de conflito: e a mesma regra do id de rota, pela mesma razao (o valor viaja para
 * consulta, log e chave de job).
 */
export function espelhoDaVagaDigai(registro: unknown): Record<string, unknown> | null {
  const r = comoRegistro(registro);
  const elo = (r?.partnerJobId ?? "").toString().trim();
  if (elo === "" || !ehIdTecnicoDigai(elo)) return null;
  return {
    id_vacancy_pandape: elo,
    cod_cliente: null,
    cargo_id: null,
    status: "PENDENTE_REVISAO",
  };
}

// ── 5. OS DOIS PORTOES DA INERCIA ──────────────────────────────────────────────────────────────

/**
 * ─ O SEGUNDO PORTAO: SEM `DIGAI_INGESTAO_ATIVA`, NADA E ESCRITO NO BANCO ───────────────────────
 *
 * O primeiro portao e a credencial: sem `DIGAI_API_TOKEN` nada sai para a rede. Este e o que impede
 * o BANCO de ser tocado por default, e os dois nao sao redundantes: uma integracao que comeca a
 * escrever no dia em que o token chega nao foi LIGADA, foi SURPREENDIDA. O universo medido e de
 * 12.445 pessoas.
 *
 * SO `true` LIGA. Ausente, vazio e qualquer outra coisa deixam desligado, porque o fail-closed vale
 * inclusive para o erro de digitacao no `.env`.
 */
export function ingestaoHabilitada(env: Record<string, string | undefined>): boolean {
  return (env.DIGAI_INGESTAO_ATIVA ?? "").trim().toLowerCase() === "true";
}

// ── 6. AS BARREIRAS ENTRE O DADO E A SUPERFICIE ────────────────────────────────────────────────

/**
 * OS CAMPOS QUE PODEM SER IMPRESSOS INTEIROS, em lista EXATA de nomes.
 *
 * ┌─ A ARMADILHA 3 DO PROTOCOLO (secao 1.1), e ela custou um vazamento real ─────────────────────┐
 * │ `"titulo"` como PISTA de campo seguro fez `tituloEleitor` ser impresso como se fosse rotulo.  │
 * │ Casar por SUBSTRING pega o campo errado, e o campo errado costuma ser justamente o documento. │
 * │ A lista e de nomes EXATOS, e campo que nao esta nela tem o VALOR suprimido, sem excecao.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const CAMPOS_SEGUROS_PARA_LOG: ReadonlySet<string> = new Set([
  "userId",
  "partnerJobId",
  "screeningId",
  "attemptId",
  "appliedAt",
  "occurredAt",
  "event",
  "page",
  "total",
  "contagem",
  "chave",
]);

const SUPRIMIDO = "[suprimido]";

/**
 * ─ A MASCARA, E O QUE ELA TEM DE FAZER PARA NAO SER TEATRO ─────────────────────────────────────
 *
 * ┌─ A REGRA DE OURO, e ela vem de um VERDE FALSO ───────────────────────────────────────────────┐
 * │ Em 16/09 o teste de mascaramento procurava o PLACEHOLDER na saida, o placeholder ESTAVA la, e │
 * │ o valor real estava impresso ao lado. O teste passava afirmando exatamente o contrario do que │
 * │ queria afirmar. A mascara so vale se o VALOR nao sobreviver, em NENHUMA das suas formas: sem  │
 * │ pontuacao, com mascara, com espaco e dentro de JSON escapado.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SAO DUAS CAMADAS, E NENHUMA BASTA SOZINHA:
 *   1. a SUPRESSAO POR CAMPO, para objeto: o que nao esta na lista exata tem o valor trocado. E ela
 *      que alcanca NOME e qualquer campo novo que o fornecedor invente amanha, porque nome nao tem
 *      formato e nenhuma expressao regular o encontra;
 *   2. a REDACAO POR FORMA, sobre o texto final: e ela que alcanca o caso mais comum de vazamento,
 *      que e alguem interpolar um valor solto numa frase, onde nao ha campo nenhum a inspecionar.
 */
export type EstruturaParaLog = Record<string, unknown> | readonly unknown[];

export function mascararParaLog(entrada: EstruturaParaLog): string {
  /*
   * ─ A PORTA E DE ESTRUTURA, E ISSO E MECANISMO E NAO RECOMENDACAO (achado do `seguranca`) ────
   *
   * ┌─ O QUE ESTAVA ABERTO ────────────────────────────────────────────────────────────────────┐
   * │ A assinatura era `unknown`, e o caminho de STRING devolvia `redigirPorForma(entrada)`.    │
   * │ A camada 2 NAO ALCANCA NOME (nome nao tem forma), entao texto solto do fornecedor passava │
   * │ INTEIRO. Nao havia violacao medida, porque o unico chamador do caminho de string          │
   * │ (`resumirParaLog`) nao tinha consumidor nenhum. Ou seja: a garantia era DISCIPLINA.        │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * AGORA SAO DUAS TRAVAS, e as duas precisam existir:
   *   1. O TIPO recusa string em tempo de compilacao, que e onde o erro custa menos;
   *   2. O TEMPO DE EXECUCAO recusa o resto, porque `unknown` com `as` atravessa o tipo e porque
   *      o que chega do fornecedor nunca teve tipo de verdade. O que a camada 1 nao pode
   *      INSPECIONAR CAMPO A CAMPO nao sai daqui: suprime-se POR INTEIRO.
   *
   * SUPRIMIR TUDO E O LADO SEGURO DO ERRO: perder uma frase de diagnostico custa menos do que
   * publicar um nome. Redigir por forma um texto que ninguem inspecionou seria teatro, porque a
   * saida PARECERIA mascarada com o nome legivel dentro dela, que e exatamente o verde falso de
   * 16/09 que este bloco existe para nao repetir.
   */
  if (typeof entrada !== "object" || entrada === null) return SUPRIMIDO;
  return redigirPorForma(JSON.stringify(suprimirCampos(entrada) ?? ""));
}

/** A camada 1: o valor de todo campo fora da lista EXATA e trocado, em qualquer profundidade. */
function suprimirCampos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map((v) => suprimirCampos(v));
  if (typeof valor !== "object" || valor === null) return valor;
  const saida: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!CAMPOS_SEGUROS_PARA_LOG.has(chave)) {
      saida[chave] = SUPRIMIDO;
      continue;
    }
    saida[chave] = typeof v === "object" && v !== null ? suprimirCampos(v) : v;
  }
  return saida;
}

/**
 * A camada 2: as formas que carregam dado pessoal mesmo sem campo.
 *
 * A ORDEM IMPORTA. O e-mail sai primeiro porque ele contem digitos que o redator numerico cortaria
 * pela metade, deixando o resto legivel. Depois o documento nas tres grafias, depois o telefone nas
 * grafias com pontuacao, e por ultimo qualquer corrida longa de digitos, que cobre titulo de
 * eleitor, PIS e o que vier.
 *
 * ┌─ O TELEFONE FORMATADO ERA UM BURACO MEDIDO (ressalva A2 do `seguranca`, 29/09) ──────────────┐
 * │ `\d{8,}` so alcanca o telefone COLADO. `(11) 98765-4321` nao tem nenhuma corrida de oito      │
 * │ digitos, entao atravessava a mascara INTEIRO. Como e a forma em que telefone costuma ser      │
 * │ escrito por gente, era justamente a grafia mais provavel de aparecer numa frase interpolada.  │
 * │ A sobre-redacao e o lado seguro do erro: perder um numero de protocolo no log custa menos do  │
 * │ que publicar um telefone.                                                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTA CAMADA NAO ALCANCA, E NAO VAI ALCANCAR: NOME (ressalva A1) ──────────────────────┐
 * │ NOME NAO TEM FORMA. Nenhuma expressao regular distingue "Fulano De Teste" de qualquer outro   │
 * │ texto, e uma heuristica de maiusculas comeria as mensagens que a casa escreve. Quem alcanca   │
 * │ nome e a CAMADA 1, por SUPRESSAO DE CAMPO, e ela so existe no caminho de OBJETO.              │
 * │                                                                                               │
 * │ CONSEQUENCIA PRATICA, e ela DEIXOU DE SER UMA REGRA ESCRITA PARA VIRAR MECANISMO: o caminho  │
 * │ de STRING de `mascararParaLog` NAO EXISTE MAIS. A porta aceita SO ESTRUTURA (no tipo), e o    │
 * │ que nao for objeto ou lista e suprimido POR INTEIRO em tempo de execucao. Valor vindo do      │
 * │ fornecedor se mascara como OBJETO, sempre, para que a camada 1 o alcance. Interpolar um nome  │
 * │ numa frase continua sendo vazamento, e agora a mascara nao finge desfaze-lo: ela apaga tudo.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function redigirPorForma(texto: string): string {
  return (
    texto
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, SUPRIMIDO)
      .replace(/\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2}/g, SUPRIMIDO)
      // Telefone com DDD, com ou sem parenteses, com ou sem codigo de pais: `(11) 98765-4321`.
      .replace(/(?:\+\d{1,3}[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g, SUPRIMIDO)
      // Telefone sem DDD, que so e reconhecivel pelo separador: `98765-4321`.
      .replace(/\b\d{4,5}[\s.-]\d{4}\b/g, SUPRIMIDO)
      .replace(/\d{8,}/g, SUPRIMIDO)
  );
}

/**
 * ─ O PISO DE SUPRESSAO, E ELE COBRE CONTAGEM E PORCENTAGEM, SEMPRE JUNTAS ──────────────────────
 *
 * ┌─ O VETO 4 DE 16/09, na integra ──────────────────────────────────────────────────────────────┐
 * │ Suprimir a contagem e imprimir `(33%)` com o denominador ao lado NAO E SUPRIMIR: 33% de 3 e   │
 * │ 1, e a pessoa volta a ser identificavel por aritmetica de primeira serie.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PISO VALE PARA OS DOIS LADOS, e esquecer o complemento e a forma que a supressao toma quando
 * volta a furar: 99 de 100 identifica UMA pessoa pela AUSENCIA, exatamente como 1 de 100 a
 * identifica pela presenca.
 *
 * ABAIXO DO PISO NAO SAI NUMERO NENHUM, nem o total: imprimir o denominador sozinho, com o rotulo
 * ao lado, ja daria metade da conta a quem quisesse fecha-la.
 */
export const PISO_DE_SUPRESSAO = 5;

export function resumoSeguro(r: { rotulo: string; contagem: number; total: number }): string {
  const contagem = Math.max(0, Math.trunc(r.contagem));
  const total = Math.max(0, Math.trunc(r.total));
  const complemento = total - contagem;
  if (contagem < PISO_DE_SUPRESSAO || complemento < PISO_DE_SUPRESSAO) {
    return `${r.rotulo}: contagem suprimida pelo piso de reidentificacao`;
  }
  const pct = Math.round((contagem / total) * 100);
  return `${r.rotulo}: ${contagem} de ${total} (${pct}%)`;
}

/**
 * O ERRO DE UM REGISTRO: o MOTIVO e o ID TECNICO, e nada mais.
 *
 * SEM O ID TECNICO NINGUEM INVESTIGA, e um erro que ninguem investiga e ruido; COM o dado da pessoa
 * ele vira vazamento multiplicado pelo tamanho do lote, porque erro por registro sai uma vez por
 * linha. O id passa pelo alfabeto fechado antes de ser ecoado, pelo mesmo motivo de sempre: em ATS
 * o identificador as vezes E o documento.
 */
export function erroDoRegistro(registro: unknown, motivo: string): string {
  const chave = chaveDoRegistroDigai(registro);
  const id = ehIdTecnicoDigai(chave) ? chave : "id tecnico invalido";
  return `${redigirPorForma(motivo)} (registro ${id})`;
}

/**
 * O RETORNO DA IMPORTACAO: CONTAGEM e ESTRUTURA, nunca identificador direto.
 *
 * Retorno de LISTA e onde o vazamento vem MULTIPLICADO pelo tamanho da pagina (protocolo, secao 1),
 * e por isso esta funcao devolve um objeto de numeros: nao ha campo em que um nome caiba.
 */
export function resumoDaImportacao(registros: unknown[]): {
  total: number;
  finalizaram: number;
  emAndamento: number;
  semEloDeVaga: number;
} {
  let finalizaram = 0;
  let semEloDeVaga = 0;
  for (const r of registros) {
    if (etapaDoResultadoDigai(r) === ETAPA_DIGAI_FINALIZOU) finalizaram += 1;
    if (espelhoDaVagaDigai(r) === null) semEloDeVaga += 1;
  }
  return {
    total: registros.length,
    finalizaram,
    emAndamento: registros.length - finalizaram,
    semEloDeVaga,
  };
}

/**
 * ─ O ERRO DO DRIVER DO POSTGRES VAZA CPF SEM NINGUEM ESCREVER A PALAVRA CPF ────────────────────
 *
 * ┌─ O CAMINHO EXATO, e ele e o menos vigiado de todos ──────────────────────────────────────────┐
 * │ O driver devolve `detail` com o VALOR que violou a restricao (`Key (cpf)=(...) already        │
 * │ exists`) e `query` com os parametros. Um `log.erro(err)` publica os dois, e o texto ainda vai │
 * │ para o `failedReason` do job, que o BullMQ guarda no REDIS sem TTL, fora do alcance de um     │
 * │ expurgo que so conhece Postgres.                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TRADUTOR DEVOLVE FRASE FIXA para o que ele reconhece, e para o resto devolve a MENSAGEM
 * redigida. Nem `detail`, nem `query`, nem `where` atravessam daqui, e a lista de codigos existe
 * para o diagnostico continuar possivel sem o valor.
 */
export function traduzirErroDeBanco(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; constraint_name?: unknown; message?: unknown };
  const codigo = typeof e.code === "string" ? e.code : "";
  const restricao = typeof e.constraint_name === "string" ? e.constraint_name : "";
  const sufixo = restricao === "" ? "" : ` (restricao ${restricao})`;
  if (codigo === "23505") return `violacao de chave unica no banco${sufixo}`;
  if (codigo === "23503") return `violacao de chave estrangeira no banco${sufixo}`;
  if (codigo === "23514") return `violacao de regra de verificacao no banco${sufixo}`;
  if (codigo === "23502") return `coluna obrigatoria sem valor no banco${sufixo}`;
  if (codigo !== "") return `falha no banco, codigo ${codigo}${sufixo}`;
  const mensagem = typeof e.message === "string" ? e.message : "";
  return mensagem === "" ? "falha no banco sem mensagem" : redigirPorForma(mensagem);
}

// ── 7. O FUNIL ENTRE O CORPO CRU DO EVENTO E O RESTO DO SISTEMA ────────────────────────────────

/**
 * ─ OS IDENTIFICADORES DO EVENTO `NEW_APPLICATION`, E SO ELES ───────────────────────────────────
 *
 * ┌─ POR QUE A VALIDACAO NAO PODE VIVER SO NA GRADE ─────────────────────────────────────────────┐
 * │ A grade e a ultima barreira e protege a URL. Mas o id do payload e interpolado em MAIS lugares │
 * │ que a URL: chave de job (que vive no Redis e aparece em toda tela de diagnostico de fila),     │
 * │ mensagem de log, `where` de consulta. Validar so na grade deixa todos os outros caminhos sem   │
 * │ dono, e o evento e a UNICA entrada do sistema cujo conteudo QUEM ESCREVE E O FORNECEDOR.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE SAI DAQUI E O QUE VAI PARA A FILA. O corpo do evento carrega nome, e-mail, telefone e CPF, e
 * nada disso atravessa: o payload do BullMQ FICA NO REDIS, com `removeOnFail` e sem TTL, fora do
 * alcance do expurgo. Redis com dado de candidato dentro e banco de dados com outro nome, e ninguem
 * o auditaria (achado 2 do `seguranca` na varredura do Pandape).
 *
 * `null` E RECUSA, e o chamador a transforma em 400 SEM ecoar o corpo.
 */
export function identificadoresDoEvento(corpo: unknown): Record<string, string> | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const o = corpo as Record<string, unknown>;
  const screeningId = texto(o.screeningId);
  const userId = texto(o.userId);
  if (!ehIdTecnicoDigai(screeningId) || !ehIdTecnicoDigai(userId)) return null;
  const ids: Record<string, string> = { screeningId, userId };
  const attemptId = texto(o.attemptId);
  if (attemptId !== null) {
    if (!ehIdTecnicoDigai(attemptId)) return null;
    ids.attemptId = attemptId;
  }
  return ids;
}

/**
 * A CHAVE DE DEDUPLICACAO DO JOB, derivada do `userId`.
 *
 * NUNCA HASH DO CORPO: hash obriga a guardar ou a re-serializar o corpo, que e justamente o que nao
 * pode existir, e ainda muda quando o fornecedor acrescenta um campo qualquer ao evento, fazendo a
 * mesma entrega virar duas.
 *
 * O SEPARADOR E HIFEN, E NAO DOIS-PONTOS: a casa ja pisou nisso (o `jobId` com `:` quebrou a
 * deduplicacao da fila do Pandape, corrigido no commit 315ced1).
 */
export function chaveDoJobDigai(ids: { userId: string }): string {
  /*
   * ─ A CHAVE E FAIL-CLOSED, E ESSE E O GAP 2 DA AUDITORIA DE CODIGO (29/09) ───────────────────
   *
   * A idempotencia so provava que duas entregas davam a MESMA chave, e nao dizia nada sobre o
   * CONTEUDO dela. Como a chave e derivada do `userId`, ela HERDA o que o `userId` for: um valor
   * com cara de documento viraria `digai-<documento>` no Redis, com o TTL do BullMQ e nenhum
   * expurgo nosso, e apareceria em toda tela de diagnostico de fila e no `failedReason`.
   *
   * RECUSAR E MAIS SEGURO DO QUE SANEAR: sanear produziria uma chave DIFERENTE para o mesmo evento
   * conforme o que fosse removido, e chave instavel desfaz a propria idempotencia que ela existe
   * para garantir. A regua e a mesma das outras tres portas, de proposito.
   */
  if (!ehIdTecnicoDigai(ids.userId)) {
    // A frase NAO repete o valor recusado: se ele for um documento, ecoa-lo aqui o poria no log
    // e no `failedReason`, que e exatamente a superficie que esta guarda existe para manter limpa.
    throw new Error("identificador tecnico invalido: nao vira chave de job");
  }
  return `digai-${ids.userId}`;
}

// ── 7. O POLLING: A CONSULTA PERIODICA QUE SUBSTITUIU O WEBHOOK COMO CAMINHO VIGENTE ───────────

/**
 * ─ POR QUE O CAMINHO VIGENTE E POLLING, E NAO O WEBHOOK QUE JA ESTA CONSTRUIDO ─────────────────
 *
 * ┌─ A DECISAO DO DIRETOR (29/09/2026) ──────────────────────────────────────────────────────────┐
 * │ O webhook do Digai FUNCIONA e FICA NO LUGAR. O que ele tem e uma DEPENDENCIA DE TERCEIRO que  │
 * │ o diretor nao quer: o listener precisa ser cadastrado no painel do fornecedor pelo Ivan, e    │
 * │ ate la nao chega evento nenhum. A ingestao passa a se sustentar sozinha, consultando.          │
 * │                                                                                               │
 * │ CONSEQUENCIA PRATICA: `DIGAI_WEBHOOK_TOKEN` DEIXOU DE SER NECESSARIO PARA OPERAR. Sem ele o   │
 * │ receptor continua fail-closed e inerte, e a ingestao roda igual pelo polling. O dia em que o  │
 * │ diretor quiser o webhook de volta, basta pedir o cadastro ao Ivan e configurar o token: nao   │
 * │ ha nada a construir, e nada aqui depende dele.                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * ─ A CADENCIA: 15 MINUTOS, E A CONTA FOI MEDIDA CONTRA A PRODUCAO DO FORNECEDOR ────────────────
 *
 * ┌─ O CUSTO DE UM CICLO, MEDIDO VARRENDO A BASE INTEIRA EM 29/09/2026 ──────────────────────────┐
 * │     1 requisicao para a LISTAGEM (`/api/v1/public/screenings`: 528 screenings em UMA pagina)  │
 * │ + 527 requisicoes, uma por screening, para a primeira pagina de resultados                    │
 * │ + 154 requisicoes de PAGINA EXTRA                                                              │
 * │ = 682 REQUISICOES POR CICLO, ou 7,6 min a 90/min.                                              │
 * │                                                                                               │
 * │ O NUMERO ANTERIOR (523) ERA 30% BAIXO, E A CAUSA ESTA REGISTRADA PORQUE ELA SE REPETE: ele    │
 * │ supunha UMA pagina por screening porque O TAMANHO DA PAGINA NUNCA TINHA SIDO MEDIDO (a        │
 * │ amostra tinha `total` 58 com os 58 na primeira pagina, o que so provava "tamanho >= 58").      │
 * │                                                                                               │
 * │ AGORA FOI MEDIDO: A PAGINA E DE 100. Um screening com `total` 273 devolveu 100 na pagina 1.   │
 * │ 78 dos 528 screenings passam de 100 candidatos, e o maior tem 1.225, que sao 13 paginas.       │
 * │ Base declarada: 27.418 candidatos, 15% deles com CPF (ou seja, finalizaram a triagem).         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O INTERVALO GOVERNA, E O QUE ELE NAO GOVERNA ─────────────────────────────────────────┐
 * │ QUEM RESPEITA O TETO DE 120/min DO FORNECEDOR E O LIMITER, NAO A CADENCIA. O limiter segura   │
 * │ 90/min em QUALQUER intervalo, entao mudar a cadencia NAO muda o pico que o fornecedor ve.     │
 * │ O intervalo governa outras duas coisas: o VOLUME MEDIO e a LATENCIA ate a pessoa aparecer.    │
 * │                                                                                               │
 * │ E UM CICLO MAIS LONGO QUE A CADENCIA NAO ESTOURA NADA: ele apenas faz o tick seguinte NAO     │
 * │ SAIR, com linha de log, pela trava `temCicloEmAndamento`. Isso e degradacao prevista, e nao    │
 * │ falha. Ver o bloco do teto abaixo, que e onde essa correcao de invariante esta escrita.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CONTA, SOBRE O CICLO MEDIDO DE 682, E A ESCOLHA DO DIRETOR ───────────────────────────────┐
 * │ intervalo   ocupacao da janela   media req/min   % do teto do fornecedor   base cresce ate    │
 * │   10 min           76%                68,2               57%                    1,3x          │
 * │   12 min           63%                56,8               47%                    1,6x          │
 * │   15 min           51%                45,5               38%              2,0x <- ESCOLHIDO │
 * │   30 min           25%                22,7               19%                    4,0x          │
 * │                                                                                               │
 * │ O DIRETOR ESCOLHEU 15 MIN em 29/09/2026. A latencia maxima entre a pessoa finalizar a triagem │
 * │ e aparecer na fila cai pela metade, o ciclo ocupa metade da janela e a media fica em 38% do   │
 * │ teto do fornecedor. E a mesma cadencia da coleta de VT.                                        │
 * │                                                                                               │
 * │ O QUE SE ACEITA COM ELA, escrito para nao ser redescoberto: a 15 min o ciclo pode DOBRAR      │
 * │ antes de passar da janela. A base foi de 301 screenings em 16/09 para 528 em 29/09, ou +73%   │
 * │ em treze dias; nesse ritmo, dobrar leva ~16 DIAS. Passado isso, o tick seguinte comeca a ser  │
 * │ pulado de vez em quando, com log, e a latencia media sobe: NADA QUEBRA, e o custo e a pessoa  │
 * │ demorar mais para aparecer na fila. A saida, quando chegar, e subir a cadencia.                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE NAO MENOS QUE 15 ───────────────────────────────────────────────────────────────────┐
 * │ A 12 min o ciclo ja ocupa 63% da janela e a 10 min, 76%: o tick pulado deixaria de ser        │
 * │ excecao e viraria regra, e a cadencia nominal passaria a mentir sobre a latencia real. E nada │
 * │ aqui expira: a Clicksign e de 2 min porque a URL do arquivo assinado expira em ~5 min.        │
 * │ Triagem nao tem relogio correndo contra ela.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const DIGAI_POLLING_INTERVALO_MS = 15 * 60 * 1000;

/**
 * ─ O TETO DE REQUISICOES POR CICLO: 8.000, E ELE CONTA REQUISICAO, NAO SCREENING ────────────────
 *
 * ┌─ POR QUE UM TETO, e a razao vale mais aqui do que no precedente ─────────────────────────────┐
 * │ O precedente e `SCHEDULER_TETO_IA_POR_CICLO` (`domain/scheduler-pandape.ts`): o scheduler     │
 * │ roda SOZINHO e REPETIDAMENTE, e um erro queimaria quota em escala sem ninguem olhando.         │
 * │                                                                                               │
 * │ O CICLO DO DIGAI E UMA ORDEM DE GRANDEZA MAIS PESADO QUE O DO PANDAPE: 682 requisicoes        │
 * │ medidas contra ~45. E a base do fornecedor CRESCE RAPIDO: 301 screenings em 16/09, 528 em     │
 * │ 29/09, ou +73% em treze dias. Sem teto, a base crescer faz o ciclo crescer EM SILENCIO, e o   │
 * │ primeiro a notar e o fornecedor, reclamando ou cortando o acesso.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O VETO DO `seguranca` (29/09): A PRIMEIRA VERSAO CONTAVA A UNIDADE ERRADA ──────────────────┐
 * │ Ela cobrava UMA requisicao por screening e nao acompanhava o gasto depois disso. So que cada  │
 * │ screening vira um job de pagina que pode pedir a proxima pagina sozinho: o teto autorizava,   │
 * │ na pratica, 1 + N x 20 requisicoes. A paginacao da LISTAGEM tinha o mesmo furo por outra      │
 * │ porta: cada pagina de listagem recomecava com o orcamento cheio.                               │
 * │                                                                                               │
 * │ A CORRECAO FOI DE MECANISMO, E ELA CONTINUA INTEIRA: O ORCAMENTO VIAJA NO PAYLOAD DO JOB, e   │
 * │ cada peca do leque recebe a sua fatia, entao a soma do que o plano autoriza nunca passa do    │
 * │ que ele recebeu. O TAMANHO do teto e outro eixo, e e o que a secao seguinte dimensiona.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O INVARIANTE QUE SE USAVA PARA DERIVAR ESTE NUMERO ESTAVA ERRADO, E A CADENCIA DE 15 REVELOU ┐
 * │ ATE 29/09 o teto era escolhido para que "o pior caso de retentativa CABE NA CADENCIA"         │
 * │ (attempts x teto, a 90/min, menor que o intervalo). A 15 min isso e impossivel: a janela tem  │
 * │ 1.350 requisicoes e o CICLO NOMINAL MEDIDO ja custa 682, entao com `attempts: 2` o pior caso  │
 * │ (1.364) ja estoura a janela. E "fazer caber" baixando o teto para 675 CORTARIA O CICLO        │
 * │ NORMAL, que e muito pior: cortar o ciclo normal e deixar gente de fora.                        │
 * │                                                                                               │
 * │ O INVARIANTE ERA ERRADO DESDE O COMECO PORQUE DERIVAVA O TETO DA CADENCIA, E A DEPENDENCIA E  │
 * │ A OPOSTA: a cadencia e ESCOLHA DO DIRETOR (latencia que a operacao aceita) e o teto e FREIO   │
 * │ DE CRESCIMENTO (ate onde a base pode crescer antes de alguem olhar). Sao decisoes de donos    │
 * │ diferentes, e amarrar uma a outra fez a escolha de cadencia parecer um erro de seguranca.      │
 * │                                                                                               │
 * │ OS DOIS INVARIANTES QUE DE FATO PROTEGEM JA EXISTEM NO CODIGO, E SAO ESTES:                   │
 * │  1. A VAZAO nunca passa do que o fornecedor aguenta, e quem garante e o LIMITER de 90/min com │
 * │     concorrencia 1 (`DIGAI_WORKER_OPTIONS`), em QUALQUER cadencia e com qualquer teto.        │
 * │  2. OS CICLOS NUNCA SE EMPILHAM, e quem garante e `temCicloEmAndamento`, que trava o          │
 * │     scheduler enquanto o anterior nao drenou.                                                  │
 * │ Com os dois, um ciclo mais longo que a cadencia so faz o tick seguinte nao sair, com log.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ COMO 8.000 FOI DIMENSIONADO: PRIMEIRO COBERTURA, DEPOIS FREIO ──────────────────────────────┐
 * │ COBERTURA (o piso, e ele manda). O plano reparte o restante POR NECESSIDADE (29/09/2026):     │
 * │ cada screening leva `ceil(total x 1,1 / 100)` paginas, com o `total` do cursor, piso de uma   │
 * │ pagina e teto anti-laco de 20. Com a base de hoje isso soma 754 paginas AUTORIZADAS de 7.999  │
 * │ disponiveis, e o maior medido (1.225 candidatos) leva as 14 de que precisa.                    │
 * │                                                                                               │
 * │ ATE 29/09 A REPARTICAO ERA IGUALITARIA (`min(20, floor((teto - 1) / N))`, ou 15 paginas para  │
 * │ cada um), e ela tinha o defeito de reservar 15 paginas para os ~450 screenings que cabem em   │
 * │ UMA. O teto de 8.000 foi dimensionado contra AQUELA regra; ele continua valendo contra esta,  │
 * │ e agora com muito mais folga (ver o quadro da ruptura, abaixo).                                │
 * │                                                                                               │
 * │ Com o teto antigo de 1.200 dariam `floor(1199/528)` = 2 PAGINAS, e o conjunto perdido eram os │
 * │ screenings ACIMA DE 200 CANDIDATOS: quem tem 101 a 200 termina COMPLETA, porque                │
 * │ `proximaPaginaDigai` avalia `lidosAcumulados >= total` ANTES dos cortes. (Sabe-se que 78       │
 * │ passam de 100 e que o maior tem 1.225; quantos passam de 200 NAO foi medido.) A direcao do    │
 * │ argumento nao muda e o numero sim, e ele esta corrigido aqui porque numero publicado errado    │
 * │ vira a proxima medicao errada de alguem. Teto apertado nao atrasa gente, ele PERDE gente.      │
 * │                                                                                               │
 * │ FREIO (o teto, depois de garantida a cobertura). 8.000 e 11,7x o ciclo medido de 682. No      │
 * │ ritmo medido (+73% em 13 dias, ou 4,3% ao dia), a base levaria ~58 DIAS para chegar la. A     │
 * │ truncagem da LISTA (`foraDoTeto`) so dispara com mais de 7.999 screenings, 15x a base de      │
 * │ hoje, e ai o ciclo PARA e REGISTRA em vez de somar.                                            │
 * │                                                                                               │
 * │ O PIOR CASO AUTORIZADO passa a ser 8.000 requisicoes, ou 89 min a 90/min, ~6 cadencias. SOB   │
 * │ OS INVARIANTES CERTOS ISSO NAO E FALHA: a vazao continua em 90/min e os ciclos nao se somam,  │
 * │ o que se paga e latencia. E e AUTORIZACAO, nao gasto: o gasto medido e 682.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A COBERTURA E O FREIO CONVERGIRAM, E FOI A REPARTICAO POR NECESSIDADE QUE FEZ ISSO ────────┐
 * │ ATE 29/09 ESTE BLOCO DIZIA "os 58 dias sao do freio, a cobertura quebra em QUATRO". Estava    │
 * │ certo, e era consequencia da reparticao IGUALITARIA: a cota caia com N, entao bastavam +17%   │
 * │ de screenings (N = 616, ~4 dias a +4,3% ao dia) para a cota cair a 12 paginas e deixar de     │
 * │ cobrir o maior medido, de 13.                                                                  │
 * │                                                                                               │
 * │ COM A REPARTICAO POR NECESSIDADE A COTA NAO CAI COM N: ela cai com a SOMA DAS NECESSIDADES,   │
 * │ e a base e TORTA (450 dos 528 cabem numa pagina). O quadro, medido contra a forma real da     │
 * │ base (1 screening de 1.225, 71 acima de 100, 456 de uma pagina):                                │
 * │                                                                                               │
 * │      regra              N da ruptura     crescimento     dias a +4,3% ao dia                   │
 * │    igualitaria               616             +17%              ~4                              │
 * │    por necessidade         5.524            +946%             ~56    <- a de hoje              │
 * │                                                                                               │
 * │ SAO 9 VEZES MAIS FOLGA, e o efeito que importa e este: a COBERTURA deixou de ser o gargalo e  │
 * │ passou a vencer JUNTO com o freio (~58 dias). As duas grandezas que este bloco mandava nao    │
 * │ confundir agora coincidem, e nao por coincidencia: a cobertura parou de pagar pelo            │
 * │ desperdicio dos pequenos.                                                                      │
 * │                                                                                               │
 * │ A ORDEM DOS DOIS PONTOS, para quem for medir: em N = 5.524 o maior screening perde a FOLGA    │
 * │ (13 paginas concedidas para 14 de necessidade, e 13 ainda cobrem os 1.225 de hoje); em        │
 * │ N = 5.762 ele perde a COBERTURA de verdade. O primeiro e o alarme, o segundo e o dano.         │
 * │                                                                                               │
 * │ OS DOIS PONTOS ESTAO FIXADOS EM TESTE (`digai-polling.backend.spec.ts`), calculados pela      │
 * │ FUNCAO DE VERDADE e nao por uma formula copiada: mexer no teto, na folga ou na reparticao     │
 * │ move o numero e o teste cobra o novo.                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE VAI DOER PRIMEIRO COM O CRESCIMENTO, E CONTINUA NAO SENDO ESTE TETO ──────────────────┐
 * │ Quem aperta primeiro segue sendo a COBERTURA DOS GRANDES, so que agora 9x mais tarde. Quando  │
 * │ chegar, a saida NAO e subir o teto: e olhar a FOLGA (`DIGAI_FOLGA_DA_NECESSIDADE`) e a COTA   │
 * │ DE DESCOBERTA, que sao o que a reparticao reserva sem ter lido, e depois a CADENCIA. Subir o  │
 * │ teto trata o sintoma e empurra o ciclo para fora da janela de 15 min.                          │
 * │                                                                                               │
 * │ E A MEDICAO DA ORDENACAO (abaixo) E O QUE TORNA ISSO URGENTE QUANDO CHEGAR: sem ordenacao, o  │
 * │ corte nao adia ninguem, ele PERDE, e perde sorteando.                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NAO APERTE ESTE TETO. O FORNECEDOR NAO ORDENA OS RESULTADOS, E ISSO FOI MEDIDO ─────────────┐
 * │ O proximo a ler "8.000 contra um gasto de 682" vai achar folgado demais e vai querer apertar. │
 * │ APERTAR O TETO BAIXA A COTA POR SCREENING E VOLTA A CORTAR PAGINA, e cortar pagina PERDE      │
 * │ CANDIDATO RECENTE, EM SILENCIO. Nao e opiniao, e consequencia de medicao.                      │
 * │                                                                                               │
 * │ MEDIDO EM 29/09/2026, em TRES screenings com mais de uma pagina (`total` 275, 135 e 167): as  │
 * │ 100 datas da pagina 1 vem SEM ORDEM APARENTE, e nos tres o MAIOR `appliedAt` DA PAGINA 2 E    │
 * │ MAIS NOVO QUE O MENOR DA PAGINA 1. Nao ha crescente nem decrescente: as datas se misturam     │
 * │ dentro da propria pagina.                                                                      │
 * │                                                                                               │
 * │ ENTAO A HIPOTESE CONFORTAVEL ESTA DERRUBADA: nao e verdade que o corte de pagina "empurra os  │
 * │ antigos para depois". QUEM CAI NA PAGINA CORTADA E SORTEADO, e pode ser exatamente quem acabou │
 * │ de finalizar a triagem, que e justamente quem esta ingestao existe para trazer. Por isso a     │
 * │ regra de dimensionamento e COBERTURA PRIMEIRO, FREIO DEPOIS, e ela deixou de ser preferencia   │
 * │ de quem escreveu para ser consequencia do que se mediu.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS RETENTATIVAS: 2 CONTINUA CERTO, E AGORA POR MEDICAO E NAO POR ARITMETICA ────────────────┐
 * │ A varredura de 29/09 teve 4 FALHAS EM 532 REQUISICOES (0,75%): o fornecedor deu TIMEOUT, e um │
 * │ screening se perdeu mesmo com tres tentativas. Isso derruba o argumento antigo (que derivava  │
 * │ as tentativas da cadencia) e poe outro no lugar, mais forte:                                   │
 * │                                                                                               │
 * │ NO POLLING, FALHA E ATRASO E NAO PERDA. O ciclo rele TUDO daqui a 15 min, entao a pagina que  │
 * │ falhou volta sozinha. Com 0,75% e `attempts: 2`, a chance de um screening ficar de fora de um │
 * │ ciclo e 0,75%^2 = 1 em 18.000, e mesmo esse volta no ciclo seguinte. Subir para 3 trocaria    │
 * │ "1 em 18.000 atrasado 15 min" por "1 em 2,4 milhoes", contra um fornecedor QUE JA ESTA        │
 * │ RESPONDENDO MAL: insistir mais nele e piorar a causa para melhorar uma casa decimal.           │
 * │ Ver `DIGAI_TENTATIVAS_DO_POLLING` (`digai.queue.ts`), que e onde o numero mora.                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const DIGAI_TETO_REQ_POR_CICLO = 8_000;

/**
 * O TETO DE PAGINAS POR SCREENING: 20.
 *
 * Nao e orcamento, e ANTI-LACO: a paginacao avanca enquanto o fornecedor disser que ha mais, e um
 * `total` inconsistente (ou uma pagina que devolve os mesmos itens) faria um unico screening varrer
 * para sempre, sob o limiter, sem nada falhar.
 *
 * A CONTA, AGORA COM A PAGINA MEDIDA (100, e nao ">= 58" como se supunha): 20 paginas cobrem 2.000
 * candidatos num unico screening, contra 1.225 do maior medido em 29/09. Sao 1,63x de folga, que e
 * menos do que parecia quando a pagina era desconhecida, e continua servindo por DOIS motivos:
 *  1. o que corta hoje NAO E ele, e sim a cota do orcamento (`min(20, floor((teto-1)/N))` = 15 com
 *     a base de hoje). Subir este numero seria inerte enquanto a cota for menor;
 *  2. o corte anti-laco REGISTRA (`warn` com "CORTADO" e "anti-laco"), entao encostar nele vira
 *     linha de log e nao silencio. Quem vier: se o maior screening passar de 2.000 candidatos, o
 *     numero a subir e este, e o aviso ja estara no log.
 */
export const DIGAI_TETO_PAGINAS_POR_SCREENING = 20;

/**
 * ─ O TERCEIRO PORTAO DE INERCIA, E ELE E SO DO POLLING ─────────────────────────────────────────
 *
 * Sem `DIGAI_POLLING_ATIVO`, o scheduler NAO DISPARA e a rota interna nao enfileira nada. Ele e
 * separado dos outros dois de proposito, porque decide coisa diferente:
 *   `DIGAI_API_TOKEN`      -> pode SAIR para a rede
 *   `DIGAI_INGESTAO_ATIVA` -> pode ESCREVER no banco
 *   `DIGAI_POLLING_ATIVO`  -> pode VARRER sozinho, em cadencia, sem ninguem pedir
 * Juntar o terceiro ao segundo faria "quero escrever o que o webhook trouxer" e "quero varrer 522
 * screenings a cada 30 minutos" virarem a mesma decisao, e elas nao sao.
 *
 * SO `true` LIGA, pelo mesmo fail-closed de `ingestaoHabilitada`: ausente, vazio e o erro de
 * digitacao no `.env` deixam desligado.
 */
export function pollingHabilitado(env: Record<string, string | undefined>): boolean {
  return (env.DIGAI_POLLING_ATIVO ?? "").trim().toLowerCase() === "true";
}

/**
 * ─ O SCREENING PROJETADO, E A ALLOWLIST VALE AQUI TAMBEM ───────────────────────────────────────
 *
 * A listagem devolve 17 campos por screening (`title`, `description`, `webAccessLink`,
 * `whatsappAccessLink`, `occupationType`, `seniorityLevel` e outros). A varredura precisa de DOIS:
 * o `id`, para montar o caminho dos resultados, e o `updatedAt`, que e o cursor da secao abaixo.
 *
 * PROJETAR AQUI, E NAO ADIANTE, e o que impede os outros quinze de existirem no plano, no log e no
 * job do Redis. `webAccessLink` e `whatsappAccessLink` sao o caso concreto: sao URL de acesso, na
 * mesma regua da URL do Pandape (secao A.6), que nao se persiste nem se loga.
 *
 * O `id` PASSA PELO ALFABETO FECHADO antes de virar qualquer coisa, porque ele vai para o PATH da
 * proxima leitura e para a chave do job: e a mesma regra do `userId`, pela mesma razao.
 */
export interface ScreeningDigai {
  id: string;
  /** O carimbo que a LISTAGEM devolve. So se ARMAZENA; nao se decide nada com ele (ver o cursor). */
  updatedAt: string | null;
}

export function projetarScreeningDigai(cru: unknown): ScreeningDigai | null {
  const o = comoObjetoSimples(cru);
  if (o === null) return null;
  const id = texto(o.id);
  if (id === null || !ehIdTecnicoDigai(id)) return null;
  return { id, updatedAt: texto(o.updatedAt) };
}

/**
 * ─ O CURSOR: O `total` JA DECIDE ORCAMENTO; O `updatedAt` NAO PULA NADA. AINDA ────────────────
 *
 * ┌─ O QUE SE GRAVA, E POR QUE SO ISSO ──────────────────────────────────────────────────────────┐
 * │ Por screening: o `updatedAt` que a LISTAGEM devolveu e o `total` de candidatos visto no       │
 * │ ultimo ciclo. Dois numeros tecnicos, zero dado de pessoa.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS DOIS CAMPOS TEM DESTINOS DIFERENTES, E ISSO PASSOU A IMPORTAR EM 29/09/2026 ─────────────┐
 * │ O `total` DEIXOU DE SER SO MEDICAO: e ele que `planoDaVarredura` usa para repartir o          │
 * │ orcamento POR NECESSIDADE (`ceil(total x 1,1 / 100)`) em vez de igualmente. Errar o `total`   │
 * │ para MENOS custa uma cota curta por um ciclo (15 min), e o `total` FRESCO da pagina 1 corrige │
 * │ o cursor na mesma passada.                                                                     │
 * │                                                                                               │
 * │ DUAS CONSEQUENCIAS QUE NAO SAO OBVIAS, e as duas viraram codigo:                               │
 * │  1. O TICK NAO PODE MAIS ZERAR O `total`. Ele gravava `total: 0` em todo ciclo, contando com  │
 * │     a pagina 1 para repor o numero. Com a reparticao por necessidade isso seria FOME          │
 * │     PERMANENTE do screening CORTADO: cortado, ele nao tem pagina 1; sem pagina 1, o `total`   │
 * │     fica 0; com 0, ele volta a receber cota de desconhecido para sempre. O tick agora grava   │
 * │     SO o `updatedAt`, e o `total` so e escrito por quem o mediu.                               │
 * │  2. `total = 0` E DESCONHECIDO, e nao vazio (ver `necessidadeDePaginasDigai`).                 │
 * │                                                                                               │
 * │ O `updatedAt` CONTINUA SEM DECIDIR NADA, e o paragrafo abaixo segue valendo inteiro para ele. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE NAO SE PULA NADA COM ELE HOJE, E ESTA E A PARTE QUE NAO PODE SER "OTIMIZADA" ───────┐
 * │ NAO ESTA PROVADO que o `updatedAt` do SCREENING se mexe quando um CANDIDATO finaliza. O       │
 * │ `updatedAt` e do screening (titulo, configuracao, numero de perguntas), e o candidato e outro │
 * │ objeto. Se ele NAO se mexer, pular o screening "sem mudanca" deixa de fora exatamente quem    │
 * │ acabou de finalizar, para sempre, SEM NADA FALHAR: zero erro, zero alarme, e a pessoa         │
 * │ simplesmente nunca chega na fila. E o modo de falha mais caro que uma ingestao tem, e esta    │
 * │ frente ja pagou por ele uma vez (o desembrulho errado zerava a ingestao em silencio).          │
 * │                                                                                               │
 * │ ENTAO GRAVAR E A MEDICAO QUE DESTRAVA A OTIMIZACAO: com dois ou tres ciclos gravados da para  │
 * │ comparar, por screening, "o `updatedAt` mudou?" contra "o `total` mudou?" e RESPONDER a        │
 * │ pergunta em vez de supo-la. Custa uma tabela e nao muda comportamento nenhum.                   │
 * │                                                                                               │
 * │ O QUE FALTA MEDIR, nominalmente, para que quem vier saiba o que procurar:                      │
 * │  1. o `updatedAt` do screening muda quando um candidato finaliza a triagem?                    │
 * │  2. o `total` da pagina de resultados muda quando um candidato finaliza, ou so quando um       │
 * │     candidato NOVO entra? (se so no segundo caso, ele tambem nao serve de cursor sozinho)      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O INCREMENTAL POR DATA: MEDIDO EM 29/09/2026, E A RESPOSTA E NAO CONSTRUIR ─────────────────┐
 * │ AQUI ESTAVA ESCRITO que `startAt`/`endAt` "NAO FORAM TESTADOS". AGORA FORAM, e o resultado    │
 * │ fecha a pergunta em vez de deixa-la aberta. Quem vier depois precisa ACHAR A MEDICAO, e nao   │
 * │ repetir a medicao.                                                                             │
 * │                                                                                               │
 * │ 1. `startAt` FUNCIONA, E E O UNICO QUE FUNCIONA. Testados contra a producao do fornecedor:    │
 * │    `start_at`, `startDate`, `from`, `updatedAtFrom` e `appliedAtFrom` sao TODOS IGNORADOS     │
 * │    (devolvem a pagina inteira, como os quatro ja registrados acima).                           │
 * │                                                                                               │
 * │ 2. E SOBRE QUAL DATA ELE FILTRA, que e onde a ideia morre: `startAt` FILTRA POR `appliedAt`,  │
 * │    A DATA DE INSCRICAO. Medido: num screening com 100 na pagina e datas espalhadas por 12     │
 * │    dias, com o corte no meio (50 dos 100 eram anteriores), `startAt = corte` devolveu ZERO    │
 * │    anteriores.                                                                                 │
 * │                                                                                               │
 * │ 3. ENTAO O INCREMENTAL POR DATA E INSEGURO PARA O NOSSO CASO. Nos queremos quem FINALIZOU, e  │
 * │    finalizar acontece DEPOIS, NO MESMO REGISTRO, SEM MEXER NO `appliedAt`. Um ciclo com       │
 * │    `startAt = ultimo ciclo` perderia exatamente quem se inscreveu ANTES da janela e finalizou │
 * │    DENTRO dela, para sempre e sem nada falhar: o mesmo modo de falha que esta secao inteira   │
 * │    existe para evitar. E o `total` NAO RESPONDE AO FILTRO (continua devolvendo o numero sem   │
 * │    filtro), entao nem daria para conferir quantos casaram.                                     │
 * │                                                                                               │
 * │ 4. E A ECONOMIA SERIA PEQUENA, o que encerra o assunto ate por custo. O ciclo e dominado por  │
 * │    UMA REQUISICAO POR SCREENING (527 das 682 medidas), e filtro nenhum remove essa. O filtro  │
 * │    so cortaria PAGINA EXTRA: com janela de 14 dias (35% dos registros), as 154 extras cairiam │
 * │    para ~54, ou seja 682 -> ~582, CERCA DE 15%. Quinze por cento em troca de perder gente em  │
 * │    silencio nao se paga.                                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface CursorDoScreeningDigai {
  screeningId: string;
  updatedAt: string | null;
  total: number;
}

/**
 * ─ O TAMANHO DA PAGINA DO FORNECEDOR: 100, E ELE E MEDIDO E NAO SUPOSTO ────────────────────────
 *
 * Medido em 29/09/2026: um screening com `total` 273 devolveu 100 itens na pagina 1. A amostra
 * antiga (`total` 58, os 58 na primeira pagina) nao permitia concluir nada sobre o tamanho, e foi
 * ela que quase fez alguem presumir que uma pagina basta.
 *
 * ELE VIRA CONSTANTE PORQUE AGORA DECIDE ORCAMENTO, e nao so paginacao: a NECESSIDADE de um
 * screening e `total / pagina`, entao errar este numero erra a cota de todo mundo de uma vez.
 */
export const DIGAI_TAMANHO_DA_PAGINA = 100;

/**
 * ─ A FOLGA SOBRE O `total` GUARDADO: 10%, E ELA EXISTE PORQUE O CURSOR E VELHO POR CONSTRUCAO ──
 *
 * ┌─ O PROBLEMA, e ele nao e hipotetico ─────────────────────────────────────────────────────────┐
 * │ O `total` que a reparticao le foi gravado no CICLO ANTERIOR, 15 min atras. No meio-tempo      │
 * │ entrou gente. Repartir por `ceil(total/100)` CRAVADO cortaria justamente o screening QUE      │
 * │ CRESCEU, que e o unico lugar onde havia gente nova para trazer. Seria punir pelo crescimento. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE 10%, E POR QUE PROPORCIONAL EM VEZ DE "UMA PAGINA A MAIS PARA TODOS" ───────────────┐
 * │ O `ceil` JA da, sozinho, uma folga media de meia pagina (50 candidatos). A folga proporcional │
 * │ soma a isso 10% do tamanho do screening, entao ela E MAIOR ONDE O RISCO E MAIOR: 122          │
 * │ candidatos de sobra no maior medido (1.225) e nenhuma pagina extra nos 450 que cabem em uma   │
 * │ pagina so. Contra o crescimento MEDIDO (+4,3% ao dia, ou 0,045% por ciclo de 15 min), 10% e   │
 * │ ~220 ciclos de folga no maior screening.                                                       │
 * │                                                                                               │
 * │ "UMA PAGINA A MAIS PARA TODOS" foi considerado e RECUSADO POR CUSTO MEDIDO: o ciclo e         │
 * │ dominado por UMA requisicao por screening (527 das 682 medidas), entao dar uma pagina extra a │
 * │ cada um levaria o ciclo de ~682 para ~1.210 requisicoes, ou 13,4 min dos 15 da cadencia (90%  │
 * │ de ocupacao, contra 51% hoje). Pagar 90% da janela para cobrir um crescimento de 0,045% por   │
 * │ ciclo e trocar o gargalo de lugar.                                                             │
 * │                                                                                               │
 * │ E O ERRO AQUI CUSTA UM CICLO, E NAO A PESSOA: o `total` FRESCO chega na resposta da pagina 1  │
 * │ desta mesma passada e e gravado no cursor, entao o screening que estourou a folga e cortado   │
 * │ HOJE e vem completo daqui a 15 min, com a cota ja corrigida. A folga compra latencia, nao     │
 * │ existencia, e e por isso que ela pode ser modesta.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const DIGAI_FOLGA_DA_NECESSIDADE = 0.1;

/**
 * ─ A COTA DE DESCOBERTA: 13 PAGINAS PARA O SCREENING QUE A GENTE NUNCA VIU ─────────────────────
 *
 * ┌─ O CASO, e ele e o unico em que nao ha `total` nenhum para repartir por necessidade ─────────┐
 * │ Screening novo (ou cursor perdido) nao tem tamanho conhecido. OS DOIS ERROS SAO DIFERENTES:  │
 * │  DAR POUCO   perde gente recente DE VERDADE, e o fornecedor NAO ORDENA os resultados, entao  │
 * │              quem cai na pagina cortada e SORTEADO, podendo ser quem acabou de finalizar;    │
 * │  DAR DEMAIS  gasta ORCAMENTO DE TODO MUNDO, porque a soma das cotas e o que o teto limita.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ERRAR PARA CIMA AQUI E BARATO, E ISSO E ARITMETICA E NAO GOSTO ─────────────────────┐
 * │ 1. A COTA E AUTORIZACAO, NAO GASTO. Quem para a paginacao e `proximaPaginaDigai`, que para   │
 * │    em `COMPLETA` ou `PAGINA_VAZIA` assim que o fornecedor acaba. Um screening vazio com cota  │
 * │    de 13 gasta UMA requisicao. O custo de 13 e contabil, e so aperta o teto.                  │
 * │ 2. O PIOR CASO CABE, e foi conferido: com a BASE INTEIRA desconhecida (primeiro ciclo, ou     │
 * │    tabela de cursor recem-criada), 528 x 13 + 1 = 6.865 requisicoes AUTORIZADAS, dentro das   │
 * │    8.000 do teto. Ou seja, nem a partida a frio degrada.                                      │
 * │ 3. EM REGIME O CASO E RARO: a base cresceu de 301 para 528 screenings em 13 dias, ou ~17 por  │
 * │    dia, que sao 0,18 screening novo por ciclo de 15 min.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O NUMERO E O MAIOR SCREENING MEDIDO: 1.225 candidatos, ou 13 paginas de 100 (29/09/2026). Nao e
 * chute redondo: e "cobre o maior que ja se viu nesta base".
 *
 * ┌─ E QUANDO NADA SE CONHECE, A REGRA VELHA VOLTA SOZINHA, o que e a prova de que ela e o caso  ┐
 * │ DEGENERADO desta: com TODOS desconhecidos, todas as necessidades sao iguais, e a reparticao   │
 * │ proporcional devolve exatamente a divisao IGUALITARIA de antes. A reparticao por necessidade  │
 * │ nao substitui a igualitaria: ela a generaliza para quando ha o que saber.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const DIGAI_PAGINAS_DE_DESCOBERTA = 13;

/**
 * ─ A NECESSIDADE DE UM SCREENING, EM PAGINAS ───────────────────────────────────────────────────
 *
 * `ceil(total x (1 + folga) / 100)`, com piso de 1 e teto do anti-laco. `total` ausente, invalido
 * ou ZERO significa DESCONHECIDO, e nao vazio: a linha do cursor nasce com `total_visto = 0` no
 * primeiro `insert`, e tratar isso como "screening vazio" daria UMA pagina a quem pode ter 1.225
 * candidatos, no exato ciclo em que ele aparece. Screening realmente vazio recebe cota de
 * descoberta e gasta UMA requisicao, porque a paginacao para em `PAGINA_VAZIA`.
 */
export function necessidadeDePaginasDigai(
  totalConhecido: number | null | undefined,
  tetoDePaginas: number = DIGAI_TETO_PAGINAS_POR_SCREENING,
): number {
  const teto = Math.max(1, Math.trunc(tetoDePaginas));
  const total =
    typeof totalConhecido === "number" && Number.isFinite(totalConhecido)
      ? Math.trunc(totalConhecido)
      : 0;
  if (total <= 0) return Math.min(teto, DIGAI_PAGINAS_DE_DESCOBERTA);
  const comFolga = Math.ceil((total * (1 + DIGAI_FOLGA_DA_NECESSIDADE)) / DIGAI_TAMANHO_DA_PAGINA);
  return Math.min(teto, Math.max(1, comFolga));
}

/**
 * ─ O PLANO DA VARREDURA: O ORCAMENTO E REPARTIDO AQUI, E ELE E DE REQUISICOES ──────────────────
 *
 * ┌─ O QUE MUDOU DEPOIS DO VETO, E POR QUE A FORMA E ESTA ───────────────────────────────────────┐
 * │ A primeira versao devolvia "quais screenings varrer" e cobrava 1 de cada, ignorando que cada  │
 * │ screening pode pedir ate 20 paginas sozinho. Agora ela devolve, junto de cada screening,      │
 * │ QUANTAS PAGINAS ele tem direito a ler, e o que sobra para a proxima pagina da LISTAGEM. O     │
 * │ orcamento passa a fechar: a soma do que o plano autoriza NUNCA passa do que ele recebeu.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A REPARTICAO E POR NECESSIDADE, E NAO IGUAL (autorizado pelo diretor em 29/09/2026) ───────┐
 * │ A versao anterior dava `min(20, floor(R/N))` paginas A CADA UM, e isso tinha dois defeitos    │
 * │ MEDIDOS, nao suspeitados:                                                                      │
 * │  1. DESPERDICIO: ~450 dos 528 screenings cabem numa pagina so, e cada um recebia cota de 15   │
 * │     para usar 1. O orcamento era reservado onde nao havia o que ler;                           │
 * │  2. A COBERTURA QUEBRAVA EM N = 616, que sao +17% sobre a base de hoje, ou ~4 DIAS no ritmo   │
 * │     medido (+4,3% ao dia): a cota caia para 12 paginas e deixava de cobrir o maior screening  │
 * │     medido (1.225 candidatos, 13 paginas).                                                     │
 * │                                                                                               │
 * │ AGORA CADA SCREENING PEDE O QUE PRECISA, `ceil(total x 1,1 / 100)`, com o `total` que o       │
 * │ CURSOR guardou (`CursorDoScreeningDigai`), e o desconhecido recebe a COTA DE DESCOBERTA.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRES REGRAS, e as diferencas sao de proposito ───────────────────────────────────────────┐
 * │ LISTAGEM EM UMA PAGINA SO (o caso medido): sabe-se N exatamente, entao reparte-se por         │
 * │ NECESSIDADE, com PISO DE UMA PAGINA para todos e o resto distribuido por quem precisa.        │
 * │                                                                                               │
 * │ LISTAGEM PAGINADA: NAO se sabe quantos screenings ainda virao, entao esta pagina e            │
 * │ CONSERVADORA (uma pagina por screening) e o resto do orcamento SEGUE para a proxima pagina da │
 * │ listagem. Sem isso, cada pagina de listagem recomecaria com o orcamento cheio, que era o furo │
 * │ B do veto: com o fornecedor paginando de 20 em 20, seriam 27 ticks x 1.199 e o teto jamais    │
 * │ dispararia. ISTO NAO MUDOU, e nao podia mudar: repartir por necessidade sem saber quantos     │
 * │ ainda virao gastaria o orcamento inteiro na primeira pagina da listagem.                       │
 * │                                                                                               │
 * │ ORCAMENTO QUE NAO DA NEM UMA PAGINA POR SCREENING TRUNCA A LISTA, e os que sobram sao         │
 * │ contados em `foraDoTeto` para virar linha de log. O PISO DE UMA PAGINA E O QUE GARANTE QUE    │
 * │ NENHUM SCREENING FIQUE INTEIRAMENTE INVISIVEL: perder a cauda de um screening custa gente;    │
 * │ perder o screening custa TODA a gente dele.                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ QUANDO A SOMA DAS NECESSIDADES PASSA DO ORCAMENTO: CORTE PROPORCIONAL, e ele nao elege ─────┐
 * │ vitima. Repartir por necessidade NAO e repartir sem teto, e a pergunta "quem e cortado" tem   │
 * │ tres respostas possiveis, das quais duas foram RECUSADAS:                                      │
 * │  CORTAR O MAIOR PRIMEIRO  concentra a perda inteira em um screening, que passa a ser          │
 * │                           PERMANENTEMENTE cego do mesmo trecho, ciclo apos ciclo, enquanto    │
 * │                           todos os outros ficam completos. E ele e justamente quem tem mais   │
 * │                           gente;                                                               │
 * │  CORTAR O MENOR PRIMEIRO  desperdica, e mal chega a liberar orcamento: os pequenos ja estao   │
 * │                           no PISO de uma pagina e nao ha o que cortar neles. A pressao vem    │
 * │                           dos grandes, e cortar o menor nao a alivia;                          │
 * │  PROPORCIONAL (o adotado) encolhe TODO MUNDO NA MESMA FRACAO, pelo metodo do MAIOR RESTO.     │
 * │                           Ninguem e eleito, a perda fica proporcional ao tamanho, e nenhum    │
 * │                           screening fica cego do mesmo trecho para sempre.                     │
 * │                                                                                               │
 * │ O CORTE E CONTADO EM `cortadosPorOrcamento` PARA VIRAR LINHA DE LOG, e a regua e a do         │
 * │ `CORTE_ORCAMENTO` que ja existe: a perda e RECORRENTE e o proximo ciclo NAO a recupera (ele   │
 * │ rele da pagina 1 com a mesma cota, e o fornecedor NAO ORDENA os resultados, medido em 29/09   │
 * │ em tres screenings paginados). Corte que nao aparece no log e perda silenciosa.                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A DEDUPLICACAO POR `id` ACONTECE AQUI: a listagem repetir um screening (por paginacao instavel do
 * fornecedor) gastaria requisicao pelo mesmo conteudo, e o orcamento e de REQUISICOES.
 */
export interface ScreeningComOrcamentoDigai {
  screening: ScreeningDigai;
  /** Quantas paginas de resultados este screening pode ler nesta passada. Sempre >= 1. */
  paginasPermitidas: number;
}

export function planoDaVarredura(entrada: {
  screenings: readonly ScreeningDigai[];
  /** O orcamento que ESTE tick recebeu, em REQUISICOES. Inclui a requisicao da propria listagem. */
  orcamento?: number;
  /** A listagem tem proxima pagina? Muda a regra de reparticao, e nao so o resto. */
  haProximaPaginaDaListagem?: boolean;
  tetoDePaginas?: number;
  /**
   * O `total` de candidatos que o CURSOR guardou por screening, do ciclo anterior. E o dado que
   * permite repartir por NECESSIDADE; ausente (mapa vazio, ou screening que nunca se viu), cada um
   * recebe a COTA DE DESCOBERTA e a reparticao degenera na igualitaria de antes.
   */
  totaisConhecidos?: ReadonlyMap<string, number>;
}): {
  varrer: ScreeningComOrcamentoDigai[];
  foraDoTeto: number;
  estourou: boolean;
  /**
   * Quantos screenings receberam MENOS paginas do que precisavam. Vira WARN: a perda e recorrente
   * e o proximo ciclo NAO a recupera (mesma regua do `CORTE_ORCAMENTO`).
   */
  cortadosPorOrcamento: number;
  /** A soma das cotas desta passada. Nunca passa do orcamento recebido. */
  paginasAutorizadas: number;
  /** O que sobra para a proxima pagina da LISTAGEM. Zero significa que ela nao deve ser pedida. */
  orcamentoRestante: number;
} {
  const orcamento = entrada.orcamento ?? DIGAI_TETO_REQ_POR_CICLO;
  const tetoDePaginas = entrada.tetoDePaginas ?? DIGAI_TETO_PAGINAS_POR_SCREENING;
  // A REQUISICAO DA PROPRIA LISTAGEM JA FOI GASTA por quem chamou: ela e a primeira do ciclo.
  const restante = Math.max(0, orcamento - 1);

  const vistos = new Set<string>();
  const unicos: ScreeningDigai[] = [];
  for (const s of entrada.screenings) {
    if (vistos.has(s.id)) continue;
    vistos.add(s.id);
    unicos.push(s);
  }

  // Sem orcamento nem para uma pagina de cada, a lista e TRUNCADA e o resto vira contagem.
  const cabem = Math.min(unicos.length, restante);
  const escolhidos = unicos.slice(0, cabem);
  const foraDoTeto = unicos.length - escolhidos.length;

  /*
   * LISTAGEM PAGINADA CONTINUA CONSERVADORA: uma pagina por screening, e o resto segue adiante.
   * Repartir por necessidade aqui gastaria o orcamento inteiro na primeira pagina da listagem, sem
   * saber quantos screenings ainda virao, que e o furo B do veto por outra porta.
   */
  const conservador = entrada.haProximaPaginaDaListagem === true;
  const necessidades = escolhidos.map((s) =>
    conservador ? 1 : necessidadeDePaginasDigai(entrada.totaisConhecidos?.get(s.id), tetoDePaginas),
  );

  const cotas = repartirPorNecessidade(necessidades, restante);
  const gasto = cotas.reduce((a, b) => a + b, 0);
  let cortadosPorOrcamento = 0;
  for (let i = 0; i < cotas.length; i += 1) {
    if (cotas[i]! < necessidades[i]!) cortadosPorOrcamento += 1;
  }

  return {
    varrer: escolhidos.map((screening, i) => ({ screening, paginasPermitidas: cotas[i]! })),
    foraDoTeto,
    estourou: foraDoTeto > 0,
    cortadosPorOrcamento,
    paginasAutorizadas: gasto,
    orcamentoRestante: Math.max(0, restante - gasto),
  };
}

/**
 * ─ O MAIOR RESTO, E ELE E O QUE FAZ O CORTE NAO ELEGER VITIMA ──────────────────────────────────
 *
 * ┌─ A ORDEM DAS DUAS CAMADAS IMPORTA, E ELA E A REGRA INTEIRA ──────────────────────────────────┐
 * │ 1. PISO: uma pagina para CADA UM, sempre. Ele cabe por construcao, porque a lista ja foi      │
 * │    truncada em `restante` screenings la em cima. E o que garante que nenhum screening fique   │
 * │    inteiramente invisivel;                                                                     │
 * │ 2. SOBRA: o que resta e distribuido entre as necessidades EXTRAS (`necessidade - 1`). Cabendo │
 * │    todas, todo mundo leva o que precisa e o troco segue para a proxima pagina da listagem.     │
 * │    NAO cabendo, cada um leva a MESMA FRACAO da sua extra, e as fracoes perdidas no `floor`     │
 * │    sao devolvidas em ordem decrescente de resto.                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O DESEMPATE E DETERMINISTICO, E ISSO NAO E DETALHE ─────────────────────────────────────────┐
 * │ Resto igual desempata pela NECESSIDADE maior, e depois pela POSICAO na lista. Um desempate    │
 * │ instavel (ordenacao nao estavel, ou aleatoria) faria a mesma base produzir cotas diferentes a │
 * │ cada ciclo, e o log de corte deixaria de ser comparavel entre ciclos, que e justamente o que  │
 * │ alguem vai querer ler quando a base crescer.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUMA COTA PASSA DA NECESSIDADE, e nenhuma soma passa do orcamento: sao os dois invariantes
 * que o veto de 29/09 instalou, e eles continuam sendo o contrato desta funcao.
 */
function repartirPorNecessidade(necessidades: readonly number[], restante: number): number[] {
  const n = necessidades.length;
  if (n === 0) return [];

  const cotas = necessidades.map(() => 1);
  const sobra = restante - n;
  if (sobra <= 0) return cotas;

  const extras = necessidades.map((need) => Math.max(0, need - 1));
  const somaExtras = extras.reduce((a, b) => a + b, 0);
  if (somaExtras === 0) return cotas;
  if (somaExtras <= sobra) return necessidades.map((need) => need);

  // CORTE PROPORCIONAL: cada um leva `extra x sobra / somaExtras`, arredondado para baixo.
  const bruto = extras.map((e) => (e * sobra) / somaExtras);
  const base = bruto.map((b) => Math.floor(b));
  let distribuido = base.reduce((a, b) => a + b, 0);

  const ordem = base
    .map((_, i) => i)
    .sort((a, b) => {
      const restoA = bruto[a]! - base[a]!;
      const restoB = bruto[b]! - base[b]!;
      if (restoB !== restoA) return restoB - restoA;
      if (extras[b]! !== extras[a]!) return extras[b]! - extras[a]!;
      return a - b;
    });
  for (const i of ordem) {
    if (distribuido >= sobra) break;
    if (base[i]! >= extras[i]!) continue;
    base[i] = base[i]! + 1;
    distribuido += 1;
  }

  return cotas.map((piso, i) => piso + base[i]!);
}

/**
 * ─ A PAGINACAO, E ELA E DE VERDADE: NAO SE PRESUME QUE UMA PAGINA BASTA ────────────────────────
 *
 * ┌─ POR QUE ISTO E UMA FUNCAO E NAO UM `if` NO SERVICO ─────────────────────────────────────────┐
 * │ A amostra que se tinha teve `total` 58 com os 58 na primeira pagina, e e exatamente esse tipo │
 * │ de amostra que faz alguem concluir "uma pagina basta". A MEDICAO DE 29/09 MOSTROU QUE A       │
 * │ PRESUNCAO SERIA ERRADA: A PAGINA E DE 100, e 78 dos 528 screenings passam disso, o maior com  │
 * │ 1.225 candidatos (13 paginas). Presumir uma pagina perderia, HOJE, todo mundo da segunda em   │
 * │ diante em 78 screenings, em silencio.                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ELA DEVOLVE O MOTIVO, E NAO SO O NUMERO (veto do `seguranca`, 29/09) ───────────────────────┐
 * │ A primeira versao devolvia `null` tanto para "acabou" quanto para "bati no teto de paginas",  │
 * │ e as duas coisas eram INDISTINGUIVEIS, sem log nenhum. Um screening com mais paginas do que o │
 * │ teto perderia todo mundo dali em diante sem erro e sem alarme, que e o modo de falha que esta │
 * │ frente ja chamou de o mais caro que uma ingestao tem. Agora o CORTE tem nome, e quem chama e  │
 * │ obrigado a decidir o que fazer com ele, que na pratica e REGISTRAR.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `SEM_TOTAL` NAO E TERMINO NORMAL, E CLASSIFICA-LO ASSIM FOI ERRO DE JULGAMENTO ─────────────┐
 * │ A versao anterior deste comentario punha `SEM_TOTAL` entre os terminos normais, e o efeito    │
 * │ pratico era grave: ele saia com `cortada: false`, ninguem logava nada e nenhum contador o     │
 * │ acusava. O `seguranca` mediu ao vivo em 29/09:                                                 │
 * │ `{"proxima":null,"motivo":"SEM_TOTAL","cortada":false}`, e zero linha de log.                  │
 * │                                                                                               │
 * │ A DIFERENCA E DE EPISTEMOLOGIA, E ELA DECIDE O NIVEL DO LOG:                                   │
 * │   `COMPLETA`  PROVOU-SE que acabou (leu-se tudo o que o fornecedor declarou);                  │
 * │   `SEM_TOTAL` NAO SE SABE se acabou (o fornecedor nao declarou nada).                          │
 * │ Tratar DESCONHECIMENTO como CONCLUSAO e a definicao do modo de falha silencioso.               │
 * │                                                                                               │
 * │ O CENARIO NAO E HIPOTETICO: basta o fornecedor mudar a forma da resposta, coisa que este       │
 * │ modulo JA DOCUMENTA ter acontecido (a versao e por rota justamente porque a v2 daquela rota    │
 * │ sumiu). A ingestao passaria a ler a pagina 1 da listagem e a pagina 1 de cada screening, ou    │
 * │ seja ~4% da base, e nada ficaria vermelho, amarelo, nem contado.                               │
 * │                                                                                               │
 * │ NAO SE INVENTA PAGINACAO SEM `total`: parar continua sendo o certo, e fail-closed. O que se    │
 * │ corrige e a AUSENCIA DE REGISTRO, que e outra coisa.                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS MOTIVOS DE PARADA, em tres classes:
 *   TERMINO PROVADO
 *     `COMPLETA`        leu-se tudo o que o fornecedor declarou;
 *     `PAGINA_VAZIA`    a pagina veio sem itens (insistir seria laco, e nao ha o que somar);
 *   ABSTENCAO POR FORMATO INESPERADO (`abstencao: true`, e vira WARN)
 *     `SEM_TOTAL`       o fornecedor nao declarou `total`: nao se sabe se acabou;
 *   CORTE NOSSO (`cortada: true`, e vira WARN)
 *     `CORTE_ORCAMENTO` o orcamento DESTA passada acabou, e ha mais para ler;
 *     `CORTE_TETO`      o teto anti-laco de paginas por screening foi atingido, e ha mais para ler.
 *
 * AS DUAS ULTIMAS CLASSES SAO SEPARADAS DE PROPOSITO: corte e decisao NOSSA sobre uma base que
 * conhecemos, e abstencao e a base ter deixado de ser conhecivel. Quem le o log precisa saber qual
 * das duas aconteceu, porque a acao e diferente (rever o teto contra conferir o contrato).
 */
export type MotivoDeParadaDigai =
  | "COMPLETA"
  | "PAGINA_VAZIA"
  | "SEM_TOTAL"
  | "CORTE_ORCAMENTO"
  | "CORTE_TETO";

export function proximaPaginaDigai(entrada: {
  total: unknown;
  lidosAcumulados: number;
  itensNaPagina: number;
  paginaAtual: number;
  /** Quantas paginas o orcamento desta passada concedeu a ESTE screening. */
  paginasPermitidas: number;
  tetoDePaginas?: number;
}): {
  proxima: number | null;
  motivo: MotivoDeParadaDigai | null;
  /** Decisao NOSSA que deixou gente de fora. Vira WARN. */
  cortada: boolean;
  /** O formato do fornecedor mudou e nao se sabe se acabou. Tambem vira WARN, com outro texto. */
  abstencao: boolean;
} {
  const teto = entrada.tetoDePaginas ?? DIGAI_TETO_PAGINAS_POR_SCREENING;
  const parar = (motivo: MotivoDeParadaDigai) => ({
    proxima: null,
    motivo,
    cortada: motivo === "CORTE_ORCAMENTO" || motivo === "CORTE_TETO",
    abstencao: motivo === "SEM_TOTAL",
  });

  if (entrada.itensNaPagina <= 0) return parar("PAGINA_VAZIA");
  const total =
    typeof entrada.total === "number" && Number.isFinite(entrada.total) ? entrada.total : null;
  if (total === null) return parar("SEM_TOTAL");
  // TERMINO NORMAL VEM ANTES DOS CORTES: quem leu tudo nao foi cortado, e chamar isso de corte
  // encheria o log de alarme falso justamente no caso em que nada se perdeu.
  if (entrada.lidosAcumulados >= total) return parar("COMPLETA");
  if (entrada.paginaAtual >= teto) return parar("CORTE_TETO");
  if (entrada.paginaAtual >= entrada.paginasPermitidas) return parar("CORTE_ORCAMENTO");
  return { proxima: entrada.paginaAtual + 1, motivo: null, cortada: false, abstencao: false };
}

/** O `total` que a resposta do fornecedor declara, ou `null` quando ele nao veio no formato medido. */
export function totalDeclaradoDigai(conteudo: unknown): number | null {
  const o = comoObjetoSimples(conteudo);
  const t = o?.total;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}

// ── AUXILIARES ─────────────────────────────────────────────────────────────────────────────────

/** Texto util, ou `null`. Vazio e ausente sao a mesma coisa para tudo o que este arquivo decide. */
function texto(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** O registro como objeto, ou `null`. Nenhuma funcao daqui confia no formato do que chega. */
function comoRegistro(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/**
 * O valor como objeto SIMPLES, recusando ARRAY.
 *
 * `typeof [] === "object"`, entao `comoRegistro` aceita array, e para desembrulhar o envelope isso
 * seria uma porta: `{ data: [ ... ] }` e forma que o fornecedor NUNCA emite, e aceita-la reabriria
 * a tolerancia que fez o contrato errado passar despercebido.
 */
function comoObjetoSimples(v: unknown): Record<string, unknown> | null {
  return Array.isArray(v) ? null : comoRegistro(v);
}

/**
 * EXISTE PARA A PROIBICAO SER LEGIVEL, e nao para ser chamada: o dominio nunca decide nada por um
 * identificador com cara de documento, e esta reexportacao e o que permite a quem ler este arquivo
 * conferir que a regra e a MESMA da grade, e nao uma segunda copia dela.
 */
export { pareceDocumentoOuTelefone };
