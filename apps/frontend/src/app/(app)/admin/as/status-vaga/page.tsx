"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { VAGA_STATUS_TONS,
  type VagaStatusTom, type VagaStatusPapel } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  invalidarCatalogoDeStatusVaga,
  statusOrdenados,
  type AsVagaStatus,
} from "@/lib/as-status-vaga";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { Pill } from "@/components/ui/Pill";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

/**
 * ─ O GERENCIADOR DE STATUS DA VAGA (A&S, onda B2) ───────────────────────────────────────────────
 *
 * A LISTA DE STATUS DA VAGA É DO DIRETOR. Esta tela é onde ele a renomeia, reordena, colore e
 * acrescenta os status dele. Molde: o gerenciador de Etapas Do Funil, que já resolveu os mesmos
 * problemas (código estável derivado do rótulo, renomear sem mover ninguém, recusa com contagem).
 *
 * ┌─ A DIFERENÇA PARA AS ETAPAS, E ELA É O ASSUNTO INTEIRO DESTA TELA: AQUI OS CAMPOS SÃO TRAVAS ┐
 * │ Etapa do funil é POSIÇÃO, e o pior que uma edição errada faz é bagunçar a fila. Os campos    │
 * │ daqui MUDAM O QUE O SISTEMA DEIXA FAZER: `recebeCandidato` decide se entra gente na vaga,    │
 * │ `daTrilha` decide o que o seletor de publicação oferece, `movivelManualmente` decide os      │
 * │ destinos do movimento manual. É configuração de sistema com efeito de trava, e é por isso    │
 * │ que a escrita inteira é `@Roles("SUPER_ADMIN")` no backend, com o menu apenas decidindo se o │
 * │ card aparece (§A.23: quem libera menu é o diretor, e menu novo nasce só para o SUPER_ADMIN). │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PAPEL É COLUNA À VISTA, E NÃO UM DETALHE ESCONDIDO ──────────────────────────────────────┐
 * │ É o PAPEL que explica por que uma linha recusa ser apagada, inativada ou ter os flags        │
 * │ mexidos: existe exatamente UMA linha de cada papel de sistema, e é por ele que o código      │
 * │ encontra o status que o fechamento grava, o que o cancelamento grava, o que a abertura       │
 * │ grava. Sem a coluna, o diretor veria uma tela que recusa sem dizer por quê, e a recusa        │
 * │ pareceria defeito. Com ela, a própria tabela documenta a dependência.                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTA TELA NÃO OFERECE, e cada ausência é deliberada (o backend recusa, e oferecer seria
 * mostrar a porta e trancá-la):
 *   . APAGAR ou INATIVAR linha de sistema. Sem ela, a operação correspondente para de funcionar.
 *   . EDITAR OS FLAGS de linha de sistema. Ligar `recebeCandidato` num status terminal devolveria
 *     alocação a vaga encerrada; desligar `movivelManualmente` na ABERTURA transformaria em zumbi
 *     toda vaga parada num status do diretor, porque fechar e cancelar exigem o papel de abertura.
 *   . MUDAR O CÓDIGO. Ele sai do rótulo na criação e é imutável, porque é ele que fica gravado na
 *     vaga e nos dois lados de cada evento da trilha. Renomear NÃO move nenhuma vaga.
 *   . MARCAR `encerra`. Encerrar vaga tem duas portas com régua (fechar e cancelar), e um flag
 *     seria a terceira, sem trava de candidato tratado, sem gate de Master e sem carimbo de
 *     contagem. A coluna existe para LER, nunca para editar.
 *
 * §A.6: catálogo de processo. Nenhum dado pessoal entra ou sai daqui; as contagens que aparecem nas
 * recusas do backend são NÚMEROS, sem nome e sem identificador.
 * §A.12/§A.20/§A.29 (máscara única de tabela, larguras que cabem o conteúdo, ordenação clicável),
 * §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão de ação em escrita normal),
 * §A.35 (`Select` do design system, nunca `<select>` cru), §A.41 (o diálogo não fecha ao clicar
 * fora, e a saída visível é o "Cancelar").
 */

/**
 * Rótulo e amostra de cada tom oferecido.
 *
 * O VERMELHO ESTÁ AQUI, e a paleta do status é a da `Pill` INTEIRA, não a das etapas. A diferença
 * tem motivo: etapa de funil é POSIÇÃO, e pintá-la de vermelho diria que estar nela é ser reprovado;
 * status de vaga inclui o CANCELAMENTO, que é recusa de verdade, e a §A.12 manda o recusado ser o X
 * vermelho. Tirar o `dg` daqui obrigaria a "Cancelada" a mudar de cor na Central de Vagas.
 */
const TOM_ROTULO: Record<VagaStatusTom, string> = {
  nt: "Neutro",
  in: "Azul",
  wn: "Amarelo",
  dg: "Vermelho",
  or: "Laranja",
  ok: "Verde",
};

const TOM_COR: Record<VagaStatusTom, string> = {
  nt: "var(--dim)",
  in: "var(--accent)",
  wn: "var(--warn)",
  dg: "var(--danger)",
  or: "var(--warn-2)",
  ok: "var(--ok)",
};

const OPCOES_TOM = VAGA_STATUS_TONS.map((t) => ({ value: t, label: TOM_ROTULO[t], color: TOM_COR[t] }));

/**
 * O QUE CADA PAPEL SIGNIFICA, em uma frase. É o `title` da tag, e é ele que transforma a recusa em
 * explicação: quem lê "é a linha que o sistema grava no fechamento" entende por que o apagar some.
 */
const PAPEL_EXPLICACAO: Record<VagaStatusPapel, string> = {
  LIVRE:
    "Status criado pela administração. É o único tipo que pode ser renomeado por inteiro, ter os comportamentos ajustados, ser tirado de circulação e ser apagado.",
  RASCUNHO: "É a linha que o sistema grava na vaga salva pela metade, antes da publicação.",
  ABERTURA: "É a linha que a trilha de abertura grava ao publicar a vaga.",
  ENTREGA: "É a linha que o sistema grava quando a vaga é fechada com todas as posições entregues.",
  FECHAMENTO: "É a linha que o sistema grava no fechamento da vaga.",
  CANCELAMENTO: "É a linha que o sistema grava no cancelamento da vaga.",
};

/** §A.24: é TAG, então title case. */
const PAPEL_ROTULO: Record<VagaStatusPapel, string> = {
  LIVRE: "Da Administração",
  RASCUNHO: "Rascunho",
  ABERTURA: "Abertura",
  ENTREGA: "Entrega",
  FECHAMENTO: "Fechamento",
  CANCELAMENTO: "Cancelamento",
};

/** O que o `DELETE` devolve quando NÃO recusa: ou apagou de verdade, ou inativou. */
interface ResultadoRemocao {
  removido: boolean;
  inativado: boolean;
  mensagem: string;
}

/** Os três comportamentos que a administração pode ajustar, e só na linha dela. */
type Flag = "recebeCandidato" | "daTrilha" | "movivelManualmente";

const FLAG_FRASE: Record<Flag, { ligado: string; desligado: string }> = {
  recebeCandidato: {
    ligado: "Entra gente nova numa vaga neste status.",
    desligado: "Vaga neste status não recebe candidato novo. Ela continua consultável.",
  },
  daTrilha: {
    ligado: "A trilha de abertura oferece este status no seletor de publicação.",
    desligado: "Este status não aparece no seletor de publicação da vaga.",
  },
  movivelManualmente: {
    ligado: "Este status aparece como destino do movimento manual, no painel da vaga.",
    desligado: "Este status não é oferecido como destino do movimento manual.",
  },
};

export default function StatusDaVagaPage() {
  const { token } = useAuth();
  const [linhas, setLinhas] = useState<AsVagaStatus[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** O formulário do topo serve para criar E para renomear, no molde dos demais catálogos. */
  const [rotulo, setRotulo] = useState("");
  const [editando, setEditando] = useState<AsVagaStatus | null>(null);

  const [removendo, setRemovendo] = useState<AsVagaStatus | null>(null);
  const [inativando, setInativando] = useState<AsVagaStatus | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // A LISTA COMPLETA, sempre: sem os inativos não há como REATIVAR, e a linha inativada é
      // justamente a que continua identificando a vaga parada nela. E a memória do catálogo
      // compartilhado morre junto, senão as outras telas desta carga de página seguiriam com a
      // lista velha (a pill da Central de Vagas mostraria o rótulo de antes da renomeação).
      invalidarCatalogoDeStatusVaga();
      setLinhas(
        statusOrdenados(await apiFetch<AsVagaStatus[]>("/as/status-vaga?incluirInativos=1", { token })),
      );
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar o catálogo de status da vaga.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * TODA ESCRITA PASSA POR AQUI.
   *
   * A MENSAGEM DE ERRO É A DO BACKEND, sem tradução: as recusas desta frente dizem o que fazer
   * ("este status é o que o sistema grava no papel de FECHAMENTO", "2 vagas estão neste status"), e
   * trocá-las por "falha ao salvar" jogaria fora justamente o que resolve o problema.
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
          ? apiFetch(`/admin/as/status-vaga/${alvo.id}`, {
              method: "PATCH",
              token,
              body: { rotulo: nome },
            })
          : apiFetch("/admin/as/status-vaga", { method: "POST", token, body: { rotulo: nome } }),
      alvo
        ? `Status renomeado para "${nome}". O registro interno não mudou, então nenhuma vaga se moveu.`
        : `Status "${nome}" criado. Ele nasce sem nenhum comportamento ligado: ajuste na linha dele o que ele deve fazer.`,
    );
    if (ok) {
      setRotulo("");
      setEditando(null);
    }
  }

  /**
   * A ORDEM É UM CAMPO, E NÃO UM PAR DE SETAS, e a diferença vem do backend: aqui não existe um
   * `PATCH /ordem` que receba a lista inteira de ids (como o das etapas), existe a coluna `ordem` de
   * CADA linha. Setas exigiriam DUAS escritas para uma troca de lugar, sem transação em volta: se a
   * segunda falhasse, duas linhas ficariam com o mesmo número e a lista dançaria a cada F5.
   *
   * ORDEM REPETIDA É FEIA, NÃO É ERRO: o desempate por código mantém a lista estável.
   */
  async function salvarOrdem(alvo: AsVagaStatus, valor: string) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1 || n > 999 || n === alvo.ordem) return;
    await escrever(
      () =>
        apiFetch(`/admin/as/status-vaga/${alvo.id}`, { method: "PATCH", token, body: { ordem: n } }),
      `"${alvo.rotulo}" agora é o número ${n} da lista.`,
    );
  }

  async function alternarFlag(alvo: AsVagaStatus, flag: Flag) {
    const novo = !alvo[flag];
    await escrever(
      () =>
        apiFetch(`/admin/as/status-vaga/${alvo.id}`, {
          method: "PATCH",
          token,
          body: { [flag]: novo },
        }),
      `"${alvo.rotulo}": ${novo ? FLAG_FRASE[flag].ligado : FLAG_FRASE[flag].desligado}`,
    );
  }

  /**
   * INATIVAR e EXCLUIR não passam pelo `escrever`, e o motivo é o mesmo dos outros catálogos: o
   * DIÁLOGO precisa FECHAR antes de a recusa aparecer. Escondida atrás do overlay, a frase do
   * backend vira um botão que não faz nada, e o caminho natural é clicar de novo.
   */
  async function confirmarInativacao() {
    const alvo = inativando;
    if (!alvo) return;
    setOcupado(true);
    setErro(null);
    setFlash(null);
    try {
      await apiFetch(`/admin/as/status-vaga/${alvo.id}/inativar`, { method: "PATCH", token });
      setFlash(
        `"${alvo.rotulo}" saiu de circulação. Ele não aparece mais nos seletores e continua identificando as vagas que passaram por ele.`,
      );
      setInativando(null);
      await carregar();
    } catch (e) {
      // O NOME ENTRA NA FRENTE: fora do diálogo, a frase do backend não diz de qual linha se trata.
      setErro(
        `Não foi possível inativar "${alvo.rotulo}". ${e instanceof ApiError ? e.message : "Falha ao inativar o status."}`,
      );
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
      const r = await apiFetch<ResultadoRemocao>(`/admin/as/status-vaga/${alvo.id}`, {
        method: "DELETE",
        token,
      });
      // A FRASE É A DO BACKEND: é ele que sabe se apagou ou se inativou, e por quê. A tela que
      // escrevesse "removido" por conta própria mentiria no caso mais comum, que é a inativação.
      setFlash(r.mensagem);
      setRemovendo(null);
      await carregar();
    } catch (e) {
      setErro(
        `Não foi possível excluir "${alvo.rotulo}". ${e instanceof ApiError ? e.message : "Falha ao excluir o status."}`,
      );
      setRemovendo(null);
    } finally {
      setOcupado(false);
    }
  }

  // §A.29: ordenação clicável pelo `useOrdenacao` que já existe. A coluna Ordem ordena pelo NÚMERO
  // da lista, e não pelo rótulo: é ela que desenha a vida da vaga.
  const colunas = useMemo<ColOrd<AsVagaStatus>[]>(
    () => [
      { chave: "ordem", tipo: "status", valor: (l) => l.ordem },
      { chave: "rotulo", tipo: "texto", valor: (l) => l.rotulo },
      { chave: "codigo", tipo: "texto", valor: (l) => l.codigo },
      { chave: "papel", tipo: "texto", valor: (l) => PAPEL_ROTULO[l.papel] },
      { chave: "cor", tipo: "texto", valor: (l) => TOM_ROTULO[l.tom] },
      { chave: "recebe", tipo: "status", valor: (l) => (l.recebeCandidato ? 0 : 1) },
      { chave: "trilha", tipo: "status", valor: (l) => (l.daTrilha ? 0 : 1) },
      { chave: "manual", tipo: "status", valor: (l) => (l.movivelManualmente ? 0 : 1) },
      { chave: "encerra", tipo: "status", valor: (l) => (l.encerra ? 0 : 1) },
      { chave: "situacao", tipo: "status", valor: (l) => (l.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, linhas);
  const ativos = linhas.filter((l) => l.ativo).length;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Status Da Vaga"
        subtitle="A lista de estados por onde a vaga passa. Renomear corrige o nome em todas as telas e em todo o histórico, sem mover nenhuma vaga; a ordem daqui é a ordem dos cards e da coluna Status na Central de Vagas."
      />

      <GlassCard
        as="form"
        onSubmit={salvarRotulo}
        className="mb-5 flex flex-wrap items-center gap-3 p-4"
      >
        {editando && (
          <p className="w-full text-sm text-accent">
            Renomeando &quot;{editando.codigo}&quot;. O registro interno não muda, então o nome novo
            aparece também nas vagas que já estão neste status e no histórico delas.
          </p>
        )}
        <input
          required
          className="ds-input flex-1"
          placeholder={editando ? "Novo nome do status *" : "Nome do status novo *"}
          aria-label={editando ? "Novo nome do status" : "Nome do status novo"}
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
        />
        <Button type="submit" disabled={ocupado || !rotulo.trim()} className="shrink-0 py-2.5">
          {editando ? "Salvar nome" : "Acrescentar status"}
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
            O status novo nasce no fim da lista e sem nenhum comportamento ligado: ele não recebe
            candidato, não aparece na publicação e não é destino de movimento manual. Ligue na linha
            dele o que ele deve fazer. O status novo nunca encerra vaga.
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
        {/* ─ §A.20, A LARGURA MEDIDA NO BROWSER E NÃO ESTIMADA ────────────────────────────────
            A PRIMEIRA VERSÃO ESCONDIA A COLUNA DE AÇÕES, e o número diz por quê: a 1920px a caixa
            útil é de 1574px e a tabela pedia 1725px, ou seja, 151px do lado de fora, e o que ficava
            lá era a última coluna, justamente a dos três gestos da tela. Medido, não deduzido.

            QUEM PEDIA A LARGURA ERA O CABEÇALHO, NÃO O DADO: as quatro colunas de comportamento
            mostram um "Sim" ou um "Não" de 63px e ocupavam de 151px a 179px, porque o rótulo do
            `ColunaOrdenavel` vive num `truncate` (`white-space: nowrap`) e "PUBLICA PELA TRILHA"
            numa linha só é um piso de 179px. O `whitespace-normal` devolve ao rótulo o direito de
            quebrar: em tela larga ele continua numa linha, e quando aperta ele vira duas linhas em
            vez de roubar espaço da coluna. Duas linhas de cabeçalho é leitura; coluna empurrada
            para fora da tela é supressão, que é o que a regra proíbe.

            O `w-[1%]` PRENDE A COLUNA NO PISO DO PRÓPRIO CONTEÚDO, e a sobra inteira vai para a
            coluna Status, que é a única de largura variável (o rótulo é o que o diretor escrever).
            O padding de 11px é o mesmo recurso e o mesmo número que a Central de Vagas já usa: onze
            colunas vezes dois lados vezes 5px devolvem 110px à tabela sem encostar em nenhum dado.

            E ELA CONTINUA ROLANDO quando a janela é estreita (§A.12: rola em vez de espremer), só
            que agora o piso é o do conteúdo de verdade, e não o do texto do cabeçalho. */}
        <div className="ea-scroll overflow-x-auto">
          <table className="ds-table min-w-[1180px] [&_tbody_td]:!px-[9px] [&_thead_th]:!px-[9px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="ordem" className="w-[1%]">
                  Ordem
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="rotulo">
                  Status
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="codigo" className="w-[1%]">
                  <span className="whitespace-normal">Registro Interno</span>
                </ColunaOrdenavel>
                {/* PAPEL E SITUAÇÃO FICAM SEM PISO FIXO, junto de STATUS: são as três colunas de
                    largura variável (a tag do papel, a pill do status e a de circulação), e é entre
                    elas que a sobra da tela se reparte. Com todas presas menos uma, a sobra inteira
                    caía na coluna Status, que ficava com 393px para mostrar uma pill de 117px, e o
                    §A.20 proíbe tanto a coluna espremida quanto o vazio grande do lado. */}
                <ColunaOrdenavel as="th" ord={ord} chave="papel">
                  Papel
                </ColunaOrdenavel>
                {/* A COR TAMBÉM ENTRA NO RATEIO: o `Select` é `w-full`, então ele acompanha a
                    coluna em vez de fixá-la, e o piso dele é o do rótulo mais longo da paleta com
                    o ponto e a seta. Presa em 148px ela cobrava 17px que não usava. */}
                <ColunaOrdenavel as="th" ord={ord} chave="cor">
                  Cor
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="recebe" className="w-[1%]">
                  <span className="whitespace-normal">Recebe Candidato</span>
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="trilha" className="w-[1%]">
                  <span className="whitespace-normal">Publica Pela Trilha</span>
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="manual" className="w-[1%]">
                  <span className="whitespace-normal">Movimento Manual</span>
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="encerra" className="w-[1%]">
                  <span className="whitespace-normal">Encerra A Vaga</span>
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="situacao">
                  Situação
                </ColunaOrdenavel>
                <th className="w-[1%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-faint">
                    Carregando...
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-faint">
                    Nenhum status cadastrado.
                  </td>
                </tr>
              ) : (
                ord.itens.map((l) => {
                  const daAdministracao = l.papel === "LIVRE";
                  return (
                    <tr key={l.id} className={l.ativo ? "" : "opacity-60"}>
                      {/* A ORDEM É EDITÁVEL EM QUALQUER LINHA, inclusive nas de sistema: mudar o
                          lugar do "Cancelada" na fila não muda o que o cancelamento faz. */}
                      <td className="text-center">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          defaultValue={l.ordem}
                          key={`${l.id}-${l.ordem}`}
                          disabled={ocupado}
                          aria-label={`Ordem de ${l.rotulo} na lista`}
                          title="A posição na lista. Vale para os cards, para a coluna Status e para os seletores."
                          className="ds-input w-[72px] text-center tabular-nums"
                          onBlur={(e) => void salvarOrdem(l, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      </td>

                      {/* A PILL DO STATUS COM A COR DE VERDADE: é assim que ela aparece na Central
                          de Vagas, então a escolha de cor se confere aqui mesmo. Ela usa a `Pill`
                          do ponto e não a `StatusPill` do ícone porque o ícone da `StatusPill` é
                          DERIVADO do tom (§A.12) e diria julgamento sobre a linha do catálogo; nas
                          colunas de SIM/NÃO ao lado, onde o ícone é a régua, ela continua. */}
                      <td>
                        <span className="inline-flex">
                          <Pill tone={l.tom}>{l.rotulo}</Pill>
                        </span>
                      </td>

                      {/* O CÓDIGO É A IDENTIDADE E É IMUTÁVEL: é ele que fica gravado na vaga e nos
                          dois lados de cada evento da trilha, e é por isso que renomear não move
                          nenhuma vaga. Aparece porque é o que o time vê em exportação e em suporte. */}
                      <td className="text-center">
                        <span className="font-mono text-[12px] text-dim">{l.codigo}</span>
                      </td>

                      <td className="text-center">
                        <span className="inline-flex" title={PAPEL_EXPLICACAO[l.papel]}>
                          <Pill tone={daAdministracao ? "in" : "nt"}>{PAPEL_ROTULO[l.papel]}</Pill>
                        </span>
                      </td>

                      <td>
                        <Select
                          className="w-full"
                          menuFit
                          ariaLabel={`Cor do status ${l.rotulo}`}
                          value={l.tom}
                          disabled={ocupado}
                          options={OPCOES_TOM}
                          onChange={(v) =>
                            void escrever(
                              () =>
                                apiFetch(`/admin/as/status-vaga/${l.id}`, {
                                  method: "PATCH",
                                  token,
                                  body: { tom: v },
                                }),
                              `"${l.rotulo}" ficou ${TOM_ROTULO[v as VagaStatusTom].toLowerCase()}.`,
                            )
                          }
                        />
                      </td>

                      <CelulaFlag linha={l} flag="recebeCandidato" />
                      <CelulaFlag linha={l} flag="daTrilha" />
                      <CelulaFlag linha={l} flag="movivelManualmente" />

                      {/* ENCERRA É SÓ LEITURA, EM TODAS AS LINHAS. Ele existe aqui para EXPLICAR:
                          é ele que congela o contador de posições e o de dias em aberto, e é ele
                          que impede a linha de ser destino de movimento manual. Editá-lo abriria
                          uma terceira porta para o estado terminal, sem régua nenhuma. */}
                      <td className="text-center">
                        <span
                          className="inline-flex justify-center"
                          title={
                            l.encerra
                              ? "A vaga neste status está encerrada: a contagem de posições congela no número do fechamento e o contador de dias em aberto para. Não é editável, e encerrar vaga continua sendo só pelo fechar e pelo cancelar."
                              : "A vaga neste status continua viva: a contagem acompanha as alocações e o contador de dias segue correndo."
                          }
                        >
                          <StatusPill tone={l.encerra ? "wn" : "nt"} label={l.encerra ? "Sim" : "Não"} />
                        </span>
                      </td>

                      <td className="text-center">
                        <span className="inline-flex justify-center">
                          <StatusPill
                            tone={l.ativo ? "ok" : "nt"}
                            label={l.ativo ? "Em Circulação" : "Fora De Circulação"}
                          />
                        </span>
                      </td>

                      <td>
                        <span className="flex items-center justify-center gap-0.5">
                          {/* RENOMEAR VALE PARA TODA LINHA, inclusive as de sistema: o diretor
                              troca "Entregue" pelo nome que ele usa, e o fechamento continua
                              achando a linha certa pelo PAPEL, não pelo nome. */}
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

                          {/* TIRAR DE CIRCULAÇÃO E APAGAR SÓ EXISTEM NA LINHA DA ADMINISTRAÇÃO.
                              Na linha de sistema o backend recusa os dois, e mostrar o botão para
                              tomar a recusa depois seria mostrar a porta e trancá-la. O PAPEL, na
                              coluna ao lado, é o que explica a ausência. */}
                          {daAdministracao &&
                            (l.ativo ? (
                              <button
                                type="button"
                                className="grid h-8 w-8 place-items-center rounded-lg text-warn transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                                title="Tirar de circulação"
                                aria-label={`Tirar ${l.rotulo} de circulação`}
                                disabled={ocupado}
                                onClick={() => setInativando(l)}
                              >
                                <Icon name="lock" className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="grid h-8 w-8 place-items-center rounded-lg text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                                title="Devolver à circulação"
                                aria-label={`Devolver ${l.rotulo} à circulação`}
                                disabled={ocupado}
                                onClick={() =>
                                  void escrever(
                                    () =>
                                      apiFetch(`/admin/as/status-vaga/${l.id}/reativar`, {
                                        method: "PATCH",
                                        token,
                                      }),
                                    `"${l.rotulo}" voltou à circulação, com o mesmo registro interno e o mesmo histórico.`,
                                  )
                                }
                              >
                                <Icon name="undo" className="h-4 w-4" />
                              </button>
                            ))}

                          {daAdministracao && (
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
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <p className="mt-3 text-[12px] text-faint">
        {ativos} de {linhas.length} status em circulação. Status por onde alguma vaga já passou não é apagado: ele é tirado de circulação,
        sai dos seletores e continua identificando o histórico. As linhas de sistema não são apagadas
        nem tiradas de circulação em nenhuma hipótese, porque a operação que grava cada uma delas
        para de funcionar sem elas.
      </p>

      {/* §A.41: confirmação antes de mexer no catálogo, o diálogo não fecha ao clicar fora, e a
          saída visível é o "Cancelar". É `warn` e não `danger` porque tirar de circulação não
          destrói nada e se desfaz num clique no botão ao lado. */}
      <ConfirmDialog
        open={Boolean(inativando)}
        title="Tirar Status De Circulação"
        message={
          inativando
            ? `Tirar "${inativando.rotulo}" de circulação? Ele sai dos seletores, do filtro e dos destinos do movimento manual, e continua identificando as vagas que já passaram por ele. Nada é apagado, e o botão de devolver traz o status de volta com o mesmo registro interno.`
            : ""
        }
        confirmLabel="Tirar de circulação"
        tone="warn"
        busy={ocupado}
        onConfirm={confirmarInativacao}
        onCancel={() => setInativando(null)}
      />

      {/* O DIÁLOGO NÃO PROMETE APAGAR, porque o backend pode INATIVAR, e é ele quem sabe qual dos
          dois é o caso: prometer a exclusão e devolver uma inativação faria a tela mentir na maioria
          das vezes. A recusa com a contagem ("2 vagas estão neste status") também vem de lá, e chega
          ao diretor com a frase inteira. */}
      <ConfirmDialog
        open={Boolean(removendo)}
        title="Excluir Status Da Vaga"
        message={
          removendo
            ? `Excluir "${removendo.rotulo}" do catálogo? Se nenhuma vaga nunca passou por ele, ele é apagado. Se alguma passou, ele é tirado de circulação: sai dos seletores e continua identificando o histórico. Havendo vaga neste status agora, a exclusão é recusada e o sistema diz quantas precisam ser movidas antes.`
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

  /**
   * UMA CÉLULA DE COMPORTAMENTO.
   *
   * NA LINHA DA ADMINISTRAÇÃO ELA É UM BOTÃO que liga e desliga; na LINHA DE SISTEMA ela é uma pill
   * de leitura, sem botão. O backend descarta os flags enviados para linha de sistema em silêncio,
   * então um botão ali seria um clique que parece funcionar e não muda nada, que é pior do que um
   * botão que recusa. O `title` diz, nos dois casos, o que aquele valor SIGNIFICA na operação.
   *
   * É UMA FUNÇÃO DENTRO DO COMPONENTE, e não um componente à parte, porque ela lê `ocupado` e
   * `alternarFlag` do estado da tela.
   */
  function CelulaFlag({ linha, flag }: { linha: AsVagaStatus; flag: Flag }) {
    const ligado = linha[flag];
    const frase = ligado ? FLAG_FRASE[flag].ligado : FLAG_FRASE[flag].desligado;
    const daAdministracao = linha.papel === "LIVRE";
    return (
      <td className="text-center">
        {daAdministracao ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void alternarFlag(linha, flag)}
            title={`${frase} Clique para ${ligado ? "desligar" : "ligar"}.`}
            aria-label={`${frase} Clique para ${ligado ? "desligar" : "ligar"}.`}
            className="inline-flex justify-center rounded-full transition hover:opacity-80 disabled:opacity-40"
          >
            <StatusPill tone={ligado ? "ok" : "nt"} label={ligado ? "Sim" : "Não"} />
          </button>
        ) : (
          <span
            className="inline-flex justify-center"
            title={`${frase} Este comportamento é do sistema e não é editável nesta linha.`}
          >
            <StatusPill tone={ligado ? "ok" : "nt"} label={ligado ? "Sim" : "Não"} />
          </span>
        )}
      </td>
    );
  }
}
