import "dotenv/config";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { and, eq, isNotNull, isNull, ne, notInArray, sql as dsql } from "drizzle-orm";
import { DrizzleModule } from "./drizzle.module";
import { createDb } from "./client";
import { admissoes, portalCredenciais } from "./schema";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import {
  FABRICIO_FORA_DO_LOTE as FABRICIO,
  FAROIS_FORA_DO_LOTE as FAROIS_ENCERRADOS,
} from "../domain/portal-reprocesso-lote";
import { PortalArmazenamentoService } from "../portal/portal-armazenamento.service";
import { PortalArquivadorService } from "../portal/portal-arquivador.service";
import { PortalArquivamentoService } from "../portal/portal-arquivamento.service";
import { PortalEmissorService } from "../portal/portal-emissor.service";

/**
 * REPROCESSA ao prontuário do Drive os documentos que entraram pelo PORTAL e nunca foram arquivados
 * (frente Prontuário Drive, Desenho 1). É o gêmeo do `rearquiva-drive.ts`, para a origem PORTAL.
 *
 * POR QUE EXISTE. Até a ponte do arquivador existir, o documento entregue pelo Portal vivia só no
 * balde de entrada: a pasta de prontuário nunca era criada (ou ficava sem os documentos pessoais).
 * Este runner cobre o acúmulo, uma vez, depois que o diretor rodar o binding de IAM e subir a
 * instância do arquivador. A META é 100%: nenhuma admissão do Portal pode ficar sem prontuário.
 *
 * NÃO É EDIÇÃO MANUAL DE DADO: chama `PortalArquivamentoService.arquivarPortal`, o MESMO núcleo do
 * gatilho vivo. Quem lê o balde, resolve a pasta e copia bytes é o código de produção; o runner só
 * escolhe EM QUAIS admissões ele roda. Idempotente pela dedup de md5 do arquivador: rodar duas vezes
 * não duplica arquivo.
 *
 * ALVO (a lista completa de quem está sem prontuário do Portal): admissões com objeto CONFIRMADO
 * (`confirmado_em` não-nulo = chegada provada pelo metadado) e NÃO reprovado (`reprovado_em` nulo),
 * EXCETO:
 *   - FABRICIO (5eeb96cc-...), já resolvido à mão pelo diretor (fora do lote por decisão, e porque o
 *     upload manual pode ter reencodado os bytes, o que furaria a dedup por md5);
 *   - admissões ENCERRADAS (farol DECLINOU/RESCISAO): quem declinou não deixa prontuário ativo
 *     (§A.16), então não entra no lote.
 *
 * INERTE SEM BINDING: `arquivarPortal` devolve INERTE enquanto `PORTAL_ARQUIVADOR_URL`/`TOKEN` e
 * `PORTAL_GCS_BUCKET` não existirem. Sem eles, mesmo com `--aplicar`, nada é copiado.
 *
 * Uso:  pnpm tsx src/db/rearquiva-portal.ts [--aplicar] [--admissao=<uuid>]
 * Sem `--aplicar` só LISTA o que tentaria (contagem + ids). §A.6: só id de admissão e contagens.
 */

// A régua do lote (quem entra, quem fica fora) é PURA e testada em
// `domain/portal-reprocesso-lote.ts`; o SQL abaixo a ESPELHA e importa as mesmas constantes, para a
// exclusão do Fabricio e dos encerrados ter uma fonte só. FAROIS_ENCERRADOS é readonly; o drizzle
// `notInArray` aceita a cópia mutável.
const FAROIS_ENCERRADOS_SQL = [...FAROIS_ENCERRADOS];

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DrizzleModule],
  providers: [
    PortalArquivamentoService,
    PortalArquivadorService,
    PortalArmazenamentoService,
    PortalEmissorService,
    DrivePastaPaiService,
  ],
})
class RearquivaPortalModule {}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");
  const alvo = process.argv.find((a) => a.startsWith("--admissao="))?.split("=")[1];

  const { sql, db } = createDb(url, 1);
  let candidatas: Array<{ id: string; objetos: number }> = [];
  try {
    const base = db
      .select({
        id: portalCredenciais.admissaoId,
        objetos: dsql<number>`count(*)::int`,
      })
      .from(portalCredenciais)
      .innerJoin(admissoes, eq(admissoes.id, portalCredenciais.admissaoId))
      .where(
        and(
          isNotNull(portalCredenciais.confirmadoEm),
          isNull(portalCredenciais.reprovadoEm),
          ne(portalCredenciais.admissaoId, FABRICIO),
          notInArray(admissoes.farolGlobal, FAROIS_ENCERRADOS_SQL),
          ...(alvo ? [eq(portalCredenciais.admissaoId, alvo)] : []),
        ),
      )
      .groupBy(portalCredenciais.admissaoId);
    candidatas = await base;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const totalObjetos = candidatas.reduce((s, c) => s + c.objetos, 0);
  console.log(
    `Admissões do Portal sem prontuário garantido: ${candidatas.length} ` +
      `(${totalObjetos} objeto(s) confirmado(s), Fabricio e encerrados fora do lote).`,
  );
  for (const c of candidatas) console.log(`  - admissão ${c.id}: ${c.objetos} objeto(s)`);

  if (candidatas.length === 0 || !aplicar) {
    console.log(aplicar ? "Nada a fazer." : "\nSimulação. Rode com --aplicar APÓS o binding do diretor.");
    return;
  }

  const app = await NestFactory.createApplicationContext(RearquivaPortalModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const arquivamento = app.get(PortalArquivamentoService);
    if (!arquivamento.clienteConfigurado()) {
      console.log(
        "\nArquivador NÃO configurado (PORTAL_ARQUIVADOR_URL/TOKEN ausentes): nada copiado. " +
          "Rode só depois do binding e da instância no ar.",
      );
      return;
    }
    let ok = 0;
    let semAcao = 0;
    let comFalha = 0;
    let objetosArquivados = 0;
    for (const c of candidatas) {
      try {
        const r = await arquivamento.arquivarPortal(c.id);
        objetosArquivados += r.arquivados;
        if (r.falhas > 0) {
          comFalha += 1;
          console.log(`  [falha parcial] admissão ${c.id}: ${r.falhas} objeto(s) não subiram`);
        } else if (r.tentou) {
          ok += 1;
        } else {
          semAcao += 1;
          console.log(`  [sem ação] admissão ${c.id}: ${r.motivo}`);
        }
      } catch (e) {
        comFalha += 1;
        console.log(`  [erro] admissão ${c.id}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
    console.log(
      `\nResumo: ${ok} admissão(ões) OK, ${comFalha} com falha, ${semAcao} sem ação; ` +
        `${objetosArquivados} objeto(s) arquivado(s) ao todo.`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
