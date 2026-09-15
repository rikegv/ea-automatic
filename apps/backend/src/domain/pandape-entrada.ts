import type { PandapeEntradaDesfecho, PandapeEntradaMotivo } from "@ea/shared-types";

/**
 * ─ A RÉGUA PURA DA FILA DE ENTRADAS DO PANDAPÉ (OST do diretor, 15/09/2026) ────────────────────
 *
 * Duas funções, sem banco, sem Nest e sem IO: quem AINDA está pendente e como uma exceção vira um
 * CÓDIGO. As duas existem para que ninguém precise reimplementá-las, que é a divergência que a §A.19
 * eliminou (a coluna dizia "Completo" enquanto o modal listava pendência na MESMA admissão).
 *
 * §A.6 em uma frase: `classificarMotivo` LÊ a mensagem do erro e devolve um valor de conjunto
 * fechado. Ler é permitido, PERSISTIR a mensagem é proibido. O `detail` do erro 23505 do Postgres
 * traz o CPF por extenso (o unique parcial de produção é `uq_admissao_cpf_vaga_viva`), então um
 * código que não vem de lá é a única forma de o vazamento ser IMPOSSÍVEL, e não apenas improvável.
 */

/** Uma linha da fila, do jeito que a régua a enxerga. Só o que a decisão precisa. */
export interface LinhaDeEntrada {
  desfecho: PandapeEntradaDesfecho | string;
  resolvidoEm: Date | string | null;
}

/**
 * OS DESFECHOS QUE ENCERRAM o evento. Zerou, sai da fila (§A.19).
 *
 * `PRE_ADMISSAO` sai junto, e isso é requisito e não descuido: a pré-admissão JÁ NASCEU no EA e tem a
 * PRÓPRIA fila, a Liberação Admissional. Cobrar a mesma pendência em duas telas é pedir que ninguém
 * trabalhe em nenhuma das duas.
 */
const DESFECHOS_ENCERRADOS: ReadonlySet<string> = new Set<PandapeEntradaDesfecho>([
  "ADMISSAO_CRIADA",
  "PRE_ADMISSAO",
  "ADOTADO",
  "NO_OP",
]);

/**
 * A linha ainda é trabalho de alguém?
 *
 * MANDA O CARIMBO, e a incoerência resolve para o lado SEGURO: desfecho de sucesso SEM `resolvido_em`
 * é linha meio gravada (ou o update caiu no meio, ou alguém gravou o desfecho e esqueceu o carimbo) e
 * FICA NA FILA. Uma linha a mais custa um clique; uma linha a menos custa uma pessoa que nunca é
 * admitida, que é exatamente o caso que originou esta frente.
 */
export function pendenteDeAdmissao(linha: LinhaDeEntrada): boolean {
  // O CARIMBO MANDA, e é só ele. `FALHOU` já carimbado SAI (foi resolvido por outro caminho: um
  // reprocesso que nasceu por outro id, uma criação manual). `ADMISSAO_CRIADA` sem carimbo FICA,
  // porque linha meio gravada não se esconde sozinha. Quem decide o carimbo é quem GRAVA, pela
  // `desfechoEncerra` logo abaixo: a leitura não recalcula nada.
  return linha.resolvidoEm === null || linha.resolvidoEm === undefined;
}

/**
 * O desfecho ENCERRA por si só? Usado por quem GRAVA (para decidir o carimbo `resolvido_em`), nunca
 * por quem LÊ: quem lê usa `pendenteDeAdmissao`, que é a régua única.
 */
export function desfechoEncerra(desfecho: PandapeEntradaDesfecho | string): boolean {
  return DESFECHOS_ENCERRADOS.has(String(desfecho));
}

/** Mensagem de qualquer coisa que tenha sido lançada. Nunca serializa o objeto inteiro. */
function mensagemDe(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "";
}

/** Código de erro do driver do Postgres, quando houver (23505 = violação de unique). */
function codigoSql(err: unknown): string {
  if (err && typeof err === "object") {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return "";
}

/**
 * ─ A CLASSIFICAÇÃO ─────────────────────────────────────────────────────────────────────────────
 * Regex sobre a mensagem, saída de conjunto fechado. NADA da mensagem atravessa: o retorno é sempre
 * um dos valores de `PANDAPE_ENTRADA_MOTIVOS`, então nem o CPF, nem o nome, nem o id que estavam na
 * frase têm por onde entrar. O caminho "não sei classificar" (`OUTRO`) é o mais fácil de esquecer,
 * porque quase nunca roda, e é justamente por onde a mensagem crua costuma voltar a entrar.
 */
export function classificarMotivo(err: unknown): PandapeEntradaMotivo {
  if (codigoSql(err) === "23505") return "DUPLICADO";

  const msg = mensagemDe(err).toLowerCase();
  if (!msg) return "OUTRO";

  if (/cpf/.test(msg)) {
    // "sem CPF na origem" é coisa diferente de "CPF inválido": o primeiro é o ATS ainda não ter o
    // dado (o caso real, o evento sai antes de a pessoa preencher), o segundo é o dígito não fechar.
    if (/(sem|ausente|faltando|não preenchid|nao preenchid|vazio)/.test(msg)) {
      return "SEM_CPF_NA_ORIGEM";
    }
    return "CPF_INVALIDO";
  }
  if (/nome/.test(msg)) return "SEM_NOME";
  if (/(de\/para|de-para|cod_cliente|cliente não|cliente nao|vaga não mapeada)/.test(msg)) {
    return "SEM_DE_PARA";
  }
  if (/(429|rate limit|too many requests|quota)/.test(msg)) return "QUOTA_429";
  if (/(timeout|timed out|etimedout|abort)/.test(msg)) return "TIMEOUT";
  if (/(econnrefused|enotfound|econnreset|socket hang up|network|5\d\d|indisponível|indisponivel)/.test(msg)) {
    return "API_FORA";
  }
  if (/(duplicate|duplicado|já existe|ja existe|unique)/.test(msg)) return "DUPLICADO";
  return "OUTRO";
}
