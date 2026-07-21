"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Modal } from "@/components/ui/Modal";
import {
  LIBERACAO_POLL_MS,
  useLiberacaoCount,
  useLiberacaoRefresh,
} from "@/components/shell/LiberacaoAlerta";
import { precisaValorBeneficio } from "@/lib/beneficios";

// Tipo de contrato: MESMA lista fixa do wizard (não é texto livre). A régua unificada pede o "tipo".
const TIPOS_CONTRATO = [
  "Temporário",
  "Terceirizado",
  "Estágio",
  "Interno",
  "Fopag",
  "Jovem Aprendiz",
];

interface CatItem {
  id: string;
  nome: string;
}

interface PreAdmissao {
  admissaoId: string;
  candidatoNome: string;
  candidatoCpf: string;
  telefone: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  origem: string;
  criadoEm: string;
  idVacancy: string | null;
  possivelDuplicata: boolean;
}
interface Cliente {
  codCliente: string;
  razaoSocial: string;
  // Nome operacional (fantasia): o time reconhece o cliente por ele, não pela razão social.
  nomeOperacao: string | null;
  // Escala sugerida do cliente (o valor pré-preenche; as opções vêm do catálogo, independentes).
  escalaPadrao: string | null;
}
interface Cargo {
  id: string;
  nome: string;
}
interface Recusada {
  admissaoId: string;
  candidatoNome: string;
  candidatoCpf: string;
  telefone: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  origem: string;
  criadoEm: string;
  recusadoEm: string | null;
  recusadoPor: string | null;
}

type Aba = "aguardando" | "recusadas";

const ROTULO_SEXO: Record<string, string> = {
  MASCULINO: "Masculino",
  FEMININO: "Feminino",
};

function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const iso = d.slice(0, 10);
  const [a, m, dia] = iso.split("-");
  return a && m && dia ? `${dia}/${m}/${a}` : "não informado";
}
function fmtCpf(cpf: string): string {
  return cpf.length === 11
    ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    : cpf;
}
/**
 * Busca por candidato (nome parcial OU CPF), no mesmo espírito da esteira/gerenciador, mas
 * client-side: as duas listas já estão carregadas em memória. Nome é case-insensitive e parcial;
 * CPF é normalizado por dígitos, então casa digitado com ou sem pontuação.
 */
function filtrarBusca<T extends { candidatoNome: string; candidatoCpf: string }>(
  itens: T[],
  busca: string,
): T[] {
  const q = busca.trim().toLowerCase();
  if (!q) return itens;
  const qDigitos = q.replace(/\D/g, "");
  return itens.filter(
    (it) =>
      it.candidatoNome.toLowerCase().includes(q) ||
      (qDigitos.length > 0 && it.candidatoCpf.replace(/\D/g, "").includes(qDigitos)),
  );
}
/**
 * Rótulo do cliente no seletor: "código · nome operacional" (o time reconhece por ele). Sem nome
 * operacional, cai para "código · razão social". A razão social NÃO entra quando há nome operacional
 * (é longa e polui).
 */
function rotuloCliente(c: Cliente): string {
  return `${c.codCliente} · ${c.nomeOperacao ?? c.razaoSocial}`;
}
/**
 * Memória de pacote por (cliente + cargo), §A.17 etapa 4. MESMA rota do wizard e do modal individual,
 * usada também pelo modal do lote: escolhido o par, o pacote sugerido é o mesmo, então preencher uma
 * vez vale para as N. Falha é silenciosa: a memória é sugestão, nunca bloqueia a liberação.
 */
async function buscarPacotePadrao(
  token: string,
  codCliente: string,
  cargoId: string,
): Promise<{ nome: string; valor: number | null }[]> {
  const r = await apiFetch<{ beneficios: { nome: string; valor: number | null }[] }>(
    `/admissoes/padrao-cliente-cargo?codCliente=${encodeURIComponent(codCliente)}&cargoId=${encodeURIComponent(cargoId)}`,
    { token },
  );
  return r.beneficios ?? [];
}
/** Valores do pacote no formato do input (pt-BR), só para os benefícios que têm valor na memória. */
function valoresDoPacote(pacote: { nome: string; valor: number | null }[]): Record<string, string> {
  return Object.fromEntries(
    pacote.filter((b) => b.valor !== null).map((b) => [b.nome, b.valor!.toFixed(2).replace(".", ",")]),
  );
}
// Salário em pt-BR ("2.500,00") → string numérica que o Postgres aceita ("2500.00"). Mesma convenção
// do valor de benefício (o backend guarda o salário cru como numeric, sem transform próprio).
function salarioParaNumero(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  return t.replace(/\./g, "").replace(",", ".");
}

// Tempo parado desde a CHEGADA (criadoEm) até agora. Duas leituras do MESMO total: dias (piso, dias
// completos decorridos) e horas (piso). `nowMs` vem do estado, atualizado no load/liberar.
function paradoMs(criadoEm: string, nowMs: number): number {
  return Math.max(0, nowMs - new Date(criadoEm).getTime());
}
function paradoDias(criadoEm: string, nowMs: number): string {
  const d = Math.floor(paradoMs(criadoEm, nowMs) / 86_400_000);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}
// Total ACUMULADO desde a chegada em hh:mm (não reinicia às 24h: 36h30 → "36:30"). Minutos por piso.
function paradoHoras(criadoEm: string, nowMs: number): string {
  const totalMin = Math.floor(paradoMs(criadoEm, nowMs) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function LiberacaoPage() {
  const { token, isAdmin } = useAuth();
  // Refresh imediato do badge do menu (Parte 3): a fila muda ao liberar/recusar/reativar, e o contador
  // não pode esperar o polling de 90s. Rede de fundo (90s) continua; isto só antecipa no evento.
  const refreshBadge = useLiberacaoRefresh();
  // Contagem do MESMO polling do badge (90s). Mudou (subiu ou desceu), a lista visível recarrega na
  // hora, sem esperar o ciclo próprio da tela.
  const liberacaoCount = useLiberacaoCount();
  const [rows, setRows] = useState<PreAdmissao[]>([]);
  const [recusadas, setRecusadas] = useState<Recusada[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  // Toggle Aguardando (padrão) × Admissões Recusadas.
  const [aba, setAba] = useState<Aba>("aguardando");
  // Busca por candidato (nome ou CPF): filtra as DUAS visões ao mesmo tempo, client-side.
  const [busca, setBusca] = useState("");
  // Modal de detalhe de uma recusada (histórico quem/quando + reativar).
  const [recusadaAlvo, setRecusadaAlvo] = useState<Recusada | null>(null);
  const [acaoRecusa, setAcaoRecusa] = useState(false);
  // "Agora" fixado no carregamento — as colunas de tempo parado calculam a partir daqui.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Catálogos reusados (mesmos endpoints do wizard/lápis): benefícios e escalas.
  const [beneficiosCat, setBeneficiosCat] = useState<CatItem[]>([]);
  const [escalasCat, setEscalasCat] = useState<CatItem[]>([]);
  // Modal de liberação: a pré-admissão alvo (null = fechado) + os campos do formulário.
  const [alvo, setAlvo] = useState<PreAdmissao | null>(null);
  const [codCliente, setCodCliente] = useState("");
  const [cargoId, setCargoId] = useState("");
  // Campos obrigatórios (régua unificada §A.19), todos opcionais na liberação — só cliente+cargo travam.
  const [salario, setSalario] = useState("");
  const [tipoContrato, setTipoContrato] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [escala, setEscala] = useState("");
  const [centroCusto, setCentroCusto] = useState("");
  const [gestorBp, setGestorBp] = useState("");
  // Pacote de benefícios (REUSA a régua de valor de lib/beneficios): nomes selecionados + valor por nome.
  const [beneficiosSel, setBeneficiosSel] = useState<string[]>([]);
  const [beneficiosValores, setBeneficiosValores] = useState<Record<string, string>>({});
  const [liberando, setLiberando] = useState(false);
  const [modalErro, setModalErro] = useState<string | null>(null);
  // LIBERAÇÃO EM MASSA: ids selecionados na aba Aguardando, modal do lote e relatório final.
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [loteAberto, setLoteAberto] = useState(false);
  const [loteCodCliente, setLoteCodCliente] = useState("");
  const [loteCargoId, setLoteCargoId] = useState("");
  // MESMOS campos do individual, todos opcionais (só cliente+cargo travam). O preenchido vale para as
  // N do lote; o vazio vira pendência individual de cada admissão na esteira.
  const [loteSalario, setLoteSalario] = useState("");
  const [loteTipoContrato, setLoteTipoContrato] = useState("");
  const [loteDataAdmissao, setLoteDataAdmissao] = useState("");
  const [loteEscala, setLoteEscala] = useState("");
  const [loteCentroCusto, setLoteCentroCusto] = useState("");
  const [loteGestorBp, setLoteGestorBp] = useState("");
  const [loteBeneficiosSel, setLoteBeneficiosSel] = useState<string[]>([]);
  const [loteBeneficiosValores, setLoteBeneficiosValores] = useState<Record<string, string>>({});
  const [loteErro, setLoteErro] = useState<string | null>(null);
  const [loteEmCurso, setLoteEmCurso] = useState(false);
  const [loteResultado, setLoteResultado] = useState<{
    liberadas: { admissaoId: string; candidato: string }[];
    falhas: { candidato: string; motivo: string }[];
  } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [pre, rec, cli, car, ben, esc] = await Promise.all([
        apiFetch<PreAdmissao[]>("/admissoes/aguardando-liberacao", { token }),
        apiFetch<Recusada[]>("/admissoes/recusadas", { token }),
        apiFetch<Cliente[]>("/admin/clientes", { token }),
        apiFetch<Cargo[]>("/admin/cargos", { token }),
        apiFetch<CatItem[]>("/catalogos/beneficios", { token }),
        apiFetch<CatItem[]>("/catalogos/escalas", { token }),
      ]);
      setRows(pre);
      setRecusadas(rec);
      setClientes(cli);
      setCargos(car);
      setBeneficiosCat(ben);
      setEscalasCat(esc);
      setNowMs(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar a fila de liberação");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Enquanto montado: não aplica resposta que chega depois de sair da tela.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  // Uma recarga em voo por vez (o ciclo próprio e o gatilho da contagem podem coincidir).
  const recargaEmVoo = useRef(false);

  /**
   * Auto-refresh da LISTA (go-live do Pandapé): com admissão viva caindo a qualquer momento, a tela
   * aberta tem de mostrar a nova pré-admissão sem refresh manual.
   *
   * Recarga SILENCIOSA e deliberadamente parcial: rebusca só as DUAS listas (aguardando e recusadas),
   * não os catálogos (clientes, cargos, benefícios, escalas), que não mudam nesse ritmo. Não mexe em
   * `loading` (a tabela não pisca "Carregando…"), não toca em `busca` nem na aba (a busca é client-side
   * sobre as listas, então o filtro digitado continua valendo e o campo não é limpo), e não escreve em
   * `error`/`okMsg`. Falha de rede aqui é silenciosa: o auto-refresh é auxiliar, o `load` inicial é
   * quem reporta erro.
   */
  const recarregarListas = useCallback(async () => {
    if (!token || recargaEmVoo.current) return;
    recargaEmVoo.current = true;
    try {
      const [pre, rec] = await Promise.all([
        apiFetch<PreAdmissao[]>("/admissoes/aguardando-liberacao", { token }),
        apiFetch<Recusada[]>("/admissoes/recusadas", { token }),
      ]);
      if (!montado.current) return;
      setRows(pre);
      setRecusadas(rec);
      setNowMs(Date.now()); // colunas de tempo parado acompanham a recarga.
    } catch {
      /* auto-refresh é auxiliar; falha de rede não perturba a tela */
    } finally {
      recargaEmVoo.current = false;
    }
  }, [token]);

  // Ciclo próprio da tela, no MESMO intervalo do contador (90s). Só enquanto a tela está montada e a
  // aba do browser visível (aba em segundo plano não gera tráfego).
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void recarregarListas();
    }, LIBERACAO_POLL_MS);
    return () => clearInterval(id);
  }, [token, recarregarListas]);

  // Gatilho pela contagem do provider: o badge detectou mudança (chegou/saiu pré-admissão), a lista
  // reflete na mesma hora. `useRef` inicia com o valor atual, então não dispara à toa no primeiro render.
  const countAnterior = useRef(liberacaoCount);
  useEffect(() => {
    if (countAnterior.current === liberacaoCount) return;
    countAnterior.current = liberacaoCount;
    void recarregarListas();
  }, [liberacaoCount, recarregarListas]);

  // PODA da seleção pelo id: a lista se atualiza sozinha (90s), então uma selecionada pode sumir
  // (outro consultor liberou ou recusou). Fora da lista, fora da seleção: o lote nunca tenta liberar
  // algo que já saiu da fila.
  useEffect(() => {
    setSelecionados((sel) => {
      const vivos = new Set(rows.map((r) => r.admissaoId));
      const podado = sel.filter((id) => vivos.has(id));
      return podado.length === sel.length ? sel : podado;
    });
  }, [rows]);

  // Benefícios e escala DEPENDEM de cliente+cargo: ao escolher o par, pré-preenche o pacote pela
  // memória (mesma rota do wizard). Escala sugere o padrão do cliente (opções são independentes).
  useEffect(() => {
    if (!token || !alvo || !codCliente || !cargoId) return;
    let vivo = true;
    buscarPacotePadrao(token, codCliente, cargoId)
      .then((pacote) => {
        if (!vivo || pacote.length === 0) return;
        setBeneficiosSel(pacote.map((b) => b.nome));
        setBeneficiosValores(valoresDoPacote(pacote));
      })
      .catch(() => {
        /* memória é sugestão; falha não bloqueia a liberação */
      });
    const cli = clientes.find((c) => c.codCliente === codCliente);
    if (cli?.escalaPadrao) setEscala((e) => e || cli.escalaPadrao!);
    return () => {
      vivo = false;
    };
  }, [token, alvo, codCliente, cargoId, clientes]);

  // Memória do par no LOTE: mesma rota, mesma regra do individual. Escolhido cliente+cargo, o pacote
  // sugerido pré-preenche e o consultor edita; o que valer para todas é aplicado às N.
  useEffect(() => {
    if (!token || !loteAberto || !loteCodCliente || !loteCargoId) return;
    let vivo = true;
    buscarPacotePadrao(token, loteCodCliente, loteCargoId)
      .then((pacote) => {
        if (!vivo || pacote.length === 0) return;
        setLoteBeneficiosSel(pacote.map((b) => b.nome));
        setLoteBeneficiosValores(valoresDoPacote(pacote));
      })
      .catch(() => {
        /* memória é sugestão; falha não bloqueia o lote */
      });
    const cli = clientes.find((c) => c.codCliente === loteCodCliente);
    if (cli?.escalaPadrao) setLoteEscala((e) => e || cli.escalaPadrao!);
    return () => {
      vivo = false;
    };
  }, [token, loteAberto, loteCodCliente, loteCargoId, clientes]);

  function abrirModal(r: PreAdmissao) {
    setAlvo(r);
    setCodCliente("");
    setCargoId("");
    setSalario("");
    setTipoContrato("");
    setDataAdmissao("");
    setEscala("");
    setCentroCusto("");
    setGestorBp("");
    setBeneficiosSel([]);
    setBeneficiosValores({});
    setModalErro(null);
  }
  function fecharModal() {
    if (liberando) return;
    setAlvo(null);
  }

  // Pacote no formato do backend (mesma montagem do wizard): nome→beneficioId; valor só nos que exigem.
  function montarPacote(
    sel: string[] = beneficiosSel,
    valores: Record<string, string> = beneficiosValores,
  ): { beneficioId: string; valor?: string }[] {
    return sel.flatMap((nome) => {
      const b = beneficiosCat.find((x) => x.nome === nome);
      if (!b) return [];
      const bruto = precisaValorBeneficio(nome) ? (valores[nome] ?? "").trim() : "";
      return [{ beneficioId: b.id, valor: bruto || undefined }];
    });
  }

  async function liberar() {
    if (!alvo || !codCliente || !cargoId) return;
    setLiberando(true);
    setModalErro(null);
    setError(null);
    setOkMsg(null);
    try {
      const pacoteBeneficios = montarPacote();
      const r = await apiFetch<{ temRegua: boolean }>(
        `/admissoes/${encodeURIComponent(alvo.admissaoId)}/liberar`,
        {
          method: "PATCH",
          token,
          body: {
            codCliente,
            cargoId,
            tipoContrato: tipoContrato || undefined,
            dataAdmissao: dataAdmissao || undefined,
            vagaFolha: {
              salario: salarioParaNumero(salario),
              escala: escala || undefined,
              centroCusto: centroCusto || undefined,
              gestorBp: gestorBp || undefined,
            },
            pacoteBeneficios: pacoteBeneficios.length ? pacoteBeneficios : undefined,
          },
        },
      );
      setOkMsg(
        r.temRegua
          ? `${alvo.candidatoNome} liberado. A admissão entrou na esteira com a régua documental do par.`
          : `${alvo.candidatoNome} liberado e na esteira. Atenção: este par cliente e cargo não tem régua documental cadastrada, então a admissão nasceu sem checklist de documentos.`,
      );
      setAlvo(null);
      await load();
      refreshBadge(); // saiu da fila: badge cai na hora.
    } catch (e) {
      const msg =
        e instanceof ApiError && typeof e.data === "object" && e.data
          ? ((e.data as { message?: string }).message ?? e.message)
          : e instanceof Error
            ? e.message
            : "Erro ao liberar";
      setModalErro(msg);
    } finally {
      setLiberando(false);
    }
  }

  // Recusa (Parte 2, só Master/Super Admin): a partir do modal de liberação. Farol → recusada, sai da fila.
  async function recusar() {
    if (!alvo) return;
    setAcaoRecusa(true);
    setModalErro(null);
    setError(null);
    setOkMsg(null);
    try {
      await apiFetch(`/admissoes/${encodeURIComponent(alvo.admissaoId)}/recusar`, {
        method: "PATCH",
        token,
      });
      setOkMsg(`${alvo.candidatoNome} recusado. Movido para "Admissões Recusadas".`);
      setAlvo(null);
      await load();
      refreshBadge(); // saiu da fila: badge cai na hora.
    } catch (e) {
      setModalErro(e instanceof Error ? e.message : "Erro ao recusar");
    } finally {
      setAcaoRecusa(false);
    }
  }

  // Reativa uma recusada (só Master/Super Admin): volta para a fila de aguardando.
  async function reativarRecusada() {
    if (!recusadaAlvo) return;
    setAcaoRecusa(true);
    setError(null);
    setOkMsg(null);
    try {
      await apiFetch(
        `/admissoes/${encodeURIComponent(recusadaAlvo.admissaoId)}/reativar-recusada`,
        {
          method: "PATCH",
          token,
        },
      );
      setOkMsg(`${recusadaAlvo.candidatoNome} reativado. Voltou para "Aguardando".`);
      setRecusadaAlvo(null);
      setAba("aguardando");
      await load();
      refreshBadge(); // voltou para a fila: badge sobe na hora.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reativar");
    } finally {
      setAcaoRecusa(false);
    }
  }

  const podeLiberar = Boolean(codCliente && cargoId);

  // ---------- Liberação em massa ----------
  function abrirLote() {
    setLoteCodCliente("");
    setLoteCargoId("");
    setLoteSalario("");
    setLoteTipoContrato("");
    setLoteDataAdmissao("");
    setLoteEscala("");
    setLoteCentroCusto("");
    setLoteGestorBp("");
    setLoteBeneficiosSel([]);
    setLoteBeneficiosValores({});
    setLoteErro(null);
    setLoteAberto(true);
  }
  function fecharLote() {
    if (loteEmCurso) return;
    setLoteAberto(false);
  }
  function alternarSelecao(id: string) {
    setSelecionados((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }

  /**
   * Executa o lote SÓ com as não-duplicatas selecionadas (as duplicatas são bloqueadas no modal e
   * seguem para tratamento individual). Erro que barra o lote inteiro (par sem régua, teto, cliente
   * ou cargo inexistente) volta do backend e é mostrado DENTRO do modal, sem liberar ninguém.
   */
  async function liberarLote() {
    if (loteSelecionadasOk.length === 0 || !loteCodCliente || !loteCargoId) return;
    const lotePacote = montarPacote(loteBeneficiosSel, loteBeneficiosValores);
    setLoteEmCurso(true);
    setLoteErro(null);
    setError(null);
    setOkMsg(null);
    try {
      const r = await apiFetch<{
        liberadas: { admissaoId: string; candidato: string }[];
        falhas: { candidato: string; motivo: string }[];
      }>("/admissoes/liberar-lote", {
        method: "PATCH",
        token,
        body: {
          admissaoIds: loteSelecionadasOk.map((x) => x.admissaoId),
          codCliente: loteCodCliente,
          cargoId: loteCargoId,
          // O preenchido vale para TODAS as N; o vazio segue como pendência individual de cada uma.
          tipoContrato: loteTipoContrato || undefined,
          dataAdmissao: loteDataAdmissao || undefined,
          vagaFolha: {
            salario: salarioParaNumero(loteSalario),
            escala: loteEscala || undefined,
            centroCusto: loteCentroCusto || undefined,
            gestorBp: loteGestorBp || undefined,
          },
          pacoteBeneficios: lotePacote.length ? lotePacote : undefined,
        },
      });
      setLoteAberto(false);
      setLoteResultado(r);
      setSelecionados([]);
      await load();
      refreshBadge(); // saíram da fila: badge cai na hora.
    } catch (e) {
      const msg =
        e instanceof ApiError && typeof e.data === "object" && e.data
          ? ((e.data as { message?: string }).message ?? e.message)
          : e instanceof Error
            ? e.message
            : "Erro ao liberar o lote";
      setLoteErro(msg);
    } finally {
      setLoteEmCurso(false);
    }
  }

  // Visões filtradas pela busca (nome/CPF). Busca vazia = listas completas (sem regressão).
  const rowsFiltradas = filtrarBusca(rows, busca);
  const recusadasFiltradas = filtrarBusca(recusadas, busca);

  // Seleção em massa. "Selecionar todos" opera SÓ sobre as linhas VISÍVEIS (filtradas pela busca),
  // nunca sobre a base inteira: o consultor não seleciona o que não está vendo.
  const idsVisiveis = rowsFiltradas.map((r) => r.admissaoId);
  const selecionadosVisiveis = idsVisiveis.filter((id) => selecionados.includes(id));
  const todosVisiveisMarcados =
    idsVisiveis.length > 0 && selecionadosVisiveis.length === idsVisiveis.length;
  function alternarTodosVisiveis() {
    setSelecionados((sel) =>
      todosVisiveisMarcados
        ? sel.filter((id) => !idsVisiveis.includes(id))
        : [...new Set([...sel, ...idsVisiveis])],
    );
  }
  // Selecionadas do lote, separadas pela trava de duplicata: as marcadas "possível duplicata" NÃO
  // são liberadas em massa (decisão do diretor), vão para tratamento individual.
  const selecionadasObjs = rows.filter((r) => selecionados.includes(r.admissaoId));
  const loteDuplicatas = selecionadasObjs.filter((r) => r.possivelDuplicata);
  const loteSelecionadasOk = selecionadasObjs.filter((r) => !r.possivelDuplicata);
  const podeLiberarLote = Boolean(loteCodCliente && loteCargoId && loteSelecionadasOk.length > 0);

  // Campos da régua unificada §A.19 ainda vazios (hint visual; a fonte autoritativa é o backend, que
  // recalcula o sinalizador ao liberar). Cliente/Cargo não entram: são a trava, já garantidos aqui.
  // Mesma régua de hint, aplicada aos campos do LOTE (vale igual para todas as N).
  const lotePendentes = [
    !loteSalario && "Salário",
    !loteTipoContrato && "Tipo de contrato",
    !loteDataAdmissao && "Data de admissão",
    loteBeneficiosSel.length === 0 && "Pacote de benefícios",
    !loteEscala && "Escala",
    !loteCentroCusto && "Centro de custo",
    !loteGestorBp && "Gestor / BP",
  ].filter(Boolean) as string[];

  const pendentesNoModal = [
    !salario && "Salário",
    !tipoContrato && "Tipo de contrato",
    !dataAdmissao && "Data de admissão",
    beneficiosSel.length === 0 && "Pacote de benefícios",
    !escala && "Escala",
    !centroCusto && "Centro de custo",
    !gestorBp && "Gestor / BP",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHead
        eyebrow="Operação"
        title="Liberação Admissional"
        subtitle="Pré-admissões que chegaram pelo Pandapé e aguardam cliente e cargo. Atribua os dois para a admissão entrar na esteira."
      />

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
      {okMsg && (
        <p className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-sm text-ok">
          {okMsg}
        </p>
      )}

      {/* Toggle Aguardando (padrão) × Admissões Recusadas + busca por candidato (nome/CPF). */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {(["aguardando", "recusadas"] as Aba[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={cn(
              "rounded-full border px-3 py-1 transition",
              aba === a
                ? "border-accent bg-[var(--surface-2)] text-accent"
                : "border-[var(--border)] text-dim hover:text-text",
            )}
          >
            {a === "aguardando"
              ? `Aguardando (${rowsFiltradas.length})`
              : `Admissões Recusadas (${recusadasFiltradas.length})`}
          </button>
        ))}
        {/* Busca rápida na tela: mesmo padrão da esteira (barra cilindro). Filtra Aguardando E
          Recusadas ao mesmo tempo, por nome parcial ou CPF (com ou sem pontuação). */}
        <input
          type="search"
          className="ds-input rounded-full w-[280px] sm:ml-auto"
          placeholder="Buscar por nome ou CPF"
          aria-label="Buscar por nome ou CPF"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Barra de ação da seleção em massa: só aparece com algo marcado, para não poluir a tela. */}
      {aba === "aguardando" && selecionados.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
          <span className="font-semibold">
            {selecionados.length} selecionada{selecionados.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="text-[13px] text-dim underline-offset-2 hover:underline"
            onClick={() => setSelecionados([])}
          >
            Limpar seleção
          </button>
          <Button className="ml-auto py-2" onClick={abrirLote}>
            Liberar selecionadas
          </Button>
        </div>
      )}

      {aba === "aguardando" ? (
        <GlassCard className="overflow-hidden p-2">
          <div className="ea-scroll overflow-x-auto">
            <table className="ds-table min-w-[944px]">
              <thead>
                <tr>
                  <th className="w-[44px]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                      aria-label="Selecionar todas as visíveis"
                      title="Seleciona só as linhas visíveis pela busca"
                      checked={todosVisiveisMarcados}
                      onChange={alternarTodosVisiveis}
                      disabled={idsVisiveis.length === 0}
                    />
                  </th>
                  <th>Candidato</th>
                  <th className="w-[150px]">CPF</th>
                  <th className="w-[130px]">Telefone</th>
                  <th className="w-[120px]">Nascimento</th>
                  <th className="w-[100px]">Sexo</th>
                  <th className="w-[110px]">Chegada</th>
                  <th className="w-[100px]">Parado (dias)</th>
                  <th className="w-[110px]">Parado (horas)</th>
                  <th className="w-[120px]">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-faint">
                      Carregando…
                    </td>
                  </tr>
                ) : rowsFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-faint">
                      {busca
                        ? "Nenhum candidato encontrado para a busca."
                        : "Nenhuma pré-admissão aguardando liberação."}
                    </td>
                  </tr>
                ) : (
                  rowsFiltradas.map((r) => (
                    <tr key={r.admissaoId}>
                      <td>
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                          aria-label={`Selecionar ${r.candidatoNome}`}
                          checked={selecionados.includes(r.admissaoId)}
                          onChange={() => alternarSelecao(r.admissaoId)}
                        />
                      </td>
                      <td className="font-semibold">
                        <span className="inline-flex items-center gap-2">
                          {r.candidatoNome}
                          {r.possivelDuplicata && (
                            <span
                              className="inline-flex items-center rounded-full border border-[rgba(234,88,12,0.35)] bg-[rgba(234,88,12,0.12)] px-2 py-0.5 text-[11px] font-semibold text-warn-2"
                              title="Já existe admissão viva deste CPF sem vaga comparável. Confirme se não é duplicata antes de liberar."
                            >
                              Possível duplicata
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap font-mono text-[12.5px]">
                        {fmtCpf(r.candidatoCpf)}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {r.telefone ?? "não informado"}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {fmtData(r.dataNascimento)}
                      </td>
                      <td className="text-[12.5px]">
                        {r.sexo ? (ROTULO_SEXO[r.sexo] ?? r.sexo) : "não informado"}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">{fmtData(r.criadoEm)}</td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {paradoDias(r.criadoEm, nowMs)}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {paradoHoras(r.criadoEm, nowMs)}
                      </td>
                      <td>
                        <Button onClick={() => abrirModal(r)} className="w-full py-2">
                          Liberar
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden p-2">
          <div className="ea-scroll overflow-x-auto">
            <table className="ds-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th className="w-[150px]">CPF</th>
                  <th className="w-[130px]">Telefone</th>
                  <th className="w-[180px]">Recusado por</th>
                  <th className="w-[120px]">Recusado em</th>
                  <th className="w-[120px]">Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-faint">
                      Carregando…
                    </td>
                  </tr>
                ) : recusadasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-faint">
                      {busca
                        ? "Nenhum candidato encontrado para a busca."
                        : "Nenhuma admissão recusada."}
                    </td>
                  </tr>
                ) : (
                  recusadasFiltradas.map((r) => (
                    <tr key={r.admissaoId}>
                      <td className="font-semibold">{r.candidatoNome}</td>
                      <td className="whitespace-nowrap font-mono text-[12.5px]">
                        {fmtCpf(r.candidatoCpf)}
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">
                        {r.telefone ?? "não informado"}
                      </td>
                      <td className="text-[12.5px]">{r.recusadoPor ?? "não informado"}</td>
                      <td className="whitespace-nowrap text-[12.5px]">{fmtData(r.recusadoEm)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => setRecusadaAlvo(r)}
                          className="w-full py-2"
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {alvo && (
        <Modal onClose={fecharModal} ariaLabel="Liberar admissão" className="max-w-[560px] p-6">
          <div className="mb-5">
            <div className="eyebrow !mb-1">Liberação Admissional</div>
            <h2 className="font-display text-xl font-bold">{alvo.candidatoNome}</h2>
            <p className="mt-0.5 font-mono text-[13px] text-dim">{fmtCpf(alvo.candidatoCpf)}</p>
          </div>

          {/* Cliente + cargo: o que ESTA OST entrega e a única trava de liberação. A próxima OST
              (pendências obrigatórias) adiciona campos ABAIXO deste bloco, sem refazer o modal. */}
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="ds-label">Cliente</span>
              <Select
                value={codCliente}
                onChange={setCodCliente}
                placeholder="Selecione o cliente…"
                ariaLabel="Cliente"
                searchable
                menuFit
                options={clientes.map((c) => ({ value: c.codCliente, label: rotuloCliente(c) }))}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="ds-label">Cargo</span>
              <Select
                value={cargoId}
                onChange={setCargoId}
                placeholder="Selecione o cargo…"
                ariaLabel="Cargo"
                searchable
                menuFit
                options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </label>
            {/* Demais campos obrigatórios (régua unificada §A.19), abaixo de cliente/cargo. Opcionais:
                o que ficar vazio vira pendência na esteira; SÓ cliente+cargo travam a liberação. */}
            <div className="grid grid-cols-2 gap-4">
              <label className="grid gap-1.5">
                <span className="ds-label">Salário</span>
                <input
                  className="ds-input"
                  inputMode="decimal"
                  placeholder="Ex.: 2.500,00"
                  value={salario}
                  onChange={(e) => setSalario(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Data de admissão</span>
                <input
                  type="date"
                  className="ds-input"
                  value={dataAdmissao}
                  onChange={(e) => setDataAdmissao(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Tipo de contrato</span>
                <Select
                  value={tipoContrato}
                  onChange={setTipoContrato}
                  placeholder="Selecione…"
                  ariaLabel="Tipo de contrato"
                  options={TIPOS_CONTRATO.map((t) => ({ value: t, label: t }))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Escala</span>
                <Select
                  value={escala}
                  onChange={setEscala}
                  placeholder="Selecione…"
                  ariaLabel="Escala"
                  searchable
                  menuFit
                  options={escalasCat.map((e) => ({ value: e.nome, label: e.nome }))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Centro de custo</span>
                <input
                  className="ds-input"
                  value={centroCusto}
                  onChange={(e) => setCentroCusto(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Gestor / BP</span>
                <input
                  className="ds-input"
                  value={gestorBp}
                  onChange={(e) => setGestorBp(e.target.value)}
                />
              </label>
            </div>

            {/* Pacote de benefícios: REUSA a régua de valor (precisaValorBeneficio). Menu, nunca texto
                livre; valores pré-preenchidos pela memória cliente+cargo, editáveis. */}
            <label className="grid gap-1.5">
              <span className="ds-label">Benefícios</span>
              <MultiSelect
                values={beneficiosSel}
                onChange={setBeneficiosSel}
                placeholder="Selecione os benefícios…"
                ariaLabel="Benefícios"
                options={beneficiosCat.map((b) => ({ value: b.nome, label: b.nome }))}
              />
            </label>
            {beneficiosSel.filter(precisaValorBeneficio).length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {beneficiosSel.filter(precisaValorBeneficio).map((nome) => (
                  <label key={nome} className="grid gap-1.5">
                    <span className="ds-label">Valor de {nome}</span>
                    <input
                      className="ds-input"
                      inputMode="decimal"
                      placeholder="Ex.: 500,00"
                      value={beneficiosValores[nome] ?? ""}
                      onChange={(e) =>
                        setBeneficiosValores((v) => ({ ...v, [nome]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}

            {/* Sinalização do que ainda falta (mesmos campos da régua unificada). Só cliente+cargo
                travam; o resto é pendência que segue para a esteira. */}
            {podeLiberar && pendentesNoModal.length > 0 && (
              <p className="rounded-xl border border-[var(--border)] bg-[rgba(201,138,18,0.1)] px-3 py-2 text-[12.5px] text-warn">
                Ainda pendente (não bloqueia, segue como pendência na esteira):{" "}
                {pendentesNoModal.join(", ")}.
              </p>
            )}
          </div>

          {modalErro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {modalErro}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            {/* Recusar: visível a todos, ATIVO só para Master/Super Admin (o backend também barra por
                @Roles). Consultor comum vê desabilitado. */}
            <Button
              variant="secondary"
              onClick={() => void recusar()}
              disabled={!isAdmin || liberando || acaoRecusa}
              title={isAdmin ? undefined : "Só Master ou Super Admin pode recusar."}
              className="!border-[rgba(214,69,69,0.4)] !text-danger"
            >
              {acaoRecusa ? "Recusando…" : "Recusar"}
            </Button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={fecharModal} disabled={liberando || acaoRecusa}>
                Cancelar
              </Button>
              <Button
                onClick={() => void liberar()}
                disabled={!podeLiberar || liberando || acaoRecusa}
              >
                {liberando ? "Liberando…" : "Liberar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal do LOTE: variante enxuta do individual, SÓ cliente + cargo. Os demais campos variam por
          pessoa e por isso não são preenchidos em massa: viram pendência individual na esteira.
          Também NÃO carrega o pacote de benefícios da memória do par (isso é do individual). */}
      {loteAberto && (
        <Modal
          onClose={fecharLote}
          ariaLabel="Liberar selecionadas"
          className="max-w-[560px] p-6"
        >
          <div className="mb-5">
            <div className="eyebrow !mb-1">Liberação em massa</div>
            <h2 className="font-display text-xl font-bold">
              {loteSelecionadasOk.length} pré-admiss{loteSelecionadasOk.length === 1 ? "ão" : "ões"}{" "}
              selecionada{loteSelecionadasOk.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-[13px] text-dim">
              Só cliente e cargo são obrigatórios. Tudo o que você preencher aqui é aplicado a todas as
              selecionadas; o que ficar em branco vira pendência individual de cada admissão na
              esteira.
            </p>
          </div>

          {/* TRAVA 1, duplicatas: listadas e bloqueadas. Seguem para tratamento individual. */}
          {loteDuplicatas.length > 0 && (
            <div className="mb-4 rounded-xl border border-[rgba(234,88,12,0.35)] bg-[rgba(234,88,12,0.12)] px-3 py-2 text-[12.5px] text-warn-2">
              <p className="font-semibold">
                {loteDuplicatas.length} selecionada{loteDuplicatas.length === 1 ? "" : "s"} não
                {loteDuplicatas.length === 1 ? " será liberada" : " serão liberadas"} em massa
                (possível duplicata):
              </p>
              <ul className="mt-1 list-disc pl-5">
                {loteDuplicatas.map((d) => (
                  <li key={d.admissaoId}>{d.candidatoNome}</li>
                ))}
              </ul>
              <p className="mt-1">
                Já existe admissão viva desse CPF. Libere uma a uma, conferindo antes se não é
                duplicata.
              </p>
            </div>
          )}

          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="ds-label">Cliente</span>
              <Select
                value={loteCodCliente}
                onChange={setLoteCodCliente}
                placeholder="Selecione o cliente…"
                ariaLabel="Cliente do lote"
                searchable
                menuFit
                options={clientes.map((c) => ({ value: c.codCliente, label: rotuloCliente(c) }))}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="ds-label">Cargo</span>
              <Select
                value={loteCargoId}
                onChange={setLoteCargoId}
                placeholder="Selecione o cargo…"
                ariaLabel="Cargo do lote"
                searchable
                menuFit
                options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </label>

            {/* MESMOS campos do individual, todos opcionais: o preenchido vale para as N do lote, o
                vazio vira pendência individual de cada admissão na esteira. */}
            <div className="grid grid-cols-2 gap-4">
              <label className="grid gap-1.5">
                <span className="ds-label">Salário</span>
                <input
                  className="ds-input"
                  inputMode="decimal"
                  placeholder="Ex.: 2.500,00"
                  value={loteSalario}
                  onChange={(e) => setLoteSalario(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Data de admissão</span>
                <input
                  type="date"
                  className="ds-input"
                  value={loteDataAdmissao}
                  onChange={(e) => setLoteDataAdmissao(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Tipo de contrato</span>
                <Select
                  value={loteTipoContrato}
                  onChange={setLoteTipoContrato}
                  placeholder="Selecione…"
                  ariaLabel="Tipo de contrato do lote"
                  options={TIPOS_CONTRATO.map((t) => ({ value: t, label: t }))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Escala</span>
                <Select
                  value={loteEscala}
                  onChange={setLoteEscala}
                  placeholder="Selecione…"
                  ariaLabel="Escala do lote"
                  searchable
                  menuFit
                  options={escalasCat.map((e) => ({ value: e.nome, label: e.nome }))}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Centro de custo</span>
                <input
                  className="ds-input"
                  value={loteCentroCusto}
                  onChange={(e) => setLoteCentroCusto(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Gestor / BP</span>
                <input
                  className="ds-input"
                  value={loteGestorBp}
                  onChange={(e) => setLoteGestorBp(e.target.value)}
                />
              </label>
            </div>

            {/* Benefícios: MESMA régua de valor do individual, pré-preenchidos pela memória do par
                cliente+cargo (o pacote costuma ser o mesmo para todas do lote), editáveis. */}
            <label className="grid gap-1.5">
              <span className="ds-label">Benefícios</span>
              <MultiSelect
                values={loteBeneficiosSel}
                onChange={setLoteBeneficiosSel}
                placeholder="Selecione os benefícios…"
                ariaLabel="Benefícios do lote"
                options={beneficiosCat.map((b) => ({ value: b.nome, label: b.nome }))}
              />
            </label>
            {loteBeneficiosSel.filter(precisaValorBeneficio).length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {loteBeneficiosSel.filter(precisaValorBeneficio).map((nome) => (
                  <label key={nome} className="grid gap-1.5">
                    <span className="ds-label">Valor de {nome}</span>
                    <input
                      className="ds-input"
                      inputMode="decimal"
                      placeholder="Ex.: 500,00"
                      value={loteBeneficiosValores[nome] ?? ""}
                      onChange={(e) =>
                        setLoteBeneficiosValores((v) => ({ ...v, [nome]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}

            {/* Mesma sinalização do individual: o que ficar vazio não bloqueia, segue como pendência
                de CADA uma das admissões do lote. */}
            {podeLiberarLote && lotePendentes.length > 0 && (
              <p className="rounded-xl border border-[var(--border)] bg-[rgba(201,138,18,0.1)] px-3 py-2 text-[12.5px] text-warn">
                Ainda pendente em cada uma das {loteSelecionadasOk.length} (não bloqueia, segue como
                pendência na esteira): {lotePendentes.join(", ")}.
              </p>
            )}
          </div>

          {/* TRAVA 2, par sem régua: o backend barra o lote ANTES de liberar qualquer uma, e a
              mensagem dele aparece aqui. Nenhuma admissão nasce sem checklist. */}
          {loteErro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {loteErro}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={fecharLote} disabled={loteEmCurso}>
              Cancelar
            </Button>
            <Button onClick={() => void liberarLote()} disabled={!podeLiberarLote || loteEmCurso}>
              {loteEmCurso
                ? "Liberando…"
                : `Liberar ${loteSelecionadasOk.length} selecionada${loteSelecionadasOk.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </Modal>
      )}

      {/* Relatório do lote: o que nasceu na esteira e o que falhou, candidato a candidato. */}
      {loteResultado && (
        <Modal
          onClose={() => setLoteResultado(null)}
          ariaLabel="Resultado da liberação em massa"
          className="max-w-[560px] p-6"
        >
          <div className="mb-4">
            <div className="eyebrow !mb-1">Liberação em massa</div>
            <h2 className="font-display text-xl font-bold">
              {loteResultado.liberadas.length} liberada
              {loteResultado.liberadas.length === 1 ? "" : "s"}
              {loteResultado.falhas.length > 0 ? `, ${loteResultado.falhas.length} com falha` : ""}
            </h2>
          </div>

          {loteResultado.liberadas.length > 0 && (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-[12.5px] text-ok">
              <p className="font-semibold">Entraram na esteira:</p>
              <ul className="mt-1 list-disc pl-5">
                {loteResultado.liberadas.map((l) => (
                  <li key={l.admissaoId}>{l.candidato}</li>
                ))}
              </ul>
            </div>
          )}

          {loteResultado.falhas.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger">
              <p className="font-semibold">Não liberadas (seguem na fila):</p>
              <ul className="mt-1 list-disc pl-5">
                {loteResultado.falhas.map((f, i) => (
                  <li key={`${f.candidato}-${i}`}>
                    {f.candidato}: {f.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button onClick={() => setLoteResultado(null)}>Fechar</Button>
          </div>
        </Modal>
      )}

      {/* Modal de detalhe da recusada: histórico (quem/quando) + reativar (só Master/Super Admin). */}
      {recusadaAlvo && (
        <Modal
          onClose={() => !acaoRecusa && setRecusadaAlvo(null)}
          ariaLabel="Admissão recusada"
          className="max-w-[460px] p-6"
        >
          <div className="mb-5">
            <div className="eyebrow !mb-1">Admissão recusada</div>
            <h2 className="font-display text-xl font-bold">{recusadaAlvo.candidatoNome}</h2>
            <p className="mt-0.5 font-mono text-[13px] text-dim">
              {fmtCpf(recusadaAlvo.candidatoCpf)}
            </p>
          </div>
          <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <span className="text-dim">Recusado por</span>
              <span className="font-semibold">{recusadaAlvo.recusadoPor ?? "não informado"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-dim">Recusado em</span>
              <span className="font-semibold">{fmtData(recusadaAlvo.recusadoEm)}</span>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRecusadaAlvo(null)} disabled={acaoRecusa}>
              Fechar
            </Button>
            <Button
              onClick={() => void reativarRecusada()}
              disabled={!isAdmin || acaoRecusa}
              title={isAdmin ? undefined : "Só Master ou Super Admin pode reativar."}
            >
              {acaoRecusa ? "Reativando…" : "Reativar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
