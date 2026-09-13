"use client";

/**
 * ─ O CATÁLOGO DE COMERCIAIS (Onda E, peça 2): as pessoas do comercial ─────────────────────────
 *
 * MOLDE EXATO DA TELA DE LINHAS DE SERVIÇO (`/admin/as/linhas-servico`), e isso foi pedido com
 * estas palavras: criar, renomear, reordenar, inativar, reativar. O que muda é o dado; o gesto é o
 * mesmo, e quem já usa uma das duas não precisa aprender a outra.
 *
 * ┌─ ESTE CATÁLOGO GUARDA NOME DE PESSOA, e é o único da onda que guarda (§A.6) ───────────────┐
 * │ O que se guarda é O NOME, e mais nada: nem e-mail, nem telefone, nem documento. Minimização │
 * │ não é cerimônia aqui, é a diferença entre um catálogo de rótulo e um cadastro de pessoa,    │
 * │ que é outra coisa e teria outras obrigações.                                                │
 * │                                                                                             │
 * │ QUEM SAI DO TIME É INATIVADO, NUNCA APAGADO, e o motivo é o mesmo das linhas de serviço: o  │
 * │ cliente atendido por ele continua dizendo de quem ele era. Apagar reescreveria o passado.   │
 * │                                                                                             │
 * │ O nome aparece nas mensagens desta tela (para dizer de quem se trata) porque quem está aqui │
 * │ já está autenticado e já está olhando a lista inteira. Nada daqui vai para log.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.23: o menu `as-comerciais` nasce SÓ PARA O SUPER_ADMIN. A fábrica registra e para por aí: quem
 * libera para quem é o diretor, na tela de permissão de menu.
 * §A.12/§A.20 (a máscara única de tabela, nada esmagado), §A.29 (ordenação por clique),
 * §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão é ação),
 * §A.41 (o diálogo não fecha ao clicar fora, e a saída visível é o "Cancelar").
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AsComercial } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  invalidarCatalogoDeComerciais,
  comerciaisOrdenados,
  ROTA_ADMIN,
  ROTA_LEITURA_GERENCIADOR,
} from "@/lib/as-comerciais";
import { moverNaOrdem, reordenacaoLiberada } from "@/lib/as-etapas";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

export default function ComerciaisPage() {
  const { token } = useAuth();
  const [comerciais, setComerciais] = useState<AsComercial[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [rotulo, setRotulo] = useState("");
  const [editando, setEditando] = useState<AsComercial | null>(null);
  const [inativando, setInativando] = useState<AsComercial | null>(null);
  const [removendo, setRemovendo] = useState<AsComercial | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      /* A LISTA COMPLETA, com os inativos: é esta tela que os reativa, e sem eles quem foi
         desligado desapareceria em vez de ficar disponível para voltar. E a memória do catálogo
         compartilhado morre junto, senão o cadastro de cliente aberto nesta mesma carga de página
         continuaria oferecendo quem acabou de ser inativado. */
      invalidarCatalogoDeComerciais();
      /* LÊ PELA ROTA DE SUPER_ADMIN, e não por uma leitura aberta: este catálogo guarda nome de
         pessoa, e uma rota de catálogo sem reivindicação de menu entregaria a lista do time inteiro
         a qualquer sessão válida (§A.6). Quem administra o catálogo já pode vê-lo inteiro, então a
         leitura do gerenciador é a mesma porta da escrita. */
      setComerciais(
        comerciaisOrdenados(await apiFetch<AsComercial[]>(ROTA_LEITURA_GERENCIADOR, { token })),
      );
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar os comerciais.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * TODA ESCRITA PASSA POR AQUI, e a mensagem de erro é a DO BACKEND, sem tradução: as recusas
   * desta frente carregam a informação que resolve o problema ("8 clientes têm este comercial"), e
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
      alvo ? `Nome corrigido para "${nome}".` : `"${nome}" entrou no comercial, no fim da lista.`,
    );
    if (ok) {
      setRotulo("");
      setEditando(null);
    }
  }

  /**
   * A REORDENAÇÃO REUSA `moverNaOrdem` E `reordenacaoLiberada`, e isso é deliberado: as duas funções
   * são puras, já testadas, e não sabem nada de comercial (uma troca dois vizinhos numa lista de
   * ids; a outra responde se a tabela está na ordem do catálogo). Reescrevê-las aqui daria mais uma
   * cópia da mesma régua, que divergiria no primeiro ajuste.
   */
  async function reordenar(comercial: AsComercial, direcao: "cima" | "baixo") {
    const ids = moverNaOrdem(comerciais, comercial.id, direcao);
    // Nada mudou (primeiro subindo, último descendo): não gasta requisição nem pisca a tela.
    if (ids.every((id, i) => id === comerciais[i]?.id)) return;
    await escrever(
      () => apiFetch(`${ROTA_ADMIN}/ordem`, { method: "PATCH", token, body: { ids } }),
      `"${comercial.rotulo}" mudou de lugar na lista.`,
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
      const msg = e instanceof ApiError ? e.message : "Falha ao inativar o comercial.";
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
         pessoa se trata, e a tabela tem várias. */
      const msg = e instanceof ApiError ? e.message : "Falha ao excluir o comercial.";
      setErro(`Não foi possível excluir "${alvo.rotulo}". ${msg}`);
      setRemovendo(null);
    } finally {
      setOcupado(false);
    }
  }

  // §A.29: ordenação clicável pelo `useOrdenacao` que já existe. A coluna Ordem ordena pelo NÚMERO,
  // e não pelo nome: é ela que desenha a sequência em que os comerciais aparecem no seletor.
  const colunas = useMemo<ColOrd<AsComercial>[]>(
    () => [
      { chave: "ordem", tipo: "status", valor: (c) => c.ordem },
      { chave: "rotulo", tipo: "texto", valor: (c) => c.rotulo },
      { chave: "status", tipo: "status", valor: (c) => (c.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, comerciais);
  const podeReordenar = reordenacaoLiberada(ord.ordem);
  const ativos = comerciais.filter((c) => c.ativo).length;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Comerciais"
        subtitle="As pessoas do comercial, escolhidas no cadastro do cliente. Corrigir o nome corrige em todos os clientes; a ordem daqui é a ordem do seletor."
      />

      {/* O CATÁLOGO VAZIO, dito no topo em vez de descoberto lá embaixo: o comercial é OPCIONAL no
          cliente, então nada trava, mas com ninguém ativo o seletor do cadastro abre vazio e quem
          está lá não tem como saber por quê. */}
      {!carregando && ativos === 0 && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3 py-2 text-sm text-warn"
          role="alert"
        >
          Nenhum comercial está ativo. O cadastro de cliente continua salvando, porque o comercial é
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
            Corrigindo o nome de &quot;{editando.rotulo}&quot;. A identidade do comercial é o
            registro dele no catálogo, e ela não muda ao corrigir o nome: o nome novo aparece também
            nos clientes que já são atendidos por esta pessoa.
          </p>
        )}
        <input
          required
          className="ds-input flex-1"
          placeholder={editando ? "Nome corrigido *" : "Nome de quem entra no comercial *"}
          aria-label={editando ? "Nome corrigido do comercial" : "Nome do comercial novo"}
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
        />
        <Button type="submit" disabled={ocupado || !rotulo.trim()} className="shrink-0 py-2.5">
          {editando ? "Salvar nome" : "Acrescentar comercial"}
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
            Quem entra nasce no fim da lista e ativo. Depois de criado, use as setas para levá-lo ao
            lugar certo. Guarda-se só o nome: sem e-mail, sem telefone, sem documento.
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
          <table className="ds-table min-w-[590px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="ordem" className="w-[132px]">
                  Ordem
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="rotulo">
                  Comercial
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
                  <td colSpan={4} className="py-8 text-center text-faint">
                    Carregando...
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-faint">
                    Nenhum comercial cadastrado. Comece pelo primeiro, no formulário acima.
                  </td>
                </tr>
              ) : (
                ord.itens.map((c, i) => (
                  <tr key={c.id} className={c.ativo ? "" : "opacity-60"}>
                    <td>
                      <span className="flex items-center justify-center gap-1">
                        <span className="tabular-nums text-dim">{c.ordem}</span>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-30"
                          title="Subir na lista"
                          aria-label={`Subir ${c.rotulo} na lista`}
                          disabled={ocupado || !podeReordenar || i === 0}
                          onClick={() => void reordenar(c, "cima")}
                        >
                          <Icon name="left" className="h-4 w-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-30"
                          title="Descer na lista"
                          aria-label={`Descer ${c.rotulo} na lista`}
                          disabled={ocupado || !podeReordenar || i === ord.itens.length - 1}
                          onClick={() => void reordenar(c, "baixo")}
                        >
                          <Icon name="right" className="h-4 w-4 rotate-90" />
                        </button>
                      </span>
                    </td>

                    <td className="font-semibold">{c.rotulo}</td>

                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <StatusPill
                          tone={c.ativo ? "ok" : "nt"}
                          label={c.ativo ? "Ativo" : "Inativo"}
                        />
                      </span>
                    </td>

                    <td>
                      <span className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-40"
                          title="Corrigir o nome"
                          aria-label={`Corrigir o nome de ${c.rotulo}`}
                          disabled={ocupado}
                          onClick={() => {
                            setEditando(c);
                            setRotulo(c.rotulo);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Icon name="pen" className="h-4 w-4" />
                        </button>
                        {/* O COMERCIAL ATIVO OFERECE INATIVAR; O INATIVO OFERECE REATIVAR. É a mesma
                            chave vista dos dois lados, então as duas ocupam o MESMO lugar e nunca
                            aparecem juntas. */}
                        {c.ativo ? (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-warn transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Inativar"
                            aria-label={`Inativar ${c.rotulo}`}
                            disabled={ocupado}
                            onClick={() => setInativando(c)}
                          >
                            <Icon name="lock" className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Reativar"
                            aria-label={`Reativar ${c.rotulo}`}
                            disabled={ocupado}
                            onClick={() =>
                              void escrever(
                                () =>
                                  apiFetch(`${ROTA_ADMIN}/${c.id}/reativar`, {
                                    method: "PATCH",
                                    token,
                                  }),
                                `"${c.rotulo}" voltou para a escolha dos clientes.`,
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
                          aria-label={`Excluir ${c.rotulo}`}
                          disabled={ocupado}
                          onClick={() => setRemovendo(c)}
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
        {ativos} {ativos === 1 ? "comercial ativo" : "comerciais ativos"} de {comerciais.length}{" "}
        cadastrados. Quem atende algum cliente não é apagado: é desativado, sai da escolha dos
        cadastros novos e continua identificando os clientes que já atendia.
      </p>

      {/* A INATIVAÇÃO É `warn` E NÃO `danger`: ela não destrói nada e se desfaz num clique no botão
          ao lado. O vermelho é a cor da perda irreversível nesta casa. §A.41: o diálogo não fecha ao
          clicar fora, e a saída visível é o "Cancelar". */}
      <ConfirmDialog
        open={Boolean(inativando)}
        title="Inativar Comercial"
        message={
          inativando
            ? `Inativar "${inativando.rotulo}"? Esta pessoa sai da escolha dos cadastros novos e continua identificando os clientes que ela já atendia. Nada é apagado, e o botão de reativar a traz de volta com o mesmo registro interno.`
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
        title="Excluir Comercial"
        message={
          removendo
            ? `Excluir "${removendo.rotulo}" do catálogo? Se esta pessoa não atende nenhum cliente, ela é apagada. Se atende, ela é desativada: sai da escolha dos cadastros novos e continua identificando os clientes que já atendia.`
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
