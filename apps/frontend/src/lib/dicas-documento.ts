/**
 * O CONTRATO DA DICA POR TIPO DE DOCUMENTO, ISOLADO NUM ARQUIVO SÓ, e o isolamento foi o ponto.
 *
 * ┌─ CONFERIDO CONTRA O BACKEND REAL ───────────────────────────────────────────────────────────┐
 * │ Este arquivo nasceu descrevendo um contrato SUPOSTO, enquanto o backend era construído na    │
 * │ mesma rodada. O backend existe (`apps/backend/src/admin/dicas-documento/`), os tipos estão   │
 * │ publicados em `@ea/shared-types` (do coordenador, §A.39) e este arquivo agora os REEXPORTA   │
 * │ em vez de descrevê-los. Nenhuma tela precisou ser redesenhada, que era o que o isolamento    │
 * │ existia para garantir.                                                                       │
 * │                                                                                              │
 * │ O QUE MUDOU EM RELAÇÃO AO SUPOSTO, e são três coisas:                                        │
 * │  1. A escrita é UPSERT POR TIPO (`PUT :tipoDocumentoId`), não `POST` + `PATCH :id`. A chave  │
 * │     de negócio é o TIPO, então a tela não precisa saber se a dica já existia para escolher   │
 * │     o verbo.                                                                                 │
 * │  2. A lista é DOS TIPOS ATIVOS, cada linha já trazendo `codigo` e `nome`. Some a segunda     │
 * │     chamada ao catálogo de tipos: uma consulta responde a tela inteira.                      │
 * │  3. Inativar e reativar viajam pelo `tipoDocumentoId` TAMBÉM, e não pelo id da dica. Um      │
 * │     tipo, uma dica: o id da dica nunca precisa sair do servidor para voltar como parâmetro.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a dica é texto de CONFIGURAÇÃO, escrito pelo diretor, sem dado de candidato. O risco dela é
 * o inverso do usual, e é de RENDERIZAÇÃO: o texto vai parar na tela PÚBLICA do candidato, então
 * ele é tratado como conteúdo a escapar. Ele é renderizado como TEXTO, sempre, e nunca como HTML.
 */

import {
  DICA_DOCUMENTO_TEXTO_MAX,
  SITUACOES_DA_DICA,
  type CatalogoDeFiltrosDasDicas,
  type FiltrosDasDicasDeDocumento,
  type LinhaDeDicaDeDocumento,
  type PassoDaTrilhaPortal,
  type SituacaoDaDica,
  type UpsertDicaDocumento,
} from "@ea/shared-types";
import { apiFetch } from "@/lib/api";

export { DICA_DOCUMENTO_TEXTO_MAX, SITUACOES_DA_DICA };
export type {
  CatalogoDeFiltrosDasDicas,
  FiltrosDasDicasDeDocumento,
  LinhaDeDicaDeDocumento,
  SituacaoDaDica,
  UpsertDicaDocumento,
};

/** A rota da lista. UMA constante, porque o recorte e o universo batem nela os dois. */
export const ROTA_DICAS = "/admin/dicas-documento";

/**
 * ┌─ SUPOSIÇÃO, ISOLADA AQUI E EM MAIS LUGAR NENHUM ────────────────────────────────────────────┐
 * │ A rota do CATÁLOGO DOS FILTROS está sendo construída pelo agente de backend na mesma rodada  │
 * │ em que esta tela ganha os filtros. O contrato (`CatalogoDeFiltrosDasDicas`) está publicado e  │
 * │ é ele que a tela consome; o CAMINHO é o único palpite, e ele segue o molde da tela irmã       │
 * │ (`/esteira/portal-painel/filtros`) aplicado a esta base: `/admin/dicas-documento/filtros`.    │
 * │                                                                                               │
 * │ Se o caminho combinado for outro, muda-se ESTA LINHA e nada mais: a tela não conhece rota.   │
 * │ E o catálogo indisponível NÃO derruba a tela (ver `carregarCatalogoDeFiltros`).              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const ROTA_CATALOGO_DOS_FILTROS_DAS_DICAS = `${ROTA_DICAS}/filtros`;

/**
 * A QUERY DO RECORTE, montada num lugar só.
 *
 * O formato é o do sistema inteiro: lista MÚLTIPLA (§A.28) serializada por VÍRGULA, que é o que o
 * `parseMulti` do backend (`common/parse-multi.ts`) lê em todas as outras telas. Filtro vazio NÃO
 * viaja: parâmetro presente e vazio é a diferença entre "não filtrei" e "filtrei por nada", e os
 * dois lados precisam concordar sobre qual é qual.
 */
export function queryDasDicas(f: FiltrosDasDicasDeDocumento): string {
  const q = new URLSearchParams();
  const lista = (chave: string, v?: string[]) => {
    const limpos = (v ?? []).map((s) => s.trim()).filter(Boolean);
    if (limpos.length) q.set(chave, limpos.join(","));
  };
  lista("situacoes", f.situacoes);
  lista("documentos", f.documentos);
  return q.toString();
}

/**
 * Todos os tipos ATIVOS, com a dica de cada um quando existir (`dicaId` nulo = ainda não tem).
 *
 * SEM FILTRO, DEVOLVE O UNIVERSO, e é essa chamada que alimenta o contador do topo. Com filtro,
 * devolve o RECORTE, que é o que a tabela mostra. A mesma rota responde as duas perguntas porque
 * a diferença entre elas é só a query.
 */
export function listarDicas(
  token: string | null,
  filtros?: FiltrosDasDicasDeDocumento,
): Promise<LinhaDeDicaDeDocumento[]> {
  const q = filtros ? queryDasDicas(filtros) : "";
  return apiFetch<LinhaDeDicaDeDocumento[]>(q ? `${ROTA_DICAS}?${q}` : ROTA_DICAS, { token });
}

/**
 * AS TRÊS SITUAÇÕES, ESCRITAS UMA VEZ SÓ.
 *
 * A pill da tabela e a opção do filtro leem DAQUI, e é o que garante que quem filtra por "Dica
 * Inativa" leia exatamente a palavra que está na linha. Duas listas de rótulo divergem no primeiro
 * ajuste, e a divergência aqui é pior do que feia: ela faz o filtro parecer não funcionar.
 *
 * §A.24: pill e opção de filtro são ETIQUETA, então Title Case.
 */
export const ROTULO_DA_SITUACAO: Record<SituacaoDaDica, string> = {
  COM_DICA: "Com Dica",
  SEM_DICA: "Sem Dica",
  DICA_INATIVA: "Dica Inativa",
};

/**
 * A SITUAÇÃO DA LINHA, derivada dos dois campos que a definem.
 *
 * `SEM_DICA` é a AUSÊNCIA do registro (`dicaId` nulo), não um estado gravado em lugar nenhum, e é
 * por isso que ela vem primeiro: sem essa pergunta, `ativo` nulo cairia em "inativa" e a tela
 * diria que existe uma dica oculta onde nunca houve dica nenhuma.
 */
export function situacaoDaLinha(l: LinhaDeDicaDeDocumento): SituacaoDaDica {
  if (!l.dicaId) return "SEM_DICA";
  return l.ativo === false ? "DICA_INATIVA" : "COM_DICA";
}

/**
 * AS OPÇÕES DOS DOIS FILTROS, VINDAS DO ENDPOINT E NUNCA DAS LINHAS CARREGADAS (§A.37).
 *
 * Derivar as opções da lista que está na tela encolhe o catálogo assim que o primeiro valor é
 * escolhido, e aí não há como somar o segundo sem limpar o filtro. Aqui isso morderia duas vezes,
 * porque o filtro de SITUAÇÃO recorta a própria lista de onde as opções sairiam.
 *
 * CATÁLOGO INDISPONÍVEL NÃO DERRUBA A TELA, e a reserva não viola a §A.37: as três situações são
 * o CONTRATO (`SITUACOES_DA_DICA`), não uma leitura das linhas. Os documentos, esses, ficam vazios
 * até o endpoint responder, que é o mesmo comportamento da tela irmã.
 */
export const CATALOGO_DE_FILTROS_VAZIO: CatalogoDeFiltrosDasDicas = {
  situacoes: SITUACOES_DA_DICA.map((valor) => ({ valor, rotulo: ROTULO_DA_SITUACAO[valor] })),
  documentos: [],
};

export async function carregarCatalogoDeFiltros(
  token: string | null,
): Promise<CatalogoDeFiltrosDasDicas> {
  try {
    const c = await apiFetch<CatalogoDeFiltrosDasDicas>(ROTA_CATALOGO_DOS_FILTROS_DAS_DICAS, {
      token,
    });
    return {
      situacoes: c?.situacoes?.length ? c.situacoes : CATALOGO_DE_FILTROS_VAZIO.situacoes,
      documentos: c?.documentos ?? [],
    };
  } catch {
    return CATALOGO_DE_FILTROS_VAZIO;
  }
}

/**
 * QUANTOS FILTROS ESTÃO ATIVOS, para o badge do `FiltroTrigger`. São dois, então o teto é dois:
 * cada seletor conta UMA vez, por mais valores que tenha dentro, porque na cabeça de quem usa
 * "filtrei por documento" é um filtro só.
 */
export function contarFiltrosDasDicas(f: FiltrosDasDicasDeDocumento): number {
  let n = 0;
  if (f.situacoes?.length) n += 1;
  if (f.documentos?.length) n += 1;
  return n;
}

/**
 * GRAVA a dica do tipo, criando ou substituindo. Um verbo só para os dois casos, porque a chave é
 * o TIPO: mandar o mesmo texto duas vezes deixa o mesmo estado.
 */
export function gravarDica(
  token: string | null,
  tipoDocumentoId: string,
  corpo: UpsertDicaDocumento,
): Promise<unknown> {
  return apiFetch(`/admin/dicas-documento/${encodeURIComponent(tipoDocumentoId)}`, {
    method: "PUT",
    token,
    body: corpo,
  });
}

/** INATIVAÇÃO LÓGICA: a dica some do portal do candidato e o texto continua guardado. */
export function inativarDica(token: string | null, tipoDocumentoId: string): Promise<unknown> {
  return apiFetch(`/admin/dicas-documento/${encodeURIComponent(tipoDocumentoId)}`, {
    method: "DELETE",
    token,
  });
}

/** Devolve a dica inativada ao portal, com o texto que ela já tinha. */
export function reativarDica(token: string | null, tipoDocumentoId: string): Promise<unknown> {
  return apiFetch(`/admin/dicas-documento/${encodeURIComponent(tipoDocumentoId)}/reativar`, {
    method: "PATCH",
    token,
  });
}

/**
 * ══ A NORMALIZAÇÃO, ESPELHO DA DO SERVIDOR ════════════════════════════════════════════════════
 *
 * O backend APARA, colapsa espaço, normaliza quebra de linha e SÓ ENTÃO mede o teto (`sanitizar`,
 * `dicas-documento.service.ts`). A tela precisa medir o MESMO texto, senão ela deixa salvar um
 * texto de 1000 caracteres cheio de espaço que o servidor recusa depois, e a pessoa não entende
 * por quê: o contador dizia que cabia.
 *
 * Isto NÃO é a validação, é a preparação dela. A autoridade continua sendo o servidor; aqui só se
 * evita que ele precise dizer não.
 */
export function normalizarTextoDaDica(bruto: string): string {
  return bruto
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((linha) => linha.trim())
    .join("\n")
    .trim();
}

/**
 * ══ A RECUSA DITA ANTES, E NÃO DEPOIS ═════════════════════════════════════════════════════════
 *
 * O servidor RECUSA `<` e `>` em vez de limpá-los em silêncio, e a escolha dele é a certa: limpando,
 * o diretor salva e descobre mais tarde que o texto publicado saiu diferente do que ele escreveu.
 * O preço é que a recusa chega como erro de servidor, depois do clique em Salvar.
 *
 * Esta função paga esse preço adiantado: a tela diz a mesma coisa ANTES de enviar, com a mesma
 * régua, então o caminho normal é nunca ver um erro vindo da rede. Devolve o texto JÁ NORMALIZADO
 * (é ele que vai no corpo) e o motivo da recusa quando há, nunca os dois.
 *
 * §A.11: as mensagens não usam travessão.
 */
export function validarTextoDaDica(bruto: string): { texto: string; erro: string | null } {
  const texto = normalizarTextoDaDica(bruto);
  if (!texto) return { texto, erro: "Escreva a dica antes de salvar." };
  if (/[<>]/.test(texto)) {
    return { texto, erro: "A dica não pode conter os sinais < e >. Escreva só o texto." };
  }
  if (texto.length > DICA_DOCUMENTO_TEXTO_MAX) {
    return {
      texto,
      erro: `A dica passa de ${DICA_DOCUMENTO_TEXTO_MAX} caracteres. Encurte o texto.`,
    };
  }
  return { texto, erro: null };
}

/**
 * A DICA DO PASSO DA TRILHA.
 *
 * O campo é OFICIAL no contrato (`PassoDaTrilhaPortal.dica`), então o parâmetro é tipado e o cast
 * defensivo saiu. A GUARDA DE RUNTIME FICA, e ela não é desconfiança do contrato: é a régua do
 * produto, "nulo ou vazio significa sem dica, e sem dica o ícone não nasce". Ícone que abre um
 * painel vazio é pior do que ícone nenhum, porque promete ajuda e entrega silêncio.
 */
export function dicaDoPasso(
  passo: Pick<PassoDaTrilhaPortal, "dica"> | null | undefined,
): string | null {
  const bruto = passo?.dica;
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo.length > 0 ? limpo : null;
}
