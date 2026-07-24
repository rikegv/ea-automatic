import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { createDb } from "./client";
import {
  admissaoBeneficio,
  admissoes,
  candidatos,
  dadosVagaFolha,
  documentosAdmissao,
  tiposDocumento,
} from "./schema";
import { calcSinalizadorPreenchimento } from "../domain/admissao";

/**
 * Recalcula o `sinalizador_preenchimento` das admissões VIVAS pela RÉGUA UNIFICADA (§A.17 etapa 4).
 *
 * Por que existe: o sinalizador é um valor GRAVADO (a coluna do Gerenciador, o KPI e o radar leem
 * dele), enquanto o modal calcula ao vivo. As duas réguas divergiam, e o create/editar só corrigem
 * o que passar por eles daqui pra frente. Este runner alinha o que JÁ está no banco.
 *
 * RECORTE (decisão do diretor): SÓ admissões vivas (EM_ADMISSAO / BANCO_AGUARDAR). As FINALIZADAS
 * (ADMISSAO_CONCLUIDA) e as encerradas (DECLINOU / RESCISAO) NÃO são tocadas: o histórico da carga
 * fica intacto e os cards da base histórica não se mexem.
 *
 * Idempotente: recalcular de novo dá o mesmo resultado. Só escreve quem muda.
 * §A.6: opera por farol/campos de folha; nada de PII em log (nem nome, nem CPF).
 */
const FAROIS_VIVOS = ["EM_ADMISSAO", "BANCO_AGUARDAR"] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");

  const { sql, db } = createDb(url, 1);
  try {
    const linhas = await db
      .select({
        id: admissoes.id,
        nome: candidatos.nome,
        cpf: admissoes.candidatoCpf,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
        dataAdmissao: admissoes.dataAdmissao,
        tipoContrato: admissoes.tipoContrato,
        isBanco: admissoes.isBanco,
        sinalizador: admissoes.sinalizadorPreenchimento,
        salario: dadosVagaFolha.salario,
        beneficios: dadosVagaFolha.beneficios,
        escala: dadosVagaFolha.escala,
        centroCusto: dadosVagaFolha.centroCusto,
        gestorBp: dadosVagaFolha.gestorBp,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
      .where(inArray(admissoes.farolGlobal, [...FAROIS_VIVOS]));

    const ids = linhas.map((l) => l.id);
    if (ids.length === 0) {
      console.log("[recalcula-sinalizador] nenhuma admissão viva. Nada a fazer.");
      return;
    }

    // Pacote estruturado (§A.17 etapa 4) e Termo de Banco entregue, ambos em LOTE.
    const comEstruturado = new Set(
      (
        await db
          .selectDistinct({ admissaoId: admissaoBeneficio.admissaoId })
          .from(admissaoBeneficio)
          .where(inArray(admissaoBeneficio.admissaoId, ids))
      ).map((r) => r.admissaoId),
    );
    const tipoTermo = await db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, "TERMO_BANCO"),
    });
    const comTermo = new Set<string>(
      tipoTermo
        ? (
            await db
              .select({ admissaoId: documentosAdmissao.admissaoId })
              .from(documentosAdmissao)
              .where(
                and(
                  inArray(documentosAdmissao.admissaoId, ids),
                  eq(documentosAdmissao.tipoDocumentoId, tipoTermo.id),
                  eq(documentosAdmissao.estado, "ENTREGUE"),
                ),
              )
          ).map((r) => r.admissaoId)
        : [],
    );

    let mudaram = 0;
    for (const l of linhas) {
      const novo = calcSinalizadorPreenchimento({
        candidato: { nome: l.nome, cpf: l.cpf },
        codCliente: l.codCliente,
        cargoId: l.cargoId,
        dataAdmissao: l.dataAdmissao,
        tipoContrato: l.tipoContrato,
        vagaFolha: {
          salario: l.salario,
          beneficios: l.beneficios,
          escala: l.escala,
          centroCusto: l.centroCusto,
          gestorBp: l.gestorBp,
        },
        isBanco: l.isBanco,
        termoBancoEntregue: comTermo.has(l.id),
        temBeneficioEstruturado: comEstruturado.has(l.id),
      });
      if (novo === l.sinalizador) continue;
      mudaram++;
      // Sem PII: só o id técnico da admissão e os dois estados.
      console.log(`  ${l.id}: ${l.sinalizador} -> ${novo}`);
      if (aplicar) {
        await db
          .update(admissoes)
          .set({ sinalizadorPreenchimento: novo, atualizadoEm: new Date() })
          .where(eq(admissoes.id, l.id));
      }
    }

    console.log(
      `[recalcula-sinalizador] vivas: ${linhas.length} | mudam: ${mudaram} | ${
        aplicar ? "APLICADO" : "SIMULAÇÃO (use --aplicar para gravar)"
      }`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
