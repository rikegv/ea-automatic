import "dotenv/config";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { and, eq, isNull } from "drizzle-orm";
import { AiModule } from "../ai/ai.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { DrizzleModule } from "./drizzle.module";
import { createDb } from "./client";
import { admissoes, naoConformidades } from "./schema";

/**
 * CRIA O PRONTUÁRIO QUE NUNCA NASCEU nas admissões concluídas com a Auditoria fechada À MÃO.
 *
 * O QUE ACONTECEU, medido. Fechar a frente de Auditoria pela esteira com documento obrigatório
 * PENDENTE conclui a frente de verdade e abre o resto do fluxo, mas o arquivamento no Drive só
 * dispara quando a régua fecha (o gatilho mora dentro do "régua completa", no pós-veredito). Essas
 * admissões terminaram concluídas, sem pasta no Drive, sem falha registrada e sem sinal em tela
 * nenhuma. A NC1 (Auditoria concluída com obrigatórios pendentes) é a marca deixada por esse
 * caminho, e é por ela que o alvo se define.
 *
 * ALVO: farol ADMISSAO_CONCLUIDA, origem PANDAPE, `drive_pasta_url` nulo e NC de tipo NC1.
 *
 * NÃO É EDIÇÃO MANUAL DE DADO. Sobe o contexto do Nest e chama `criarProntuarioSobDemanda`, o mesmo
 * método da ação do Diagnóstico. Quem decide o que sobe e o que gravar é o código de produção; o
 * runner só escolhe EM QUAIS admissões ele roda.
 *
 * ANTI DUPLICAÇÃO, EM TRÊS CAMADAS:
 *  1. quem já tem pasta é PULADO, e a leitura é POR ADMISSÃO, dentro do laço: o próprio
 *     `criarProntuarioSobDemanda` recarrega a admissão antes de decidir, então a lista carregada no
 *     início nunca é a fonte da decisão (e devolve `jaExistia`, que aqui vira "pulada");
 *  2. trava por admissão e âncora pelo link, dentro do arquivamento;
 *  3. consequência das duas: rodar DUAS VEZES seguidas não cria duas pastas.
 *
 * PRESERVA OS ARQUIVOS: a régua dessas admissões está aberta, então a staging NÃO é expurgada
 * (decisão do diretor). O binário que ainda vai ser auditado continua onde está.
 *
 * Uso:  pnpm db:cria-prontuario-nc1 [--aplicar] [--admissao=<uuid>]
 * Sem `--aplicar` só lista o que tentaria. §A.6: relatório por id de admissão e contagem, nunca
 * nome, CPF ou URL externa.
 */

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DrizzleModule, AiModule, AuditoriaModule],
})
class CriaProntuarioModule {}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const aplicar = process.argv.includes("--aplicar");
  const alvo = process.argv.find((a) => a.startsWith("--admissao="))?.split("=")[1];

  const { sql, db } = createDb(url, 1);
  let candidatas: Array<{ id: string }> = [];
  try {
    candidatas = await db
      .selectDistinct({ id: admissoes.id })
      .from(admissoes)
      // A NC1 é o que separa "concluída sem pasta" de "concluída sem pasta POR ESTE motivo": ela só
      // nasce quando alguém conclui a Auditoria com obrigatório pendente.
      .innerJoin(
        naoConformidades,
        and(eq(naoConformidades.admissaoId, admissoes.id), eq(naoConformidades.tipo, "NC1")),
      )
      .where(
        and(
          eq(admissoes.farolGlobal, "ADMISSAO_CONCLUIDA"),
          eq(admissoes.origem, "PANDAPE"),
          isNull(admissoes.drivePastaUrl),
          ...(alvo ? [eq(admissoes.id, alvo)] : []),
        ),
      );
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(`Admissões alvo (concluída, Pandapé, sem pasta, com NC1): ${candidatas.length}`);
  if (candidatas.length === 0 || !aplicar) {
    console.log(aplicar ? "Nada a fazer." : "Simulação. Rode com --aplicar para criar os prontuários.");
    return;
  }

  // `log` incluído de propósito: é o nível em que o `AuditoriaService` reporta o resultado do envio
  // ("enviados=N, ignorados por já existirem=M, pasta reutilizada=..."), que é a prova do que subiu.
  const app = await NestFactory.createApplicationContext(CriaProntuarioModule, {
    logger: ["log", "warn", "error"],
  });
  try {
    const auditoria = app.get(AuditoriaService);
    let criadas = 0;
    let puladas = 0;
    const falhas: Array<{ id: string; motivo: string }> = [];
    for (const a of candidatas) {
      try {
        // AUTOR NULO: quem roda aqui é o sistema, e a trilha (`candidato_alteracoes_log`) já prevê
        // ação sem autor humano. Não se inventa um usuário para carimbar o registro.
        const r = await auditoria.criarProntuarioSobDemanda(a.id, null);
        if (r.jaExistia) {
          puladas += 1;
          console.log(`  [pulada, já tinha pasta] admissão ${a.id}`);
        } else if (r.ok) {
          criadas += 1;
          console.log(
            `  [criada] admissão ${a.id}${r.motivo ? ` (prontuário incompleto: ${r.motivo})` : ""}`,
          );
        } else {
          falhas.push({ id: a.id, motivo: r.motivo ?? "sem motivo" });
          console.log(`  [falhou] admissão ${a.id}: ${r.motivo ?? "sem motivo"}`);
        }
      } catch (e) {
        const motivo = e instanceof Error ? e.message : "erro";
        falhas.push({ id: a.id, motivo });
        console.log(`  [erro] admissão ${a.id}: ${motivo}`);
      }
    }
    console.log(
      `\nResumo: ${criadas} criada(s), ${puladas} pulada(s) por já terem pasta, ` +
        `${falhas.length} com falha.`,
    );
    for (const f of falhas) console.log(`  falha: admissão ${f.id}, motivo: ${f.motivo}`);
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
