import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { clienteLojas, clientes, dadosVagaFolha } from "../db/schema";

/** Admissão mínima para resolver o endereço do local de trabalho. */
export interface AdmissaoLocalTrabalho {
  id: string;
  lojaId: string | null;
  codCliente: string | null;
}

/**
 * Endereço do LOCAL DE TRABALHO da admissão, pela fonte mais específica que tiver endereço (§A.3):
 * 1) UNIDADE: a loja da admissão (`cliente_lojas.endereco`), quando a admissão está numa loja;
 * 2) VAGA: o endereço de folha do anexo `dados_vaga_folha`, pré-preenchido do padrão do cliente;
 * 3) CLIENTE: o `endereco_padrao` do cliente, última fonte cadastrada.
 *
 * `null` quando nenhuma fonte tem endereço (quem usa esconde o bloco). Nenhuma delas é PII do
 * candidato (§A.6): é o endereço de onde ele vai trabalhar.
 *
 * Fonte ÚNICA desta resolução: o formulário `/vt` (VtService.identificar) e o gerador do link
 * assinado (VtLinkService) consomem esta mesma função, para não divergirem.
 */
export async function resolverLocalTrabalho(
  db: Database,
  admissao: AdmissaoLocalTrabalho,
): Promise<string | null> {
  if (admissao.lojaId) {
    const loja = await db.query.clienteLojas.findFirst({
      where: eq(clienteLojas.id, admissao.lojaId),
    });
    const end = loja?.endereco?.trim();
    if (end) return end;
  }

  const folha = await db.query.dadosVagaFolha.findFirst({
    where: eq(dadosVagaFolha.admissaoId, admissao.id),
  });
  const endFolha = folha?.endereco?.trim();
  if (endFolha) return endFolha;

  if (admissao.codCliente) {
    const cliente = await db.query.clientes.findFirst({
      where: eq(clientes.codCliente, admissao.codCliente),
    });
    const endCliente = cliente?.enderecoPadrao?.trim();
    if (endCliente) return endCliente;
  }

  return null;
}
