import { desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  admissaoBeneficio,
  beneficiosCatalogo,
  formulariosVt,
  frenteStatusCatalogo,
  frentesAdmissao,
  usuarios,
} from "../db/schema";

/**
 * OS AGREGADOS DO RELATÓRIO EXPORTÁVEL, fora do JOIN principal.
 *
 * POR QUE SEPARADO. Frentes, benefícios e formulários de VT são 1 PARA N da admissão. Puxá-los no
 * mesmo `select` da linha multiplicaria a linha: uma pessoa com quatro frentes e três benefícios
 * sairia doze vezes na planilha, e o consultor descobriria isso contando à mão. O padrão aqui é o
 * MESMO que o `listar` do Gerenciador já usa há tempo: a consulta principal traz as linhas, e uma
 * consulta por agregado traz o resto do conjunto de uma vez, indexado por admissão.
 *
 * TODAS SÃO CONDICIONAIS no chamador: só rodam quando o consultor marcou alguma coluna do bloco.
 * Relatório com as 25 colunas de sempre continua fazendo exatamente as consultas de sempre.
 *
 * §A.6: nada aqui expande PII. Frentes carregam estado e nome de usuário interno, benefícios
 * carregam rótulo e valor, e o formulário de VT carrega o endereço residencial que o diretor
 * liberou explicitamente para a extração.
 */

/** O que o relatório precisa saber de UMA frente. */
export interface FrenteDoRelatorio {
  rotulo: string;
  concluidaEm: Date | null;
  responsavel: string | null;
}

/**
 * Estado das frentes por admissão, indexado por `tipo` (AUDITORIA, EXAME, CADASTRO_CONTRATO,
 * INTEGRACAO). O rótulo sai do MESMO catálogo que alimenta os seletores da Esteira, então a
 * planilha diz "Análise ok" onde a tela diz "Análise ok", e não o código cru.
 */
export async function frentesDoRelatorio(
  db: Database,
  ids: string[],
): Promise<Map<string, Record<string, FrenteDoRelatorio>>> {
  const mapa = new Map<string, Record<string, FrenteDoRelatorio>>();
  if (ids.length === 0) return mapa;

  const [linhas, catalogo] = await Promise.all([
    db
      .select({
        admissaoId: frentesAdmissao.admissaoId,
        tipo: frentesAdmissao.tipo,
        status: frentesAdmissao.status,
        dataConclusao: frentesAdmissao.dataConclusao,
        responsavel: usuarios.nome,
      })
      .from(frentesAdmissao)
      .leftJoin(usuarios, eq(usuarios.id, frentesAdmissao.responsavelId))
      .where(inArray(frentesAdmissao.admissaoId, ids)),
    db
      .select({
        tipo: frenteStatusCatalogo.tipo,
        codigo: frenteStatusCatalogo.codigo,
        rotulo: frenteStatusCatalogo.rotulo,
      })
      .from(frenteStatusCatalogo),
  ]);

  const rotuloDe = (tipo: string, codigo: string) =>
    catalogo.find((c) => c.tipo === tipo && c.codigo === codigo)?.rotulo ?? codigo;

  for (const f of linhas) {
    const doAdm = mapa.get(f.admissaoId) ?? {};
    doAdm[f.tipo] = {
      rotulo: rotuloDe(f.tipo, f.status),
      concluidaEm: f.dataConclusao,
      responsavel: f.responsavel,
    };
    mapa.set(f.admissaoId, doAdm);
  }
  return mapa;
}

/**
 * PACOTE ESTRUTURADO DE BENEFÍCIOS por admissão, já em texto de célula.
 *
 * É o benefício REAL da pessoa, o mesmo que a tela de Benefícios mostra, com o valor de cada um.
 * A coluna "Benefícios" do relatório levava até aqui o texto livre legado de `dados_vaga_folha`,
 * que é outro campo: quem exportava para conferir benefício conferia a coisa errada.
 *
 * Formato "Vale-Refeição: 500,00; Vale-Transporte: 220,00", com o benefício sem valor entrando só
 * com o nome. Ordem alfabética para duas exportações do mesmo pacote saírem idênticas.
 * §A.11: separador é ponto e vírgula, nunca travessão.
 */
export async function beneficiosDoRelatorio(
  db: Database,
  ids: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;

  const linhas = await db
    .select({
      admissaoId: admissaoBeneficio.admissaoId,
      nome: beneficiosCatalogo.nome,
      valor: admissaoBeneficio.valor,
    })
    .from(admissaoBeneficio)
    .innerJoin(beneficiosCatalogo, eq(beneficiosCatalogo.id, admissaoBeneficio.beneficioId))
    .where(inArray(admissaoBeneficio.admissaoId, ids));

  const porAdm = new Map<string, { nome: string; valor: string | null }[]>();
  for (const l of linhas) {
    const lista = porAdm.get(l.admissaoId) ?? [];
    lista.push({ nome: l.nome, valor: l.valor });
    porAdm.set(l.admissaoId, lista);
  }
  for (const [id, lista] of porAdm) {
    const texto = lista
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .map((b) => (b.valor === null ? b.nome : `${b.nome}: ${valorBr(b.valor)}`))
      .join("; ");
    mapa.set(id, texto);
  }
  return mapa;
}

/** "500.00" como a operação lê: "500,00". Valor não numérico volta como veio, sem sujar a célula. */
function valorBr(valor: string): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return valor;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** O formulário de VT que vale hoje para a pessoa. */
export interface VtDoRelatorio {
  optante: boolean;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  totalIda: string;
  totalVolta: string;
  totalDia: string;
}

/**
 * O formulário de VT MAIS RECENTE de cada admissão.
 *
 * A tabela guarda uma linha por ENVIO (o funcionário muda de endereço, muda de linha, a passagem
 * sobe), e o vigente é o mais novo. Sem ordenar explicitamente, o Postgres devolve qualquer um, e
 * o defeito apareceria como um endereço antigo ressurgindo na planilha sem explicação.
 */
export async function vtDoRelatorio(
  db: Database,
  ids: string[],
): Promise<Map<string, VtDoRelatorio>> {
  const mapa = new Map<string, VtDoRelatorio>();
  if (ids.length === 0) return mapa;

  const linhas = await db
    .select({
      admissaoId: formulariosVt.admissaoId,
      optante: formulariosVt.optante,
      cep: formulariosVt.cep,
      logradouro: formulariosVt.logradouro,
      numero: formulariosVt.numero,
      complemento: formulariosVt.complemento,
      bairro: formulariosVt.bairro,
      cidade: formulariosVt.cidade,
      uf: formulariosVt.uf,
      totalIda: formulariosVt.totalIda,
      totalVolta: formulariosVt.totalVolta,
      totalDia: formulariosVt.totalDia,
    })
    .from(formulariosVt)
    .where(inArray(formulariosVt.admissaoId, ids))
    .orderBy(desc(formulariosVt.criadoEm));

  // A consulta já vem do mais novo para o mais velho: a PRIMEIRA linha de cada admissão é a
  // vigente, e as seguintes são histórico que não entra no arquivo.
  for (const l of linhas) {
    if (mapa.has(l.admissaoId)) continue;
    const { admissaoId, ...resto } = l;
    mapa.set(admissaoId, resto);
  }
  return mapa;
}
