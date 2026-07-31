import "dotenv/config";
import { isNotNull } from "drizzle-orm";
import { createDb } from "./client";
import { beneficiosCatalogo, clientes, escalasCatalogo, motivosContratacao } from "./schema";

/**
 * Seed dos catálogos abertos do wizard (ajustes-2B-2C — W2/W3/W4). Idempotente (UPSERT por nome).
 * - Motivos: os 2 iniciais (Substituição, Aumento de demanda). Admin acrescenta pelo gerenciador.
 * - Escalas: valores distintos de `escala_padrao` dos clientes (texto livre — select com busca).
 * - Benefícios: **base curada** dos benefícios comuns. (`beneficios_padrao` é texto livre com valores
 *   monetários embutidos — ex.: "VT / VR - R$ 1.285,00 POR MÊS / AM" — então a extração atômica
 *   confiável é impraticável; o admin estende o catálogo pelo gerenciador — W3.)
 * Loga só contagens (§A.6).
 */
const MOTIVOS = ["Substituição", "Aumento de demanda"];

/**
 * Base curada dos benefícios, agora com `exigeValor` (OST cadastro de benefícios por tela): é a
 * régua "este benefício precisa de quanto?", que virou COLUNA e é mantida pela tela
 * `/admin/beneficios`. Os valores aqui são só o estado INICIAL de um banco novo.
 *
 * O `onConflictDoNothing` embaixo é deliberado e vale especialmente para este campo: rodar o seed de
 * novo NÃO pode desfazer o que o diretor configurou na tela. Quem manda no benefício já existente é
 * o cadastro; o seed só cobre o que ainda não existe.
 */
const BENEFICIOS_BASE: { nome: string; exigeValor: boolean }[] = [
  { nome: "VT (Vale-Transporte)", exigeValor: false },
  { nome: "VR (Vale-Refeição)", exigeValor: true },
  { nome: "VA (Vale-Alimentação)", exigeValor: true },
  { nome: "AM (Assistência Médica)", exigeValor: true },
  { nome: "Assistência Odontológica", exigeValor: false },
  { nome: "Refeição no local", exigeValor: false },
  { nome: "Cesta básica", exigeValor: true },
  { nome: "Seguro de vida", exigeValor: false },
  { nome: "Auxílio creche", exigeValor: true },
  { nome: "Participação nos lucros (PLR)", exigeValor: true },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido (apps/backend/.env)");
  const { sql, db } = createDb(url, 1);

  // 1) Motivos.
  await db
    .insert(motivosContratacao)
    .values(MOTIVOS.map((nome) => ({ nome })))
    .onConflictDoNothing({ target: motivosContratacao.nome });

  // 2) Escalas — distintas dos clientes.
  const escRows = await db
    .selectDistinct({ escala: clientes.escalaPadrao })
    .from(clientes)
    .where(isNotNull(clientes.escalaPadrao));
  const escalas = [
    ...new Set(escRows.map((r) => r.escala?.trim()).filter((e): e is string => Boolean(e))),
  ];
  if (escalas.length > 0) {
    await db
      .insert(escalasCatalogo)
      .values(escalas.map((nome) => ({ nome })))
      .onConflictDoNothing({ target: escalasCatalogo.nome });
  }

  // 3) Benefícios — base curada (admin estende).
  await db
    .insert(beneficiosCatalogo)
    .values(BENEFICIOS_BASE)
    .onConflictDoNothing({ target: beneficiosCatalogo.nome });

  await sql.end();
  console.log(
    `[seed-catalogos] motivos: ${MOTIVOS.length} | escalas: ${escalas.length} | benefícios: ${BENEFICIOS_BASE.length}.`,
  );
}

main().catch((err) => {
  console.error("[seed-catalogos] falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
