import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createDb } from "../../db/client";
import { conferirDatabase } from "./arnes-lote-fabricado";

/**
 * ─ LIMPEZA DA HOMOLOGAÇÃO: zera a esteira A&S e as admissões de TESTE, deixando a carga intacta ──
 *
 * ┌─ O QUE ELE FAZ, E O QUE ELE NÃO ENCOSTA ──────────────────────────────────────────────────────┐
 * │ APAGA (base limpa para o time testar o fluxo completo):                                         │
 * │   GRUPO A, a esteira A&S inteira (é 100% sintética na homologação, veto do `seguranca` sobre    │
 * │            dado real): vagas, as_candidatos, as_candidaturas, as_identidades_externas e todos    │
 * │            os filhos deles (etapas, contatos, conflitos, retenção, status-eventos, varredura,    │
 * │            vaga_beneficio, vaga_cliente_correcoes, vaga_meta_reducoes).                          │
 * │   GRUPO B, as admissões de TESTE do ADM e o que pende delas. O CONJUNTO É DEFINIDO, não          │
 * │            adivinhado: admissao alcançada por `as_candidaturas.admissao_id` (a ponte A&S→ADM)    │
 * │            OU da família ARNES/SIM (candidato com CPF `999...` ou nome `SIMULADO`/`ARNES`).       │
 * │            Dependentes por `admissao_id`: frentes, documentos, dados_vaga_folha,                 │
 * │            admissao_beneficio, sala_espera e portal_* (links, credenciais, pendências, eventos). │
 * │                                                                                                  │
 * │ NÃO ENCOSTA:                                                                                     │
 * │   - a carga anonimizada (2.7k admissões `Candidato NNN Homolog`) e seus candidatos reais;        │
 * │   - os CATÁLOGOS A&S (as_vaga_status, as_etapas_funil, as_depara_etapa_externa, as_segmentos,    │
 * │     as_comerciais, as_cidades, as_linhas_servico) — são configuração, não dado de esteira;       │
 * │   - portal_* e sala_espera de admissão que NÃO é de teste.                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRAVAS (as mesmas do arnês) ──────────────────────────────────────────────────────────────┐
 * │ 1. FAIL-CLOSED POR NOME DE DATABASE. `conferirDatabase` só deixa passar                          │
 * │    `ea_automatic_(homolog|arnes|ensaio|teste)...`. `ea_automatic` (produção) é RECUSADO, e nome  │
 * │    desconhecido também: allowlist, nunca denylist.                                               │
 * │ 2. BACKUP ANTES, OU NÃO APAGA. Faz um dump `--data-only` (gzip) da esteira A&S no scratchpad     │
 * │    ANTES de qualquer DELETE. Falhou o dump, o script LANÇA e nada é tocado.                      │
 * │ 3. TRANSACIONAL E IDEMPOTENTE. Um `BEGIN` só; re-rodar sobre uma base já limpa apaga 0 linhas.   │
 * │ 4. NÃO RODA SOZINHO. Não é módulo, não é rota, não é importado; `main()` só dispara via          │
 * │    `require.main === module`. O nome não casa com o padrão do vitest.                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMO SE RODA (da raiz do repositório):
 *   DATABASE_URL='postgres://ea:...@127.0.0.1:5433/ea_automatic_homolog' \
 *     BACKUP_DIR='/caminho/scratchpad' \
 *     apps/backend/node_modules/.bin/tsx apps/backend/src/as/ingestao-pandape/arnes-limpeza-homolog.ts
 *
 * §A.6: o script opera só por status/marca e por `admissao_id`. Nenhum CPF, nome ou e-mail sai no
 * log. O dump é da esteira A&S (sintética) e fica fora do banco, no scratchpad, com aviso de homolog.
 */

// ══ AS MARCAS DA FAMÍLIA DE TESTE ══════════════════════════════════════════════════════════════
// Um candidato do ADM é de TESTE quando seu CPF é da faixa sintética `999...` (o arnês/seed emite
// CPF válido nessa faixa) ou quando o nome carrega a palavra `SIMULADO`/`ARNES`. A carga anonimizada
// usa CPF `200001...` e nome `Candidato NNN Homolog`, então NÃO casa com nenhuma das três marcas.
const MARCA_CPF = "999%";

// ══ AS TABELAS DA ESTEIRA A&S (grupo A), EM ORDEM DE FK (filho antes do pai) ════════════════════
// Catálogos (as_vaga_status, as_etapas_funil, as_depara_*, as_segmentos, as_comerciais, as_cidades,
// as_linhas_servico) NÃO entram: são configuração e a esteira nova precisa deles de pé.
const TABELAS_A_S: string[] = [
  "as_candidatura_etapas",
  "as_contatos",
  "as_identidades_externas",
  "as_ingestao_conflitos",
  "as_retencao_eventos",
  "as_candidaturas",
  "as_vaga_status_eventos",
  "as_varredura_vagas",
  "vaga_beneficio",
  "vaga_cliente_correcoes",
  "vaga_meta_reducoes",
  "vagas",
  "as_candidatos",
];

// As tabelas cujas contagens o relatório mostra (antes/depois).
const TABELAS_RELATORIO: string[] = [
  ...TABELAS_A_S,
  "admissoes",
  "frentes_admissao",
  "documentos_admissao",
  "dados_vaga_folha",
  "admissao_beneficio",
  "sala_espera",
  "portal_links",
  "portal_credenciais",
  "portal_pendencias_no_time",
  "portal_eventos",
];

type Sql = ReturnType<typeof createDb>["sql"];

async function contarTudo(sql: Sql): Promise<Record<string, number>> {
  const contagem: Record<string, number> = {};
  for (const t of TABELAS_RELATORIO) {
    const linhas = await sql.unsafe(`select count(*)::int as n from ${t}`);
    contagem[t] = (linhas[0] as unknown as { n: number }).n;
  }
  return contagem;
}

/**
 * O DUMP DA ESTEIRA A&S, via `pg_dump` DENTRO do container do Postgres (o host não tem o binário).
 * `--data-only` das tabelas do grupo A, gzip, no `BACKUP_DIR`. LANÇA se o arquivo não nascer.
 * O container e o usuário são configuráveis por env; o default é o `ea-db` deste ambiente.
 */
function fazerBackup(nomeDoBanco: string, backupDir: string): string {
  mkdirSync(backupDir, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
  const destino = join(backupDir, `homolog-esteira-as-${carimbo}.sql.gz`);
  const container = process.env.PG_DOCKER_CONTAINER ?? "ea-db";
  const usuario = process.env.PGUSER ?? "ea";
  const senha = process.env.PGPASSWORD ?? "ea";
  const tabelas = TABELAS_A_S.flatMap((t) => ["-t", t]);
  // stdout do pg_dump (dentro do container) redirecionado para gzip e para o arquivo no host.
  const args = [
    "exec",
    "-e",
    `PGPASSWORD=${senha}`,
    container,
    "bash",
    "-lc",
    `pg_dump -U ${usuario} -d ${nomeDoBanco} --data-only ${tabelas.join(" ")} | gzip -c`,
  ];
  const gz = execFileSync("docker", args, { maxBuffer: 512 * 1024 * 1024 });
  require("node:fs").writeFileSync(destino, gz);
  if (!existsSync(destino) || statSync(destino).size === 0) {
    throw new Error(`Backup falhou: ${destino} não nasceu ou está vazio. Nada foi apagado.`);
  }
  return destino;
}

async function main(): Promise<void> {
  const nomeDoBanco = conferirDatabase(process.env.DATABASE_URL);
  const backupDir = process.env.BACKUP_DIR ?? join(process.cwd(), "scratchpad-backups");
  console.log(`[limpeza] database: ${nomeDoBanco} (allowlist conferida)`);

  const { sql } = createDb(process.env.DATABASE_URL as string, 1);
  try {
    const antes = await contarTudo(sql);

    // ── TRAVA 2: backup ANTES de qualquer escrita. Falhou, o catch lá embaixo aborta sem tocar nada.
    const arquivoBackup = fazerBackup(nomeDoBanco, backupDir);
    console.log(`[limpeza] backup da esteira A&S: ${arquivoBackup}`);

    // ── ASSERÇÃO FAIL-CLOSED: se houver vaga com código que NÃO é da família sintética (SIM-/ARNES-)
    //    e não é rascunho sem código, aborta. Protege contra rodar onde exista vaga A&S real.
    const vagaSuspeita = await sql.unsafe(
      `select count(*)::int as n from vagas
         where codigo is not null and codigo not like 'SIM-%' and codigo not like 'ARNES-%'`,
    );
    const nSuspeita = (vagaSuspeita[0] as unknown as { n: number }).n;
    if (nSuspeita > 0) {
      throw new Error(
        `Aborta: ${nSuspeita} vaga(s) com código fora da família sintética (SIM-/ARNES-). ` +
          `A esteira A&S da homologação deveria ser 100% sintética. Investigue antes de limpar.`,
      );
    }

    const apagado: Record<string, number> = {};

    await sql.begin(async (tx) => {
      // ── O CONJUNTO DE TESTE, materializado ANTES de qualquer delete (ele lê as_candidaturas).
      await tx.unsafe(`create temporary table _adm_teste on commit drop as
        select id from admissoes where
          id in (select admissao_id from as_candidaturas where admissao_id is not null)
          or candidato_cpf in (
            select cpf from candidatos
             where cpf like '${MARCA_CPF}'
                or upper(nome) like 'SIMULADO%'
                or upper(nome) like 'ARNES%')`);
      const nTeste = (
        (await tx.unsafe(`select count(*)::int as n from _adm_teste`))[0] as unknown as { n: number }
      ).n;
      apagado["admissoes_de_teste_detectadas"] = nTeste;

      // ── GRUPO A: a esteira A&S inteira, na ordem de FK. Remove também o vínculo
      //    as_candidaturas.admissao_id, então o GRUPO B pode apagar admissões sem violar FK.
      for (const t of TABELAS_A_S) {
        const r = await tx.unsafe(`delete from ${t}`);
        apagado[t] = r.count ?? 0;
      }

      // ── GRUPO B: dependentes das admissões de teste (por admissao_id), depois as admissões.
      apagado["portal_eventos"] =
        (
          await tx.unsafe(`delete from portal_eventos where jti_link in (
             select jti_link from portal_credenciais where admissao_id in (select id from _adm_teste))`)
        ).count ?? 0;
      apagado["portal_credenciais"] =
        (await tx.unsafe(`delete from portal_credenciais where admissao_id in (select id from _adm_teste)`))
          .count ?? 0;
      apagado["portal_pendencias_no_time"] =
        (
          await tx.unsafe(
            `delete from portal_pendencias_no_time where admissao_id in (select id from _adm_teste)`,
          )
        ).count ?? 0;
      apagado["portal_links"] =
        (await tx.unsafe(`delete from portal_links where admissao_id in (select id from _adm_teste)`))
          .count ?? 0;
      apagado["documentos_admissao"] =
        (await tx.unsafe(`delete from documentos_admissao where admissao_id in (select id from _adm_teste)`))
          .count ?? 0;
      apagado["admissao_beneficio"] =
        (await tx.unsafe(`delete from admissao_beneficio where admissao_id in (select id from _adm_teste)`))
          .count ?? 0;
      apagado["dados_vaga_folha"] =
        (await tx.unsafe(`delete from dados_vaga_folha where admissao_id in (select id from _adm_teste)`))
          .count ?? 0;
      apagado["frentes_admissao"] =
        (await tx.unsafe(`delete from frentes_admissao where admissao_id in (select id from _adm_teste)`))
          .count ?? 0;
      apagado["sala_espera"] =
        (await tx.unsafe(`delete from sala_espera where admissao_id in (select id from _adm_teste)`))
          .count ?? 0;
      apagado["admissoes"] =
        (await tx.unsafe(`delete from admissoes where id in (select id from _adm_teste)`)).count ?? 0;

      // ── Candidatos ADM sintéticos que ficaram órfãos (nenhuma admissão os referencia). Só a família
      //    de marca; a carga real (CPF 200001..., nome Candidato NNN Homolog) nunca casa.
      apagado["candidatos_sinteticos_orfaos"] =
        (
          await tx.unsafe(`delete from candidatos
             where (cpf like '${MARCA_CPF}' or upper(nome) like 'SIMULADO%' or upper(nome) like 'ARNES%')
               and cpf not in (select candidato_cpf from admissoes where candidato_cpf is not null)`)
        ).count ?? 0;
    });

    const depois = await contarTudo(sql);

    console.log("");
    console.log("APAGADO");
    console.log("=".repeat(60));
    for (const [k, v] of Object.entries(apagado)) console.log(`  ${k.padEnd(34)} ${v}`);
    console.log("");
    console.log("CONTAGENS (antes -> depois)");
    console.log("=".repeat(60));
    for (const t of TABELAS_RELATORIO) {
      console.log(`  ${t.padEnd(28)} ${String(antes[t]).padStart(7)} -> ${String(depois[t]).padStart(7)}`);
    }
    console.log("");
    console.log(`[limpeza] concluída. Backup em: ${arquivoBackup}`);
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[limpeza] falhou: ${err instanceof Error ? err.message : "erro sem mensagem"}`);
    process.exit(1);
  });
}
