import "dotenv/config";
import { readdir } from "node:fs/promises";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { and, eq, inArray } from "drizzle-orm";
import { AiModule } from "../ai/ai.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { PandapeModule } from "../pandape/pandape.module";
import { ReauditoriaModule } from "../reauditoria/reauditoria.module";
import { ReauditoriaService } from "../reauditoria/reauditoria.service";
import { StagingModule } from "../staging/staging.module";
import { DrizzleModule } from "./drizzle.module";
import { createDb } from "./client";
import { documentosAdmissao, tiposDocumento } from "./schema";
import { familiaDaFalha } from "../ai/ai-client.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * RECUPERAÇÃO das admissões cuja coleta do Pandapé foi perdida pelo bug do Date no upsert de coleta
 * (o `sql case` com `${agora}` que derrubava `auditarConjunto` com 500). O fix já está em produção;
 * este runner recupera o que ficou para trás.
 *
 * FASE 1 (esta): SÓ as admissões cujo id é passado, e SÓ os tipos de documento que estão na STAGING
 * local e ainda estão PENDENTE (ou sem linha) no banco. Reaudita da staging, SEM re-baixar do
 * Pandapé. Chama `ReauditoriaService.reauditar`, o mesmo caminho da tela.
 *
 * TRAVAS (decisão do diretor):
 *  - só as admissões-alvo (lista via --ids, obrigatória);
 *  - NÃO sobrescreve validação humana: o `reauditar` já lança conflito nesse caso; além disso o
 *    runner só toca tipos PENDENTE, então documento validado (não-pendente) nem é candidato;
 *  - idempotência: só processa tipo PENDENTE/sem-veredito, então rodar de novo não re-audita o que
 *    já ficou ENTREGUE/INCONFORME;
 *  - QUOTA do Vertex: ao primeiro erro de família QUOTA, PARA tudo e reporta.
 *
 * §A.6: log por id de admissão e código de tipo; nada de PII.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    AiModule,
    AuditoriaModule,
    StagingModule,
    PandapeModule,
    ReauditoriaModule,
  ],
})
class ReprocessaModule {}

const STAGING_DIR = process.env.STAGING_DIR ?? "/tmp/ea-staging";

/** Autor dos eventos: usuário REAL (FK em usuarios). Passado por --autor=<uuid>. */
function argOf(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
}

async function tiposNaStaging(admissaoId: string): Promise<string[]> {
  try {
    const nomes = await readdir(`${STAGING_DIR}/${admissaoId}`);
    return [...new Set(nomes.map((n) => n.split("__")[0]).filter(Boolean))];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const aplicar = process.argv.includes("--aplicar");
  const autorId = argOf("autor");
  const ids = (argOf("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error("Informe --ids=<uuid,uuid,...>");
  if (!autorId) throw new Error("Informe --autor=<uuid de usuário real>");

  const USER: AuthUser = {
    id: autorId,
    email: "sistema@ea.local",
    papel: "SUPER_ADMIN",
    senhaTemporaria: false,
  };

  const { sql, db } = createDb(url, 1);
  // Mapa código -> id de tipo, e o estado atual de cada documento das admissões-alvo.
  const tipos = await db.select({ id: tiposDocumento.id, codigo: tiposDocumento.codigo }).from(tiposDocumento);
  const idPorCodigo = new Map(tipos.map((t) => [t.codigo, t.id]));

  // Planeja: por admissão, os tipos que estão na staging E estão PENDENTE (ou sem linha).
  const plano: Array<{ admissaoId: string; codigo: string; tipoId: string }> = [];
  for (const admissaoId of ids) {
    const naStaging = await tiposNaStaging(admissaoId);
    if (naStaging.length === 0) {
      console.log(`  [${admissaoId}] sem staging local, pulada nesta fase.`);
      continue;
    }
    const tipoIds = naStaging.map((c) => idPorCodigo.get(c)).filter(Boolean) as string[];
    const docs = tipoIds.length
      ? await db
          .select({ tipoDocumentoId: documentosAdmissao.tipoDocumentoId, estado: documentosAdmissao.estado })
          .from(documentosAdmissao)
          .where(and(eq(documentosAdmissao.admissaoId, admissaoId), inArray(documentosAdmissao.tipoDocumentoId, tipoIds)))
      : [];
    const estadoPorTipo = new Map(docs.map((d) => [d.tipoDocumentoId, d.estado]));
    for (const codigo of naStaging) {
      const tipoId = idPorCodigo.get(codigo);
      if (!tipoId) continue;
      const estado = estadoPorTipo.get(tipoId) ?? "PENDENTE";
      if (estado !== "PENDENTE") {
        console.log(`  [${admissaoId}] ${codigo}: já tem veredito (${estado}), pulado.`);
        continue;
      }
      plano.push({ admissaoId, codigo, tipoId });
    }
  }
  await sql.end({ timeout: 5 });

  console.log(`\nPlano: ${plano.length} documento(s) PENDENTE com staging para reauditar.`);
  if (!aplicar) {
    console.log("Simulação. Rode com --aplicar para reauditar.");
    return;
  }

  const app = await NestFactory.createApplicationContext(ReprocessaModule, { logger: ["warn", "error"] });
  const reaud = app.get(ReauditoriaService);
  // Pausa entre documentos: o 429 do Vertex aparece por volta de 10 chamadas sequenciais na mesma
  // janela; ~7s entre chamadas mantém abaixo de ~9/min. Configurável por --pausaMs.
  const pausaMs = Number(argOf("pausaMs") ?? "7000");
  const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let ok = 0;
  const vereditos: Record<string, number> = {};
  try {
    for (let i = 0; i < plano.length; i += 1) {
      const item = plano[i];
      if (i > 0) await dorme(pausaMs);
      try {
        const r = await reaud.reauditar(item.admissaoId, item.tipoId, USER);
        const estado = r?.documento?.estado ?? "?";
        vereditos[estado] = (vereditos[estado] ?? 0) + 1;
        ok += 1;
        console.log(`  OK [${item.admissaoId}] ${item.codigo} -> ${estado}`);
      } catch (e) {
        const familia = familiaDaFalha(e);
        if (familia === "QUOTA") {
          console.error(`\nPARADO por QUOTA do Vertex em [${item.admissaoId}] ${item.codigo}. ` +
            `${ok} documento(s) reauditado(s) antes de parar.`);
          break;
        }
        console.error(`  FALHA [${item.admissaoId}] ${item.codigo}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
  } finally {
    await app.close();
  }
  console.log(`\nResumo: ${ok}/${plano.length} reauditado(s). Vereditos: ${JSON.stringify(vereditos)}`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
