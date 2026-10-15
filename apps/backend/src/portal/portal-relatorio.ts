import type { EstadoLinkPainel, LinhaDoPainelPortal, OrigemDeEnvioDoLink } from "@ea/shared-types";
import type { ColunaXlsx, LinhaRelatorio } from "../admissoes/relatorio-export";

/**
 * EXPORTAÇÃO DO GERENCIADOR DO PORTAL EM XLSX (OST das ondas, Onda 2b). Partes PURAS (colunas,
 * rótulos, montagem da linha, decisão da célula do link), separadas do controller para o teste
 * provar a regra sem subir o Nest nem tocar o banco.
 *
 * A COLUNA DO LINK É O MOTIVO DESTA TELA TER EXPORTAÇÃO PRÓPRIA: o Excel leva, por candidato, o LINK
 * VIVO de acesso (para envio em massa por WhatsApp). A regra permanente do diretor manda usar SEMPRE
 * o link vivo e NUNCA gerar um link novo à toa. Por isso o controller só resolve o link das linhas
 * cujo estado é VIVO (aí a emissão reaproveita o link existente, sem cunhar nem revogar nada); para
 * os demais estados a célula leva uma nota, e nenhum link é criado.
 */

export const COLUNAS_RELATORIO_PORTAL: ColunaXlsx[] = [
  { chave: "candidato", rotulo: "Nome Completo", largura: 28 },
  { chave: "telefone", rotulo: "Telefone", largura: 16 },
  { chave: "email", rotulo: "E-mail", largura: 26 },
  { chave: "cargo", rotulo: "Cargo", largura: 22 },
  { chave: "cliente", rotulo: "Cliente", largura: 26 },
  { chave: "dataAdmissao", rotulo: "Data de Admissão", largura: 16 },
  { chave: "documentoAtual", rotulo: "Documento Atual", largura: 24 },
  { chave: "progresso", rotulo: "Aceitos / Obrigatórios", largura: 18 },
  { chave: "noTime", rotulo: "No Time", largura: 10 },
  { chave: "ultimoAcesso", rotulo: "Último Acesso", largura: 16 },
  { chave: "estadoLink", rotulo: "Estado do Link", largura: 16 },
  { chave: "origem", rotulo: "Origem do Envio", largura: 18 },
  { chave: "link", rotulo: "Link de Acesso", largura: 60 },
];

/**
 * Colunas SEMPRE presentes no Excel do Portal (Onda 3.1): Nome, Telefone e E-mail (obrigatórias do
 * diretor) e o LINK DE ACESSO, que é o motivo desta exportação existir (envio em massa). As demais
 * entram só quando o usuário as marca no seletor.
 */
const CHAVES_SEMPRE_PORTAL = new Set(["candidato", "telefone", "email", "link"]);

/**
 * Filtra as colunas do Portal pela seleção do usuário, preservando as sempre-presentes e a ordem
 * original. `null`/vazio = nenhuma seleção informada: volta ao conjunto completo (compatível com o
 * download que não manda seleção).
 */
export function colunasDoRelatorioPortal(selecionadas: string[] | null | undefined): ColunaXlsx[] {
  if (!selecionadas || selecionadas.length === 0) return COLUNAS_RELATORIO_PORTAL;
  const marcadas = new Set(selecionadas);
  return COLUNAS_RELATORIO_PORTAL.filter(
    (c) => CHAVES_SEMPRE_PORTAL.has(c.chave) || marcadas.has(c.chave),
  );
}

const ROTULO_ESTADO: Record<EstadoLinkPainel, string> = {
  VIVO: "Vivo",
  VENCIDO: "Vencido",
  REVOGADO: "Revogado",
  SUSPENSO: "Suspenso",
  BLOQUEADO: "Bloqueado",
};

const ROTULO_ORIGEM: Record<OrigemDeEnvioDoLink, string> = {
  AUTOMATICO: "Automático",
  MANUAL: "Manual",
  ENTREGA_A_MAO: "Entrega À Mão",
  AUTOATENDIMENTO: "Autoatendimento",
};

/** Nota da célula do link para um estado NÃO vivo: nenhum link é gerado, a célula explica por quê. */
const NOTA_SEM_LINK: Record<Exclude<EstadoLinkPainel, "VIVO">, string> = {
  VENCIDO: "Link vencido (gerar na tela)",
  REVOGADO: "Link revogado",
  SUSPENSO: "Link suspenso",
  BLOQUEADO: "Link bloqueado",
};

function fmtData(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Decide o que vai na célula do link. SÓ o estado VIVO recebe a URL (resolvida fora, reaproveitando
 * o link existente); os demais recebem uma nota e nenhum link é criado. Esta é a régua que honra o
 * "nunca gerar link novo à toa": o controller nem chama a emissão para quem não está VIVO.
 */
export function celulaDoLink(estado: EstadoLinkPainel, urlResolvida: string | null): string {
  if (estado === "VIVO") return urlResolvida ?? "";
  return NOTA_SEM_LINK[estado];
}

/** Monta a linha do relatório do Portal a partir da linha do painel e da URL já resolvida (ou nula). */
export function montarLinhaRelatorioPortal(
  linha: LinhaDoPainelPortal,
  urlResolvida: string | null,
  contato?: { telefone: string | null; email: string | null } | null,
): LinhaRelatorio {
  return {
    candidato: linha.nome ?? "",
    telefone: contato?.telefone ?? "",
    email: contato?.email ?? "",
    cargo: linha.cargo ?? "",
    cliente: linha.cliente ?? "",
    dataAdmissao: fmtData(linha.dataAdmissao),
    documentoAtual: linha.documentoAtual ?? "",
    progresso: `${linha.aceitos}/${linha.obrigatorios}`,
    noTime: linha.noTime ? "Sim" : "Não",
    ultimoAcesso: linha.ultimoAcessoEm ? fmtData(linha.ultimoAcessoEm) : "",
    estadoLink: ROTULO_ESTADO[linha.estadoLink] ?? linha.estadoLink,
    origem: linha.origemEnvio ? (ROTULO_ORIGEM[linha.origemEnvio] ?? linha.origemEnvio) : "",
    link: celulaDoLink(linha.estadoLink, urlResolvida),
  };
}

/** Só as linhas VIVAS precisam ter o link resolvido; é a régua que o controller usa no laço. */
export function precisaResolverLink(linha: LinhaDoPainelPortal): boolean {
  return linha.estadoLink === "VIVO";
}
