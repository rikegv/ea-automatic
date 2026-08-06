/**
 * TIPO DE CONTRATO: a grafia canônica e o de/para das grafias que a base já viu.
 *
 * POR QUE ESTE MÓDULO EXISTE (incidente de 06/08/2026). O mapa nasceu dentro de
 * `db/normaliza-tipo-contrato.ts`, que é um SCRIPT de manutenção e importa o cliente do banco. Para o
 * DTO da API validar a entrada, ele precisa do mapa e NÃO pode arrastar o banco junto, então o mapa
 * passou a morar aqui, puro, e o script o reexporta. Nada de comportamento mudou.
 *
 * O QUE O INCIDENTE PROVOU. A admissão da Thaís chegou pela carga com `tipo_contrato = "TERC."`. O
 * mapa de pasta-pai do Drive é chaveado pela grafia canônica normalizada (`terceirizado`), então
 * "terc." não resolveu, o contrato assinado não arquivou e o status ficou preso em
 * AGUARDANDO_ASSINATURA, repetindo a tentativa de 5 em 5 minutos sem nunca sair do lugar. Um campo de
 * texto livre num dado que OUTRAS partes do sistema usam como chave é uma bomba de tempo: a grafia
 * errada não dá erro, ela some silenciosamente lá na frente.
 */

/**
 * A lista canônica, a MESMA do wizard (§A.22 W5). É a grafia que a tela oferece e a única que a API
 * aceita gravar.
 */
export const TIPOS_CANONICOS = [
  "Temporário",
  "Terceirizado",
  "Estágio",
  "Interno",
  "Fopag",
  "Jovem Aprendiz",
] as const;
export type TipoContratoCanonico = (typeof TIPOS_CANONICOS)[number];

/**
 * De/para das grafias ENCONTRADAS na base. Só entram as inequívocas: a abreviação da carga e a forma
 * canônica que a tela já grava (esta última fica no mapa de propósito, para o de/para ser idempotente).
 *
 * FORA DO MAPA, deliberadamente:
 *  - `NULL`: não tem tipo, e inventar um seria pior que a ausência.
 *  - "ESTA. FOPAG": mistura DOIS conceitos (estágio e a folha Fopag) e só o diretor decide o destino.
 */
export const MAPA_GRAFIAS: Record<string, TipoContratoCanonico> = {
  "TEMP.": "Temporário",
  Temporário: "Temporário",
  "TERC.": "Terceirizado",
  Terceirizado: "Terceirizado",
  "ESTA.": "Estágio",
  Estágio: "Estágio",
  "INTER.": "Interno",
  Interno: "Interno",
  FOPAG: "Fopag",
  Fopag: "Fopag",
  "APREN.": "Jovem Aprendiz",
  "Jovem Aprendiz": "Jovem Aprendiz",
};

/** A grafia tem destino canônico? `null` = fora do mapa, não converte. */
export function canonicoDe(grafia: string | null): TipoContratoCanonico | null {
  if (grafia === null) return null;
  return MAPA_GRAFIAS[grafia] ?? null;
}

/**
 * NORMALIZA UMA ENTRADA da API. Aceita a grafia canônica, a abreviação da carga e variações de caixa
 * e acento ("temporario", "TEMPORÁRIO"); devolve sempre a canônica.
 *
 * CONVERTE, NÃO BARRA (decisão do diretor): fluxo legítimo que manda "TEMP." tem de passar pela
 * normalização, não tomar 400. Só o que não casa com NENHUMA grafia conhecida volta `null`, e aí sim
 * a validação recusa, porque gravar uma grafia nova é exatamente como o incidente começou.
 *
 * Vazio e nulo devolvem `undefined`: "não informado" é estado legítimo (o tipo é pendência da régua,
 * não trava de liberação, §A.19), e não pode virar erro de validação.
 */
export function normalizarTipoContrato(valor: unknown): TipoContratoCanonico | null | undefined {
  if (valor === null || valor === undefined) return undefined;
  if (typeof valor !== "string") return null;
  const bruto = valor.trim();
  if (!bruto) return undefined;

  const direto = MAPA_GRAFIAS[bruto];
  if (direto) return direto;

  // Comparação tolerante: caixa e acento fora, e o ponto final da abreviação também ("TEMP." = "temp").
  const chave = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\.$/, "")
      .trim();
  const alvo = chave(bruto);
  for (const [grafia, canonico] of Object.entries(MAPA_GRAFIAS)) {
    if (chave(grafia) === alvo) return canonico;
  }
  return null;
}
