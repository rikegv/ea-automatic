"use client";

import { useState } from "react";
import { apiDownloadPost } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ExcelLogo } from "@/components/ui/ExcelLogo";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Uma coluna da exportação: a chave que casa com a linha, o rótulo do cabeçalho, a largura opcional
 * e se é OBRIGATÓRIA. Coluna obrigatória entra em todo Excel, marcada e sem como desmarcar (Onda 3.1:
 * Nome, Telefone e E-mail são sempre presentes).
 */
export interface ColunaExport {
  chave: string;
  rotulo: string;
  largura?: number;
  obrigatoria?: boolean;
}

/**
 * Botão "Exportar Excel" compartilhado. Replica em várias telas o Excel que o Gerenciador já tem:
 * exporta as LINHAS JÁ VISÍVEIS na tela (SEM filtro vai tudo o que está na tela, COM filtro vai só o
 * que ficou). Não é por seleção de linha, é a tela inteira.
 *
 * SELEÇÃO DE COLUNAS (Onda 3.1): ao clicar, abre um seletor. Todas as colunas vêm DESMARCADAS por
 * padrão; "Marcar Todas" liga de uma vez. As obrigatórias (Nome, Telefone, E-mail) ficam sempre
 * marcadas e travadas. O Excel sai com as obrigatórias mais o que o usuário marcou.
 *
 * O backend (`POST /relatorio/xlsx`) só formata as colunas que recebe, não acessa dado novo. Sem
 * linha, o botão fica desabilitado.
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
  const [aberto, setAberto] = useState(false);
  const [baixando, setBaixando] = useState(false);
  // Chaves das colunas OPCIONAIS que o usuário marcou. As obrigatórias não entram aqui: estão
  // sempre presentes. Começa vazio = tudo desmarcado (Onda 3.1).
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const vazio = linhas.length === 0;

  const opcionais = colunas.filter((c) => !c.obrigatoria);
  const todasOpcionaisMarcadas = opcionais.length > 0 && opcionais.every((c) => marcadas.has(c.chave));

  function alternar(chave: string) {
    setMarcadas((cur) => {
      const prox = new Set(cur);
      if (prox.has(chave)) prox.delete(chave);
      else prox.add(chave);
      return prox;
    });
  }

  function marcarTodas() {
    setMarcadas(todasOpcionaisMarcadas ? new Set() : new Set(opcionais.map((c) => c.chave)));
  }

  async function exportar() {
    if (baixando || vazio) return;
    // Obrigatórias sempre; opcionais só as marcadas. A ordem original das colunas é preservada.
    const colunasFinais = colunas.filter((c) => c.obrigatoria || marcadas.has(c.chave));
    setBaixando(true);
    try {
      await apiDownloadPost(
        "/relatorio/xlsx",
        { aba, nomeArquivo, colunas: colunasFinais, linhas },
        nomeArquivo,
        token,
      );
      setAberto(false);
    } catch {
      // Falha de rede no download não deixa estado sujo; o browser já mostra o erro.
    } finally {
      setBaixando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={vazio}
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
        <ExcelLogo className="h-[18px] w-[18px]" /> Exportar Excel
      </button>

      {aberto && (
        <Modal
          onClose={() => setAberto(false)}
          className="max-w-md"
          ariaLabel="Escolher as colunas do Excel"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[17px] font-extrabold">Exportar Excel</h3>
              <p className="psub !mb-0 mt-1">
                Escolha as colunas. Nome, telefone e e-mail entram sempre.
              </p>
            </div>
            <button
              type="button"
              className="text-[13px] text-accent underline-offset-2 hover:underline"
              onClick={marcarTodas}
            >
              {todasOpcionaisMarcadas ? "Desmarcar todas" : "Marcar todas"}
            </button>
          </div>

          <div className="ea-scroll max-h-[46vh] overflow-auto rounded-xl border border-[var(--border)]">
            {colunas.map((c) => {
              const marcada = c.obrigatoria || marcadas.has(c.chave);
              return (
                <label
                  key={c.chave}
                  className="flex cursor-pointer items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-2)]"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                    checked={marcada}
                    disabled={c.obrigatoria}
                    onChange={() => alternar(c.chave)}
                  />
                  <span className="text-[13px]">{c.rotulo}</span>
                  {c.obrigatoria && <span className="text-[11.5px] text-faint">sempre</span>}
                </label>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAberto(false)} disabled={baixando}>
              Cancelar
            </Button>
            <Button onClick={() => void exportar()} disabled={baixando}>
              {baixando ? <Spinner /> : <ExcelLogo className="h-[18px] w-[18px]" />} Exportar
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
