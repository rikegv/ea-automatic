import { rotuloDoStatusDoPandape, type VagaListItem } from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";

/**
 * ─ O QUE A TELA ESCREVE NA COLUNA DO CÓDIGO DA VAGA ────────────────────────────────────────────
 *
 * NUNCA LINHA FANTASMA, e esse é o motivo inteiro deste arquivo. A coluna mostra `vagas.codigo`, o
 * número do processo seletivo, e ele é NULO na vaga que a ingestão do Digai cria: o contrato do
 * Digai tem um só campo de vaga, o `partnerJobId`, que é o número da vaga no ATS (Pandapé). Medido
 * em produção em 08/10/2026: TREZE vagas assim, com 223 candidaturas de 223 pessoas penduradas.
 * Sem este fallback a linha aparece com o código em branco (ou com um "não informado" que não deixa
 * ninguém achar a vaga), e o diretor não aceita linha fantasma.
 *
 * ┌─ POR QUE O NÚMERO DO ATS VEM COM RÓTULO, E NÃO SOZINHO ─────────────────────────────────────┐
 * │ São DOIS números diferentes, e misturá-los é pior que mostrar vazio: `codigo` é o número do  │
 * │ processo seletivo DO EA e `idVacancyPandape` é o id da vaga NO ATS. Quem lê "3498580" na      │
 * │ coluna Código conclui que é código interno, procura por ele no EA e não acha. O prefixo "ATS" │
 * │ é o que separa as duas coisas na mesma coluna, e a frase de apoio (`ajuda`) diz por extenso   │
 * │ o que o prefixo abrevia.                                                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE ARQUIVO NÃO INVENTA NOME DE VAGA. Faltando o nome de divulgação, a célula do nome continua
 * escrevendo "não informado" (§A.11): o número do ATS identifica a vaga, não a descreve, e escrever
 * qualquer coisa no lugar do nome seria afirmar o que ninguém sabe.
 *
 * §A.11: nenhum travessão. Marcador de ausência é "não informado", nunca um glifo.
 * §A.6: número de vaga e id de ATS, nenhum dado pessoal.
 */
export type CodigoDaVagaNaTela = {
  /** `CODIGO` tem número do EA; `ATS` só tem o do ATS; `AUSENTE` não tem nenhum dos dois. */
  tipo: "CODIGO" | "ATS" | "AUSENTE";
  /** O que a célula escreve, e o que a busca e a ordenação leem. Nunca vazio. */
  texto: string;
  /** O número sem o prefixo, para a célula desenhar prefixo e número com pesos diferentes. */
  numero: string;
  /** A frase de apoio do `title`, só quando o número exibido é o do ATS. */
  ajuda: string | null;
};

/** O que o prefixo abrevia, em escrita normal porque é frase de apoio e não tag (§A.24). */
export const AJUDA_DO_NUMERO_NO_ATS =
  "Número da vaga no ATS (Pandapé). Esta vaga ainda não tem código de processo seletivo no EA.";

/**
 * A ORDEM É `codigo` PRIMEIRO, SEMPRE: onde existe o número do EA é ele que o time usa, e o do ATS
 * não o substitui nem o complementa na coluna. Só na ausência o ATS aparece.
 */
export function codigoDaVagaNaTela(
  v: Pick<VagaListItem, "codigo" | "idVacancyPandape">,
): CodigoDaVagaNaTela {
  const codigo = v.codigo?.trim();
  if (codigo) return { tipo: "CODIGO", texto: codigo, numero: codigo, ajuda: null };
  const ats = v.idVacancyPandape?.trim();
  if (ats) {
    return { tipo: "ATS", texto: `ATS ${ats}`, numero: ats, ajuda: AJUDA_DO_NUMERO_NO_ATS };
  }
  return { tipo: "AUSENTE", texto: "não informado", numero: "não informado", ajuda: null };
}

/*
 * ┌─ O STATUS DA VAGA NO ATS: O RÓTULO VEM DO CONTRATO, O TOM É DECISÃO DE TELA ────────────────┐
 * │ `rotuloDoStatusDoPandape` (`packages/shared-types`) é a ÚNICA fonte do texto, inclusive para │
 * │ o número que o fornecedor ainda não usou ("Status 7 No ATS"). Um dicionário próprio aqui     │
 * │ divergiria do backend no primeiro ajuste, e o vocabulário é do fornecedor: ele cresce.       │
 * │                                                                                              │
 * │ O QUE ESTE ARQUIVO ACRESCENTA É O TOM, que é pergunta de tela e não de integração.           │
 * │                                                                                              │
 * │ POR QUE "Encerrada No ATS" É ALERTA, E NÃO INFORMAÇÃO: medido em 08/10/2026, as vagas que o  │
 * │ rastreio alcança estão TODAS em status 3, e o Digai segue mandando candidato para elas. A    │
 * │ linha precisa dizer que há gente pendurada em vaga que já acabou, não só "encerrada".        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export type TagDoStatusNoAts = {
  rotulo: string;
  /** O tom do Design System: `wn` é o amarelo de alerta que as tabelas já usam (§A.12). */
  tom: PillTone;
  /** Só a vaga encerrada carrega a frase: é ela que tem candidato entrando no que já acabou. */
  ajuda: string | null;
};

/** Frase de apoio, escrita normal porque é apoio e não tag (§A.24). Sem travessão (§A.11). */
export const AVISO_DA_VAGA_ENCERRADA_NO_ATS =
  "Vaga encerrada no ATS ainda recebe candidato do Digai, então pode haver gente pendurada em vaga que já acabou.";

/** `1` é rascunho do ATS e `2` é vaga viva; o número que o catálogo não conhece chega neutro. */
const TOM_POR_STATUS: Record<number, PillTone> = { 1: "nt", 2: "ok", 3: "wn" };

/** NULO NÃO VIRA TAG: a vaga que nunca foi rastreada não tem status no ATS, e nada é afirmado. */
export function tagDoStatusNoAts(
  statusPandape: number | null | undefined,
): TagDoStatusNoAts | null {
  const rotulo = rotuloDoStatusDoPandape(statusPandape);
  if (!rotulo) return null;
  const encerrada = statusPandape === 3;
  return {
    rotulo,
    tom: TOM_POR_STATUS[statusPandape as number] ?? "nt",
    ajuda: encerrada ? AVISO_DA_VAGA_ENCERRADA_NO_ATS : null,
  };
}

/**
 * A PERGUNTA "ESTA VAGA JÁ ACABOU NO ATS?", em um lugar só. A tela usa para decidir se mostra o
 * aviso da fila, e usar isto em vez de comparar com `3` na página evita que o número do fornecedor
 * apareça escrito em dois lugares.
 */
export function vagaEncerradaNoAts(statusPandape: number | null | undefined): boolean {
  const tag = tagDoStatusNoAts(statusPandape);
  return tag !== null && tag.ajuda !== null;
}

/** O atalho que a busca e a ordenação consomem: o MESMO texto que a célula desenha. */
export function textoDoCodigoDaVaga(
  v: Pick<VagaListItem, "codigo" | "idVacancyPandape">,
): string {
  return codigoDaVagaNaTela(v).texto;
}
