"use client";

import { useRef, useState } from "react";
import { apiUpload, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * IMPORTAÇÃO DE LOJAS POR PLANILHA, com a IA lendo o cabeçalho (cenário 1, etapa 2).
 *
 * O FLUXO, e cada passo existe por um motivo:
 *  1. o consultor já está DENTRO da tela do cliente, então o cliente vem do contexto e a IA nunca o
 *     lê: é o que impede importar as lojas do CRM dentro do DIA;
 *  2. sobe a planilha em qualquer formato (XLSX ou CSV, decidido por magic bytes no backend);
 *  3. a IA diz QUAIS COLUNAS são nome, endereço e código, e a prévia aparece já aplicada;
 *  4. **cada coluna é um seletor editável**: o consultor CORRIGE, não só aceita ou rejeita, e a
 *     prévia recalcula na hora, sem chamar a IA de novo;
 *  5. o aplicar grava EXATAMENTE as linhas que apareceram na prévia (Q14, opção A).
 *
 * A IA ACELERA, NÃO HABILITA. Vertex fora, quota estourada ou coluna não reconhecida: o modal abre
 * com o mapeamento vazio, avisa, e o consultor escolhe as colunas na mão. Nunca vira "não dá para
 * cadastrar loja hoje".
 *
 * §A.11: sem travessão. §A.24: títulos e tags em Title Case.
 */

interface LinhaLoja {
  linha: number;
  nome: string;
  endereco: string | null;
  codigoExterno: string | null;
}

interface Mapeamento {
  colunaNome: number | null;
  colunaEndereco: number | null;
  colunaCodigo: number | null;
}

interface Previa {
  colunas: string[];
  mapeamento: Mapeamento;
  origemMapeamento: "IA" | "MANUAL" | "NENHUM";
  confianca: string | null;
  observacao: string | null;
  totalLinhas: number;
  descartadasPorTeto: number;
  tetoLinhas: number;
  colapsadas: number;
  criar: LinhaLoja[];
  jaExiste: { linha: number; nome: string; ativo: boolean; ganhaEndereco: boolean }[];
  rejeitadas: { linha: number; motivo: string }[];
}

const CAMPOS: { chave: keyof Mapeamento; rotulo: string }[] = [
  { chave: "colunaNome", rotulo: "Nome Da Loja" },
  { chave: "colunaEndereco", rotulo: "Endereço" },
  { chave: "colunaCodigo", rotulo: "Código" },
];

export function ImportarLojasModal({
  codCliente,
  onClose,
  onImportado,
}: {
  codCliente: string;
  onClose: () => void;
  onImportado: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Pede a prévia. Sem `mapa`, a IA decide; com `mapa`, é a correção e a IA não é consultada. */
  async function pedirPrevia(file: File, mapa?: Mapeamento) {
    setCarregando(true);
    setErro(null);
    try {
      const form = new FormData();
      // §A.6: o arquivo vai no CORPO, nunca em query string.
      form.append("file", file);
      if (mapa) form.append("mapeamento", JSON.stringify(mapa));
      setPrevia(
        await apiUpload<Previa>(`/admin/clientes/${encodeURIComponent(codCliente)}/lojas/importar/previa`, form),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler a planilha.");
      setPrevia(null);
    } finally {
      setCarregando(false);
    }
  }

  async function escolherArquivo(file: File | null) {
    setArquivo(file);
    setResultado(null);
    if (file) await pedirPrevia(file);
    else setPrevia(null);
  }

  /** O consultor corrigiu uma coluna: recalcula a prévia com o mapa novo, SEM a IA. */
  async function corrigirColuna(chave: keyof Mapeamento, valor: string) {
    if (!previa || !arquivo) return;
    const mapa: Mapeamento = { ...previa.mapeamento, [chave]: valor === "" ? null : Number(valor) };
    await pedirPrevia(arquivo, mapa);
  }

  async function aplicar() {
    if (!previa) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await apiFetch<{ criadas: number; enderecosPreenchidos: number; ignoradas: number }>(
        `/admin/clientes/${encodeURIComponent(codCliente)}/lojas/importar/aplicar`,
        { method: "POST", body: { linhas: previa.criar } },
      );
      setResultado(
        `${r.criadas} loja${r.criadas === 1 ? "" : "s"} criada${r.criadas === 1 ? "" : "s"}` +
          (r.enderecosPreenchidos > 0 ? `, ${r.enderecosPreenchidos} com endereço completado` : "") +
          (r.ignoradas > 0 ? `, ${r.ignoradas} já existiam e foram mantidas` : "") +
          ".",
      );
      setPrevia(null);
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      onImportado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar a importação.");
    } finally {
      setCarregando(false);
    }
  }

  const semNome = previa && previa.mapeamento.colunaNome === null;

  return (
    <Modal onClose={onClose} ariaLabel="Importar lojas" className="max-w-[820px] p-6">
      <div className="mb-4">
        <div className="eyebrow !mb-1">Lojas E Unidades</div>
        <h2 className="font-display text-xl font-bold">Importar Planilha</h2>
        <p className="mt-1 text-[13px] text-dim">
          Suba a planilha do jeito que ela veio. A leitura entende quais colunas são o nome, o
          endereço e o código, e você confere e corrige antes de gravar. Nada é gravado sem o seu
          aceite.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="ds-input"
        onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)}
        aria-label="Planilha de lojas"
      />

      {erro && (
        <p className="mt-3 rounded-lg border border-[var(--danger)] bg-[rgba(220,70,70,0.08)] px-3 py-2 text-xs text-[var(--danger)]">
          {erro}
        </p>
      )}
      {resultado && (
        <p className="mt-3 rounded-lg border border-[var(--ok)] bg-[rgba(120,190,60,0.10)] px-3 py-2 text-xs text-[var(--ok)]">
          {resultado}
        </p>
      )}
      {carregando && <p className="mt-3 text-xs text-dim">lendo a planilha</p>}

      {previa && (
        <div className="mt-4 grid gap-4">
          {/* O MAPEAMENTO, editável coluna a coluna. */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="ds-label">Colunas Da Planilha</span>
              <span className="text-[11px] text-dim">
                {previa.origemMapeamento === "IA"
                  ? `entendido automaticamente, confiança ${String(previa.confianca).toLowerCase()}`
                  : previa.origemMapeamento === "NENHUM"
                    ? "não foi possível entender sozinho, escolha as colunas"
                    : "ajustado por você"}
              </span>
            </div>
            {previa.observacao && previa.origemMapeamento === "IA" && (
              <p className="mb-2 text-[11px] text-dim">{previa.observacao}</p>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {CAMPOS.map((c) => (
                <label key={c.chave} className="grid gap-1">
                  <span className="ds-label">{c.rotulo}</span>
                  <select
                    className="ds-input"
                    value={previa.mapeamento[c.chave] ?? ""}
                    aria-label={`Coluna de ${c.rotulo}`}
                    onChange={(e) => void corrigirColuna(c.chave, e.target.value)}
                  >
                    <option value="">não existe na planilha</option>
                    {previa.colunas.map((nome, i) => (
                      <option key={i} value={i}>
                        {nome || `coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {semNome && (
              <p className="mt-2 text-xs text-[var(--danger)]">
                Escolha qual coluna tem o nome da loja para ver a prévia.
              </p>
            )}
          </div>

          {/* O QUE VAI ACONTECER. */}
          <div className="flex flex-wrap gap-4 text-xs text-dim">
            <span>
              <strong className="text-text">{previa.criar.length}</strong> a criar
            </span>
            <span>
              <strong className="text-text">{previa.jaExiste.length}</strong> já existem
            </span>
            <span>
              <strong className="text-text">{previa.rejeitadas.length}</strong> rejeitadas
            </span>
            {previa.colapsadas > 0 && <span>{previa.colapsadas} repetidas na planilha</span>}
            {previa.descartadasPorTeto > 0 && (
              <span className="text-[var(--danger)]">
                {previa.descartadasPorTeto} linhas acima do teto de {previa.tetoLinhas} foram
                descartadas
              </span>
            )}
          </div>

          {previa.criar.length > 0 && (
            <div className="max-h-[280px] overflow-auto rounded-xl border border-[var(--border)]">
              <table className="ds-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-center">Linha</th>
                    <th className="text-center">Nome</th>
                    <th className="text-center">Endereço</th>
                    <th className="text-center">Código</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.criar.map((l) => (
                    <tr key={l.linha}>
                      <td className="text-center font-mono text-dim">{l.linha}</td>
                      <td className="font-semibold">{l.nome}</td>
                      <td className="text-dim">
                        {l.endereco ?? <span className="text-faint">não informado</span>}
                      </td>
                      <td className="font-mono">
                        {l.codigoExterno ?? <span className="text-faint">não informado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previa.rejeitadas.length > 0 && (
            <div className="text-xs text-dim">
              <span className="ds-label">Linhas Rejeitadas</span>
              <ul className="mt-1 list-inside list-disc">
                {previa.rejeitadas.slice(0, 20).map((r) => (
                  <li key={r.linha}>
                    linha {r.linha}: {r.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
        <Button onClick={() => void aplicar()} disabled={carregando || !previa || previa.criar.length === 0}>
          Importar {previa ? `${previa.criar.length} Loja${previa.criar.length === 1 ? "" : "s"}` : ""}
        </Button>
      </div>
    </Modal>
  );
}
