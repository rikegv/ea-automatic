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
