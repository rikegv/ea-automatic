import { ConflictException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { candidaturaViva, type CandidaturaEtapa, type CandidaturaSituacao } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import type { SituacaoDeSaida } from "../../domain/candidatura";

/**
 * O EXECUTOR DENTRO DA TRANSAÇÃO, tipado como a casa já tipa (`vagas.service`, `admissoes.service`).
 */
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** A candidatura do jeito que a gravação da saída precisa dela: quem é, onde está e como está. */
export interface CandidaturaASair {
  id: string;
  etapa: CandidaturaEtapa;
  situacao: CandidaturaSituacao;
  /**
   * DE QUE LADO ELA OCUPAVA POSIÇÃO, quando ocupava, e nulo quando não ocupava nenhuma.
   *
   * OBRIGATÓRIO, E NÃO OPCIONAL, de propósito: os dois chamadores já têm a linha inteira em mão, e
   * um campo opcional aqui deixaria o lado sumir em silêncio no dia em que um terceiro chamador
   * aparecesse. O que ele alimenta é a coluna de ORIGEM do evento, que é o que a reabertura lê para
   * devolver a pessoa ao lugar de onde ela veio.
   */
  posicaoLado: string | null;
}

/**
 * ─ A GRAVAÇÃO DA SAÍDA DA CANDIDATURA: UMA PORTA SÓ, PARA DOIS CHAMADORES ──────────────────────
 *
 * O QUE ELA FAZ, e é o que o `registrarSaida` já fazia: escreve a situação e o motivo na
 * candidatura e insere o EVENTO no histórico, as duas coisas na MESMA transação. `etapaPara` recebe
 * a etapa em que a pessoa ESTAVA, e é isso que faz "descartado na Triagem" existir como frase:
 * depois desta gravação a etapa some da leitura viva da tela, e sem o evento o lugar onde a decisão
 * foi tomada se perderia para sempre.
 *
 * ┌─ POR QUE ELA SAIU DO SERVICE E VIROU FUNÇÃO DE MÓDULO ─────────────────────────────────────┐
 * │ O CANCELAMENTO FORÇADO DA VAGA precisa encerrar, NA TRANSAÇÃO DELE, as candidaturas que     │
 * │ atropelou (§A.6: sem isso o expurgo por retenção nunca alcança aquela pessoa, porque ele só │
 * │ anonimiza quem não tem candidatura VIVA, e `ATIVO`/`ALOCADO` são vivas). Ou seja: o mesmo    │
 * │ gesto passa a ter DOIS chamadores, em dois services.                                        │
 * │                                                                                             │
 * │ UMA FUNÇÃO DE MÓDULO, E NÃO UM SERVICE INJETADO NO OUTRO, por duas razões práticas: o        │
 * │ `VagasService` não ganha uma dependência de construtor (que é o tipo de mudança que alcança  │
 * │ código validado, §A.26), e o gesto fica onde ele pode ser lido inteiro, sem depender de      │
 * │ quem o injetou.                                                                             │
 * │                                                                                             │
 * │ E POR QUE NÃO UM SEGUNDO `update` DENTRO DO CANCELAMENTO: a saída tem régua (motivo, evento  │
 * │ no histórico, recusa de segundo desfecho). Uma segunda porta escrevendo `situacao` direto    │
 * │ divergiria desta no primeiro ajuste, e é assim que a linha do tempo passa a ter buraco.      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A GUARDA DE "QUEM JÁ SAIU NÃO SAI DE NOVO" MORA AQUI DENTRO, e vale para os dois chamadores:
 * carimbar um segundo desfecho por cima de um processo encerrado sobrescreveria o motivo real da
 * saída anterior.
 *
 * O MOTIVO CHEGA JÁ APARADO (o chamador passa `texto(...)` ou uma frase montada): esta função GRAVA,
 * não valida texto.
 *
 * ┌─ O EVENTO GUARDA DE ONDE A PESSOA SAIU, E ISSO É O QUE TORNA A VOLTA POSSÍVEL ────────────────┐
 * │ `situacao_origem` e `posicao_lado_origem` são um RETRATO do instante da saída, e não uma cópia │
 * │ da candidatura: depois desta gravação a linha viva diz `DESCARTADO` e o lado que sobrou ali    │
 * │ não distingue quem ENTREGOU posição de quem só passou por ela um dia. Sem o retrato, a         │
 * │ reabertura teria de CHUTAR, e o chute conhecido ("tem lado, logo estava alocado") é falso: há  │
 * │ candidatura `ATIVO` com lado gravado na base agora, porque a reversão do envio devolve a       │
 * │ pessoa para `ATIVO` sem limpar o lado. Chutar por ali inventaria uma entrega que nunca houve.  │
 * │                                                                                                │
 * │ `vagaStatusEventoId` É O MARCADOR DE QUEM CAUSOU A SAÍDA: preenchido só quando um movimento da │
 * │ VAGA encerrou a candidatura junto (hoje, o cancelamento), e é ele que responde "quem saiu      │
 * │ NAQUELE cancelamento" sem depender do texto do motivo, que é digitável à mão.                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export async function gravarSaidaDaCandidatura(
  tx: DbTransaction,
  candidatura: CandidaturaASair,
  situacao: SituacaoDeSaida,
  motivo: string | null,
  porId: string,
  /**
   * O EVENTO DE STATUS DA VAGA que causou esta saída. NULO é o normal: a saída registrada por gente
   * (descarte, desistência, envio para a admissão) não vem de movimento nenhum da vaga, e é
   * justamente por isso que ela NÃO pode ser reaberta em lote junto com um cancelamento.
   */
  vagaStatusEventoId: string | null = null,
): Promise<void> {
  if (!candidaturaViva(candidatura.situacao)) {
    throw new ConflictException(
      "Esta candidatura já foi encerrada e não recebe um segundo desfecho. Para trazer a pessoa de volta, aloque-a de novo na vaga.",
    );
  }

  await tx
    .update(asCandidaturas)
    .set({ situacao, motivoDescarte: motivo, atualizadoEm: new Date() })
    // O `where` SEMPRE existe: um `update` sem cláusula varreria a tabela inteira, e aqui ele
    // alcançaria candidatura de outras vagas.
    .where(eq(asCandidaturas.id, candidatura.id));

  await tx.insert(asCandidaturaEtapas).values({
    candidaturaId: candidatura.id,
    etapaDe: null,
    etapaPara: candidatura.etapa,
    situacao,
    motivo,
    porId,
    /*
     * O RETRATO DA ORIGEM vai no MESMO insert do desfecho, e não numa gravação à parte: um segundo
     * `update` poderia faltar, e evento de saída sem origem é exatamente a linha que a reabertura
     * não sabe o que fazer com ela.
     *
     * `ladoGravado` NÃO É USADO AQUI de propósito: o CHECK do banco é quem governa o conteúdo, e o
     * que chega já veio da coluna irmã, que tem o mesmo CHECK. Traduzir o desconhecido para nulo
     * aqui esconderia uma linha inconsistente em vez de deixá-la estourar na gravação.
     */
    situacaoOrigem: candidatura.situacao,
    posicaoLadoOrigem: candidatura.posicaoLado,
    vagaStatusEventoId,
  });
}
