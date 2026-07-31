import "dotenv/config";
import { AiClientService } from "../ai/ai-client.service";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { ReconciliacaoDriveService } from "../diagnostico/reconciliacao-drive.service";
import { createDb } from "./client";

/**
 * RECONCILIAÇÃO DO DRIVE, sob demanda (é a MESMA rotina que roda sozinha ao abrir o Diagnóstico).
 *
 * PARA QUE SERVE UM RUNNER, se a varredura já é automática: para rodar AGORA, sem esperar o próximo
 * ciclo nem depender de alguém abrir a tela. Útil logo depois de o diretor limpar pastas no Drive.
 *
 * NÃO CRIA NEM APAGA NADA NO DRIVE (§A.6): só lê o Drive e conserta o que o EA sabe (liga a pasta que
 * já existe, tira do aviso a duplicata que já foi apagada, zera a pendência que já está resolvida).
 *
 * POR QUE SEM NEST. O `tsx` não emite os metadados de decorator, então a injeção por TIPO não
 * funciona em runner (o `ConfigService` chega `undefined` no construtor). Montar as três dependências
 * à mão é honesto e mantém o runner rodando exatamente o mesmo serviço da produção.
 *
 * COMO RODAR (na pasta apps/backend):
 *   npx tsx src/db/reconcilia-drive.ts
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  // ConfigService mínimo: o cliente do ai-service só lê AI_SERVICE_URL e INTERNAL_TOKEN do ambiente.
  const config = { get: (chave: string) => process.env[chave] } as never;
  const ai = new AiClientService(config);
  const pastaPai = new DrivePastaPaiService(db as never);
  // O arquivamento automático precisa do AuditoriaService, que tem seis dependências próprias. No
  // runner ele entra como no-op: aqui o objetivo é reconciliar o que o Drive já tem, e o disparo do
  // arquivamento acontece pela varredura de dentro do backend, que tem o contexto completo.
  const auditoriaNoRunner = {
    aplicarPosVeredito: async () => {
      console.log("[reconcilia-drive] arquivamento automático não roda no runner (só no backend).");
    },
  };
  const svc = new ReconciliacaoDriveService(
    db as never,
    ai,
    pastaPai,
    auditoriaNoRunner as never,
  );

  const r = await svc.reconciliar();
  console.log(
    `\n[reconcilia-drive] avisos de duplicata limpos=${r.duplicatasLimpas}, ` +
      `pastas ligadas=${r.pastasLigadas}, pendências zeradas=${r.avisosLimpos}`,
  );
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
