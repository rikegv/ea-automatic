/**
 * O NOME DO PRÉ-COLABORADOR, EM UM LUGAR SÓ (OST 30/09/2026).
 *
 * POR QUE É UMA FUNÇÃO E NÃO UMA LINHA REPETIDA: a montagem do nome já existia em DOIS lugares com
 * redações diferentes, e o lote da busca por nome seria o terceiro. Três montagens divergem no
 * primeiro ajuste, e divergência aqui é a tela mostrar um nome e a busca procurar outro.
 *
 * ┌─ §A.6, E É O MOTIVO PELO QUAL A FUNÇÃO RECEBE CAMPO, E NÃO O OBJETO INTEIRO ──────────────────┐
 * │ O TIPO `PandaperPrecollaborator` declara `cpf?: string` (campo legado do remap, que este         │
 * │ endpoint da v1 não devolve), e a própria suíte já dubla payload COM CpF dentro. Uma função que   │
 * │ recebesse o objeto convidaria a devolvê-lo com spread. Recebendo só `name`/`surname`, o CPF não  │
 * │ está no alcance dela nem por acidente.                                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `undefined` quando não há nome. Quem exibe decide o rótulo de vazio ("não informado", §A.11); quem
 * resolve em lote simplesmente não devolve a linha.
 */
export function nomeDoPrecollaborator(
  pc: { name?: string | null; surname?: string | null } | undefined,
): string | undefined {
  const nome = [pc?.name, pc?.surname]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return nome || undefined;
}
