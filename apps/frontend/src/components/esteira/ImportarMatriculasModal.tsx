"use client";

import { useRef, useState } from "react";
import { apiFetch, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { caixaAlta } from "@/lib/nome";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ExcelLogo } from "@/components/ui/ExcelLogo";

/**
 * IMPORTAÇÃO DE MATRÍCULAS (melhoria EAC, item 11d).
 *
 * DUAS ETAPAS, e a primeira NÃO GRAVA: sobe a planilha, o sistema mostra linha a linha o que casou e
 * o que ficou de fora, e só então o time confirma. Importação que grava direto é importação que
 * ninguém confere, e o estrago aparece depois, espalhado por N admissões.
 *
 * O QUE NÃO CASA NÃO TRAVA O LOTE (decisão do diretor): as linhas problemáticas ficam listadas com o
 * motivo, para o time corrigir na planilha e reimportar só elas, enquanto as que casaram já entram.
 *
 * A ESCRITA É A MESMA DO MODAL de edição, com a trilha campo a campo: quem olhar a trilha de uma
 * admissão não distingue "veio da planilha" de "alguém digitou", e é assim que tem de ser.
 *
 * MORA NA FRENTE DE CADASTRO (decisão do diretor), e não no Gerenciador: é o time de cadastro que
 * recebe a planilha da folha e lança as matrículas, então o botão fica onde o trabalho acontece. Só
 * o LUGAR mudou; a mecânica (prévia antes de gravar, casamento por CPF, linha que não casa não trava
 * o lote, trilha campo a campo) é a mesma, byte a byte.
 */

interface Casou {
  admissaoId: string;
  cpf: string;
  candidato: string;
  matriculaAtual: string | null;
  matricula: string;
}

interface NaoCasou {
  linha: number;
  cpf: string | null;
  matricula: string | null;
  motivo: string;
}

export function ImportarMatriculasModal({
  onClose,
  onAplicado,
}: {
  onClose: () => void;
  onAplicado: (mensagem: string) => void | Promise<void>;
}) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<{ casaram: Casou[]; naoCasaram: NaoCasou[]; total: number } | null>(
    null,
  );
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [lendo, setLendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function subir(file: File) {
    setLendo(true);
    setErro(null);
    setPrevia(null);
    setNomeArquivo(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setPrevia(await apiUpload("/admissoes/matriculas/previa", fd, token));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao ler a planilha.");
    } finally {
      setLendo(false);
    }
  }

  async function aplicar() {
    if (!previa?.casaram.length) return;
    setAplicando(true);
    setErro(null);
    try {
      const r = await apiFetch<{ gravadas: number; semMudanca: number }>("/admissoes/matriculas", {
        method: "PATCH",
        token,
        body: {
          itens: previa.casaram.map((c) => ({ admissaoId: c.admissaoId, matricula: c.matricula })),
        },
      });
      // A resposta separa o que MUDOU do que já estava igual: reimportar a mesma planilha é seguro, e
      // o time precisa saber que a segunda vez não fez nada em vez de achar que gravou tudo de novo.
      await onAplicado(
        r.semMudanca > 0
          ? `${r.gravadas} matrícula(s) gravada(s). ${r.semMudanca} já estava(m) com o mesmo valor.`
          : `${r.gravadas} matrícula(s) gravada(s).`,
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao gravar as matrículas.");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-3xl" ariaLabel="Importar Matrículas">
      <h2 className="mb-1 text-[19px] font-semibold text-text">Importar Matrículas</h2>
      <p className="mb-4 text-sm text-dim">
        A planilha precisa ter o CPF e a matrícula, uma pessoa por linha. A ordem das colunas não
        importa, o CPF pode vir com ou sem pontuação, e o arquivo pode ser xlsx ou csv.
      </p>

      {erro && (
        <p
          className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={lendo} className="px-4 py-2">
          <ExcelLogo className="h-4 w-4" />
          {lendo ? "Lendo…" : "Escolher planilha"}
        </Button>
        {nomeArquivo && <span className="text-[12.5px] text-dim">{nomeArquivo}</span>}
        {/* O formato aceito fica dito na tela, e não só na mensagem de erro: quem exporta do Excel
            precisa saber ANTES de tentar. */}
        <span className="ml-auto text-[12px] text-faint">formatos aceitos: xlsx e csv</span>
      </div>

      {previa && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-lg border border-[var(--ok)] px-2.5 py-1 text-[12.5px] font-semibold text-ok">
              {previa.casaram.length} casaram
            </span>
            {previa.naoCasaram.length > 0 && (
              <span className="rounded-lg border border-[var(--danger)] px-2.5 py-1 text-[12.5px] font-semibold text-danger">
                {previa.naoCasaram.length} não casaram
              </span>
            )}
            <span className="text-[12.5px] text-faint">{previa.total} linha(s) na planilha</span>
          </div>

          <div className="ea-scroll max-h-[40vh] overflow-y-auto">
            {previa.casaram.length > 0 && (
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    <th className="w-[38%]">Candidato</th>
                    <th className="w-[20%]">CPF</th>
                    <th className="w-[21%]">Matrícula atual</th>
                    <th className="w-[21%]">Vai ficar</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.casaram.map((c) => (
                    <tr key={c.admissaoId}>
                      <td className="font-semibold">{caixaAlta(c.candidato)}</td>
                      <td className="text-center tabular-nums">{c.cpf}</td>
                      <td className="text-center tabular-nums text-dim">
                        {c.matriculaAtual ?? "não informado"}
                      </td>
                      <td className="text-center font-semibold tabular-nums">{c.matricula}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {previa.naoCasaram.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Não Casaram
                </h3>
                <div className="flex flex-col gap-1.5">
                  {previa.naoCasaram.map((n, i) => (
                    <div
                      key={`${n.linha}-${i}`}
                      className="flex flex-wrap items-baseline gap-x-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px]"
                    >
                      <span className="font-semibold text-text">linha {n.linha}</span>
                      <span className="tabular-nums text-dim">{n.cpf ?? "sem CPF"}</span>
                      <span className="tabular-nums text-dim">{n.matricula ?? "sem matrícula"}</span>
                      <span className="ml-auto text-danger">{n.motivo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex items-center gap-3">
        {previa && previa.casaram.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-warn">
            <Icon name="alert" className="h-4 w-4" />
            Nenhuma linha casou, nada será gravado.
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-dim transition hover:text-text"
          >
            Cancelar
          </button>
          <Button
            onClick={aplicar}
            disabled={!previa?.casaram.length || aplicando}
            className="px-4 py-2"
          >
            {aplicando
              ? "Gravando…"
              : `Gravar ${previa?.casaram.length ?? 0} matrícula(s)`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
