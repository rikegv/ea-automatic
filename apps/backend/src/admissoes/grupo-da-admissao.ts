import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { grupoClienteMembros } from "../db/schema";

/**
 * O CARIMBO DO GRUPO NA ADMISSÃO (cenário 2, etapa 3), NUM PONTO SÓ.
 *
 * O grupo da admissão é DERIVADO do cliente no momento em que a admissão é gravada, e daí em diante
 * CONGELA. Se a farmácia sair do CAGC Corifeu e for para o Centro Oeste amanhã, as admissões que
 * aconteceram sob Corifeu continuam dizendo Corifeu (decisão do diretor). Derivar na leitura mostraria
 * sempre o grupo de HOJE, e o relatório do trimestre passado passaria a dar outro número em silêncio.
 *
 * POR QUE ESTA FUNÇÃO EXISTE, E NÃO QUATRO TRECHOS IGUAIS. São QUATRO os caminhos que escrevem o
 * cliente de uma admissão: o wizard, a liberação (individual e em lote), a entrada do Pandapé e a
 * troca de cliente. Escrever a derivação em cada serviço é como o elo pós-ASO se quebrou: um dos
 * caminhos deixa de fazer o que os outros fazem, nenhum teste cobre a costura, e o defeito aparece
 * quando uma admissão real trava na operação (§A.26). Aqui é um lugar, com teste.
 *
 * O CARIMBO SEGUE O VÍNCULO, NÃO O `ativo` DO GRUPO. Inativar um grupo o esconde dos FILTROS; não
 * desfaz o fato de que aquele CNPJ pertence a ele. Se uma admissão de um cliente membro nascesse sem
 * carimbo só porque o grupo está inativo, ficaria um buraco silencioso no histórico, que nenhum
 * backfill futuro perceberia. É decisão registrada, e é fácil de inverter aqui se o diretor preferir.
 *
 * CLIENTE SEM GRUPO NÃO É PENDÊNCIA. A esmagadora maioria dos clientes não pertence a grupo nenhum,
 * então a ausência é o caso NORMAL: devolve `null`, e nada em régua, KPI ou fila olha para isso.
 *
 * §A.6: só código de cliente e id técnico do grupo. Nenhum dado pessoal.
 */
export async function carimboDoGrupo(
  db: Database,
  codCliente: string | null | undefined,
): Promise<string | null> {
  // Admissão sem cliente é o caso da pré-admissão do Pandapé, que nasce em AGUARDANDO_LIBERACAO.
  // Sem cliente não há de onde derivar grupo, e o carimbo acontece na liberação, quando o cliente
  // é escolhido.
  if (!codCliente) return null;

  const [membro] = await db
    .select({ grupoId: grupoClienteMembros.grupoId })
    .from(grupoClienteMembros)
    .where(eq(grupoClienteMembros.codCliente, codCliente));

  // PEGAR A PRIMEIRA LINHA NÃO É APOSTA, e também não precisa de `limit`: a chave primária de
  // `grupo_cliente_membros` é o `cod_cliente` SOZINHO, então o banco garante que um CNPJ está em um
  // grupo só. É a mesma invariante que faz "uma loja em um grupo só" ser impossível de violar.
  return membro?.grupoId ?? null;
}
