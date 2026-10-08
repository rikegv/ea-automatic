"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { VagaContextoAs, VagaDetalhe } from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { cn } from "@/lib/cn";
import { cnpjDigitos, formatarCnpj } from "@/lib/cnpj";
import { dataBr, dataHoraBr, mensagemDoErro } from "@/lib/as-candidatos";
import { TrilhaDaVaga, type Opcoes } from "@/components/as/vagas/TrilhaDaVaga";
import { CodigoDaVaga } from "@/components/as/vagas/CodigoDaVaga";
import {
  AVISO_DA_VAGA_ENCERRADA_NO_ATS,
  codigoDaVagaNaTela,
  textoDoCodigoDaVaga,
  vagaEncerradaNoAts,
} from "@/lib/as-vaga-codigo";
import { useLinhasServico } from "@/lib/as-linhas-servico";
import { useSegmentos } from "@/lib/as-segmentos";
import { useStatusVaga } from "@/lib/as-status-vaga";
import { marcaDaPropostaNaFila } from "@/lib/as-proposta-cliente";
import {
  carregarFilaDeRevisao,
  carregarLiberadasDaRevisao,
  carregarRecusadas,
  corrigirLiberacaoDeRevisao,
  devolverARevisao,
  recusarLiberacao,
  reguaDeLiberacao,
  type VagaEmRevisao,
  type VagaRecusada,
} from "@/lib/as-vagas-revisao";

/**
 * ─ VAGAS PENDENTES DE REVISÃO ──────────────────────────────────────────────────────────────────
 *
 * A FILA DE TRABALHO DE QUEM CONFERE O QUE A VARREDURA TROUXE. A varredura do Pandapé espelha, no
 * EA, vagas que NINGUÉM abriu aqui: elas nascem no status `PENDENTE_REVISAO` e com o `cod_cliente`
 * NULO, porque o cliente não tem caminho na API do ATS (medido). A tela existe para uma pessoa
 * completar a vaga e liberá-la para a operação.
 *
 * ┌─ A VAGA CHEGA INCOMPLETA, E NÃO SÓ SEM CLIENTE (rodada 2) ─────────────────────────────────┐
 * │ O ATS não tem benefícios, escala, salário nem endereço. Enquanto o "Revisar vaga" abria um  │
 * │ modal de UM campo, liberar era tirar da fila uma vaga vazia: ela ia para a Central de Vagas │
 * │ sem nada do que a abertura pede, e o buraco só aparecia lá na frente.                        │
 * │                                                                                              │
 * │ Agora ele abre a TRILHA INTEIRA (`components/as/vagas/TrilhaDaVaga`, o MESMO formulário da   │
 * │ Central de Vagas, §A.26: reusar e nunca duplicar) no modo `liberacao`, e sem os obrigatórios │
 * │ a vaga NÃO sai da fila. Quem não termina numa sentada usa "Salvar sem liberar".              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MODELO É A LIBERAÇÃO ADMISSIONAL (`app/(app)/liberacao/page.tsx`), e o padrão copiado é o dela:
 * FILA, CONTADOR e AÇÃO INDIVIDUAL. A fila é o próprio estado, não uma marcação: liberou, a vaga
 * sai daqui sozinha, sem ninguém dar baixa em nada.
 *
 * ┌─ NÃO EXISTE LOTE, E A AUSÊNCIA É A DECISÃO ────────────────────────────────────────────────┐
 * │ A auditoria de segurança vetou a liberação em lote. Um cliente errado aplicado a 600 vagas  │
 * │ de uma vez atribuiria centenas de pessoas ao controlador errado, e o erro só apareceria     │
 * │ depois, espalhado. Uma vaga por vez, com o cliente escolhido olhando a vaga.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A TRAVA DE VERDADE É DO SERVIDOR. O botão desabilitado e a frase de recusa são o AVISO: eles
 * existem para ninguém clicar no que seria recusado, e para dizer o que fazer. Quem recusa é a rota.
 *
 * §A.12 (máscara única de tabela), §A.20 (larguras que aproveitam o espaço, nada esmagado),
 * §A.24 (title case em título, aba e tag; botão é comando e vai em escrita normal),
 * §A.29 (ordenação clicável, pelo `useOrdenacao`/`ColunaOrdenavel` que já existem),
 * §A.35 (o `Combobox` do design system, com busca: a lista de clientes passa de 200 linhas),
 * §A.41 (o modal fecha por Cancelar ou Salvar, nunca por clique fora).
 *
 * §A.23: o menu `as-vagas-revisao` nasce SÓ PARA O SUPER_ADMIN. Não aparecer para os demais não é
 * bug, é o diretor ainda não ter liberado.
 *
 * §A.6: aqui transitam vaga, cliente e cargo. Nenhum dado pessoal de candidato entra nesta tela.
 */

/** O cliente como o `/as/vagas/opcoes` serve. É o MESMO catálogo que a Central de Vagas consome. */
type OpcaoCliente = Opcoes["clientes"][number];

type Aba = "pendentes" | "recusadas" | "liberadas";

/** O catálogo vazio, enquanto a leitura não volta. Mesma forma da Central de Vagas. */
const OPCOES_VAZIAS: Opcoes = {
  cargos: [],
  clientes: [],
  beneficios: [],
  motivos: [],
  consultores: [],
  escalas: [],
  comerciais: [],
};

export default function VagasPendentesDeRevisaoPage() {
  const { token, isAdmin } = useAuth();

  const [aba, setAba] = useState<Aba>("pendentes");
  const [pendentes, setPendentes] = useState<VagaEmRevisao[]>([]);
  const [recusadas, setRecusadas] = useState<VagaRecusada[]>([]);
  const [liberadas, setLiberadas] = useState<VagaEmRevisao[]>([]);
  /** A vaga que está recebendo recusa ou devolução AGORA, para travar só o botão dela. */
  const [acaoId, setAcaoId] = useState<string | null>(null);
  /**
   * ─ O CATÁLOGO INTEIRO, E NÃO SÓ OS CLIENTES (rodada 2) ────────────────────────────────────────
   *
   * A tela lia `/as/vagas/opcoes` só pela lista de clientes, porque o modal só pedia o cliente.
   * Agora ela monta a TRILHA INTEIRA, que pede cargo, benefícios, motivos, escalas e comerciais: é
   * o MESMO endpoint, servindo o MESMO objeto, e a leitura continua sendo UMA.
   */
  const [opcoes, setOpcoes] = useState<Opcoes>(OPCOES_VAZIAS);
  const [contexto, setContexto] = useState<VagaContextoAs>({
    papelAs: null,
    nome: "",
    contraparte: [],
  });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  /**
   * A VAGA A LIBERAR, agora como `VagaDetalhe` (correção de LGPD ativo, 22/09/2026). O
   * `substituidoCpf` SAIU da fila (`VagaEmRevisao`, que é o item da lista): ele descia CRU para todo
   * consultor. A trilha de liberação preenche o campo com o CPF, então ao clicar "Revisar vaga" a
   * tela busca a vaga por `GET /as/vagas/:id`, UMA por vez, e só então monta a trilha.
   */
  const [revisarAlvo, setRevisarAlvo] = useState<VagaDetalhe | null>(null);
  const [corrigirAlvo, setCorrigirAlvo] = useState<VagaEmRevisao | null>(null);
  /**
   * A ESPERA E A FALHA DA BUSCA DO DETALHE. `carregandoRevisao` segura o botão enquanto o detalhe não
   * chega, e `erroRevisao` mostra uma mensagem se a busca falhar, sem abrir a trilha com dado velho.
   */
  const [carregandoRevisao, setCarregandoRevisao] = useState(false);
  const [erroRevisao, setErroRevisao] = useState<string | null>(null);

  /**
   * ─ OS TRÊS CATÁLOGOS QUE A TRILHA RECEBE PRONTOS, pelos ganchos memoizados por carga de página ─
   *
   * ELES NÃO SÃO LIDOS DENTRO DA TRILHA de propósito (o comentário de `CatalogosDaTrilha` explica):
   * montados lá, o seletor de Linha De Serviço piscaria "Carregando as linhas…" e o de Status
   * abriria vazio a cada abertura. Aqui em cima eles são lidos UMA vez por carga de página, e a
   * trilha nasce com tudo na mão.
   */
  const { status: catalogoStatus } = useStatusVaga(token);
  const { ativas: linhasAtivas, carregando: carregandoLinhas } = useLinhasServico(token);
  const { segmentos } = useSegmentos(token);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      /*
       * AS QUATRO LEITURAS EM PARALELO, e a das LIBERADAS só para quem pode corrigir: pedir ao
       * servidor uma lista que a tela não vai desenhar é gastar consulta e, pior, é alcançar uma
       * rota restrita com quem não tem o papel, o que devolveria 403 e derrubaria as outras
       * junto no `Promise.all`.
       *
       * O `contexto` entra na mesma leva porque a trilha o exige (é ele que diz o papel de A&S de
       * quem está preenchendo). Ele é o mesmo endpoint que a Central de Vagas já lê.
       */
      const [fila, ops, ctx, recusadasLista, jaLiberadas] = await Promise.all([
        carregarFilaDeRevisao(token),
        apiFetch<Opcoes>("/as/vagas/opcoes", { token }),
        apiFetch<VagaContextoAs>("/as/vagas/contexto", { token }),
        // AS RECUSADAS VÊM PARA TODOS, não só para o Master: a recusa e a devolução são de QUALQUER
        // consultor (decisão do diretor), então a aba que as mostra é de todos. As LIBERADAS seguem
        // restritas ao Master (é a tela de correção), e por isso continuam atrás do `isAdmin`.
        carregarRecusadas(token),
        isAdmin ? carregarLiberadasDaRevisao(token) : Promise.resolve([] as VagaEmRevisao[]),
      ]);
      setPendentes(fila);
      setOpcoes(ops);
      setContexto(ctx);
      setRecusadas(recusadasLista);
      setLiberadas(jaLiberadas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar a fila de revisão.");
    } finally {
      setCarregando(false);
    }
  }, [token, isAdmin]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * ABRE A TRILHA DE LIBERAÇÃO com a vaga COMPLETA (correção de LGPD ativo). A fila não traz mais o
   * `substituidoCpf`, então a tela o busca por `GET /as/vagas/:id`, UMA por vez, no clique. Falhou a
   * busca, a trilha NÃO abre: o `erroRevisao` fica na tela e ninguém libera com o campo em branco por
   * engano.
   */
  async function abrirRevisao(v: VagaEmRevisao) {
    setErroRevisao(null);
    setCarregandoRevisao(true);
    try {
      const detalhe = await apiFetch<VagaDetalhe>(`/as/vagas/${v.id}`, { token });
      setRevisarAlvo(detalhe);
    } catch {
      setErroRevisao("Não foi possível abrir a vaga. Tente de novo.");
    } finally {
      setCarregandoRevisao(false);
    }
  }

  /**
   * RECUSAR A LIBERAÇÃO, DIRETO NA LINHA (botão é comando, age no clique, sem motivo). A vaga sai da
   * fila de pendentes e passa para a aba Recusadas. Quem recusa é o servidor; a releitura é o que faz
   * a linha trocar de aba, sem a tela adivinhar. Falhou, o erro aparece e a vaga fica onde estava.
   */
  async function recusar(v: VagaEmRevisao) {
    setAcaoId(v.id);
    setErro(null);
    try {
      await recusarLiberacao(v.id, token);
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e, "Não foi possível recusar a liberação. Tente de novo."));
    } finally {
      setAcaoId(null);
    }
  }

  /** DEVOLVER A VAGA RECUSADA PARA A REVISÃO. Gesto inverso: ela volta para a fila de pendentes. */
  async function devolver(v: VagaRecusada) {
    setAcaoId(v.id);
    setErro(null);
    try {
      await devolverARevisao(v.id, token);
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e, "Não foi possível devolver a vaga para a revisão. Tente de novo."));
    } finally {
      setAcaoId(null);
    }
  }

  /**
   * AS OPÇÕES DE CLIENTE VÊM DO ENDPOINT, NUNCA DAS LINHAS CARREGADAS (§A.37). Derivadas das linhas
   * elas seriam a lista VAZIA, porque é exatamente o cliente que falta em toda vaga desta fila.
   *
   * O DESEMPATE É O MESMO DA CENTRAL DE VAGAS, e pelo mesmo motivo medido: dos clientes ativos, uma
   * parte grande repete a razão social, então o nome sozinho não distingue uma filial da outra. O
   * apoio vai no `hint`, e o código do cliente entra na `busca` para quem o decorou continuar
   * achando por ele.
   */
  const optClientes = useMemo(() => {
    // O CNPJ FICA SEMPRE NO FIM DA LINHA (o `hint` do Combobox, mesmo lugar de antes): padroniza o
    // que até aqui variava entre CNPJ, código e vazio conforme o nome do cliente repetia ou não. O
    // layout do seletor não muda, só o valor do hint passa a ser o CNPJ de todos. Sem CNPJ, mostra
    // "Não Cadastrado". A busca casa por nome (rótulo), CNPJ formatado (hint) e CNPJ só dígitos +
    // código (busca), então digitar "12345678000190" acha o "12.345.678/0001-90" sem a pontuação.
    const clientes: OpcaoCliente[] = opcoes.clientes;
    return clientes.map((c) => ({
      value: c.codCliente,
      label: c.rotulo,
      hint: formatarCnpj(c.cnpj),
      busca: `${cnpjDigitos(c.cnpj)} ${c.codCliente}`.trim(),
    }));
  }, [opcoes.clientes]);

  /** A lista de cargos como a trilha a consome. Mesma derivação da Central de Vagas. */
  const optCargos = useMemo(
    () => opcoes.cargos.map((c) => ({ value: c.id, label: c.nome })),
    [opcoes.cargos],
  );

  const linhas: VagaEmRevisao[] =
    aba === "pendentes" ? pendentes : aba === "recusadas" ? recusadas : liberadas;

  /** Busca da tela, no espírito da Liberação Admissional: código, nome de divulgação e cargo. */
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter((v) =>
      // A BUSCA ACHA O QUE A CÉLULA ESCREVE: sem `codigo`, a célula escreve o número do ATS, então
      // digitar "3498580" acha a vaga que o Digai criou em branco.
      [textoDoCodigoDaVaga(v), v.nomeDivulgacao, v.cargoNome, v.clienteNome]
        .filter(Boolean)
        .some((t) => (t as string).toLowerCase().includes(q)),
    );
  }, [linhas, busca]);

  const colunas = useMemo<ColOrd<VagaEmRevisao>[]>(() => {
    const base: ColOrd<VagaEmRevisao>[] = [
      // ORDENA PELO QUE A CÉLULA ESCREVE (o número do ATS quando falta o `codigo`); sem nenhum dos
      // dois o valor segue NULO, e o `useOrdenacao` manda a linha para o fim como sempre fez.
      {
        chave: "codigo",
        tipo: "texto",
        valor: (v) => {
          const c = codigoDaVagaNaTela(v);
          return c.tipo === "AUSENTE" ? null : c.texto;
        },
      },
      { chave: "vaga", tipo: "texto", valor: (v) => v.nomeDivulgacao },
      { chave: "cargo", tipo: "texto", valor: (v) => v.cargoNome },
      { chave: "cliente", tipo: "texto", valor: (v) => v.clienteNome },
      { chave: "cidade", tipo: "texto", valor: (v) => v.cidadeNome },
      { chave: "posicoes", tipo: "numero", valor: (v) => v.posicoesOficiais },
      // Quanta gente a vaga já carrega. É o número que diz o TAMANHO do estrago de liberar com o
      // cliente errado, então ele fica na fila e não escondido num painel.
      { chave: "candidatos", tipo: "numero", valor: (v) => v.ocupacao?.emSelecao ?? 0 },
      { chave: "entrada", tipo: "data", valor: (v) => v.criadoEm },
    ];
    // A aba Recusadas ganha QUEM recusou e QUANDO, as duas ordenáveis (§A.29). O carimbo vive no
    // item da lista de recusadas (`VagaRecusada`), não no `VagaEmRevisao` das outras abas, então o
    // acesso é por recorte, válido porque essas colunas só existem quando a aba é Recusadas.
    if (aba === "recusadas") {
      base.push(
        { chave: "recusadaPor", tipo: "texto", valor: (v) => (v as VagaRecusada).recusadaPorNome },
        { chave: "recusadaEm", tipo: "data", valor: (v) => (v as VagaRecusada).recusadaEm },
      );
    }
    return base;
  }, [aba]);
  const ord = useOrdenacao(colunas, filtradas);

  const semCliente = pendentes.filter((v) => !v.codCliente).length;
  /* QUANTAS DESTA FILA JÁ ACABARAM NO ATS. Conta sobre as PENDENTES, e não sobre a aba visível: o
     aviso fala do trabalho que espera revisão, que é o que a tela promete. */
  const encerradasNoAts = pendentes.filter((v) => vagaEncerradaNoAts(v.statusPandape)).length;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Vagas Pendentes De Revisão"
        subtitle="Vagas que entraram sozinhas pela varredura do Pandapé e ainda não foram conferidas. O ATS manda a vaga incompleta: complete o que falta e libere, uma de cada vez."
      />

      {/* O CONTADOR, que é o que a fila promete: quantas esperam, e de quantas falta o cliente. Não
          é card clicável nem filtro: a fila inteira JÁ é o recorte, e um filtro aqui só teria como
          esconder trabalho de dentro de uma tela que existe para mostrar trabalho. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          {carregando
            ? "Carregando a fila de revisão."
            : `${pendentes.length} ${pendentes.length === 1 ? "vaga espera" : "vagas esperam"} revisão, ${semCliente} sem cliente vinculado.`}
        </p>
        <div className="flex items-center gap-2">
          <input
            className="ds-input w-[260px] py-2 text-sm"
            placeholder="Buscar por vaga, cargo ou cliente"
            aria-label="Buscar na fila de revisão"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Button variant="secondary" className="py-2" onClick={() => void carregar()}>
            Atualizar
          </Button>
        </div>
      </div>

      {/* ─ O AVISO DA VAGA QUE JÁ ACABOU NO ATS (08/10/2026) ─────────────────────────────────────
          POR QUE ELE EXISTE: as vagas que o rastreio alcança estão todas ENCERRADAS no ATS, e o
          Digai segue mandando candidato para elas. A tag na linha diz qual vaga é; esta frase diz
          o que isso significa, sem depender de alguém passar o mouse na tag.

          SÓ APARECE QUANDO HÁ ALGUMA: a fila sem vaga encerrada não ganha aviso sobre nada. É frase
          de apoio, então a maiúscula é só na primeira palavra (§A.24). */}
      {!carregando && encerradasNoAts > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgba(214,158,46,0.1)] px-3 py-2 text-[12.5px] text-warn-2">
          <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none" />
          <span>
            {encerradasNoAts === 1
              ? "1 vaga desta fila está encerrada no ATS. "
              : `${encerradasNoAts} vagas desta fila estão encerradas no ATS. `}
            {AVISO_DA_VAGA_ENCERRADA_NO_ATS}
          </span>
        </p>
      )}

      {erro && (
        <div className="mb-4 rounded-xl border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.1)] px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}

      {/* AS ABAS (§A.24, rótulo de aba é TAG, então title case). Pendentes e Recusadas são de TODOS:
          qualquer consultor recusa e devolve (decisão do diretor), então a aba que mostra as
          recusadas é de todos. Liberadas Recentemente só aparece para o Master, porque é a tela de
          correção; oferecê-la a quem não é Master seria mostrar a porta e trancá-la. */}
      <div className="mb-3 flex gap-2">
        {(
          [
            ["pendentes", `Pendentes De Revisão (${pendentes.length})`],
            ["recusadas", `Recusadas (${recusadas.length})`],
            ...(isAdmin
              ? ([["liberadas", `Liberadas Recentemente (${liberadas.length})`]] as [Aba, string][])
              : []),
          ] as [Aba, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[13px] font-semibold transition",
              aba === id
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] text-dim hover:text-text",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* A LARGURA MÍNIMA É A SOMA DO QUE CADA COLUNA PRECISA para não esmagar ninguém (§A.20):
              abaixo dela a tabela ROLA na horizontal, em vez de espremer nome de vaga e de cliente.
              Nome Da Vaga ganhou largura própria: sem ela, era a única coluna de conteúdo sem
              largura e engolia todo o espaço sobrando, abrindo um vão morto antes de Cargo, e ao
              mesmo tempo ficava espremida na largura mínima (a soma das fixas quase batia o `min-w`).
              Com largura própria, a folga se distribui entre todas as colunas. */}
          <table
            className={cn("ds-table", aba === "recusadas" ? "min-w-[1700px]" : "min-w-[1380px]")}
          >
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="codigo" className="w-[120px]">
                  Vaga
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="vaga" className="w-[220px]">
                  Nome Da Vaga
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cargo" className="w-[180px]">
                  Cargo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[200px]">
                  Cliente
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cidade" className="w-[130px]">
                  Cidade
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="posicoes" className="w-[100px]">
                  Posições
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="candidatos" className="w-[120px]">
                  Candidatos
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="entrada" className="w-[120px]">
                  Entrada
                </ColunaOrdenavel>
                {/* QUEM recusou e QUANDO, só na aba Recusadas, as duas ordenáveis (§A.29). */}
                {aba === "recusadas" && (
                  <>
                    <ColunaOrdenavel as="th" ord={ord} chave="recusadaPor" className="w-[180px]">
                      Recusada Por
                    </ColunaOrdenavel>
                    <ColunaOrdenavel as="th" ord={ord} chave="recusadaEm" className="w-[150px]">
                      Recusada Em
                    </ColunaOrdenavel>
                  </>
                )}
                {/* Largura medida no rótulo mais longo do botão, que cabe em UMA linha (§A.20). */}
                <th className="w-[190px]">Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={aba === "recusadas" ? 11 : 9} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={aba === "recusadas" ? 11 : 9} className="py-8 text-center text-faint">
                    {busca
                      ? "Nenhuma vaga encontrada para a busca."
                      : aba === "pendentes"
                        ? "Nenhuma vaga esperando revisão."
                        : aba === "recusadas"
                          ? "Nenhuma vaga recusada."
                          : "Nenhuma vaga liberada pela revisão até agora."}
                  </td>
                </tr>
              ) : (
                ord.itens.map((v) => {
                  const regua = reguaDeLiberacao(v);
                  /* O ESTADO DO CLIENTE DESTA LINHA, numa função só, para a célula e a trilha não
                     discordarem do nome do caso (`lib/as-proposta-cliente`). */
                  const marca = marcaDaPropostaNaFila(v);
                  return (
                    <tr key={v.id}>
                      {/* ─ SEM `codigo`, A CÉLULA MOSTRA O NÚMERO DA VAGA NO ATS (08/10/2026) ──
                          A vaga que a ingestão do Digai cria nasce só com o número do Pandapé
                          (`partnerJobId`, o único campo de vaga do contrato dele), então `codigo` é
                          nulo e esta coluna aparecia sem número: 13 vagas assim em produção, com
                          223 candidaturas penduradas. O prefixo "ATS" é o que impede ler o id do
                          ATS como se fosse código de processo seletivo do EA. */}
                      <td className="whitespace-nowrap">
                        <CodigoDaVaga vaga={v} />
                      </td>
                      <td className="font-semibold">{v.nomeDivulgacao ?? "não informado"}</td>
                      <td className="text-center">{v.cargoNome ?? "não informado"}</td>
                      {/* ─ SÓ O NOME DO CLIENTE, OU "Sem Cliente". SEM TAG, SEM ÍCONE, SEM NADA ──
                          DECISÃO DO DIRETOR (01/10/2026), e ela é FINAL: esta coluna não distingue
                          cliente vinculado de nome proposto pela planilha, e não tem marca visual
                          nenhuma. O fundamento dele: "informação demais atrapalha; a fila é para
                          bater o olho e saber qual vaga tem cliente e qual não tem".

                          O CHECK VERDE SAIU por este pedido, e vale registrar que ele dizia uma
                          coisa que não era verdade: proposta não conferida aparecia com o mesmo
                          ícone de aprovação de um cliente que uma pessoa escolheu. Tirar o ícone
                          resolve isso de carona, porque nenhum ícone afirma menos que um errado.

                          A GARANTIA DA AUDITORIA NUNCA MOROU AQUI, e é por isso que esta coluna
                          pode ser só texto. Ela tem duas pernas, as duas intactas e as duas DENTRO
                          DO MODAL: o seletor NASCE VAZIO (a proposta vive em campo próprio, inerte,
                          e nunca escreve `cod_cliente`) e a vaga NÃO LIBERA sem o campo preenchido,
                          porque `codCliente` é o PRIMEIRO dos onze obrigatórios de
                          `VAGA_OBRIGATORIOS`. A validação acontece onde o time revisa, não na lista.

                          §A.12 fala de ícone por status em coluna de STATUS. Esta não é: é coluna de
                          identificação, e o diretor decidiu que ela é texto. */}
                      <td className="text-center">
                        {marca.tipo === "SEM_CLIENTE" ? (
                          <span className="text-dim" title={regua.motivo}>
                            Sem Cliente
                          </span>
                        ) : (
                          <span>{marca.nome}</span>
                        )}
                      </td>
                      <td className="text-center">
                        {v.cidadeNome
                          ? `${v.cidadeNome}${v.cidadeUf ? `/${v.cidadeUf}` : ""}`
                          : "não informado"}
                      </td>
                      <td className="text-center">{v.posicoesOficiais ?? "não informado"}</td>
                      <td className="text-center">{v.ocupacao?.emSelecao ?? 0}</td>
                      <td className="whitespace-nowrap text-center">{dataBr(v.criadoEm)}</td>
                      {aba === "recusadas" && (
                        <>
                          <td className="text-center">
                            {(v as VagaRecusada).recusadaPorNome || "não informado"}
                          </td>
                          <td className="whitespace-nowrap text-center">
                            {dataHoraBr((v as VagaRecusada).recusadaEm)}
                          </td>
                        </>
                      )}
                      <td>
                        {aba === "pendentes" ? (
                          // DUAS AÇÕES NA LINHA: revisar (o caminho principal) e recusar (devolver a
                          // vaga sem motivo). Botão é comando, escrita normal (§A.24).
                          <div className="flex flex-col gap-1.5">
                            <Button
                              className="w-full whitespace-nowrap py-2"
                              onClick={() => void abrirRevisao(v)}
                            >
                              Revisar vaga
                            </Button>
                            <Button
                              variant="secondary"
                              className="w-full whitespace-nowrap py-2"
                              disabled={acaoId === v.id}
                              onClick={() => void recusar(v)}
                            >
                              {acaoId === v.id ? "Recusando…" : "Recusar liberação"}
                            </Button>
                          </div>
                        ) : aba === "recusadas" ? (
                          <Button
                            className="w-full whitespace-nowrap py-2"
                            disabled={acaoId === v.id}
                            onClick={() => void devolver(v as VagaRecusada)}
                          >
                            {acaoId === v.id ? "Devolvendo…" : "Devolver para revisão"}
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="w-full whitespace-nowrap py-2"
                            onClick={() => setCorrigirAlvo(v)}
                          >
                            Corrigir liberação
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ── REVISAR A VAGA: A TRILHA INTEIRA, E NÃO MAIS UM MODAL DE UM CAMPO ─────────────────
          O QUE MUDOU E POR QUÊ: a vaga vem do Pandapé INCOMPLETA (o ATS não tem benefícios, escala,
          salário nem endereço), e o modal só pedia o cliente. Quem liberasse tirava da fila uma
          vaga vazia. Agora a tela pede TUDO o que a abertura pede, pelo MESMO formulário da Central
          de Vagas (§A.26: reusar, nunca duplicar), e sem obrigatório ela NÃO libera.

          O PREFILL NÃO PRECISA DE ENDPOINT NOVO: a fila já devolve o `VagaListItem` inteiro, que é
          exatamente o que a trilha consome.

          MONTADA SÓ QUANDO ABERTA, COM `key` NA VAGA: é a chave que faz o formulário nascer limpo
          a cada abertura, em vez de depender de alguém lembrar de zerar campo por campo. */}
      {revisarAlvo && (
        <TrilhaDaVaga
          key={revisarAlvo.id}
          modo={{ tipo: "liberacao", vaga: revisarAlvo }}
          catalogos={{
            opcoes,
            contexto,
            segmentos,
            optClientes,
            optCargos,
            statusVaga: catalogoStatus,
            linhasAtivas,
            carregandoLinhas,
          }}
          token={token}
          onFechar={() => setRevisarAlvo(null)}
          /* Serve aos DOIS destinos: "Salvar sem liberar" (a vaga fica na fila, com os campos
             gravados) e "Liberar vaga" (ela sai). A releitura é a mesma, e é ela que faz a linha
             sumir da fila ou voltar atualizada, sem a tela ter de adivinhar qual foi o gesto. */
          onGravada={async () => {
            setRevisarAlvo(null);
            await carregar();
          }}
        />
      )}

      {/* A ESPERA E A FALHA DA BUSCA DO DETALHE AO REVISAR (correção de LGPD ativo). O aviso de
          espera não fecha por engano (§A.41): some sozinho quando o detalhe chega ou a busca falha. */}
      {carregandoRevisao && (
        <Modal onClose={() => {}} ariaLabel="Abrindo a vaga" className="max-w-sm">
          <div className="p-6 text-center text-faint">Abrindo a vaga…</div>
        </Modal>
      )}

      {erroRevisao && (
        <Modal onClose={() => setErroRevisao(null)} ariaLabel="Erro ao abrir a vaga" className="max-w-sm">
          <div className="p-5">
            <p
              className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erroRevisao}
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setErroRevisao(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {corrigirAlvo && (
        <CorrigirLiberacaoModal
          vaga={corrigirAlvo}
          clientes={optClientes}
          token={token}
          onClose={() => setCorrigirAlvo(null)}
          onCorrigida={() => {
            setCorrigirAlvo(null);
            void carregar();
          }}
        />
      )}
    </>
  );
}

/** As opções já prontas para o `Combobox`, montadas uma vez pela página. */
type OpcoesCliente = { value: string; label: string; hint?: string; busca?: string }[];

/**
 * ─ A CORREÇÃO DO MASTER ────────────────────────────────────────────────────────────────────────
 *
 * O QUE ELA RESOLVE: alguém liberou com o cliente errado. Aqui o Master troca o cliente e, se quiser
 * que a vaga volte a ser conferida do zero, devolve a vaga para a fila no mesmo gesto.
 *
 * SÓ MASTER E SUPER_ADMIN CHEGAM AQUI, e quem decide isso é o servidor. A tela esconde o gesto
 * porque oferecer o que o backend vai recusar vira chamado, não porque esconder proteja algo.
 */
function CorrigirLiberacaoModal({
  vaga,
  clientes,
  token,
  onClose,
  onCorrigida,
}: {
  vaga: VagaEmRevisao;
  clientes: OpcoesCliente;
  token?: string | null;
  onClose: () => void;
  onCorrigida: () => void;
}) {
  const [codCliente, setCodCliente] = useState<string>(vaga.codCliente ?? "");
  const [devolver, setDevolver] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const semCliente = !codCliente;
  const semMudanca = codCliente === (vaga.codCliente ?? "") && !devolver;

  async function salvar() {
    if (semCliente || semMudanca) return;
    setSalvando(true);
    setErro(null);
    try {
      await corrigirLiberacaoDeRevisao(vaga.id, { codCliente, devolverParaFila: devolver }, token);
      onCorrigida();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível corrigir a liberação.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Corrigir a liberação" className="max-w-[560px]">
      <div className="p-5">
        <h2 className="text-lg font-extrabold">Corrigir A Liberação</h2>
        <p className="mt-1 text-sm text-dim">
          Troque o cliente da vaga e, se for o caso, devolva a vaga para a fila de revisão. A
          correção fica registrada pelo servidor.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          {/* O MESMO texto da coluna: o número do ATS quando a vaga não tem código do EA. */}
          <Campo rotulo="Vaga" valor={textoDoCodigoDaVaga(vaga)} />
          <Campo rotulo="Nome da vaga" valor={vaga.nomeDivulgacao} />
          <Campo rotulo="Cliente atual" valor={vaga.clienteNome} />
          <Campo rotulo="Candidatos em processo" valor={String(vaga.ocupacao?.emSelecao ?? 0)} />
        </dl>

        <label className="mt-4 block text-[13px] font-semibold" htmlFor="cliente-da-correcao">
          Cliente
        </label>
        <Combobox
          id="cliente-da-correcao"
          value={codCliente}
          onChange={(v) => setCodCliente(v)}
          options={clientes}
          placeholder="Escolher o cliente"
          ariaLabel="Cliente da vaga"
          searchable
          limpavel
          invalido={semCliente}
          className="mt-1"
        />

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-[3px] h-4 w-4 cursor-pointer accent-[var(--accent)]"
            checked={devolver}
            onChange={(e) => setDevolver(e.target.checked)}
          />
          <span>
            Devolver a vaga para a fila de revisão.
            <span className="block text-[12.5px] text-dim">
              A vaga volta a aparecer como pendente e precisa ser liberada de novo.
            </span>
          </span>
        </label>

        {semCliente && (
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-warn-2">
            <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none" />
            A correção precisa de um cliente. Escolha para quem esta vaga é.
          </p>
        )}

        {erro && (
          <p className="mt-3 rounded-lg border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.1)] px-3 py-2 text-[12.5px] text-danger">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={semCliente || semMudanca || salvando}>
            {salvando ? "Salvando…" : "Salvar correção"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Um par rótulo/valor do resumo da vaga. Célula vazia escreve "não informado" (§A.11). */
function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</dt>
      <dd className="font-semibold">{valor ?? "não informado"}</dd>
    </div>
  );
}
