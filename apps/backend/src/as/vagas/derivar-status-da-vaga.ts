import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client";
import { asCandidaturas, asVagaStatusEventos, vagas } from "../../db/schema";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import {
  deriveStatusDaVaga,
  narrativaDaDerivacao,
  papelDeVagaEmProcesso,
} from "../../domain/vaga-status-derivado";
import type { ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";

type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * ─ A DERIVAÇÃO DO STATUS DA VAGA, NO ÚNICO LUGAR EM QUE ELA EXISTE ──────────────────────────────
 *
 * CHAMADA DEPOIS DE TODO MOVIMENTO DE CANDIDATO que possa mudar quem está com o cliente: mover de
 * etapa, aprovar, alocar, registrar saída e trocar de vaga. É UMA ROTINA SÓ, e não um bloco copiado
 * em cinco lugares, porque cinco cópias divergem na primeira correção feita em uma delas, e este
 * módulo já pagou essa conta mais de uma vez.
 *
 * ┌─ A ORDEM É A REGRA INTEIRA, E É A MESMA DAS QUATRO PORTAS DE VAGA ────────────────────────────┐
 * │   1. o CATÁLOGO se lê ANTES da transação (o chamador faz isso e passa a régua pronta, que é   │
 * │      SÍNCRONA: aqui dentro não sobra `await` de catálogo para alguém, um dia, "aproveitar a   │
 * │      viagem" e puxar a vaga junto por fora do lock);                                           │
 * │   2. a LINHA DA VAGA se trava com `SELECT ... FOR UPDATE`;                                     │
 * │   3. SÓ DEPOIS se conta o funil, decide e grava.                                               │
 * │                                                                                                │
 * │ O `FOR UPDATE` NÃO É ZELO AQUI: `fechar`, `cancelar`, `moverStatus`, `reabrir` e a aprovação   │
 * │ disputam A MESMA LINHA. Sem ele, esta rotina SOBRESCREVERIA o `CANCELADA` que o `cancelar`     │
 * │ acabou de gravar. Com ele, os dois locks se enxergam: quem chega no meio espera, e quando ler  │
 * │ encontrará a vaga já encerrada, caindo no filtro de papel da função pura.                       │
 * │                                                                                                │
 * │ RETRAVAR NÃO CUSTA NADA quando o chamador já travou: dentro da MESMA transação o lock já é     │
 * │ nosso, e o `FOR UPDATE` repetido é instantâneo. É por isso que a rotina pode ser chamada tanto │
 * │ dos caminhos que já travaram a vaga (aprovar, enviar para a esteira) quanto dos que não travam │
 * │ (mover de etapa, desvincular) sem duas versões dela.                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO LANÇA POR "NÃO HÁ O QUE FAZER": vaga inexistente, papel fora de alcance, status manual e
 * status já correto terminam em silêncio. Quem chama já gravou o fato principal (a pessoa mudou de
 * etapa), e este é o EFEITO: transformá-lo em exceção faria um movimento legítimo de candidato
 * falhar por causa do estado da vaga.
 *
 * §A.6: a trilha guarda id de vaga, dois códigos de status, id de usuário INTERNO e uma frase de
 * processo. A contagem do funil devolve BOOLEANO, e nenhum nome, id de candidato ou CPF chega aqui.
 */
export async function derivarStatusDaVaga(
  tx: DbTransaction,
  vagaId: string,
  regua: ReguaDeStatusDaVaga,
  etapasDeEntrega: ReadonlySet<string>,
  /** Quem DISPAROU a derivação (moveu o candidato). A frase da trilha diz que a vaga andou sozinha. */
  porId: string | null,
): Promise<void> {
  const [vaga] = await tx
    .select({
      id: vagas.id,
      status: vagas.status,
      statusManualEm: vagas.statusManualEm,
    })
    .from(vagas)
    .where(eq(vagas.id, vagaId))
    .for("update");
  // VAGA SUMIDA NÃO É ERRO DESTA ROTINA. A FK `restrict` de `as_candidaturas.vaga_id` torna isso
  // impossível pelos caminhos de hoje; se um caminho futuro a chamar sem vaga, o fato principal já
  // está gravado e não há o que derivar.
  if (!vaga) return;

  // O PAPEL VEM DO CATÁLOGO, e o `linha()` LANÇA em código desconhecido: status fora do catálogo é
  // inconsistência de banco que a FK `restrict` não deveria ter deixado existir, e engoli-la aqui
  // transformaria a inconsistência numa derivação silenciosamente desligada.
  const papelAtual = regua.linha(vaga.status).papel;

  /*
   * A CONTAGEM SÓ ACONTECE QUANDO ELA PODE MUDAR ALGO. A função pura já responderia `null` nos
   * dois casos, mas ela responderia DEPOIS de uma consulta ao banco: vaga em RASCUNHO, FECHADA,
   * CANCELADA ou com status travado à mão é a esmagadora maioria dos movimentos de candidato numa
   * base com 2.000 vagas, e cobrar um `exists` de cada um seria um custo por gesto, para sempre,
   * respondendo sobre uma decisão já tomada.
   */
  const manual = vaga.statusManualEm !== null;
  if (manual) return;
  if (!papelDeVagaEmProcesso(papelAtual)) return;

  /*
   * ─ EXISTE ALGUÉM VIVO COM O CLIENTE? ──────────────────────────────────────────────────────────
   *
   * É PERGUNTA DE PRESENÇA, E NUNCA DE PROGRESSÃO, e é isso que faz a derivação não exigir ordem:
   * o funil é LIVRE desde 27/08 (qualquer etapa para qualquer outra, com pulo), então quem saltar
   * da Captação direto para a Entrevista Cliente entrega a vaga do mesmo jeito.
   *
   * VIVAS (`SITUACOES_VIVAS`, derivada do domínio e nunca redigitada): quem foi descartado ou
   * desistiu saiu do processo. Contá-lo deixaria a vaga eternamente ENTREGUE por causa de alguém
   * que o cliente recusou em março.
   *
   * CONJUNTO VAZIO DE ETAPAS NÃO VIRA `in ()`: o `if` abaixo curto-circuita para `false`, que é o
   * lado fail-closed (deriva ABERTA, o estado que não afirma entrega nenhuma). Um `inArray` com
   * lista vazia é SQL inválido em parte dos dialetos e verdade acidental em outros.
   */
  const codigos = [...etapasDeEntrega];
  let temCandidatoComCliente = false;
  if (codigos.length > 0) {
    const [achado] = await tx
      .select({ id: asCandidaturas.id })
      .from(asCandidaturas)
      .where(
        and(
          eq(asCandidaturas.vagaId, vagaId),
          inArray(asCandidaturas.etapa, codigos),
          inArray(asCandidaturas.situacao, SITUACOES_VIVAS),
        ),
      )
      .limit(1);
    temCandidatoComCliente = Boolean(achado);
  }

  const destino = deriveStatusDaVaga({
    atual: vaga.status,
    papelAtual,
    manual,
    temCandidatoComCliente,
    codigoAbertura: regua.codigoDoPapel("ABERTURA"),
    codigoEntrega: regua.codigoDoPapel("ENTREGA"),
  });
  if (destino === null) return;

  await tx
    .update(vagas)
    .set({ status: destino, atualizadoEm: new Date() })
    .where(eq(vagas.id, vagaId));

  /*
   * A TRILHA VAI NA MESMA TRANSAÇÃO da mudança de status, pelo mesmo motivo já escrito no
   * `moverStatus` e na redução de meta: "rastro que pode FALTAR quando a escrita deu certo não é
   * rastro". Não existe o estado de vaga derivada sem o evento que diz por quê.
   *
   * `porId` É QUEM MOVEU O CANDIDATO, e a observação diz em palavras que a VAGA andou sozinha: sem
   * a frase, a linha do tempo afirmaria que aquela pessoa moveu a vaga, que é um gesto diferente e
   * mais pesado do que o que ela realmente fez.
   */
  await tx.insert(asVagaStatusEventos).values({
    vagaId,
    de: vaga.status,
    para: destino,
    porId,
    observacao: narrativaDaDerivacao(temCandidatoComCliente),
  });
}
