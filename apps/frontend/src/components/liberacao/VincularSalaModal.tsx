"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { caixaAlta } from "@/lib/nome";

export interface Sugestao {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  dataRecebimento: string;
  origem: "CLIENTE" | "SELECAO";
  codCliente: string;
  clienteRazao: string | null;
  clienteOperacao: string | null;
  cargoId: string;
  cargoNome: string | null;
  statusNome: string;
  score: number;
}

/** Cliente sempre com código (regra permanente do design system). */
function rotuloCliente(cod: string, operacao?: string | null, razao?: string | null): string {
  const nome = operacao || razao || "";
  return nome ? `${cod} - ${nome}` : cod;
}

function fmtData(d?: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

/**
 * VINCULAR À SALA DE ESPERA (onda 3, match manual).
 *
 * COMPONENTE PRÓPRIO de propósito (§A.26): a Liberação é a tela mais crítica do sistema, com mais de
 * 2.000 linhas, e o vínculo entra nela como um passo e um estado. Toda a busca, a escolha e a
 * confirmação moram aqui.
 *
 * ONDE ELE ENTRA: entre o clique em "Liberar Admissão" na linha e o modal de liberação. A tela só o
 * mostra quando a busca da Sala JÁ ACHOU alguém (`sugestoesIniciais` chega preenchida); sem ninguém
 * esperando, a liberação abre direto e este componente nem monta. Feche por onde fechar, o fluxo
 * SEGUE para a liberação: cancelar aqui é "seguir sem vincular", nunca desistir de liberar.
 *
 * O SISTEMA SUGERE, O OPERADOR DECIDE (decisão do diretor). A lista já abre pelo CPF e pelo nome do
 * candidato que chegou do Pandapé, então o caso comum é confirmar, não procurar. A ordem é a da
 * confiança: CPF é identidade, telefone é indício, nome é semelhança.
 *
 * O QUE ELE NÃO FAZ: não escreve nada na admissão. Devolve ao chamador o cliente e o cargo do
 * registro, e QUEM decide usar é a tela, que só preenche o que está VAZIO. O telefone é gravado pelo
 * backend do vínculo, e também só quando o candidato está sem telefone.
 */
export function VincularSalaModal({
  admissaoId,
  candidatoNome,
  candidatoCpf,
  candidatoTelefone,
  sugestoesIniciais,
  onClose,
}: {
  admissaoId: string;
  candidatoNome: string;
  candidatoCpf: string;
  candidatoTelefone?: string | null;
  /** O que a tela já achou ao clicar na linha. Evita a mesma busca duas vezes. */
  sugestoesIniciais?: Sugestao[];
  onClose: (vinculado: { codCliente: string; cargoId: string; nome: string } | null) => void;
}) {
  const { token } = useAuth();
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<Sugestao[]>(sugestoesIniciais ?? []);
  const [buscando, setBuscando] = useState(!sugestoesIniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [escolhido, setEscolhido] = useState<Sugestao | null>(null);

  const buscar = useCallback(
    async (q?: string) => {
      setBuscando(true);
      setErro(null);
      try {
        const p = new URLSearchParams();
        if (q && q.trim()) {
          // Busca manual: o operador procura por nome ou telefone.
          p.set("nome", q.trim());
          p.set("telefone", q.trim());
        } else {
          // Abertura: usa o que o Pandapé já trouxe. O CPF resolve sozinho quando os dois lados têm.
          if (candidatoCpf) p.set("cpf", candidatoCpf);
          if (candidatoNome) p.set("nome", candidatoNome);
          if (candidatoTelefone) p.set("telefone", candidatoTelefone);
        }
        setItens(await apiFetch<Sugestao[]>(`/sala-espera/match?${p.toString()}`, { token }));
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : "Falha ao buscar na Sala de Espera.");
      } finally {
        setBuscando(false);
      }
    },
    [token, candidatoCpf, candidatoNome, candidatoTelefone],
  );

  // Busca de abertura SÓ quando a tela não passou o resultado adiante. O caminho normal do botão da
  // linha já traz `sugestoesIniciais`, e repetir a consulta aqui seria a mesma pergunta duas vezes.
  const jaAbriu = useRef(Boolean(sugestoesIniciais));
  useEffect(() => {
    if (jaAbriu.current) return;
    jaAbriu.current = true;
    void buscar();
  }, [buscar]);

  async function confirmar() {
    if (!escolhido) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch(`/sala-espera/${escolhido.id}/vincular`, {
        token,
        method: "POST",
        body: { admissaoId },
      });
      onClose({
        codCliente: escolhido.codCliente,
        cargoId: escolhido.cargoId,
        nome: escolhido.nome,
      });
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao vincular.");
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={() => onClose(null)} ariaLabel="Vincular à Sala de Espera" className="max-w-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text">Vincular À Sala De Espera</h2>
          <p className="mt-0.5 truncate text-sm text-faint" title={caixaAlta(candidatoNome)}>
            {caixaAlta(candidatoNome)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onClose(null)}
          aria-label="Fechar"
          className="rounded-md p-1 text-faint transition hover:text-text"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="flex gap-2">
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void buscar(termo);
            }}
            placeholder="Buscar por nome ou telefone"
            className="ds-input flex-1"
            aria-label="Buscar na Sala de Espera"
          />
          <Button variant="secondary" onClick={() => void buscar(termo)} disabled={buscando}>
            Buscar
          </Button>
        </div>

        {erro && <p className="text-sm text-danger">{erro}</p>}

        <div className="ea-scroll max-h-[46vh] space-y-2 overflow-auto">
          {buscando ? (
            <p className="py-8 text-center text-sm text-faint">Buscando…</p>
          ) : itens.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">
              Nenhum registro em aberto na Sala para esta busca. Procure por nome ou telefone, ou
              siga sem vincular.
            </p>
          ) : (
            itens.map((s) => {
              const sel = escolhido?.id === s.id;
              // Score 100 = o CPF bateu. É identidade, não semelhança, e merece o destaque.
              const porCpf = s.score >= 100;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEscolhido(sel ? null : s)}
                  className={
                    "w-full rounded-xl border px-4 py-3 text-left transition " +
                    (sel
                      ? "border-[var(--accent)] bg-[var(--surface-2)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-2)]")
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold text-text">
                      {caixaAlta(s.nome)}
                    </span>
                    {porCpf && (
                      <span className="flex-none rounded-full bg-[rgba(91,214,138,0.15)] px-2 py-0.5 text-[11px] font-semibold text-ok">
                        CPF confere
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[13px] text-faint">
                    {rotuloCliente(s.codCliente, s.clienteOperacao, s.clienteRazao)}
                    {s.cargoNome ? ` · ${s.cargoNome}` : ""}
                  </div>
                  <div className="mt-0.5 text-[12px] text-faint">
                    Recebido em {fmtData(s.dataRecebimento)} ·{" "}
                    {s.origem === "CLIENTE" ? "Cliente" : "Seleção"} · {s.statusNome}
                    {s.telefone ? ` · ${s.telefone}` : ""}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <p className="text-xs text-faint">
          Ao vincular, o registro sai da fila da Sala e a liberação abre em seguida com cliente e
          cargo preenchidos. O telefone do registro entra no candidato apenas se ele estiver sem
          telefone: o que já está preenchido nunca é sobrescrito.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => onClose(null)} disabled={salvando}>
            Seguir sem vincular
          </Button>
          <Button onClick={() => void confirmar()} disabled={salvando || !escolhido}>
            {salvando ? "Vinculando…" : "Vincular"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
