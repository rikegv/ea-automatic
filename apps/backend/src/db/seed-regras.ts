import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { createDb } from "./client";
import { regrasAuditoria, tiposDocumento } from "./schema";

/**
 * Seed das REGRAS DE AUDITORIA (critério de validade da IA por tipo de documento — Fase 4 / INT-3).
 * Idempotente por (tipoDocumento + descrição): roda quantas vezes for preciso sem duplicar. Loga só
 * contagens (§A.6). Casa o tipo por CÓDIGO ou NOME, tolerante a acento/caixa; tipo ausente é pulado
 * com aviso (não quebra o seed).
 *
 * ATENÇÃO (§A.9): o critério oficial de aprovação da IA é uma PENDÊNCIA DO DIRETOR ("regra mais
 * pesada"). O OST descreveu apenas a QUANTIDADE de regras por tipo — NÃO o texto literal. Os textos
 * abaixo são baselines operacionais claros, com a contagem exata pedida, prontos para o diretor
 * revisar/editar pelo CRUD (admin/regras). A "DOCUMENTOS EM GERAL" é aplicada a TODOS os tipos
 * (a tabela exige tipo_documento_id; não há slot "global" no schema congelado) — um baseline por
 * tipo, editável individualmente. Trocar os textos depois é seguro (idempotência preserva).
 */

/** Grupo de regras → código do tipo de documento (chave estável). */
const REGRAS_POR_CODIGO: Array<{ codigo: string; regras: string[] }> = [
  {
    codigo: "RG",
    regras: [
      "O RG deve estar legível, sem cortes ou reflexos que ocultem informações.",
      "Nome completo, número do registro e órgão expedidor devem estar visíveis.",
      "A foto e a assinatura do titular devem estar identificáveis.",
      "Documento deve estar dentro do prazo de validade, quando houver.",
    ],
  },
  {
    codigo: "CPF",
    regras: [
      "O número do CPF deve estar legível e completo (11 dígitos).",
      "O nome no CPF deve coincidir com o nome informado no cadastro do candidato.",
    ],
  },
  {
    codigo: "COMPROVANTE_RESIDENCIA",
    regras: [
      "O comprovante deve ter no máximo 90 dias desde a emissão.",
      'O endereço deve estar legível e completo. O comprovante PODE estar em nome do candidato ou de um familiar (cônjuge, pai ou mãe): NÃO reprove por estar em nome de terceiro. Se o titular não for o candidato, retorne VALIDADO e inclua no motivo EXATAMENTE o aviso: "Documento em nome de terceiro — consultor deve verificar se é familiar do candidato." A decisão final é do consultor.',
    ],
  },
  {
    codigo: "FOTO_3X4",
    regras: [
      "A foto deve ser recente (até 6 meses).",
      "Fundo claro e rosto descoberto, com a face inteira visível.",
      "Imagem nítida, sem filtros, recortes ou distorções.",
    ],
  },
  {
    codigo: "CTPS",
    regras: [
      "As páginas de identificação (foto e qualificação civil) devem estar legíveis.",
      "Número, série e dados do titular devem estar visíveis.",
    ],
  },
  {
    codigo: "COMPROVANTE_ESCOLARIDADE",
    regras: [
      "O comprovante deve indicar a conclusão ou a matrícula no grau de escolaridade exigido.",
    ],
  },
  {
    codigo: "DADOS_BANCARIOS",
    regras: [
      "Banco, agência e número da conta devem estar legíveis.",
      "A conta deve estar em nome do candidato.",
      "O tipo de conta (corrente, poupança ou salário) deve estar identificado.",
      "Os dados bancários devem coincidir com os informados no cadastro.",
    ],
  },
  {
    codigo: "RESERVISTA",
    regras: [
      "Para candidatos do sexo masculino, o documento de reservista/quitação militar deve estar legível e válido.",
    ],
  },
  {
    codigo: "CERTIDAO_NASC_CASAMENTO",
    regras: [
      "A certidão de nascimento ou casamento deve estar legível e atualizada.",
      "O estado civil indicado deve ser coerente com o informado no cadastro.",
    ],
  },
  {
    // ASO (Atestado de Saúde Ocupacional) — auditado na aba Exame (Fase 4 complemento, item 3).
    // A 3ª regra mapeia o resultado para o veredito: INAPTO → INCONFORME; APTO + dados ok → VALIDADO.
    codigo: "ASO",
    regras: [
      "Verificar se o nome no documento confere com o candidato cadastrado.",
      "O documento deve estar legível.",
      "Verificar se o resultado do exame é APTO ou INAPTO e reportar no motivo. Se o resultado for INAPTO, classifique o documento como INCONFORME; se for APTO e os dados conferem, VALIDADO.",
    ],
  },
];

/** Regra baseline aplicada a TODOS os tipos ("DOCUMENTOS EM GERAL"). */
const REGRA_GERAL =
  "O documento deve estar legível, completo, sem rasuras e dentro do prazo de validade, quando aplicável.";

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  const tipos = await db
    .select({ id: tiposDocumento.id, codigo: tiposDocumento.codigo, nome: tiposDocumento.nome })
    .from(tiposDocumento);

  // Índice tolerante por código e por nome normalizados.
  const idPorChave = new Map<string, string>();
  for (const t of tipos) {
    idPorChave.set(norm(t.codigo), t.id);
    idPorChave.set(norm(t.nome), t.id);
  }

  // Pares (tipoId, descricao) a garantir.
  const pares: Array<{ tipoId: string; descricao: string }> = [];
  const pulados: string[] = [];

  for (const grupo of REGRAS_POR_CODIGO) {
    const tipoId = idPorChave.get(norm(grupo.codigo));
    if (!tipoId) {
      pulados.push(grupo.codigo);
      continue;
    }
    for (const descricao of grupo.regras) pares.push({ tipoId, descricao });
  }

  // "DOCUMENTOS EM GERAL" — baseline para todos os tipos.
  for (const t of tipos) pares.push({ tipoId: t.id, descricao: REGRA_GERAL });

  // Idempotência manual por (tipo + descrição) — não há índice único nessa dupla.
  let inseridos = 0;
  for (const p of pares) {
    const existe = await db
      .select({ id: regrasAuditoria.id })
      .from(regrasAuditoria)
      .where(
        and(
          eq(regrasAuditoria.tipoDocumentoId, p.tipoId),
          eq(regrasAuditoria.descricaoRegra, p.descricao),
        ),
      )
      .limit(1);
    if (existe.length === 0) {
      await db
        .insert(regrasAuditoria)
        .values({ tipoDocumentoId: p.tipoId, descricaoRegra: p.descricao });
      inseridos++;
    }
  }

  await sql.end();
  console.log(
    `[seed-regras] regras garantidas: ${pares.length} (${inseridos} novas) | regra geral em ${tipos.length} tipos.`,
  );
  if (pulados.length > 0) {
    console.warn(`[seed-regras] tipos não encontrados (pulados): ${pulados.join(", ")}.`);
  }
}

main().catch((err) => {
  console.error("[seed-regras] falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
