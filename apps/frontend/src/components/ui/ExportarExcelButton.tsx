"use client";

import { useState } from "react";
import { apiDownloadPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ExcelLogo } from "@/components/ui/ExcelLogo";
import { Spinner } from "@/components/ui/Spinner";

/** Uma coluna da exportação: a chave que casa com a linha, o rótulo do cabeçalho, a largura opcional. */
export interface ColunaExport {
  chave: string;
  rotulo: string;
  largura?: number;
}

/**
 * Botão "Exportar Excel" compartilhado (OST das ondas, Onda 2). Replica em várias telas o Excel que
 * o Gerenciador já tem: exporta as LINHAS JÁ VISÍVEIS na tela. Como a tela filtra no browser e passa
 * aqui exatamente o que está renderizado, o comportamento é o mesmo do Gerenciador: SEM filtro vai
 * tudo o que está na tela, COM filtro vai só o que ficou. Não é por seleção, é a tela inteira.
 *
 * O backend (`POST /relatorio/xlsx`) só formata o que recebe, não acessa dado novo. Sem linha, o
 * botão fica desabilitado.
 */
export function ExportarExcelButton({
  colunas,
  linhas,
  aba,
  nomeArquivo,
  className,
  titulo,
}: {
  colunas: ColunaExport[];
  linhas: Record<string, string | number | null>[];
  aba: string;
  nomeArquivo: string;
  className?: string;
  titulo?: string;
}) {
  const { token } = useAuth();
  const [baixando, setBaixando] = useState(false);
  const vazio = linhas.length === 0;

  async function exportar() {
    if (baixando || vazio) return;
    setBaixando(true);
    try {
      await apiDownloadPost(
        "/relatorio/xlsx",
        { aba, nomeArquivo, colunas, linhas },
        nomeArquivo,
        token,
      );
    } catch {
      // Falha de rede no download não deixa estado sujo; o browser já mostra o erro.
    } finally {
      setBaixando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void exportar()}
      disabled={vazio || baixando}
      aria-label="Exportar a lista em Excel"
      title={
        vazio
          ? "Nada para exportar nesta tela"
          : (titulo ??
            `Exportar em Excel (${linhas.length} linha${linhas.length > 1 ? "s" : ""})`)
      }
      className={
        className ??
        "btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-[13px] disabled:opacity-40"
      }
    >
      {baixando ? <Spinner /> : <ExcelLogo className="h-[18px] w-[18px]" />} Exportar Excel
    </button>
  );
}
