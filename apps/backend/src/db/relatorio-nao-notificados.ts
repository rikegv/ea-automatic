import "dotenv/config";
import { createDb } from "./client";

/**
 * RELATÓRIO: CONTRATO ATIVO E NÃO NOTIFICADO.
 *
 * A pergunta que ele responde: existe alguém com contrato de pé na Clicksign que nunca foi chamado
 * para assinar? Foi exatamente o estado de 106 contratos em 24/08/2026, e só apareceu porque os
 * colaboradores reclamaram. Do lado do sistema estava tudo "aguardando assinatura", que era verdade e
 * ao mesmo tempo escondia que ninguém tinha sido avisado.
 *
 * A RÉGUA: `clicksign_status = 'AGUARDANDO_ASSINATURA'` (contrato vivo, esperando alguém assinar)
 * MAIS `clicksign_envelope_id` presente (existe envelope de verdade, não é artefato da carga §A.16)
 * MENOS `clicksign_notificado_em` preenchido (a Clicksign confirmou o disparo do e-mail).
 *
 * NULO NÃO É CULPA AUTOMÁTICA. Quem foi notificado ANTES da coluna existir (migração 0080) também
 * aparece aqui, porque o sistema honestamente não sabe. O relatório separa os dois grupos pela data
 * de ativação, para ninguém confundir "não notificado" com "notificado antes de existir o carimbo".
 *
 * §A.6: nome do candidato e cliente são dado de trabalho, como na esteira. Nada de CPF, nada de
 * e-mail, nada de id de envelope.
 *
 * COMO RODAR (na pasta apps/backend):
 *   npx tsx src/db/relatorio-nao-notificados.ts
 */

/** Data em que a coluna passou a ser preenchida. Antes disso, nulo é "não sabemos", não "falhou". */
const DESDE_O_CARIMBO = "2026-08-25";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const { sql } = createDb(url, 1);
  try {
    const linhas = (await sql`
      SELECT c.nome                                            AS candidato,
             COALESCE(cl.nome_operacao, 'não informado')        AS cliente,
             a.clicksign_enviado_em                            AS ativado_em,
             a.data_admissao                                   AS admite_em,
             (a.clicksign_enviado_em::date >= ${DESDE_O_CARIMBO}::date) AS depois_do_carimbo
        FROM admissoes a
        JOIN candidatos c  ON c.cpf = a.candidato_cpf
        LEFT JOIN clientes cl ON cl.cod_cliente = a.cod_cliente
       WHERE a.clicksign_status = 'AGUARDANDO_ASSINATURA'
         AND a.clicksign_envelope_id IS NOT NULL
         AND a.clicksign_notificado_em IS NULL
       ORDER BY a.data_admissao NULLS LAST, c.nome
    `) as unknown as {
      candidato: string;
      cliente: string;
      ativado_em: Date | null;
      admite_em: string | null;
      depois_do_carimbo: boolean;
    }[];

    if (linhas.length === 0) {
      console.log("Nenhum contrato ativo sem notificação. Todo envelope de pé chamou a pessoa.");
      return;
    }

    const confirmados = linhas.filter((l) => l.depois_do_carimbo);
    const anteriores = linhas.filter((l) => !l.depois_do_carimbo);

    console.log(`CONTRATOS ATIVOS SEM NOTIFICAÇÃO CONFIRMADA: ${linhas.length}\n`);

    if (confirmados.length > 0) {
      console.log(
        `FALHA DE VERDADE (${confirmados.length}): ativados depois de ${DESDE_O_CARIMBO}, quando o ` +
          "carimbo já existia. O envelope está de pé e a pessoa NÃO foi chamada.",
      );
      for (const l of confirmados) {
        console.log(
          `  - ${l.candidato} | ${l.cliente} | admite ${l.admite_em ?? "não informado"}`,
        );
      }
      console.log("");
    }

    if (anteriores.length > 0) {
      console.log(
        `SEM CARIMBO, ORIGEM DESCONHECIDA (${anteriores.length}): ativados antes de ` +
          `${DESDE_O_CARIMBO}. Podem ter sido notificados na mão; o sistema não tem como afirmar.`,
      );
      for (const l of anteriores) {
        console.log(
          `  - ${l.candidato} | ${l.cliente} | admite ${l.admite_em ?? "não informado"}`,
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e: unknown) => {
  console.error("[relatorio-nao-notificados] falhou:", e);
  process.exitCode = 1;
});
