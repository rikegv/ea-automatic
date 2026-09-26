"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AsMotivoDescarte } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

/**
 * ─ O GERENCIADOR DOS MOTIVOS DE DESCARTE DO CANDIDATO (A&S, Frente A, ponto 7) ─────────────────
 *
 * A LISTA É DO DIRETOR. Descartar candidato deixou de aceitar texto livre e passou a exigir um NOME
 * deste catálogo (`CandidatosService.exigirMotivoDoCatalogo`): é esta tela que faz a lista nascer,
 * ser renomeada, sair de circulação e voltar. Sem nenhum motivo ativo aqui, NENHUM descarte pode ser
 * registrado no sistema, e é por isso que o aviso do catálogo vazio fica no topo da tela.
 *
 * MOLDE: os Motivos De Cancelamento De Vaga, letra por letra, e a repetição é deliberada. São DOIS
 * catálogos com DUAS rotas e DOIS ciclos de vida (um classifica por que a VAGA caiu, o outro por que
 * a PESSOA saiu), e colapsá-los numa tela genérica faria um ajuste em um mexer no outro sem ninguém
 * pedir. O que eles compartilham é o molde, não a identidade.
 *
 * ┌─ O QUE ELE NÃO TEM, E É DE PROPÓSITO ────────────────────────────────────────────────────────┐
 * │ Motivo não tem ORDEM (não desenha processo nenhum), não tem COR (não vira pill de estado) e   │
 * │ não tem "INICIAL" (nenhum descarte nasce sozinho num motivo). Copiar essas três colunas do    │
 * │ molde das Etapas só porque o molde as tem seria cobrar do diretor três decisões que o dado    │
 * │ não pede.                                                                                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * INATIVAR NÃO QUEBRA CANDIDATURA ANTIGA, e é por isso que o catálogo pode ser mexido sem medo: o
 * que fica gravado na candidatura é o NOME do motivo, não o id. Quem foi descartado em janeiro
 * continua dizendo por que saiu mesmo que o motivo saia de circulação em março, e o histórico de
 * TEXTO LIVRE, anterior ao catálogo, também segue intocado (nada aqui reescreve o que já foi
 * gravado).
 *
 * A TELA LÊ PELA ROTA DE ADMINISTRAÇÃO, e não pela pública, e a diferença não é de permissão: a
 * pública (`GET /as/motivos-descarte`, que alimenta o seletor do desvínculo) devolve só os ATIVOS,
 * e sem os inativos aqui não haveria como reativar nenhum.
 *
 * §A.23: esta tela NÃO registra menu nem concede acesso a ninguém. Quem libera quem enxerga o
 * gerenciador é o diretor, pela tela de permissão de menu.
 * §A.6: catálogo de processo. Nenhum dado pessoal entra ou sai desta tela.
 * §A.12/§A.20/§A.29 (máscara única de tabela, larguras que cabem o conteúdo, ordenação clicável),
 * §A.11 (sem travessão), §A.24 (title case em título e tag; botão de ação em escrita normal),
 * §A.41 (o diálogo não fecha ao clicar fora, e a saída visível é o "Cancelar").
 */

export default function MotivosDeDescartePage() {
  const { token } = useAuth();
  const [motivos, setMotivos] = useState<AsMotivoDescarte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** O formulário do topo serve para criar E para renomear, no molde dos demais catálogos. */
  const [nome, setNome] = useState("");
  const [editando, setEditando] = useState<AsMotivoDescarte | null>(null);

  /**
   * O MOTIVO QUE O DIRETOR PEDIU PARA INATIVAR. Enquanto existe, o diálogo está aberto.
   *
   * NÃO HÁ "EXCLUIR" NESTA TELA, E ISSO É O CONTRATO: a rota de remoção INATIVA (o `DELETE` só seta
   * `ativo=false`), porque o que fica gravado na candidatura é o NOME do motivo, e nada aqui pode
   * ser apagado sem que uma linha encerrada passe a dizer menos do que dizia.
   */
  const [inativando, setInativando] = useState<AsMotivoDescarte | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setMotivos(await apiFetch<AsMotivoDescarte[]>("/admin/as/motivos-descarte", { token }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar os motivos de descarte.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * TODA ESCRITA PASSA POR AQUI, e o retorno diz se deu certo.
   *
   * A MENSAGEM DE ERRO É A DO BACKEND, sem tradução: as recusas deste catálogo carregam o que
   * resolve o problema (nome repetido, por exemplo), e trocá-las por "falha ao salvar" jogaria fora
   * justamente o que o diretor precisa ler.
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

  async function salvarNome(ev: FormEvent) {
    ev.preventDefault();
    const texto = nome.trim();
    if (!texto) return;
    const alvo = editando;
    const ok = await escrever(
      () =>
        alvo
          ? apiFetch(`/admin/as/motivos-descarte/${alvo.id}`, {
              method: "PATCH",
              token,
              body: { nome: texto },
            })
          : apiFetch("/admin/as/motivos-descarte", {
              method: "POST",
              token,
              body: { nome: texto },
            }),
      alvo ? `Motivo renomeado para "${texto}".` : `Motivo "${texto}" criado.`,
    );
    if (ok) {
      setNome("");
      setEditando(null);
    }
  }

  /**
   * A INATIVAÇÃO NÃO PASSA PELO `escrever`, e é o mesmo motivo do molde: o diálogo precisa FECHAR
   * antes de a recusa aparecer. Escondida atrás do overlay, a frase do backend vira um botão que não
   * faz nada, e o caminho natural passa a ser clicar de novo.
   */
  async function confirmarInativacao() {
    const alvo = inativando;
    if (!alvo) return;
    setOcupado(true);
    setErro(null);
    setFlash(null);
    try {
      await apiFetch(`/admin/as/motivos-descarte/${alvo.id}`, { method: "DELETE", token });
      setFlash(
        `"${alvo.nome}" saiu de circulação. Ele não aparece mais no seletor do descarte e continua escrito nas candidaturas que já foram encerradas por ele.`,
      );
      setInativando(null);
      await carregar();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Falha ao inativar o motivo.";
      setErro(`Não foi possível inativar "${alvo.nome}". ${msg}`);
      setInativando(null);
    } finally {
      setOcupado(false);
    }
  }

  // §A.29: ordenação clicável pelo `useOrdenacao` que já existe, nunca escrita à mão.
  const colunas = useMemo<ColOrd<AsMotivoDescarte>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (m) => m.nome },
      { chave: "status", tipo: "status", valor: (m) => (m.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, motivos);
  const ativos = motivos.filter((m) => m.ativo).length;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Motivos De Descarte Do Candidato"
        subtitle="A lista de motivos oferecida quando um candidato é descartado da vaga. Renomear corrige o nome no catálogo; o motivo já gravado em uma candidatura encerrada continua como estava."
      />

      {/* O CATÁLOGO VAZIO É DITO NO TOPO, e não deixado para a pessoa descobrir na hora de
          descartar alguém: sem motivo ativo, o descarte simplesmente não acontece. */}
      {!carregando && ativos === 0 && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3 py-2 text-sm text-warn"
          role="alert"
        >
          Nenhum motivo ativo. Enquanto isso, nenhum candidato pode ser descartado, porque o motivo é
          obrigatório e conferido contra esta lista. Cadastre o primeiro no formulário abaixo.
        </p>
      )}

      <GlassCard
        as="form"
        onSubmit={salvarNome}
        className="mb-5 flex flex-wrap items-center gap-3 p-4"
      >
        {editando && (
          <p className="w-full text-sm text-accent">
            Renomeando &quot;{editando.nome}&quot;. As candidaturas já encerradas por ele continuam
            com o texto que foi gravado nelas.
          </p>
        )}
        <input
          required
          className="ds-input flex-1"
          placeholder={editando ? "Novo nome do motivo *" : "Nome do motivo novo *"}
          aria-label={editando ? "Novo nome do motivo" : "Nome do motivo novo"}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Button type="submit" disabled={ocupado || !nome.trim()} className="shrink-0 py-2.5">
          {editando ? "Salvar nome" : "Acrescentar motivo"}
        </Button>
        {editando && (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 py-2.5"
            disabled={ocupado}
            onClick={() => {
              setEditando(null);
              setNome("");
            }}
          >
            Cancelar
          </Button>
        )}
        {!editando && (
          <span className="w-full text-[12px] text-faint">
            O motivo novo nasce ativo e passa a aparecer no seletor do descarte do candidato.
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

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* §A.12/§A.20: a máscara é a do sistema, e as larguras seguem o conteúdo. Só duas colunas
              têm tamanho conhecido (a pill e os dois botões); o NOME fica com toda a sobra, que é o
              único texto livre da tabela. */}
          <table className="ds-table min-w-[720px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="nome" className="text-center">
                  Motivo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-[140px] text-center">
                  Status
                </ColunaOrdenavel>
                <th className="w-[124px] text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-faint">
                    Carregando...
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-faint">
                    Nenhum motivo cadastrado. Comece pelo primeiro, no formulário acima.
                  </td>
                </tr>
              ) : (
                ord.itens.map((m) => (
                  <tr key={m.id} className={m.ativo ? "" : "opacity-60"}>
                    <td>
                      <span className="text-[13px] text-text">{m.nome}</span>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        {/* §A.12: o ícone acompanha o estado real (check no ativo), e o rótulo é
                            TAG, então title case (§A.24). */}
                        <StatusPill
                          tone={m.ativo ? "ok" : "nt"}
                          label={m.ativo ? "Ativo" : "Inativo"}
                        />
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-40"
                          title="Renomear"
                          aria-label={`Renomear ${m.nome}`}
                          disabled={ocupado}
                          onClick={() => {
                            setEditando(m);
                            setNome(m.nome);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Icon name="pen" className="h-4 w-4" />
                        </button>
                        {/* A LINHA ATIVA OFERECE INATIVAR; A INATIVA OFERECE REATIVAR. São a MESMA
                            chave vista dos dois lados, então ocupam o mesmo lugar e nunca aparecem
                            juntas: "Inativar" numa linha já inativa não faria nada. */}
                        {m.ativo ? (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-warn transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Inativar"
                            aria-label={`Inativar ${m.nome}`}
                            disabled={ocupado}
                            onClick={() => setInativando(m)}
                          >
                            <Icon name="lock" className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Reativar"
                            aria-label={`Reativar ${m.nome}`}
                            disabled={ocupado}
                            onClick={() =>
                              void escrever(
                                () =>
                                  apiFetch(`/admin/as/motivos-descarte/${m.id}/reativar`, {
                                    method: "PATCH",
                                    token,
                                  }),
                                `"${m.nome}" voltou ao seletor do descarte.`,
                              )
                            }
                          >
                            <Icon name="undo" className="h-4 w-4" />
                          </button>
                        )}
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
        {ativos} {ativos === 1 ? "motivo ativo" : "motivos ativos"} de {motivos.length} cadastrados.
        Motivo já usado em uma candidatura encerrada não some do histórico: o que fica gravado na
        candidatura é o nome do motivo, e não o registro do catálogo.
      </p>

      {/*
        O DIÁLOGO DA INATIVAÇÃO É `warn`, E NÃO `danger`: ela não destrói nada e se desfaz num clique
        no botão ao lado. O vermelho desta casa é a cor da perda irreversível, e usá-lo aqui diria à
        pessoa que ela está prestes a perder o motivo, na ação mais reversível da tela.
      */}
      <ConfirmDialog
        open={Boolean(inativando)}
        title="Inativar Motivo De Descarte"
        message={
          inativando
            ? `Inativar "${inativando.nome}"? Ele sai do seletor do descarte do candidato e continua escrito nas candidaturas que já foram encerradas por ele. Nada é apagado, e o botão de reativar o traz de volta.`
            : ""
        }
        confirmLabel="Inativar"
        tone="warn"
        busy={ocupado}
        onConfirm={confirmarInativacao}
        onCancel={() => setInativando(null)}
      />
    </>
  );
}
