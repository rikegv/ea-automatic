import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { clientePendenciaConfig } from "../db/schema";
import {
  ehChaveValida,
  TUDO_OBRIGATORIO,
  type ChavePendencia,
  type ConfigPendencias,
} from "../domain/pendencia-config";

/**
 * LEITURA DA CONFIG DE OBRIGATORIEDADE POR CLIENTE, num lugar só (OST da tela de obrigatoriedade).
 *
 * Existe para que os QUATRO pontos que calculam pendência leiam a config pela MESMA porta: a fonte
 * única em lote, o detalhe do olho, o gate de passagem e o gate de criação do wizard. Cada um lendo a
 * tabela por conta própria seria a receita para um deles divergir, que é exatamente o defeito que a
 * régua unificada já eliminou uma vez.
 *
 * Devolve sempre o conjunto de chaves DESLIGADAS. Cliente sem linha nenhuma volta `TUDO_OBRIGATORIO`
 * (conjunto vazio), então o comportamento de quem nunca foi configurado é idêntico ao de antes.
 *
 * §A.6: só código de cliente e chave. Nenhum dado pessoal.
 */

/** Config de UM cliente. `codCliente` nulo (pré-admissão) devolve tudo obrigatório. */
export async function configDoCliente(
  db: Database,
  codCliente: string | null | undefined,
): Promise<ConfigPendencias> {
  if (!codCliente) return TUDO_OBRIGATORIO;
  const linhas = await db
    .select({ chave: clientePendenciaConfig.chave, obrigatorio: clientePendenciaConfig.obrigatorio })
    .from(clientePendenciaConfig)
    .where(eq(clientePendenciaConfig.codCliente, codCliente));
  return montar(linhas);
}

/**
 * Config de VÁRIOS clientes, em UMA consulta. É o que a lista da Esteira e do Gerenciador usam: uma
 * página tem dezenas de admissões de poucos clientes, e uma consulta por linha viraria N+1.
 */
export async function configPorCliente(
  db: Database,
  codClientes: readonly (string | null | undefined)[],
): Promise<Map<string, ConfigPendencias>> {
  const codigos = [...new Set(codClientes.filter((c): c is string => Boolean(c)))];
  const mapa = new Map<string, ConfigPendencias>();
  if (codigos.length === 0) return mapa;

  const linhas = await db
    .select({
      codCliente: clientePendenciaConfig.codCliente,
      chave: clientePendenciaConfig.chave,
      obrigatorio: clientePendenciaConfig.obrigatorio,
    })
    .from(clientePendenciaConfig)
    .where(inArray(clientePendenciaConfig.codCliente, codigos));

  const porCliente = new Map<string, { chave: string; obrigatorio: boolean }[]>();
  for (const l of linhas) {
    const lista = porCliente.get(l.codCliente) ?? [];
    lista.push({ chave: l.chave, obrigatorio: l.obrigatorio });
    porCliente.set(l.codCliente, lista);
  }
  for (const [cod, lista] of porCliente) mapa.set(cod, montar(lista));
  return mapa;
}

/** Config de um cliente a partir do mapa em lote (ausente = tudo obrigatório). */
export function doMapa(
  mapa: Map<string, ConfigPendencias>,
  codCliente: string | null | undefined,
): ConfigPendencias {
  return (codCliente && mapa.get(codCliente)) || TUDO_OBRIGATORIO;
}

/** Linhas do banco → conjunto de chaves DESLIGADAS. Chave desconhecida é ignorada (nunca quebra). */
function montar(linhas: { chave: string; obrigatorio: boolean }[]): ConfigPendencias {
  const desligadas = new Set<ChavePendencia>();
  for (const l of linhas) {
    if (!l.obrigatorio && ehChaveValida(l.chave)) desligadas.add(l.chave);
  }
  return desligadas;
}
