"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ETAPA_TONS,
  type AsEtapaFunil,
  type EtapaTom,
} from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  etapasOrdenadas,
  invalidarCatalogoDeEtapas,
  moverNaOrdem,
  reordenacaoLiberada,
} from "@/lib/as-etapas";
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
 * ─ O GERENCIADOR DAS ETAPAS DO FUNIL (A&S) ──────────────────────────────────────────────────────
 *
 * A LISTA DO FUNIL É DO DIRETOR. Esta tela é onde ele a cadastra, renomeia, reordena, colore,
 * inativa, reativa e apaga, e a `as_etapas_funil` passa a ser a fonte da verdade de OITO telas.
 * Molde: o gerenciador de status do iFractal, que já resolveu em produção os mesmos três problemas
 * (código estável derivado do rótulo, renomear sem mover ninguém, recusa de exclusão com contagem).
 *
 * ┌─ A TELA LISTA COM `?incluirInativas=1`, E ISSO NÃO É DETALHE ───────────────────────────────┐
 * │ Ela precisa das inativas para poder REATIVAR, e precisa delas por um motivo mais duro: o     │
 * │ `PATCH /ordem` exige a lista COMPLETA de ids e recusa a parcial. Montada a partir da leitura │
 * │ padrão (só ativas), a reordenação funcionaria até a PRIMEIRA etapa ser inativada e, daí em   │
 * │ diante, seria recusada SEMPRE, com um recado mandando recarregar que não resolveria nada.    │
 * │ Quem monta a lista de ids é `moverNaOrdem`, e o caso está travado em teste.                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A COR VEM DE PALETA FECHADA (`ETAPA_TONS`), NUNCA DE CAMPO DE COR LIVRE ───────────────────┐
 * │ Três razões concretas, e nenhuma é estética: (1) cada tom já tem par claro/escuro no design  │
 * │ system, então os dois temas saem de graça, enquanto um `#hex` legível no escuro some no       │
 * │ claro; (2) o ÍCONE da pill é DERIVADO do tom (§A.12), e cor livre não tem ícone associado;   │
 * │ (3) o vermelho fica FORA de propósito, porque no sistema ele é RECUSA, e etapa de funil é    │
 * │ POSIÇÃO, não julgamento: uma etapa vermelha diria que estar nela é ser reprovado.             │
 * │                                                                                              │
 * │ NÃO HÁ SELETOR DE ÍCONE (decisão do diretor): um ícone só para todas as etapas, e a COR faz  │
 * │ a distinção. Ícone por etapa custaria uma coluna no catálogo e um seletor a mais nesta tela. │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: catálogo de processo. Nenhum dado pessoal entra ou sai desta tela; as contagens que
 * aparecem nas recusas do backend são NÚMEROS, sem nome e sem identificador.
 * §A.12/§A.20/§A.29 (tabela do sistema, larguras que cabem o conteúdo, ordenação clicável),
 * §A.11 (sem travessão), §A.24 (title case em título e tag; botão de ação em escrita normal),
 * §A.35 (`Select` do design system, nunca `<select>` cru).
 */

/** Rótulo e amostra de cada tom oferecido. O vermelho não está aqui, e não deve estar. */
const TOM_ROTULO: Record<EtapaTom, string> = {
  nt: "Neutro",
  in: "Azul",
  wn: "Amarelo",
  or: "Laranja",
  ok: "Verde",
};

/** A variável de cor de cada tom, para o pontinho do seletor ler igual à pill da tabela. */
const TOM_COR: Record<EtapaTom, string> = {
  nt: "var(--dim)",
  in: "var(--accent)",
  wn: "var(--warn)",
  or: "var(--warn-2)",
  ok: "var(--ok)",
};

const OPCOES_TOM = ETAPA_TONS.map((t) => ({
  value: t,
  label: TOM_ROTULO[t],
  color: TOM_COR[t],
}));

/** O que o `DELETE` devolve quando NÃO recusa: ou apagou de verdade, ou inativou. */
interface ResultadoRemocao {
  removida: boolean;
  inativada: boolean;
  mensagem: string;
}

export default function EtapasDoFunilPage() {
  const { token } = useAuth();
  const [etapas, setEtapas] = useState<AsEtapaFunil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  /** O formulário do topo serve para criar E para renomear, no molde dos demais catálogos. */
  const [rotulo, setRotulo] = useState("");
  const [editando, setEditando] = useState<AsEtapaFunil | null>(null);

  /** A etapa que o diretor pediu para excluir. Enquanto existe, o diálogo está aberto. */
  const [removendo, setRemovendo] = useState<AsEtapaFunil | null>(null);

  /**
   * A etapa que o diretor pediu para INATIVAR, e ela é um estado separado do `removendo` de
   * propósito: são duas ações diferentes, com duas frases diferentes e dois tons diferentes, e um
   * estado só obrigaria o diálogo a adivinhar qual delas está aberta.
   */
  const [inativando, setInativando] = useState<AsEtapaFunil | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // A LISTA COMPLETA, sempre (ver o cabeçalho). E a memória do catálogo compartilhado morre
      // junto: as outras telas abertas nesta mesma carga de página precisam enxergar o que mudou.
      invalidarCatalogoDeEtapas();
      setEtapas(etapasOrdenadas(await apiFetch<AsEtapaFunil[]>("/as/etapas?incluirInativas=1", { token })));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar as etapas do funil.");
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
   * A MENSAGEM DE ERRO É A DO BACKEND, sem tradução: as recusas desta frente carregam a informação
   * que resolve o problema ("3 candidaturas estão nesta etapa", "marque outra como inicial antes"),
   * e trocá-las por "falha ao salvar" jogaria fora justamente o que o diretor precisa ler.
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
          ? apiFetch(`/admin/as/etapas/${alvo.id}`, { method: "PATCH", token, body: { rotulo: nome } })
          : apiFetch("/admin/as/etapas", { method: "POST", token, body: { rotulo: nome } }),
      alvo ? `Etapa renomeada para "${nome}".` : `Etapa "${nome}" criada no fim do funil.`,
    );
    if (ok) {
      setRotulo("");
      setEditando(null);
    }
  }

  async function reordenar(etapa: AsEtapaFunil, direcao: "cima" | "baixo") {
    const ids = moverNaOrdem(etapas, etapa.id, direcao);
    // Nada mudou (primeira subindo, última descendo): não gasta requisição nem pisca a tela.
    if (ids.every((id, i) => id === etapas[i]?.id)) return;
    await escrever(
      () => apiFetch("/admin/as/etapas/ordem", { method: "PATCH", token, body: { ids } }),
      `"${etapa.rotulo}" mudou de lugar no funil.`,
    );
  }

  /**
   * INATIVAR: TIRAR DE CIRCULAÇÃO SEM APAGAR NADA.
   *
   * ┌─ POR QUE ELA NÃO PASSA PELO `escrever` ────────────────────────────────────────────────────┐
   * │ Pelo MESMO motivo da exclusão, e o defeito seria idêntico: o diálogo precisa FECHAR antes de │
   * │ a recusa aparecer. As duas recusas desta ação são frases do backend que dizem o que fazer    │
   * │ ("marque outra como inicial antes", "crie outra antes"), e escondidas atrás do overlay elas  │
   * │ viram um botão que não faz nada, com o clique de novo como caminho natural.                  │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A TELA NÃO ANTECIPA A RECUSA desabilitando o botão na etapa inicial nem na última ativa, e isso
   * é escolha: botão apagado não diz POR QUE, e as duas frases do backend dizem o caminho da saída.
   * A régua de quem pode ser inativada é do servidor, e é lá que ela continua.
   */
  async function confirmarInativacao() {
    const alvo = inativando;
    if (!alvo) return;
    setOcupado(true);
    setErro(null);
    setFlash(null);
    try {
      await apiFetch(`/admin/as/etapas/${alvo.id}/inativar`, { method: "PATCH", token });
      setFlash(
        `"${alvo.rotulo}" saiu do funil. Ela não aparece mais nos seletores e continua identificando o histórico de quem passou por ela.`,
      );
      setInativando(null);
      await carregar();
    } catch (e) {
      // O NOME DA ETAPA ENTRA NA FRENTE: fora do diálogo, a frase do backend não diz de qual etapa
      // se trata, e a tabela tem várias linhas.
      const msg = e instanceof ApiError ? e.message : "Falha ao inativar a etapa.";
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
      const r = await apiFetch<ResultadoRemocao>(`/admin/as/etapas/${alvo.id}`, {
        method: "DELETE",
        token,
      });
      // A FRASE É A DO BACKEND: é ele que sabe se apagou ou se inativou, e o porquê. A tela que
      // escrevesse "removida" por conta própria mentiria no caso mais comum, que é a inativação.
      setFlash(r.mensagem);
      setRemovendo(null);
      await carregar();
    } catch (e) {
      /*
       * A RECUSA FECHA O DIÁLOGO, E ISSO FOI CORRIGIDO NA PROVA VISUAL.
       *
       * Deixando o diálogo aberto, a recusa do backend ("1 candidatura está nesta etapa. Mova essa
       * pessoa...") aparecia ATRÁS dele, escurecida pelo overlay e ilegível: da tela do diretor, o
       * botão simplesmente não fazia nada, e o caminho natural era clicar de novo. A frase é a parte
       * ÚTIL da recusa (ela diz quantas pessoas mover), então ela tem de ficar à vista.
       *
       * O NOME DA ETAPA ENTRA NA FRENTE porque, fora do diálogo, a mensagem do backend não diz de
       * qual etapa se trata, e a tabela tem seis linhas.
       */
      const msg = e instanceof ApiError ? e.message : "Falha ao excluir a etapa.";
      setErro(`Não foi possível excluir "${alvo.rotulo}". ${msg}`);
      setRemovendo(null);
    } finally {
      setOcupado(false);
    }
  }

  // §A.29: ordenação clicável pelo `useOrdenacao` que já existe. A coluna Ordem ordena pelo NÚMERO
  // do funil, e não pelo rótulo: é ela que desenha o processo.
  const colunas = useMemo<ColOrd<AsEtapaFunil>[]>(
    () => [
      { chave: "ordem", tipo: "status", valor: (e) => e.ordem },
      { chave: "rotulo", tipo: "texto", valor: (e) => e.rotulo },
      { chave: "codigo", tipo: "texto", valor: (e) => e.codigo },
      { chave: "cor", tipo: "texto", valor: (e) => TOM_ROTULO[e.tom] },
      { chave: "inicial", tipo: "status", valor: (e) => (e.inicial ? 0 : 1) },
      { chave: "status", tipo: "status", valor: (e) => (e.ativa ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, etapas);
  const podeReordenar = reordenacaoLiberada(ord.ordem);

  const ativas = etapas.filter((e) => e.ativa).length;
  const inicial = etapas.find((e) => e.inicial) ?? null;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Etapas Do Funil"
        subtitle="A lista de etapas por onde o candidato passa. Renomear corrige o nome em todo o histórico; a ordem daqui é a ordem do funil em todas as telas."
      />

      {/* O AVISO DA ETAPA INICIAL FICA NO TOPO, e não escondido numa coluna: sem nenhuma marcada, o
          cadastro de candidato PARA, e o consultor recebe um erro que ele não tem como resolver. */}
      {!carregando && !inicial && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3 py-2 text-sm text-warn"
          role="alert"
        >
          Nenhuma etapa está marcada como início do funil. Enquanto isso, nenhum candidato novo pode
          ser cadastrado. Marque uma na coluna Início Do Funil.
        </p>
      )}

      <GlassCard as="form" onSubmit={salvarRotulo} className="mb-5 flex flex-wrap items-center gap-3 p-4">
        {editando && (
          <p className="w-full text-sm text-accent">
            Renomeando &quot;{editando.codigo}&quot;. O registro interno não muda, então o nome novo
            aparece também no histórico de quem já passou por esta etapa.
          </p>
        )}
        <input
          required
          className="ds-input flex-1"
          placeholder={editando ? "Novo nome da etapa *" : "Nome da etapa nova *"}
          aria-label={editando ? "Novo nome da etapa" : "Nome da etapa nova"}
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
        />
        <Button type="submit" disabled={ocupado || !rotulo.trim()} className="shrink-0 py-2.5">
          {editando ? "Salvar nome" : "Acrescentar etapa"}
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
            A etapa nova nasce no fim do funil e inativa nenhuma outra. Depois de criada, use as
            setas para levá-la ao lugar certo.
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

      {/* A trava das setas, explicada no lugar em que ela aparece. Ver `reordenacaoLiberada`. */}
      {!podeReordenar && (
        <p className="mb-3 text-[12.5px] text-dim">
          A tabela está ordenada por outra coluna, então as setas de reordenar estão desligadas: a
          linha de cima não é a etapa anterior no funil. Clique no cabeçalho &quot;Ordem&quot; para
          voltar à ordem do funil.
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          <table className="ds-table min-w-[1000px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="ordem" className="w-[132px]">
                  Ordem
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="rotulo">
                  Etapa
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="codigo" className="w-[210px]">
                  Registro Interno
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cor" className="w-[190px]">
                  Cor
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="inicial" className="w-[168px]">
                  Início Do Funil
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-[124px]">
                  Status
                </ColunaOrdenavel>
                {/* §A.20: a coluna passou de DOIS botões para TRÊS (renomear, inativar ou reativar,
                    e excluir) e subiu de 132px para 168px. Com os 132px de antes, o terceiro botão
                    ou espremia os outros ou vazava da célula. */}
                <th className="w-[168px]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-faint">
                    Carregando...
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-faint">
                    Nenhuma etapa cadastrada. Comece pela primeira, no formulário acima.
                  </td>
                </tr>
              ) : (
                ord.itens.map((e, i) => (
                  <tr key={e.id} className={e.ativa ? "" : "opacity-60"}>
                    <td>
                      <span className="flex items-center justify-center gap-1">
                        <span className="tabular-nums text-dim">{e.ordem}</span>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-30"
                          title="Subir no funil"
                          aria-label={`Subir ${e.rotulo} no funil`}
                          disabled={ocupado || !podeReordenar || i === 0}
                          onClick={() => void reordenar(e, "cima")}
                        >
                          <Icon name="left" className="h-4 w-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-30"
                          title="Descer no funil"
                          aria-label={`Descer ${e.rotulo} no funil`}
                          disabled={ocupado || !podeReordenar || i === ord.itens.length - 1}
                          onClick={() => void reordenar(e, "baixo")}
                        >
                          <Icon name="right" className="h-4 w-4 rotate-90" />
                        </button>
                      </span>
                    </td>

                    {/*
                      A ETAPA USA A `Pill` DO PONTO, E NÃO A `StatusPill` DO ÍCONE, e a diferença é
                      a decisão do diretor: UM ÍCONE SÓ para todas as etapas, com a COR fazendo a
                      distinção.

                      A `StatusPill` DERIVA O ÍCONE DO TOM (§A.12: check no verde, exclamação em
                      todo o resto), e isso está certo para STATUS, que é o que ela nomeia. Etapa de
                      funil não é status: é POSIÇÃO. Com ela, a Captação sairia com a exclamação de
                      "atenção" e a Aprovação com o check de "concluído", ou seja, dois ícones
                      dizendo julgamento sobre onde a pessoa está. Foi assim que esta tela saiu na
                      primeira prova visual, e é o oposto do que o funil quer dizer.

                      O PONTO COLORIDO É A MESMA MARCA que os cards do funil já usam no modal de
                      mover, então a leitura da cor é a mesma nas duas telas. As colunas de STATUS
                      ao lado seguem com a `StatusPill`, porque ali o ícone dinâmico é a régua.
                    */}
                    <td>
                      <span className="inline-flex">
                        <Pill tone={e.tom}>{e.rotulo}</Pill>
                      </span>
                    </td>

                    {/* O CÓDIGO É A IDENTIDADE E É IMUTÁVEL: é ele que fica gravado na candidatura e
                        em cada evento do histórico, e é por isso que renomear não move ninguém.
                        Aparece porque é o que o time vê em exportação e em suporte. */}
                    <td className="text-center">
                      <span className="font-mono text-[12px] text-dim">{e.codigo}</span>
                    </td>

                    <td>
                      <Select
                        className="w-full"
                        menuFit
                        ariaLabel={`Cor da etapa ${e.rotulo}`}
                        value={e.tom}
                        disabled={ocupado}
                        options={OPCOES_TOM}
                        onChange={(v) =>
                          void escrever(
                            () =>
                              apiFetch(`/admin/as/etapas/${e.id}/tom`, {
                                method: "PATCH",
                                token,
                                body: { tom: v },
                              }),
                            `"${e.rotulo}" ficou ${TOM_ROTULO[v as EtapaTom].toLowerCase()}.`,
                          )
                        }
                      />
                    </td>

                    {/* EXCLUSIVO: marcar uma desmarca a anterior, na mesma transação do backend. É
                        a coluna `inicial` que decide onde a candidatura NASCE, e ela é dona única
                        dessa decisão desde que o default do banco saiu. */}
                    <td className="text-center">
                      {e.inicial ? (
                        <span className="inline-flex">
                          <StatusPill tone="ok" label="Nasce Aqui" />
                        </span>
                      ) : e.ativa ? (
                        <button
                          type="button"
                          className="text-[12.5px] text-dim underline-offset-2 hover:text-text hover:underline disabled:opacity-40"
                          disabled={ocupado}
                          onClick={() =>
                            void escrever(
                              () =>
                                apiFetch(`/admin/as/etapas/${e.id}/inicial`, {
                                  method: "PATCH",
                                  token,
                                }),
                              `Toda candidatura nova passa a nascer em "${e.rotulo}".`,
                            )
                          }
                        >
                          marcar como início
                        </button>
                      ) : (
                        <span className="text-faint">não informado</span>
                      )}
                    </td>

                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <StatusPill tone={e.ativa ? "ok" : "nt"} label={e.ativa ? "Ativa" : "Inativa"} />
                      </span>
                    </td>

                    <td>
                      <span className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-40"
                          title="Renomear"
                          aria-label={`Renomear ${e.rotulo}`}
                          disabled={ocupado}
                          onClick={() => {
                            setEditando(e);
                            setRotulo(e.rotulo);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <Icon name="pen" className="h-4 w-4" />
                        </button>
                        {/*
                          ─ A LINHA ATIVA OFERECE INATIVAR; A INATIVA OFERECE REATIVAR ─────────────

                          A COLUNA STATUS DIZIA "ATIVA" E NÃO HAVIA ONDE INATIVAR, que é a
                          incoerência que o diretor apontou: estado mostrado sem ação que o mude é
                          estado que a tela só sabe ler. As duas ações são a MESMA chave, vista dos
                          dois lados, então elas ocupam o MESMO lugar na linha e nunca aparecem
                          juntas: "Inativar" numa linha já inativa não faria nada, e "Reativar" numa
                          ativa também não.

                          EXCLUIR FICA NAS DUAS, e é a diferença em relação a antes: a etapa
                          inativada só tinha o caminho de volta, e a criada por engano ficava
                          inativa para sempre, sem forma de sair da lista. A régua de o que o
                          excluir FAZ (recusa com gente viva, inativa com histórico, apaga quando
                          não há nem uma coisa nem outra) é do servidor, e esta tela só mostra o que
                          voltar de lá.
                        */}
                        {e.ativa ? (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-warn transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Inativar"
                            aria-label={`Inativar ${e.rotulo}`}
                            disabled={ocupado}
                            onClick={() => setInativando(e)}
                          >
                            <Icon name="lock" className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                            title="Reativar"
                            aria-label={`Reativar ${e.rotulo}`}
                            disabled={ocupado}
                            onClick={() =>
                              void escrever(
                                () =>
                                  apiFetch(`/admin/as/etapas/${e.id}/reativar`, {
                                    method: "PATCH",
                                    token,
                                  }),
                                `"${e.rotulo}" voltou ao funil, com o mesmo registro interno e o mesmo histórico.`,
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
                          aria-label={`Excluir ${e.rotulo}`}
                          disabled={ocupado}
                          onClick={() => setRemovendo(e)}
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
        {ativas} {ativas === 1 ? "etapa ativa" : "etapas ativas"} de {etapas.length} cadastradas.
        Etapa por onde alguém já passou não é apagada: ela é desativada, sai dos seletores e continua
        identificando o histórico de quem passou por lá.
      </p>

      {/*
        ─ O DIÁLOGO DA INATIVAÇÃO, E POR QUE ELE É `warn` E NÃO `danger` ─────────────────────────
        A inativação NÃO destrói nada e se desfaz num clique no botão ao lado. O vermelho é a cor da
        perda irreversível nesta casa, e usá-lo aqui diria à pessoa que ela está prestes a perder a
        etapa, bem no meio da ação mais reversível desta tela. §A.41: confirmação antes de mexer no
        catálogo, o diálogo não fecha ao clicar fora, e a saída visível é o "Cancelar".
      */}
      <ConfirmDialog
        open={Boolean(inativando)}
        title="Inativar Etapa Do Funil"
        message={
          inativando
            ? `Inativar "${inativando.rotulo}"? Ela sai dos seletores, dos filtros e da tela de mover, e continua identificando o histórico de quem já passou por ela. Nada é apagado, e o botão de reativar traz a etapa de volta com o mesmo registro interno.`
            : ""
        }
        confirmLabel="Inativar"
        tone="warn"
        busy={ocupado}
        onConfirm={confirmarInativacao}
        onCancel={() => setInativando(null)}
      />

      {/* O DIÁLOGO NÃO PROMETE APAGAR, porque o backend pode INATIVAR, e é ele quem sabe qual dos
          dois é o caso: prometer a exclusão e devolver uma inativação faria a tela mentir na
          maioria das vezes. A recusa com a contagem ("3 candidaturas estão nesta etapa") também vem
          de lá, e chega ao diretor com a frase inteira. */}
      <ConfirmDialog
        open={Boolean(removendo)}
        title="Excluir Etapa Do Funil"
        message={
          removendo
            ? `Excluir "${removendo.rotulo}" do funil? Se ninguém nunca passou por ela, ela é apagada. Se alguém passou, ela é desativada: sai dos seletores e dos filtros e continua identificando o histórico. Havendo gente nesta etapa agora, a exclusão é recusada e o sistema diz quantas pessoas precisam ser movidas antes.`
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
