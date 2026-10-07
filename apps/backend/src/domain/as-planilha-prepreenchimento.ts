/**
 * ─ O PRÉ-PREENCHIMENTO DA VAGA EM REVISÃO A PARTIR DA PLANILHA VIVA (07/10/2026) ────────────────
 *
 * ┌─ O QUE ESTE ARQUIVO DECIDE, EM UMA FRASE ────────────────────────────────────────────────────┐
 * │ Dadas as LINHAS da planilha de um mesmo CÓDIGO DE VAGA, quais valores do catálogo do EA podem │
 * │ ser pré-preenchidos naquela vaga: a NATUREZA (coluna "Tipo de Vaga"), a LINHA DE SERVIÇO       │
 * │ (coluna "Célula de Atendimento"), o CARGO (coluna "Vaga"), a DATA DE ABERTURA e a DATA LIMITE. │
 * │ Nada mais. ELE NÃO LIBERA NADA: a vaga continua em REVISÃO, e status, papel e trilha não são   │
 * │ assunto deste módulo nem de quem o chama.                                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A REGRA DURA: A ABSTENÇÃO É POR CAMPO, NUNCA POR LINHA ─────────────────────────────────────┐
 * │ O MESMO código de vaga aparece em várias linhas da planilha, porque a operação REAPROVEITAVA   │
 * │ código no passado (é o mesmo fundamento de `agregarStatusDaPlanilha`). Medido na planilha real: │
 * │ 37 códigos dão DOIS tipos de vaga diferentes, 29 dão duas células, 49 dão dois cargos.         │
 * │                                                                                                │
 * │ Quando o código tem MAIS DE UM valor para um campo, AQUELE CAMPO se abstém (nulo), e os        │
 * │ OUTROS CAMPOS seguem valendo: ambiguidade no tipo não pode apagar a célula do mesmo código.     │
 * │ Colapsar a abstenção para a linha inteira jogaria fora 29 células boas por causa de 37 tipos    │
 * │ contraditórios, que são conjuntos diferentes de códigos.                                        │
 * │                                                                                                │
 * │ ESCOLHER A PRIMEIRA LINHA É PROIBIDO. "A primeira" é a ordem da consulta, e decisão que depende │
 * │ da ordem é decisão que muda quando alguém edita a planilha. O sintoma medido desse defeito está │
 * │ escrito em `as-depara-cliente-nome.ts`: "o de/para do cliente X mudou sozinho", seis meses      │
 * │ depois, em silêncio, com a varredura reescrevendo de 30 em 30 minutos.                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ VALOR QUE NÃO CASA SE ABSTÉM, E NUNCA CAI NO RÓTULO MAIS PARECIDO ─────────────────────────┐
 * │ Não existe casamento aproximado aqui, em nenhum dos cinco campos. Distância de edição SEMPRE   │
 * │ acha ALGO num catálogo de 495 cargos, e o valor pré-preenchido chega na tela com cara de        │
 * │ trabalho feito: quem confere uma fila confirma em lote o que já está escrito. Pelo mesmo        │
 * │ motivo não existe `cast`: um token fora do vocabulário do enum não vira enum, ele se abstém.    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AUSÊNCIA NÃO É DISCORDÂNCIA, e esta é a assimetria deliberada do agregador ─────────────────┐
 * │ Linha com a célula vazia, ou com texto que não casa, NÃO CONTA como uma segunda opinião: ela é │
 * │ ausência de informação, e é filtrada antes da contagem de distintos (mesma forma do            │
 * │ `agregarStatusDaPlanilha`, que filtra os nulos antes de decidir). Fazer o contrário faria uma   │
 * │ única célula em branco entre 40 linhas iguais abster o campo inteiro, e a planilha é editada à  │
 * │ mão: célula em branco é o estado normal de centenas de linhas.                                  │
 * │                                                                                                │
 * │ E A CONTAGEM DE DISTINTOS É SOBRE O VALOR ALVO, não sobre o texto da planilha. Consequência     │
 * │ medida e desejada: "PONTUAIS" (128 linhas) e "ESTRATÉGICA" (16) vão AMBAS para a mesma linha de │
 * │ serviço, então um código que tenha as duas NÃO é ambíguo, porque as duas dizem a mesma coisa.   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: NENHUM dos cinco campos é dado pessoal. Tipo de vaga, célula de atendimento, cargo e as duas
 * datas são classificação e prazo de PROCESSO, não identificam ninguém, e é por isso que eles podem
 * atravessar a rede e virar espelho (a régua é a mesma de `status_planilha`). O que NÃO entra na
 * lista branca continua fora: salário, consultor, recrutador, telefone e nome de candidato.
 *
 * DOMÍNIO PURO: sem Nest, sem banco, sem rede, sem relógio. Os catálogos entram por ARGUMENTO, como
 * em `proporCasamentoDeCliente`, e o resultado não depende da ordem deles.
 */

import type { VagaNatureza } from "@ea/shared-types";
import { normalizarCodigoDeVaga } from "./as-depara-cliente-vaga";
import {
  proporCasamentoDeCliente,
  type ClienteDoCatalogo,
  type TipoDeCasamentoDeCliente,
} from "./as-depara-cliente-nome";

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A PROCEDÊNCIA
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * O ÚNICO VALOR DE PROCEDÊNCIA QUE ESTE MÓDULO PRODUZ, e o vocabulário é FECHADO no banco por CHECK.
 *
 * ELA EXISTE PARA UMA PERGUNTA SÓ, e é a mesma do `cliente_proposto_estado`: "este valor foi
 * DIGITADO por alguém ou foi COPIADO da planilha?". No dia em que uma linha da planilha estiver
 * errada, a pergunta que importa é QUANTAS vagas herdaram o mesmo erro, e isso é uma CONTAGEM.
 */
export const PROCEDENCIA_DA_PLANILHA = "PLANILHA" as const;
export type ProcedenciaDoPrePreenchimento = typeof PROCEDENCIA_DA_PLANILHA;

// ────────────────────────────────────────────────────────────────────────────────────────────────
// OS CAMPOS, E O VEREDICTO DE CADA UM
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Os CINCO campos pré-preenchíveis. Lista FECHADA: é ela a superfície de auditoria do módulo. */
export const CAMPOS_DO_PRE_PREENCHIMENTO = [
  "natureza",
  "linhaServico",
  "cargo",
  "dataAbertura",
  "dataLimite",
] as const;
export type CampoDoPrePreenchimento = (typeof CAMPOS_DO_PRE_PREENCHIMENTO)[number];

/**
 * POR QUE AQUELE CAMPO FICOU COMO FICOU, em vocabulário FECHADO.
 *
 * ELE NÃO É ENFEITE: é por ele que o resumo do ciclo conta ambiguidade por campo sem nomear nada
 * (§A.6, o resumo é CONTAGEM), e é ele que distingue os três silêncios que, no banco, viram o MESMO
 * nulo: "a planilha não disse", "a planilha disse algo que não reconheço" e "a planilha disse duas
 * coisas". Sem a distinção, pré-preenchimento que PAROU de chegar fica indistinguível de planilha
 * sem a coluna, que é o defeito que a leitura opcional do cabeçalho já evita do outro lado.
 */
export const VEREDICTOS_DO_PRE_PREENCHIMENTO = [
  /** Exatamente um valor alvo, e ele foi preenchido. */
  "PREENCHIDO",
  /** Nenhuma linha daquele código disse nada naquele campo. É o estado normal de muita linha. */
  "AUSENTE",
  /** A planilha disse, e nada casou com o catálogo nem com o vocabulário. Abstém-se. */
  "NAO_CASOU",
  /** O mesmo código deu DOIS valores alvo diferentes naquele campo. Abstém-se, por campo. */
  "AMBIGUO_NA_PLANILHA",
  /**
   * SÓ O CARGO ALCANÇA ESTE VEREDICTO: casou UM cargo, mas por PREFIXO, e prefixo não preenche.
   *
   * ┌─ POR QUE O PREFIXO NÃO PREENCHE O CARGO (e a decisão está reportada ao coordenador) ──────┐
   * │ A régua do cliente, decidida pelo diretor, é "só preenche no EXATO; o PREFIXO fica como    │
   * │ PROPOSTA, e a procedência distingue o grau, nunca achatar exato com prefixo". O cliente tem │
   * │ colunas de proposta (`cliente_proposto*`) onde o grau cabe; o CARGO não tem, e a única      │
   * │ coluna disponível é `vagas.cargo_id`, que é VALOR, não proposta. Gravar prefixo ali seria   │
   * │ exatamente o achatamento que a régua proíbe, e sem lugar onde registrar que foi palpite.    │
   * │ Então o prefixo é CALCULADO (não se perde informação) e NÃO É ESCRITO. Abrir a mão disso é  │
   * │ uma linha de código, no dia em que existir uma coluna de proposta de cargo.                 │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  "SO_PROPOSTA",
] as const;
export type VeredictoDoPrePreenchimento = (typeof VEREDICTOS_DO_PRE_PREENCHIMENTO)[number];

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A ENTRADA E A SAÍDA
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * UMA LINHA DA PLANILHA, já peneirada pela lista branca de colunas.
 *
 * AS QUATRO COLUNAS NOVAS SÃO OPCIONAIS DO OUTRO LADO DA REDE, e aqui isso chega como `null`: o
 * `ai-service` não as EXIGE no cabeçalho, de propósito, porque a leitura é fail-closed por cabeçalho
 * ausente e o espelho que ela alimenta é o GATE da varredura e o FILTRO da fila de revisão. Exigir
 * uma coluna acessória faria um rótulo renomeado derrubar a leitura inteira e VAGA REAL parar de
 * aparecer na tela. Aqui, coluna ausente é simplesmente campo `AUSENTE`.
 */
export interface LinhaDaPlanilhaParaPrePreenchimento {
  codigo: string | null;
  /** Coluna "Tipo de Vaga" (J). Vira `vagas.natureza`. */
  tipoVaga: string | null;
  /** Coluna "Célula de Atendimento" (AA). Vira `vagas.linha_servico_id`. */
  celulaAtendimento: string | null;
  /** Coluna "Vaga" (E), que é o CARGO. Vira `vagas.cargo_id`. */
  cargo: string | null;
  /** Coluna "Data de Abertura / Alinhamento" (N). Vira `vagas.data_abertura`. */
  dataAbertura: string | null;
  /** Coluna "SLA acordado para entrega" (P). Vira `vagas.data_limite`. */
  slaEntrega: string | null;
}

/** Uma entrada do catálogo de cargos do EA. `ativo` é lido: ver `cargoDaPlanilha`. */
export interface CargoDoCatalogo {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Uma entrada do catálogo de linhas de serviço (`as_linhas_servico`), pelo CÓDIGO imutável. */
export interface LinhaDeServicoDoCatalogo {
  id: number;
  codigo: string;
}

/** Os catálogos do EA, por ARGUMENTO. Resultado independente da ORDEM das duas listas. */
export interface CatalogosDoPrePreenchimento {
  cargos: readonly CargoDoCatalogo[];
  linhasServico: readonly LinhaDeServicoDoCatalogo[];
}

/**
 * OS VALORES PRÉ-PREENCHÍVEIS. Nulo é ABSTENÇÃO, sempre, e por campo.
 *
 * As duas datas saem em ISO (`AAAA-MM-DD`), que é o formato da coluna `date` do Postgres. A origem é
 * `DD/MM/AAAA` (formato da planilha) e a conversão mora aqui, uma vez, em função pura.
 */
export interface ValoresDoPrePreenchimento {
  natureza: VagaNatureza | null;
  linhaServicoId: number | null;
  cargoId: string | null;
  dataAbertura: string | null;
  dataLimite: string | null;
}

/** O resultado de um CÓDIGO: os valores e o porquê de cada campo. */
export interface PrePreenchimentoDeUmCodigo {
  valores: ValoresDoPrePreenchimento;
  veredictos: Record<CampoDoPrePreenchimento, VeredictoDoPrePreenchimento>;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A NORMALIZAÇÃO DE TEXTO PARA CASAMENTO
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * O TEXTO DA CÉLULA, NORMALIZADO PARA CASAMENTO: sem acento, sem caixa, pontuação virando espaço.
 *
 * A TOLERÂNCIA É NO RECONHECIMENTO, NUNCA NA ACEITAÇÃO. A planilha é digitada por gente, e os
 * valores medidos trazem acento ("Reposição Temporária", "ESTRATÉGICA"), caixa irregular e
 * separadores ("PROJETOS | ONE SHOT", "RPO / BPO"). Casar por igualdade crua faria o de/para parar
 * de funcionar no dia em que alguém trocasse a barra por um hífen, e o sintoma seria pré-preenchimento
 * silenciosamente zerado. Alargar a LISTA é outra coisa, e continua proibido.
 */
export function normalizarTextoDaPlanilha(bruto: unknown): string {
  if (bruto === null || bruto === undefined) return "";
  return String(bruto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. TIPO DE VAGA -> `vagas.natureza`
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * O DE/PARA DO TIPO DE VAGA, aprovado pelo diretor, com as ocorrências MEDIDAS na planilha real.
 *
 * A CHAVE É O TEXTO JÁ NORMALIZADO, e o valor é o token do enum `vaga_natureza`. O que não está
 * nesta tabela SE ABSTÉM: não existe "o rótulo mais parecido", e `Reposição Temporária` ganhou valor
 * PRÓPRIO no enum (migration 0145) justamente para não ser achatada no `REPOSICAO` genérico, porque
 * achatar perde a classificação que uma pessoa já fez na fonte.
 */
const NATUREZA_POR_TEXTO: Readonly<Record<string, VagaNatureza>> = {
  efetiva: "EFETIVA", // 143 ocorrências
  temporaria: "TEMPORARIA", // 49
  "reposicao efetiva": "REPOSICAO_EFETIVA", // 38
  estagio: "ESTAGIO", // 7
  terceira: "TERCEIRA", // 3
  "reposicao temporaria": "REPOSICAO_TEMPORARIA", // 2
  "vaga banco": "VAGA_BANCO", // 1
};

/** O tipo de vaga de UMA célula. `null` é "não disse" ou "não casou", e os dois se abstêm. */
export function naturezaDaPlanilha(bruto: unknown): VagaNatureza | null {
  const chave = normalizarTextoDaPlanilha(bruto);
  if (chave === "") return null;
  return NATUREZA_POR_TEXTO[chave] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. CÉLULA DE ATENDIMENTO -> `vagas.linha_servico_id`
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * O DE/PARA DA CÉLULA, aprovado pelo diretor, com as ocorrências MEDIDAS.
 *
 * ┌─ NÃO EXISTE "COLUNA DE CÉLULA" A CRIAR, E ISSO FOI MEDIDO ───────────────────────────────────┐
 * │ A célula de atendimento JÁ TEM coluna: `vagas.linha_servico_id`, que é o obrigatório número 8  │
 * │ da régua, com o rótulo literal "Célula de atendimento". Criar uma segunda coluna duplicaria o  │
 * │ obrigatório em dois lugares e quebraria a régua. O pré-preenchimento vai para a coluna que já  │
 * │ existe, e o alvo é o CÓDIGO do catálogo `as_linhas_servico`, nunca um texto solto.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * "PONTUAIS" E "ESTRATÉGICA" VÃO PARA O MESMO DESTINO, e é por isso que a contagem de distintos é
 * sobre o ALVO: um código que apareça com as duas palavras não é ambíguo, porque as duas apontam
 * para a mesma linha de serviço (`PONTUAIS_ESTRATEGICAS`, que é como o catálogo do EA a nomeia).
 */
const CODIGO_DE_LINHA_DE_SERVICO_POR_TEXTO: Readonly<Record<string, string>> = {
  pontuais: "PONTUAIS_ESTRATEGICAS", // 128 ocorrências
  estrategica: "PONTUAIS_ESTRATEGICAS", // 16
  "projetos one shot": "ONESHOT", // 65 ("PROJETOS | ONE SHOT")
  "alto volume": "ALTO_VOLUME", // 40
  soufast: "SOUFAST", // 31
  "rpo bpo": "RPO_BPO", // 4 ("RPO / BPO")
};

/**
 * O CÓDIGO do catálogo para UMA célula. Não resolve o `id`: quem o faz é o agregador, com o catálogo.
 *
 * A SEPARAÇÃO É DELIBERADA: o de/para é CONHECIMENTO FIXO (texto da planilha para código canônico) e
 * o `id` é dado do banco, que muda de ambiente para ambiente. Misturar os dois faria o de/para
 * depender de qual linha o catálogo recebeu primeiro.
 */
export function codigoDeLinhaDeServicoDaPlanilha(bruto: unknown): string | null {
  const chave = normalizarTextoDaPlanilha(bruto);
  if (chave === "") return null;
  return CODIGO_DE_LINHA_DE_SERVICO_POR_TEXTO[chave] ?? null;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. CARGO -> `vagas.cargo_id`
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** O cargo de UMA célula, com o GRAU do casamento. `null` quando não há palpite nenhum. */
export interface CasamentoDeCargo {
  cargoId: string;
  grau: Extract<TipoDeCasamentoDeCliente, "EXATO" | "PREFIXO">;
}

/**
 * O CARGO DE UMA CÉLULA, PELA MESMA DISCIPLINA DO CLIENTE, e não por uma segunda inventada aqui.
 *
 * ┌─ POR QUE ESTA FUNÇÃO DELEGA A `proporCasamentoDeCliente` ────────────────────────────────────┐
 * │ Aquela função NÃO É sobre clientes: ela é a disciplina de casamento de NOME desta casa, já     │
 * │ auditada duas vezes, e ela carrega quatro decisões que a reescrita perderia uma a uma: o EXATO │
 * │ VENCE o prefixo (explícito, não emergente do encadeamento); o PISO de comprimento do prefixo   │
 * │ (prefixo curto é coincidência de alfabeto, não informação); o prefixo terminando em FRONTEIRA  │
 * │ DE PALAVRA (sem isso `alfa` casa com `alfafa`); e a AMBIGUIDADE se abstendo, contada por       │
 * │ IDENTIFICADOR DISTINTO e nunca por entrada. Medido: 5 nomes normalizados do catálogo de cargos │
 * │ colidem com mais de um `cargo_id`, e esses 5 se abstêm.                                        │
 * │                                                                                                │
 * │ O QUE NÃO SE COPIA É O `cargoPorTexto` DE `ingestao-repositorio.ts`, que resolve o empate com  │
 * │ `order by nome limit 1`: aquilo ESCOLHE SOZINHO, em silêncio, pela ordem da consulta, e é o    │
 * │ padrão errado. O `id` do cargo decide a régua documental `(cod_cliente + cargo)` e o nome da    │
 * │ pasta do prontuário no Drive, e arquivamento no Drive não se desfaz (§A.33).                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CARGO INATIVO SE ABSTÉM, E ELE ENTRA NO CATÁLOGO DE MESMO JEITO. A ordem das duas coisas é a
 * regra: o cargo inativo PARTICIPA da contagem de ambiguidade (tirá-lo faria um par colidente virar
 * casamento único e o módulo passaria a propor um cargo que o catálogo esconde) e, se for ele que
 * vencer, o resultado é abstenção, porque cargo fora de circulação não é palpite útil.
 *
 * ┌─ OS DOIS LADOS ENTRAM JÁ NORMALIZADOS POR `normalizarTextoDaPlanilha`, E ISSO É A REGRA ─────┐
 * │ O que se reusa é a DISCIPLINA (exato vence prefixo, piso do prefixo, fronteira de palavra,    │
 * │ ambiguidade se abstém), NÃO as normalizações específicas de nome de CLIENTE. Aquelas duas (o   │
 * │ que está entre parênteses é anotação, o sufixo depois de " - " é cidade) existem porque razão  │
 * │ social traz `(filial)` e `- Campinas`, e aplicadas a CARGO fariam "Auxiliar - Noturno" casar   │
 * │ EXATO com o cargo "Auxiliar", que é outro cargo. Normalizando antes, a pontuação já virou       │
 * │ espaço, aquelas duas etapas ficam inertes (não há mais parêntese nem " - " a cortar) e sobra    │
 * │ exatamente o molde que se queria reusar.                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function cargoDaPlanilha(
  bruto: unknown,
  cargos: readonly CargoDoCatalogo[],
): CasamentoDeCargo | null {
  const alvo = normalizarTextoDaPlanilha(bruto);
  if (alvo === "") return null;
  /*
   * O CATÁLOGO ATRAVESSA COM O `id` NO LUGAR DO CÓDIGO DO CLIENTE. A função conta ambiguidade por
   * "código distinto", e aqui o identificador distinto é o `cargo_id`: duas entradas do MESMO cargo
   * não criam ambiguidade, duas de cargos diferentes criam.
   */
  const catalogo: ClienteDoCatalogo[] = cargos.map((c) => ({
    codCliente: c.id,
    razaoSocial: normalizarTextoDaPlanilha(c.nome),
  }));
  const palpite = proporCasamentoDeCliente(alvo, catalogo);
  if (palpite.tipo !== "EXATO" && palpite.tipo !== "PREFIXO") return null;
  const escolhido = cargos.find((c) => c.id === palpite.codCliente);
  /* Cargo fora de circulação não é palpite útil, e nulo aqui é o mesmo nulo de "não casou". */
  if (escolhido === undefined || !escolhido.ativo) return null;
  return { cargoId: escolhido.id, grau: palpite.tipo };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4 e 5. AS DUAS DATAS
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * `DD/MM/AAAA` VIRANDO `AAAA-MM-DD`, e NADA MAIS É ACEITO.
 *
 * ┌─ O VALOR É O DA PLANILHA, LITERAL, INCLUSIVE VENCIDO (decisão do diretor) ──────────────────┐
 * │ 97 das datas medidas já estão no passado, e elas entram assim mesmo: o campo registra o que a │
 * │ planilha diz, não o que seria conveniente. NÃO se usa `hoje` como palpite, NÃO se filtra por   │
 * │ futuro e NÃO se desloca nada. Inventar data em campo de prazo é pior do que deixar vazio,      │
 * │ porque a tela passa a afirmar um compromisso que ninguém assumiu.                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O DIA É CONFERIDO CONTRA O CALENDÁRIO (`31/02/2026` se abstém): sem isso o Postgres recusaria a
 * instrução e a escrita cairia no `catch` que protege a ingestão, de 30 em 30 minutos, em silêncio.
 * FUNÇÃO PURA: não consulta o relógio, então não tem fuso e não muda de resultado à meia-noite.
 */
export function dataDaPlanilha(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  const texto = String(bruto).trim();
  const casado = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (casado === null) return null;
  const dia = Number(casado[1]);
  const mes = Number(casado[2]);
  const ano = Number(casado[3]);
  if (mes < 1 || mes > 12 || dia < 1) return null;
  /* `Date.UTC` sem relógio: só aritmética de calendário, para rejeitar 31/02 e 30/02. */
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// O AGREGADOR: UM CÓDIGO, VÁRIAS LINHAS, UM VEREDICTO POR CAMPO
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** O resultado de um campo: o alvo único (quando há) e o porquê. `AUSENTE` separa-se de `NAO_CASOU`. */
function agregarCampo<T>(
  resolvidos: readonly (T | null)[],
  disseAlgo: boolean,
  chaveDe: (valor: T) => string,
): { valor: T | null; veredicto: VeredictoDoPrePreenchimento } {
  /* AUSÊNCIA NÃO É DISCORDÂNCIA: filtra-se antes de contar distintos (molde do status). */
  const uteis = resolvidos.filter((v): v is T => v !== null && v !== undefined);
  if (uteis.length === 0) {
    return { valor: null, veredicto: disseAlgo ? "NAO_CASOU" : "AUSENTE" };
  }
  const porChave = new Map<string, T>();
  for (const v of uteis) porChave.set(chaveDe(v), v);
  if (porChave.size > 1) return { valor: null, veredicto: "AMBIGUO_NA_PLANILHA" };
  const unico = [...porChave.values()][0] as T;
  return { valor: unico, veredicto: "PREENCHIDO" };
}

/** A célula disse ALGO? (texto não vazio em alguma linha). É o que separa `AUSENTE` de `NAO_CASOU`. */
function algumaCelulaPreenchida(brutos: readonly (string | null)[]): boolean {
  return brutos.some((b) => b !== null && b !== undefined && String(b).trim() !== "");
}

/**
 * ─ A FUNÇÃO PRINCIPAL: AS LINHAS DA PLANILHA VIRANDO UM PRÉ-PREENCHIMENTO POR CÓDIGO ───────────
 *
 * A CHAVE DO MAPA É `normalizarCodigoDeVaga`, a MESMA do espelho (`codigo_externo`) e a mesma que
 * `agregarStatusDaPlanilha` usa do lado de quem chama. Duas normalizações de chave nesta frente
 * divergiriam na primeira correção de uma só, e o sintoma seria pré-preenchimento que não encontra
 * a vaga que o status encontra.
 *
 * LINHA SEM CÓDIGO LEGÍVEL É DESCARTADA, e não agrupada num balde: o código é a única chave que liga
 * a linha à vaga, e 868 linhas medidas têm a célula em branco (estado normal, não erro de ninguém).
 *
 * CADA CAMPO É AGREGADO SOZINHO. É literalmente isso que faz a abstenção ser POR CAMPO: os cinco
 * agregadores abaixo não se consultam, e nenhum deles pode anular o resultado de outro.
 */
export function agregarPrePreenchimentoPorCodigo(
  linhas: readonly LinhaDaPlanilhaParaPrePreenchimento[],
  catalogos: CatalogosDoPrePreenchimento,
): Map<string, PrePreenchimentoDeUmCodigo> {
  const porCodigo = new Map<string, LinhaDaPlanilhaParaPrePreenchimento[]>();
  for (const linha of linhas ?? []) {
    const chave = normalizarCodigoDeVaga(linha?.codigo ?? null);
    if (chave === null) continue;
    const atual = porCodigo.get(chave);
    if (atual) atual.push(linha);
    else porCodigo.set(chave, [linha]);
  }

  /*
   * O `id` DA LINHA DE SERVIÇO VEM DO CATÁLOGO, POR CÓDIGO, e código que o catálogo não tem se
   * abstém: é o mesmo fail-closed do bloqueio 5 da auditoria ("o código que o catálogo perdeu não
   * vira valor gravado"), e aqui ele é de graça porque o catálogo chega por argumento.
   */
  const idPorCodigoDeLinha = new Map<string, number>();
  for (const l of catalogos.linhasServico ?? []) {
    const codigo = (l?.codigo ?? "").trim();
    if (codigo !== "") idPorCodigoDeLinha.set(codigo, l.id);
  }
  const cargos = catalogos.cargos ?? [];

  const resultado = new Map<string, PrePreenchimentoDeUmCodigo>();
  for (const [chave, doCodigo] of porCodigo) {
    const naturezas = agregarCampo(
      doCodigo.map((l) => naturezaDaPlanilha(l.tipoVaga)),
      algumaCelulaPreenchida(doCodigo.map((l) => l.tipoVaga)),
      (v) => v,
    );
    const linhasDeServico = agregarCampo(
      doCodigo.map((l) => {
        const codigo = codigoDeLinhaDeServicoDaPlanilha(l.celulaAtendimento);
        if (codigo === null) return null;
        return idPorCodigoDeLinha.get(codigo) ?? null;
      }),
      algumaCelulaPreenchida(doCodigo.map((l) => l.celulaAtendimento)),
      (v) => String(v),
    );
    const cargosDoCodigo = agregarCampo(
      doCodigo.map((l) => cargoDaPlanilha(l.cargo, cargos)),
      algumaCelulaPreenchida(doCodigo.map((l) => l.cargo)),
      (v) => v.cargoId,
    );
    const aberturas = agregarCampo(
      doCodigo.map((l) => dataDaPlanilha(l.dataAbertura)),
      algumaCelulaPreenchida(doCodigo.map((l) => l.dataAbertura)),
      (v) => v,
    );
    const limites = agregarCampo(
      doCodigo.map((l) => dataDaPlanilha(l.slaEntrega)),
      algumaCelulaPreenchida(doCodigo.map((l) => l.slaEntrega)),
      (v) => v,
    );

    /*
     * O GRAU DO CARGO DECIDE SE O VALOR SAI (ver `SO_PROPOSTA`): casou um só, mas por PREFIXO, então
     * o `cargo_id` NÃO é preenchido e o veredicto registra que havia palpite. Nada se perde, e nada
     * é achatado.
     */
    const cargoUnico = cargosDoCodigo.valor;
    const cargoSoProposta = cargoUnico !== null && cargoUnico.grau === "PREFIXO";

    resultado.set(chave, {
      valores: {
        natureza: naturezas.valor,
        linhaServicoId: linhasDeServico.valor,
        cargoId: cargoSoProposta ? null : (cargoUnico?.cargoId ?? null),
        dataAbertura: aberturas.valor,
        dataLimite: limites.valor,
      },
      veredictos: {
        natureza: naturezas.veredicto,
        linhaServico: linhasDeServico.veredicto,
        cargo: cargoSoProposta ? "SO_PROPOSTA" : cargosDoCodigo.veredicto,
        dataAbertura: aberturas.veredicto,
        dataLimite: limites.veredicto,
      },
    });
  }
  return resultado;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A OUTRA METADE DA PROCEDÊNCIA: A GRAVAÇÃO HUMANA LIMPA O CARIMBO
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ─ O MAPA DOS CINCO CAMPOS PARA AS COLUNAS DE `vagas`, e ele é a superfície de auditoria ────────
 *
 * DUAS COLUNAS POR CAMPO: a do VALOR e a da PROCEDÊNCIA. O mapa existe para o nome das colunas ser
 * escrito UMA vez: as quatro portas de gravação humana (`create`, `atualizar`, `liberarPendente-
 * Revisao` e a edição da vaga liberada) consomem este mesmo mapa, e uma sexta coluna acrescentada
 * aqui passa a valer nas quatro de uma vez, em vez de em três e meia.
 *
 * OS NOMES SÃO OS DO DRIZZLE (camelCase), porque é num `.set()` do Drizzle que eles são espalhados.
 */
export const COLUNA_DE_VALOR_POR_CAMPO = {
  natureza: "natureza",
  linhaServico: "linhaServicoId",
  cargo: "cargoId",
  dataAbertura: "dataAbertura",
  dataLimite: "dataLimite",
} as const satisfies Record<CampoDoPrePreenchimento, string>;

export const COLUNA_DE_PROCEDENCIA_POR_CAMPO = {
  natureza: "naturezaOrigem",
  linhaServico: "linhaServicoOrigem",
  cargo: "cargoOrigem",
  dataAbertura: "dataAberturaOrigem",
  dataLimite: "dataLimiteOrigem",
} as const satisfies Record<CampoDoPrePreenchimento, string>;

/**
 * A FORMA COMPARÁVEL DE UM VALOR DOS CINCO CAMPOS. Só para COMPARAR, nunca para gravar.
 *
 * Os três formatos que chegam aqui são os três que o banco e o formulário produzem: a `date` do
 * driver vem como `Date` OU como texto (a mesma assimetria que `emIso` já trata do outro lado da
 * frente), o `linha_servico_id` é número de um lado e pode chegar como texto do corpo, e o resto é
 * texto. VAZIO É NULO: `""` do formulário e `null` da coluna são o MESMO fato ("não tem valor"), e
 * tratá-los como diferentes faria abrir e salvar uma vaga sem cargo "mudar" o cargo.
 *
 * CAIXA IGNORADA porque os dois tipos de texto que passam por aqui são insensíveis a ela por
 * natureza: UUID de cargo e token de enum. Nenhum texto livre chega nesta função.
 */
function valorComparavel(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  if (bruto instanceof Date) return bruto.toISOString().slice(0, 10);
  const texto = String(bruto).trim();
  return texto === "" ? null : texto.toLowerCase();
}

/**
 * ─ QUAIS PROCEDÊNCIAS A GRAVAÇÃO HUMANA TEM DE LIMPAR, e por que a resposta é "só as que MUDARAM"
 *
 * ┌─ O BURACO QUE ESTA FUNÇÃO FECHA ────────────────────────────────────────────────────────────┐
 * │ O pré-preenchimento carimba `PLANILHA` no campo que ELE preencheu. Sem esta função, a pessoa  │
 * │ TROCA o valor na tela e o carimbo continua dizendo `PLANILHA`: ele passa a MENTIR na direção  │
 * │ oposta, afirmando "este veio da planilha" sobre um valor que alguém escolheu. E a procedência │
 * │ existe para UMA pergunta de CONTAGEM ("quantas vagas herdaram o mesmo erro da planilha?"),     │
 * │ então um carimbo que sobrevive à correção não erra de leve: ele conta a vaga JÁ CORRIGIDA      │
 * │ dentro do estrago, que é o oposto do que se foi medir.                                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ "ABRIU E SALVOU" NÃO É "TROCOU", e esta é a decisão, escrita onde ela é aplicada ───────────┐
 * │ A limpeza acontece SÓ quando o valor MUDOU. Salvar o formulário devolvendo o MESMO valor que a │
 * │ planilha propôs não limpa nada, e isso é deliberado:                                           │
 * │                                                                                                │
 * │ 1. A tela da revisão manda o FORMULÁRIO COMPLETO (a regra da casa é "o corpo é completo"),     │
 * │    então TODO salvamento reenvia os cinco campos, mexa a pessoa neles ou não. Limpar por        │
 * │    gravação, e não por mudança, zeraria as cinco procedências no primeiro salvamento de         │
 * │    qualquer campo, inclusive de um campo que não tem nada a ver (uma observação, um telefone    │
 * │    do solicitante). A procedência duraria até o primeiro Salvar, e a contagem nasceria vazia.   │
 * │ 2. A pergunta que a coluna responde é sobre a PROVENIÊNCIA DO VALOR, não sobre quem clicou em  │
 * │    Salvar por último. Enquanto o valor é o da planilha, a frase "este valor veio da planilha"   │
 * │    continua literalmente verdadeira, e é ela que a contagem lê.                                 │
 * │                                                                                                │
 * │ O CONTRA-ARGUMENTO EXISTE e é o "aceite": alguém conferiu e confirmou. Ele não foi adotado      │
 * │ porque confirmar não muda a PROVENIÊNCIA, e porque não há como distinguir, no corpo, o aceite   │
 * │ consciente do campo que a tela só devolveu. Registrar o aceite é outra coluna, não esta.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LIMPAR O VALOR TAMBÉM LIMPA O CARIMBO ─────────────────────────────────────────────────────┐
 * │ Trocar um valor por NULO é mudança como qualquer outra, e é por isso que a 0146 NÃO tem check  │
 * │ de coerência dentro do campo: o gesto legítimo de esvaziar o campo na tela não pode virar       │
 * │ violação de restrição. Carimbo sobre campo vazio seria o mesmo tipo de mentira.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS COLUNAS `*_origem` NUNCA ENTRAM EM `camposDaTrilha`, E A SEPARAÇÃO É A TRAVA ────────────┐
 * │ `camposDaTrilha` é o montador do FORMULÁRIO, e a regra declarada dele é "o corpo é COMPLETO,   │
 * │ campo ausente é campo LIMPO". Uma procedência emitida por ele seria apagada por qualquer        │
 * │ salvamento parcial, em silêncio, que é um defeito que esta casa já pagou (é o mesmo modo de     │
 * │ falha do `id_vacancy_pandape`, que virou vaga DUPLICATA). Procedência é DERIVADA da gravação,   │
 * │ não campo de formulário: ela sai desta função, espalhada no `.set()` DEPOIS do montador, e      │
 * │ carrega SÓ as chaves que devem virar nulo. Chave omitida no `.set()` do Drizzle deixa a coluna  │
 * │ INTOCADA, que é exatamente a preservação que se quer para os campos que não mudaram.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO SE LÊ O CARIMBO ATUAL PARA DECIDIR, de propósito: limpar uma coluna que já é nula é no-op no
 * banco, e exigir a leitura obrigaria as quatro portas a trazerem cinco colunas a mais na linha
 * travada só para evitar uma escrita que não custa nada. Quem decide é o VALOR, nos dois lados.
 *
 * FUNÇÃO PURA: sem banco, sem relógio, sem Nest. §A.6: ela só compara classificação de processo e
 * prazo, e devolve NOME DE COLUNA. Nenhum dado pessoal atravessa.
 */
export function procedenciaALimpar(
  /** A vaga como está gravada. Só os cinco campos de VALOR são lidos. */
  atual: Record<string, unknown> | null | undefined,
  /** O que a porta vai gravar (a saída de `camposDaTrilha`, já mesclada pela porta). */
  escrito: Record<string, unknown> | null | undefined,
): Record<string, null> {
  const limpar: Record<string, null> = {};
  if (!atual || !escrito) return limpar;
  for (const campo of CAMPOS_DO_PRE_PREENCHIMENTO) {
    const coluna = COLUNA_DE_VALOR_POR_CAMPO[campo];
    /*
     * CAMPO QUE A PORTA NEM VAI GRAVAR NÃO É GRAVAÇÃO HUMANA: a chave ausente no objeto escrito
     * quer dizer que aquela coluna fica intocada (é o caso da edição da vaga liberada, que monta o
     * `set` só com o que mudou). Compará-la contra `undefined` faria toda coluna preservada parecer
     * apagada, e a limpeza se espalharia para campos em que ninguém encostou.
     */
    if (!(coluna in escrito)) continue;
    if (valorComparavel(atual[coluna]) === valorComparavel(escrito[coluna])) continue;
    limpar[COLUNA_DE_PROCEDENCIA_POR_CAMPO[campo]] = null;
  }
  return limpar;
}

/**
 * ─ QUAIS CAMPOS DAQUELA VAGA ESTÃO, AGORA, COM PROCEDÊNCIA DE PLANILHA ─────────────────────────
 *
 * É O RETRATO que a ponte do funil grava no instante do envio para a admissão. Devolve NOMES DE
 * CAMPO do vocabulário fechado (`CAMPOS_DO_PRE_PREENCHIMENTO`), em ordem estável, e nada mais: nem
 * o valor, nem o texto da planilha, nem nada do candidato (§A.6).
 *
 * ELE PRECISA SER GRAVADO, E NÃO DERIVADO DEPOIS, e essa é a razão de a função existir: a partir
 * desta frente a gravação humana LIMPA a procedência (`procedenciaALimpar`), então perguntar à vaga
 * meses depois responde sobre o estado de HOJE, nunca sobre o do instante do envio.
 *
 * A COMPARAÇÃO É COM O VOCABULÁRIO, e não "coluna preenchida": o CHECK da 0146 tem um valor só
 * hoje, mas existe para o segundo ("veio do ATS", "veio da carga") ter de passar por alguém. Quando
 * ele existir, esta função continua respondendo sobre a PLANILHA, que é o que ela diz responder.
 */
export function camposComProcedenciaDaPlanilha(
  linha: Record<string, unknown> | null | undefined,
): CampoDoPrePreenchimento[] {
  if (!linha) return [];
  return CAMPOS_DO_PRE_PREENCHIMENTO.filter(
    (campo) => linha[COLUNA_DE_PROCEDENCIA_POR_CAMPO[campo]] === PROCEDENCIA_DA_PLANILHA,
  );
}

/** Nada a pré-preencher? É a pergunta que o escritor faz antes de mandar instrução ao banco. */
export function temAlgoAPrePreencher(valores: ValoresDoPrePreenchimento): boolean {
  return (
    valores.natureza !== null ||
    valores.linhaServicoId !== null ||
    valores.cargoId !== null ||
    valores.dataAbertura !== null ||
    valores.dataLimite !== null
  );
}
