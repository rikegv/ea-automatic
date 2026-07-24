import "dotenv/config";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { NestFactory } from "@nestjs/core";
import { AiModule } from "../ai/ai.module";
import { ReauditoriaModule } from "../reauditoria/reauditoria.module";
import { ReauditoriaService } from "../reauditoria/reauditoria.service";
import { DrizzleModule, DRIZZLE } from "./drizzle.module";
import type { Database } from "./client";
import type { AuthUser } from "../auth/auth.types";

/**
 * Contexto MÍNIMO: só o necessário para a reauditoria. Não usa o `AppModule` de propósito — ele
 * registra os guards globais (OriginGuard e companhia), que existem para o ciclo HTTP e nem chegam a
 * inicializar fora dele.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    DrizzleModule,
    AiModule,
    ReauditoriaModule,
  ],
})
class ReauditarCliModule {}

/**
 * Runner de REAUDITORIA em lote POR ADMISSÃO (OST A / Bloco 7), sob demanda.
 *
 * Serve para o caso em que a CAUSA do erro foi corrigida FORA do documento e vale reanalisar tudo o
 * que aquela admissão já tem: foi o que aconteceu com a Silvia, cujo cadastro tinha um token
 * duplicado no nome e derrubou seis documentos bons por "nome não confere". Na tela o consultor
 * reaudita documento a documento (botão da aba Auditoria); aqui a mesma operação roda para todos os
 * documentos JÁ RECEBIDOS de UMA admissão, mostrando o antes e o depois.
 *
 * Usa o MESMO `ReauditoriaService` da rota (o controller é passagem), então reusa staging, busca no
 * Pandapé quando preciso, grava a trilha e não é bloqueado pela dedup por hash.
 *
 * Só toca documentos já recebidos: PENDENTE sem motivo (nunca chegou) é pulado, porque não há o que
 * reanalisar. §A.6: imprime código do tipo, estado e motivo; nunca nome, CPF, arquivo ou URL.
 *
 * USO: pnpm --filter @ea/backend db:reauditar -- --admissao=<uuid>
 */

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1]?.trim();
}

async function main(): Promise<void> {
  const admissaoId = arg("admissao");
  if (!admissaoId) throw new Error("informe --admissao=<uuid>");

  const app = await NestFactory.createApplicationContext(ReauditarCliModule, {
    logger: ["warn", "error"],
  });
  try {
    const db = app.get<Database>(DRIZZLE);
    const reauditoria = app.get(ReauditoriaService);

    const autor = await db.query.usuarios.findFirst({ where: (u, { eq }) => eq(u.papel, "SUPER_ADMIN") });
    if (!autor) throw new Error("nenhum usuário SUPER_ADMIN para assinar a trilha");
    const user: AuthUser = {
      id: autor.id,
      email: autor.email,
      papel: autor.papel,
      senhaTemporaria: autor.senhaTemporaria,
    };

    const docs = await db.query.documentosAdmissao.findMany({
      where: (d, { eq }) => eq(d.admissaoId, admissaoId),
    });
    const tipos = await db.query.tiposDocumento.findMany();
    const codigoDe = new Map(tipos.map((t) => [t.id, t.codigo]));

    // Só o que já foi recebido: estado diferente de PENDENTE, ou PENDENTE com motivo (foi auditado
    // e caiu em PENDENTE, ex.: tipo sem regra ativa).
    const alvos = docs.filter((d) => d.estado !== "PENDENTE" || Boolean(d.observacao));
    console.log(`[reauditar] admissao=${admissaoId} documentos a reauditar: ${alvos.length}`);

    for (const doc of alvos) {
      const codigo = codigoDe.get(doc.tipoDocumentoId) ?? "?";
      try {
        const out = await reauditoria.reauditar(admissaoId, doc.tipoDocumentoId, user);
        const r = out.reauditoria;
        const mudou = r.estadoAntes === r.estadoDepois ? "=" : "→";
        console.log(
          `    ${codigo.padEnd(26)} ${r.estadoAntes.padEnd(21)} ${mudou} ${r.estadoDepois.padEnd(21)} ` +
            `(origem=${r.origemArquivos}) motivo="${out.resultado.motivo}"`,
        );
      } catch (err) {
        console.log(
          `    ${codigo.padEnd(26)} FALHA: ${err instanceof Error ? err.message : "erro"}`,
        );
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error("[reauditar] ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
