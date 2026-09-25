/**
 * OS CAMPOS QUE NÃO SAEM DE DOCUMENTO, e os dicionários de domínio do G.I.
 *
 * A trilha do Portal (peça 1) tem dois momentos de validação: a conferência POR DOCUMENTO (o
 * candidato confere o que a IA leu daquele documento) e o PASSO FINAL, curto, com o que ficou vazio
 * mais os campos que NÃO estão em documento nenhum: raça, grau de instrução, estado civil,
 * nacionalidade e naturalidade.
 *
 * ┌─ DE ONDE VÊM ESTAS TABELAS ─────────────────────────────────────────────────────────────────┐
 * │ Transcritas de `docs/GI-DADOS-DA-PESSOA-PARA-VALIDAR.md`, entregues pelo diretor em          │
 * │ 16/09/2026. A API do G.I NÃO expõe os catálogos de domínio, então o significado dos códigos   │
 * │ só vem de fora, e veio dele. O VALOR que grava é o CÓDIGO (ex.: "1" = Branca); o candidato    │
 * │ escolhe pelo rótulo. Cuidado registrado no doc: os códigos de estadoCivil NÃO são a inicial   │
 * │ da palavra (D = Divorciado, Q = Desquitado, V = Viuvo, U = Uniao Estavel).                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa vive aqui, só o domínio público (dicionário de código). §A.24: os
 * rótulos são etiquetas de opção, então Title Case. §A.11: nenhum travessão.
 *
 * NOTA DE COORDENAÇÃO (dono do shared-types é o coordenador, §A.39): estes dicionários e as chaves
 * de campo estão aqui, no frontend, para a peça 1 andar em homologação. Quando o backend do G.I
 * (peça 3) materializar o de/para, o ideal é que a fonte única suba para `@ea/shared-types` ou um
 * catálogo, e este arquivo passe a reexportá-la, como já se fez com as dicas de documento.
 */

export interface OpcaoGi {
  /** O código que grava no G.I (ex.: "1", "C"). */
  value: string;
  /** O rótulo que o candidato lê. Title Case (§A.24). */
  label: string;
}

/** `grauInstrucao`: 13 valores (GI-DADOS §A). */
export const GRAU_INSTRUCAO: readonly OpcaoGi[] = [
  { value: "1", label: "Analfabeto" },
  { value: "2", label: "Até 5o Ano Incompleto" },
  { value: "3", label: "5o Ano Completo" },
  { value: "4", label: "6o Ao 9o Ano Incompleto" },
  { value: "5", label: "Fundamental Completo" },
  { value: "6", label: "Ensino Médio Incompleto" },
  { value: "7", label: "Ensino Médio Completo" },
  { value: "8", label: "Superior Incompleto" },
  { value: "9", label: "Superior Completo" },
  { value: "A", label: "Pós-Graduação Completa" },
  { value: "B", label: "Mestrado Completo" },
  { value: "C", label: "Doutorado Completo" },
  { value: "D", label: "Pós-Doutorado Completo" },
];

/** `raca`: 6 valores (GI-DADOS §A). */
export const RACA: readonly OpcaoGi[] = [
  { value: "1", label: "Branca" },
  { value: "2", label: "Preta" },
  { value: "3", label: "Amarela" },
  { value: "4", label: "Parda" },
  { value: "5", label: "Indígena" },
  { value: "6", label: "Não Informado" },
];

/** `estadoCivil`: 7 valores (GI-DADOS §A). Código NÃO é a inicial da palavra. */
export const ESTADO_CIVIL: readonly OpcaoGi[] = [
  { value: "S", label: "Solteiro(a)" },
  { value: "C", label: "Casado(a)" },
  { value: "D", label: "Divorciado(a)" },
  { value: "Q", label: "Desquitado(a)" },
  { value: "V", label: "Viúvo(a)" },
  { value: "U", label: "União Estável" },
  { value: "O", label: "Outros" },
];

/**
 * O tipo de um campo do passo final: SELECT (dicionário) ou TEXTO livre.
 *
 * `nacionalidade` e `naturalidade` NÃO têm dicionário fechado no GI-DADOS (naturalidade pode ser
 * código de município ou texto, ainda em confirmação na reconexão, §4 do desenho), então entram
 * como TEXTO por enquanto. A chave (`campo`) casa com o que a IA usa na extração e com o que o
 * backend espera em `POST /portal/dados-gi`.
 */
export type CampoFinal =
  | { campo: string; rotulo: string; tipo: "select"; opcoes: readonly OpcaoGi[] }
  | { campo: string; rotulo: string; tipo: "texto"; ajuda?: string };

/**
 * OS CAMPOS QUE NÃO SAEM DE DOCUMENTO, na ordem do passo final. São sempre pedidos ao candidato,
 * porque o G.I precisa deles e nenhum documento comum os traz.
 */
export const CAMPOS_SEM_DOCUMENTO: readonly CampoFinal[] = [
  { campo: "raca", rotulo: "Cor Ou Raça", tipo: "select", opcoes: RACA },
  { campo: "grauInstrucao", rotulo: "Grau De Instrução", tipo: "select", opcoes: GRAU_INSTRUCAO },
  { campo: "estadoCivil", rotulo: "Estado Civil", tipo: "select", opcoes: ESTADO_CIVIL },
  {
    campo: "nacionalidade",
    rotulo: "Nacionalidade",
    tipo: "texto",
    ajuda: "Por exemplo: Brasileira.",
  },
  {
    campo: "naturalidade",
    rotulo: "Naturalidade",
    tipo: "texto",
    ajuda: "A cidade e o estado onde você nasceu.",
  },
];

/** O rótulo de uma opção pelo código, para exibir o já confirmado sem re-perguntar. */
export function rotuloDaOpcao(opcoes: readonly OpcaoGi[], value: string): string {
  return opcoes.find((o) => o.value === value)?.label ?? value;
}

/**
 * UM campo confirmado, pronto para gravar. É o corpo de `POST /portal/dados-gi`: a lista dos campos
 * que o candidato confirmou, cada um com a sua chave e o valor DELE (nunca o chute da IA). A
 * admissão vem da SESSÃO do portal, não do corpo (§A.6: o corpo não carrega quem é a pessoa).
 */
export interface CampoConfirmadoGi {
  campo: string;
  valor: string;
}

/** O corpo de `POST /portal/dados-gi`. */
export interface CorpoDadosGi {
  campos: CampoConfirmadoGi[];
}

/** Um campo do G.I que o candidato já viu na trilha: o rótulo e o valor que ELE confirmou. */
export interface CampoVisto {
  rotulo: string;
  valor: string;
}

/**
 * O QUE JÁ FOI CONFIRMADO COM VALOR, para deduplicar. Só entra o campo com valor não vazio: um
 * campo visto e deixado vazio NÃO conta como confirmado, então um documento seguinte que o leia
 * ainda oferece a segunda chance (o nome que não saiu no RG pode sair na CTPS).
 */
export function valoresConfirmadosDe(vistos: Record<string, CampoVisto>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const [campo, v] of Object.entries(vistos)) if (v.valor !== "") m[campo] = v.valor;
  return m;
}

/** O que ficou vazio no caminho: visto num documento e nunca preenchido. Volta no passo final. */
export function camposVaziosDe(vistos: Record<string, CampoVisto>): { campo: string; rotulo: string }[] {
  return Object.entries(vistos)
    .filter(([, v]) => v.valor === "")
    .map(([campo, v]) => ({ campo, rotulo: v.rotulo }));
}

/**
 * DEDUPLICAÇÃO: separa os campos deste documento em NOVOS (a conferir) e REPETIDOS (já confirmados
 * antes, só exibidos, nunca re-perguntados). O critério é a presença no mapa dos já confirmados.
 */
export function separarCampos<T extends { campo: string }>(
  campos: T[],
  jaConfirmados: Record<string, string>,
): { novos: T[]; repetidos: T[] } {
  const novos: T[] = [];
  const repetidos: T[] = [];
  for (const c of campos) {
    if (c.campo in jaConfirmados) repetidos.push(c);
    else novos.push(c);
  }
  return { novos, repetidos };
}
