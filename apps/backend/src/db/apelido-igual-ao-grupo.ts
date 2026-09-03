/**
 * O APELIDO DO CLIENTE PASSA A SER O NOME DO GRUPO (cenário 2). RUNNER manual, com PRÉVIA
 * obrigatória antes de gravar.
 *
 * O QUE ELE FAZ. A partir da decisão do diretor, vincular um CNPJ a um grupo troca o `nome_operacao`
 * dele pelo nome do grupo, no mesmo instante (`definirMembros`). Este runner faz o passivo: os
 * clientes que JÁ estavam nos grupos quando a regra nasceu.
 *
 * POR QUE A TROCA EXISTE. O apelido é texto livre, e cada pessoa escreveu do seu jeito: foram NOVE
 * grafias para o mesmo CAGC (`CAGC CORIFEU `, `CAGC CORIFEU`, `RAIA CAGC CORIFEU`...). Enquanto for
 * opinião, cada leitura por texto dá um número diferente. Vinculado ao grupo, o apelido passa a ser
 * o nome do grupo, igual em todas as telas que o mostram.
 *
 * O QUE ELE NUNCA FAZ:
 *  - **Não guarda o apelido antigo.** Decisão consciente do diretor: quem sair de um grupo ajusta o
 *    apelido na mão, no editar do cliente. Preservar um "nome de antes" criaria um campo que ninguém
 *    mais leria e que divergiria do que está na tela.
 *  - **Não toca cliente fora de grupo.** Quem não é membro fica exatamente como está.
 *  - **Não toca nada além do apelido.** Código, CNPJ, razão social, admissão e carimbo intactos.
 *  - **Não grava sem `APLICAR=1`.**
 *
 * §A.6: código de cliente e apelido, que são dados de cadastro. Nenhum dado pessoal.
 *
 * USO:
 *   tsx src/db/apelido-igual-ao-grupo.ts              # prévia, não grava
 *   APLICAR=1 tsx src/db/apelido-igual-ao-grupo.ts    # grava
 */
import "dotenv/config";
import { createDb } from "./client";

const APLICAR = process.env.APLICAR === "1";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const { sql: conexao } = createDb(url, 1);

  const [{ existe }] = await conexao<{ existe: boolean }[]>`
    select to_regclass('public.grupo_cliente_membros') is not null as existe`;
  if (!existe) throw new Error("As tabelas do grupo não existem neste banco.");

  const alvos = await conexao<
    { cod_cliente: string; apelido_hoje: string | null; grupo: string; admissoes: number }[]
  >`
    select c.cod_cliente,
           c.nome_operacao as apelido_hoje,
           g.nome as grupo,
           (select count(*)::int from admissoes a where a.cod_cliente = c.cod_cliente) as admissoes
      from grupo_cliente_membros m
      join grupos_cliente g on g.id = m.grupo_id
      join clientes c on c.cod_cliente = m.cod_cliente
     where c.nome_operacao is distinct from g.nome
     order by g.nome, c.cod_cliente`;

  console.log(`\n=== APELIDOS QUE PASSAM A SER O NOME DO GRUPO (${alvos.length}) ===\n`);
  for (const a of alvos) {
    console.log(
      `  ${a.cod_cliente}  ${JSON.stringify(a.apelido_hoje)} -> ${JSON.stringify(a.grupo)}` +
        `  (${a.admissoes} admissão(ões))`,
    );
  }

  const porGrupo = new Map<string, number>();
  for (const a of alvos) porGrupo.set(a.grupo, (porGrupo.get(a.grupo) ?? 0) + 1);
  console.log("\n=== POR GRUPO ===\n");
  for (const [grupo, n] of porGrupo) console.log(`  ${grupo}: ${n} cliente(s)`);

  if (!APLICAR) {
    console.log("\nPRÉVIA. Nada foi gravado. Para gravar: APLICAR=1\n");
    await conexao.end();
    return;
  }

  /*
   * UM UPDATE SÓ, derivando o nome pelo vínculo. O `is distinct from` é o que faz o runner ser
   * idempotente: rodar de novo não reescreve linha nenhuma nem move o `atualizado_em` à toa.
   */
  const gravadas = await conexao`
    update clientes c
       set nome_operacao = g.nome
      from grupo_cliente_membros m
      join grupos_cliente g on g.id = m.grupo_id
     where m.cod_cliente = c.cod_cliente
       and c.nome_operacao is distinct from g.nome
    returning c.cod_cliente`;

  const [{ restantes }] = await conexao<{ restantes: number }[]>`
    select count(*)::int as restantes
      from grupo_cliente_membros m
      join grupos_cliente g on g.id = m.grupo_id
      join clientes c on c.cod_cliente = m.cod_cliente
     where c.nome_operacao is distinct from g.nome`;

  console.log(`\nconcluído. ${gravadas.count} apelido(s) atualizado(s). Restantes divergentes: ${restantes}.`);
  console.log("Nada além do apelido foi tocado: código, CNPJ, razão social, admissão e carimbo intactos.");
  await conexao.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
