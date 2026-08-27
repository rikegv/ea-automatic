"use client";

import { useMemo, useState } from "react";
import {
  COLUNAS_RELATORIO,
  COLUNAS_RELATORIO_PADRAO,
  GRUPOS_COLUNA_RELATORIO,
  ROTULO_GRUPO_COLUNA_RELATORIO,
  type GrupoColunaRelatorio,
} from "@ea/shared-types";
import { apiDownload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ExcelLogo } from "@/components/ui/ExcelLogo";

/**
 * Nome do arquivo salvo. O backend manda o mesmo nome no Content-Disposition, mas o `apiDownload`
 * (GET) usa o nome que recebe aqui, então a data do dia é montada dos dois lados com a mesma regra.
 * Data no nome para o relatório de hoje não sobrescrever o da semana passada na pasta de Downloads.
 */
function nomeDoArquivo(agora: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `relatorio-candidatos-${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}.xlsx`;
}

/**
 * RELATÓRIO EXPORTÁVEL DE CANDIDATOS (melhorias EAC, item 11c).
 *
 * O consultor MARCA as colunas e baixa o xlsx. Duas coisas sustentam a tela:
 *
 * 1. A LISTA DE COLUNAS VEM DO CATÁLOGO COMPARTILHADO (`@ea/shared-types`), o mesmo que o backend
 *    valida. Coluna nova aparece aqui e passa a ser aceita lá no mesmo commit, sem lista dobrada.
 * 2. O RECORTE É O DA TELA: a query string dos filtros do Gerenciador chega pronta em `filtrosQs`.
 *    O modal não filtra nada por conta própria, só acrescenta as colunas.
 *
 * Nada é escrito no banco: exportar é leitura pura.
 */
export function ExportarRelatorioModal({
  filtrosQs,
  totalFiltrado,
  temFiltro,
  onClose,
  onExportado,
}: {
  /** Query string dos filtros ATIVOS na tela (sem paginação). */
  filtrosQs: URLSearchParams;
  /** Quantas admissões o filtro atual devolve (o que vai para o arquivo). */
  totalFiltrado: number;
  temFiltro: boolean;
  onClose: () => void;
  onExportado: (msg: string) => void;
}) {
  const { token } = useAuth();
  const [marcadas, setMarcadas] = useState<string[]>([...COLUNAS_RELATORIO_PADRAO]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * GRUPOS ABERTOS. São 113 colunas em 14 grupos, e a lista toda aberta vira uma rolagem que o
   * consultor percorre sem achar nada. Abertos ao entrar ficam SÓ os grupos que já têm coluna
   * marcada, que ao abrir o modal são os do padrão: quem só quer nome e telefone vê duas caixas,
   * quem quer o resto abre o bloco que precisa.
   */
  const [abertos, setAbertos] = useState<string[]>(() =>
    Array.from(
      new Set(
        COLUNAS_RELATORIO.filter((c) => COLUNAS_RELATORIO_PADRAO.includes(c.chave)).map(
          (c) => c.grupo as string,
        ),
      ),
    ),
  );

  const porGrupo = useMemo(
    () =>
      GRUPOS_COLUNA_RELATORIO.map((grupo: GrupoColunaRelatorio) => ({
        grupo,
        colunas: COLUNAS_RELATORIO.filter((c) => c.grupo === grupo),
      })),
    [],
  );

  function alternarGrupo(grupo: string) {
    setAbertos((cur) => (cur.includes(grupo) ? cur.filter((g) => g !== grupo) : [...cur, grupo]));
  }

  /**
   * "Marcar tudo do grupo" é um INTERRUPTOR: com o grupo inteiro marcado, o mesmo botão desmarca.
   * Não mexe em nada fora do grupo, então marcar Frentes não apaga o que já estava marcado em
   * Candidato.
   */
  function alternarTudoDoGrupo(grupo: string) {
    setErro(null);
    const chaves = COLUNAS_RELATORIO.filter((c) => c.grupo === grupo).map((c) => c.chave);
    setMarcadas((cur) =>
      chaves.every((k) => cur.includes(k))
        ? cur.filter((k) => !chaves.includes(k))
        : [...cur, ...chaves.filter((k) => !cur.includes(k))],
    );
  }

  function alternar(chave: string) {
    setErro(null);
    setMarcadas((cur) =>
      cur.includes(chave) ? cur.filter((c) => c !== chave) : [...cur, chave],
    );
  }

  const todasMarcadas = marcadas.length === COLUNAS_RELATORIO.length;

  async function exportar() {
    if (!marcadas.length) {
      setErro("Marque pelo menos uma coluna para gerar o relatório.");
      return;
    }
    setGerando(true);
    setErro(null);
    const qs = new URLSearchParams(filtrosQs);
    qs.set("colunas", marcadas.join(","));
    try {
      await apiDownload(`/admissoes/relatorio?${qs.toString()}`, nomeDoArquivo(new Date()), token);
      onExportado(
        `Relatório gerado com ${totalFiltrado} ${totalFiltrado === 1 ? "candidato" : "candidatos"}.`,
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-3xl" ariaLabel="Exportar Relatório">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface-1)]">
          <ExcelLogo className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold">Exportar Relatório</h3>
          <p className="psub !mb-0 mt-1">
            {temFiltro
              ? `Marque as colunas do arquivo. Saem as ${totalFiltrado} ${totalFiltrado === 1 ? "admissão" : "admissões"} do filtro atual da tela.`
              : `Marque as colunas do arquivo. Saem todas as ${totalFiltrado} admissões, sem filtro na tela.`}
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] text-faint">
          {marcadas.length} de {COLUNAS_RELATORIO.length} colunas marcadas
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-[13px]"
            onClick={() => {
              setErro(null);
              setMarcadas(todasMarcadas ? [] : COLUNAS_RELATORIO.map((c) => c.chave));
              if (!todasMarcadas) setAbertos([...GRUPOS_COLUNA_RELATORIO]);
            }}
          >
            {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
          </button>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-[13px]"
            onClick={() => {
              setErro(null);
              setMarcadas([...COLUNAS_RELATORIO_PADRAO]);
              setAbertos(
                Array.from(
                  new Set(
                    COLUNAS_RELATORIO.filter((c) =>
                      COLUNAS_RELATORIO_PADRAO.includes(c.chave),
                    ).map((c) => c.grupo as string),
                  ),
                ),
              );
            }}
          >
            Voltar ao padrão
          </button>
        </div>
      </div>

      <div className="ea-scroll max-h-[52vh] space-y-2 overflow-auto pr-1">
        {porGrupo.map(({ grupo, colunas }) => {
          const aberto = abertos.includes(grupo);
          const noGrupo = colunas.filter((c) => marcadas.includes(c.chave)).length;
          const todasDoGrupo = noGrupo === colunas.length;
          return (
            <section
              key={grupo}
              className="overflow-hidden rounded-xl border border-[var(--border)]"
            >
              <div className="flex items-center gap-2 bg-[var(--surface-1)] px-3 py-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => alternarGrupo(grupo)}
                  aria-expanded={aberto}
                >
                  <Icon
                    name="right"
                    className={`h-4 w-4 flex-none text-faint transition-transform ${aberto ? "rotate-90" : ""}`}
                  />
                  <span className="truncate text-[13px] font-bold">
                    {ROTULO_GRUPO_COLUNA_RELATORIO[grupo]}
                  </span>
                  <span className="flex-none text-[12px] text-faint">
                    {noGrupo} de {colunas.length}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-none px-2.5 py-1 text-[12px]"
                  onClick={() => alternarTudoDoGrupo(grupo)}
                >
                  {todasDoGrupo ? "Desmarcar grupo" : "Marcar grupo"}
                </button>
              </div>
              {aberto && (
                <div className="grid grid-cols-1 gap-1.5 p-2.5 sm:grid-cols-2">
                  {colunas.map((c) => {
                    const marcada = marcadas.includes(c.chave);
                    return (
                      <label
                        key={c.chave}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-[13.5px] transition hover:bg-[var(--surface-2)]"
                        title={c.rotulo}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 flex-none accent-[var(--accent)]"
                          checked={marcada}
                          onChange={() => alternar(c.chave)}
                        />
                        <span className="truncate">{c.rotulo}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {erro && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {erro}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={gerando}>
          Cancelar
        </Button>
        <Button
          className="inline-flex items-center gap-2 px-4 py-2.5"
          onClick={exportar}
          disabled={gerando || marcadas.length === 0}
        >
          <Icon name="download" className="h-4 w-4" />
          {gerando ? "Gerando…" : "Exportar Em Excel"}
        </Button>
      </div>
    </Modal>
  );
}
