"use client";

/**
 * ─ ADICIONAR VÁRIOS CANDIDATOS AO FUNIL DA VAGA (grupo 1 da A&S) ──────────────────────────────
 *
 * ┌─ ESTE BOTÃO É O QUE **NÃO** CONSOME POSIÇÃO, e a separação é decisão do diretor ────────────┐
 * │ TRAZER GENTE PARA O FUNIL e ENTREGAR A POSIÇÃO são dois gestos com consequências            │
 * │ diferentes: quem entra por aqui nasce `ATIVO`, e `ATIVO` não ocupa nada, então uma vaga de   │
 * │ 10 recebe 40 currículos sem que a meta se mexa. Quem ENTREGA é a finalização de posição, que │
 * │ tem botão próprio, na barra da seleção, e é a que consome a meta. Um clique errado não pode  │
 * │ queimar posição, e é por isso que os dois rótulos dizem exatamente o que fazem.              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A LISTA É A MESMA DO "ALOCAR CANDIDATO" INDIVIDUAL (`POST /as/candidatos/buscar` com
 * `semCandidatura: true`): quem está na base e não está em vaga nenhuma, inclusive quem foi
 * cadastrado sem CPF. É o caminho que NÃO passa pelo CPF, e ele continua valendo aqui: a escolha é
 * pelo NOME e a adição segue por `id`, que sempre foi a chave da tabela.
 *
 * §A.6, e ela é mais rígida em massa: a lista devolve nome, cidade/UF, origem e `temCpf`, um
 * BOOLEANO. O número não trafega, não é filtrável aqui e não aparece na lista de falhas. Nenhuma URL
 * desta tela carrega dado de pessoa.
 *
 * §A.11 (sem travessão; vazio é "não informado"), §A.24 (title case no título e nas etiquetas; o
 * botão é AÇÃO e segue escrita normal), §A.35 (nenhum `<select>` cru neste arquivo).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AS_CANDIDATO_ORIGEM_LABEL,
  AS_MAXIMO_POR_LOTE,
  type AsCandidatoListItem,
  type AsResultadoEmMassa,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { buscarCandidatos, mensagemDoErro } from "@/lib/as-candidatos";
import { adicionarCandidatosEmLote } from "@/lib/as-candidatos-lote";
import { ResultadoLoteModal } from "@/components/as/vagas/ResultadoLoteModal";

/** Normaliza para a busca da lista: minúsculas, sem acento. Mesma régua do `Select` do DS. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function AdicionarCandidatosEmLoteModal({
  vaga,
  token,
  onClose,
  onFeito,
}: {
  vaga: VagaListItem;
  token: string | null;
  onClose: () => void;
  /** Relê a lista da vaga e avisa a Central de Vagas. */
  onFeito: () => void;
}) {
  const [disponiveis, setDisponiveis] = useState<AsCandidatoListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    dados: AsResultadoEmMassa;
    nomes: Map<string, string>;
  } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDisponiveis(await buscarCandidatos({ semCandidatura: true }, token));
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar os candidatos disponíveis."));
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /*
   * A BUSCA ENTRA NO MESMO MEMO QUE PRODUZ OS VISÍVEIS, e não num filtro por fora, porque é dele que
   * sai o "selecionar todos". Filtrar em outro lugar faria o "todos" marcar gente que a pessoa não
   * está vendo, que é exatamente o que a régua desta casa proíbe (o mesmo desenho do Alto Volume).
   */
  const visiveis = useMemo(() => {
    const q = norm(busca.trim());
    return q ? disponiveis.filter((c) => norm(c.nome).includes(q)) : disponiveis;
  }, [disponiveis, busca]);

  const idsVisiveis = useMemo(() => visiveis.map((c) => c.id), [visiveis]);
  const todosVisiveisMarcados =
    idsVisiveis.length > 0 && idsVisiveis.every((id) => marcados.includes(id));

  function alternar(id: string) {
    setMarcados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  /**
   * "TODOS" OPERA SOBRE O QUE ESTÁ À VISTA, e desmarcar tira SÓ os visíveis: quem foi marcado antes
   * de a busca ser digitada continua marcado, porque desmarcá-lo em silêncio apagaria uma escolha
   * que a pessoa fez e não está vendo.
   */
  function alternarTodos() {
    setMarcados((atual) =>
      todosVisiveisMarcados
        ? atual.filter((id) => !idsVisiveis.includes(id))
        : [...new Set([...atual, ...idsVisiveis])],
    );
  }

  const acimaDoTeto = marcados.length > AS_MAXIMO_POR_LOTE;

  async function adicionar() {
    // §A.6: o mapa de nomes é da MEMÓRIA da tela, congelado antes da chamada, e é ele que dá nome à
    // lista de falhas. A resposta do backend traz só o id, de propósito.
    const nomes = new Map(disponiveis.map((c) => [c.id, c.nome]));
    setErro(null);
    setEnviando(true);
    try {
      const dados = await adicionarCandidatosEmLote(vaga.id, marcados, token);
      setConfirmando(false);
      setMarcados([]);
      setResultado({ dados, nomes });
      onFeito();
      // A lista de disponíveis mudou: quem entrou na vaga deixou de estar sem candidatura.
      void carregar();
    } catch (err) {
      setConfirmando(false);
      setErro(mensagemDoErro(err, "Falha ao adicionar os candidatos à vaga."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-[680px] p-0" ariaLabel="Adicionar candidatos à vaga">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Adicionar Candidatos À Vaga</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            A lista traz quem está na base e não está em vaga nenhuma, inclusive quem foi cadastrado
            sem CPF. Quem entra nasce em Captação, como Em Seleção, e não ocupa posição da meta:
            entregar a posição é a outra ação, na barra da seleção.
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {carregando ? (
            <p className="text-[13px] text-faint">Carregando os candidatos disponíveis.</p>
          ) : disponiveis.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-dim">
              Todo mundo que está na base já foi alocado em alguma vaga. Para trazer alguém novo, use
              o botão Cadastrar candidato.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <input
                  className="ds-input min-w-[220px] flex-1"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Procurar pelo nome"
                  aria-label="Procurar candidato pelo nome"
                />
                <label className="flex items-center gap-2 text-[12.5px] text-dim">
                  <input
                    type="checkbox"
                    checked={todosVisiveisMarcados}
                    onChange={alternarTodos}
                    disabled={idsVisiveis.length === 0}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Selecionar todos os visíveis
                </label>
                <span className="text-[12.5px] text-dim">
                  selecionados:{" "}
                  <span className="font-semibold tabular-nums text-text">{marcados.length}</span>
                </span>
              </div>

              {visiveis.length === 0 ? (
                <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-dim">
                  Ninguém com esse nome está disponível na base.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {visiveis.map((c) => {
                    const marcada = marcados.includes(c.id);
                    const lugar = c.cidade
                      ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}`
                      : "cidade não informada";
                    return (
                      <li key={c.id}>
                        <label
                          className={
                            marcada
                              ? "flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--accent)] bg-[var(--surface-2)] px-3.5 py-2.5"
                              : "flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
                          }
                        >
                          <input
                            type="checkbox"
                            checked={marcada}
                            onChange={() => alternar(c.id)}
                            className="h-4 w-4 flex-none accent-[var(--accent)]"
                            aria-label={`Selecionar ${c.nome}`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-text">
                              {c.nome}
                            </span>
                            {/* §A.6: cidade, origem e SE tem CPF. Nunca qual é o número. */}
                            <span className="block text-[11.5px] text-faint">
                              {lugar} · {AS_CANDIDATO_ORIGEM_LABEL[c.origem]}
                              {c.temCpf ? "" : " · sem CPF"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {acimaDoTeto && (
                <p className="mt-3 text-[12px] text-warn">
                  O sistema adiciona no máximo {AS_MAXIMO_POR_LOTE} pessoas por vez. Reduza a
                  seleção antes de confirmar.
                </p>
              )}
            </>
          )}

          {erro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            className="px-4 py-2.5"
            disabled={enviando || marcados.length === 0 || acimaDoTeto}
            onClick={() => setConfirmando(true)}
          >
            {`Adicionar ao funil (${marcados.length})`}
          </Button>
        </div>
      </div>

      {/* A CONFIRMAÇÃO ANTES, como em toda ação em massa desta frente. Ela diz o que NÃO acontece
          ("não consome posição"), porque é justamente essa a dúvida que separa este botão do outro. */}
      <ConfirmDialog
        open={confirmando}
        title="Adicionar Ao Funil Da Vaga"
        message={`${marcados.length === 1 ? "1 pessoa entra" : `${marcados.length} pessoas entram`} no funil desta vaga, em Captação e como Em Seleção. Isto não consome posição da meta: a entrega é a finalização de posição, que é outra ação. Quem já teve processo encerrado nesta vaga volta na lista de falhas, para ser trazida de volta pela ação da própria linha.`}
        confirmLabel="Adicionar ao funil"
        busy={enviando}
        onConfirm={() => void adicionar()}
        onCancel={() => setConfirmando(false)}
      />

      {resultado && (
        <ResultadoLoteModal
          titulo="Adicionar Ao Funil Em Massa"
          resultado={resultado.dados}
          nomes={resultado.nomes}
          onClose={() => setResultado(null)}
        />
      )}
    </Modal>
  );
}
