import "dotenv/config";
import { sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";

/**
 * DEVOLVE PARA "ASO PENDENTE" OS ASOs LEGADOS SEM VEREDITO (decisão do diretor).
 *
 * O QUE ACONTECEU. Até a OST do motivo do ASO, `anexarAso` gravava o documento como **ENTREGUE antes**
 * de a I.A classificar e nunca reescrevia depois. Resultado: ASO reprovado ficava idêntico a ASO
 * aprovado, os dois verdes. A marca que sobrou dessa época é a combinação
 * `documentos_admissao.estado = 'ENTREGUE'` **com** `admissoes.aso_validado = false`: o documento diz
 * "entregue" e o gate diz "a I.A não validou". São **possíveis reprovações escondidas**.
 *
 * A DECISÃO DO DIRETOR: colocar esses ASOs em **PENDENTE**, para o TIME reanexar e a I.A auditar no
 * fluxo normal. **NÃO reprocessar pela I.A aqui**: não gasta chamada, não reaudita sozinho, não
 * inventa veredito. Só devolve o documento ao estado de quem ainda deve o arquivo.
 *
 * POR QUE A OBSERVAÇÃO É APAGADA. É requisito, não detalhe. O texto que está lá é "ASO anexado (N
 * bytes)", e um documento PENDENTE **com** observação é lido pelo sistema como "auditado, deu
 * pendente" (`domain/aso-documento.asoFoiAnexado`, a mesma convenção do modal de auditoria). Manter o
 * texto deixaria a linha marcada como anexada, que é exatamente o oposto do que o diretor pediu. O
 * porquê da mudança não se perde: vai para `candidato_alteracoes_log`, que é o lugar da trilha.
 *
 * SÓ ADMISSÃO VIVA (§A.16). Admissão **finalizada** (`ADMISSAO_CONCLUIDA`) e **encerrada**
 * (`DECLINOU`/`RESCISAO`) ficam de fora: não há reenvio a fazer em quem já foi admitido ou desistiu, e
 * pôr essas em pendente criaria tarefa que ninguém vai executar. A regra permanente diz o mesmo
 * ("finalizadas não são recalculadas e não entram nesta fila").
 *
 * O QUE NÃO FAZ: não chama a I.A, não toca frentes, não toca o farol, não toca o Drive e não mexe em
 * `aso_validado` (que já é `false` em todos os alvos, por definição do filtro).
 *
 * SECO POR PADRÃO: sem `--aplicar` só imprime o que faria. Idempotente: depois de rodar, os alvos
 * estão em PENDENTE e não casam mais com o filtro, então rodar de novo não acha nada.
 *
 * COMO RODAR (na pasta apps/backend):
 *   npx tsx src/db/pendencia-aso-legado.ts diretor@empresa.com.br             # simulação
 *   npx tsx src/db/pendencia-aso-legado.ts diretor@empresa.com.br --aplicar   # grava
 */
async function main() {
  const email = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  // `--incluir-finalizadas` existe para o diretor decidir caso a caso, não é o padrão.
  const incluirFinalizadas = process.argv.includes("--incluir-finalizadas");
  if (!email || email.startsWith("--")) {
    console.error(
      "Informe o e-mail de quem está decidindo. Ex.: npx tsx src/db/pendencia-aso-legado.ts diretor@empresa.com.br",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  const [autor] = (await db.execute(drizzleSql`
    SELECT id FROM usuarios WHERE lower(email) = lower(${email}) LIMIT 1
  `)) as unknown as Array<{ id: string }>;
  if (!autor) {
    console.error(`Usuário ${email} não encontrado: sem autor não há trilha, e sem trilha não grava.`);
    await sql.end({ timeout: 5 });
    process.exit(1);
  }

  // §A.6: o relatório leva id de admissão, farol e estado. Nome de candidato NÃO entra.
  const alvos = (await db.execute(drizzleSql`
    SELECT a.id AS admissao_id, a.farol_global, d.observacao
      FROM documentos_admissao d
      JOIN tipos_documento t ON t.id = d.tipo_documento_id
      JOIN admissoes a ON a.id = d.admissao_id
     WHERE t.codigo = 'ASO'
       AND d.estado = 'ENTREGUE'
       AND a.aso_validado = false
       ${
         incluirFinalizadas
           ? drizzleSql``
           : drizzleSql`AND a.farol_global IN ('EM_ADMISSAO', 'BANCO_AGUARDAR')`
       }
     ORDER BY d.atualizado_em
  `)) as unknown as Array<{ admissao_id: string; farol_global: string; observacao: string | null }>;

  console.log(`ASOs legados sem veredito${incluirFinalizadas ? " (incluindo finalizadas)" : " (só admissão viva)"}: ${alvos.length}`);
  for (const l of alvos) {
    console.log(`  admissao=${l.admissao_id} farol=${l.farol_global} obs="${l.observacao ?? ""}"`);
  }
  if (alvos.length === 0) {
    console.log("Nada a fazer.");
    await sql.end({ timeout: 5 });
    return;
  }
  if (!aplicar) {
    console.log("\nSIMULAÇÃO. Rode de novo com --aplicar para gravar.");
    await sql.end({ timeout: 5 });
    return;
  }

  let feitos = 0;
  for (const l of alvos) {
    // Uma transação por admissão: o estado e a trilha entram juntos ou não entram.
    await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`
        UPDATE documentos_admissao d
           SET estado = 'PENDENTE',
               observacao = NULL,
               validado_por_id = NULL,
               validado_em = NULL,
               atualizado_em = now()
          FROM tipos_documento t
         WHERE t.id = d.tipo_documento_id
           AND t.codigo = 'ASO'
           AND d.admissao_id = ${l.admissao_id}
           AND d.estado = 'ENTREGUE'
      `);
      await tx.execute(drizzleSql`
        INSERT INTO candidato_alteracoes_log (admissao_id, campo, valor_anterior, valor_novo, autor_id)
        VALUES (
          ${l.admissao_id},
          'aso_legado_sem_veredito',
          'ENTREGUE sem validacao da IA',
          'PENDENTE para reenvio pelo time',
          ${autor.id}
        )
      `);
    });
    feitos += 1;
  }

  console.log(`\nAplicado: ${feitos} ASO(s) devolvido(s) a PENDENTE, com trilha.`);
  console.log("Nenhuma chamada de I.A foi feita. O time reanexa e a auditoria roda no fluxo normal.");
  await sql.end({ timeout: 5 });
}

void main();
