"use client";

/**
 * ─ O CATÁLOGO DE LINHAS DE SERVIÇO (Onda C, peça 1): a tela que o diretor pediu ────────────────
 *
 * MOLDE EXATO DA TELA DE ETAPAS DO FUNIL (`/admin/as/etapas`), e isso foi pedido com estas
 * palavras: criar, renomear, reordenar, inativar. O que muda é o dado; o gesto é o mesmo, e quem
 * já usa uma das duas não precisa aprender a outra.
 *
 * ┌─ POR QUE A LINHA DE SERVIÇO VIROU CATÁLOGO, E NÃO UMA LISTA NO CÓDIGO ─────────────────────┐
 * │ Pontuais & Estratégicas, RPO & BPO, Alto Volume, SouFast e OneShot são a lista de HOJE. Uma │
 * │ constante no código faria cada renomeação virar uma publicação, e é a mesma razão pela qual  │
 * │ as etapas do funil e os status da vaga deixaram de ser constantes.                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELA NÃO É O "PROJETO" DO ALTO VOLUME: `projetos_alto_volume` guarda EVENTOS (campanhas com data,
 * dentro da operação de alto volume). Esta é a linha de serviço da vaga, outro eixo. Os dois são
 * dados diferentes com o mesmo nome de negócio, e é por isso que esta tela diz o nome inteiro.
 *
 * §A.23: o menu `as-linhas-servico` nasce SÓ PARA O SUPER_ADMIN. A fábrica registra e para por aí:
 * quem libera para quem é o diretor, na tela de permissão de menu.
 * §A.12/§A.20 (a máscara única de tabela, nada esmagado), §A.29 (ordenação por clique),
 * §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão é ação),
 * §A.41 (o diálogo não fecha ao clicar fora, e a saída visível é o "Cancelar").
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { AsLinhaDeServico } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  invalidarCatalogoDeLinhas,
  linhasOrdenadas,
  ROTA_ADMIN,
  ROTA_LEITURA,
} from "@/lib/as-linhas-servico";
import { moverNaOrdem, reordenacaoLiberada } from "@/lib/as-etapas";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

export default function LinhasDeServicoPage() {
  const { token } = useAuth();
  const [linhas, setLinhas] = useState<AsLinhaDeServico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [rotulo, setRotulo] = useState("");
  const [editando, setEditando] = useState<AsLinhaDeServico | null>(null);
  const [inativando, setInativando] = useState<AsLinhaDeServico | null>(null);
  const [removendo, setRemovendo] = useState<AsLinhaDeServico | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      /* A LISTA COMPLETA, com as inativas: é esta tela que as reativa, e sem elas a linha desligada
         desapareceria em vez de ficar disponível para voltar. E a memória do catálogo compartilhado
         morre junto, senão a abertura de vaga aberta nesta mesma carga de página continuaria
         oferecendo o que acabou de ser inativado. */
      invalidarCatalogoDeLinhas();
      setLinhas(linhasOrdenadas(await apiFetch<AsLinhaDeServico[]>(ROTA_LEITURA, { token })));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar as linhas de serviço.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * TODA ESCRITA PASSA POR AQUI, e a mensagem de erro é a DO BACKEND, sem tradução: as recusas
   * desta frente carregam a informação que resolve o problema ("3 vagas usam esta linha"), e
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
      alvo
        ? `Linha de serviço renomeada para "${nome}".`
        : `Linha de serviço "${nome}" criada no fim da lista.`,
    );
    if (ok) {
      setRotulo("");
      setEditando(null);
    }
  }

  /**
   * A REORDENAÇÃO REUSA `moverNaOrdem` E `reordenacaoLiberada` DAS ETAPAS, e isso é deliberado: as
   * duas funções são puras, já testadas, e não sabem nada de funil (uma troca dois vizinhos numa
   * lista de ids; a outra responde se a tabela está na ordem do catálogo). Reescrevê-las aqui daria
   * duas cópias da mesma régua, que divergiriam no primeiro ajuste.
   */
  async function reordenar(linha: AsLinhaDeServico, direcao: "cima" | "baixo") {
    const ids = moverNaOrdem(linhas, linha.id, direcao);
    // Nada mudou (primeira subindo, última descendo): não gasta requisição nem pisca a tela.
    if (ids.every((id, i) => id === linhas[i]?.id)) return;
    await escrever(
      () => apiFetch(`${ROTA_ADMIN}/ordem`, { method: "PATCH", token, body: { ids } }),
      `"${linha.rotulo}" mudou de lugar na lista.`,
    );
  }

  /**
   * INATIVAR E EXCLUIR NÃO PASSAM PELO `escrever`, e o motivo é o mesmo da tela de etapas: o
   * diálogo precisa FECHAR antes de a recusa aparecer. As recusas destas duas ações são frases do
   * backend que dizem o que fazer, e escondidas atrás do overlay elas viram um botão que não faz
   * nada, com o clique de novo como caminho natural.
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
      setFlash(`"${alvo.rotulo}" saiu da escolha das vagas novas. As vagas antigas não mudaram.`);
      await carregar();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Falha ao inativar a linha de serviço.";
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
      /* O NOME ENTRA NA FRENTE porque, fora do diálogo, a mensagem do backend não diz de qual linha
         se trata, e a tabela tem várias. */
      const msg = e instanceof ApiError ? e.message : "Falha ao excluir a linha de serviço.";
      setErro(`Não foi possível excluir "${alvo.rotulo}". ${msg}`);
      setRemovendo(null);
    } finally {
      setOcupado(false);
    }
  }

  // §A.29: ordenação clicável pelo `useOrdenacao` que já existe. A coluna Ordem ordena pelo NÚMERO,
  // e não pelo rótulo: é ela que desenha a sequência em que as linhas aparecem no seletor da vaga.
  const colunas = useMemo<ColOrd<AsLinhaDeServico>[]>(
    () => [
      { chave: "ordem", tipo: "status", valor: (l) => l.ordem },
      { chave: "rotulo", tipo: "texto", valor: (l) => l.rotulo },
      { chave: "codigo", tipo: "texto", valor: (l) => l.codigo },
      { chave: "status", tipo: "status", valor: (l) => (l.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, linhas);
  const podeReordenar = reordenacaoLiberada(ord.ordem);
  const ativas = linhas.filter((l) => l.ativo).length;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Linhas De Serviço"
        subtitle="A classificação de serviço da vaga, escolhida na abertura. Renomear corrige o nome em todas as vagas; a ordem daqui é a ordem do seletor."
      />

      {/* O CATÁLOGO VAZIO PARA A ABERTURA DE VAGA, e isso é dito no topo em vez de descoberto lá:
          a linha de serviço é obrigatória para publicar, então sem nenhuma ativa nenhuma vaga nova
          é publicada, e quem abre a vaga recebe uma pendência que ele não tem como resolver. */}
      {!carregando && ativas === 0 && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3 py-2 text-sm text-warn"
          role="alert"
        >
          Nenhuma linha de serviço está ativa. Enquanto isso, nenhuma vaga nova pode ser publicada,
          porque a linha de serviço é obrigatória na abertura.
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
            aparece também nas vagas que já foram abertas com esta linha.
          </p>
        )}
        <input
          required
          className="ds-input flex-1"
          placeholder={editando ? "Novo nome da linha *" : "Nome da linha de serviço nova *"}
          aria-label={editando ? "Novo nome da linha de serviço" : "Nome da linha de serviço nova"}
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
        />
        <Button type="submit" disabled={ocupado || !rotulo.trim()} className="shrink-0 py-2.5">
          {editando ? "Salvar nome" : "Acrescentar linha"}
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
            A linha nova nasce no fim da lista e ativa. Depois de criada, use as setas para levá-la
            ao lugar certo.
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
                  Linha De Serviço
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
                    Nenhuma linha de serviço cadastrada. Comece pela primeira, no formulário acima.
                  </td>
                </tr>
              ) : (
                ord.itens.map((l, i) => (
                  <tr key={l.id} className={l.ativo ? "" : "opacity-60"}>
                    <td>
                      <span className="flex items-center justify-center gap-1">
                        <span className="tabular-nums text-dim">{l.ordem}</span>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-30"
                          title="Subir na lista"
                          aria-label={`Subir ${l.rotulo} na lista`}
                          disabled={ocupado || !podeReordenar || i === 0}
                          onClick={() => void reordenar(l, "cima")}
                        >
                          <Icon name="left" className="h-4 w-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-30"
                          title="Descer na lista"
                          aria-label={`Descer ${l.rotulo} na lista`}
                          disabled={ocupado || !podeReordenar || i === ord.itens.length - 1}
                          onClick={() => void reordenar(l, "baixo")}
                        >
                          <Icon name="right" className="h-4 w-4 rotate-90" />
                        </button>
                      </span>
                    </td>

                    <td className="font-semibold">{l.rotulo}</td>

                    {/* O CÓDIGO É A IDENTIDADE E NÃO MUDA: renomear a linha não mexe nele, e é por
                        isso que a vaga aberta ano passado continua apontando para a mesma linha
                        depois de o nome dela mudar. Aparece porque é o que o time vê em exportação
                        e em suporte. */}
                    <td className="text-center">
                      <span className="font-mono text-[12px] text-dim">{l.codigo}</span>
                    </td>

                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <StatusPill tone={l.ativo ? "ok" : "nt"} label={l.ativo ? "Ativa" : "Inativa"} />
                      </span>
                    </td>

                    <td>
                      <span className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-40"
                          title="Renomear"
                          aria-label={`Renomear ${l.rotulo}`}
                          disabled={ocupado}
                          onClick={() => {
                            setEditando(l);
                            setRotulo(l.rotulo);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Icon name="pen" className="h-4 w-4" />
                        </button>
                        {/* A LINHA ATIVA OFERECE INATIVAR; A INATIVA OFERECE REATIVAR. É a mesma
                            chave vista dos dois lados, então as duas ocupam o MESMO lugar e nunca
                            aparecem juntas. */}
                        {l.ativo ? (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-warn transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Inativar"
                            aria-label={`Inativar ${l.rotulo}`}
                            disabled={ocupado}
                            onClick={() => setInativando(l)}
                          >
                            <Icon name="lock" className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Reativar"
                            aria-label={`Reativar ${l.rotulo}`}
                            disabled={ocupado}
                            onClick={() =>
                              void escrever(
                                () =>
                                  apiFetch(`${ROTA_ADMIN}/${l.id}/reativar`, {
                                    method: "PATCH",
                                    token,
                                  }),
                                `"${l.rotulo}" voltou para a escolha das vagas novas.`,
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
                          aria-label={`Excluir ${l.rotulo}`}
                          disabled={ocupado}
                          onClick={() => setRemovendo(l)}
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
        {ativas} {ativas === 1 ? "linha ativa" : "linhas ativas"} de {linhas.length} cadastradas.
        Linha usada por alguma vaga não é apagada: ela é desativada, sai da escolha das vagas novas e
        continua identificando as que já foram abertas com ela.
      </p>

      {/* A INATIVAÇÃO É `warn` E NÃO `danger`: ela não destrói nada e se desfaz num clique no botão
          ao lado. O vermelho é a cor da perda irreversível nesta casa. §A.41: o diálogo não fecha ao
          clicar fora, e a saída visível é o "Cancelar". */}
      <ConfirmDialog
        open={Boolean(inativando)}
        title="Inativar Linha De Serviço"
        message={
          inativando
            ? `Inativar "${inativando.rotulo}"? Ela sai da escolha das vagas novas e continua identificando as vagas que já foram abertas com ela. Nada é apagado, e o botão de reativar traz a linha de volta com o mesmo registro interno.`
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
        title="Excluir Linha De Serviço"
        message={
          removendo
            ? `Excluir "${removendo.rotulo}" do catálogo? Se nenhuma vaga usa esta linha, ela é apagada. Se alguma usa, ela é desativada: sai da escolha das vagas novas e continua identificando as que já existem.`
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
