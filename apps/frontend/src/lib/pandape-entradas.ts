/**
 * ─ FILA DE ENTRADAS DO PANDAPÉ: o vocabulário da TELA (OST do diretor, 15/09/2026) ─────────────
 *
 * O que o ATS mandou e ainda NÃO virou admissão. A tela é fila de TRABALHO, não relatório: quem
 * zera sai (§A.19), e enquanto não zera precisa estar visível para alguém reprocessar.
 *
 * ESTE ARQUIVO É SÓ TRADUÇÃO E IO. As duas réguas de verdade (quem ainda é pendente, e como uma
 * exceção vira código) moram no BACKEND (`domain/pandape-entrada.ts`) e não são reimplementadas
 * aqui: a lista já chega filtrada. Recalcular do lado da tela é exatamente a divergência que a
 * §A.19 eliminou, a coluna dizendo uma coisa enquanto o modal dizia outra sobre a MESMA linha.
 *
 * §A.6: nada aqui persiste, loga ou monta texto com CPF. O `candidatoNome` chega do cache em
 * memória do backend, é EXIBIDO e morre com a página.
 */

import type {
  PandapeEntradaDesfecho,
  PandapeEntradaItem,
  PandapeEntradaMotivo,
} from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";
import { apiFetch } from "@/lib/api";

/** Ausência de dado é sempre esta palavra, nunca o glifo (§A.11). */
export const NAO_INFORMADO = "não informado";

/**
 * Rótulo do desfecho, em title case (§A.24): é TAG de status, não frase.
 *
 * `Record` fechado de propósito: desfecho novo no `shared-types` quebra o typecheck aqui, em vez de
 * chegar à tela como o texto cru do enum em caixa alta com underline.
 */
const ROTULO_DESFECHO: Record<PandapeEntradaDesfecho, string> = {
  RECEBIDO: "Recebido",
  ADMISSAO_CRIADA: "Admissão Criada",
  PRE_ADMISSAO: "Pré-Admissão",
  ADOTADO: "Adotado",
  NO_OP: "Já Conhecido",
  FALHOU: "Falhou",
  NAO_ENFILEIRADO: "Não Enfileirado",
  DESCARTADO_DUPLICADO: "Descartado Duplicado",
  INERTE: "Inerte",
  ADIADO: "Adiado",
};

/** Explicação de uma linha, para o `title` da pill. Frase normal, não é tag (§A.24). */
const AJUDA_DESFECHO: Record<PandapeEntradaDesfecho, string> = {
  RECEBIDO: "Chegou e foi aceito, aguardando o worker processar.",
  ADMISSAO_CRIADA: "Virou admissão completa na esteira.",
  PRE_ADMISSAO: "Virou pré-admissão e aguarda liberação.",
  ADOTADO: "Adotado por uma admissão viva já existente do mesmo candidato e da mesma vaga.",
  NO_OP: "Já conhecido, nada a fazer.",
  FALHOU: "As tentativas esgotaram. Reprocesse quando o dado na origem estiver válido.",
  NAO_ENFILEIRADO: "A fila não aceitou o evento. O Pandapé reenvia, e o reprocesso também resolve.",
  DESCARTADO_DUPLICADO: "O enfileiramento foi descartado porque o mesmo evento ainda estava na fila.",
  INERTE: "A integração está sem credencial, então o worker não teve o que consultar.",
  ADIADO: "Não resolveu ainda e será tentado de novo.",
};

/** Rótulo do motivo, em title case (§A.24). Também fechado, pelo mesmo motivo do desfecho. */
const ROTULO_MOTIVO: Record<PandapeEntradaMotivo, string> = {
  CPF_INVALIDO: "CPF Inválido",
  SEM_CPF_NA_ORIGEM: "Sem CPF Na Origem",
  SEM_NOME: "Sem Nome",
  SEM_DE_PARA: "Sem De/Para",
  QUOTA_429: "Limite De Requisições",
  TIMEOUT: "Tempo Esgotado",
  API_FORA: "API Fora",
  DUPLICADO: "Duplicado",
  OUTRO: "Outro",
};

export function rotuloDesfecho(d: PandapeEntradaDesfecho): string {
  return ROTULO_DESFECHO[d] ?? String(d);
}

export function ajudaDesfecho(d: PandapeEntradaDesfecho): string {
  return AJUDA_DESFECHO[d] ?? "";
}

/** Motivo ausente é "não informado", nunca vazio nem travessão (§A.11). */
export function rotuloMotivo(m: PandapeEntradaMotivo | null): string {
  return m ? (ROTULO_MOTIVO[m] ?? String(m)) : NAO_INFORMADO;
}

/**
 * O TOM DO STATUS, de onde sai o ÍCONE DINÂMICO da §A.12. Quem desenha é o `StatusPill`, que já
 * deriva o ícone do tom no sistema inteiro (ok = check verde, pendente = exclamação amarela,
 * recusado = X vermelho): a tela não escolhe ícone à mão, senão seria a segunda máscara.
 *
 *  - resolvido bem = ok;
 *  - ainda em curso (RECEBIDO, ADIADO) = pendente, porque continua sendo trabalho de alguém;
 *  - falhou, não enfileirou ou foi descartado = recusado;
 *  - INERTE = neutro, porque não é falha de ninguém: é integração sem credencial.
 */
export function toneDesfecho(d: PandapeEntradaDesfecho): PillTone {
  switch (d) {
    case "ADMISSAO_CRIADA":
    case "PRE_ADMISSAO":
    case "ADOTADO":
    case "NO_OP":
      return "ok";
    case "FALHOU":
    case "NAO_ENFILEIRADO":
    case "DESCARTADO_DUPLICADO":
      return "dg";
    case "INERTE":
      return "nt";
    default:
      return "wn";
  }
}

/** Ordem do fluxo, para a ordenação por status do cabeçalho (§A.29) não sair alfabética. */
const RANK_DESFECHO: Record<PandapeEntradaDesfecho, number> = {
  FALHOU: 0,
  NAO_ENFILEIRADO: 1,
  DESCARTADO_DUPLICADO: 2,
  ADIADO: 3,
  RECEBIDO: 4,
  INERTE: 5,
  PRE_ADMISSAO: 6,
  ADOTADO: 7,
  NO_OP: 8,
  ADMISSAO_CRIADA: 9,
};

export function rankDesfecho(d: PandapeEntradaDesfecho): number {
  return RANK_DESFECHO[d] ?? 99;
}

/**
 * A GRADE. Só as PENDENTES, que é o que faz dela uma fila, e é o padrão do endpoint.
 *
 * O filtro é MULTISELECT (§A.28) e vai como lista separada por vírgula, o mesmo formato que o
 * `parseMulti` do backend já lê na Esteira. Nenhum valor marcado significa TODAS, então a ausência
 * do parâmetro é a régua e não há caso especial a inventar.
 */
export function listarEntradasPandape(
  token: string,
  desfechos: string[] = [],
): Promise<PandapeEntradaItem[]> {
  const q = desfechos.length ? `?desfecho=${encodeURIComponent(desfechos.join(","))}` : "";
  return apiFetch<PandapeEntradaItem[]>(`/pandape-entradas${q}`, { token });
}

/** Reprocessa o evento: enfileira o MESMO id do ATS de novo. A origem da linha não muda. */
export function reprocessarEntradaPandape(
  token: string,
  id: string,
): Promise<{ enfileirado: boolean }> {
  return apiFetch<{ enfileirado: boolean }>(`/pandape-entradas/${id}/reprocessar`, {
    method: "POST",
    token,
  });
}
