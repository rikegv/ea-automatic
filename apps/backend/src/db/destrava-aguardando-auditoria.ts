import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { createDb } from "./client";
import { documentosAdmissao, tiposDocumento } from "./schema";
import { triarConjunto } from "../auditoria/conteudo-documento";
import { horasParado } from "../domain/auditoria-parada";

/**
 * DESTRAVA os documentos presos em `AGUARDANDO_AUDITORIA` (OST motivo verdadeiro, Bloco 6).
 *
 * POR QUE EXISTE. `AGUARDANDO_AUDITORIA` não sai sozinho: não há varredura agendada, e o pull só
 * re-tenta quando alguém dispara um pull. Quando a causa é determinística (o "documento" não é
 * documento), a re-tentativa nunca converge, e o documento fica preso para sempre. O caso que
 * originou a OST ficou 14h assim e continuaria indefinidamente.
 *
 * O QUE FAZ. Para cada documento preso, olha os arquivos que ainda estão na staging e aplica a MESMA
 * função de triagem que o fluxo vivo usa (`triarConjunto`):
 *  - nenhum arquivo auditável  → grava INCONFORME com o motivo acionável (o caso do texto digitado);
 *  - há arquivo auditável      → NÃO TOCA. A parada foi falha de sistema (quota, motor fora), o
 *                                documento pode estar ótimo, e quem resolve isso é Reauditar;
 *  - staging já expurgada      → NÃO TOCA. Sem os bytes não há como classificar, e chutar veredito
 *                                sobre documento que ninguém consegue mais ver seria pior que a
 *                                parada. Fica para o marcador de tempo parado sinalizar.
 *
 * NÃO É EDIÇÃO MANUAL DE DADO: a decisão sai da mesma função pura do fluxo vivo, o runner só a
 * aplica ao que já estava preso antes de o código existir.
 *
 * Idempotente: rodar de novo não muda nada (o que virou INCONFORME sai do universo da consulta).
 * Padrão da casa: só relata; escreve apenas com `--aplicar`.
 * §A.6: opera por estado, código de tipo e formato do arquivo. Nada de nome, CPF ou conteúdo em log.
 */

const STAGING_DIR = process.env.STAGING_DIR ?? "/tmp/ea-staging";

/** Arquivos da staging daquela admissão que pertencem ao tipo (nome gravado como `{TIPO}__{uuid}`). */
async function arquivosDoTipo(admissaoId: string, codigo: string): Promise<Buffer[]> {
  const dir = join(STAGING_DIR, admissaoId);
  let nomes: string[];
  try {
    nomes = await readdir(dir);
  } catch {
    return []; // staging expurgada ou admissão sem pasta.
  }
  const doTipo = nomes.filter((n) => n.split("__")[0] === codigo);
  return Promise.all(doTipo.map((n) => readFile(join(dir, n))));
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");

  const { sql, db } = createDb(url, 1);
  try {
    const presos = await db
      .select({
        id: documentosAdmissao.id,
        admissaoId: documentosAdmissao.admissaoId,
        tipoDocumentoId: documentosAdmissao.tipoDocumentoId,
        codigo: tiposDocumento.codigo,
        atualizadoEm: documentosAdmissao.atualizadoEm,
      })
      .from(documentosAdmissao)
      .innerJoin(tiposDocumento, eq(tiposDocumento.id, documentosAdmissao.tipoDocumentoId))
      .where(eq(documentosAdmissao.estado, "AGUARDANDO_AUDITORIA"));

    console.log(`Documentos em AGUARDANDO_AUDITORIA: ${presos.length}`);
    if (presos.length === 0) {
      console.log("Nada a destravar.");
      return;
    }

    const agora = new Date();
    let reprovados = 0;
    let semArquivo = 0;
    let auditaveis = 0;

    for (const d of presos) {
      const buffers = await arquivosDoTipo(d.admissaoId, d.codigo);
      const horas = horasParado(d.atualizadoEm, agora);

      if (buffers.length === 0) {
        semArquivo += 1;
        console.log(
          `  [sem arquivo na staging] tipo=${d.codigo}, parado há ${horas}h. Mantido como está.`,
        );
        continue;
      }

      const triagem = triarConjunto(buffers.map((buffer) => ({ buffer })));
      if (!triagem.motivoInconforme) {
        auditaveis += 1;
        console.log(
          `  [arquivo auditável] tipo=${d.codigo}, parado há ${horas}h, ` +
            `arquivos=${buffers.length}. Falha foi de SISTEMA: mantido, resolve com Reauditar.`,
        );
        continue;
      }

      reprovados += 1;
      console.log(
        `  [não é documento] tipo=${d.codigo}, parado há ${horas}h, arquivos=${buffers.length} ` +
          `→ INCONFORME. Motivo: ${triagem.motivoInconforme}`,
      );
      if (aplicar) {
        await db
          .update(documentosAdmissao)
          .set({
            estado: "INCONFORME",
            observacao: triagem.motivoInconforme,
            atualizadoEm: new Date(),
          })
          .where(
            and(
              eq(documentosAdmissao.id, d.id),
              eq(documentosAdmissao.estado, "AGUARDANDO_AUDITORIA"),
            ),
          );
      }
    }

    console.log(
      `\nResumo: ${reprovados} para INCONFORME, ${auditaveis} mantidos (falha de sistema), ` +
        `${semArquivo} sem arquivo na staging.`,
    );
    console.log(aplicar ? "Alterações APLICADAS." : "Simulação. Rode com --aplicar para gravar.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
