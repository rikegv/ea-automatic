/**
 * LIMPEZA DO APELIDO DO CLIENTE (`nome_operacao`). RUNNER manual, rodado pela fábrica a pedido do
 * diretor, com PRÉVIA obrigatória antes de gravar.
 *
 * DUAS LIMPEZAS, as duas aprovadas na prévia:
 *
 *  1. **O sufixo `F.A` sai.** Ele foi escrito à mão dentro do apelido e deixou de ser usado. Enquanto
 *     existir, o mesmo agrupamento aparece escrito de duas formas (`CAGC CORIFEU` e
 *     `CAGC CORIFEU F.A`), que é o defeito de texto livre que o cadastro de grupos veio consertar.
 *  2. **O espaço à direita é aparado, em TODO apelido que o tenha.** Regra do diretor: espaço à
 *     direita não é texto, é lixo. `"CAGC CORIFEU "` e `"CAGC CORIFEU"` são o mesmo apelido escrito
 *     de duas formas, e enquanto os dois convivem qualquer leitura por texto os conta separados.
 *
 * POR QUE ELE É SEGURO DE RODAR. O `nome_operacao` mora em UMA coluna só, na tabela `clientes`.
 * Nenhuma outra tabela guarda cópia do apelido: as telas que o mostram (Esteira, Gerenciador, Alto
 * Volume, Sala de Espera, régua, benefícios) leem por join. Então a limpeza não deixa duas versões
 * do mesmo nome convivendo em lugar nenhum.
 *
 * O QUE ELE NUNCA FAZ:
 *  - **Não toca linha que já está limpa.** A gravação é só das linhas que mudam de verdade.
 *  - **Não mexe em nada além do apelido.** Código, CNPJ, razão social, grupo e admissão ficam como
 *    estão.
 *  - **Não mexe no começo do texto.** O aparo é à direita, que foi o que o diretor pediu; espaço à
 *    esquerda, se houver, é outra conversa.
 *  - **Não grava sem `APLICAR=1`.** Sem a variável, ele só lê e imprime o que faria.
 *
 * §A.6: a saída tem código de cliente e apelido, que são dados de cadastro. Nenhum CPF, nenhum nome
 * de candidato, nada em URL.
 *
 * USO:
 *   tsx src/db/limpa-apelido-cliente.ts              # prévia, não grava
 *   APLICAR=1 tsx src/db/limpa-apelido-cliente.ts    # grava
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { createDb } from "./client";
import { clientes } from "./schema";

const APLICAR = process.env.APLICAR === "1";

/**
 * O `F.A` é aceito com ou sem o ponto final (`F.A` e `F.A.`), porque as duas grafias significam a
 * mesma coisa e deixar uma para trás recriaria a divergência. O ponto do meio é obrigatório: sem
 * ele, um apelido que terminasse com a palavra `FA` seria mutilado por engano.
 */
const SUFIXO = /\s+F\.A\.?\s*$/i;

export function apelidoLimpo(apelido: string): string {
  return apelido.replace(SUFIXO, "").trimEnd();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const { sql: conexao, db } = createDb(url, 1);

  const todos = await db
    .select({ codCliente: clientes.codCliente, nomeOperacao: clientes.nomeOperacao })
    .from(clientes)
    .where(sql`${clientes.nomeOperacao} is not null`);

  const alvos = todos
    .map((c) => {
      const antigo = c.nomeOperacao ?? "";
      return { codCliente: c.codCliente, antigo, novo: apelidoLimpo(antigo) };
    })
    .filter((c) => c.novo !== c.antigo)
    .sort((a, b) => a.codCliente.localeCompare(b.codCliente));

  const comSufixo = alvos.filter((a) => SUFIXO.test(a.antigo));
  const soEspaco = alvos.filter((a) => !SUFIXO.test(a.antigo));

  console.log(`\n=== 1. APELIDOS QUE PERDEM O SUFIXO F.A (${comSufixo.length}) ===\n`);
  for (const a of comSufixo) {
    console.log(`  ${a.codCliente}  ${JSON.stringify(a.antigo)} -> ${JSON.stringify(a.novo)}`);
  }

  console.log(`\n=== 2. APELIDOS QUE PERDEM SÓ O ESPAÇO À DIREITA (${soEspaco.length}) ===\n`);
  for (const a of soEspaco) {
    console.log(`  ${a.codCliente}  ${JSON.stringify(a.antigo)} -> ${JSON.stringify(a.novo)}`);
  }

  const porNovo = new Map<string, number>();
  for (const a of alvos) porNovo.set(a.novo, (porNovo.get(a.novo) ?? 0) + 1);
  console.log("\n=== RESUMO POR NOME FINAL ===\n");
  for (const [nome, n] of [...porNovo.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${JSON.stringify(nome)}: ${n} código(s)`);
  }
  console.log(`\ntotal de códigos afetados: ${alvos.length}`);

  if (!APLICAR) {
    console.log("\nPRÉVIA. Nada foi gravado. Para gravar: APLICAR=1\n");
    await conexao.end();
    return;
  }

  /*
   * A GRAVAÇÃO É UMA TRANSAÇÃO SÓ. São poucas linhas, e parar no meio deixaria o apelido escrito de
   * duas formas, que é o estado que este runner existe para acabar.
   */
  await db.transaction(async (tx) => {
    for (const a of alvos) {
      await tx
        .update(clientes)
        .set({ nomeOperacao: a.novo })
        .where(eq(clientes.codCliente, a.codCliente));
    }
  });

  /*
   * A CONFERÊNCIA FINAL NÃO USA REGEX, e o motivo é um defeito que ela já cometeu: dentro de um
   * template literal do JS o `\s` perde a barra invertida, então o padrão que chega ao Postgres não é
   * o que está escrito aqui, e a checagem devolveu "sobrou 1" num banco que estava limpo. `rtrim` e
   * `like` não têm escape para errar.
   */
  const [{ sobrou }] = await conexao<{ sobrou: number }[]>`
    select count(*)::int as sobrou from clientes
    where nome_operacao is not null
      and (nome_operacao <> rtrim(nome_operacao) or upper(nome_operacao) like '%F.A')`;

  console.log(`\nconcluído. ${alvos.length} apelido(s) atualizado(s). Restantes sujos: ${sobrou}.`);
  console.log("Nada além do apelido foi tocado: código, CNPJ, razão social, grupo e admissão intactos.");
  await conexao.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
