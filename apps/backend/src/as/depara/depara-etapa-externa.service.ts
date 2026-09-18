import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { CandidaturaSituacao } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { asDeparaEtapaExterna } from "../../db/schema";
import {
  NAO_MAPEADA,
  ehFonteExterna,
  lerLinhaDePara,
  normalizarChaveExterna,
  type ResolucaoEtapaExterna,
} from "../../domain/as-etapa-externa";

/**
 * ─ O RESOLVEDOR DO DE/PARA: DE UM NOME DE PASTA DE FORA PARA UM DESTINO DAQUI ──────────────────
 *
 * ELE SÓ SABE RESPONDER UMA PERGUNTA, e é de propósito: "este nome, vindo desta fonte, quer dizer o
 * quê?". Não move candidatura, não grava nada, não chama ninguém. Quem decide o que fazer com a
 * resposta é a ingestão, que ainda não existe.
 *
 * ┌─ FAIL-CLOSED, E É A RAZÃO DE ESTE ARQUIVO SER TÃO CURTO ───────────────────────────────────────┐
 * │ Sem linha no de/para, a resposta é NÃO MAPEADA. Nunca "a etapa mais parecida", nunca "a        │
 * │ primeira do funil", nunca um `?? 'CAPTACAO'` de conveniência. As dez pastas medidas na API do  │
 * │ Pandapé estão todas mapeadas desde a migration 0111 (decisão do diretor de 17/09/2026), e o    │
 * │ fail-closed NÃO ficou sem uso: as pastas são TEXTO LIVRE, criadas por quem abre a vaga, então  │
 * │ a pasta inédita é o estado normal do dia a dia, e não uma falha.                                │
 * │                                                                                                 │
 * │ CHUTAR CUSTARIA CARO E EM SILÊNCIO: escreveria no histórico de uma PESSOA um movimento que      │
 * │ ninguém fez, e trilha de seleção não se desfaz. A tela passaria a afirmar que alguém foi para a │
 * │ entrevista que nunca teve, e ninguém teria como saber que foi o resolvedor que inventou.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NASCE SEM CHAMADOR, e isso é o desenho da frente: a fundação existe antes da ingestão, e a porta
 * nova ainda não abre. Está registrado no `AsModule` para que ligar a ingestão seja uma injeção de
 * construtor, e não uma migration na frente do diretor.
 *
 * O MOTIVO VIAJA JUNTO DO DESTINO, e é a decisão do diretor de 17/09/2026: `RETORNO NEGATIVO` e
 * `Descartados` caem no mesmo desfecho (`DESCARTADO`) e precisam continuar distinguíveis, uma como
 * recusa do cliente e a outra como descarte da seleção. Quem grava o motivo na candidatura é a
 * ingestão; aqui ele só é LIDO da configuração, nunca inventado.
 *
 * §A.6: aqui não passa dado pessoal nenhum. Nome de pasta de vaga, código de etapa, situação e um
 * motivo escrito por quem configura o de/para, que é texto revisado e não campo copiado da API. Nada
 * é logado, nem o nome que não casou: ele é dado de configuração de terceiro, e um log por consulta
 * encheria o arquivo de ruído sem ajudar ninguém a decidir.
 */
@Injectable()
export class DeparaEtapaExternaService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * O DESTINO DE UM NOME CRU, ou NÃO MAPEADA.
   *
   * A FONTE DESCONHECIDA MORRE ANTES DA CONSULTA, e não é economia de round-trip: uma fonte fora da
   * lista fechada é chamador errado, e devolver "não mapeada" sem ir ao banco deixa o comportamento
   * igual ao de um nome não mapeado, que é o que o chamador já sabe tratar. Lançar aqui
   * transformaria um erro de programação num 500 no meio de uma ingestão em lote.
   *
   * A CHAVE VAZIA TAMBÉM: uma pasta sem nome não casa com linha nenhuma, e consultar por string
   * vazia só criaria a chance de alguém semear uma linha com chave vazia e transformá-la em curinga.
   */
  async resolver(fonte: string, nomeCru: string): Promise<ResolucaoEtapaExterna> {
    if (!ehFonteExterna(fonte)) return NAO_MAPEADA;
    const chave = normalizarChaveExterna(nomeCru ?? "");
    if (chave === "") return NAO_MAPEADA;

    const [linha] = await this.db
      .select({
        etapaCodigo: asDeparaEtapaExterna.etapaCodigo,
        situacao: asDeparaEtapaExterna.situacao,
        // O MOTIVO VEM JUNTO, e não numa segunda leitura: ele faz parte da MESMA tradução, e
        // buscá-lo depois abriria a janela em que a linha muda entre as duas consultas.
        motivoPadrao: asDeparaEtapaExterna.motivoPadrao,
        ativo: asDeparaEtapaExterna.ativo,
      })
      .from(asDeparaEtapaExterna)
      .where(
        and(
          eq(asDeparaEtapaExterna.fonte, fonte),
          eq(asDeparaEtapaExterna.chaveExterna, chave),
          // O `ativo` ENTRA NA CONSULTA e é conferido de novo no domínio. Desligar um de/para é o
          // gesto que o diretor tem para dizer "pare de confiar nesta tradução", e uma leitura que
          // ignorasse o flag transformaria esse gesto em nada.
          eq(asDeparaEtapaExterna.ativo, true),
        ),
      )
      .limit(1);

    return lerLinhaDePara(
      linha
        ? {
            etapaCodigo: linha.etapaCodigo,
            // A coluna é `varchar` com CHECK, então o tipo do drizzle é `string`. Quem decide se o
            // valor é do vocabulário é `lerLinhaDePara`, em um lugar só, e não este `cast`.
            situacao: linha.situacao as CandidaturaSituacao | null,
            motivoPadrao: linha.motivoPadrao,
            ativo: linha.ativo,
          }
        : null,
    );
  }
}
