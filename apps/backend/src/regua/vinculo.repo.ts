import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "../db/client";
import { clienteVinculos } from "../db/schema";
import { vinculoDaAdmissao, type VinculoResolvivel } from "../domain/vinculo";

/**
 * LEITURA DO VÍNCULO (OST Onda 3, item 7). O par com `domain/vinculo`: aqui mora o acesso ao banco,
 * lá mora a regra. Este é o ÚNICO lugar que traduz (cliente + tipo de contrato) em um id de vínculo,
 * de propósito: espalhar essa tradução é como as quatro configurações voltariam a divergir.
 *
 * §A.6: só códigos de cliente, ids e tipo de contrato. Nenhum dado pessoal passa por aqui.
 */

/** Vínculos ATIVOS de um cliente. Lista vazia = cliente sem vínculo (o caso mais comum hoje). */
export async function vinculosDoCliente(
  db: Database,
  codCliente: string | null | undefined,
): Promise<VinculoResolvivel[]> {
  if (!codCliente) return [];
  const linhas = await db
    .select({
      id: clienteVinculos.id,
      tipoServico: clienteVinculos.tipoServico,
      ativo: clienteVinculos.ativo,
    })
    .from(clienteVinculos)
    .where(and(eq(clienteVinculos.codCliente, codCliente), eq(clienteVinculos.ativo, true)));
  return linhas;
}

/**
 * O vínculo que ESTA admissão usa, ou `null` para "resolva pelo cliente".
 *
 * Ordem de decisão (a mesma do Bloco 2 da OST):
 *  1. a admissão já tem `cliente_vinculo_id` gravado (admissão nova) → é ele, sem consultar mais nada;
 *  2. não tem (as 2.397 de hoje) → resolve ON-THE-FLY por (código + tipo de contrato);
 *  3. cliente com menos de dois vínculos → `null`, comportamento idêntico ao de antes.
 */
export async function resolverVinculoId(
  db: Database,
  admissao: {
    codCliente: string | null;
    tipoContrato: string | null;
    clienteVinculoId?: string | null;
  },
): Promise<string | null> {
  if (admissao.clienteVinculoId) return admissao.clienteVinculoId;
  const vinculos = await vinculosDoCliente(db, admissao.codCliente);
  return vinculoDaAdmissao(vinculos, admissao.tipoContrato);
}

/**
 * Filtro de LEITURA com precedência vínculo > cliente, para as tabelas de configuração
 * (régua, obrigatoriedade, benefício padrão, assinante).
 *
 * Devolve o `where` que traz as linhas CANDIDATAS: as do vínculo e as do cliente. Quem escolhe entre
 * elas é `preferirVinculo` abaixo, em memória, porque a preferência é por CHAVE (ex.: por documento
 * da régua), não pela consulta inteira: um vínculo pode sobrescrever só um documento e herdar o resto
 * do cliente, que é o comportamento útil de verdade.
 */
export function filtroClienteOuVinculo(
  colunaVinculo: Parameters<typeof isNull>[0],
  vinculoId: string | null,
) {
  return vinculoId
    ? or(isNull(colunaVinculo), eq(colunaVinculo as never, vinculoId))
    : isNull(colunaVinculo);
}

/**
 * Entre as linhas candidatas, fica a do VÍNCULO quando existe; a do cliente é o fallback por chave.
 * `chaveDe` diz o que identifica a linha (documento da régua, chave da pendência, benefício, CPF).
 */
export function preferirVinculo<T extends { clienteVinculoId: string | null }>(
  linhas: T[],
  chaveDe: (l: T) => string,
): T[] {
  const porChave = new Map<string, T>();
  for (const l of linhas) {
    const k = chaveDe(l);
    const atual = porChave.get(k);
    // Sem linha ainda, ou a nova é do vínculo e a que estava é do cliente: a do vínculo vence.
    if (!atual || (l.clienteVinculoId !== null && atual.clienteVinculoId === null)) {
      porChave.set(k, l);
    }
  }
  return [...porChave.values()];
}

/** Vínculos de VÁRIOS clientes de uma vez (telas e cálculos em lote não fazem N consultas). */
export async function vinculosPorCliente(
  db: Database,
  codClientes: (string | null)[],
): Promise<Map<string, VinculoResolvivel[]>> {
  const codigos = [...new Set(codClientes.filter((c): c is string => Boolean(c)))];
  const mapa = new Map<string, VinculoResolvivel[]>();
  if (codigos.length === 0) return mapa;
  const linhas = await db
    .select({
      codCliente: clienteVinculos.codCliente,
      id: clienteVinculos.id,
      tipoServico: clienteVinculos.tipoServico,
      ativo: clienteVinculos.ativo,
    })
    .from(clienteVinculos)
    .where(and(inArray(clienteVinculos.codCliente, codigos), eq(clienteVinculos.ativo, true)));
  for (const l of linhas) {
    const lista = mapa.get(l.codCliente) ?? [];
    lista.push({ id: l.id, tipoServico: l.tipoServico, ativo: l.ativo });
    mapa.set(l.codCliente, lista);
  }
  return mapa;
}
