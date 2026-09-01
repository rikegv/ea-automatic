import { BadRequestException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { clienteLojas } from "../db/schema";

/**
 * A LOJA TEM DE SER DO MESMO CLIENTE DA ADMISSÃO (cenário 1, etapa 3).
 *
 * POR QUE ISTO EXISTE E NÃO É UMA CHAVE ESTRANGEIRA. A `loja_id` referencia `cliente_lojas(id)`, e
 * isso garante que a loja EXISTE, não que ela seja do cliente certo. Expressar o vínculo no banco
 * exigiria uma chave composta com `cod_cliente`, que em `admissoes` é NULÁVEL (a pré-admissão do
 * Pandapé chega sem cliente). Então a invariante vive aqui, num ponto só, e TODOS os caminhos de
 * escrita passam por ela: wizard, liberação individual, liberação em lote e edição.
 *
 * O QUE ACONTECERIA SEM ELA: uma admissão do DIA apontando para uma loja do CRM. O painel do Alto
 * Volume somaria aquela pessoa numa loja de outro cliente, e nada no sistema acusaria, porque a
 * chave estrangeira está satisfeita. É erro silencioso de contagem, do tipo que a §A.27 existe para
 * impedir.
 *
 * INATIVA TAMBÉM É RECUSADA: loja fechada não recebe gente nova. Corrigir uma admissão antiga que
 * aponta para loja inativa é outro caminho (a loja segue lá, o histórico permanece legível), mas
 * ESCOLHER uma loja inativa agora é sempre engano.
 *
 * §A.6: só ids técnicos e código de cliente. Nenhum dado pessoal.
 */
export async function validarLojaDoCliente(
  db: Database,
  codCliente: string | null | undefined,
  lojaId: string | null | undefined,
): Promise<void> {
  // Sem loja é o caso NORMAL: a maioria dos clientes não tem lojas. Nada a validar.
  if (!lojaId) return;

  if (!codCliente) {
    throw new BadRequestException(
      "Não é possível vincular uma loja antes de a admissão ter cliente.",
    );
  }

  const [loja] = await db
    .select({ id: clienteLojas.id, ativo: clienteLojas.ativo })
    .from(clienteLojas)
    .where(and(eq(clienteLojas.id, lojaId), eq(clienteLojas.codCliente, codCliente)))
    .limit(1);

  // A MESMA mensagem para "não existe" e "é de outro cliente", de propósito: as duas são o mesmo
  // erro do ponto de vista de quem opera (escolheu uma loja que não é deste cliente), e distinguir
  // as duas na resposta contaria a quem chama que aquele id existe em algum outro cliente.
  if (!loja) {
    throw new BadRequestException("A loja escolhida não pertence a este cliente.");
  }
  if (!loja.ativo) {
    throw new BadRequestException("A loja escolhida está inativa. Reative-a ou escolha outra.");
  }
}

/**
 * A loja DAQUELA linha do lote (Q9). Função separada, e não um `find` solto no serviço, porque ela
 * carrega uma regra: **admissão fora da lista fica SEM loja**, e isso é desfecho válido, não erro.
 * É o mesmo tratamento de qualquer campo em branco do lote, que vira pendência individual na esteira
 * e não bloqueia (regra 5, não-bloqueio).
 */
export function lojaDaLinhaDoLote(
  lojasPorAdmissao: { admissaoId: string; lojaId: string }[] | undefined,
  admissaoId: string,
): string | undefined {
  return lojasPorAdmissao?.find((l) => l.admissaoId === admissaoId)?.lojaId;
}
