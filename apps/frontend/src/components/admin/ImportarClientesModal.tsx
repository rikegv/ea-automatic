"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Pill } from "@/components/ui/Pill";
import {
  baixarModeloClientes,
  confirmarImportacaoClientes,
  enviarPreviaClientes,
  type PreviaImportacaoClientes,
  type RelatorioImportacaoClientes,
} from "@/lib/clientes-import";

/**
 * CADASTRO EM MASSA DE CLIENTES POR PLANILHA.
 *
 * O FLUXO, e cada passo existe por um motivo:
 *  1. baixar o MODELO (xlsx ou csv), para o time preencher no formato que a prévia entende;
 *  2. subir o arquivo, que dispara a PRÉVIA: o que vai entrar e o que é recusado, com o motivo por
 *     linha, antes de gravar nada;
 *  3. os códigos JÁ CADASTRADOS aparecem em destaque, porque não dá para cadastrar o mesmo código
 *     de novo e o time precisa saber disso sem adivinhar;
 *  4. o "Confirmar Importação" grava EXATAMENTE as linhas que a prévia disse que entram, e devolve o
 *     relatório final (quantas entraram e as que ainda foram recusadas na gravação).
 *
 * §A.41: modal de preenchimento, fecha por Cancelar ou Confirmar, nunca ao clicar fora (o `ui/Modal`
 * já garante isso). §A.11: sem travessão. §A.24: títulos e tags em Title Case. §A.12/§A.20: a máscara
 * única de tabela, colunas proporcionais sem esmagar o motivo nem o código.
 */
export function ImportarClientesModal({
  onClose,
  onConcluido,
}: {
  onClose: () => void;
  /** Chamado após a confirmação com sucesso: a página fecha o modal e recarrega a lista. */
  onConcluido: () => void;
}) {
  const { token } = useAuth();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaImportacaoClientes | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioImportacaoClientes["relatorio"] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function baixar(formato: "xlsx" | "csv") {
    setErro(null);
    try {
      await baixarModeloClientes(formato, token);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível baixar o modelo.");
    }
  }

  /** Pede a prévia. `aba` só vai quando a planilha tem mais de uma e o time trocou. */
  async function pedirPrevia(file: File, aba?: string | null) {
    setCarregando(true);
    setErro(null);
    setRelatorio(null);
    try {
      const p = await enviarPreviaClientes(file, token, aba);
      setPrevia(p);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler a planilha.");
      setPrevia(null);
    } finally {
      setCarregando(false);
    }
  }

  async function escolherArquivo(file: File | null) {
    setArquivo(file);
    setRelatorio(null);
    if (file) await pedirPrevia(file);
    else setPrevia(null);
  }

  async function trocarAba(nova: string) {
    if (!arquivo || nova === previa?.abaUsada) return;
    await pedirPrevia(arquivo, nova);
  }

  async function confirmar() {
    if (!previa || previa.aEntrar.length === 0) return;
    setConfirmando(true);
    setErro(null);
    try {
      const r = await confirmarImportacaoClientes(previa.aEntrar, token);
      // Sem recusada na gravação: nada a revisar, fecha e recarrega. Com recusada: mostra o
      // relatório para o time ver o que ficou de fora antes de sair.
      if (r.relatorio.recusadas.length === 0) {
        onConcluido();
        return;
      }
      setRelatorio(r.relatorio);
      setPrevia(null);
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar a importação.");
    } finally {
      setConfirmando(false);
    }
  }

  const optAbas = (previa?.abasDisponiveis ?? []).map((nome) => ({ value: nome, label: nome }));

  return (
    <Modal onClose={onClose} ariaLabel="Importar clientes" className="max-w-[860px] p-6">
      <div className="mb-4">
        <div className="eyebrow !mb-1">Clientes</div>
        <h2 className="font-display text-xl font-bold">Importar Clientes</h2>
        <p className="mt-1 text-[13px] text-dim">
          Baixe o modelo, preencha e suba. Nada é cadastrado sem o seu aceite: a prévia mostra o que
          vai entrar e o que foi recusado, linha por linha.
        </p>
      </div>

      {/* 1. BAIXAR O MODELO. Dois formatos, porque o time usa os dois. */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <span className="ds-label">Modelo Da Planilha</span>
        <p className="mt-1 text-[12px] text-dim">
          O modelo tem Código do Cliente, CNPJ, Razão Social e Nome da Operação. Copie, preencha e
          suba. Aceita .xlsx e .csv.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void baixar("xlsx")} className="px-3 py-1.5 text-[13px]">
            Baixar Modelo (xlsx)
          </Button>
          <Button variant="secondary" onClick={() => void baixar("csv")} className="px-3 py-1.5 text-[13px]">
            Baixar Modelo (csv)
          </Button>
        </div>
      </div>

      {/* 2. SUBIR O ARQUIVO. */}
      <label className="mt-4 grid gap-1">
        <span className="ds-label">Arquivo Preenchido</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="ds-input"
          onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)}
          aria-label="Planilha de clientes"
        />
      </label>

      {erro && (
        <p
          className="mt-3 rounded-lg border border-[var(--danger)] bg-[rgba(220,70,70,0.08)] px-3 py-2 text-xs text-[var(--danger)]"
          role="alert"
        >
          {erro}
        </p>
      )}
      {carregando && <p className="mt-3 text-xs text-dim">lendo a planilha</p>}

      {/* Troca de aba quando a planilha tem mais de uma. §A.35: Select do design system. */}
      {optAbas.length > 1 && (
        <label className="mt-3 grid max-w-[260px] gap-1">
          <span className="ds-label">Aba Da Planilha</span>
          <Select
            value={previa?.abaUsada ?? ""}
            onChange={(v) => void trocarAba(v)}
            options={optAbas}
            placeholder="Escolha a aba"
            ariaLabel="Aba da planilha a ser lida"
            disabled={carregando}
          />
        </label>
      )}

      {previa && (
        <div className="mt-4 grid gap-4">
          {/* RESUMO. */}
          <div className="flex flex-wrap gap-4 text-xs text-dim">
            <span>
              <strong className="text-text">{previa.resumo.total}</strong> no arquivo
            </span>
            <span>
              <strong className="text-[var(--ok)]">{previa.resumo.aEntrar}</strong> vão entrar
            </span>
            <span>
              <strong className="text-[var(--danger)]">{previa.resumo.recusadas}</strong> recusadas
            </span>
          </div>

          {/* CÓDIGOS JÁ CADASTRADOS: aviso explícito, porque o mesmo código não entra de novo. */}
          {previa.jaCadastrados.length > 0 && (
            <p className="rounded-lg border border-[var(--wn)] bg-[rgba(214,176,69,0.10)] px-3 py-2 text-xs text-dim">
              Estes códigos já estão cadastrados e não serão importados:{" "}
              <span className="font-mono text-text">{previa.jaCadastrados.join(", ")}</span>
            </p>
          )}

          {/* VÃO ENTRAR. */}
          {previa.aEntrar.length > 0 && (
            <div className="grid gap-1">
              <span className="ds-label">Vão Entrar</span>
              <div className="max-h-[240px] overflow-auto rounded-xl border border-[var(--border)]">
                <table className="ds-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="w-10 text-center">Linha</th>
                      <th className="w-28 text-center">Código</th>
                      <th className="text-center">Razão Social</th>
                      <th className="w-40 text-center">CNPJ</th>
                      <th className="text-center">Nome Da Operação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.aEntrar.map((l) => (
                      <tr key={`${l.linha}-${l.codCliente}`}>
                        <td className="text-center font-mono text-dim">{l.linha}</td>
                        <td className="text-center font-mono">
                          <Icone tom="ok" />
                          {l.codCliente}
                        </td>
                        <td className="font-semibold">{l.razaoSocial}</td>
                        <td className="font-mono">
                          {l.cnpj ?? <span className="text-faint">não informado</span>}
                        </td>
                        <td className="text-dim">
                          {l.nomeOperacao ?? <span className="text-faint">não informado</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RECUSADAS, com o MOTIVO por linha. */}
          {previa.recusadas.length > 0 && (
            <div className="grid gap-1">
              <span className="ds-label">Recusadas</span>
              <div className="max-h-[240px] overflow-auto rounded-xl border border-[var(--border)]">
                <table className="ds-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="w-10 text-center">Linha</th>
                      <th className="w-28 text-center">Código</th>
                      <th className="text-center">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.recusadas.map((l, i) => (
                      <tr key={`${l.linha}-${l.codCliente}-${i}`}>
                        <td className="text-center font-mono text-dim">{l.linha}</td>
                        <td className="text-center font-mono">
                          <Icone tom="dg" />
                          {l.codCliente || <span className="text-faint">não informado</span>}
                        </td>
                        <td className="text-dim">{l.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RELATÓRIO FINAL: só aparece depois de confirmar com recusadas na gravação. */}
      {relatorio && (
        <div className="mt-4 grid gap-3">
          <p className="rounded-lg border border-[var(--ok)] bg-[rgba(120,190,60,0.10)] px-3 py-2 text-xs text-[var(--ok)]">
            {relatorio.entraram} cliente{relatorio.entraram === 1 ? "" : "s"} cadastrado
            {relatorio.entraram === 1 ? "" : "s"}.
          </p>
          {relatorio.recusadas.length > 0 && (
            <div className="grid gap-1">
              <span className="ds-label">Recusadas Na Gravação</span>
              <div className="max-h-[240px] overflow-auto rounded-xl border border-[var(--border)]">
                <table className="ds-table w-full text-sm">
                  <thead>
                    <tr>
                      <th className="w-10 text-center">Linha</th>
                      <th className="w-28 text-center">Código</th>
                      <th className="text-center">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.recusadas.map((l, i) => (
                      <tr key={`${l.linha}-${l.codCliente}-${i}`}>
                        <td className="text-center font-mono text-dim">{l.linha}</td>
                        <td className="text-center font-mono">{l.codCliente || "não informado"}</td>
                        <td className="text-dim">{l.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={confirmando}>
          Cancelar
        </Button>
        <Button
          onClick={() => void confirmar()}
          disabled={carregando || confirmando || !previa || previa.aEntrar.length === 0}
        >
          {confirmando
            ? "Importando…"
            : previa
              ? `Confirmar Importação (${previa.aEntrar.length})`
              : "Confirmar Importação"}
        </Button>
      </div>
    </Modal>
  );
}

/** Ícone de estado por linha (§A.12): check verde = vai entrar, X vermelho = recusada. */
function Icone({ tom }: { tom: "ok" | "dg" }) {
  return (
    <Pill tone={tom} className="mr-1.5 !px-1.5 !py-0">
      {tom === "ok" ? "✓" : "✕"}
    </Pill>
  );
}
