/**
 * PASTAS DUPLICADAS DO PRONTUÁRIO: o que ainda acende o sinal e o que o diretor já baixou.
 *
 * O PROBLEMA QUE ESTE MÓDULO RESOLVE. O sinal "Pasta duplicada no Drive" é DERIVADO: todo caminho que
 * arquiva ou reconcilia reconfere o Drive e regrava as extras que encontrou. Isso é o certo enquanto
 * ninguém tomou decisão sobre elas, e vira o errado no instante em que o diretor decide conviver com
 * as pastas: ele baixa o aviso, o próximo rearquivamento acha as mesmas pastas, regrava, e o aviso
 * volta como se ele não tivesse decidido nada.
 *
 * A REGRA. Uma duplicata BAIXADA não acende de novo enquanto a pasta existir. Uma duplicata NOVA
 * acende normalmente, porque sobre ela ninguém decidiu. E o módulo do Drive continua sem apagar nada
 * (§A.6): baixar o sinal é decisão de tela, a remoção da pasta é manual, do diretor.
 *
 * PURO e testável: só listas de id de pasta, sem banco e sem PII.
 */

/** Quebra a coluna (ids separados por vírgula) na lista de ids, tolerando nulo, vazio e espaço. */
export function listaIds(csv: string | null | undefined): string[] {
  return (csv ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Junta os ids de volta para a coluna. Lista vazia vira `null`, que é a ausência de sinal. */
export function csvIds(ids: readonly string[]): string | null {
  return ids.length ? ids.join(",") : null;
}

/**
 * O que DEVE acender: as duplicatas encontradas agora, menos as que o diretor já baixou. Preserva a
 * ordem de quem encontrou (a mais completa vem primeiro) e não repete id.
 */
export function duplicatasAcesas(
  encontradas: readonly string[] | null | undefined,
  baixadasCsv: string | null | undefined,
): string[] {
  const baixadas = new Set(listaIds(baixadasCsv));
  const vistas = new Set<string>();
  return (encontradas ?? []).filter((id) => {
    if (!id || baixadas.has(id) || vistas.has(id)) return false;
    vistas.add(id);
    return true;
  });
}
