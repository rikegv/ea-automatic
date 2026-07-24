import "dotenv/config";
import { Queue, type Job } from "bullmq";
import { and, eq, inArray, isNotNull, ne, sql as raw } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes, documentoArquivosColetados, documentosAdmissao, integracaoPandape } from "./schema";
import {
  criarConexaoRedis,
  JOB_PULL_DOCS,
  PANDAPE_QUEUE,
  PANDAPE_QUEUE_OPTIONS,
  type PullDocsJobData,
} from "../pandape/pandape.queue";
import type { ResumoPull } from "../pandape/pandape-sync.service";

/**
 * VARREDURA UNIFICADA de documentos (OST dedup + carga retroativa, Bloco 2).
 *
 * UMA peça só para as DUAS populações de passivo, disparada SOB DEMANDA (nunca cron, nunca gatilho
 * automático). Varre as admissões VIVAS e decide sozinha, por admissão, qual caminho seguir:
 *
 *   - **CARGA**     — nunca teve documento coletado (ex.: quem já estava na esteira antes de a coleta
 *                     existir). Puxa o acervo inteiro da v3.
 *   - **REPROCESSO** — já tem documento coletado, porém gravado pelo fluxo ANTIGO (mime quebrado,
 *                     veredito por arquivo isolado, sem motivo). Re-audita com o fluxo atual; só
 *                     re-baixa o que faltar, e pula o que já está íntegro (marca de arquivo).
 *
 * Quem classifica é o script, não o operador: o Rike não precisa saber quem é de qual grupo.
 *
 * COMO RODA: o script é PLANEJADOR e ENFILEIRADOR. Ele não chama o Pandapé nem a IA — enfileira um
 * job `pull-docs` por admissão na MESMA fila BullMQ do backend, e quem executa é o worker que já está
 * de pé, com o limiter que respeita o rate limit compartilhado (§A.5). Nunca dispara N chamadas
 * simultâneas. Falha numa admissão não derruba o lote: o job falha sozinho e entra no relatório.
 *
 * TRAVAS (Bloco 3): o script NÃO muda status de admissão, NÃO libera, NÃO conclui e NÃO altera régua.
 * Só coleta e audita. Pré-admissões (AGUARDANDO_LIBERACAO) ficam de fora por construção: sem
 * cliente/cargo não há régua, e liberar não é papel desta rotina.
 *
 * §A.6: nenhum log traz CPF, nome de candidato, nome de arquivo ou URL do Pandapé. O relatório
 * trabalha com id de admissão, código de tipo, contagens e rótulo de FORMULÁRIO.
 *
 * USO:
 *   pnpm --filter @ea/backend db:varredura                      # PLANO (dry-run): só mostra o volume
 *   pnpm --filter @ea/backend db:varredura -- --aplicar         # enfileira e acompanha
 *   pnpm --filter @ea/backend db:varredura -- --admissao=<uuid> # piloto: uma admissão só
 */

/** §A.16 / §A.19: vivas são só estas. Concluídas, declínios e pré-admissões ficam fora. */
const FAROIS_VIVOS = ["EM_ADMISSAO", "BANCO_AGUARDAR"] as const;

/** Espera máxima pelo término dos jobs antes de desistir do acompanhamento (o lote segue no worker). */
const TIMEOUT_MS = 30 * 60_000;
/** Intervalo do polling de estado do job. Barato: são poucos jobs e a leitura é um HGET no Redis. */
const POLL_MS = 3_000;

type Caminho = "CARGA" | "REPROCESSO";

interface Alvo {
  admissaoId: string;
  idPrecollaborator: string;
  caminho: Caminho;
  docsColetados: number;
  arquivosMarcados: number;
}

function arg(nome: string): string | undefined {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado?.split("=")[1]?.trim();
}

/**
 * Planeja: lista as admissões vivas COM origem Pandapé rastreável (`id_precollaborator`) e classifica
 * cada uma. Admissão viva sem pré-colaborador não entra: não há acervo no Pandapé para puxar.
 */
async function planejar(db: ReturnType<typeof createDb>["db"], admissaoFiltro?: string): Promise<Alvo[]> {
  const linhas = await db
    .select({
      admissaoId: admissoes.id,
      idPrecollaborator: integracaoPandape.idPrecollaborator,
      // "já coletou" = existe documento em estado diferente de PENDENTE (PENDENTE é a linha que a
      // régua cria no nascimento da admissão, não é coleta).
      docsColetados: raw<number>`(
        select count(*)::int from ${documentosAdmissao} d
        where d.admissao_id = ${admissoes.id} and d.estado <> 'PENDENTE'
      )`,
      arquivosMarcados: raw<number>`(
        select count(*)::int from ${documentoArquivosColetados} a
        where a.admissao_id = ${admissoes.id}
      )`,
    })
    .from(admissoes)
    .innerJoin(integracaoPandape, eq(integracaoPandape.admissaoId, admissoes.id))
    .where(
      and(
        inArray(admissoes.farolGlobal, [...FAROIS_VIVOS]),
        isNotNull(admissoes.codCliente),
        isNotNull(admissoes.cargoId),
        isNotNull(integracaoPandape.idPrecollaborator),
        admissaoFiltro ? eq(admissoes.id, admissaoFiltro) : ne(admissoes.id, raw`'00000000-0000-0000-0000-000000000000'::uuid`),
      ),
    )
    .orderBy(admissoes.criadoEm);

  return linhas.map((l) => ({
    admissaoId: l.admissaoId,
    idPrecollaborator: l.idPrecollaborator as string,
    caminho: (l.docsColetados > 0 ? "REPROCESSO" : "CARGA") as Caminho,
    docsColetados: l.docsColetados,
    arquivosMarcados: l.arquivosMarcados,
  }));
}

/**
 * Aguarda UM job terminar, lendo o estado no Redis. Devolve o `returnvalue` (o resumo do pull) quando
 * completa; lança quando falha ou quando estoura o tempo — e quem chama registra a admissão como
 * falha e SEGUE para a próxima (o lote nunca cai por causa de uma admissão).
 */
async function aguardarJob(queue: Queue, jobId: string): Promise<ResumoPull | undefined> {
  const limite = Date.now() + TIMEOUT_MS;
  for (;;) {
    const atual = await queue.getJob(jobId);
    if (!atual) throw new Error("job sumiu da fila antes de concluir");
    const estado = await atual.getState();
    if (estado === "completed") return atual.returnvalue as ResumoPull | undefined;
    if (estado === "failed") throw new Error(atual.failedReason ?? "job falhou");
    if (Date.now() > limite) throw new Error(`tempo esgotado (job segue no worker, estado=${estado})`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Imprime o resumo do relatório de um pull, já sem PII. */
function imprimirResumo(alvo: Alvo, resumo: ResumoPull | undefined, erro?: string): void {
  const cab = `[varredura] admissao=${alvo.admissaoId} caminho=${alvo.caminho}`;
  if (erro) {
    console.log(`${cab} FALHA: ${erro}`);
    return;
  }
  if (!resumo) {
    console.log(`${cab} sem retorno do worker (job pode ter sido descartado).`);
    return;
  }
  if (resumo.inerte) {
    console.log(`${cab} PANDAPE INERTE (sem credencial) — nada coletado.`);
    return;
  }
  console.log(`${cab} formularios=${resumo.formularios}`);
  for (const t of resumo.tipos) {
    const motivo = t.motivo ? ` motivo="${t.motivo}"` : "";
    console.log(
      `    ${t.codigo.padEnd(30)} acao=${t.acao.padEnd(18)} arquivos=${t.arquivos} ` +
        `novos=${t.novos} jaConhecidos=${t.jaConhecidos} estado=${t.estado ?? "-"}${motivo}`,
    );
  }
  if (resumo.semDestino.length > 0) {
    console.log(`    SEM DESTINO no de/para (nada perdido no Pandapé): ${resumo.semDestino.join(" | ")}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");
  const admissaoFiltro = arg("admissao");

  const { sql, db } = createDb(url, 1);
  const alvos = await planejar(db, admissaoFiltro);

  const carga = alvos.filter((a) => a.caminho === "CARGA");
  const reprocesso = alvos.filter((a) => a.caminho === "REPROCESSO");
  console.log(
    `[varredura] alvo: ${alvos.length} admissão(ões) viva(s) com origem Pandapé — ` +
      `CARGA=${carga.length} REPROCESSO=${reprocesso.length}${admissaoFiltro ? " (filtro por admissão)" : ""}`,
  );
  for (const a of alvos) {
    console.log(
      `    ${a.admissaoId} ${a.caminho.padEnd(11)} docsColetados=${a.docsColetados} arquivosMarcados=${a.arquivosMarcados}`,
    );
  }

  if (!aplicar) {
    console.log("[varredura] PLANO apenas (dry-run). Use --aplicar para enfileirar.");
    await sql.end();
    return;
  }
  if (alvos.length === 0) {
    console.log("[varredura] nada a fazer.");
    await sql.end();
    return;
  }

  // Enfileira na fila do backend (o worker de pé executa, sob o limiter). Sufixo no jobId para não
  // colidir com o `pull-<admissao>` que a liberação já gravou no histórico do BullMQ.
  const lote = `v${Date.now()}`;
  const host = process.env.REDIS_HOST ?? "127.0.0.1";
  const port = Number(process.env.REDIS_PORT ?? 6380);
  const connection = criarConexaoRedis(host, port);
  connection.on("error", (e) => console.error(`[varredura] Redis: ${e.message}`));
  const queue = new Queue(PANDAPE_QUEUE, { connection, ...PANDAPE_QUEUE_OPTIONS });

  const jobs: Array<{ alvo: Alvo; job: Job }> = [];
  for (const alvo of alvos) {
    const job = await queue.add(
      JOB_PULL_DOCS,
      {
        admissaoId: alvo.admissaoId,
        idPrecollaborator: alvo.idPrecollaborator,
        // Só o REPROCESSO derruba a trava por tipo. A CARGA não precisa (não há nada gravado).
        ...(alvo.caminho === "REPROCESSO" ? { reprocessar: true } : {}),
      } satisfies PullDocsJobData,
      { jobId: `pull-${alvo.admissaoId}-${lote}` },
    );
    jobs.push({ alvo, job });
  }
  console.log(`[varredura] ${jobs.length} job(s) enfileirado(s) no lote ${lote}. Acompanhando...`);

  // Acompanha cada job isoladamente, por POLLING do estado (e não por QueueEvents: o stream de
  // eventos depende de conexão bloqueante própria e já deixou o acompanhamento pendurado com o job
  // JÁ concluído — o estado no Redis é a fonte confiável). Falha numa admissão NÃO derruba o lote.
  const falhas: string[] = [];
  for (const { alvo, job } of jobs) {
    try {
      const resultado = await aguardarJob(queue, job.id as string);
      imprimirResumo(alvo, resultado);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro";
      imprimirResumo(alvo, undefined, msg);
      falhas.push(`${alvo.admissaoId}: ${msg}`);
    }
  }

  console.log(
    `[varredura] concluído. ok=${jobs.length - falhas.length} falhas=${falhas.length}`,
  );
  for (const f of falhas) console.log(`    FALHA ${f}`);

  await queue.close();
  await connection.quit().catch(() => undefined);
  await sql.end();
}

main().catch((e) => {
  console.error("[varredura] ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
