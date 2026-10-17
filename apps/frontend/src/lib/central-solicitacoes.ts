/**
 * CAMADA DE DADOS da Central De Solicitações (frontend). apiFetch/apiUpload puros, sem react-query:
 * cada tela chama estes fetchers passando o `token` do `useAuth`, no mesmo molde das demais telas do
 * sistema (ex.: `lib/portal-envio-link.ts`). O contrato dos tipos vem de "@ea/shared-types".
 *
 * Duas famílias de rota:
 *  - USUÁRIO: abre a solicitação, lista as suas, lê o detalhe e responde na conversa.
 *  - GESTÃO (SUPER_ADMIN): lista com filtros múltiplos, lê o detalhe e aplica a ação de gestão.
 */
import type {
  SolicitacaoResumoApi,
  SolicitacaoDetalheApi,
  SolicitacaoTipo,
  SolicitacaoStatus,
  SolicitacaoAcaoGestao,
} from "@ea/shared-types";
import { apiFetch, apiUpload } from "@/lib/api";

// ── USUÁRIO ──────────────────────────────────────────────────────────────────

/** Dados do formulário de abertura. A imagem (print) é obrigatória pela OST. */
export interface NovaSolicitacaoInput {
  tipo: SolicitacaoTipo;
  menuCodigo: string;
  submenu: string;
  descricao: string;
  imagem: File;
}

/**
 * Abre uma solicitação nova. Multipart (o print viaja junto), então usa `apiUpload`: o campo do
 * arquivo chama-se `file`, como o contrato da OST pede.
 */
export function criarSolicitacao(
  entrada: NovaSolicitacaoInput,
  token: string | null,
): Promise<SolicitacaoDetalheApi> {
  const fd = new FormData();
  fd.append("tipo", entrada.tipo);
  fd.append("menuCodigo", entrada.menuCodigo);
  fd.append("submenu", entrada.submenu);
  fd.append("descricao", entrada.descricao);
  fd.append("file", entrada.imagem);
  return apiUpload<SolicitacaoDetalheApi>("/solicitacoes", fd, token);
}

/** As solicitações abertas pelo próprio usuário. */
export function listarMinhasSolicitacoes(
  token: string | null,
): Promise<SolicitacaoResumoApi[]> {
  return apiFetch<SolicitacaoResumoApi[]>("/solicitacoes/minhas", { token });
}

/** Detalhe de uma solicitação do próprio usuário (descrição, print e conversa). */
export function obterMinhaSolicitacao(
  id: string,
  token: string | null,
): Promise<SolicitacaoDetalheApi> {
  return apiFetch<SolicitacaoDetalheApi>(`/solicitacoes/${id}`, { token });
}

/** Responde na conversa da própria solicitação. */
export function responderSolicitacao(
  id: string,
  corpo: string,
  token: string | null,
): Promise<SolicitacaoDetalheApi> {
  return apiFetch<SolicitacaoDetalheApi>(`/solicitacoes/${id}/mensagens`, {
    method: "POST",
    body: { corpo },
    token,
  });
}

// ── GESTÃO (SUPER_ADMIN) ─────────────────────────────────────────────────────

/** Filtros da gestão. Tipo e status são MÚLTIPLOS (§A.28); a busca casa solicitante/menu/descrição. */
export interface FiltrosGestao {
  tipos?: SolicitacaoTipo[];
  status?: SolicitacaoStatus[];
  busca?: string;
}

/**
 * Linha da lista da gestão. É o resumo com a descrição OPCIONAL: a coluna Descrição da tabela a mostra
 * truncada quando o backend a traz na listagem, e o texto inteiro vive no detalhe (o modal). Opcional
 * de propósito, para não presumir o que o resumo carrega: ausente, a célula fica vazia e o modal supre.
 */
export type SolicitacaoLinhaGestao = SolicitacaoResumoApi & { descricao?: string };

/**
 * Lista da gestão. O filtro múltiplo vira parâmetro REPETIDO (`tipos=A&tipos=B`), que é o padrão que o
 * backend lê como lista (`parseMulti`). A busca entra como um parâmetro só.
 */
export function listarSolicitacoesGestao(
  filtros: FiltrosGestao,
  token: string | null,
): Promise<SolicitacaoLinhaGestao[]> {
  const qs = new URLSearchParams();
  for (const t of filtros.tipos ?? []) qs.append("tipos", t);
  for (const s of filtros.status ?? []) qs.append("status", s);
  const busca = filtros.busca?.trim();
  if (busca) qs.set("busca", busca);
  const sufixo = qs.toString();
  return apiFetch<SolicitacaoLinhaGestao[]>(
    `/solicitacoes-gestao${sufixo ? `?${sufixo}` : ""}`,
    { token },
  );
}

/** Detalhe de uma solicitação, pela ótica da gestão. */
export function obterSolicitacaoGestao(
  id: string,
  token: string | null,
): Promise<SolicitacaoDetalheApi> {
  return apiFetch<SolicitacaoDetalheApi>(`/solicitacoes-gestao/${id}`, { token });
}

/**
 * Aplica uma ação da gestão. ENVIAR_DUVIDA carrega a pergunta no `corpo`; APROVAR/REPROVAR aceitam
 * uma nota opcional; EM_ANDAMENTO/CONCLUIR movem o status.
 */
export function aplicarAcaoGestao(
  id: string,
  acao: SolicitacaoAcaoGestao,
  corpo: string | undefined,
  token: string | null,
): Promise<SolicitacaoDetalheApi> {
  return apiFetch<SolicitacaoDetalheApi>(`/solicitacoes-gestao/${id}/acao`, {
    method: "POST",
    body: corpo ? { acao, corpo } : { acao },
    token,
  });
}
