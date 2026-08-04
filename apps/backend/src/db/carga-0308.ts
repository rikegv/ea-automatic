import "reflect-metadata";
import "dotenv/config";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes, exameAgendamento } from "./schema";
import { AdmissoesService } from "../admissoes/admissoes.service";
import { aplicarRegrasImportacao } from "./regras-esteira-import";
import { aplicarRegrasVivas } from "./regras-esteira-vivas";
import { inserirDeclinioProvisorio, reconciliarProvisorio } from "./carga-provisorio";
import {
  derivarCpfProvisorio,
  podeReceberIdentidadeProvisoria,
} from "../domain/identidade-provisoria";
import { candidatos } from "./schema";
import { normalizeCpf, type FarolGlobal } from "@ea/shared-types";

/**
 * Carga da base de 03-08-2026 (aba ESTEIRA DE ADMISSÃO).
 *
 * Runner PRÓPRIO, e não uma alteração do `carga-frente1.ts` (§A.26): aquele é código validado, com a
 * carga de julho no histórico, e esta carga precisa de uma dedup mais dura e de estados de esteira
 * que ele não conhece. Nada lá foi tocado.
 *
 * DEDUP EM ESCADA. A chave de julho, sozinha, deixava passar duplicata em três cenários reais:
 *   1. EXATA: cpf + cod_cliente + cargo_id + data_admissao. A chave de sempre.
 *   2. DATA CORRIGIDA: a mesma pessoa, mesmo cliente e cargo, já no banco SEM data de admissão. A
 *      base de agosto preencheu a data que faltava em julho; pela chave exata isso viraria uma
 *      admissão nova.
 *   3. JÁ NA ESTEIRA ou VINDA DO PANDAPÉ: a chave da carga e a do webhook são cegas entre si (o
 *      webhook deduplica por `id_precollaborator`, que a carga não grava). Se a pessoa já tem
 *      admissão VIVA naquele cliente, ou qualquer admissão de origem PANDAPE, não se reimporta.
 *   4. NOME + NASCIMENTO + CLIENTE: rede de segurança para quem está no banco sob CPF diferente
 *      (digitação errada numa das duas pontas). Os casos que caem aqui saem listados em arquivo.
 *
 * NADA do que já está na plataforma é alterado: ao bater a dedup o runner PULA, e não corrige farol,
 * data nem matrícula da admissão existente. O `carga-frente1.ts` corrigia o farol; aqui isso seria
 * exatamente "alterar quem já está na plataforma".
 *
 * Ao final aplica a §A.16 (Regras 1 e 2, globais por farol, função validada e intocada) e a Regra 3
 * (`regras-esteira-vivas.ts`, escopada nos ids desta carga).
 *
 * §A.6: nenhum CPF ou nome em log. O console só recebe número de linha e contagem; os relatórios
 * nominais vão para arquivo com permissão restrita.
 */
const CSV_PATH = process.env.CARGA_CSV ?? "";
const DRY = process.env.CARGA_DRY === "1";
const REL_DIR = process.env.CARGA_REL_DIR ?? "/home/henrique/carga-03-08-2026";
/** Trava de segurança: acima disto o runner PARA em vez de subir (ver relatório da OST). */
const MAX_CREATED = Number(process.env.CARGA_MAX_CREATED ?? 600);
const MAX_CONSECUTIVE_FAIL = 25;

type Row = Record<string, string>;
const u = (v: string) => (v && v.trim() !== "" ? v : undefined);

const FAROL_VIVO: FarolGlobal[] = ["EM_ADMISSAO", "BANCO_AGUARDAR", "AGUARDANDO_LIBERACAO"];

async function main() {
  if (!CSV_PATH) throw new Error("CARGA_CSV não definido");
  const rows: Row[] = parse(readFileSync(CSV_PATH, "utf8"), {
    columns: true,
    skip_empty_lines: true,
  });
  console.log(`[carga] ${rows.length} linhas para processar${DRY ? " (DRY-RUN)" : ""}`);

  const { sql, db } = createDb(process.env.DATABASE_URL!, 5);
  const svc = new AdmissoesService(db);

  let created = 0;
  let consecutiveFail = 0;
  const dup = {
    exata: 0, dataCorrigida: 0, esteiraViva: 0, pandape: 0, nomeNascimento: 0,
    provisorioJaExiste: 0,
  };
  let provisoriosCriados = 0;
  let reconciliados = 0;
  const failures: { linha: string; motivo: string }[] = [];
  const farolCount: Record<string, number> = {};
  const estadoCount: Record<string, number> = {};
  const criados: { cadastrar: string[]; docOk: string[] } = { cadastrar: [], docOk: [] };
  // Relatórios nominais (PII) — arquivo, nunca log.
  const relNomeNasc: string[] = ["linha,nome,motivo"];
  const relCriados: string[] = ["linha,nome,cliente,farol,estado"];
  const relProvisorios: string[] = ["linha,nome,cliente,farol,cpf_provisorio"];
  const relReconciliados: string[] = ["linha,nome,cpf_provisorio,admissoes_repontadas"];

  try {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const farol = r.farol as FarolGlobal;
      const estado = r.estadoEsteira;
      const data = u(r.dataAdmissao);
      const cpf = normalizeCpf(r.cpf);

      try {
        // ── 0. CAMINHO DA IDENTIDADE PROVISÓRIA (Opção 1a) ──────────────
        // Declínio sem CPF aproveitável. O identificador é DERIVADO de nome + cliente + data, então
        // repetir a carga cai no mesmo `cpf` e a dedup abaixo reconhece o registro.
        if (r.identidade === "PROVISORIO") {
          if (!podeReceberIdentidadeProvisoria(farol, r.cpf)) {
            throw new Error(
              `identidade provisória recusada pelo domínio (farol=${farol}). Só declínio entra por aqui.`,
            );
          }
          const cpfProv = derivarCpfProvisorio(r.nome, r.codCliente, data);
          const jaExiste = await db.query.admissoes.findFirst({
            where: and(
              eq(admissoes.candidatoCpf, cpfProv),
              eq(admissoes.codCliente, r.codCliente),
              eq(admissoes.cargoId, r.cargoId),
              data ? eq(admissoes.dataAdmissao, data) : isNull(admissoes.dataAdmissao),
            ),
          });
          if (jaExiste) {
            dup.provisorioJaExiste++;
            consecutiveFail = 0;
            continue;
          }
          if (!DRY) {
            await inserirDeclinioProvisorio(sql, {
              linha: r.linha,
              nome: r.nome,
              email: u(r.email),
              telefone: u(r.telefone),
              dataNascimento: u(r.dataNascimento),
              codCliente: r.codCliente,
              cargoId: r.cargoId,
              dataAdmissao: data,
              tipoContrato: u(r.tipoContrato),
              matricula: u(r.matricula),
              farol,
              salario: u(r.salario),
              beneficios: u(r.beneficios),
              escala: u(r.escala),
              centroCusto: u(r.centroCusto),
              departamento: u(r.departamento),
              gestorBp: u(r.gestorBp),
              motivo: u(r.motivo),
              tempoContrato: u(r.tempoContrato),
              endereco: u(r.endereco),
            });
            relProvisorios.push(`${r.linha},"${r.nome}","${r.codCliente}",${farol},${cpfProv}`);
          }
          created++;
          provisoriosCriados++;
          farolCount[farol] = (farolCount[farol] ?? 0) + 1;
          estadoCount[estado] = (estadoCount[estado] ?? 0) + 1;
          consecutiveFail = 0;
          if (created > MAX_CREATED) {
            throw new Error(
              `TRAVA: ${created} criações passam do teto de ${MAX_CREATED}. ` +
                `A dedup provavelmente falhou. Nada mais será criado.`,
            );
          }
          continue;
        }

        // ── 0.1 RECONCILIAÇÃO: o CPF real chegou para quem já é provisório ──
        // Deriva o mesmo identificador dos mesmos três campos e procura por CHAVE PRIMÁRIA. Achando,
        // TROCA o provisório pelo CPF real em vez de criar uma segunda admissão da mesma pessoa.
        const cpfProvDaLinha = derivarCpfProvisorio(r.nome, r.codCliente, data);
        const provExistente = await db.query.candidatos.findFirst({
          where: eq(candidatos.cpf, cpfProvDaLinha),
        });
        if (provExistente) {
          if (!DRY) {
            const movidas = await reconciliarProvisorio(sql, {
              cpfProvisorio: cpfProvDaLinha,
              cpfReal: cpf,
              nome: r.nome,
              email: u(r.email),
              telefone: u(r.telefone),
              dataNascimento: u(r.dataNascimento),
            });
            relReconciliados.push(`${r.linha},"${r.nome}",${cpfProvDaLinha},${movidas}`);
          }
          reconciliados++;
          consecutiveFail = 0;
          continue;
        }

        // ── 1. dedup EXATA ──────────────────────────────────────────────
        const exata = await db.query.admissoes.findFirst({
          where: and(
            eq(admissoes.candidatoCpf, cpf),
            eq(admissoes.codCliente, r.codCliente),
            eq(admissoes.cargoId, r.cargoId),
            data ? eq(admissoes.dataAdmissao, data) : isNull(admissoes.dataAdmissao),
          ),
        });
        if (exata) {
          dup.exata++;
          consecutiveFail = 0;
          continue;
        }

        // ── 2. dedup por DATA CORRIGIDA ─────────────────────────────────
        if (data) {
          const semData = await db.query.admissoes.findFirst({
            where: and(
              eq(admissoes.candidatoCpf, cpf),
              eq(admissoes.codCliente, r.codCliente),
              eq(admissoes.cargoId, r.cargoId),
              isNull(admissoes.dataAdmissao),
            ),
          });
          if (semData) {
            dup.dataCorrigida++;
            consecutiveFail = 0;
            continue;
          }
        }

        // ── 3. dedup por ESTEIRA VIVA ou origem PANDAPE ─────────────────
        const naEsteira = await db.query.admissoes.findFirst({
          where: and(
            eq(admissoes.candidatoCpf, cpf),
            eq(admissoes.codCliente, r.codCliente),
            or(inArray(admissoes.farolGlobal, FAROL_VIVO), eq(admissoes.origem, "PANDAPE")),
          ),
        });
        if (naEsteira) {
          if (naEsteira.origem === "PANDAPE") dup.pandape++;
          else dup.esteiraViva++;
          consecutiveFail = 0;
          continue;
        }

        // ── 4. dedup por NOME + NASCIMENTO + CLIENTE (CPF divergente) ───
        if (r.dataNascimento) {
          // Nome comparado em caixa alta com espaços colapsados. Os dois lados vêm da MESMA
          // planilha (o banco recebeu a carga de julho), então a grafia é a mesma.
          const porNome = await sql`
            SELECT a.id FROM admissoes a
            JOIN candidatos c ON c.cpf = a.candidato_cpf
            WHERE upper(regexp_replace(btrim(c.nome), '\\s+', ' ', 'g'))
                = upper(regexp_replace(btrim(${r.nome}), '\\s+', ' ', 'g'))
              AND c.data_nascimento = ${r.dataNascimento}::date
              AND a.cod_cliente = ${r.codCliente}
              AND c.cpf <> ${cpf}
            LIMIT 1`;
          if (porNome.length > 0) {
            dup.nomeNascimento++;
            relNomeNasc.push(
              `${r.linha},"${r.nome}",casou por nome+nascimento+cliente com CPF diferente`,
            );
            consecutiveFail = 0;
            continue;
          }
        }

        // ── criação ─────────────────────────────────────────────────────
        if (!DRY) {
          const res = await svc.create(
            {
              codCliente: r.codCliente,
              cargoId: r.cargoId,
              candidato: {
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
          await db
            .update(admissoes)
            .set({ farolGlobal: farol, matricula: u(r.matricula) ?? null })
            .where(eq(admissoes.id, res.admissaoId));

          // Agendamento do exame, quando a linha trouxe clínica, data ou hora. A frente só vai a
          // AGENDADO na Regra 3, e só quando há DATA (regras-esteira-vivas.ts).
          if (u(r.exameData) || u(r.exameHora) || u(r.exameClinica)) {
            await db
              .insert(exameAgendamento)
              .values({
                admissaoId: res.admissaoId,
                data: u(r.exameData) ?? null,
                horario: u(r.exameHora) ?? null,
                nomeClinica: u(r.exameClinica) ?? null,
                previsaoAso: u(r.examePrevisao) ?? null,
                valor: u(r.exameValor) ?? null,
              })
              .onConflictDoNothing({ target: exameAgendamento.admissaoId });
          }

          if (estado === "CADASTRAR") criados.cadastrar.push(res.admissaoId);
          if (estado === "DOC_OK") criados.docOk.push(res.admissaoId);
          relCriados.push(`${r.linha},"${r.nome}","${r.codCliente}",${farol},${estado}`);
        }
        created++;
        farolCount[farol] = (farolCount[farol] ?? 0) + 1;
        estadoCount[estado] = (estadoCount[estado] ?? 0) + 1;
        consecutiveFail = 0;

        // TRAVA: criação muito acima do esperado significa dedup furada. Para antes de sujar a base.
        if (created > MAX_CREATED) {
          throw new Error(
            `TRAVA: ${created} criações passam do teto de ${MAX_CREATED}. ` +
              `A dedup provavelmente falhou. Nada mais será criado.`,
          );
        }
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        if (motivo.startsWith("TRAVA:")) throw err;
        consecutiveFail++;
        failures.push({ linha: r.linha, motivo });
        console.error(`[carga] FALHA linha ${r.linha}: ${motivo}`);
        if (consecutiveFail >= MAX_CONSECUTIVE_FAIL) {
          console.error(`[carga] PARANDO: ${consecutiveFail} falhas consecutivas.`);
          break;
        }
      }
      if ((i + 1) % 250 === 0)
        console.log(`[carga] progresso ${i + 1}/${rows.length} | criadas=${created}`);
    }

    // ── regras de importação ──────────────────────────────────────────
    if (!DRY) {
      // §A.16, Regras 1 e 2. Função VALIDADA e INTOCADA, global por farol e idempotente.
      await aplicarRegrasImportacao(sql);
      console.log("[carga] §A.16 aplicada (Regras 1 e 2).");
      // Regra 3, escopada só nos ids criados agora.
      await aplicarRegrasVivas(sql, criados);
      console.log(
        `[carga] Regra 3 aplicada (CADASTRAR=${criados.cadastrar.length}, DOC_OK=${criados.docOk.length}).`,
      );
    }
  } finally {
    if (!DRY) {
      writeFileSync(`${REL_DIR}/CRIADAS_0308.csv`, relCriados.join("\n"), { mode: 0o600 });
    }
    if (relProvisorios.length > 1) {
      writeFileSync(`${REL_DIR}/PROVISORIOS_0308.csv`, relProvisorios.join("\n"), { mode: 0o600 });
    }
    if (relReconciliados.length > 1) {
      writeFileSync(`${REL_DIR}/RECONCILIADOS_0308.csv`, relReconciliados.join("\n"), {
        mode: 0o600,
      });
    }
    if (relNomeNasc.length > 1) {
      writeFileSync(`${REL_DIR}/DEDUP_NOME_NASCIMENTO_0308.csv`, relNomeNasc.join("\n"), {
        mode: 0o600,
      });
    }
    const dupTotal = Object.values(dup).reduce((a, b) => a + b, 0);
    const resumo = {
      modo: DRY ? "DRY-RUN" : "REAL",
      linhas: rows.length,
      created,
      provisoriosCriados,
      reconciliados,
      dupSkipped: dupTotal,
      dupPorRegra: dup,
      farolCount,
      estadoCount,
      failuresCount: failures.length,
    };
    console.log("\n===== RESULTADO CARGA 03-08 =====");
    console.log(JSON.stringify(resumo, null, 2));
    if (failures.length) console.log("FALHAS:", JSON.stringify(failures.slice(0, 40), null, 1));
    appendFileSync(`${REL_DIR}/RESULTADO_0308.log`, JSON.stringify(resumo) + "\n");
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
