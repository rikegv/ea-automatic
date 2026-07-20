import "reflect-metadata";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { and, eq, isNull } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes } from "./schema";
import { AdmissoesService } from "../admissoes/admissoes.service";
import { aplicarRegrasImportacao } from "./regras-esteira-import";
import { normalizeCpf, type FarolGlobal } from "@ea/shared-types";

/**
 * Carga Frente 1 (Fase B) — cria as admissões históricas da aba ESTEIRA DE ADMISSÃO.
 * Fonte normalizada: frente1_ok.csv (gerado por normalize.py fora do repo).
 * Cria via AdmissoesService.create (bypassAceite, origem MANUAL). SEM Drive, SEM integração Pandapé.
 * Idempotente: dedup por (cpf + cod_cliente + cargo_id + data_admissao); rodar 2x não duplica.
 * §A.6: nada de CPF/PII em log (só número de linha da planilha).
 */
const CSV_PATH = process.env.CARGA_CSV ?? "";
const DRY = process.env.CARGA_DRY === "1";
const MAX_CONSECUTIVE_FAIL = 25;

type Row = Record<string, string>;
const u = (v: string) => (v && v.trim() !== "" ? v : undefined);

async function main() {
  if (!CSV_PATH) throw new Error("CARGA_CSV não definido");
  const rows: Row[] = parse(readFileSync(CSV_PATH, "utf8"), {
    columns: true,
    skip_empty_lines: true,
  });
  console.log(`[carga] ${rows.length} linhas OK para processar${DRY ? " (DRY-RUN)" : ""}`);

  const { sql, db } = createDb(process.env.DATABASE_URL!, 5);
  const svc = new AdmissoesService(db);

  let created = 0;
  let dupSkipped = 0;
  let farolRepaired = 0;
  let consecutiveFail = 0;
  const failures: { linha: string; motivo: string }[] = [];
  const farolCount: Record<string, number> = {};

  try {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const farol = r.farol as FarolGlobal;
      const data = u(r.dataAdmissao);
      // Matrícula (MATR. do relatório): preservada na carga. O `create` não recebe matrícula (é
      // preenchida por edição), então grava-se no MESMO update pós-create que fixa o farol.
      const matricula = u(r.matricula);
      // FURO 2 (corrigido): o `create` grava o CPF NORMALIZADO (`normalizeCpf`), então o dedup tem de
      // comparar normalizado dos dois lados. Comparando o CPF cru do CSV, um extrato com pontuação
      // ("123.456.789-00") nunca casaria com o gravado ("12345678900") e DUPLICARIA 100% das linhas,
      // enquanto o candidato deduplicava calado pela PK. Não depender do normalize.py externo.
      const cpf = normalizeCpf(r.cpf);
      try {
        // dedup (idempotência) — chave definida pelo diretor.
        const existing = await db.query.admissoes.findFirst({
          where: and(
            eq(admissoes.candidatoCpf, cpf),
            eq(admissoes.codCliente, r.codCliente),
            eq(admissoes.cargoId, r.cargoId),
            // FURO 1 (corrigido): sem data, era `eq(dataAdmissao, dataAdmissao)`, que em SQL vira
            // `data_admissao = data_admissao` → com NULL devolve NULL, nunca TRUE. A linha jamais
            // casava e ganhava uma admissão NOVA a cada rodada. `isNull` casa de verdade. Atinge
            // admissão de banco, que legitimamente não tem data.
            data ? eq(admissoes.dataAdmissao, data) : isNull(admissoes.dataAdmissao),
          ),
        });
        if (existing) {
          // auto-repair do farol (caso uma execução anterior tenha criado mas não setado o farol).
          if (existing.farolGlobal !== farol) {
            if (!DRY) {
              await db
                .update(admissoes)
                .set({ farolGlobal: farol })
                .where(eq(admissoes.id, existing.id));
            }
            farolRepaired++;
          }
          dupSkipped++;
          consecutiveFail = 0;
          continue;
        }

        if (!DRY) {
          const res = await svc.create(
            {
              codCliente: r.codCliente,
              cargoId: r.cargoId,
              candidato: {
                // Já normalizado: o `create` re-normaliza (idempotente), mas passar o mesmo valor
                // que o dedup comparou evita qualquer divergência entre checar e gravar.
                cpf,
                nome: r.nome,
                email: u(r.email),
                telefone: u(r.telefone),
                dataNascimento: u(r.dataNascimento),
              },
              dataAdmissao: data,
              tipoContrato: u(r.tipoContrato),
              vagaFolha: {
                salario: u(r.salario),
                beneficios: u(r.beneficios),
                escala: u(r.escala),
                centroCusto: u(r.centroCusto),
                departamento: u(r.departamento),
                gestorBp: u(r.gestorBp),
                motivo: u(r.motivo),
                tempoContrato: u(r.tempoContrato),
                endereco: u(r.endereco),
              },
            },
            undefined,
            { origem: "MANUAL", bypassAceite: true },
          );
          // farol de destino (ATIVO -> ADMISSAO_CONCLUIDA; declínios -> DECLINOU). create() nasce EM_ADMISSAO.
          // No mesmo update, grava a matrícula (MATR. do relatório); vazia vira null.
          await db
            .update(admissoes)
            .set({ farolGlobal: farol, matricula: matricula ?? null })
            .where(eq(admissoes.id, res.admissaoId));
        }
        created++;
        farolCount[farol] = (farolCount[farol] ?? 0) + 1;
        consecutiveFail = 0;
      } catch (err) {
        consecutiveFail++;
        const motivo = err instanceof Error ? err.message : String(err);
        failures.push({ linha: r.linha, motivo });
        console.error(`[carga] FALHA linha ${r.linha}: ${motivo}`);
        if (consecutiveFail >= MAX_CONSECUTIVE_FAIL) {
          console.error(
            `[carga] PARANDO: ${consecutiveFail} falhas consecutivas (circuit breaker).`,
          );
          break;
        }
      }
      if ((i + 1) % 250 === 0)
        console.log(`[carga] progresso ${i + 1}/${rows.length} | criadas=${created}`);
    }
  } finally {
    // REGRAS PERMANENTES DE IMPORTAÇÃO (CLAUDE.md §A.16): aplica automaticamente, ao final de toda
    // carga, o estado-alvo por farol (concluídas com tudo concluído; declínios encerrados fora das
    // filas). Idempotente. Sem isto, as admissões nasceriam com as frentes em estado inicial e não
    // refletiriam a esteira importada.
    if (!DRY) {
      await aplicarRegrasImportacao(sql);
      console.log("[carga] regras permanentes de importação aplicadas (§A.16).");
    }
    console.log("\n===== RESULTADO CARGA FRENTE 1 =====");
    console.log(
      JSON.stringify(
        { created, dupSkipped, farolRepaired, farolCount, failuresCount: failures.length },
        null,
        2,
      ),
    );
    if (failures.length) console.log("FALHAS:", JSON.stringify(failures, null, 1));
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
