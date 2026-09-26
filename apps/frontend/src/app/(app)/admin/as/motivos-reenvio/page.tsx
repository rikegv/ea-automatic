"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AsMotivoReenvioShortlist } from "@ea/shared-types";
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
 * ─ O GERENCIADOR DOS MOTIVOS DE REENVIO DA SHORTLIST (decisão do diretor) ──────────────────────
 *
 * A LISTA É DO DIRETOR. O reenvio da shortlist deixou de aceitar texto livre e passou a exigir uma
 * linha deste catálogo: é esta tela que a faz nascer, ser renomeada, sair de circulação e voltar.
 * Sem nenhum motivo ativo aqui, NENHUM reenvio pode ser registrado, e é por isso que o aviso do
 * catálogo vazio fica no topo da tela.
 *
 * ┌─ POR QUE O CAMPO VIROU CATÁLOGO ────────────────────────────────────────────────────────────┐
 * │ 1. INDICADOR. O diretor quer contar POR QUE as listas voltam, e frase digitada não conta:    │
 * │    "cliente pediu mais nomes", "Cliente pediu + nomes" e "+ nomes" seriam três linhas de um  │
 * │    relatório que deveriam ser uma.                                                           │
 * │ 2. §A.6. Texto livre pendurado na VAGA não é alcançado por varredura nenhuma (a retenção é   │
 * │    chaveada por candidato), e quem digitasse ali um telefone deixaria esse dado fora do      │
 * │    expurgo, para sempre. Catálogo resolve por construção: não há onde digitar dado pessoal.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MOLDE: os Motivos De Descarte Do Candidato, letra por letra, e a repetição é deliberada. São DOIS
 * catálogos com DUAS rotas e DOIS ciclos de vida (um classifica por que a PESSOA saiu, o outro por
 * que a LISTA voltou), e colapsá-los numa tela genérica faria um ajuste em um mexer no outro sem
 * ninguém pedir. O que eles compartilham é o molde, não a identidade.
 *
 * ┌─ O QUE ELE NÃO TEM, E É DE PROPÓSITO ────────────────────────────────────────────────────────┐
 * │ Motivo não tem ORDEM (não desenha processo nenhum), não tem COR (não vira pill de estado) e   │
 * │ não tem "INICIAL" (nenhum reenvio nasce sozinho num motivo). E, ao contrário do catálogo de   │
 * │ descarte, não tem a marca da PRETENSÃO: aqui não há segundo comportamento pendurado no item.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * INATIVAR NÃO QUEBRA REENVIO ANTIGO: a shortlist guarda o ID do motivo, e a leitura resolve o nome
 * sem filtrar por ativo. O reenvio de janeiro continua dizendo por que a lista voltou mesmo com o
 * motivo fora de circulação em março.
 *
 * A TELA LÊ PELA ROTA DE ADMINISTRAÇÃO, e não pela pública, e a diferença não é de permissão: a
 * pública (`GET /as/motivos-reenvio-shortlist`, que alimenta o seletor do envio) devolve só os
 * ATIVOS, e sem os inativos aqui não haveria como reativar nenhum.
 *
 * §A.23: esta tela NÃO registra menu nem concede acesso a ninguém. O menu nasce só para o
 * SUPER_ADMIN, e quem libera quem enxerga o gerenciador é o diretor, pela tela de permissão de menu.
 * §A.6: catálogo de processo. Nenhum dado pessoal entra ou sai desta tela.
 * §A.12/§A.20/§A.29 (máscara única de tabela, larguras que cabem o conteúdo, ordenação clicável),
 * §A.11 (sem travessão), §A.24 (title case em título e tag; botão de ação em escrita normal),
 * §A.41 (o diálogo não fecha ao clicar fora, e a saída visível é o "Cancelar").
 */

const ROTA = "/admin/as/motivos-reenvio-shortlist";

export default function MotivosDeReenvioPage() {
  const { token } = useAuth();
  const [motivos, setMotivos] = useState<AsMotivoReenvioShortlist[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** O formulário do topo serve para criar E para renomear, no molde dos demais catálogos. */
  const [nome, setNome] = useState("");
  const [editando, setEditando] = useState<AsMotivoReenvioShortlist | null>(null);

  /**
   * O MOTIVO QUE O DIRETOR PEDIU PARA INATIVAR. Enquanto existe, o diálogo está aberto.
   *
   * NÃO HÁ "EXCLUIR" NESTA TELA, E ISSO É O CONTRATO: a rota de remoção INATIVA (o `DELETE` só seta
   * `ativo=false`), porque as shortlists já enviadas apontam para esta linha, e apagá-la faria um
   * reenvio encerrado passar a dizer menos do que dizia.
   */
  const [inativando, setInativando] = useState<AsMotivoReenvioShortlist | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setMotivos(await apiFetch<AsMotivoReenvioShortlist[]>(ROTA, { token }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar os motivos de reenvio.");
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
          ? apiFetch(`${ROTA}/${alvo.id}`, { method: "PATCH", token, body: { nome: texto } })
          : apiFetch(ROTA, { method: "POST", token, body: { nome: texto } }),
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
      await apiFetch(`${ROTA}/${alvo.id}`, { method: "DELETE", token });
      setFlash(
        `"${alvo.nome}" saiu de circulação. Ele não aparece mais no seletor do envio da shortlist e continua explicando os reenvios que já foram registrados por ele.`,
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
  const colunas = useMemo<ColOrd<AsMotivoReenvioShortlist>[]>(
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
        title="Motivos De Reenvio Da Shortlist"
        subtitle="A lista de motivos oferecida quando uma shortlist é reenviada ao cliente. Renomear corrige o nome no catálogo; os reenvios já registrados continuam apontando para a mesma linha."
      />

      {/* O CATÁLOGO VAZIO É DITO NO TOPO, e não deixado para a pessoa descobrir na hora de reenviar
          a lista: sem motivo ativo, o reenvio simplesmente não acontece. */}
      {!carregando && ativos === 0 && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3 py-2 text-sm text-warn"
          role="alert"
        >
          Nenhum motivo ativo. Enquanto isso, nenhuma shortlist pode ser reenviada, porque o motivo é
          obrigatório a partir do segundo envio e é conferido contra esta lista. Cadastre o primeiro
          no formulário abaixo.
        </p>
      )}

      <GlassCard
        as="form"
        onSubmit={salvarNome}
        className="mb-5 flex flex-wrap items-center gap-3 p-4"
      >
        {editando && (
          <p className="w-full text-sm text-accent">
            Renomeando &quot;{editando.nome}&quot;. Os reenvios já registrados por ele passam a
            mostrar o nome novo, porque o que fica gravado na shortlist é o registro do catálogo.
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
            O motivo novo nasce ativo e passa a aparecer no seletor do reenvio da shortlist.
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
                                  apiFetch(`${ROTA}/${m.id}/reativar`, { method: "PATCH", token }),
                                `"${m.nome}" voltou ao seletor do reenvio.`,
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
        Motivo já usado em um reenvio não some do histórico: a shortlist guarda o registro do
        catálogo, e a leitura continua resolvendo o nome mesmo com ele fora de circulação.
      </p>

      {/*
        O DIÁLOGO DA INATIVAÇÃO É `warn`, E NÃO `danger`: ela não destrói nada e se desfaz num clique
        no botão ao lado. O vermelho desta casa é a cor da perda irreversível, e usá-lo aqui diria à
        pessoa que ela está prestes a perder o motivo, na ação mais reversível da tela.
      */}
      <ConfirmDialog
        open={Boolean(inativando)}
        title="Inativar Motivo De Reenvio"
        message={
          inativando
            ? `Inativar "${inativando.nome}"? Ele sai do seletor do envio da shortlist e continua explicando os reenvios que já foram registrados por ele. Nada é apagado, e o botão de reativar o traz de volta.`
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
