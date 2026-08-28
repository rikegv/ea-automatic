/**
 * DOMÍNIO PURO da trava do "Liberado Para Cadastro Sem ASO" (OST do ADM, decisão do diretor).
 *
 * A REGRA. O status só pode ser marcado quando a PREVISÃO DO ASO for POSTERIOR à DATA DE ADMISSÃO.
 * O sentido é o do pedido: liberar sem ASO existe porque a pessoa precisa COMEÇAR A TRABALHAR antes
 * de o documento ficar pronto. Se o ASO fica pronto ANTES de ela começar, não há o que liberar, é só
 * esperar o documento chegar.
 *
 *   admissão 01/09, ASO previsto 04/09  →  PERMITE (ela começa antes de o ASO existir)
 *   admissão 01/09, ASO previsto 28/08  →  BLOQUEIA (o ASO chega antes de ela começar)
 *
 * BLOQUEIO DURO, sem aceite e sem bypass, no mesmo molde do gate do AGENDADO. Não é a regra geral de
 * "pendência sinaliza e nunca impede" (§A.3 regra 5), que fala da CRIAÇÃO da admissão: aqui é gate de
 * TRANSIÇÃO DE STATUS, e a diferença já está estabelecida no serviço da Esteira.
 *
 * SEM PREVISÃO PREENCHIDA, BLOQUEIA. A previsão é opcional no agendamento (quem a informa é a
 * clínica, e exigi-la travaria um exame legitimamente agendado), então a maior parte da fila hoje não
 * a tem. Sem ela não há como comparar, e liberar sem comparar seria liberar sem a regra. O recado diz
 * exatamente o que falta, para o consultor resolver em vez de adivinhar.
 *
 * COMPARAÇÃO DE STRING `YYYY-MM-DD`, e é o certo aqui: as duas pontas são `date` no banco (sem hora,
 * sem fuso), e `Date` do JavaScript reintroduziria fuso num campo que não tem. Zero-padded, a ordem
 * lexicográfica É a ordem cronológica.
 *
 * §A.6: só datas. Nenhum dado pessoal entra nesta função.
 */

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface EntradaLiberacaoSemAso {
  /** Data de admissão da admissão, ISO `YYYY-MM-DD`. */
  dataAdmissao?: string | null;
  /** Previsão de entrega do ASO informada pela clínica, ISO `YYYY-MM-DD`. */
  previsaoAso?: string | null;
}

/** O motivo do bloqueio, ou `undefined` quando a liberação é permitida. */
export type MotivoBloqueioLiberacao =
  | "SEM_DATA_ADMISSAO"
  | "SEM_PREVISAO_ASO"
  | "PREVISAO_NAO_POSTERIOR";

/**
 * A liberação sem ASO é permitida? Devolve `undefined` quando sim, e o motivo quando não.
 *
 * Devolve o MOTIVO e não um booleano de propósito: o recado da tela precisa dizer QUAL das três
 * situações barrou, senão o consultor recebe "não pode" sem saber o que resolver.
 */
export function bloqueioLiberacaoSemAso(
  e: EntradaLiberacaoSemAso,
): MotivoBloqueioLiberacao | undefined {
  const adm = normaliza(e.dataAdmissao);
  const previsao = normaliza(e.previsaoAso);
  if (!adm) return "SEM_DATA_ADMISSAO";
  if (!previsao) return "SEM_PREVISAO_ASO";
  // ESTRITAMENTE POSTERIOR: previsão no MESMO dia da admissão não libera. O ASO sai no dia em que a
  // pessoa começa, então não há janela a cobrir.
  if (previsao <= adm) return "PREVISAO_NAO_POSTERIOR";
  return undefined;
}

/** O recado que a tela mostra. Texto de mensagem, escrita normal (§A.24 vale para título e tag). */
export function mensagemBloqueioLiberacao(
  motivo: MotivoBloqueioLiberacao,
  e: EntradaLiberacaoSemAso,
): string {
  switch (motivo) {
    case "SEM_DATA_ADMISSAO":
      return (
        "Informe a data de admissão antes de liberar sem ASO. A liberação existe para quem começa " +
        "a trabalhar antes de o ASO ficar pronto, e sem a data não há como comparar."
      );
    case "SEM_PREVISAO_ASO":
      return (
        "Informe a previsão do ASO no agendamento do exame antes de liberar sem ASO. Sem a " +
        "previsão não há como conferir se o documento fica pronto depois de a pessoa começar."
      );
    case "PREVISAO_NAO_POSTERIOR":
      return (
        `A previsão do ASO (${fmt(e.previsaoAso)}) não é posterior à data de admissão ` +
        `(${fmt(e.dataAdmissao)}). O ASO fica pronto antes de a pessoa começar, então não há o que ` +
        "liberar: aguarde o documento e conclua o exame como Apto."
      );
  }
}

/** `YYYY-MM-DD` para `DD/MM/YYYY`, que é como a operação lê data. Vazio vira "não informado" (§A.11). */
function fmt(iso?: string | null): string {
  const v = normaliza(iso);
  if (!v) return "não informado";
  const [a, m, d] = v.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * A data como `YYYY-MM-DD`, ou `undefined` se não houver data utilizável.
 *
 * Tolerante ao que o driver devolve: `date` do Postgres chega como string, mas uma consulta crua ou
 * um harness podem entregar `Date`. Um `.slice(0, 10)` cego sobre um `Date` daria "[object Ob".
 */
function normaliza(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v !== "string") return undefined;
  const s = v.slice(0, 10);
  return DATA_ISO.test(s) ? s : undefined;
}
