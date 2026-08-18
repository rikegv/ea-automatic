import "dotenv/config";
import { createDb } from "./client";

/**
 * BACKFILL DA INTEGRAÇÃO PARA QUEM JÁ ESTÁ NO CADASTRO (item 1 da OST dos 3 ajustes).
 *
 * POR QUE ELE EXISTE. A regra nova faz a frente INTEGRAÇÃO nascer JUNTO com o CADASTRO, e não mais
 * na conclusão dele. A correção vive na origem (`esteira/nascimento-cadastro.ts`, chamada pelos três
 * caminhos que criam o Cadastro), mas ela age no INSTANTE do nascimento: quem já está no Cadastro
 * hoje passou por aquele instante antes da mudança e nunca mais volta a passar. Sem este script a
 * aba da Integração só mudaria quando uma admissão NOVA atravessasse o gate, e não haveria o que
 * validar na tela. O diretor decidiu incluir esses.
 *
 * O ALVO, e só ele: admissão VIVA (EM_ADMISSAO / BANCO_AGUARDAR), com a frente CADASTRO_CONTRATO
 * ABERTA, SEM frente de INTEGRAÇÃO, e de cliente que EXIGE integração.
 *
 * CLIENTE QUE EXIGE é a mesma leitura de `clienteExigeIntegracao`: ausência de linha em
 * `cliente_pendencia_config` com a chave INTEGRACAO significa `true` (todo cliente nasce exigindo, e
 * a equipe desmarca quem não exige). O `coalesce(..., true)` abaixo é essa regra em SQL.
 *
 * CADASTRO JÁ CONCLUÍDO FICA DE FORA, de propósito. Quem fechou o Cadastro sem integração já teve
 * seu desfecho decidido pelo caminho antigo (nasceu a frente, ou o farol foi carimbado como
 * ADMISSAO_CONCLUIDA por `concluiSemIntegracao`). Criar frente aberta agora ressuscitaria 1.611
 * admissões concluídas para dentro da esteira e faria `admissaoConcluidaSql` deixar de contá-las,
 * que é exatamente o tipo de estrago que a §A.27 existe para evitar.
 *
 * DECLÍNIO, RESCISÃO E PRÉ-ADMISSÃO FICAM DE FORA pelo filtro de farol vivo: quem encerrou não
 * deixa trabalho ativo (§A.16), e pré-admissão nem tem cliente.
 *
 * SÓ INSERE LINHA EM `frentes_admissao`. Nenhum farol é tocado, nenhum status muda, nenhuma frente
 * existente é reescrita. IDEMPOTENTE: o `NOT EXISTS` do alvo mais o `ON CONFLICT DO NOTHING` do
 * unique `(admissao_id, tipo)` fazem a segunda execução não gravar nada. TRANSACIONAL.
 *
 * §A.6: só contagens, código de cliente e farol em log. Nenhum CPF, nenhum nome de candidato.
 *
 * Uso:  DATABASE_URL=... tsx apps/backend/src/db/backfill-integracao-no-cadastro.ts
 *       BACKFILL_DRY=1 ... (só mostra o antes, não grava)
 */
const DRY = process.env.BACKFILL_DRY === "1";

/** A condição do alvo, escrita UMA vez e reusada na prova e no insert (ver backfill-farol-conclusao). */
const ALVO = `
  a.farol_global IN ('EM_ADMISSAO', 'BANCO_AGUARDAR')
  AND EXISTS (
    SELECT 1 FROM frentes_admissao c
     WHERE c.admissao_id = a.id AND c.tipo = 'CADASTRO_CONTRATO' AND c.concluida = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM frentes_admissao i
     WHERE i.admissao_id = a.id AND i.tipo = 'INTEGRACAO'
  )
  AND coalesce(
    (SELECT cpc.obrigatorio FROM cliente_pendencia_config cpc
      WHERE cpc.cod_cliente = a.cod_cliente
        AND cpc.chave = 'INTEGRACAO'
        AND cpc.cliente_vinculo_id IS NULL),
    true
  )
`;

async function main(): Promise<void> {
  const { sql } = createDb(process.env.DATABASE_URL!, 5);

  const antes = await sql<{ cod_cliente: string; farol: string; qtd: number }[]>`
    SELECT a.cod_cliente, a.farol_global AS farol, count(*)::int AS qtd
      FROM admissoes a
     WHERE ${sql.unsafe(ALVO)}
     GROUP BY 1, 2
     ORDER BY 3 DESC`;
  const total = antes.reduce((s, l) => s + Number(l.qtd), 0);

  console.log(`ANTES: ${total} admissão(ões) no Cadastro sem frente de Integração`);
  for (const l of antes) console.log(`  cliente ${l.cod_cliente}: ${l.qtd} em ${l.farol}`);

  if (DRY) {
    console.log("BACKFILL_DRY=1: nada foi gravado.");
    await sql.end();
    return;
  }
  if (total === 0) {
    console.log("Nada a fazer.");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO frentes_admissao (admissao_id, tipo, status, concluida, data_inicio)
      SELECT a.id, 'INTEGRACAO', 'A_AGENDAR', false, now()
        FROM admissoes a
       WHERE ${tx.unsafe(ALVO)}
      ON CONFLICT (admissao_id, tipo) DO NOTHING`;
  });

  const [{ restam }] = await sql<{ restam: number }[]>`
    SELECT count(*)::int AS restam FROM admissoes a WHERE ${sql.unsafe(ALVO)}`;
  console.log(`DEPOIS: ${restam} restante(s) no alvo (esperado 0). Criadas: ${total}.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
