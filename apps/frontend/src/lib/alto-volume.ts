/**
 * ALTO VOLUME (onda 2): as duas regras que decidem o que a tela mostra e o que ela sugere.
 *
 * Moram FORA da tela pelo mesmo motivo do pré-preenchimento da liberação: são regra, não desenho, e
 * regra sem teste vira bug silencioso. As duas são puras, recebem a lista já carregada e não sabem
 * o que é `fetch`.
 */

/** Um projeto como a listagem do CRUD (onda 1) devolve. Só o que a Liberação usa. */
export type ProjetoDoSeletor = {
  id: string;
  codCliente: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  ativo: boolean;
};

/** Um grupo de entrada, como o detalhe do projeto (onda 1) devolve. */
export type GrupoDoSeletor = {
  id: string;
  rotulo: string;
  dataEntrada: string;
};

/**
 * Os projetos que o seletor pode oferecer para um cliente: os DESTE cliente e ATIVOS.
 *
 * Inativo fica de fora de propósito. Inativar é o encerramento do projeto (exclusão lógica, onda 1),
 * e projeto encerrado não recebe gente nova; se aparecesse no seletor, o backend recusaria depois,
 * o que é pior que não oferecer.
 *
 * Lista vazia é a resposta que faz o bloco inteiro do Alto Volume SUMIR da tela, na mesma regra do
 * seletor de contrato: cliente sem escolha a fazer não é perguntado nada.
 */
export function projetosDoCliente(
  projetos: ProjetoDoSeletor[],
  codCliente: string,
): ProjetoDoSeletor[] {
  if (!codCliente) return [];
  return projetos.filter((p) => p.ativo && p.codCliente === codCliente);
}

/**
 * SUGESTÃO por período: qual projeto do cliente cobre a data de admissão informada.
 *
 * Devolve só o id, ou "" quando não há data, não há projeto ou nenhum período cobre a data. É
 * SUGESTÃO e nada mais: quem manda no vínculo é o flag ligado mais o projeto escolhido, e o
 * consultor pode trocar o que for sugerido. O período nunca decide sozinho, porque a mesma data pode
 * pertencer a dois projetos e porque uma admissão pode ser de um projeto e ter data fora dele.
 *
 * Datas comparadas como texto ISO (`YYYY-MM-DD`), que ordena igual à data e não passa por fuso: o
 * `new Date("2026-09-01")` seria UTC e, num fuso negativo, viraria 31/08 na conta.
 *
 * Havendo mais de um projeto cobrindo a data, vence o de início mais antigo, que é a ordem em que a
 * listagem já chega. Empate exato é caso de o consultor escolher, e ele pode.
 */
export function sugerirProjetoPorPeriodo(
  projetos: ProjetoDoSeletor[],
  dataAdmissao: string | null | undefined,
): string {
  const data = (dataAdmissao ?? "").trim();
  if (!data) return "";
  const cobrem = projetos.filter((p) => p.dataInicio <= data && data <= p.dataFim);
  if (cobrem.length === 0) return "";
  const maisAntigo = [...cobrem].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))[0];
  return maisAntigo.id;
}
