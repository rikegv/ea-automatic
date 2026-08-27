import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  admissaoBeneficio,
  admissoes,
  dadosVagaFolha,
  documentosAdmissao,
  tiposDocumento,
} from "../db/schema";
import { pendenciasObrigatorias } from "../domain/admissao";
import { configPorCliente, doMapa } from "./pendencia-config.repo";

/**
 * PENDÊNCIAS OBRIGATÓRIAS EM LOTE, num lugar só (OST do "Parcial" com zero pendências).
 *
 * POR QUE EXISTE. A coluna "Pendências Obrigatórias" mostrava "Parcial" em admissão cujo card, ao
 * ser aberto, listava ZERO pendência. A causa era ler de fontes diferentes: o CARD lista
 * `pendenciasObrigatorias` calculada AO VIVO, e o PILL lia o enum `sinalizador_preenchimento`
 * gravado no banco, que a auditoria SOBRESCREVE com `INCONFORMIDADE` quando existe documento
 * inconforme. Documento inconforme não é pendência de CAMPO, então o pill contradizia o próprio
 * card na mesma linha.
 *
 * Esta função é a fonte ÚNICA da resposta "esta admissão tem campo obrigatório faltando?". A Esteira
 * já a calculava internamente; o Gerenciador decidia por SQL sobre o enum. Agora as duas telas
 * chamam daqui, que é o que impede a divergência de voltar (§A.19: a régua unificada existe, quem
 * cria régua nova recria exatamente o problema que ela eliminou).
 *
 * Em LOTE de propósito: três consultas para a página inteira, nunca uma por linha.
 *
 * §A.6: só ids e estados de preenchimento. Nenhum dado pessoal entra ou sai daqui.
 */
export async function pendenciasObrigatoriasSet(
  db: Database,
  admissaoIds: string[],
): Promise<Set<string>> {
  const mapa = await pendenciasObrigatoriasPorAdmissao(db, admissaoIds);
  const set = new Set<string>();
  for (const [id, pend] of mapa) if (pend.length > 0) set.add(id);
  return set;
}

/**
 * A MESMA régua, devolvendo QUAIS pendências faltam em vez de só "tem ou não tem".
 *
 * O `Set` acima virou um envelope fino em volta desta função, e essa direção é deliberada: quem
 * precisa da LISTA (a coluna "Pendências Obrigatórias" do relatório) e quem precisa do SIM/NÃO (o
 * pill do Gerenciador, os KPIs da Esteira) leem o MESMO cálculo. Uma segunda régua para listar
 * recriaria exatamente a divergência que esta função foi escrita para eliminar (§A.19), com o
 * agravante de a planilha e a tela discordarem sobre a mesma admissão.
 *
 * Devolve uma entrada por admissão pedida, inclusive as sem pendência (lista vazia).
 */
export async function pendenciasObrigatoriasPorAdmissao(
  db: Database,
  admissaoIds: string[],
): Promise<Map<string, string[]>> {
  if (admissaoIds.length === 0) return new Map();

  const linhas = await db
    .select({
      id: admissoes.id,
      codCliente: admissoes.codCliente,
      cargoId: admissoes.cargoId,
      dataAdmissao: admissoes.dataAdmissao,
      tipoContrato: admissoes.tipoContrato,
      isBanco: admissoes.isBanco,
      salario: dadosVagaFolha.salario,
      beneficios: dadosVagaFolha.beneficios,
      escala: dadosVagaFolha.escala,
      centroCusto: dadosVagaFolha.centroCusto,
      setor: dadosVagaFolha.setor,
      gestorBp: dadosVagaFolha.gestorBp,
      // UNIFORME (OST Onda 3, item 1): a resposta "possui uniforme?" fecha a pendência. Sem ler a
      // coluna aqui, TODA admissão apareceria eternamente pendente de uniforme, inclusive as que
      // acabaram de responder na liberação.
      possuiUniforme: dadosVagaFolha.possuiUniforme,
    })
    .from(admissoes)
    .leftJoin(dadosVagaFolha, eq(dadosVagaFolha.admissaoId, admissoes.id))
    .where(inArray(admissoes.id, admissaoIds));

  const termoSet = await termoBancoEntregueSet(
    db,
    linhas.filter((l) => l.isBanco).map((l) => l.id),
  );
  const beneficioSet = await beneficiosEstruturadosSet(db, linhas.map((l) => l.id));
  // Config de obrigatoriedade POR CLIENTE (OST da tela de obrigatoriedade), em UMA consulta para a
  // página inteira. Cliente sem config volta "tudo obrigatório", o comportamento de sempre.
  const configs = await configPorCliente(db, linhas.map((l) => l.codCliente));

  const mapa = new Map<string, string[]>();
  for (const l of linhas) {
    const pend = pendenciasObrigatorias({
      codCliente: l.codCliente,
      cargoId: l.cargoId,
      dataAdmissao: l.dataAdmissao,
      tipoContrato: l.tipoContrato,
      vagaFolha: {
        salario: l.salario,
        beneficios: l.beneficios,
        escala: l.escala,
        centroCusto: l.centroCusto,
        setor: l.setor,
        gestorBp: l.gestorBp,
      },
      isBanco: l.isBanco,
      termoBancoEntregue: termoSet.has(l.id),
      temBeneficioEstruturado: beneficioSet.has(l.id),
      possuiUniforme: l.possuiUniforme,
    }, doMapa(configs, l.codCliente));
    mapa.set(l.id, pend);
  }
  return mapa;
}

/** Admissões de banco cujo Termo de Banco já está ENTREGUE (§A.3: é a pendência própria do banco). */
async function termoBancoEntregueSet(db: Database, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const tipo = await db.query.tiposDocumento.findFirst({
    where: eq(tiposDocumento.codigo, "TERMO_BANCO"),
  });
  if (!tipo) return new Set();
  const linhas = await db
    .select({ admissaoId: documentosAdmissao.admissaoId })
    .from(documentosAdmissao)
    .where(
      and(
        inArray(documentosAdmissao.admissaoId, ids),
        eq(documentosAdmissao.tipoDocumentoId, tipo.id),
        eq(documentosAdmissao.estado, "ENTREGUE"),
      ),
    );
  return new Set(linhas.map((l) => l.admissaoId));
}

/** Admissões com pacote de benefícios ESTRUTURADO (§A.17 etapa 4). */
async function beneficiosEstruturadosSet(db: Database, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const linhas = await db
    .selectDistinct({ admissaoId: admissaoBeneficio.admissaoId })
    .from(admissaoBeneficio)
    .where(inArray(admissaoBeneficio.admissaoId, ids));
  return new Set(linhas.map((l) => l.admissaoId));
}
