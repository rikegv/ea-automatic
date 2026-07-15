import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { sql as drizzleSql } from "drizzle-orm";
import { createDb } from "./client";
import { cargos, clientes, reguaDocumental, tiposDocumento } from "./schema";

/**
 * Carga oficial da Régua Documental (Fase 1B — OST-EA-FASE-1B-REGUA). Idempotente: UPSERT da
 * ReguaDocumental por (cod_cliente + cargo + tipo_documento). Roda quantas vezes for preciso sem
 * duplicar. Loga só contagens (§A.6 — sem dado pessoal; cod_cliente é chave de negócio).
 *
 * Fonte: src/db/data/regua-documentos-carga.csv
 * Cabeçalho: cod_cliente,nome_operacao,cargo,tipo_documento,exigencia
 *
 * Pré-passos:
 *  1. TipoDocumento — os 21 nomes da base real. 13 reaproveitam tipos já seedados (Fase 1A); 8 são
 *     criados aqui (não existiam no placeholder). Mapa explícito CSV→codigo abaixo.
 *  2. Cargo — upsert por nome (catálogo próprio §A.3); não duplica os de seed-demo.
 *
 * Régua de cliente AUSENTE da tabela `clientes` é PULADA (FK) e reportada — re-rodar após carregar
 * o cliente preenche a lacuna (idempotente).
 */
const CSV_PATH = join(__dirname, "data", "regua-documentos-carga.csv");

type LinhaCsv = {
  cod_cliente: string;
  nome_operacao: string;
  cargo: string;
  tipo_documento: string;
  exigencia: string;
};

type Exigencia = "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";
const EXIGENCIAS = new Set<Exigencia>(["OBRIGATORIO", "NAO_OBRIGATORIO", "FACULTATIVO"]);

/**
 * Mapa dos 21 tipos da base real (chave = nome do CSV em CAIXA ALTA/trim) → {codigo, nome}.
 * 13 reaproveitam o tipo já existente (codigo seedado na Fase 1A); 8 são novos (criados na carga).
 */
const TIPO_MAP: Record<string, { codigo: string; nome: string }> = {
  // — reaproveitados (já existem no catálogo) —
  RG: { codigo: "RG", nome: "RG (documento de identidade)" },
  CPF: { codigo: "CPF", nome: "CPF" },
  CTPS: { codigo: "CTPS", nome: "Carteira de Trabalho (CTPS)" },
  CNH: { codigo: "CNH", nome: "CNH" },
  PIS: { codigo: "PIS_PASEP", nome: "PIS/PASEP" },
  RESERVISTA: { codigo: "RESERVISTA", nome: "Carteira de Reservista" },
  "FOTO 3X4": { codigo: "FOTO_3X4", nome: "Foto 3x4" },
  "TITULO DE ELEITOR": { codigo: "TITULO_ELEITOR", nome: "Título de Eleitor" },
  "COMPROVANTE DE RESIDÊNCIA": {
    codigo: "COMPROVANTE_RESIDENCIA",
    nome: "Comprovante de Residência",
  },
  ESCOLARIDADE: { codigo: "COMPROVANTE_ESCOLARIDADE", nome: "Comprovante de Escolaridade" },
  "CONTA BANCÁRIA": { codigo: "DADOS_BANCARIOS", nome: "Comprovante de Conta Bancária" },
  "CERTIDÃO DE NASCIMENTO DEPENDENTE": {
    codigo: "CERTIDAO_NASCIMENTO_FILHOS",
    nome: "Certidão de Nascimento dos Filhos",
  },
  "VACINAÇÃO DEPENDENTE": { codigo: "VACINA_FILHOS", nome: "Carteira de Vacinação dos Filhos" },
  // — novos (não existiam no placeholder da Fase 1A) —
  "NASCIMENTO OU CASAMENTO": {
    codigo: "CERTIDAO_NASC_CASAMENTO",
    nome: "Certidão de Nascimento ou Casamento",
  },
  "CPF DEPENDENTE": { codigo: "CPF_DEPENDENTE", nome: "CPF do Dependente" },
  "CURSO COMPLEMENTAR": { codigo: "CURSO_COMPLEMENTAR", nome: "Curso Complementar" },
  "BANCO EXCLUSIVO": { codigo: "BANCO_EXCLUSIVO", nome: "Banco Exclusivo" },
  "CARTÃO DE TRANSPORTE": { codigo: "CARTAO_TRANSPORTE", nome: "Cartão de Transporte" },
  "CARTÃO SUS": { codigo: "CARTAO_SUS", nome: "Cartão SUS" },
  "FORMULÁRIO DE VT": { codigo: "FORMULARIO_VT", nome: "Formulário de Vale-Transporte" },
  "VACINA FUNCIONÁRIO": { codigo: "VACINA_FUNCIONARIO", nome: "Vacinação do Funcionário" },
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");

  const conteudo = readFileSync(CSV_PATH, "utf8");
  const linhas = parse(conteudo, {
    columns: true,
    skip_empty_lines: true,
    trim: false,
    bom: true,
  }) as LinhaCsv[];

  // Valida tipos e exigências ANTES de tocar o banco (falha cedo, sem carga parcial).
  const tiposDesconhecidos = new Set<string>();
  const exigenciasInvalidas = new Set<string>();
  for (const l of linhas) {
    const t = l.tipo_documento.trim().toUpperCase();
    if (!TIPO_MAP[t]) tiposDesconhecidos.add(l.tipo_documento.trim());
    if (!EXIGENCIAS.has(l.exigencia.trim() as Exigencia))
      exigenciasInvalidas.add(l.exigencia.trim());
  }
  if (tiposDesconhecidos.size > 0) {
    throw new Error(`Tipos de documento sem mapeamento: ${[...tiposDesconhecidos].join(", ")}`);
  }
  if (exigenciasInvalidas.size > 0) {
    throw new Error(`Valores de exigência inválidos: ${[...exigenciasInvalidas].join(", ")}`);
  }

  const { sql, db } = createDb(url, 1);

  // 1) TipoDocumento — garante os 21 da base (codigo único; existentes são no-op).
  const tiposValores = [...new Set(Object.values(TIPO_MAP).map((t) => t.codigo))].map((codigo) => {
    const def = Object.values(TIPO_MAP).find((t) => t.codigo === codigo)!;
    return { codigo: def.codigo, nome: def.nome };
  });
  const tiposIns = await db
    .insert(tiposDocumento)
    .values(tiposValores)
    .onConflictDoNothing({ target: tiposDocumento.codigo })
    .returning({ id: tiposDocumento.id });

  // codigo → id
  const tiposRows = await db
    .select({ id: tiposDocumento.id, codigo: tiposDocumento.codigo })
    .from(tiposDocumento);
  const tipoIdPorCodigo = new Map(tiposRows.map((r) => [r.codigo, r.id]));

  // 2) Cargo — upsert por nome de TODOS os cargos distintos do CSV (catálogo próprio §A.3).
  const cargosDistintos = [...new Set(linhas.map((l) => l.cargo.trim()))].filter(Boolean);
  const cargosIns = await db
    .insert(cargos)
    .values(cargosDistintos.map((nome) => ({ nome })))
    .onConflictDoNothing({ target: cargos.nome })
    .returning({ id: cargos.id });

  const cargosRows = await db.select({ id: cargos.id, nome: cargos.nome }).from(cargos);
  const cargoIdPorNome = new Map(cargosRows.map((r) => [r.nome, r.id]));

  // Clientes existentes (FK da régua).
  const clientesRows = await db.select({ cod: clientes.codCliente }).from(clientes);
  const clientesExistentes = new Set(clientesRows.map((r) => r.cod));

  // 3) Régua — monta os valores só para clientes existentes; dedupe por (cliente,cargo,tipo).
  const reguaPorChave = new Map<
    string,
    { codCliente: string; cargoId: string; tipoDocumentoId: string; exigencia: Exigencia }
  >();
  const puladosPorCliente = new Map<string, number>();
  for (const l of linhas) {
    const cod = l.cod_cliente.trim();
    if (!clientesExistentes.has(cod)) {
      puladosPorCliente.set(cod, (puladosPorCliente.get(cod) ?? 0) + 1);
      continue;
    }
    const cargoId = cargoIdPorNome.get(l.cargo.trim());
    const tipoDocumentoId = tipoIdPorCodigo.get(
      TIPO_MAP[l.tipo_documento.trim().toUpperCase()].codigo,
    );
    if (!cargoId || !tipoDocumentoId) continue; // defensivo — não deveria ocorrer
    reguaPorChave.set(`${cod}|${cargoId}|${tipoDocumentoId}`, {
      codCliente: cod,
      cargoId,
      tipoDocumentoId,
      exigencia: l.exigencia.trim() as Exigencia,
    });
  }

  const reguaValores = [...reguaPorChave.values()];
  let reguaInseridos = 0;
  let reguaAtualizados = 0;
  // UPSERT em lotes pela PK composta (cliente+cargo+tipo). `inserido` = (xmax = 0).
  const LOTE = 1000;
  for (let i = 0; i < reguaValores.length; i += LOTE) {
    const lote = reguaValores.slice(i, i + LOTE);
    const res = await db
      .insert(reguaDocumental)
      .values(lote)
      .onConflictDoUpdate({
        target: [
          reguaDocumental.codCliente,
          reguaDocumental.cargoId,
          reguaDocumental.tipoDocumentoId,
        ],
        set: { exigencia: drizzleSql`excluded.exigencia`, atualizadoEm: drizzleSql`now()` },
      })
      .returning({ inserido: drizzleSql<boolean>`(xmax = 0)` });
    reguaInseridos += res.filter((r) => r.inserido).length;
    reguaAtualizados += res.length - res.filter((r) => r.inserido).length;
  }

  const totalPulados = [...puladosPorCliente.values()].reduce((a, b) => a + b, 0);
  const paresComRegua = new Set(reguaValores.map((r) => `${r.codCliente}|${r.cargoId}`)).size;

  await sql.end();
  console.log(
    `[seed-regua] tipos garantidos: ${tiposValores.length} (${tiposIns.length} novos) | ` +
      `cargos: ${cargosDistintos.length} distintos (${cargosIns.length} novos) | ` +
      `régua: ${reguaValores.length} registros (${reguaInseridos} inseridos, ${reguaAtualizados} atualizados), ` +
      `${paresComRegua} pares cliente+cargo.`,
  );
  if (totalPulados > 0) {
    console.warn(
      `[seed-regua] ATENÇÃO: ${totalPulados} registros pulados — clientes ausentes na base: ` +
        `${[...puladosPorCliente.entries()].map(([c, n]) => `${c}(${n})`).join(", ")}. ` +
        `Carregue esses clientes e rode novamente (idempotente).`,
    );
  }
}

main().catch((err) => {
  console.error("[seed-regua] falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
