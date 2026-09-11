import { ConflictException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  candidaturaViva,
  type CandidaturaEtapa,
  type CandidaturaSituacao,
  type PosicaoLado,
} from "@ea/shared-types";
import type { Database } from "../../db/client";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import type { AceiteRegistravel } from "../../domain/candidatura";

/**
 * O EXECUTOR DENTRO DA TRANSAÇÃO, tipado como a casa já tipa (`encerrar-candidatura`, `vagas.service`).
 */
type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** A situação para a qual uma candidatura encerrada pode VOLTAR. Não existe terceira. */
export type SituacaoDeRetorno = Extract<CandidaturaSituacao, "ATIVO" | "ALOCADO">;

/**
 * A CANDIDATURA DO JEITO QUE A RESTAURAÇÃO PRECISA DELA: quem é, como ela está HOJE, e para onde
 * exatamente ela volta.
 *
 * `situacaoAtual` É OBRIGATÓRIA e é o retrato lido SOB O LOCK da vaga, não uma leitura antiga: ela
 * serve a duas coisas, à guarda de "quem está vivo não é restaurado" e à cláusula do `where` que
 * torna a decisão válida no instante da ESCRITA.
 *
 * `etapaDestino` JÁ CHEGA RESOLVIDA. Quem decide se a etapa de origem ainda existe (o catálogo de
 * etapas é do diretor desde a 0100 e admite inativação) é o chamador, ANTES da transação, pela mesma
 * razão de sempre: catálogo não se lê com a linha da vaga travada.
 */
export interface CandidaturaARestaurar {
  id: string;
  situacaoAtual: CandidaturaSituacao;
  /** Onde ela reaparece no funil. Igual à etapa de origem, salvo etapa inativada (ver o chamador). */
  etapaDestino: CandidaturaEtapa;
  /** Para onde ela volta. `ATIVO` é o único destino honesto quando a origem não foi gravada. */
  situacao: SituacaoDeRetorno;
  /**
   * O LADO DA POSIÇÃO, EXATAMENTE COMO FOI GRAVADO NA SAÍDA, e nunca um `?? "OFICIAL"`.
   *
   * Ele SÓ VALE quando o retorno é `ALOCADO` (ver o `set` abaixo): a candidatura que volta EM
   * SELEÇÃO não escolheu lado nenhum, então ela volta com o lado ZERADO, e não com o lado herdado
   * do processo anterior. Marca de posição pendurada em quem não ocupa posição vira dedução
   * silenciosa na aprovação seguinte.
   */
  posicaoLadoOrigem: PosicaoLado | null;
}

/** O que a restauração registra na linha do tempo, além do fato de a pessoa ter voltado. */
export interface TrilhaDaRestauracao {
  /** O texto do evento. Frase do PROCESSO, sem dado de pessoa (§A.6). */
  motivo: string;
  /** Quem trouxe de volta. Vem da SESSÃO, nunca do corpo. */
  porId: string;
  /**
   * O EVENTO DE STATUS DA VAGA QUE CAUSOU ESTA VOLTA (o da reabertura).
   *
   * SIMÉTRICO AO DA SAÍDA, e é essa simetria que faz a trilha responder as DUAS perguntas: "quem o
   * cancelamento derrubou" e "quem aquela reabertura trouxe de volta". Sem ele, a volta é um evento
   * solto que ninguém consegue ligar ao gesto que a causou.
   *
   * ┌─ E ELE NÃO CONTAMINA O CONJUNTO DO PRÓXIMO REABRIR, por DUAS razões independentes ─────────┐
   * │ 1. O conjunto é lido pelo id do ÚLTIMO EVENTO DE CANCELAMENTO da vaga (o que tem `para` no  │
   * │    papel CANCELAMENTO). O evento da reabertura tem `para` no papel ABERTURA e id próprio:   │
   * │    ele nunca é o alvo daquela consulta.                                                     │
   * │ 2. A consulta do conjunto exige `situacao is not null` no evento, isto é, só enxerga        │
   * │    DESFECHO. O evento da volta grava `situacao` NULA de propósito (ver abaixo).             │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  vagaStatusEventoId: string | null;
  /**
   * A GUARDA QUE FOI ATRAVESSADA POR DECISÃO EXPLÍCITA, quando houve uma (§A.3 regra 8).
   *
   * PREENCHIDA SÓ NO CAMINHO SEM ORIGEM, em que o sistema ADMITE não saber se aquela saída veio do
   * cancelamento e mesmo assim deixa o Master escolher. No caminho com origem não há aceite, porque
   * não há guarda: reabrir é desfazer o gesto que o próprio sistema registrou.
   */
  aceite?: AceiteRegistravel | null;
}

/**
 * ─ A RESTAURAÇÃO DA CANDIDATURA: A PORTA ÚNICA DA VOLTA, IRMÃ SIMÉTRICA DA SAÍDA ───────────────
 *
 * ┌─ O QUE ELA É, E POR QUE ELA É A PRIMEIRA DO SEU TIPO ──────────────────────────────────────┐
 * │ `as_candidaturas.situacao` TEM QUATRO ESCRITORES, e este é o QUARTO. Os outros três:         │
 * │   . `candidatos.service.mudarSituacaoOcupandoPosicao` (aprovar, alocar, enviar), o caminho   │
 * │     TRAVADO, onde moram a trava de capacidade e a exigência de candidatura viva;             │
 * │   . `candidatos.service.reverterEnvioParaAdmissao`, que desfaz UM desfecho específico e só    │
 * │     anda entre duas situações VIVAS;                                                          │
 * │   . `gravarSaidaDaCandidatura`, a porta única da SAÍDA.                                      │
 * │                                                                                              │
 * │ E ESTE É O ÚNICO QUE VAI DE ENCERRADA PARA VIVA. É por isso que ele é perigoso: as travas    │
 * │ que protegem a vaga (capacidade por lado, ciência de reentrada, unique parcial das vivas)    │
 * │ moram no caminho travado, e ele NÃO passa por lá. Quem chama esta porta é obrigado a fazer   │
 * │ essas conferências ANTES, sob o `FOR UPDATE` da vaga, e o `vagas.service.reabrir` as faz.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE UMA PORTA, E NÃO UM `update` SOLTO DENTRO DO `reabrir` ───────────────────────────┐
 * │ É O MESMO ARGUMENTO DA SAÍDA, espelhado: a volta tem régua (o motivo do descarte some, a    │
 * │ etapa reaparece, o evento entra no histórico, quem já está vivo é recusado). Um segundo      │
 * │ `update` escrevendo `situacao` direto divergiria desta régua no primeiro ajuste, e é assim   │
 * │ que a linha do tempo passa a ter buraco. Função de MÓDULO, e não service injetado, pela mesma│
 * │ razão da irmã: o `VagasService` não ganha dependência de construtor (§A.26).                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O `motivo_descarte` VAI A NULO, e isso COMPLETA a volta em vez de acrescentar a ela ──────┐
 * │ `gravarSaidaDaCandidatura` escreve situação E motivo no MESMO `set`. Restaurar só a situação │
 * │ deixaria uma candidatura VIVA carregando "Vaga cancelada: X" como motivo de descarte, e esse │
 * │ campo é exposto no `AsCandidaturaItem`: toda tela que o leia mostraria a explicação de um    │
 * │ desfecho que não vale mais, sem erro e sem aviso. É a mesma limpeza que a reversão do envio  │
 * │ já faz, pelo mesmo motivo, e NENHUM FATO SE PERDE: o motivo continua no evento da saída.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa entra aqui. Ids internos, uma situação do vocabulário, um lado, uma
 * frase de processo e o autor, que é usuário interno. Nada é logado.
 */
export async function restaurarCandidatura(
  tx: DbTransaction,
  candidatura: CandidaturaARestaurar,
  trilha: TrilhaDaRestauracao,
): Promise<void> {
  /*
   * A GUARDA DE "QUEM ESTÁ VIVO NÃO VOLTA", e ela é o espelho exato da guarda da saída.
   *
   * Restaurar uma candidatura VIVA não desfaz nada: ela reescreveria por cima a situação real de
   * alguém que está em processo (um APROVADO virando ATIVO apaga uma aprovação de verdade e ainda
   * devolve a posição dele ao cilindro). O chamador já recusa antes, com frase própria; esta é a
   * última linha, e ela vale para todo chamador futuro.
   */
  if (candidaturaViva(candidatura.situacaoAtual)) {
    throw new ConflictException(
      "Esta candidatura está em processo e não precisa ser trazida de volta. Recarregue a página.",
    );
  }

  const [restaurada] = await tx
    .update(asCandidaturas)
    .set({
      situacao: candidatura.situacao,
      motivoDescarte: null,
      etapa: candidatura.etapaDestino,
      /*
       * ┌─ O LADO É SEMPRE ESCRITO, E A VOLTA EM SELEÇÃO O ZERA (decisão do diretor, Onda B) ────┐
       * │ QUEM VOLTA `ALOCADO` recebe o lado EXATAMENTE COMO FOI GRAVADO NA SAÍDA, e nunca um    │
       * │ `?? "OFICIAL"`: ali o sistema SABE de que lado da meta aquela posição saiu, porque ele │
       * │ mesmo gravou o retrato no evento.                                                      │
       * │                                                                                        │
       * │ QUEM VOLTA `ATIVO` RECEBE NULO, e esta metade é a correção. Não escrever nada deixava a │
       * │ MARCA DE POSIÇÃO PENDURADA na linha: a pessoa volta EM SELEÇÃO (não ocupa posição       │
       * │ nenhuma) carregando um `posicao_lado` do processo anterior, e a próxima aprovação dela  │
       * │ mede a posição contra a meta de BANCO por causa de um lado que ninguém escolheu. É a    │
       * │ contagem da vaga mudando por um vestígio.                                              │
       * │                                                                                        │
       * │ É O ARGUMENTO QUE DECIDE, e ele vem do caminho SEM ORIGEM: ali o sistema SE RECUSA A    │
       * │ DEDUZIR onde a pessoa estava (por isso todo mundo volta `ATIVO`, e por isso o aceite é  │
       * │ registrado). A marca pendurada faz essa dedução DEPOIS, sozinha, na aprovação seguinte, │
       * │ e em silêncio. A inferência que esta onda baniu na LEITURA voltaria pela ESCRITA.       │
       * │                                                                                        │
       * │ O COMENTÁRIO ANTIGO ("apagar também seria escolha, e apagaria a memória que a reversão  │
       * │ do envio deixa de propósito") ESTÁ CERTO PARA A REVERSÃO DO ENVIO E ERRADO AQUI: lá a   │
       * │ pessoa foi enviada DAQUELE lado e vai ser enviada de novo do mesmo, então o lado é      │
       * │ memória útil. Aqui, na volta sem origem, NÃO HÁ MEMÓRIA A PRESERVAR, porque o próprio   │
       * │ caminho declara não saber. Nulo não destrói informação: ele para de afirmar uma.        │
       * │                                                                                        │
       * │ NENHUM FATO SE PERDE: o lado da saída continua no evento (`posicao_lado_origem`), que é │
       * │ de onde esta restauração o lê. O que sai da linha viva é a cópia mutável.               │
       * └────────────────────────────────────────────────────────────────────────────────────────┘
       */
      posicaoLado: candidatura.situacao === "ALOCADO" ? candidatura.posicaoLadoOrigem : null,
      atualizadoEm: new Date(),
    })
    /*
     * A SITUAÇÃO ENTRA NO `where`, e é ela que faz a leitura valer no instante da ESCRITA. Mesmo
     * padrão da reversão do envio: sem ela, o `update` filtra só por `id` e não relê nada, e uma
     * escrita concorrente na mesma candidatura terminaria com a linha em um estado e a trilha
     * afirmando outro. O `FOR UPDATE` do chamador é na VAGA, e dois locks em linhas diferentes não
     * se enxergam.
     *
     * O `where` NUNCA é por vaga. Um `update ... where vaga_id = <vaga>` alcançaria quem NÃO foi
     * selecionado e empurraria o `atualizado_em` dele para hoje, reiniciando em silêncio o prazo de
     * dois anos de retenção de dado pessoal de gente que ninguém trouxe de volta (§A.6).
     */
    .where(
      and(
        eq(asCandidaturas.id, candidatura.id),
        eq(asCandidaturas.situacao, candidatura.situacaoAtual),
      ),
    )
    .returning({ id: asCandidaturas.id });

  /*
   * NÃO AFETOU LINHA NENHUMA: alguém mudou a situação entre a leitura e a escrita. RECUSAR, e não
   * tratar como no-op, pela mesma razão da reversão do envio: no-op devolveria sucesso com a pessoa
   * ainda descartada, e a tela diria que ela voltou. Como a recusa acontece dentro da transação da
   * reabertura, ela desfaz o lote inteiro, que é o combinado: ou vale a lista toda, ou nada.
   */
  if (!restaurada) {
    throw new ConflictException(
      "O processo desta pessoa mudou enquanto a tela estava aberta. Recarregue a página e escolha de novo.",
    );
  }

  await tx.insert(asCandidaturaEtapas).values({
    candidaturaId: candidatura.id,
    /*
     * `etapaDe` NULA e `situacao` NULA: este evento é uma REENTRADA no funil, não um desfecho.
     *
     * A SITUAÇÃO NULA É A PARTE QUE NÃO SE PODE TROCAR. `tipoDoEvento` (em
     * `domain/candidatura-historico`) deriva DESFECHO de `situacao` preenchida, e ela vence todos os
     * outros testes. Gravar `ATIVO` aqui faria a linha do tempo mostrar a VOLTA como se fosse mais
     * um encerramento, logo depois do encerramento de verdade, e quem lesse a ficha entenderia o
     * oposto do que aconteceu. É também o que mantém esta linha fora do conjunto do próximo reabrir.
     */
    etapaDe: null,
    etapaPara: candidatura.etapaDestino,
    situacao: null,
    motivo: trilha.motivo,
    porId: trilha.porId,
    vagaStatusEventoId: trilha.vagaStatusEventoId,
    aceite: trilha.aceite ?? null,
  });
}
