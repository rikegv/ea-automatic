/**
 * BACKFILL DO CARIMBO DE GRUPO NAS ADMISSÕES (cenário 2, etapa 3). RUNNER manual, com PRÉVIA
 * obrigatória antes de gravar.
 *
 * O QUE ELE FAZ. A partir da etapa 3, toda admissão nova nasce com o grupo carimbado
 * (`carimboDoGrupo`, chamada nos quatro caminhos de escrita). As admissões que já existiam nasceram
 * antes do cadastro de grupos existir, então este runner carimba o passivo, uma vez.
 *
 * O QUE ELE NUNCA FAZ:
 *  - **Não inventa grupo para quem não tem.** Só alcança admissões de clientes que SÃO membros de
 *    algum grupo. Cliente sem grupo fica com o carimbo nulo, e isso não é pendência: não entra em
 *    régua, KPI, fila nem contagem nenhuma.
 *  - **Não reescreve carimbo existente.** Só toca admissão com `grupo_cliente_id` NULO. O carimbo é
 *    o grupo da ÉPOCA: se a loja mudou de grupo depois, quem já foi carimbado não muda, nunca.
 *  - **Não toca mais nada.** Nem farol, nem frente, nem sinalizador, nem loja. É uma coluna nova, de
 *    uma dimensão nova, e nenhuma contagem existente olha para ela (§A.27).
 *  - **Não grava sem `APLICAR=1`.**
 *
 * §A.6: a saída tem código de cliente, nome de grupo e contagens. Nenhum CPF, nenhum nome de
 * candidato, nada em URL.
 *
 * USO:
 *   tsx src/db/carimba-grupo-admissoes.ts              # prévia, não grava
 *   APLICAR=1 tsx src/db/carimba-grupo-admissoes.ts    # grava
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
  if (!existe) {
    throw new Error("As tabelas do grupo não existem neste banco. Suba a etapa 1 antes.");
  }

  // A PRÉVIA POR GRUPO é o que se confere: ela diz quantas admissões cada grupo vai receber, e o
  // total tem de bater com a soma das admissões dos códigos daquele grupo.
  const porGrupo = await conexao<
    { nome: string; codigos: number; a_carimbar: number; ja_carimbadas: number }[]
  >`
    select g.nome,
           count(distinct m.cod_cliente)::int as codigos,
           count(a.id) filter (where a.grupo_cliente_id is null)::int as a_carimbar,
           count(a.id) filter (where a.grupo_cliente_id is not null)::int as ja_carimbadas
      from grupos_cliente g
      join grupo_cliente_membros m on m.grupo_id = g.id
      left join admissoes a on a.cod_cliente = m.cod_cliente
     group by g.nome
     order by a_carimbar desc, g.nome`;

  console.log("\n=== O QUE O BACKFILL VAI CARIMBAR, POR GRUPO ===\n");
  for (const g of porGrupo) {
    console.log(
      `  ${g.nome}: ${g.a_carimbar} admissão(ões) a carimbar, ` +
        `${g.ja_carimbadas} já carimbada(s), ${g.codigos} código(s) de cliente`,
    );
  }
  const total = porGrupo.reduce((a, g) => a + g.a_carimbar, 0);

  // O CONTROLE QUE IMPORTA: nada fora dos grupos é alcançado. Se este número não for zero, o
  // `where` do update está errado, e é melhor descobrir na prévia.
  const [{ fora }] = await conexao<{ fora: number }[]>`
    select count(*)::int as fora from admissoes a
     where a.grupo_cliente_id is null
       and not exists (select 1 from grupo_cliente_membros m where m.cod_cliente = a.cod_cliente)`;

  console.log(`\ntotal a carimbar: ${total}`);
  console.log(`admissões que NÃO serão tocadas (cliente sem grupo): ${fora}`);

  if (!APLICAR) {
    console.log("\nPRÉVIA. Nada foi gravado. Para gravar: APLICAR=1\n");
    await conexao.end();
    return;
  }

  /*
   * UM UPDATE SÓ, numa transação, derivando o grupo pelo vínculo do cliente. O `is null` no filtro é
   * o que faz o runner ser idempotente e o que protege o carimbo antigo de ser reescrito.
   */
  const gravadas = await conexao`
    update admissoes a
       set grupo_cliente_id = m.grupo_id
      from grupo_cliente_membros m
     where m.cod_cliente = a.cod_cliente
       and a.grupo_cliente_id is null
    returning a.id`;

  const [{ carimbadas }] = await conexao<{ carimbadas: number }[]>`
    select count(*)::int as carimbadas from admissoes where grupo_cliente_id is not null`;

  console.log(`\nconcluído. ${gravadas.count} admissão(ões) carimbada(s) nesta rodada.`);
  console.log(`total de admissões com grupo agora: ${carimbadas}`);
  console.log("Nenhuma outra coluna foi tocada: farol, frentes, sinalizador e loja intactos.");
  await conexao.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
