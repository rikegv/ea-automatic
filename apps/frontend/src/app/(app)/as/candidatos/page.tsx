"use client";

/**
 * CENTRAL DE CANDIDATOS (A&S, onda 1): a fila de quem está em processo seletivo.
 *
 * ┌─ §A.6, E É O PONTO QUE MOLDA ESTA TELA INTEIRA ────────────────────────────────────────────┐
 * │ 1. O CPF NUNCA ENTRA NUMA URL. Nem em `router.push`, nem em `searchParams`, nem em link, nem│
 * │    na busca. A busca é `POST /as/candidatos/buscar` com o número NO CORPO, porque query      │
 * │    string aparece em log de proxy, em histórico de navegador e no cabeçalho `Referer`.       │
 * │ 2. A LISTA NÃO MOSTRA CPF, e nem sequer o recebe: o backend devolve `temCpf`, um booleano. A │
 * │    coluna Candidato mostra se a pessoa TEM o número, não qual é. O número sai só na FICHA.   │
 * │ 3. A TELA NÃO HIDRATA A LISTA COM FICHAS. Seria o caminho fácil para preencher as colunas de │
 * │    funil, e traria o CPF da base inteira para o navegador, desfazendo em uma linha a         │
 * │    minimização que o backend construiu. O funil vem do PAINEL DA VAGA, que não devolve CPF.  │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DE ONDE VEM CADA COLUNA, já que o backend desta onda tem três leituras e nenhuma entrega tudo:
 *   - a PESSOA vem de `POST /buscar` (pobre de propósito);
 *   - a CANDIDATURA (vaga, etapa, situação) vem de `GET /vaga/:id`, o painel de cada vaga;
 *   - CLIENTE e CARGO vêm da própria vaga, em `GET /as/vagas`.
 * A tela cruza as três em memória. Uma linha é uma CANDIDATURA, e quem ainda não foi alocada aparece
 * com a vaga em branco: pessoa sem candidatura é pessoa NA BASE, não cadastro pela metade.
 *
 * §A.12 (máscara única de tabela: cabeçalho centralizado, divisória entre colunas, ícone dinâmico por
 * estado, KPI clicável como filtro), §A.11 (sem travessão), §A.24 (title case em título e tag).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AS_CANDIDATO_ORIGEM,
  AS_CANDIDATO_ORIGEM_LABEL,
  CANDIDATURA_ETAPAS,
  CANDIDATURA_ETAPA_LABEL,
  CANDIDATURA_SITUACAO_LABEL,
  CANDIDATURA_SITUACOES,
  candidaturaViva,
  type AsCandidatoListItem,
  type AsCandidaturaItem,
  type VagaListItem,
} from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { Combobox } from "@/components/ui/Combobox";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { cn } from "@/lib/cn";
import {
  buscarCandidatos,
  dataHoraBr,
  kpiDaCandidatura,
  mensagemDoErro,
  painelDaVaga,
  type KpiId,
} from "@/lib/as-candidatos";
import { tomDaEtapa, tomDaSituacao } from "@/lib/as-candidatos-visual";
import { NovoCandidatoModal } from "@/components/as/candidatos/NovoCandidatoModal";
import { AlocarCandidatoModal } from "@/components/as/candidatos/AlocarCandidatoModal";
import { FichaCandidatoModal } from "@/components/as/candidatos/FichaCandidatoModal";
import { TrocarVagaModal } from "@/components/as/candidatos/TrocarVagaModal";
import { MoverCandidaturaModal } from "@/components/as/candidatos/MoverCandidaturaModal";
import { RegistrarContatoModal } from "@/components/as/candidatos/RegistrarContatoModal";

/** Uma linha da tabela: a pessoa mais, quando existe, a candidatura dela e a vaga correspondente. */
interface Linha {
  chave: string;
  pessoa: AsCandidatoListItem;
  candidatura: AsCandidaturaItem | null;
  vaga: VagaListItem | null;
}

/**
 * Os painéis das vagas, buscados em PARALELO COM TETO. Sem o teto, uma base com muitas vagas abriria
 * uma requisição por vaga de uma vez só e o navegador enfileiraria tudo de qualquer jeito, com o
 * agravante de o backend receber a rajada inteira junto.
 */
async function comTeto<T, R>(itens: T[], teto: number, tarefa: (t: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += teto) {
    saida.push(...(await Promise.all(itens.slice(i, i + teto).map(tarefa))));
  }
  return saida;
}

export default function CentralDeCandidatosPage() {
  // `isAdmin` é MASTER ou SUPER_ADMIN (`auth-context`), e governa SÓ a exibição da ação de trocar
  // vaga. A autoridade é o `@Roles` da rota: esconder aqui evita oferecer o que viraria 403.
  const { token, isAdmin } = useAuth();

  const [vagas, setVagas] = useState<VagaListItem[]>([]);
  const [pessoas, setPessoas] = useState<AsCandidatoListItem[]>([]);
  const [candidaturas, setCandidaturas] = useState<AsCandidaturaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ── FILTROS. `nome`, `cpf` e `origem` vão para o backend (no CORPO do POST); `cliente` e `etapa`
  // são resolvidos aqui, porque a busca do backend não tem esses eixos e o volume da tela é pequeno.
  const [busca, setBusca] = useState("");
  /**
   * ─ FILTRO POR NOME, DE MÚLTIPLA SELEÇÃO (§A.28, pedido do diretor 27/08) ─────────────────────
   *
   * A caixa de busca no topo continua sendo a varredura por TEXTO (ela viaja no corpo do POST e
   * afunila a lista carregada). Este filtro é outra pergunta: "quero ver ESTAS pessoas", com várias
   * escolhidas ao mesmo tempo, que é o que o texto livre não faz.
   *
   * ELE GUARDA ID, E NÃO NOME. Dois candidatos podem se chamar igual, e casar por texto juntaria os
   * dois numa escolha só. O rótulo do chip é o nome, o valor é o id.
   *
   * §A.6: NOME pode entrar na busca, CPF NÃO. Este filtro roda no CLIENTE, sobre a lista já
   * carregada, então nem o nome nem o id entram em URL, em query string ou em log de proxy. A busca
   * por CPF continua onde estava, no CORPO do POST, e o número segue nunca aparecendo no endereço.
   */
  const [fCandidatos, setFCandidatos] = useState<string[]>([]);
  const [cpfBusca, setCpfBusca] = useState("");
  const [fVaga, setFVaga] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fEtapa, setFEtapa] = useState("");
  const [fOrigem, setFOrigem] = useState("");
  const [cardAtivo, setCardAtivo] = useState<KpiId>("total");

  // ── MODAIS
  const [novoAberto, setNovoAberto] = useState(false);
  const [alocarAberto, setAlocarAberto] = useState(false);
  /**
   * TRAZER DE VOLTA (bug 2): quem é a pessoa e de qual vaga ela saiu. Enquanto isto existe, o modal
   * de alocação abre no modo "Trazer De Volta", com a pessoa fixa e a vaga anterior sugerida.
   */
  /** A candidatura cuja vaga está sendo corrigida (item 5). Só Master e Super Admin chegam aqui. */
  const [trocaAlvo, setTrocaAlvo] = useState<AsCandidaturaItem | null>(null);
  const [voltaAlvo, setVoltaAlvo] = useState<{
    pessoa: { id: string; nome: string };
    vagaId: string | null;
  } | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [moverAlvo, setMoverAlvo] = useState<AsCandidaturaItem | null>(null);
  const [contatoAlvo, setContatoAlvo] = useState<AsCandidaturaItem | null>(null);

  /**
   * A CARGA. Três leituras, nesta ordem porque a terceira depende da primeira:
   *   1. as vagas (cliente, cargo, nome e status de cada uma);
   *   2. as pessoas, pela busca POST com os filtros que o backend conhece;
   *   3. o painel de cada vaga, que é a única fonte de funil sem CPF.
   */
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [listaVagas, listaPessoas] = await Promise.all([
        apiFetch<VagaListItem[]>("/as/vagas", { token }),
        buscarCandidatos(
          {
            nome: busca,
            cpf: cpfBusca.replace(/\D/g, ""),
            origem: fOrigem || undefined,
            vagaId: fVaga || undefined,
          },
          token,
        ),
      ]);
      setVagas(listaVagas);
      setPessoas(listaPessoas);

      const paineis = await comTeto(listaVagas, 6, (v) => painelDaVaga(v.id, token));
      setCandidaturas(paineis.flatMap((p) => p.candidaturas));
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar a Central de Candidatos."));
    } finally {
      setCarregando(false);
    }
  }, [token, busca, cpfBusca, fOrigem, fVaga]);

  // A busca por texto é adiada, para não disparar uma requisição por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 300);
    return () => clearTimeout(t);
  }, [carregar]);

  const vagaPorId = useMemo(() => new Map(vagas.map((v) => [v.id, v])), [vagas]);

  /**
   * AS OPÇÕES DO FILTRO DE NOME, tiradas das PESSOAS e não das LINHAS: quem está em três vagas tem
   * três linhas na tabela e uma pessoa só na base, e listá-la três vezes no seletor faria o
   * consultor escolher "a mesma" pessoa achando que são outras.
   *
   * Ordenadas por nome em pt-BR, porque quem procura alguém procura pela letra.
   */
  const optCandidatos = useMemo(
    () =>
      [...pessoas]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }))
        .map((p) => ({ value: p.id, label: p.nome })),
    [pessoas],
  );

  /** As linhas, antes do card e dos filtros locais. Pessoa sem candidatura vira uma linha só. */
  const linhasBase = useMemo<Linha[]>(() => {
    const porPessoa = new Map<string, AsCandidaturaItem[]>();
    for (const c of candidaturas) {
      const atual = porPessoa.get(c.candidatoId);
      if (atual) atual.push(c);
      else porPessoa.set(c.candidatoId, [c]);
    }

    return pessoas.flatMap<Linha>((p) => {
      const minhas = (porPessoa.get(p.id) ?? []).filter((c) => !fVaga || c.vagaId === fVaga);
      if (minhas.length === 0) {
        return fVaga ? [] : [{ chave: p.id, pessoa: p, candidatura: null, vaga: null }];
      }
      return minhas.map((c) => ({
        chave: c.id,
        pessoa: p,
        candidatura: c,
        vaga: vagaPorId.get(c.vagaId) ?? null,
      }));
    });
  }, [pessoas, candidaturas, vagaPorId, fVaga]);

  /**
   * OS NÚMEROS DOS CARDS. Contados sobre as linhas já filtradas por cliente e etapa, mas ANTES do
   * card: o card é um filtro, e um filtro que altera o próprio número que ele mostra não serve de
   * nada (clicar zeraria os outros cards e a tela perderia a referência).
   */
  const linhasSemCard = useMemo(
    () =>
      linhasBase.filter((l) => {
        // LISTA VAZIA É "TODOS" (§A.28): sem isso a tela abriria vazia esperando alguém marcar.
        if (fCandidatos.length > 0 && !fCandidatos.includes(l.pessoa.id)) return false;
        if (fCliente && l.vaga?.codCliente !== fCliente) return false;
        /*
         * O FILTRO DE ETAPA SÓ ALCANÇA QUEM ESTÁ VIVO (peça P1 do bug 1), e era aqui que a contagem
         * distorcia: a comparação olhava só `etapa`, então filtrar "Triagem" trazia junto quem foi
         * DESCARTADO na Triagem, e o filtro DISCORDAVA do card de mesmo nome, que já contava certo
         * (`kpiDaCandidatura` testa a situação primeiro). Agora os dois respondem a mesma pergunta.
         */
        if (fEtapa && !(l.candidatura && candidaturaViva(l.candidatura.situacao))) return false;
        if (fEtapa && l.candidatura?.etapa !== fEtapa) return false;
        return true;
      }),
    [linhasBase, fCandidatos, fCliente, fEtapa],
  );

  /**
   * A CONTA DOS CARDS, com TODOS os estados do funil visíveis (ajuste do diretor). Nenhum estado
   * fica sem número: as cinco etapas vivas contam separadas, os quatro desfechos contam separados, e
   * quem ainda não entrou em vaga nenhuma tem o card "Sem Vaga", que é a AUSÊNCIA de candidatura e
   * por isso é contado aqui, e não pela régua de `kpiDaCandidatura`.
   */
  const kpis = useMemo(() => {
    const conta: Record<KpiId, number> = {
      total: linhasSemCard.length,
      semVaga: 0,
      captacao: 0,
      triagem: 0,
      entrevistaSoulan: 0,
      entrevistaCliente: 0,
      emAprovacao: 0,
      aprovados: 0,
      contratados: 0,
      descartados: 0,
      desistiram: 0,
    };
    for (const l of linhasSemCard) {
      if (!l.candidatura) {
        conta.semVaga += 1;
        continue;
      }
      conta[kpiDaCandidatura(l.candidatura.etapa, l.candidatura.situacao)] += 1;
    }
    return conta;
  }, [linhasSemCard]);

  const linhas = useMemo(() => {
    if (cardAtivo === "total") return linhasSemCard;
    if (cardAtivo === "semVaga") return linhasSemCard.filter((l) => l.candidatura === null);
    return linhasSemCard.filter(
      (l) =>
        l.candidatura !== null &&
        kpiDaCandidatura(l.candidatura.etapa, l.candidatura.situacao) === cardAtivo,
    );
  }, [linhasSemCard, cardAtivo]);

  /**
   * ─ §A.29: A ORDENAÇÃO CLICÁVEL, reusando a peça que o resto do sistema já usa ────────────────
   *
   * `useOrdenacao` + `ColunaOrdenavel` são os mesmos da Integração e da Gestão Das Assinaturas. Nada
   * de ordenação escrita à mão aqui: um jeito só de ordenar no sistema inteiro.
   *
   * ELA ENVOLVE O FIM DA CADEIA, e é isso que faz filtro e ordenação CONVIVEREM. A cadeia da tela é
   * `linhasBase` (busca do backend) → `linhasSemCard` (cliente e etapa) → `linhas` (o card ativo) →
   * ORDENAÇÃO. Trocar de filtro só troca a lista que entra aqui, e a coluna escolhida continua de pé
   * porque ela mora no estado do `useOrdenacao`, não na lista; clicar no cabeçalho só reordena o que
   * o filtro deixou passar, sem tocar em filtro nenhum. Enquanto ninguém clica, a lista sai intacta.
   *
   * Client-side é honesto nesta tela: ela carrega o conjunto inteiro (a busca é POST sem paginação),
   * diferente do Gerenciador, que é paginado no servidor e por isso ficou de fora da peça.
   *
   * ETAPA E SITUAÇÃO ORDENAM PELO CATÁLOGO, não pelo rótulo. Alfabética, "Aprovação" viria antes de
   * "Captação" e o funil apareceria embaralhado; pelo índice do catálogo a coluna sobe na ordem do
   * processo, do começo para o fim, que é como o time lê o funil.
   *
   * ÚLTIMO CONTATO É DATA, e a candidatura sem contato registrado devolve `null`: o `useOrdenacao`
   * manda vazio para o FIM nas DUAS direções, então inverter a seta nunca traz um bando de "não
   * informado" para o topo empurrando o dado útil para longe. Vale igual para a linha SEM VAGA, que
   * não tem etapa, situação nem vaga para comparar.
   */
  const colunasOrdenaveis = useMemo<ColOrd<Linha>[]>(
    () => [
      { chave: "candidato", tipo: "texto", valor: (l) => l.pessoa.nome },
      {
        chave: "vaga",
        tipo: "texto",
        // O mesmo texto que a célula mostra: nome de divulgação e, na falta dele, o código.
        valor: (l) => l.candidatura?.vagaNome ?? l.candidatura?.vagaCodigo ?? null,
      },
      { chave: "cliente", tipo: "texto", valor: (l) => l.vaga?.clienteNome ?? null },
      { chave: "cargo", tipo: "texto", valor: (l) => l.vaga?.cargoNome ?? null },
      {
        chave: "etapa",
        tipo: "status",
        /*
         * ORDENA PELO QUE A CÉLULA MOSTRA (peça P1). A encerrada devolve `null`, que o `useOrdenacao`
         * manda para o FIM nas duas direções: ordenar o "Fora Do Funil" pelo índice da etapa
         * congelada espalharia os encerrados no meio do funil, e a coluna passaria a ordenar por um
         * dado que ela deixou de exibir.
         */
        valor: (l) =>
          l.candidatura && candidaturaViva(l.candidatura.situacao)
            ? CANDIDATURA_ETAPAS.indexOf(l.candidatura.etapa)
            : null,
      },
      {
        chave: "situacao",
        tipo: "status",
        valor: (l) =>
          l.candidatura ? CANDIDATURA_SITUACOES.indexOf(l.candidatura.situacao) : null,
      },
      { chave: "ultimoContato", tipo: "data", valor: (l) => l.candidatura?.ultimoContatoEm ?? null },
    ],
    [],
  );
  const ord = useOrdenacao(colunasOrdenaveis, linhas);
  const visiveis = ord.itens;

  const optVagas = useMemo(
    () =>
      vagas.map((v) => ({
        value: v.id,
        label: v.nomeDivulgacao ?? v.codigo ?? "Vaga sem nome de divulgação",
        hint: v.codigo ?? undefined,
      })),
    [vagas],
  );

  /** Os clientes que de fato têm vaga aberta no sistema. Filtro só oferece o que existe. */
  const optClientes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const v of vagas) if (v.codCliente) mapa.set(v.codCliente, v.clienteNome ?? v.codCliente);
    return [...mapa].map(([value, label]) => ({ value, label, hint: value }));
  }, [vagas]);

  const vagasAbertas = useMemo(() => vagas.filter((v) => v.status === "ABERTA"), [vagas]);

  const filtrosAtivos =
    (fCandidatos.length ? 1 : 0) +
    (cpfBusca ? 1 : 0) +
    (fVaga ? 1 : 0) +
    (fCliente ? 1 : 0) +
    (fEtapa ? 1 : 0) +
    (fOrigem ? 1 : 0);

  function limparFiltros() {
    setFCandidatos([]);
    setCpfBusca("");
    setFVaga("");
    setFCliente("");
    setFEtapa("");
    setFOrigem("");
  }

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Central De Candidatos"
        subtitle="Cada linha é uma candidatura: a pessoa em uma vaga, com a etapa em que ela está no funil. Quem ainda não foi alocada aparece sem vaga, porque pessoa na base não é cadastro pela metade."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          {carregando
            ? "Carregando os candidatos."
            : `${linhas.length} ${linhas.length === 1 ? "linha na fila" : "linhas na fila"}.`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* §A.6: a busca por NOME também viaja no corpo do POST, junto com o resto. Nada desta
              tela monta URL com dado de pessoa. */}
          <input
            type="search"
            className="ds-input w-72 rounded-full"
            placeholder="Buscar por nome"
            aria-label="Buscar por nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <FiltroTrigger count={filtrosAtivos} onLimpar={limparFiltros}>
            {/* NOME VEM PRIMEIRO porque é como se procura gente. O CPF fica logo abaixo, e continua
                viajando no corpo do POST (§A.6). */}
            <FiltroCampo label="Candidato">
              <Combobox
                multiple
                value={fCandidatos}
                onChange={setFCandidatos}
                options={optCandidatos}
                placeholder="Todos"
                ariaLabel="Candidato"
                searchable
                limpavel
              />
              <p className="mt-1 text-[11.5px] text-faint">
                Dá para escolher vários de uma vez. A lista traz quem a busca por nome deixou passar,
                e o recorte é feito aqui na tela.
              </p>
            </FiltroCampo>
            <FiltroCampo label="Buscar por CPF">
              <input
                className="ds-input"
                value={cpfBusca}
                onChange={(e) => setCpfBusca(e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
                aria-label="Buscar por CPF"
              />
              <p className="mt-1 text-[11.5px] text-faint">
                A busca por CPF é exata e o número viaja no corpo da requisição, nunca no endereço
                da página.
              </p>
            </FiltroCampo>
            <FiltroCampo label="Vaga">
              <Combobox
                value={fVaga}
                onChange={setFVaga}
                options={optVagas}
                placeholder="Todas"
                ariaLabel="Vaga"
                searchable
                limpavel
              />
            </FiltroCampo>
            <FiltroCampo label="Cliente">
              <Combobox
                value={fCliente}
                onChange={setFCliente}
                options={optClientes}
                placeholder="Todos"
                ariaLabel="Cliente"
                searchable
                limpavel
              />
            </FiltroCampo>
            <FiltroCampo label="Etapa">
              <Combobox
                value={fEtapa}
                onChange={setFEtapa}
                options={CANDIDATURA_ETAPAS.map((e) => ({
                  value: e,
                  label: CANDIDATURA_ETAPA_LABEL[e],
                }))}
                placeholder="Todas"
                ariaLabel="Etapa"
                limpavel
              />
            </FiltroCampo>
            <FiltroCampo label="Origem">
              <Combobox
                value={fOrigem}
                onChange={setFOrigem}
                options={AS_CANDIDATO_ORIGEM.map((o) => ({
                  value: o,
                  label: AS_CANDIDATO_ORIGEM_LABEL[o],
                }))}
                placeholder="Todas"
                ariaLabel="Origem"
                limpavel
              />
            </FiltroCampo>
          </FiltroTrigger>
          {/* A QUARTA AÇÃO DA TELA. Ela existe porque o único caminho de alocação passava pelo dedup
              por CPF, e quem foi cadastrado SEM CPF ficava em beco sem saída: existia na base e não
              entrava em vaga nenhuma. Aqui a escolha é pelo nome, e a alocação vai por id. */}
          <Button variant="secondary" onClick={() => setAlocarAberto(true)} className="py-2.5">
            Alocar candidato
          </Button>
          <Button onClick={() => setNovoAberto(true)} className="py-2.5">
            Novo candidato
          </Button>
        </div>
      </div>

      {erro && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      {/* ── OS CARDS, EM DUAS FILEIRAS, E NENHUM ESTADO SEM NÚMERO À VISTA ───────────────────
          Fileira 1: o Total e as CINCO etapas vivas, NA ORDEM DO FUNIL. Lida da esquerda para a
          direita, ela mostra o afunilamento, que é justamente o que as fusões antigas escondiam.
          Fileira 2: os QUATRO desfechos separados (aprovado não é contratado, descartado não é
          desistiu) mais o "Sem Vaga", que é a pessoa na base ainda não alocada.
          §A.12: todo card é clicável como FILTRO, em toggle (clicar no ativo volta ao Total). */}
      {/* A MARCA D'ÁGUA DE FUNIL SAIU (ajuste 4 do diretor): o desenho literal do funil atrás dos
          cards não ficou bom, e o sombreamento que o sistema já usa é a `.aurora` do `globals.css`,
          desenhada pelo `AppShell` atrás de TODAS as telas, com os três blobs e as variantes de tema
          claro e escuro já resolvidas. Não havia o que acrescentar aqui: bastou tirar a camada extra
          para a assinatura do sistema aparecer, que é o mesmo fundo das outras telas.
          O invólucro fica como agrupador das duas fileiras, sem `relative isolate`, que existiam só
          para prender o `-z-10` da marca que saiu. */}
      <div>
        <div className="mb-[12px] grid grid-cols-2 gap-[12px] sm:grid-cols-3 xl:grid-cols-6">
          <Kpi id="total" rotulo="Total" valor={kpis.total} icone="layers" />
          <Kpi
            id="captacao"
            rotulo="Em Captação"
            valor={kpis.captacao}
            icone="users"
            tom="var(--accent)"
          />
          <Kpi
            id="triagem"
            rotulo="Em Triagem"
            valor={kpis.triagem}
            icone="filter"
            tom="var(--accent-2)"
          />
          <Kpi
            id="entrevistaSoulan"
            rotulo="Entrevista Soulan"
            valor={kpis.entrevistaSoulan}
            icone="chart"
            tom="var(--warn)"
          />
          <Kpi
            id="entrevistaCliente"
            rotulo="Entrevista Cliente"
            valor={kpis.entrevistaCliente}
            icone="peak"
            tom="var(--warn)"
          />
          <Kpi
            id="emAprovacao"
            rotulo="Em Aprovação"
            valor={kpis.emAprovacao}
            icone="clock"
            tom="var(--warn)"
          />
        </div>

        <div className="mb-[18px] grid grid-cols-2 gap-[12px] sm:grid-cols-3 xl:grid-cols-5">
          <Kpi
            id="aprovados"
            rotulo="Aprovados"
            valor={kpis.aprovados}
            icone="check"
            tom="var(--ok)"
          />
          <Kpi
            id="contratados"
            rotulo="Contratados"
            valor={kpis.contratados}
            icone="arr"
            tom="var(--ok)"
          />
          <Kpi
            id="descartados"
            rotulo="Descartados"
            valor={kpis.descartados}
            icone="x"
            tom="var(--danger)"
          />
          <Kpi
            id="desistiram"
            rotulo="Desistiram"
            valor={kpis.desistiram}
            icone="logout"
            tom="var(--danger)"
          />
          <Kpi id="semVaga" rotulo="Sem Vaga" valor={kpis.semVaga} icone="folder" />
        </div>
      </div>

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* §A.12/§A.20: cabeçalhos centralizados, divisória sutil entre colunas (vem do `ds-table`),
              larguras proporcionais que aproveitam a linha inteira sem esmagar nome nem pill. As
              colunas de pill (Etapa e Situação) recebem largura do rótulo mais longo do sistema
              ("Entrevista Soulan" e "Em Seleção"), então nenhuma delas quebra em duas linhas. */}
          <table className="ds-table min-w-[1180px]">
            <thead>
              <tr>
                {/* §A.29: todo cabeçalho que ordena vira `ColunaOrdenavel`. O `<th>` continua sendo
                    o mesmo elemento de antes, com a mesma largura e a mesma divisória, então o
                    layout do §A.12 não muda; o que entra é o botão com a seta dentro dele. Só Ações
                    fica de fora, porque não há o que comparar entre dois grupos de botões. */}
                <ColunaOrdenavel as="th" ord={ord} chave="candidato" className="w-[19%] text-center">
                  Candidato
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="vaga" className="w-[17%] text-center">
                  Vaga
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[12%] text-center">
                  Cliente
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cargo" className="w-[12%] text-center">
                  Cargo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="etapa" className="w-[12%] text-center">
                  Etapa
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="situacao" className="w-[11%] text-center">
                  Situação
                </ColunaOrdenavel>
                {/* §A.20: a coluna ganhou um ponto de largura porque o rótulo mais longo da tabela
                    passou a dividir a célula com a seta. Sem isso, "Último Contato" truncaria. */}
                <ColunaOrdenavel
                  as="th"
                  ord={ord}
                  chave="ultimoContato"
                  className="w-[11%] whitespace-nowrap text-center"
                >
                  Último Contato
                </ColunaOrdenavel>
                <th className="w-[6%] text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : visiveis.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Nenhum candidato nesta fila. Use o botão Novo candidato ou limpe os filtros.
                  </td>
                </tr>
              ) : (
                visiveis.map((l) => (
                  <tr key={l.chave}>
                    {/* ─ A LINHA FICA COM O NOME, E SÓ (ajuste do diretor, 27/08) ──────────────
                        Cidade e "Cadastro Manual, sem CPF" moravam aqui embaixo do nome, em duas
                        linhas de apoio, e faziam cada linha da tabela ter três alturas para dizer
                        uma coisa que ninguém compara entre candidatos. O detalhe migrou inteiro
                        para a ficha (o olho), na seção A Pessoa, que é onde se olha UMA pessoa a
                        fundo. A listagem é para varrer a fila; a ficha é para estudar o caso. */}
                    <td>
                      <div className="font-semibold text-text">{l.pessoa.nome}</div>
                    </td>
                    {/* ─ "VAGA NÃO ALOCADA" NO LUGAR DE "não informado" (ajuste 2 do diretor) ────
                        As três células ficavam vazias pelo MESMO motivo, e diziam a coisa errada:
                        "Cliente não informado" manda o consultor procurar onde preencher o cliente,
                        quando não há campo nenhum a preencher. O que falta é ALOCAR a pessoa numa
                        vaga, e é a alocação que traz cliente e cargo de uma vez.
                        A DISTINÇÃO É ENTRE DUAS AUSÊNCIAS: sem candidatura, a resposta é "Vaga Não
                        Alocada"; COM candidatura e sem o dado, aí sim é "não informado" (§A.11), que
                        é campo em branco de verdade e continua sendo dito assim.
                        §A.24: é etiqueta de estado, então title case. */}
                    <td className="text-center">
                      {l.candidatura ? (
                        (l.candidatura.vagaNome ?? l.candidatura.vagaCodigo ?? "não informado")
                      ) : (
                        <span className="text-faint">Vaga Não Alocada</span>
                      )}
                    </td>
                    <td className="text-center">
                      {l.candidatura ? (
                        (l.vaga?.clienteNome ?? "não informado")
                      ) : (
                        <span className="text-faint">Vaga Não Alocada</span>
                      )}
                    </td>
                    <td className="text-center">
                      {l.candidatura ? (
                        (l.vaga?.cargoNome ?? "não informado")
                      ) : (
                        <span className="text-faint">Vaga Não Alocada</span>
                      )}
                    </td>
                    {/* ─ A ETAPA SÓ VALE ENQUANTO A CANDIDATURA ESTÁ VIVA (peça P1 do bug 1) ─────
                        A coluna `etapa` do banco NÃO é limpa quando alguém sai do processo: ela
                        congela no último lugar em que a pessoa esteve. Mostrá-la depois do desfecho
                        desenhava o descartado DENTRO do funil, e era exatamente o "preso na
                        Captação" que o diretor viu na tela.
                        ENCERRADA MOSTRA "Fora Do Funil", e não a etapa nem um vazio: vazio leria
                        como dado faltando, e a etapa lia como se a pessoa ainda estivesse lá. Por
                        onde ela passou não se perde, mudou de lugar: está na linha do tempo da
                        ficha, alimentada por `as_candidatura_etapas`. */}
                    <td className="text-center">
                      {l.candidatura ? (
                        <span className="inline-flex justify-center">
                          {candidaturaViva(l.candidatura.situacao) ? (
                            <StatusPill
                              tone={tomDaEtapa(l.candidatura.etapa)}
                              label={CANDIDATURA_ETAPA_LABEL[l.candidatura.etapa]}
                            />
                          ) : (
                            <StatusPill tone="nt" label="Fora Do Funil" />
                          )}
                        </span>
                      ) : (
                        <span className="text-faint">Vaga Não Alocada</span>
                      )}
                    </td>
                    <td className="text-center">
                      {l.candidatura ? (
                        <span className="inline-flex justify-center">
                          <StatusPill
                            tone={tomDaSituacao(l.candidatura.situacao)}
                            label={CANDIDATURA_SITUACAO_LABEL[l.candidatura.situacao]}
                          />
                        </span>
                      ) : (
                        <span className="text-faint">Vaga Não Alocada</span>
                      )}
                    </td>
                    {/* ÚLTIMO CONTATO, e não "última movimentação": é a pergunta que a operação
                        faz ("quando falamos com essa pessoa?"). O carimbo é `ultimoContatoEm`, que
                        só anda quando um contato é registrado; `atualizadoEm` anda com etapa e com
                        saída, e por isso NÃO responde a essa pergunta. Sem contato registrado a
                        célula diz "não informado" (§A.11), que é diferente de uma data qualquer. */}
                    <td className="whitespace-nowrap text-center text-[12.5px]">
                      {l.candidatura?.ultimoContatoEm ? (
                        dataHoraBr(l.candidatura.ultimoContatoEm)
                      ) : (
                        <span className="text-faint">não informado</span>
                      )}
                    </td>
                    {/* AÇÕES SÓ EM ÍCONE, com o rótulo por extenso em `title` e `aria-label`: o ícone
                        é o atalho de quem conhece a tela, e o rótulo continua alcançável por quem
                        passa o mouse e por leitor de tela. */}
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <AcaoIcone
                          icone="eye"
                          titulo="Ver a ficha"
                          descricao={`Ver a ficha de ${l.pessoa.nome}`}
                          onClick={() => setFichaId(l.pessoa.id)}
                        />
                        {l.candidatura && (
                          <>
                            {/* MOVER SÓ ENQUANTO A CANDIDATURA ESTÁ VIVA (peça P1 do bug 1).
                                O backend SEMPRE recusou mover quem já saiu ("Esta candidatura já
                                foi encerrada"), então a ação era um botão que só podia falhar. Com
                                o descartado fora do funil, oferecê-la contradiz a própria regra:
                                quem saiu não anda mais em etapa, volta pela ação ao lado.
                                REGISTRAR CONTATO CONTINUA em qualquer situação, de propósito:
                                ligar para quem foi descartado é conversa legítima e o histórico
                                dela tem valor. */}
                            {candidaturaViva(l.candidatura.situacao) && (
                              <AcaoIcone
                                icone="arr"
                                titulo="Mover de etapa"
                                descricao={`Mover ${l.pessoa.nome} de etapa`}
                                onClick={() => setMoverAlvo(l.candidatura)}
                              />
                            )}
                            {/* TELEFONE, e não mais o LÁPIS (correção do diretor, 27/08): o lápis
                                significa EDITAR no resto do sistema, e quem o via nesta linha
                                entendia "editar candidato" em vez de "anotar que falei com a
                                pessoa". O ícone novo é acréscimo ao catálogo; nenhum outro uso do
                                lápis foi tocado. */}
                            <AcaoIcone
                              icone="phone"
                              titulo="Registrar contato"
                              descricao={`Registrar contato com ${l.pessoa.nome}`}
                              onClick={() => setContatoAlvo(l.candidatura)}
                            />
                            {/* ─ TRAZER DE VOLTA, e ele aparece SÓ na linha encerrada (bug 2) ────
                                É a porta que faltava. A reentrada existia inteira no backend e só
                                era alcançável pelo botão "Alocar candidato", cuja lista exclui quem
                                tem candidatura viva: quem foi descartado numa vaga e segue vivo em
                                outra não aparecia em lugar nenhum. Agora a ação está onde o gesto
                                nasce, na linha da pessoa que saiu.
                                MESMA ROTA E MESMO MODAL DE CIÊNCIA de sempre: aqui não há caminho
                                novo, só um atalho para o que já existia. */}
                            {/* ─ TROCAR VAGA: corrigir a alocação errada (item 5) ───────────────
                                SÓ NA CANDIDATURA VIVA e SÓ PARA MASTER E SUPER ADMIN. Esconder aqui
                                é conveniência: quem manda é o `@Roles` da rota, que devolve 403 a
                                consultor comum mesmo se ele chamar direto.
                                CONVIVE COM O "TRAZER DE VOLTA", e os dois nunca aparecem juntos na
                                mesma linha: este só existe na viva, aquele só na encerrada. Um
                                CORRIGE mantendo a linha e a etapa, o outro RECOMEÇA criando outra. */}
                            {isAdmin && candidaturaViva(l.candidatura.situacao) && (
                              <AcaoIcone
                                icone="refresh"
                                titulo="Trocar vaga"
                                descricao={`Trocar a vaga de ${l.pessoa.nome}`}
                                onClick={() => setTrocaAlvo(l.candidatura)}
                              />
                            )}
                            {!candidaturaViva(l.candidatura.situacao) && (
                              <AcaoIcone
                                icone="undo"
                                titulo="Trazer de volta"
                                descricao={`Trazer ${l.pessoa.nome} de volta para uma vaga`}
                                onClick={() =>
                                  setVoltaAlvo({
                                    pessoa: { id: l.pessoa.id, nome: l.pessoa.nome },
                                    vagaId: l.candidatura?.vagaId ?? null,
                                  })
                                }
                              />
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {novoAberto && (
        <NovoCandidatoModal
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setNovoAberto(false)}
          onSalvo={(id) => {
            setNovoAberto(false);
            setFichaId(id);
            void carregar();
          }}
        />
      )}

      {alocarAberto && (
        <AlocarCandidatoModal
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setAlocarAberto(false)}
          onAlocado={() => {
            setAlocarAberto(false);
            void carregar();
          }}
        />
      )}

      {trocaAlvo && (
        <TrocarVagaModal
          candidatura={trocaAlvo}
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setTrocaAlvo(null)}
          onTrocado={() => {
            setTrocaAlvo(null);
            void carregar();
          }}
        />
      )}

      {/* TRAZER DE VOLTA (bug 2): o MESMO modal, no modo com a pessoa fixa e a vaga anterior
          sugerida. Um componente só, uma rota só, um modal de ciência só. */}
      {voltaAlvo && (
        <AlocarCandidatoModal
          vagasAbertas={vagasAbertas}
          token={token}
          pessoaFixa={voltaAlvo.pessoa}
          vagaSugerida={voltaAlvo.vagaId}
          onClose={() => setVoltaAlvo(null)}
          onAlocado={() => {
            setVoltaAlvo(null);
            void carregar();
          }}
        />
      )}

      {fichaId && (
        <FichaCandidatoModal
          candidatoId={fichaId}
          token={token}
          vagaPorId={vagaPorId}
          onClose={() => setFichaId(null)}
          onMudou={() => void carregar()}
        />
      )}

      {moverAlvo && (
        <MoverCandidaturaModal
          candidatura={moverAlvo}
          token={token}
          onClose={() => setMoverAlvo(null)}
          onFeito={() => {
            setMoverAlvo(null);
            void carregar();
          }}
        />
      )}

      {contatoAlvo && (
        <RegistrarContatoModal
          candidatura={contatoAlvo}
          token={token}
          onClose={() => setContatoAlvo(null)}
          onRegistrado={() => {
            setContatoAlvo(null);
            void carregar();
          }}
        />
      )}
    </>
  );

  /** O card de indicador, que é o próprio filtro (§A.12). Clicar no card ativo volta para o Total. */
  function Kpi({
    id,
    rotulo,
    valor,
    icone,
    tom,
  }: {
    id: KpiId;
    rotulo: string;
    valor: number;
    icone: IconName;
    tom?: string;
  }) {
    const ativo = cardAtivo === id;
    return (
      <GlassCard
        as="button"
        className={cn(
          "fk !px-4 !py-3.5 text-left transition hover:bg-[var(--surface-2)]",
          ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
        )}
        onClick={() => setCardAtivo(ativo ? "total" : id)}
        aria-pressed={ativo}
      >
        <div className="mb-0.5 flex items-center justify-between">
          <Icon
            name={icone}
            className="h-4 w-4 opacity-70"
            style={tom ? { color: tom } : undefined}
          />
          {ativo && <Icon name="check" className="h-3 w-3 text-accent" />}
        </div>
        <div className="num" style={tom ? { color: tom } : undefined}>
          {carregando ? "…" : valor}
        </div>
        <div className="lbl">{rotulo}</div>
      </GlassCard>
    );
  }
}

function AcaoIcone({
  icone,
  titulo,
  descricao,
  onClick,
}: {
  icone: IconName;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={descricao}
      onClick={onClick}
      className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
    >
      <Icon name={icone} className="h-4 w-4" />
    </button>
  );
}
