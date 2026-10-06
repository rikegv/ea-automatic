/**
 * CADASTRO EM MASSA DE CLIENTES POR PLANILHA: tipos e helpers de fetch.
 *
 * O contrato é o que o backend expõe (definido pelo coordenador):
 *  - GET  /admin/clientes/importacao/modelo?formato=xlsx|csv  baixa o arquivo modelo (blob).
 *  - POST /admin/clientes/importacao/previa  (multipart, campo `file`, opcional `aba`)  devolve a
 *    prévia: o que vai entrar, o que foi recusado (com motivo por linha) e os códigos já cadastrados.
 *  - POST /admin/clientes/importacao/confirmar  (JSON `{ linhas }`)  grava e devolve o relatório.
 *
 * As partes PURAS (montar o FormData, mapear as linhas de `aEntrar` para o corpo do confirmar) ficam
 * fora das funções de rede para o teste de autor exercitá-las sem mock de fetch.
 *
 * §A.6: o arquivo vai no CORPO (multipart), nunca em query string.
 */
import { apiDownload, apiFetch, apiUpload } from "@/lib/api";

/** Uma linha que será cadastrada (o backend validou que o código é novo). */
export interface LinhaAEntrar {
  linha: number;
  codCliente: string;
  cnpj: string | null;
  razaoSocial: string;
  nomeOperacao: string | null;
}

/** Uma linha recusada, com o motivo legível por linha do arquivo. */
export interface LinhaRecusada {
  linha: number;
  codCliente: string;
  motivo: string;
}

/** A prévia da importação, antes de qualquer gravação. */
export interface PreviaImportacaoClientes {
  aEntrar: LinhaAEntrar[];
  recusadas: LinhaRecusada[];
  /** Códigos que já existem no cadastro e não serão importados de novo. */
  jaCadastrados: string[];
  resumo: { total: number; aEntrar: number; recusadas: number };
  /** Opcionais: a aba lida e as abas disponíveis (planilha com mais de uma aba). */
  abaUsada?: string;
  abasDisponiveis?: string[];
}

/** O relatório final, depois de confirmar. */
export interface RelatorioImportacaoClientes {
  relatorio: { entraram: number; recusadas: LinhaRecusada[] };
}

/** O corpo que o confirmar espera por linha. */
export interface LinhaConfirmar {
  codCliente: string;
  cnpj?: string | null;
  razaoSocial: string;
  nomeOperacao?: string | null;
  linha?: number;
}

export type FormatoModelo = "xlsx" | "csv";

/** PURA: monta o FormData da prévia (arquivo no corpo, aba opcional). */
export function montarFormDataPrevia(file: File, aba?: string | null): FormData {
  const form = new FormData();
  form.append("file", file);
  if (aba) form.append("aba", aba);
  return form;
}

/** PURA: mapeia as linhas de `aEntrar` para o corpo do confirmar (só os campos do contrato). */
export function linhasParaConfirmar(aEntrar: LinhaAEntrar[]): LinhaConfirmar[] {
  return aEntrar.map((l) => ({
    codCliente: l.codCliente,
    cnpj: l.cnpj,
    razaoSocial: l.razaoSocial,
    nomeOperacao: l.nomeOperacao,
    linha: l.linha,
  }));
}

/** Nome sugerido do arquivo modelo quando o header Content-Disposition não traz um. */
export function nomeModelo(formato: FormatoModelo): string {
  return `modelo-importacao-clientes.${formato}`;
}

/** Baixa o arquivo modelo (xlsx ou csv) e dispara o "save as". */
export async function baixarModeloClientes(
  formato: FormatoModelo,
  token?: string | null,
): Promise<void> {
  await apiDownload(
    `/admin/clientes/importacao/modelo?formato=${formato}`,
    nomeModelo(formato),
    token,
  );
}

/** Envia a planilha e recebe a prévia. */
export async function enviarPreviaClientes(
  file: File,
  token?: string | null,
  aba?: string | null,
): Promise<PreviaImportacaoClientes> {
  return apiUpload<PreviaImportacaoClientes>(
    "/admin/clientes/importacao/previa",
    montarFormDataPrevia(file, aba),
    token,
  );
}

/** Confirma a importação com as linhas de `aEntrar`. */
export async function confirmarImportacaoClientes(
  aEntrar: LinhaAEntrar[],
  token?: string | null,
): Promise<RelatorioImportacaoClientes> {
  return apiFetch<RelatorioImportacaoClientes>("/admin/clientes/importacao/confirmar", {
    method: "POST",
    token,
    body: { linhas: linhasParaConfirmar(aEntrar) },
  });
}
