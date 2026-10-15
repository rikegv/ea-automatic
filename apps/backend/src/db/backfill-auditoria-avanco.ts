import "dotenv/config";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AiModule } from "../ai/ai.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { ReconciliacaoAuditoriaScheduler } from "../auditoria/reconciliacao-auditoria.scheduler";
import { ReguaCompletudeService } from "../regua/regua-completude.service";
import { DrizzleModule } from "./drizzle.module";

/**
 * BACKFILL DO AVANÇO DA AUDITORIA (frente Auditoria -> Avanço): avança de uma vez as admissões que
 * já estão presas em `ANALISE_PENDENTE` com a régua obrigatória COMPLETA (as ~5 que a auditoria
 * AUTOMÁTICA do Portal aprovou sem nunca chamar o pós-veredito).
 *
 * NÃO É EDIÇÃO MANUAL DE DADO: sobe o contexto do Nest e REUSA o MESMO conjunto e o MESMO disparo do
 * `ReconciliacaoAuditoriaScheduler` (`candidatos()` + `reconciliar()`), que por sua vez chama o
 * `aplicarPosVeredito` de produção. O alvo é COMPUTADO (EM_ADMISSAO + AUDITORIA ANALISE_PENDENTE +
 * régua completa), nunca uma lista de ids fixa. Idempotente: `aplicarPosVeredito` não reescreve
 * frente já concluída, então rodar de novo converge.
 *
 * A reconciliação agendada é DESLIGADA neste processo (`AUDITORIA_RECONCILIACAO=off`) para o runner
 * não armar timer nenhum: o miolo (`reconciliar`) é independente do agendamento e roda direto.
 *
 * Uso:  pnpm tsx src/db/backfill-auditoria-avanco.ts [--aplicar]
 * Sem `--aplicar` só CONTA o que avançaria. §A.6: o log é CONTAGEM, nunca id, CPF, nome ou cliente.
 */

// Desliga o agendador ANTES do boot: o runner é one-off e não deve armar os timers de 10 min.
process.env.AUDITORIA_RECONCILIACAO = "off";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DrizzleModule, AiModule, AuditoriaModule],
})
class BackfillModule {}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");

  const app = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const scheduler = app.get(ReconciliacaoAuditoriaScheduler);

    if (!aplicar) {
      // DRY: conta as candidatas e, entre elas, quantas têm a régua COMPLETA (avançariam). Mede a
      // completude pela MESMA fonte única que o miolo usa, sem escrever nada.
      const completude = app.get(ReguaCompletudeService);
      const candidatos = await scheduler.candidatos();
      let completos = 0;
      for (const c of candidatos) {
        const prog = await completude.progresso(c.id, c.codCliente, c.cargoId);
        if (prog.completa) completos += 1;
      }
      console.log(
        `Simulação: ${candidatos.length} candidata(s) (EM_ADMISSAO + AUDITORIA ANALISE_PENDENTE), ` +
          `${completos} com régua completa avançariam. Rode com --aplicar para avançar.`,
      );
      return;
    }

    const r = await scheduler.reconciliar();
    console.log(
      `Backfill aplicado: ${r.varridos} varrido(s), ${r.avancados} avançado(s), ` +
        `${r.pulos} pulo(s) (régua ainda incompleta), ${r.falhas} falha(s).`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
