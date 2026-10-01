/**
 * OBRIGATÓRIOS-PARA-LIBERAR (item 6 do diretor). Domínio PURO.
 *
 * CONJUNTO PRÓPRIO, e é o ponto inteiro: estes 7 campos (Cargo, Sexo, Unidade do salário, Tipo de
 * contrato, Data de admissão, Pacote de benefícios, Escala) são pré-condição de LIBERAÇÃO, NÃO
 * pendência de esteira.
 * Por isso NÃO entram no `pendencia-config`/`pendenciasObrigatorias` (§A.19): colocar Sexo lá faria
 * Sexo virar pendência em toda superfície (Gerenciador, sinalizador, cores) e recriaria a divergência
 * que a §A.19 eliminou. É outra régua, com outro propósito, e vive só neste gate.
 *
 * §A.6: aqui só há chaves canônicas e rótulos de campo. Nenhum dado pessoal, nenhum valor.
 */

import { ROTULO_PENDENCIA } from "./pendencia-config";

/** As chaves dos obrigatórios-para-liberar. Contrato de código, não muda com o rótulo. */
export type ChaveObrigatorioLiberar =
  | "CARGO"
  | "SEXO"
  | "SALARIO_UNIDADE"
  | "TIPO_CONTRATO"
  | "DATA_ADMISSAO"
  | "BENEFICIOS"
  | "ESCALA";

/**
 * Rótulo legível de cada chave. Reusa o texto da régua unificada nos 5 que ela já nomeia (para o
 * usuário ver a MESMA palavra na esteira e no gate) e acrescenta "Sexo" e "Unidade do salário", que
 * não existem lá porque nenhum dos dois é pendência de esteira.
 *
 * ⚠️ O TEXTO TEM DE BATER COM O ESPELHO DA TELA (`liberacao/page.tsx`, `obrigatoriosLiberar`). Rótulo
 * diferente nas duas metades faz o time ver DUAS pendências que são a MESMA: a tela nomeia uma e o
 * servidor recusa com outra.
 */
export const ROTULO_OBRIGATORIO_LIBERAR: Record<ChaveObrigatorioLiberar, string> = {
  CARGO: ROTULO_PENDENCIA.CARGO,
  SEXO: "Sexo",
  SALARIO_UNIDADE: "Unidade do salário",
  TIPO_CONTRATO: ROTULO_PENDENCIA.TIPO_CONTRATO,
  DATA_ADMISSAO: ROTULO_PENDENCIA.DATA_ADMISSAO,
  BENEFICIOS: ROTULO_PENDENCIA.BENEFICIOS,
  ESCALA: ROTULO_PENDENCIA.ESCALA,
};

/** Os valores em jogo no instante da liberação (do corpo do liberar ou da admissão sendo liberada). */
export interface ValoresParaLiberar {
  cargoId?: string | null;
  /** Só consultado quando `incluirSexo` (individual). No lote é ignorado (Sexo é individual-only). */
  sexo?: string | null;
  /**
   * A UNIDADE do salário (`HORA`/`MENSAL`). ENTRA NO GATE por decisão do diretor, e entra por ser o
   * único campo da liberação em que o VAZIO não é "faltando": é "Mês", porque é esse o default do
   * campo correspondente no GI. Salário de hora liberado sem unidade não fica pendente, fica ERRADO
   * e com cara de certo.
   */
  salarioUnidade?: string | null;
  tipoContrato?: string | null;
  dataAdmissao?: string | null;
  /** Há pacote de benefícios? (estruturado com pelo menos um item). */
  temBeneficios?: boolean;
  escala?: string | null;
}

/** Vazio = ausente, nulo ou string em branco. Espaço não preenche campo obrigatório. */
function vazio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/**
 * As CHAVES faltantes entre os obrigatórios-para-liberar, na ordem de apresentação.
 *
 * `incluirSexo`: `true` no INDIVIDUAL (checa os 7). `false` no LOTE, porque Sexo é confirmado por
 * pessoa e um único valor de Sexo para toda a leva seria errado por definição (o `LiberarEmLoteDto`
 * nem carrega o campo). No lote, então, o gate checa os outros 6, INCLUSIVE a unidade do salário: no
 * lote o salário é um valor só para as N, então a unidade errada erra N folhas de uma vez.
 */
export function obrigatoriosFaltantesParaLiberar(
  valores: ValoresParaLiberar,
  opts: { incluirSexo: boolean },
): ChaveObrigatorioLiberar[] {
  const faltam: ChaveObrigatorioLiberar[] = [];
  if (vazio(valores.cargoId)) faltam.push("CARGO");
  if (opts.incluirSexo && vazio(valores.sexo)) faltam.push("SEXO");
  if (vazio(valores.salarioUnidade)) faltam.push("SALARIO_UNIDADE");
  if (vazio(valores.tipoContrato)) faltam.push("TIPO_CONTRATO");
  if (vazio(valores.dataAdmissao)) faltam.push("DATA_ADMISSAO");
  if (!valores.temBeneficios) faltam.push("BENEFICIOS");
  if (vazio(valores.escala)) faltam.push("ESCALA");
  return faltam;
}

/** Traduz as chaves faltantes nos seus rótulos legíveis (para a mensagem e para o rastro). */
export function rotulosDosFaltantes(chaves: ChaveObrigatorioLiberar[]): string[] {
  return chaves.map((c) => ROTULO_OBRIGATORIO_LIBERAR[c]);
}
