import type { CampoDeDivergencia, EscopoDeDivergencia } from "@ea/shared-types";
import { SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO } from "./as-ponte-admissao";

/**
 * ─ A RÉGUA DE PRECEDÊNCIA DA INGESTÃO, COMO DOMÍNIO PURO ───────────────────────────────────────
 *
 * ESTE ARQUIVO NÃO TEM CONSULTA, NÃO TEM NEST E NÃO TEM BANCO. Ele responde UMA pergunta, e só
 * ela: dado o valor que o EA tem e o valor que o ATS trouxe, a ingestão ESCREVE, não faz NADA, ou
 * registra uma DIVERGÊNCIA para o time decidir?
 *
 * ┌─ O DEFEITO QUE ELA EXISTE PARA MATAR (medido em 30/09/2026) ────────────────────────────────┐
 * │ O `update` da candidatura era `set etapa = ..., situacao = ..., motivo_descarte = ... where   │
 * │ id = ... and (atuais) is distinct from (novos)`. Aquele `is distinct from` NÃO ERA PROTEÇÃO,  │
 * │ ERA O GATILHO: ele existia só para não empurrar `atualizado_em` numa reentrega idêntica, e    │
 * │ comparava VALOR com VALOR, nunca AUTOR com AUTOR. O time avançava a pessoa três etapas,       │
 * │ ninguém tocava no ATS, e em até 30 minutos ela VOLTAVA, em loop, em 24 das 27 pastas do       │
 * │ de/para. E era SILENCIOSO: a ingestão não escreve em `as_candidatura_etapas`, então o evento   │
 * │ humano continuava na trilha dizendo "foi para Entrevista Cliente" enquanto a coluna dizia      │
 * │ CAPTACAO, e nenhuma tela comparava as duas.                                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O EA VENCE NO EMPATE, E NÃO É HIERARQUIA ──────────────────────────────────────────┐
 * │ É CUSTO ASSIMÉTRICO DO ERRO. Se o EA vence errado, o time perde uma informação e resolve num  │
 * │ clique na fila. Se o ATS vence errado, o trabalho do time é apagado em silêncio e ninguém     │
 * │ descobre. Abster-se é o comportamento seguro, a mesma lógica da §A.33.                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A RÉGUA É UMA FUNÇÃO, E NÃO UM `if` NO REPOSITÓRIO ────────────────────────────────┐
 * │ Ela governa DOIS lados com formas de dado bem diferentes (a candidatura, por linha, e a vaga, │
 * │ por papel de status), e dois `if` escritos em dois lugares concordam por coincidência até o   │
 * │ dia em que alguém corrigir um só. Aqui a régua tem UM dono, UM teste puro e UM vocabulário.   │
 * │ É a mesma correção que o `seguranca` já cobrou em `as-ponte-admissao.ts` e em `domain/digai`. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ §A.6, E A AFIRMACAO QUE ESTAVA AQUI ESTAVA ERRADA (veto do `seguranca`, 30/09/2026) ───────┐
 * │ O texto antigo dizia que TODOS os campos comparados eram "código, rótulo de vaga ou número", e  │
 * │ incluía `motivo_descarte` nessa conta, afirmando que ele era "nome do catálogo interno, não     │
 * │ texto de pessoa". A CASA JA HAVIA MEDIDO O CONTRARIO, em dois lugares:                          │
 * │   . `candidatos.dto.ts` registra que o campo tem DUAS NATUREZAS: só no `DESCARTADO` ele é nome  │
 * │     do catálogo; no `ENVIADO_PARA_ADMISSAO` ele continua PROSA, com teto de 500 caracteres;     │
 * │   . `retencao-candidatos.service.ts` NULA a coluna no expurgo, na MESMA CTE que substitui o     │
 * │     resumo de contato, com a narrativa "texto livre pelo mesmo motivo e com a mesma exposição". │
 * │     Ou seja: a casa já classificou aquele campo como DADO PESSOAL.                              │
 * │                                                                                                │
 * │ O QUE MUDOU, E O QUE NAO MUDOU. A trava dele CONTINUA INTEIRA (ele é `CAMPO_PROTEGIDO`, e o ATS │
 * │ nunca o escreve em candidatura existente). O que saiu foi a LINHA DE FILA: ele não é mais um    │
 * │ `CampoDeDivergencia`, porque a fila guarda `valor_ea`/`valor_ats` EM CLARO e seria superfície    │
 * │ FORA DO ALCANCE DO EXPURGO (ele anonimiza a pessoa sem DELETAR a candidatura, então o           │
 * │ `on delete cascade` da tabela nunca dispara, e o EA nularia a frase na candidatura e a manteria │
 * │ para sempre na linha de fila). O argumento "vem por JOIN" não cobria este caso: ali seria COPIA.│
 * │                                                                                                │
 * │ Para o valor voltar à tela, a coluna precisa primeiro entrar na rotina de expurgo. Decisão do   │
 * │ diretor, não da fábrica (§A.31).                                                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE SOBRA AQUI É NAO-PESSOAL DE VERDADE: código de etapa, código de situação, código de vaga,
 * nome de divulgação da vaga, id de cidade e número de posições. Os campos pessoais de
 * `as_candidatos` (nome, CPF, e-mail, telefone, nascimento) nunca entraram nesta régua.
 */

/**
 * ─ AS DUAS LISTAS, E ELAS DEIXARAM DE SER A MESMA EM 30/09/2026 ────────────────────────────────
 *
 * ┌─ POR QUE SEPARAR, e por que a diferença NÃO é redundância ──────────────────────────────────┐
 * │ PROTEGER e REGISTRAR eram a mesma decisão até o veto do `seguranca`: todo campo que o ATS não  │
 * │ podia sobrescrever virava linha de fila. `motivo_descarte` quebrou a coincidência, porque ele é │
 * │ protegido (o time escolheu aquele desfecho, e a frase genérica do ATS o apagaria) e NAO PODE    │
 * │ ser publicado na fila (ele é PROSA, e a fila está fora do alcance do expurgo).                  │
 * │                                                                                                │
 * │ COLAPSAR AS DUAS DE NOVO É O ERRO A EVITAR, nos dois sentidos: quem tirar `motivo_descarte` de  │
 * │ `CAMPOS_PROTEGIDOS` devolve ao ATS o poder de apagar a justificativa que uma pessoa digitou;    │
 * │ quem o acrescentar aos que viram divergência reabre o furo de §A.6 que o veto fechou.           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * OS CAMPOS DA CANDIDATURA QUE O ATS NUNCA SOBRESCREVE EM LINHA QUE JA EXISTE. Os três, sem exceção.
 *
 * `motivo_descarte` ESTA AQUI e é a razão de esta lista existir separada: ele é a MESMA decisão de
 * descarte que `situacao`, e o que o ATS traz é a frase GENERICA do de/para (`motivo_padrao`, uma
 * linha de configuração igual para todo mundo daquela pasta). Escrevê-la apagaria o motivo de
 * catálogo que o time escolheu para AQUELA pessoa, trocando informação específica por rótulo de lote.
 */
export const CAMPOS_PROTEGIDOS_DA_CANDIDATURA = [
  "etapa",
  "situacao",
  "motivo_descarte",
] as const;
export type CampoProtegidoDaCandidatura = (typeof CAMPOS_PROTEGIDOS_DA_CANDIDATURA)[number];

/**
 * OS CAMPOS DA CANDIDATURA QUE VIRAM LINHA DE FILA. DOIS, e não os três de cima.
 *
 * `motivo_descarte` FICA DE FORA POR VETO DE SEGURANCA, e não por esquecimento: ver o bloco de §A.6
 * no cabeçalho deste arquivo. A diferença entre esta lista e a de cima é EXATAMENTE aquele campo, e é
 * por isso que as duas são declaradas: a divergência dele é SILENCIOSA de propósito (o EA vence e
 * ninguém é avisado), o que é o preço aceito para não publicar prosa numa superfície sem expurgo.
 */
export const CAMPOS_DE_DIVERGENCIA_DA_CANDIDATURA = ["etapa", "situacao"] as const;
export type CampoDeDivergenciaDaCandidatura =
  (typeof CAMPOS_DE_DIVERGENCIA_DA_CANDIDATURA)[number];

/** O que a ingestão faz com um campo, depois de comparar os dois lados. */
export type AcaoDePrecedencia =
  /** O ATS escreve: não há trabalho manual a proteger neste ponto (nascimento, ou vaga em revisão). */
  | "ESCREVER"
  /** Os dois lados dizem a mesma coisa: nada a escrever e nada a revisar. */
  | "NADA"
  /** Os lados discordam e o ponto é protegido: o EA fica, e a diferença vira linha de revisão. */
  | "DIVERGIR";

/**
 * O VALOR NORMALIZADO PARA COMPARAÇÃO, e ele é TEXTO ou NULO, sempre.
 *
 * ┌─ POR QUE A NORMALIZAÇÃO É AQUI, E NÃO NO SQL ───────────────────────────────────────────────┐
 * │ Os dois lados chegam em tipos diferentes: `posicoes_oficiais` é inteiro no banco e pode vir   │
 * │ como número, texto ou nada da API; `cidade_id` é inteiro; `etapa` é texto. Comparar sem       │
 * │ normalizar faria `3` diferente de `"3"` e a fila encheria de divergência que não existe, em   │
 * │ toda volta, para sempre. A mesma função responde pelos dois lados, o que é o que torna a      │
 * │ comparação simétrica por construção.                                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * VAZIO É AUSÊNCIA. `""`, `"   "`, `null` e `undefined` são a mesma coisa para a régua: "este lado
 * não disse nada". É a mesma leitura que `textoOuNulo` já faz no repositório, e evitar duas leituras
 * diferentes de "vazio" é justamente o que impede a divergência fantasma entre nulo e string vazia.
 */
export function valorDeComparacao(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : null;
  if (typeof valor === "boolean") return String(valor);
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

/**
 * A RÉGUA, e ela cabe em três linhas porque a decisão é de PROCEDÊNCIA, não de valor.
 *
 * `protegido` é o que separa NASCER de SOBRESCREVER, e quem responde é o chamador, porque a pergunta
 * é diferente em cada lado:
 *   . CANDIDATURA: protegido quando a linha JÁ EXISTE. No nascimento não há trabalho manual a
 *     proteger, então o ATS escreve normalmente (é ele quem traz a pessoa).
 *   . VAGA: protegida quando a vaga JÁ SAIU da revisão, ou seja quando o status dela tem PAPEL
 *     diferente de `REVISAO`. Enquanto ela está na fila, ninguém conferiu nada ali e o espelho do
 *     ATS é a melhor informação que existe; depois da liberação, cada campo foi olhado por gente.
 *
 * A COMPARAÇÃO VEM ANTES DA PROTEÇÃO de propósito: dois lados iguais são `NADA` mesmo em ponto
 * protegido. Sem essa ordem, 48 voltas por dia abririam linha de revisão para toda candidatura em
 * que o ATS concorda com o EA, que é a maioria, e a fila de trabalho viraria log.
 */
export function decidirPrecedencia(args: {
  protegido: boolean;
  valorEa: unknown;
  valorAts: unknown;
}): AcaoDePrecedencia {
  const ea = valorDeComparacao(args.valorEa);
  const ats = valorDeComparacao(args.valorAts);
  if (ea === ats) return "NADA";
  if (!args.protegido) return "ESCREVER";
  return "DIVERGIR";
}

/** Uma divergência pronta para virar linha, já com os dois valores normalizados. */
export interface DivergenciaARegistrar {
  escopo: EscopoDeDivergencia;
  campo: CampoDeDivergencia;
  candidaturaId: string | null;
  vagaId: string | null;
  valorEa: string | null;
  valorAts: string | null;
}

/**
 * ─ A RETENTATIVA DA PONTE PARA A ADMISSÃO, E ELA SÓ FICOU SEGURA AGORA ─────────────────────────
 *
 * A ponte disparava SÓ NO NASCIMENTO da candidatura, e a restrição estava CERTA enquanto a ingestão
 * sobrescrevia `situacao`: naquele mundo, uma candidatura existente podia virar
 * `ENVIADO_PARA_ADMISSAO` por sinal do ATS que estava DESFAZENDO o trabalho do time, e admissão
 * criada é muito mais caro de desfazer do que etapa trocada.
 *
 * ┌─ O QUE MUDOU, E POR QUE A CONDIÇÃO NOVA É PROVÁVEL EM VEZ DE ARRISCADA ─────────────────────┐
 * │ Com a trava de precedência, o ATS NUNCA MAIS escreve `situacao` em linha que já existe. Logo  │
 * │ o par (`situacao = ENVIADO_PARA_ADMISSAO` **e** `admissao_id` nulo) passou a ter UMA origem    │
 * │ possível: o INSERT da própria ingestão, numa volta em que a ponte não se completou (CPF        │
 * │ ausente, cliente não resolvido, falha de rede). Não existe mais o caminho em que o ATS         │
 * │ ressuscita aquela situação por cima de uma decisão humana.                                     │
 * │                                                                                               │
 * │ ANTES DA TRAVA ISTO SERIA UM FURO, e é a mesma condição: o ATS escrevia a situação, e a        │
 * │ retentativa abriria admissão a partir do valor que ele acabou de empurrar. A ordem importa:    │
 * │ item 6 é consequência do item 2, e não um ajuste independente.                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A GUARDA DE IDEMPOTÊNCIA POR `admissao_id` CONTINUA SENDO A DE VERDADE, e mora no adaptador da
 * ponte (`ingestao-ponte-admissao.ts`), que a lê antes de qualquer escrita. Esta função só evita a
 * chamada inútil: sem ela, cada volta de 30 minutos pediria uma ponte por candidatura já ligada.
 *
 * FAIL-CLOSED EM TODO "NÃO SEI": adaptador que não sabe dizer se a linha nasceu (`criada`
 * indefinido) nem qual a situação atual dela cai para o lado de NÃO criar admissão.
 */
export function ponteDeveDisparar(args: {
  /** A linha de de/para resolvida pede pré-admissão? (`desfechoDaIngestaoExterna`) */
  desfechoPedePonte: boolean;
  /** A candidatura NASCEU nesta escrita? `undefined` vale como "não sei", e não como sim. */
  criada?: boolean;
  /** A situação que a candidatura EXISTENTE tem hoje no EA. `undefined` = não sei. */
  situacaoNoEa?: string | null;
  /** A candidatura EXISTENTE já aponta para uma admissão? `undefined` = não sei. */
  jaTemAdmissao?: boolean;
}): boolean {
  if (!args.desfechoPedePonte) return false;
  if (args.criada === true) return true;
  if (args.jaTemAdmissao !== false) return false;
  /*
   * A LISTA É A MESMA DO OUTRO LADO, e não um literal escrito aqui: `SITUACOES_QUE_PEDEM_PONTE_PARA
   * _ADMISSAO` já responde "esta situação pede pré-admissão?" para o valor que VEM do de/para, e a
   * pergunta sobre o valor que ESTÁ no EA é a mesma pergunta. Duas listas concordariam até o dia em
   * que alguém acrescentasse uma situação a uma só delas.
   */
  const noEa = args.situacaoNoEa ?? null;
  return noEa !== null && (SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO as readonly string[]).includes(noEa);
}
