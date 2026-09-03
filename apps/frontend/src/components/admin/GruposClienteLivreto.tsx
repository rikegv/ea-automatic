"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

/**
 * O LIVRETO DOS GRUPOS DE CLIENTE (cenário 2, etapa 1).
 *
 * O FORMATO É O DA SALA DE ESPERA, e por um motivo prático: são duas listas que só fazem sentido
 * lado a lado. À esquerda o grupo (o nome, ex "CAGC Corifeu"); à direita todos os CNPJs, com busca,
 * para TICAR quais entram. A lombada no meio é o elo.
 *
 * POR QUE ESTA TELA EXISTE. A Raia tem 98 códigos de cliente com a MESMA razão social, e o
 * agrupamento administrativo vive escrito à mão no apelido, em nove grafias. Montar o Corifeu é
 * ticar 53 códigos de uma vez; fazer isso abrindo 53 fichas de cliente seria a tarefa errada.
 *
 * A MARCAÇÃO É A VERDADE FINAL. O que está ticado fica no grupo, o que foi desticado sai dele. Por
 * isso a gravação passa por uma PRÉVIA do servidor: ela diz, antes, quem entra, quem SAI de outro
 * grupo e quem deixa de ter grupo. As admissões antigas nunca se mexem, e a tela diz isso em texto,
 * porque é a parte contraintuitiva.
 *
 * §A.11: sem travessão. §A.24: títulos e tags em Title Case. §A.35: nenhum seletor nativo.
 */

interface GrupoResumo {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  membros: number;
  admissoesCarimbadas: number;
}

interface ClienteDoCatalogo {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
  cnpj: string | null;
  grupoId: string | null;
  grupoNome: string | null;
}

interface Efeito {
  codCliente: string;
  /** Quantas admissões deste CNPJ o salvar vai carimbar (ou descarimbar). */
  admissoes: number;
  efeito: "ENTRA" | "TROCA" | "JA_ESTA" | "SAI";
  deGrupoNome?: string;
  razaoSocial?: string;
  nomeOperacao?: string | null;
}

interface Previa {
  grupo: { id: string; nome: string };
  resumo: {
    entram: number;
    trocam: number;
    saem: number;
    jaEstao: number;
    /** O ALCANCE REAL do clique: "entra 1 CNPJ" e "entram 164 admissões" são frases diferentes. */
    admissoesACarimbar: number;
    admissoesADescarimbar: number;
  };
  efeitos: Efeito[];
}

const rotulo = (c: { codCliente: string; nomeOperacao: string | null; razaoSocial: string }) =>
  `${c.codCliente} · ${c.nomeOperacao?.trim() || c.razaoSocial}`;

export function GruposClienteLivreto({ onFechar }: { onFechar: () => void }) {
  const [grupos, setGrupos] = useState<GrupoResumo[]>([]);
  const [catalogo, setCatalogo] = useState<ClienteDoCatalogo[]>([]);
  const [grupoId, setGrupoId] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [soMarcados, setSoMarcados] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [gs, cs] = await Promise.all([
      apiFetch<GrupoResumo[]>("/admin/grupos-cliente"),
      apiFetch<ClienteDoCatalogo[]>("/admin/grupos-cliente/clientes"),
    ]);
    setGrupos(gs);
    setCatalogo(cs);
  }, []);

  useEffect(() => {
    void carregar().catch(() => setErro("Não foi possível carregar os grupos."));
  }, [carregar]);

  // Trocar de grupo recarrega a marcação a partir do catálogo, que já sabe de quem é cada CNPJ.
  useEffect(() => {
    if (!grupoId) return setMarcados(new Set());
    setMarcados(new Set(catalogo.filter((c) => c.grupoId === grupoId).map((c) => c.codCliente)));
  }, [grupoId, catalogo]);

  const grupo = grupos.find((g) => g.id === grupoId) ?? null;

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return catalogo.filter((c) => {
      if (soMarcados && !marcados.has(c.codCliente)) return false;
      if (!q) return true;
      // A busca casa os três, porque a pessoa procura pelo que tem na cabeça, e nem sempre é o mesmo:
      // o código que veio na planilha, a razão social, ou o apelido da operação.
      return `${c.codCliente} ${c.razaoSocial} ${c.nomeOperacao ?? ""}`.toLowerCase().includes(q);
    });
  }, [catalogo, busca, soMarcados, marcados]);

  function alternar(cod: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(cod)) novo.delete(cod);
      else novo.add(cod);
      return novo;
    });
  }

  /** Marca TODOS os que a busca deixou à vista. Nunca a lista inteira: marcar o que não se vê é o erro. */
  function marcarVisiveis() {
    setMarcados((atual) => new Set([...atual, ...visiveis.map((c) => c.codCliente)]));
  }

  async function criarGrupo() {
    if (!novoNome.trim()) return;
    setOcupado(true);
    setErro(null);
    try {
      const g = await apiFetch<GrupoResumo>("/admin/grupos-cliente", {
        method: "POST",
        body: { nome: novoNome.trim() },
      });
      setNovoNome("");
      await carregar();
      setGrupoId(g.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o grupo.");
    } finally {
      setOcupado(false);
    }
  }

  async function alternarAtivo() {
    if (!grupo) return;
    setOcupado(true);
    try {
      await apiFetch(`/admin/grupos-cliente/${grupo.id}`, {
        method: "PATCH",
        body: { ativo: !grupo.ativo },
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível mudar o grupo.");
    } finally {
      setOcupado(false);
    }
  }

  /** Pede ao SERVIDOR o que vai acontecer. O grupo de cada CNPJ pode ter mudado com a tela aberta. */
  async function pedirPrevia() {
    if (!grupoId) return;
    setOcupado(true);
    setErro(null);
    try {
      setPrevia(
        await apiFetch<Previa>(`/admin/grupos-cliente/${grupoId}/membros/previa`, {
          method: "POST",
          body: { codClientes: [...marcados] },
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível calcular a prévia.");
    } finally {
      setOcupado(false);
    }
  }

  async function gravar() {
    if (!grupoId) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await apiFetch<{
        entram: number;
        trocam: number;
        saem: number;
        total: number;
        admissoesACarimbar: number;
        admissoesADescarimbar: number;
      }>(
        `/admin/grupos-cliente/${grupoId}/membros`,
        { method: "POST", body: { codClientes: [...marcados] } },
      );
      setPrevia(null);
      await carregar();
      // O aviso diz o que ACONTECEU com as admissões, e não só com os CNPJs: é o número que a
      // pessoa vai procurar no painel um segundo depois.
      setAviso(
        `Grupo salvo com ${r.total} CNPJ${r.total === 1 ? "" : "s"}.` +
          (r.trocam > 0 ? ` ${r.trocam} veio(vieram) de outro grupo.` : "") +
          (r.saem > 0 ? ` ${r.saem} saiu(saíram) do grupo.` : "") +
          (r.admissoesACarimbar > 0
            ? ` ${r.admissoesACarimbar} admissão(ões) entrou(entraram) no grupo.`
            : "") +
          (r.admissoesADescarimbar > 0
            ? ` ${r.admissoesADescarimbar} ficou(ficaram) sem grupo.`
            : ""),
      );
    } catch (e) {
      setPrevia(null);
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o grupo.");
    } finally {
      setOcupado(false);
    }
  }

  const mudou =
    grupoId !== null &&
    (marcados.size !== (grupo?.membros ?? 0) ||
      catalogo.some((c) => (c.grupoId === grupoId) !== marcados.has(c.codCliente)));

  return (
    <Modal onClose={onFechar} ariaLabel="Cadastrar grupos de cliente" className="max-w-5xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Clientes</div>
          <h2 className="font-display text-xl font-bold">Cadastrar Grupos</h2>
        </div>
        <span className="shrink-0 text-[11.5px] text-faint">
          o grupo junta CNPJs num nome só, para filtrar e analisar
        </span>
      </div>

      {erro && (
        <p className="mx-6 mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mx-6 mt-4 rounded-xl border border-[var(--ok)] bg-[rgba(120,190,60,0.10)] px-3 py-2 text-sm text-[var(--ok)]">
          {aviso}
        </p>
      )}

      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_auto_1.15fr]">
        {/* ── PÁGINA ESQUERDA: o grupo ──────────────────────────────────────── */}
        <div className="px-6 py-5">
          <div className="eyebrow !mb-2">O Grupo</div>

          <div className="mb-3 flex gap-2">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void criarGrupo()}
              placeholder="Nome do grupo novo, ex: RAIA CAGC CORIFEU"
              aria-label="Nome do grupo novo"
              className="ds-input min-w-0 flex-1 py-1.5"
            />
            {/* AÇÃO PRINCIPAL do lado esquerdo, em tamanho cheio e com o gradiente do design system:
                criar o grupo é o primeiro passo do livreto e não pode competir de igual para igual
                com um campo de texto. */}
            <Button
              onClick={() => void criarGrupo()}
              disabled={ocupado || !novoNome.trim()}
              className="shrink-0 px-5"
            >
              Criar Grupo
            </Button>
          </div>

          {grupos.length === 0 ? (
            <p className="py-6 text-center text-faint">
              Nenhum grupo ainda. Crie o primeiro acima, depois tique os CNPJs dele ao lado.
            </p>
          ) : (
            <div className="max-h-[360px] overflow-auto rounded-2xl border border-[var(--border)]">
              {grupos.map((g) => {
                const aberto = g.id === grupoId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGrupoId(aberto ? null : g.id)}
                    className={
                      "block w-full border-b border-[var(--border)] px-4 py-3 text-left transition last:border-b-0 " +
                      (aberto ? "bg-[rgba(45,138,86,0.07)]" : "hover:bg-[var(--surface-2)]")
                    }
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${g.ativo ? "text-text" : "text-faint"}`}>
                        {g.nome}
                      </span>
                      {!g.ativo && (
                        <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10.5px] font-semibold text-faint">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-dim">
                      {g.membros} CNPJ{g.membros === 1 ? "" : "s"} ·{" "}
                      {g.admissoesCarimbadas}{" "}
                      {g.admissoesCarimbadas === 1 ? "admissão" : "admissões"} no histórico
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {grupo && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-dim">
              <Button
                variant="secondary"
                onClick={() => void alternarAtivo()}
                disabled={ocupado}
                className={`px-3.5 py-1.5 text-[12.5px] ${grupo.ativo ? "text-danger" : "text-accent"}`}
              >
                {grupo.ativo ? "Inativar Grupo" : "Reativar Grupo"}
              </Button>
              {/* O que a inativação faz, dito na hora: some das escolhas, fica no histórico. */}
              <span className="text-faint">
                grupo inativo some dos filtros, e continua no histórico já carimbado
              </span>
            </div>
          )}
        </div>

        {/* ── LOMBADA ───────────────────────────────────────────────────────── */}
        <div className="relative flex items-center justify-center px-2 py-2 md:px-0 md:py-6">
          <div
            className="absolute inset-x-6 top-1/2 h-px md:inset-x-auto md:inset-y-6 md:left-1/2 md:h-auto md:w-px"
            style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }}
          />
          <div
            className={
              "relative grid h-9 w-9 place-items-center rounded-full border transition duration-300 " +
              (grupoId
                ? "border-[rgba(45,138,86,0.5)] bg-[rgba(45,138,86,0.14)] text-ok"
                : "border-[var(--border)] bg-[var(--surface)] text-faint")
            }
          >
            <Icon name={grupoId ? "check" : "right"} className="h-4 w-4" />
          </div>
        </div>

        {/* ── PÁGINA DIREITA: os CNPJs ──────────────────────────────────────── */}
        <div className="px-6 py-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="eyebrow !mb-0">Quais CNPJs Entram</div>
            <span className="text-[11.5px] text-faint">
              {visiveis.length} de {catalogo.length}
            </span>
          </div>

          {!grupoId ? (
            <p className="py-10 text-center text-faint">
              Escolha um grupo ao lado para ticar os CNPJs dele.
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por código, razão social ou apelido"
                  aria-label="Buscar cliente"
                  className="ds-input min-w-0 flex-1 py-1.5"
                />
                {/* AÇÃO, não link: ticar dezenas de CNPJs de uma vez é o gesto que esta tela
                    existe para oferecer, e um texto sublinhado o esconde no meio do formulário. */}
                <Button
                  variant="secondary"
                  onClick={marcarVisiveis}
                  disabled={visiveis.length === 0}
                  className="shrink-0 whitespace-nowrap px-4 py-2 text-accent"
                >
                  Ticar Os {visiveis.length} À Vista
                </Button>
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px] text-dim">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={soMarcados}
                    onChange={(e) => setSoMarcados(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  ver só os ticados
                </label>
                <span className="ml-auto">
                  ticados: <span className="font-semibold tabular-nums text-text">{marcados.size}</span>
                </span>
              </div>

              <div className="max-h-[300px] overflow-auto rounded-2xl border border-[var(--border)]">
                {visiveis.length === 0 ? (
                  <p className="py-8 text-center text-faint">Nenhum cliente nesta busca.</p>
                ) : (
                  visiveis.map((c) => {
                    const marcado = marcados.has(c.codCliente);
                    const deOutro = c.grupoId !== null && c.grupoId !== grupoId;
                    return (
                      <label
                        key={c.codCliente}
                        className={
                          "flex cursor-pointer items-start gap-2.5 border-b border-[var(--border)] px-3 py-2.5 transition last:border-b-0 " +
                          (marcado ? "bg-[rgba(45,138,86,0.07)]" : "hover:bg-[var(--surface-2)]")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternar(c.codCliente)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                          aria-label={`Ticar ${rotulo(c)}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-text">
                            {rotulo(c)}
                          </span>
                          <span className="block truncate text-[11.5px] text-dim">
                            {c.cnpj ?? "CNPJ não informado"}
                            {c.nomeOperacao?.trim() ? ` · ${c.razaoSocial}` : ""}
                          </span>
                          {/* O AVISO NA PRÓPRIA LINHA, e não só na confirmação: quem tica precisa ver
                              na hora que aquele CNPJ está saindo de outro lugar. */}
                          {deOutro && (
                            <span
                              className={
                                "mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                                (marcado
                                  ? "bg-[rgba(214,140,40,0.15)] text-[var(--warn,#b8860b)]"
                                  : "bg-[var(--surface-2)] text-faint")
                              }
                            >
                              {marcado ? `Sai De ${c.grupoNome}` : `Hoje Em ${c.grupoNome}`}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
        <span className="mr-auto text-[12px] text-faint">
          Salvar mexe só no agrupamento. As admissões já carimbadas não mudam de grupo.
        </span>
        <Button variant="secondary" onClick={onFechar} disabled={ocupado}>
          Fechar
        </Button>
        {/* A AÇÃO PRINCIPAL do livreto inteiro: mais larga que o Fechar ao lado, para a hierarquia
            ser visível antes de ler os rótulos. */}
        <Button onClick={() => void pedirPrevia()} disabled={ocupado || !grupoId || !mudou} className="px-7">
          Salvar Grupo
        </Button>
      </div>

      {/* A CONFIRMAÇÃO, com o que vai acontecer linha a linha. Ação definitiva pede confirmação, e
          esta mexe no agrupamento de dezenas de CNPJs de uma vez. */}
      {previa && (
        <Modal
          onClose={() => setPrevia(null)}
          ariaLabel="Confirmar o grupo"
          className="max-w-lg p-5"
        >
          <h2 className="mb-1 text-[17px] font-semibold text-text">Confirmar {previa.grupo.nome}</h2>
          <p className="mb-2 text-sm text-dim">
            {previa.resumo.entram} entra(m), {previa.resumo.trocam} vem(vêm) de outro grupo,{" "}
            {previa.resumo.saem} sai(saem) e fica(m) sem grupo, {previa.resumo.jaEstao} já estava(m).
          </p>
          {/* O ALCANCE EM ADMISSÕES, em destaque: é o número que muda no painel e no Gerenciador
              assim que o Salvar for clicado. */}
          {(previa.resumo.admissoesACarimbar > 0 || previa.resumo.admissoesADescarimbar > 0) && (
            <p className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-text">
              {previa.resumo.admissoesACarimbar > 0 && (
                <>
                  <span className="font-semibold">{previa.resumo.admissoesACarimbar}</span> admissão(ões)
                  entra(m) no grupo {previa.grupo.nome}.
                </>
              )}
              {previa.resumo.admissoesACarimbar > 0 && previa.resumo.admissoesADescarimbar > 0 && " "}
              {previa.resumo.admissoesADescarimbar > 0 && (
                <>
                  <span className="font-semibold">{previa.resumo.admissoesADescarimbar}</span>{" "}
                  admissão(ões) fica(m) sem grupo.
                </>
              )}
            </p>
          )}

          {previa.efeitos.filter((e) => e.efeito !== "JA_ESTA").length > 0 && (
            <div className="mb-4 max-h-[260px] overflow-auto rounded-xl border border-[var(--border)]">
              {previa.efeitos
                .filter((e) => e.efeito !== "JA_ESTA")
                .map((e) => (
                  <div
                    key={e.codCliente}
                    className="border-b border-[var(--border)] px-3 py-2 text-[12.5px] last:border-b-0"
                  >
                    <span className="font-semibold text-text">
                      {e.codCliente} · {e.nomeOperacao?.trim() || e.razaoSocial}
                    </span>
                    <span className="ml-2 text-dim">
                      {e.efeito === "ENTRA" && "entra no grupo"}
                      {e.efeito === "TROCA" && `SAI de ${e.deGrupoNome} e entra em ${previa.grupo.nome}`}
                      {e.efeito === "SAI" && "sai do grupo e fica sem grupo"}
                      {e.admissoes > 0 && `, com ${e.admissoes} admissão(ões)`}
                    </span>
                  </div>
                ))}
            </div>
          )}

          <p className="mb-4 text-[12px] text-faint">
            Salvar carimba as admissões dos CNPJs acima, as concluídas junto com as vivas, e elas
            aparecem no grupo na hora, no Controle Gerencial e no Gerenciador. Quem sai fica sem
            grupo. Nenhuma rotina automática mexe nisso depois: o carimbo só muda quando alguém
            altera o agrupamento aqui.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPrevia(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={() => void gravar()} disabled={ocupado} className="px-6">
              {ocupado ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
