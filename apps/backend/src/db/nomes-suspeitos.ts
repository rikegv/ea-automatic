import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDb } from "./client";
import {
  motivosDeSuspeita,
  ROTULO_SUSPEITA,
  severidadeDe,
  type MotivoSuspeita,
} from "../domain/nome-suspeito";

/**
 * LEVANTAMENTO DE CADASTRO COM NOME SUSPEITO (OST A / Bloco 6).
 *
 * POR QUE EXISTE. A IA confere o nome do documento contra o nome do CADASTRO. Um cadastro com token
 * duplicado ("Carla Carla") derrubou SEIS documentos bons de uma candidata por "nome não confere".
 * Antes do lote, o diretor precisa saber o tamanho do problema.
 *
 * O QUE FAZ: varre as admissões VIVAS (EM_ADMISSAO / BANCO_AGUARDAR), aplica os critérios de
 * `domain/nome-suspeito` e ENTREGA UMA LISTA. NÃO corrige nada, por decisão da OST: nome é dado de
 * identidade, e "consertar" sozinho pode trocar um nome legítimo por outro.
 *
 * §A.6 — COMO A LISTA É ENTREGUE. Nome é dado pessoal, então NÃO vai para stdout nem para log. O
 * relatório é gravado num ARQUIVO CSV e o terminal mostra apenas CONTAGENS por motivo. O caminho do
 * arquivo é escolhido por quem roda.
 *
 * USO:
 *   pnpm --filter @ea/backend db:nomes-suspeitos
 *   pnpm --filter @ea/backend db:nomes-suspeitos -- --saida=/caminho/relatorio.csv
 */

function arg(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1]?.trim();
}

/** Escapa um campo para CSV (aspas duplas, com duplicação das internas). */
function csv(valor: string): string {
  return `"${String(valor ?? "").replace(/"/g, '""')}"`;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const saida = resolve(arg("saida") ?? "nomes-suspeitos.csv");

  const { sql } = createDb(url, 1);
  // §A.16 / §A.19: só admissões VIVAS. Concluídas e encerradas não são retrabalhadas.
  const linhas = await sql<
    Array<{ id: string; nome: string; farol: string; data_admissao: string | null }>
  >`
    SELECT a.id, c.nome, a.farol_global AS farol, a.data_admissao
    FROM admissoes a
    JOIN candidatos c ON c.cpf = a.candidato_cpf
    WHERE a.farol_global IN ('EM_ADMISSAO', 'BANCO_AGUARDAR')
    ORDER BY a.data_admissao NULLS LAST, a.criado_em`;

  const suspeitos = linhas
    .map((l) => {
      const motivos = motivosDeSuspeita(l.nome);
      return { ...l, motivos, severidade: severidadeDe(motivos) };
    })
    .filter((l) => l.motivos.length > 0)
    // ALTA primeiro: é o que o diretor precisa corrigir antes do lote.
    .sort((a, b) => (a.severidade === b.severidade ? 0 : a.severidade === "ALTA" ? -1 : 1));

  const cabecalho = "severidade,admissao_id,nome_cadastrado,farol,data_admissao,motivos\n";
  const corpo = suspeitos
    .map((s) =>
      [
        csv(s.severidade),
        csv(s.id),
        csv(s.nome),
        csv(s.farol),
        csv(s.data_admissao ?? "não informado"),
        csv(s.motivos.map((m) => ROTULO_SUSPEITA[m]).join(" | ")),
      ].join(","),
    )
    .join("\n");
  writeFileSync(saida, cabecalho + corpo + (corpo ? "\n" : ""), "utf8");

  // §A.6: só contagens no terminal. Nenhum nome aparece aqui.
  const porMotivo = new Map<MotivoSuspeita, number>();
  for (const s of suspeitos) {
    for (const m of s.motivos) porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
  }
  console.log(`[nomes-suspeitos] admissões vivas analisadas: ${linhas.length}`);
  const altas = suspeitos.filter((s) => s.severidade === "ALTA").length;
  console.log(
    `[nomes-suspeitos] cadastros suspeitos: ${suspeitos.length} (ALTA=${altas} · BAIXA=${suspeitos.length - altas})`,
  );
  for (const [motivo, qtd] of [...porMotivo].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${motivo.padEnd(22)} ${qtd}  (${ROTULO_SUSPEITA[motivo]})`);
  }
  console.log(`[nomes-suspeitos] lista COM os nomes gravada em: ${saida}`);
  console.log("[nomes-suspeitos] nada foi corrigido: a correção é decisão do diretor.");

  await sql.end();
}

main().catch((e) => {
  console.error("[nomes-suspeitos] ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
