/**
 * A DISTRIBUIÇÃO DA META POR LOJA: o cargo tem um total FIXO, e as lojas dividem esse total.
 *
 * DOMÍNIO PURO, sem I/O, porque a regra é o que importa e ela precisa ser testável sem banco.
 *
 * A REGRA (decisão do diretor, 02/09/2026, "regra A"). O cargo é cadastrado com uma quantidade, por
 * exemplo 20 Auxiliar de Loja. Distribuir por loja NÃO muda esse 20: as lojas repartem os 20 entre
 * si, e a soma tem de fechar EXATAMENTE 20. Nem 18 (faltou repartir 2) nem 25 (repartiu 5 a mais).
 * Loja com zero é válida: significa "aqui não contrata", e as outras cobrem o total.
 *
 * ISTO SUBSTITUI A REGRA DE ONTEM, que dizia que a soma das lojas VIRAVA a meta do cargo. Lá o total
 * do cargo era resultado; aqui ele é o ponto de partida, e a distribuição é conferida contra ele.
 *
 * A CONSEQUÊNCIA QUE PRECISOU DE CUIDADO (§A.27). Com a regra de ontem, a linha geral do cargo era
 * APAGADA ao detalhar, e por isso `preenchimentoPorCargo` podia somar tudo sem risco. Agora a linha
 * geral CONVIVE com as cotas, e somar as duas daria 40 num cargo de 20: meta inflada, percentual
 * errado, termômetro errado. Por isso a meta do cargo passou a somar SÓ as linhas sem loja, e a
 * conferência de que as duas visões batem é exatamente o que esta trava garante na escrita.
 *
 * §A.6: só ids técnicos e quantidades. Nenhum dado pessoal.
 */

export interface LinhaMeta {
  cargoId: string;
  lojaId: string | null;
  grupoId: string | null;
  quantidade: number;
}

/** A linha é a cota de uma loja, ou a meta do cargo? */
export function ehCotaDeLoja(l: Pick<LinhaMeta, "lojaId">): boolean {
  return Boolean(l.lojaId);
}

/**
 * A META DO CARGO: a soma das linhas SEM loja.
 *
 * Excluir as cotas de loja é o que impede a meta de inflar, e é a mudança que a regra A exigiu. As
 * linhas sem loja são a meta única do cargo ou, quando o projeto usa turmas, as cotas por grupo,
 * que somam entre si como sempre somaram.
 */
export function metaDoCargo(linhas: Array<Pick<LinhaMeta, "lojaId" | "quantidade">>): number {
  return linhas.filter((l) => !ehCotaDeLoja(l)).reduce((acc, l) => acc + l.quantidade, 0);
}

/** O total já repartido entre as lojas. */
export function totalDistribuido(cotas: Array<{ quantidade: number }>): number {
  return cotas.reduce((acc, c) => acc + c.quantidade, 0);
}

/**
 * A DISTRIBUIÇÃO FECHA com o total do cargo? Devolve a mensagem do problema, ou `null` quando fecha.
 *
 * A mensagem diz o número dos dois lados e o tamanho da diferença, porque "não bate" obriga quem
 * está distribuindo a somar na mão para descobrir o que fazer.
 *
 * DISTRIBUIÇÃO VAZIA É VÁLIDA: é o desfazer, e devolve o cargo ao estado de meta única sem cotas.
 */
export function conferirDistribuicao(
  metaDoCargoAtual: number,
  cotas: Array<{ quantidade: number }>,
): string | null {
  if (cotas.length === 0) return null;

  if (metaDoCargoAtual <= 0) {
    return "Cadastre a quantidade de vagas do cargo antes de distribuir entre as lojas.";
  }

  const soma = totalDistribuido(cotas);
  if (soma === metaDoCargoAtual) return null;

  const diferenca = Math.abs(soma - metaDoCargoAtual);
  return soma < metaDoCargoAtual
    ? `Distribuído ${soma} de ${metaDoCargoAtual}, faltam ${diferenca}.`
    : `Distribuído ${soma} de ${metaDoCargoAtual}, excede ${diferenca}.`;
}

/** O cargo está distribuído por loja? É o que a tela usa para mostrar a coluna e o resumo. */
export function distribuidoPorLoja(linhas: Array<Pick<LinhaMeta, "lojaId">>): boolean {
  return linhas.some(ehCotaDeLoja);
}

/**
 * A FRASE DA ORDEM OBRIGATÓRIA: cota de loja primeiro, linha do cargo depois.
 *
 * MORA AQUI, no domínio, porque as DUAS portas de remoção (uma a uma e em lote) recusam pelo mesmo
 * motivo, e duas frases diferentes para a mesma regra ensinariam dois caminhos.
 *
 * É a mensagem de ÚLTIMO RECURSO, a que chega por API. Na tela quem explica é o modal didático, com
 * o passo a passo; esta frase existe para quem chega sem passar por ele.
 */
export function motivoCotasAntes(cotas: number): string {
  return (
    `Este cargo tem ${cotas} loja(s) com vagas distribuídas. ` +
    "Remova primeiro a distribuição por loja e depois exclua a linha do cargo."
  );
}
