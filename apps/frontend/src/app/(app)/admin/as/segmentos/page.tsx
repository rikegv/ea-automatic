"use client";

/**
 * ─ O CATÁLOGO DE SEGMENTOS (Onda E, peça 1): o ramo do cliente ─────────────────────────────────
 *
 * MOLDE EXATO DA TELA DE LINHAS DE SERVIÇO (`/admin/as/linhas-servico`), e isso foi pedido com
 * estas palavras: criar, renomear, reordenar, inativar, reativar. O que muda é o dado; o gesto é o
 * mesmo, e quem já usa uma das duas não precisa aprender a outra.
 *
 * ┌─ O QUE É "SEGMENTO" AQUI, E O QUE ELE NÃO É ───────────────────────────────────────────────┐
 * │ É o RAMO DO CLIENTE: Varejo, Saúde, Indústria. Ele classifica o cliente, e a vaga o herda.  │
 * │                                                                                             │
 * │ NÃO é a "segmentação de ÁREA" (`docs/ARQUITETURA-SEGMENTACAO-AREA.md`), que é o teto de RBAC │
 * │ por área e um mecanismo de PERMISSÃO. Os dois nomes convivem no repositório, e confundi-los  │
 * │ é confundir "de que ramo é o cliente" com "o que este usuário pode ver". Também não é o      │
 * │ "segmento de rota" da Esteira nem o `LinhaSegmento` do relatório gerencial.                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.23: o menu `as-segmentos` nasce SÓ PARA O SUPER_ADMIN. A fábrica registra e para por aí: quem
 * libera para quem é o diretor, na tela de permissão de menu.
 * §A.12/§A.20 (a máscara única de tabela, nada esmagado), §A.29 (ordenação por clique),
 * §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão é ação),
 * §A.41 (o diálogo não fecha ao clicar fora, e a saída visível é o "Cancelar").
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AsSegmento } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  invalidarCatalogoDeSegmentos,
  segmentosOrdenados,
  ROTA_ADMIN,
  ROTA_LEITURA,
} from "@/lib/as-segmentos";
import { moverNaOrdem, reordenacaoLiberada } from "@/lib/as-etapas";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

export default function SegmentosPage() {
  const { token } = useAuth();
  const [segmentos, setSegmentos] = useState<AsSegmento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [rotulo, setRotulo] = useState("");
  const [editando, setEditando] = useState<AsSegmento | null>(null);
  const [inativando, setInativando] = useState<AsSegmento | null>(null);
  const [removendo, setRemovendo] = useState<AsSegmento | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      /* A LISTA COMPLETA, com os inativos: é esta tela que os reativa, e sem eles o segmento
         desligado desapareceria em vez de ficar disponível para voltar. E a memória do catálogo
         compartilhado morre junto, senão o cadastro de cliente aberto nesta mesma carga de página
         continuaria oferecendo o que acabou de ser inativado. */
      invalidarCatalogoDeSegmentos();
      setSegmentos(segmentosOrdenados(await apiFetch<AsSegmento[]>(ROTA_LEITURA, { token })));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar os segmentos.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * TODA ESCRITA PASSA POR AQUI, e a mensagem de erro é a DO BACKEND, sem tradução: as recusas
   * desta frente carregam a informação que resolve o problema ("12 clientes usam este segmento"), e
   * trocá-las por "falha ao salvar" jogaria fora justamente o que o diretor precisa ler.
   */
  async function escrever(fn: () => Promise<unknown>, sucesso: string): Promise<boolean> {
    setOcupado(true);
    setErro(null);
    setFlash(null);
    try {
      await fn();
      setFlash(sucesso);
      await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha na operação.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function salvarRotulo(ev: FormEvent) {
    ev.preventDefault();
    const nome = rotulo.trim();
    if (!nome) return;
    const alvo = editando;
    const ok = await escrever(
      () =>
        alvo
          ? apiFetch(`${ROTA_ADMIN}/${alvo.id}`, { method: "PATCH", token, body: { rotulo: nome } })
          : apiFetch(ROTA_ADMIN, { method: "POST", token, body: { rotulo: nome } }),
      alvo ? `Segmento renomeado para "${nome}".` : `Segmento "${nome}" criado no fim da lista.`,
    );
    if (ok) {
      setRotulo("");
      setEditando(null);
    }
  }

  /**
   * A REORDENAÇÃO REUSA `moverNaOrdem` E `reordenacaoLiberada`, e isso é deliberado: as duas funções
   * são puras, já testadas, e não sabem nada de segmento (uma troca dois vizinhos numa lista de ids;
   * a outra responde se a tabela está na ordem do catálogo). Reescrevê-las aqui daria mais uma cópia
   * da mesma régua, que divergiria no primeiro ajuste.
   */
  async function reordenar(segmento: AsSegmento, direcao: "cima" | "baixo") {
    const ids = moverNaOrdem(segmentos, segmento.id, direcao);
    // Nada mudou (primeiro subindo, último descendo): não gasta requisição nem pisca a tela.
    if (ids.every((id, i) => id === segmentos[i]?.id)) return;
    await escrever(
      () => apiFetch(`${ROTA_ADMIN}/ordem`, { method: "PATCH", token, body: { ids } }),
      `"${segmento.rotulo}" mudou de lugar na lista.`,
    );
  }

  /**
   * INATIVAR E EXCLUIR NÃO PASSAM PELO `escrever`, e o motivo é o mesmo da tela de linhas de
   * serviço: o diálogo precisa FECHAR antes de a recusa aparecer. As recusas destas duas ações são
   * frases do backend que dizem o que fazer, e escondidas atrás do overlay elas viram um botão que
   * não faz nada, com o clique de novo como caminho natural.
   */
  async function confirmarInativacao() {
    const alvo = inativando;
    if (!alvo) return;
    setOcupado(true);
    setErro(null);
    setFlash(null);
    try {
      await apiFetch(`${ROTA_ADMIN}/${alvo.id}/inativar`, { method: "PATCH", token });
      setInativando(null);
      setFlash(`"${alvo.rotulo}" saiu da escolha dos clientes. Os clientes antigos não mudaram.`);
      await carregar();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Falha ao inativar o segmento.";
      setErro(`Não foi possível inativar "${alvo.rotulo}". ${msg}`);
      setInativando(null);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarRemocao() {
    const alvo = removendo;
    if (!alvo) return;
    setOcupado(true);
    setErro(null);
    setFlash(null);
    try {
      await apiFetch(`${ROTA_ADMIN}/${alvo.id}`, { method: "DELETE", token });
      setRemovendo(null);
      setFlash(`"${alvo.rotulo}" saiu do catálogo.`);
      await carregar();
    } catch (e) {
      /* O NOME ENTRA NA FRENTE porque, fora do diálogo, a mensagem do backend não diz de qual
         segmento se trata, e a tabela tem vários. */
      const msg = e instanceof ApiError ? e.message : "Falha ao excluir o segmento.";
      setErro(`Não foi possível excluir "${alvo.rotulo}". ${msg}`);
      setRemovendo(null);
    } finally {
      setOcupado(false);
    }
  }

  // §A.29: ordenação clicável pelo `useOrdenacao` que já existe. A coluna Ordem ordena pelo NÚMERO,
  // e não pelo rótulo: é ela que desenha a sequência em que os segmentos aparecem no seletor.
  const colunas = useMemo<ColOrd<AsSegmento>[]>(
    () => [
      { chave: "ordem", tipo: "status", valor: (s) => s.ordem },
      { chave: "rotulo", tipo: "texto", valor: (s) => s.rotulo },
      { chave: "codigo", tipo: "texto", valor: (s) => s.codigo },
      { chave: "status", tipo: "status", valor: (s) => (s.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, segmentos);
  const podeReordenar = reordenacaoLiberada(ord.ordem);
  const ativos = segmentos.filter((s) => s.ativo).length;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Segmentos"
        subtitle="O ramo do cliente, escolhido no cadastro dele. Renomear corrige o nome em todos os clientes; a ordem daqui é a ordem do seletor."
      />

      {/* O CATÁLOGO VAZIO, dito no topo em vez de descoberto lá embaixo: o segmento é OPCIONAL no
          cliente, então nada trava, mas com nenhum ativo o seletor do cadastro abre vazio e quem
          está lá não tem como saber por quê. */}
      {!carregando && ativos === 0 && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3 py-2 text-sm text-warn"
          role="alert"
        >
          Nenhum segmento está ativo. O cadastro de cliente continua salvando, porque o segmento é
          opcional, mas o seletor de lá vai abrir vazio até o primeiro ser criado aqui.
        </p>
      )}

      <GlassCard
        as="form"
        onSubmit={salvarRotulo}
        className="mb-5 flex flex-wrap items-center gap-3 p-4"
      >
        {editando && (
          <p className="w-full text-sm text-accent">
            Renomeando &quot;{editando.codigo}&quot;. O registro interno não muda, então o nome novo
            aparece também nos clientes que já usam este segmento.
          </p>
        )}
        <input
          required
          className="ds-input flex-1"
          placeholder={editando ? "Novo nome do segmento *" : "Nome do segmento novo *"}
          aria-label={editando ? "Novo nome do segmento" : "Nome do segmento novo"}
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
        />
        <Button type="submit" disabled={ocupado || !rotulo.trim()} className="shrink-0 py-2.5">
          {editando ? "Salvar nome" : "Acrescentar segmento"}
        </Button>
        {editando && (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 py-2.5"
            disabled={ocupado}
            onClick={() => {
              setEditando(null);
              setRotulo("");
            }}
          >
            Cancelar
          </Button>
        )}
        {!editando && (
          <span className="w-full text-[12px] text-faint">
            O segmento novo nasce no fim da lista e ativo. Depois de criado, use as setas para
            levá-lo ao lugar certo.
          </span>
        )}
      </GlassCard>

      {flash && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px]">
          {flash}
        </p>
      )}
      {erro && (
        <p
          className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      {/* A trava das setas, explicada no lugar em que ela aparece: com a tabela ordenada por outra
          coluna, a linha de cima não é a anterior da lista, e a seta moveria para um lugar que
          ninguém está vendo. */}
      {!podeReordenar && (
        <p className="mb-3 text-[12.5px] text-dim">
          A tabela está ordenada por outra coluna, então as setas de reordenar estão desligadas: a
          linha de cima não é a anterior da lista. Clique no cabeçalho &quot;Ordem&quot; para voltar
          à ordem do catálogo.
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          <table className="ds-table min-w-[820px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="ordem" className="w-[132px]">
                  Ordem
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="rotulo">
                  Segmento
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="codigo" className="w-[230px]">
                  Registro Interno
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-[124px]">
                  Status
                </ColunaOrdenavel>
                <th className="w-[168px]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-faint">
                    Carregando...
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-faint">
                    Nenhum segmento cadastrado. Comece pelo primeiro, no formulário acima.
                  </td>
                </tr>
              ) : (
                ord.itens.map((s, i) => (
                  <tr key={s.id} className={s.ativo ? "" : "opacity-60"}>
                    <td>
                      <span className="flex items-center justify-center gap-1">
                        <span className="tabular-nums text-dim">{s.ordem}</span>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-30"
                          title="Subir na lista"
                          aria-label={`Subir ${s.rotulo} na lista`}
                          disabled={ocupado || !podeReordenar || i === 0}
                          onClick={() => void reordenar(s, "cima")}
                        >
                          <Icon name="left" className="h-4 w-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-30"
                          title="Descer na lista"
                          aria-label={`Descer ${s.rotulo} na lista`}
                          disabled={ocupado || !podeReordenar || i === ord.itens.length - 1}
                          onClick={() => void reordenar(s, "baixo")}
                        >
                          <Icon name="right" className="h-4 w-4 rotate-90" />
                        </button>
                      </span>
                    </td>

                    <td className="font-semibold">{s.rotulo}</td>

                    {/* O CÓDIGO É A IDENTIDADE E NÃO MUDA: renomear o segmento não mexe nele, e é
                        por isso que o cliente cadastrado ano passado continua apontando para o
                        mesmo segmento depois de o nome dele mudar. Aparece porque é o que o time vê
                        em exportação e em suporte. */}
                    <td className="text-center">
                      <span className="font-mono text-[12px] text-dim">{s.codigo}</span>
                    </td>

                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <StatusPill
                          tone={s.ativo ? "ok" : "nt"}
                          label={s.ativo ? "Ativo" : "Inativo"}
                        />
                      </span>
                    </td>

                    <td>
                      <span className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-40"
                          title="Renomear"
                          aria-label={`Renomear ${s.rotulo}`}
                          disabled={ocupado}
                          onClick={() => {
                            setEditando(s);
                            setRotulo(s.rotulo);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Icon name="pen" className="h-4 w-4" />
                        </button>
                        {/* O SEGMENTO ATIVO OFERECE INATIVAR; O INATIVO OFERECE REATIVAR. É a mesma
                            chave vista dos dois lados, então as duas ocupam o MESMO lugar e nunca
                            aparecem juntas. */}
                        {s.ativo ? (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-warn transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Inativar"
                            aria-label={`Inativar ${s.rotulo}`}
                            disabled={ocupado}
                            onClick={() => setInativando(s)}
                          >
                            <Icon name="lock" className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Reativar"
                            aria-label={`Reativar ${s.rotulo}`}
                            disabled={ocupado}
                            onClick={() =>
                              void escrever(
                                () =>
                                  apiFetch(`${ROTA_ADMIN}/${s.id}/reativar`, {
                                    method: "PATCH",
                                    token,
                                  }),
                                `"${s.rotulo}" voltou para a escolha dos clientes.`,
                              )
                            }
                          >
                            <Icon name="undo" className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-danger transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                          title="Excluir"
                          aria-label={`Excluir ${s.rotulo}`}
                          disabled={ocupado}
                          onClick={() => setRemovendo(s)}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <p className="mt-3 text-[12px] text-faint">
        {ativos} {ativos === 1 ? "segmento ativo" : "segmentos ativos"} de {segmentos.length}{" "}
        cadastrados. Segmento usado por algum cliente não é apagado: ele é desativado, sai da escolha
        dos cadastros novos e continua classificando os clientes que já usam.
      </p>

      {/* A INATIVAÇÃO É `warn` E NÃO `danger`: ela não destrói nada e se desfaz num clique no botão
          ao lado. O vermelho é a cor da perda irreversível nesta casa. §A.41: o diálogo não fecha ao
          clicar fora, e a saída visível é o "Cancelar". */}
      <ConfirmDialog
        open={Boolean(inativando)}
        title="Inativar Segmento"
        message={
          inativando
            ? `Inativar "${inativando.rotulo}"? Ele sai da escolha dos cadastros novos e continua classificando os clientes que já usam. Nada é apagado, e o botão de reativar traz o segmento de volta com o mesmo registro interno.`
            : ""
        }
        confirmLabel="Inativar"
        tone="warn"
        busy={ocupado}
        onConfirm={confirmarInativacao}
        onCancel={() => setInativando(null)}
      />

      {/* O DIÁLOGO NÃO PROMETE APAGAR, porque o backend pode INATIVAR, e é ele quem sabe qual dos
          dois é o caso: prometer a exclusão e devolver uma inativação faria a tela mentir na maioria
          das vezes. A recusa com a contagem também vem de lá, com a frase inteira. */}
      <ConfirmDialog
        open={Boolean(removendo)}
        title="Excluir Segmento"
        message={
          removendo
            ? `Excluir "${removendo.rotulo}" do catálogo? Se nenhum cliente usa este segmento, ele é apagado. Se algum usa, ele é desativado: sai da escolha dos cadastros novos e continua classificando os que já existem.`
            : ""
        }
        confirmLabel="Excluir"
        tone="danger"
        busy={ocupado}
        onConfirm={confirmarRemocao}
        onCancel={() => setRemovendo(null)}
      />
    </>
  );
}
