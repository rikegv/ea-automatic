"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { LojasDoLote, SeletorLoja } from "@/components/admin/SeletorLoja";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { VincularSalaModal, type Sugestao } from "@/components/liberacao/VincularSalaModal";
import { BlocoAltoVolume } from "@/components/alto-volume/BlocoAltoVolume";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import {
  LIBERACAO_POLL_MS,
  useLiberacaoCount,
  useLiberacaoRefresh,
} from "@/components/shell/LiberacaoAlerta";
import { criarPrecisaValor } from "@/lib/beneficios";
import { caixaAlta } from "@/lib/nome";
import { resolverPrePreenchimento } from "@/lib/pre-preenchimento-liberacao";
import {
  projetosDoCliente,
  sugerirProjetoPorPeriodo,
  type GrupoDoSeletor,
  type ProjetoDoSeletor,
} from "@/lib/alto-volume";
import {
  FAROL_GLOBAL_LABEL,
  isValidCpf,
  ITENS_EPI,
  ROTULO_ITEM_EPI,
  TAMANHOS_BOTA,
  TAMANHOS_CALCA,
  TAMANHOS_CAMISETA,
  type FarolGlobal,
  type ItemEpi,
} from "@ea/shared-types";

/**
 * Teto de caracteres da observação livre da liberação. ESPELHA `OBSERVACAO_LIBERACAO_MAX` do
 * backend (`admissoes/dto/observacao-liberacao.ts`), que é quem valida de verdade: aqui o número só
 * evita que o consultor digite um texto que voltaria recusado.
 */
const OBSERVACAO_MAX = 500;

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
  /** Só o catálogo de BENEFÍCIOS traz: a régua "precisa de valor?" agora vem do cadastro. */
  exigeValor?: boolean;
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
  /** Cliente e cargo JÁ atribuídos à admissão (hoje, quem os sugere é o match da Sala de Espera). */
  codCliente: string | null;
  cargoId: string | null;
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

/**
 * MEMÓRIA DO SETOR do par cliente+cargo (OST Onda 2): os setores DISTINTOS já usados naquele par,
 * que viram as opções do campo. Mesma rota do pacote padrão, então não custa requisição nova.
 * Falha silenciosa: sem memória o campo continua digitável, que é o comportamento de partida.
 */
async function buscarSetoresMemoria(
  token: string,
  codCliente: string,
  cargoId: string,
): Promise<string[]> {
  const r = await apiFetch<{ setores?: string[] }>(
    `/admissoes/padrao-cliente-cargo?codCliente=${encodeURIComponent(codCliente)}&cargoId=${encodeURIComponent(cargoId)}`,
    { token },
  );
  return r.setores ?? [];
}

/**
 * MEMÓRIA DE UNIFORME E EPI do par cliente+cargo (OST Onda 3, item 1). SÓ o "possui sim/não": o
 * tamanho é individual e nunca vem sugerido (decisão do diretor). Mesma rota das outras memórias.
 */
async function buscarUniformeEpiMemoria(
  token: string,
  codCliente: string,
  cargoId: string,
): Promise<{ possuiUniforme: boolean | null; possuiEpi: boolean | null }> {
  const r = await apiFetch<{ possuiUniforme?: boolean | null; possuiEpi?: boolean | null }>(
    `/admissoes/padrao-cliente-cargo?codCliente=${encodeURIComponent(codCliente)}&cargoId=${encodeURIComponent(cargoId)}`,
    { token },
  );
  return { possuiUniforme: r.possuiUniforme ?? null, possuiEpi: r.possuiEpi ?? null };
}
/**
 * Opção "em branco" dos dropdowns OPCIONAIS da liberação (decisão do diretor). Sem ela, um campo
 * pré-preenchido pela memória do par cliente+cargo não tinha como voltar a vazio, e o consultor era
 * obrigado a liberar com um valor que podia estar errado. Selecionar esta opção ESVAZIA o campo, que
 * então segue como pendência individual na esteira (regra 5, não-bloqueio).
 *
 * NÃO se aplica a cliente e cargo: são a trava da liberação, obrigatórios.
 */
const OPCAO_EM_BRANCO = { value: "", label: "Não informado" };

/**
 * Par Sim/Não do uniforme e do EPI (OST Onda 3, item 1). `null` é estado legítimo e visível: é o
 * "ainda não respondido", que no uniforme é a própria pendência obrigatória. Por isso não é
 * checkbox (que só sabe dois estados) nem select (que esconde a resposta atrás de um clique).
 */
function SimNao({
  valor,
  onChange,
  aria,
}: {
  valor: boolean | null;
  onChange: (v: boolean) => void;
  aria: string;
}) {
  const base = "rounded-full border px-3.5 py-1 text-[12.5px] transition";
  return (
    <div className="flex gap-1.5" role="group" aria-label={aria}>
      <button
        type="button"
        aria-pressed={valor === true}
        onClick={() => onChange(true)}
        className={cn(
          base,
          valor === true
            ? "border-[rgba(46,158,99,0.5)] bg-[rgba(46,158,99,0.14)] text-ok"
            : "border-[var(--border)] text-dim hover:text-text",
        )}
      >
        Sim
      </button>
      <button
        type="button"
        aria-pressed={valor === false}
        onClick={() => onChange(false)}
        className={cn(
          base,
          valor === false
            ? "border-[var(--border)] bg-[rgba(255,255,255,0.06)] text-text"
            : "border-[var(--border)] text-dim hover:text-text",
        )}
      >
        Não
      </button>
    </div>
  );
}

/** Valores do pacote no formato do input (pt-BR), só para os benefícios que têm valor na memória. */
function valoresDoPacote(pacote: { nome: string; valor: number | null }[]): Record<string, string> {
  return Object.fromEntries(
    pacote.filter((b) => b.valor !== null).map((b) => [b.nome, b.valor!.toFixed(2).replace(".", ",")]),
  );
}
// MÁSCARA de moeda pt-BR (Bloco 3): a PRIMEIRA barreira. Guarda só dígitos e formata como centavos,
// então valor inválido (letras, "R$", pontuação solta) nem consegue ser digitado. Ex.: "250000" vira
// "2.500,00". A normalização do backend (autoridade) é a barreira final.
function maskMoedaBR(raw: string): string {
  const digitos = raw.replace(/\D/g, "");
  if (!digitos) return "";
  const n = Number(digitos) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Salário em pt-BR ("2.500,00") → string numérica que o Postgres aceita ("2500.00"). Espelha o backend
// (ponto milhar, vírgula decimal, tolera "R$"/espaço) para defesa em profundidade; a máscara acima já
// garante o formato limpo, e o backend valida de novo de qualquer forma.
function salarioParaNumero(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const limpo = t
    .replace(/r\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return limpo || undefined;
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
  const { token, isAdmin, temMenu } = useAuth();
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
  // "Precisa de valor?" derivado do CADASTRO (coluna `exige_valor`), não do texto do nome. Mesma
  // régua que o backend valida, então renomear um benefício não muda mais a exigência.
  const precisaValorBeneficio = useMemo(() => criarPrecisaValor(beneficiosCat), [beneficiosCat]);
  // Modal de liberação: a pré-admissão alvo (null = fechado) + os campos do formulário.
  const [alvo, setAlvo] = useState<PreAdmissao | null>(null);
  /**
   * SALA DE ESPERA (onda 3): estado PRÓPRIO do vínculo, em três peças que não se misturam com nada
   * do formulário de liberação.
   *  - `salaTriagem`: o passo do vínculo, com o candidato da linha e o que a Sala já devolveu. Só
   *    existe quando a busca ACHOU alguém; sem ninguém esperando, a liberação abre direto.
   *  - `salaVinculada`: a marca do que foi vinculado, para o consultor ver dentro da liberação.
   *  - `buscandoSala`: o id em consulta, que segura o botão daquela linha durante a busca.
   */
  const [salaTriagem, setSalaTriagem] = useState<{ r: PreAdmissao; sugestoes: Sugestao[] } | null>(
    null,
  );
  const [salaVinculada, setSalaVinculada] = useState<string | null>(null);
  const [buscandoSala, setBuscandoSala] = useState<string | null>(null);
  const [codCliente, setCodCliente] = useState("");
  // LOJA (etapa 3): individual, um valor; no LOTE, um por admissão (Q9). Quem limpa ao trocar
  // de cliente é o próprio `SeletorLoja`, para a regra viver num lugar só.
  const [lojaId, setLojaId] = useState<string | undefined>(undefined);
  const [lojasDoLote, setLojasDoLote] = useState<Record<string, string | undefined>>({});
  const [cargoId, setCargoId] = useState("");
  // Campos obrigatórios (régua unificada §A.19), todos opcionais na liberação — só cliente+cargo travam.
  const [salario, setSalario] = useState("");
  const [tipoContrato, setTipoContrato] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [escala, setEscala] = useState("");
  const [centroCusto, setCentroCusto] = useState("");
  // SETOR e DEPARTAMENTO (OST Onda 2): TRÊS campos distintos que a operação usa junto. O
  // Departamento existia no banco e no lápis, mas nunca teve caixa aqui; o Setor é novo.
  const [setor, setSetor] = useState("");
  const [departamento, setDepartamento] = useState("");
  /** Setores já usados no par cliente+cargo: viram as opções do datalist (memória dinâmica). */
  const [setoresMemoria, setSetoresMemoria] = useState<string[]>([]);
  const [gestorBp, setGestorBp] = useState("");
  /**
   * UNIFORME (OST Onda 3, item 1). `null` = ainda não respondido, que é a PENDÊNCIA OBRIGATÓRIA e
   * trava o botão Liberar. Responder "não" libera igual: o que se cobra é a resposta, não o uniforme.
   * Os tamanhos só existem no "sim" e são sempre em branco (tamanho é individual, sem memória).
   */
  /**
   * VÍNCULOS do cliente escolhido (OST Onda 3, item 7, Bloco 5). Com dois ou mais, o consultor tem
   * de dizer QUAL contrato, senão a admissão nasceria com a régua documental do contrato errado.
   * Com um só (233 dos 234 clientes), a lista some da tela e nada é perguntado.
   */
  const [vinculos, setVinculos] = useState<{ id: string; rotulo: string }[]>([]);
  const [vinculoSel, setVinculoSel] = useState("");
  /**
   * SEXO do candidato (OST do seletor de sexo). Vazio quando ninguém informou; o valor do Pandapé
   * pré-preenche na abertura do modal. Muda QUAIS DOCUMENTOS a régua exige (o Reservista só vale
   * para o masculino), então não é campo cosmético.
   */
  const [sexo, setSexo] = useState("");
  const [possuiUniforme, setPossuiUniforme] = useState<boolean | null>(null);
  const [uniCamiseta, setUniCamiseta] = useState("");
  const [uniCalca, setUniCalca] = useState("");
  const [uniBota, setUniBota] = useState("");
  /** EPI: mesma mecânica do uniforme, MENOS a obrigatoriedade (não trava liberação). */
  const [possuiEpi, setPossuiEpi] = useState<boolean | null>(null);
  const [epiItens, setEpiItens] = useState<string[]>([]);
  const [epiOutros, setEpiOutros] = useState("");
  // Observação LIVRE (Bloco 2): o que não cabe em campo estruturado ("VT possui 6% de desconto").
  // Opcional, não bloqueia e não vira pendência; aparece depois no modal do olho (Bloco 3).
  const [observacao, setObservacao] = useState("");
  /**
   * ALTO VOLUME (onda 2). O catálogo de projetos é carregado UMA vez e serve os dois modais; o resto
   * é escolha por modal.
   *
   * `altoVolumeLigado` nasce SEMPRE desligado, inclusive quando o período sugere um projeto. Ligar
   * sozinho seria escrever um vínculo que ninguém pediu, e o vínculo é a fonte definitiva do projeto:
   * a sugestão pré-escolhe o projeto DENTRO do bloco e avisa na tela, mas quem liga é o consultor.
   */
  const [projetosAv, setProjetosAv] = useState<ProjetoDoSeletor[]>([]);
  const [avLigado, setAvLigado] = useState(false);
  const [avProjetoSel, setAvProjetoSel] = useState("");
  const [avGrupoSel, setAvGrupoSel] = useState("");
  const [avGrupos, setAvGrupos] = useState<GrupoDoSeletor[]>([]);
  // Pacote de benefícios (REUSA a régua de valor de lib/beneficios): nomes selecionados + valor por nome.
  const [beneficiosSel, setBeneficiosSel] = useState<string[]>([]);
  const [beneficiosValores, setBeneficiosValores] = useState<Record<string, string>>({});
  const [liberando, setLiberando] = useState(false);
  const [modalErro, setModalErro] = useState<string | null>(null);
  /**
   * ALERTA DE CPF DUPLICADO (item 3 da OST dos 3 ajustes). O backend consulta AO VIVO se o CPF já
   * tem admissão em andamento e devolve 409 `needsConfirmation` com a lista. Não é erro: é decisão
   * do consultor, então vira painel de confirmação e não mensagem vermelha.
   */
  const [dupAviso, setDupAviso] = useState<{
    message: string;
    vivas: { cliente: string; cargo: string; situacao: string }[];
  } | null>(null);
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
  const [loteSetor, setLoteSetor] = useState("");
  const [loteDepartamento, setLoteDepartamento] = useState("");
  // Observação LIVRE do LOTE (Bloco 2): mesma regra dos demais campos, o preenchido vale para as N.
  const [loteObservacao, setLoteObservacao] = useState("");
  // ALTO VOLUME no LOTE: o caso principal da frente, porque projeto sazonal entra em leva. Mesmo
  // conjunto do individual, e o projeto escolhido vale para TODAS as N, como os demais campos do lote.
  const [loteAvLigado, setLoteAvLigado] = useState(false);
  const [loteAvProjetoSel, setLoteAvProjetoSel] = useState("");
  const [loteAvGrupoSel, setLoteAvGrupoSel] = useState("");
  const [loteAvGrupos, setLoteAvGrupos] = useState<GrupoDoSeletor[]>([]);
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

  /**
   * ALTO VOLUME (onda 2): catálogo de projetos, carregado UMA vez.
   *
   * EFEITO PRÓPRIO, DE PROPÓSITO, e não uma sétima chamada no `Promise.all` do `load`: lá qualquer
   * falha derruba a carga inteira, e a fila de liberação é tela crítica. Aqui a falha cai no
   * `catch`, a lista fica vazia e o único efeito é o bloco do Alto Volume não aparecer. Uma frente
   * nova não pode ter poder de derrubar a liberação.
   *
   * A leitura do CRUD nasce aberta a qualquer autenticado (onda 1), então o consultor COMUM enxerga
   * o seletor sem tomar 403, mesmo sem ter o menu do Alto Volume.
   */
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    apiFetch<ProjetoDoSeletor[]>("/admin/alto-volume", { token })
      .then((ps) => {
        if (vivo) setProjetosAv(ps);
      })
      .catch(() => setProjetosAv([]));
    return () => {
      vivo = false;
    };
  }, [token]);

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
    // Memória do SETOR: independente do pacote, então roda em paralelo e não depende de haver
    // benefício naquele par. Sem memória, a lista fica vazia e o campo segue digitável.
    buscarSetoresMemoria(token, codCliente, cargoId)
      .then((setores) => {
        if (vivo) setSetoresMemoria(setores);
      })
      .catch(() => setSetoresMemoria([]));
    buscarPacotePadrao(token, codCliente, cargoId)
      .then((pacote) => {
        if (!vivo || pacote.length === 0) return;
        setBeneficiosSel(pacote.map((b) => b.nome));
        setBeneficiosValores(valoresDoPacote(pacote));
      })
      .catch(() => {
        /* memória é sugestão; falha não bloqueia a liberação */
      });
    // Vínculos do cliente (item 7): define se a tela precisa perguntar o contrato.
    apiFetch<{ id: string; rotulo: string; ativo: boolean }[]>(
      `/admin/clientes/${encodeURIComponent(codCliente)}/vinculos`,
      { token },
    )
      .then((vs) => {
        if (!vivo) return;
        const ativos = vs.filter((v) => v.ativo);
        setVinculos(ativos);
        // Um vínculo só não é escolha: a tela não pergunta e o backend resolve pelo cliente.
        setVinculoSel(ativos.length >= 2 ? "" : "");
      })
      .catch(() => setVinculos([]));
    // Uniforme e EPI: SÓ o "possui" vem da memória do par. Sugestão, não imposição: o consultor
    // troca a resposta se aquele candidato for exceção. Sem memória, segue sem resposta.
    buscarUniformeEpiMemoria(token, codCliente, cargoId)
      .then((m) => {
        if (!vivo) return;
        if (m.possuiUniforme !== null) setPossuiUniforme((v) => (v === null ? m.possuiUniforme : v));
        if (m.possuiEpi !== null) setPossuiEpi((v) => (v === null ? m.possuiEpi : v));
      })
      .catch(() => {
        /* memória é sugestão; sem ela a resposta simplesmente nasce em branco */
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
    buscarSetoresMemoria(token, loteCodCliente, loteCargoId)
      .then((setores) => {
        if (vivo) setSetoresMemoria(setores);
      })
      .catch(() => setSetoresMemoria([]));
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

  /**
   * Abre o modal de liberação. O parâmetro `pre` é ADITIVO (§A.26) e existe por um motivo só: o
   * vínculo com a Sala precisa entregar cliente e cargo JÁ preenchidos, e é aqui que os campos
   * nascem. SEM ele a função se comporta exatamente como antes, porque cada campo cai no mesmo
   * `""` de sempre: o caminho normal da liberação (clicar e liberar, sem vínculo) não muda.
   */
  function abrirModal(r: PreAdmissao, pre?: { codCliente?: string; cargoId?: string }) {
    setAlvo(r);
    // Estado PRÓPRIO do vínculo, zerado junto: a marca é de um candidato, não da tela.
    setSalaVinculada(null);
    // SEXO (OST do seletor de sexo): o que veio do Pandapé PRÉ-PREENCHE o seletor, e o consultor
    // pode trocar. Não é trava: o valor do Pandapé pode estar errado, foi o que travou um prontuário
    // de verdade (candidata gravada como masculino, Reservista virando obrigatório).
    setSexo(r.sexo ?? "");
    // A regra de QUEM VENCE mora em `lib/pre-preenchimento-liberacao` e é testada lá: foi neste
    // ponto que o auto-preenchimento da Sala se perdeu (gravava no banco e a tela abria vazia).
    const sugerido = resolverPrePreenchimento(r, pre);
    setCodCliente(sugerido.codCliente);
    setCargoId(sugerido.cargoId);
    setSalario("");
    setTipoContrato("");
    setDataAdmissao("");
    setEscala("");
    setCentroCusto("");
    setGestorBp("");
    setSetor("");
    setDepartamento("");
    setObservacao("");
    setBeneficiosSel([]);
    setBeneficiosValores({});
    // Uniforme e EPI nascem SEM resposta a cada candidato: a memória do par só entra quando
    // cliente+cargo forem escolhidos, e o tamanho nunca é herdado de ninguém.
    setVinculos([]);
    setVinculoSel("");
    setPossuiUniforme(null);
    setUniCamiseta("");
    setUniCalca("");
    setUniBota("");
    setPossuiEpi(null);
    setEpiItens([]);
    setEpiOutros("");
    // ALTO VOLUME (onda 2): zerado a cada candidato, pelo mesmo motivo do vínculo e do uniforme. O
    // projeto é escolha DESTA admissão, e herdar a do candidato anterior é como um vínculo nasce
    // errado sem ninguém perceber. A sugestão por período reescolhe sozinha, se for o caso.
    setAvLigado(false);
    setAvProjetoSel("");
    setAvGrupoSel("");
    setAvGrupos([]);
    setModalErro(null);
    setDupAviso(null);
  }
  function fecharModal() {
    if (liberando) return;
    setDupAviso(null);
    setAlvo(null);
  }

  /**
   * O CLIQUE DA LINHA (botão "Liberar Admissão"). Um clique só, e o caminho se decide sozinho:
   *  - quem NÃO tem o menu da Sala nem consulta nada e cai direto na liberação, como sempre foi;
   *  - com o menu, o sistema procura na Sala pelo CPF, nome e telefone do candidato. ACHOU alguém,
   *    mostra o passo do vínculo; não achou, abre a liberação direto.
   *
   * A SALA NUNCA TRAVA A LIBERAÇÃO (§A.26): falha de rede, erro ou lista vazia caem todos no mesmo
   * lugar, que é abrir o modal de liberação exatamente como antes desta OST. O vínculo é ajuda, e
   * ajuda que quebra o fluxo crítico não é ajuda.
   */
  async function abrirLiberacao(r: PreAdmissao) {
    if (!temMenu("sala-espera")) {
      abrirModal(r);
      return;
    }
    setBuscandoSala(r.admissaoId);
    try {
      const p = new URLSearchParams();
      if (r.candidatoCpf) p.set("cpf", r.candidatoCpf);
      if (r.candidatoNome) p.set("nome", r.candidatoNome);
      if (r.telefone) p.set("telefone", r.telefone);
      const achados = await apiFetch<Sugestao[]>(`/sala-espera/match?${p.toString()}`, { token });
      if (achados.length > 0) {
        setSalaTriagem({ r, sugestoes: achados });
        return;
      }
    } catch {
      /* Sala indisponível não impede liberar: segue para o modal de sempre. */
    } finally {
      setBuscandoSala(null);
    }
    abrirModal(r);
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

  /**
   * `aceiteDuplicidade` só vem `true` no REENVIO, depois de o consultor ler o painel de duplicidade
   * e confirmar. A primeira tentativa nunca o manda, senão a trava do backend nasceria morta.
   */
  async function liberar(aceiteDuplicidade = false) {
    if (!alvo || !codCliente || !cargoId) return;
    setLiberando(true);
    setModalErro(null);
    setDupAviso(null);
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
            // LOJA (etapa 3): só vai quando o cliente tem lojas e uma foi escolhida.
            lojaId: lojaId || undefined,
            tipoContrato: tipoContrato || undefined,
            dataAdmissao: dataAdmissao || undefined,
            vagaFolha: {
              salario: salarioParaNumero(salario),
              escala: escala || undefined,
              centroCusto: centroCusto || undefined,
              setor: setor || undefined,
              departamento: departamento || undefined,
              gestorBp: gestorBp || undefined,
            },
            pacoteBeneficios: pacoteBeneficios.length ? pacoteBeneficios : undefined,
            // Observação livre (Bloco 2): só vai quando tem conteúdo; vazia é `undefined`.
            observacaoLiberacao: observacao.trim() || undefined,
            // VÍNCULO (item 7): só vai quando o cliente tem mais de um contrato.
            clienteVinculoId: exigeVinculo ? vinculoSel : undefined,
            // SEXO: vai quando há valor (confirmado do Pandapé ou escolhido agora). Em branco não
            // vai, e sexo ausente segue não cobrando Reservista de ninguém.
            sexo: sexo || undefined,
            // Só viaja no reenvio confirmado; `false` fica de fora para não sujar o payload.
            aceiteDuplicidade: aceiteDuplicidade || undefined,
            // ALTO VOLUME (onda 2): só viaja com o FLAG LIGADO. Desligado manda `undefined`, o
            // backend não recebe projeto, não valida e não grava vínculo, e a liberação sai byte a
            // byte igual à de antes desta onda. O grupo é opcional mesmo com o projeto escolhido.
            projetoId: avLigado ? avProjetoSel || undefined : undefined,
            grupoEntradaId: avLigado && avProjetoSel ? avGrupoSel || undefined : undefined,
            // UNIFORME: a resposta é obrigatória (o botão nem habilita sem ela). Tamanho só no "sim";
            // o backend também limpa, então "não possui" nunca carrega tamanho de ninguém.
            uniforme: {
              possui: possuiUniforme === true,
              camiseta: possuiUniforme ? uniCamiseta || undefined : undefined,
              calca: possuiUniforme ? uniCalca || undefined : undefined,
              bota: possuiUniforme ? uniBota || undefined : undefined,
            },
            // EPI: opcional de ponta a ponta. Só vai quando o consultor respondeu alguma coisa.
            epi:
              possuiEpi === null
                ? undefined
                : {
                    possui: possuiEpi,
                    itens: possuiEpi ? epiItens : undefined,
                    outros: possuiEpi && epiItens.includes("OUTROS") ? epiOutros.trim() : undefined,
                  },
          },
        },
      );
      const nomeExibicao = caixaAlta(alvo.candidatoNome);
      setOkMsg(
        r.temRegua
          ? `${nomeExibicao} liberado. A admissão entrou na esteira com a régua documental do par.`
          : `${nomeExibicao} liberado e na esteira. Atenção: este par cliente e cargo não tem régua documental cadastrada, então a admissão nasceu sem checklist de documentos.`,
      );
      setAlvo(null);
      await load();
      refreshBadge(); // saiu da fila: badge cai na hora.
    } catch (e) {
      // DUPLICIDADE DE CPF: não é falha, é pergunta. Abre o painel de confirmação em vez do erro.
      const data =
        e instanceof ApiError && typeof e.data === "object" && e.data
          ? (e.data as {
              message?: string;
              reason?: string;
              vivas?: { cliente: string; cargo: string; situacao: string }[];
            })
          : null;
      if (data?.reason === "cpfDuplicado") {
        setDupAviso({
          message: data.message ?? "Já existe admissão em andamento para este CPF.",
          vivas: data.vivas ?? [],
        });
        setLiberando(false);
        return;
      }
      const msg = data
        ? (data.message ?? (e as ApiError).message)
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
      setOkMsg(`${caixaAlta(alvo.candidatoNome)} recusado. Movido para "Admissões Recusadas".`);
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
      setOkMsg(`${caixaAlta(recusadaAlvo.candidatoNome)} reativado. Voltou para "Aguardando".`);
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

  /**
   * FRENTE A do item 9: CPF com dígito verificador que não fecha NÃO é liberado. O CPF vem do
   * Pandapé e a liberação é a porta de entrada da esteira, então é aqui que o erro de digitação para,
   * antes de contaminar régua, Drive, kit e assinatura. A autoridade é o backend (que barra a chamada
   * direta); aqui a trava é para o consultor ver o motivo antes de clicar.
   */
  const cpfAlvoInvalido = Boolean(alvo && !isValidCpf(alvo.candidatoCpf));
  /**
   * "Outros" marcado no EPI exige dizer QUAL é o item (o backend recusa sem isso). Não é regra nova:
   * é a mesma do benefício que exige valor, o que foi escolhido tem de ficar completo.
   */
  const epiOutrosFaltando = epiItens.includes("OUTROS") && epiOutros.trim() === "";
  /** Cliente de dois contratos exige a escolha; de um contrato só, nem aparece na tela. */
  const exigeVinculo = vinculos.length >= 2;

  // ── ALTO VOLUME (onda 2), individual ──────────────────────────────────────
  /** Projetos ATIVOS deste cliente. Vazio faz o bloco inteiro sumir, como no seletor de contrato. */
  const avProjetos = useMemo(
    () => projetosDoCliente(projetosAv, codCliente),
    [projetosAv, codCliente],
  );
  const avDisponivel = avProjetos.length > 0;
  /** SUGESTÃO por período: qual projeto cobre a data de admissão digitada. Só sugere. */
  const avSugerido = useMemo(
    () => sugerirProjetoPorPeriodo(avProjetos, dataAdmissao),
    [avProjetos, dataAdmissao],
  );

  /**
   * Mantém a escolha COERENTE com o cliente do modal. Trocar o cliente invalida o projeto escolhido
   * (ele é de outro cliente), e cliente sem projeto tem de DESLIGAR o flag: um flag ligado num bloco
   * que não está mais na tela travaria o botão de liberar sem o consultor ter como ver o motivo.
   */
  useEffect(() => {
    if (!avDisponivel) {
      setAvLigado(false);
      setAvProjetoSel("");
      setAvGrupoSel("");
      return;
    }
    if (avProjetoSel && !avProjetos.some((p) => p.id === avProjetoSel)) {
      setAvProjetoSel("");
      setAvGrupoSel("");
    }
  }, [avDisponivel, avProjetos, avProjetoSel]);

  /** A sugestão só PREENCHE o vazio: escolha já feita pelo consultor nunca é sobrescrita. */
  useEffect(() => {
    if (!avSugerido) return;
    setAvProjetoSel((atual) => atual || avSugerido);
  }, [avSugerido]);

  /** Grupos do projeto escolhido. Falha aqui deixa a lista vazia, e o grupo é opcional mesmo. */
  useEffect(() => {
    setAvGrupoSel("");
    if (!token || !avProjetoSel) {
      setAvGrupos([]);
      return;
    }
    let vivo = true;
    apiFetch<{ grupos: GrupoDoSeletor[] }>(
      `/admin/alto-volume/${encodeURIComponent(avProjetoSel)}`,
      { token },
    )
      .then((p) => {
        if (vivo) setAvGrupos(p.grupos ?? []);
      })
      .catch(() => setAvGrupos([]));
    return () => {
      vivo = false;
    };
  }, [token, avProjetoSel]);

  const podeLiberar =
    Boolean(codCliente && cargoId) &&
    !cpfAlvoInvalido &&
    possuiUniforme !== null &&
    !epiOutrosFaltando &&
    (!exigeVinculo || Boolean(vinculoSel)) &&
    // ALTO VOLUME (onda 2): UM TERMO A MAIS, na forma exata do vínculo logo acima. Com o flag
    // desligado o termo é `true` e o gate segue com o mesmo significado que tinha; ligado, ele passa
    // a exigir o projeto, porque flag ligado sem projeto não é vínculo nenhum.
    (!avLigado || Boolean(avProjetoSel));

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
    setLoteSetor("");
    setLoteDepartamento("");
    setLoteObservacao("");
    setLoteBeneficiosSel([]);
    setLoteBeneficiosValores({});
    // ALTO VOLUME no lote: zerado a cada abertura, como todo o resto do modal.
    setLoteAvLigado(false);
    setLoteAvProjetoSel("");
    setLoteAvGrupoSel("");
    setLoteAvGrupos([]);
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
          // LOJA POR LINHA (Q9): a ÚNICA coisa do lote que não é um valor só para todos. Vão só os
          // pares preenchidos; quem ficou sem loja segue como pendência individual, igual a qualquer
          // campo em branco do lote.
          lojasPorAdmissao: loteSelecionadasOk
            .map((x) => ({ admissaoId: x.admissaoId, lojaId: lojasDoLote[x.admissaoId] }))
            .filter((x): x is { admissaoId: string; lojaId: string } => Boolean(x.lojaId)),
          // O preenchido vale para TODAS as N; o vazio segue como pendência individual de cada uma.
          tipoContrato: loteTipoContrato || undefined,
          dataAdmissao: loteDataAdmissao || undefined,
          vagaFolha: {
            salario: salarioParaNumero(loteSalario),
            escala: loteEscala || undefined,
            centroCusto: loteCentroCusto || undefined,
            setor: loteSetor || undefined,
            departamento: loteDepartamento || undefined,
            gestorBp: loteGestorBp || undefined,
          },
          pacoteBeneficios: lotePacote.length ? lotePacote : undefined,
          // Observação livre (Bloco 2): a MESMA para todas as N, como os demais campos do lote.
          observacaoLiberacao: loteObservacao.trim() || undefined,
          // ALTO VOLUME (onda 2): mesma regra do individual, e o projeto vale para TODAS as N.
          projetoId: loteAvLigado ? loteAvProjetoSel || undefined : undefined,
          grupoEntradaId:
            loteAvLigado && loteAvProjetoSel ? loteAvGrupoSel || undefined : undefined,
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

  // Ordenação clicável (OST visual, leva das 11 tabelas), uma instância por tabela.
  //
  // "Parado (dias)" e "Parado (horas)" são a MESMA grandeza em unidades diferentes, e as duas são
  // derivadas de `criadoEm`. Ordenar pelo texto exibido mentiria ("10 dias" viria antes de "5 dias"
  // e "9:00" antes de "36:30"), então as duas ordenam pelo tempo parado em ms. Como número, o
  // primeiro clique traz o MAIOR primeiro, que é quem está esperando há mais tempo.
  // Chegada é data e traz o mais recente primeiro. Checkbox e Ação ficam de fora: são controle.
  const colunasFila = useMemo<ColOrd<PreAdmissao>[]>(
    () => [
      { chave: "candidato", tipo: "texto", valor: (r) => r.candidatoNome },
      { chave: "cpf", tipo: "texto", valor: (r) => r.candidatoCpf },
      { chave: "telefone", tipo: "texto", valor: (r) => r.telefone },
      { chave: "nascimento", tipo: "data", valor: (r) => r.dataNascimento },
      { chave: "sexo", tipo: "texto", valor: (r) => (r.sexo ? (ROTULO_SEXO[r.sexo] ?? r.sexo) : null) },
      { chave: "chegada", tipo: "data", valor: (r) => r.criadoEm },
      { chave: "paradoDias", tipo: "numero", valor: (r) => paradoMs(r.criadoEm, nowMs) },
      { chave: "paradoHoras", tipo: "numero", valor: (r) => paradoMs(r.criadoEm, nowMs) },
    ],
    [nowMs],
  );
  const ordFila = useOrdenacao(colunasFila, rowsFiltradas);

  const colunasRecusadas = useMemo<ColOrd<Recusada>[]>(
    () => [
      { chave: "candidato", tipo: "texto", valor: (r) => r.candidatoNome },
      { chave: "cpf", tipo: "texto", valor: (r) => r.candidatoCpf },
      { chave: "telefone", tipo: "texto", valor: (r) => r.telefone },
      { chave: "recusadoPor", tipo: "texto", valor: (r) => r.recusadoPor },
      { chave: "recusadoEm", tipo: "data", valor: (r) => r.recusadoEm },
    ],
    [],
  );
  const ordRecusadas = useOrdenacao(colunasRecusadas, recusadasFiltradas);

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
  // CPF inválido (item 9, Frente A): sai do lote pelo mesmo mecanismo da duplicata. Uma linha errada
  // não derruba as outras N, e o nome dela aparece no modal para o Master saber quem corrigir.
  const loteCpfInvalido = selecionadasObjs.filter(
    (r) => !r.possivelDuplicata && !isValidCpf(r.candidatoCpf),
  );
  const loteSelecionadasOk = selecionadasObjs.filter(
    (r) => !r.possivelDuplicata && isValidCpf(r.candidatoCpf),
  );
  // ── ALTO VOLUME (onda 2), LOTE. Mesmas quatro regras do individual, sobre o cliente do lote. ──
  const loteAvProjetos = useMemo(
    () => projetosDoCliente(projetosAv, loteCodCliente),
    [projetosAv, loteCodCliente],
  );
  const loteAvDisponivel = loteAvProjetos.length > 0;
  const loteAvSugerido = useMemo(
    () => sugerirProjetoPorPeriodo(loteAvProjetos, loteDataAdmissao),
    [loteAvProjetos, loteDataAdmissao],
  );

  useEffect(() => {
    if (!loteAvDisponivel) {
      setLoteAvLigado(false);
      setLoteAvProjetoSel("");
      setLoteAvGrupoSel("");
      return;
    }
    if (loteAvProjetoSel && !loteAvProjetos.some((p) => p.id === loteAvProjetoSel)) {
      setLoteAvProjetoSel("");
      setLoteAvGrupoSel("");
    }
  }, [loteAvDisponivel, loteAvProjetos, loteAvProjetoSel]);

  useEffect(() => {
    if (!loteAvSugerido) return;
    setLoteAvProjetoSel((atual) => atual || loteAvSugerido);
  }, [loteAvSugerido]);

  useEffect(() => {
    setLoteAvGrupoSel("");
    if (!token || !loteAvProjetoSel) {
      setLoteAvGrupos([]);
      return;
    }
    let vivo = true;
    apiFetch<{ grupos: GrupoDoSeletor[] }>(
      `/admin/alto-volume/${encodeURIComponent(loteAvProjetoSel)}`,
      { token },
    )
      .then((p) => {
        if (vivo) setLoteAvGrupos(p.grupos ?? []);
      })
      .catch(() => setLoteAvGrupos([]));
    return () => {
      vivo = false;
    };
  }, [token, loteAvProjetoSel]);

  const podeLiberarLote =
    Boolean(loteCodCliente && loteCargoId && loteSelecionadasOk.length > 0) &&
    // MESMO termo a mais do individual (§A.26: acrescenta, não muda o que já existia).
    (!loteAvLigado || Boolean(loteAvProjetoSel));

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
    !loteSetor && "Setor",
    !loteGestorBp && "Gestor / BP",
  ].filter(Boolean) as string[];

  const pendentesNoModal = [
    // Uniforme NÃO entra nesta lista: ela é o aviso do que segue pendente DEPOIS de liberar, e o
    // uniforme não passa daqui sem resposta (é trava, não pendência que segue para a esteira).
    !salario && "Salário",
    !tipoContrato && "Tipo de contrato",
    !dataAdmissao && "Data de admissão",
    beneficiosSel.length === 0 && "Pacote de benefícios",
    !escala && "Escala",
    !centroCusto && "Centro de custo",
    !setor && "Setor",
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
            <table className="ds-table min-w-[1034px]">
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
                  <ColunaOrdenavel as="th" ord={ordFila} chave="candidato">
                    Candidato
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordFila} chave="cpf" className="w-[150px]">
                    CPF
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordFila} chave="telefone" className="w-[140px]">
                    Telefone
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordFila} chave="nascimento" className="w-[135px]">
                    Nascimento
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordFila} chave="sexo" className="w-[110px]">
                    Sexo
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordFila} chave="chegada" className="w-[125px]">
                    Chegada
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordFila} chave="paradoDias" className="w-[130px]">
                    Parado (dias)
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordFila} chave="paradoHoras" className="w-[140px]">
                    Parado (horas)
                  </ColunaOrdenavel>
                  {/* Largura medida no rótulo mais longo do botão, "Liberar Admissão", que cabe em
                      UMA linha (§A.20). */}
                  <th className="w-[210px]">Ação</th>
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
                  ordFila.itens.map((r) => (
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
                          {/* Bloco 1 da OST: caixa alta de exibição (o banco segue como veio). */}
                          {caixaAlta(r.candidatoNome)}
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
                        {/* UM CLIQUE: procura na Sala e segue para a liberação, com ou sem vínculo.
                            O rótulo diz o que o botão entrega (a liberação da admissão), não a
                            etapa intermediária, que pode nem existir. */}
                        <Button
                          onClick={() => void abrirLiberacao(r)}
                          className="w-full whitespace-nowrap py-2"
                          disabled={buscandoSala === r.admissaoId}
                        >
                          {buscandoSala === r.admissaoId ? "Abrindo…" : "Liberar Admissão"}
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
                  <ColunaOrdenavel as="th" ord={ordRecusadas} chave="candidato">
                    Candidato
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordRecusadas} chave="cpf" className="w-[150px]">
                    CPF
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordRecusadas} chave="telefone" className="w-[140px]">
                    Telefone
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordRecusadas} chave="recusadoPor" className="w-[190px]">
                    Recusado por
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordRecusadas} chave="recusadoEm" className="w-[140px]">
                    Recusado em
                  </ColunaOrdenavel>
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
                  ordRecusadas.itens.map((r) => (
                    <tr key={r.admissaoId}>
                      {/* Bloco 1 da OST: caixa alta de exibição, igual à tabela de Aguardando. */}
                      <td className="font-semibold">{caixaAlta(r.candidatoNome)}</td>
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

      {/* PASSO DO VÍNCULO, entre o clique da linha e a liberação. Só monta quando a Sala devolveu
          candidato; feche por onde fechar, a liberação abre em seguida.

          O PRÉ-PREENCHIMENTO ENTRA PELO `abrirModal`, não depois dele: é ele quem zera os campos a
          cada abertura, então mandar cliente e cargo por fora seria escrever num estado que a
          própria abertura apaga em seguida. Como o modal ainda não está aberto, "só se vazio" é o
          estado inicial dele: não há escolha do consultor para sobrescrever. */}
      {salaTriagem && (
        <VincularSalaModal
          admissaoId={salaTriagem.r.admissaoId}
          candidatoNome={salaTriagem.r.candidatoNome}
          candidatoCpf={salaTriagem.r.candidatoCpf}
          candidatoTelefone={salaTriagem.r.telefone}
          sugestoesIniciais={salaTriagem.sugestoes}
          onClose={(dados) => {
            const alvoTriagem = salaTriagem.r;
            setSalaTriagem(null);
            abrirModal(alvoTriagem, dados ?? undefined);
            // Depois do `abrirModal`, que zera a marca: assim ela sobrevive à abertura.
            if (dados) setSalaVinculada(dados.nome);
          }}
        />
      )}

      {alvo && (
        <Modal onClose={fecharModal} ariaLabel="Liberar admissão" className="max-w-[560px] p-6">
          <div className="mb-5">
            <div className="eyebrow !mb-1">Liberação Admissional</div>
            <h2 className="font-display text-xl font-bold">{caixaAlta(alvo.candidatoNome)}</h2>
            <p className="mt-0.5 font-mono text-[13px] text-dim">{fmtCpf(alvo.candidatoCpf)}</p>
          </div>

          {/* TRAVA DO CPF INVÁLIDO (item 9, Frente A). Bloqueia a liberação e diz por quê. Quem
              corrige é Master ou Super Admin, pela rota de correção de CPF: por isso o texto aponta
              para quem resolve, em vez de mandar o consultor tentar de novo. */}
          {cpfAlvoInvalido && (
            <div
              className="mb-4 rounded-xl border border-[rgba(214,69,69,0.45)] bg-[rgba(214,69,69,0.1)] px-3 py-2.5"
              role="alert"
            >
              <div className="text-[11px] uppercase tracking-wide text-danger">CPF Inválido</div>
              <p className="mt-1 text-[13px] text-text">
                O dígito verificador deste CPF não fecha, então ele está errado na origem. A liberação
                fica bloqueada até a correção. Peça a um Master ou Super Admin que corrija o CPF desta
                admissão, conferindo o documento do candidato.
              </p>
            </div>
          )}

          {/* SALA DE ESPERA (onda 3): aqui é só a MARCA do que já foi vinculado no passo anterior,
              para o consultor saber de onde vieram o cliente e o cargo que já encontrou preenchidos.
              Não há botão dentro do modal: o vínculo acontece na linha, antes de chegar aqui. */}
          {salaVinculada && (
            <p className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(91,214,138,0.1)] px-3 py-2 text-[13px] text-ok">
              <Icon name="check" className="h-4 w-4 flex-none" />
              Vinculado à Sala de Espera: {caixaAlta(salaVinculada)}
            </p>
          )}

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
            {/* CONTRATO DO CLIENTE (OST Onda 3, item 7, Bloco 5). Só aparece quando o cliente
                trabalha com MAIS DE UM contrato, que é o único caso em que existe escolha a fazer.
                Não é o tipo de contrato virando obrigatório para todo mundo: é desempatar entre
                duas opções concretas, porque cada contrato tem régua documental própria. */}
            {exigeVinculo && (
              <label className="grid gap-1.5">
                <span className="ds-label">
                  Contrato do cliente <span className="text-danger">*</span>
                </span>
                <Select
                  value={vinculoSel}
                  onChange={setVinculoSel}
                  placeholder="Selecione o contrato…"
                  ariaLabel="Contrato do cliente"
                  menuFit
                  options={vinculos.map((v) => ({ value: v.id, label: v.rotulo }))}
                />
                <span className="text-[11.5px] text-dim">
                  Este cliente trabalha com mais de um tipo de contrato, e cada um tem a sua régua
                  documental. Escolha o contrato desta admissão.
                </span>
              </label>
            )}
            {/* ALTO VOLUME (onda 2). Só aparece para cliente que TEM projeto ativo, na mesma regra
                do seletor de contrato logo acima: quem não tem escolha a fazer não é perguntado.
                Nada aqui muda a liberação de quem não usa o flag. */}
            {avDisponivel && (
              <BlocoAltoVolume
                idAria="liberação individual"
                ligado={avLigado}
                onLigado={setAvLigado}
                projetos={avProjetos}
                projetoSel={avProjetoSel}
                onProjeto={setAvProjetoSel}
                grupos={avGrupos}
                grupoSel={avGrupoSel}
                onGrupo={setAvGrupoSel}
                sugeridoId={avSugerido}
              />
            )}
            {/* Demais campos obrigatórios (régua unificada §A.19), abaixo de cliente/cargo. Opcionais:
                o que ficar vazio vira pendência na esteira; SÓ cliente+cargo travam a liberação. */}
            <div className="grid grid-cols-2 gap-4">
              {/* SEXO: muda QUAIS documentos a régua exige (o Reservista só vale para o masculino),
                  então fica junto dos campos que definem a admissão, não escondido. O que veio do
                  Pandapé já vem selecionado e PODE ser corrigido aqui. */}
              <label className="grid gap-1.5">
                <span className="ds-label">Sexo</span>
                <Select
                  value={sexo}
                  onChange={setSexo}
                  placeholder="Selecione…"
                  ariaLabel="Sexo do candidato"
                  options={[
                    { value: "FEMININO", label: "Feminino" },
                    { value: "MASCULINO", label: "Masculino" },
                  ]}
                />
                <span className="text-[11.5px] text-dim">
                  Define quais documentos a régua exige. A carteira de reservista só é cobrada do
                  sexo masculino.
                </span>
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Salário</span>
                <input
                  className="ds-input"
                  inputMode="decimal"
                  placeholder="Ex.: 2.500,00"
                  value={salario}
                  onChange={(e) => setSalario(maskMoedaBR(e.target.value))}
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
                  searchable
                  options={[
                    OPCAO_EM_BRANCO,
                    ...TIPOS_CONTRATO.map((t) => ({ value: t, label: t })),
                  ]}
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
                  options={[
                    OPCAO_EM_BRANCO,
                    ...escalasCat.map((e) => ({ value: e.nome, label: e.nome })),
                  ]}
                />
              </label>
              {/* AS TRÊS JUNTAS (OST Onda 2): Setor, Departamento e Centro de custo são campos
                  DISTINTOS que a operação usa junto, não sinônimos. O Setor é digitável e sugere os
                  valores já usados neste cliente+cargo (memória dinâmica): o `list` é sugestão, não
                  trava, então setor novo continua entrando e passa a alimentar a memória. */}
              <label className="grid gap-1.5">
                <span className="ds-label">Setor</span>
                <input
                  className="ds-input"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                  list="setores-memoria"
                  placeholder="Digite ou escolha um já usado"
                />
                <datalist id="setores-memoria">
                  {setoresMemoria.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Departamento</span>
                <input
                  className="ds-input"
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
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
              {/* LOJA / UNIDADE (etapa 3). Aparece SÓ quando o cliente tem lojas cadastradas; some
                  para os demais, que é a maioria. O centro de custo continua ao lado e SEPARADO: são
                  coisas distintas, e a loja é que passa a responder "onde a pessoa trabalha". */}
              <SeletorLoja codCliente={codCliente} value={lojaId} onChange={setLojaId} />
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
                        setBeneficiosValores((v) => ({ ...v, [nome]: maskMoedaBR(e.target.value) }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}

            {/* OBSERVAÇÕES LIVRES (Bloco 2 da OST). Campo de texto para o que não cabe em campo
                estruturado (caso real: "VT possui 6% de desconto"). OPCIONAL: não bloqueia a
                liberação e NÃO entra na régua de pendências obrigatórias. Fica depois dos campos
                estruturados de propósito: primeiro o consultor preenche o que é dado, depois
                escreve o que é recado. Aparece no modal do olho após a liberação (Bloco 3). */}
            <label className="grid gap-1.5">
              <span className="ds-label">Observações (opcional)</span>
              <textarea
                className="ds-input min-h-[76px] resize-y py-2"
                maxLength={OBSERVACAO_MAX}
                placeholder="Informação que não cabe nos campos acima. Ex.: VT possui 6% de desconto."
                aria-label="Observações da liberação"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
              <span className="text-[11.5px] text-faint">
                Fica visível na ficha do candidato depois de liberado. {observacao.length} de{" "}
                {OBSERVACAO_MAX} caracteres.
              </span>
            </label>

            {/* UNIFORME (OST Onda 3, item 1). A RESPOSTA é obrigatória e trava o botão Liberar; ter
                uniforme não bloqueia nada. Os tamanhos são seletores de catálogo fechado, nunca
                digitáveis, e nascem em branco a cada candidato (tamanho é individual). */}
            <div className="grid gap-2.5 rounded-xl border border-[var(--border)] px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="ds-label !mb-0">
                  Possui uniforme? <span className="text-danger">*</span>
                </span>
                <SimNao
                  valor={possuiUniforme}
                  aria="Possui uniforme"
                  onChange={(v) => {
                    setPossuiUniforme(v);
                    if (!v) {
                      setUniCamiseta("");
                      setUniCalca("");
                      setUniBota("");
                    }
                  }}
                />
              </div>
              {possuiUniforme === null && (
                <p className="text-[11.5px] text-warn">
                  Resposta obrigatória para liberar. Ter uniforme não bloqueia o fluxo, não responder
                  bloqueia.
                </p>
              )}
              {possuiUniforme === true && (
                <div className="grid grid-cols-3 gap-3">
                  <label className="grid gap-1.5">
                    <span className="ds-label">Camiseta</span>
                    <Select
                      value={uniCamiseta}
                      onChange={setUniCamiseta}
                      placeholder="Tamanho…"
                      ariaLabel="Tamanho da camiseta"
                      menuFit
                      options={[
                        OPCAO_EM_BRANCO,
                        ...TAMANHOS_CAMISETA.map((t) => ({ value: t, label: t })),
                      ]}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="ds-label">Calça</span>
                    <Select
                      value={uniCalca}
                      onChange={setUniCalca}
                      placeholder="Tamanho…"
                      ariaLabel="Tamanho da calça"
                      searchable
                      menuFit
                      options={[
                        OPCAO_EM_BRANCO,
                        ...TAMANHOS_CALCA.map((t) => ({ value: t, label: t })),
                      ]}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="ds-label">Bota</span>
                    <Select
                      value={uniBota}
                      onChange={setUniBota}
                      placeholder="Tamanho…"
                      ariaLabel="Tamanho da bota"
                      searchable
                      menuFit
                      options={[
                        OPCAO_EM_BRANCO,
                        ...TAMANHOS_BOTA.map((t) => ({ value: t, label: t })),
                      ]}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* EPI (OST Onda 3, item 1). NÃO é pendência obrigatória: pode ficar sem resposta e a
                liberação segue. Respondido "sim", o que for marcado vira o aviso da ficha, para o
                consultor validar o EPI daquela admissão. */}
            <div className="grid gap-2.5 rounded-xl border border-[var(--border)] px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="ds-label !mb-0">Possui EPI?</span>
                <SimNao
                  valor={possuiEpi}
                  aria="Possui EPI"
                  onChange={(v) => {
                    setPossuiEpi(v);
                    if (!v) {
                      setEpiItens([]);
                      setEpiOutros("");
                    }
                  }}
                />
              </div>
              {possuiEpi === true && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {ITENS_EPI.map((item) => {
                      const marcado = epiItens.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={marcado}
                          onClick={() =>
                            setEpiItens((sel) => {
                              const novo = marcado
                                ? sel.filter((x) => x !== item)
                                : [...sel, item as ItemEpi];
                              if (item === "OUTROS" && marcado) setEpiOutros("");
                              return novo;
                            })
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-[12.5px] transition",
                            marcado
                              ? "border-[rgba(46,158,99,0.5)] bg-[rgba(46,158,99,0.14)] text-ok"
                              : "border-[var(--border)] text-dim hover:text-text",
                          )}
                        >
                          {ROTULO_ITEM_EPI[item]}
                        </button>
                      );
                    })}
                  </div>
                  {epiItens.includes("OUTROS") && (
                    <label className="grid gap-1.5">
                      <span className="ds-label">Qual outro EPI?</span>
                      <input
                        className="ds-input"
                        maxLength={200}
                        placeholder="Ex.: protetor auricular"
                        value={epiOutros}
                        onChange={(e) => setEpiOutros(e.target.value)}
                      />
                      {epiOutrosFaltando && (
                        <span className="text-[11.5px] text-warn">
                          Diga qual é o item. Sem isso o aviso da ficha não informa nada a quem for
                          validar.
                        </span>
                      )}
                    </label>
                  )}
                </>
              )}
            </div>

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

          {/* CPF DUPLICADO (item 3): pergunta, não erro. Amarelo de aviso, com as admissões vivas
              que o backend achou AO VIVO, para o consultor decidir com o contexto na mão. */}
          {dupAviso && (
            <div
              className="mt-4 rounded-xl border border-[rgba(201,138,18,0.4)] bg-[rgba(201,138,18,0.1)] px-3 py-2.5 text-[13px] text-warn"
              role="alert"
            >
              <div className="eyebrow !mb-1">Possível Duplicata De CPF</div>
              <p>{dupAviso.message}</p>
              {dupAviso.vivas.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4">
                  {dupAviso.vivas.map((v, i) => (
                    <li key={i}>
                      {v.cliente}, {v.cargo}:{" "}
                      {FAROL_GLOBAL_LABEL[v.situacao as FarolGlobal] ?? v.situacao}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2">
                Se for a mesma pessoa numa vaga nova, pode confirmar e liberar. Se for duplicata,
                cancele e recuse a pré-admissão.
              </p>
            </div>
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
                onClick={() => void liberar(Boolean(dupAviso))}
                disabled={!podeLiberar || liberando || acaoRecusa}
              >
                {liberando
                  ? "Liberando…"
                  : dupAviso
                    ? "Confirmar e liberar"
                    : "Liberar"}
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
                  <li key={d.admissaoId}>{caixaAlta(d.candidatoNome)}</li>
                ))}
              </ul>
              <p className="mt-1">
                Já existe admissão viva desse CPF. Libere uma a uma, conferindo antes se não é
                duplicata.
              </p>
            </div>
          )}

          {/* TRAVA 2, CPF inválido (item 9, Frente A): o dígito verificador não fecha, então o CPF
              está errado na origem. Fora do lote e nominal, para o Master saber quem corrigir. */}
          {loteCpfInvalido.length > 0 && (
            <div
              className="mb-4 rounded-xl border border-[rgba(214,69,69,0.45)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
              role="alert"
            >
              <p className="font-semibold">
                {loteCpfInvalido.length} selecionada{loteCpfInvalido.length === 1 ? "" : "s"} com CPF
                inválido{loteCpfInvalido.length === 1 ? " não será liberada" : " não serão liberadas"}
                :
              </p>
              <ul className="mt-1 list-disc pl-5">
                {loteCpfInvalido.map((d) => (
                  <li key={d.admissaoId}>
                    {caixaAlta(d.candidatoNome)} ({fmtCpf(d.candidatoCpf)})
                  </li>
                ))}
              </ul>
              <p className="mt-1">
                O dígito verificador não fecha. Um Master ou Super Admin precisa corrigir o CPF,
                conferindo o documento do candidato, antes de liberar.
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

            {/* ALTO VOLUME no LOTE (onda 2): o caminho PRINCIPAL da frente, porque projeto sazonal
                entra em leva. O projeto escolhido vale para TODAS as N, como os demais campos. */}
            {loteAvDisponivel && (
              <BlocoAltoVolume
                idAria="liberação em massa"
                ligado={loteAvLigado}
                onLigado={setLoteAvLigado}
                projetos={loteAvProjetos}
                projetoSel={loteAvProjetoSel}
                onProjeto={setLoteAvProjetoSel}
                grupos={loteAvGrupos}
                grupoSel={loteAvGrupoSel}
                onGrupo={setLoteAvGrupoSel}
                sugeridoId={loteAvSugerido}
              />
            )}

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
                  onChange={(e) => setLoteSalario(maskMoedaBR(e.target.value))}
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
                  searchable
                  value={loteTipoContrato}
                  onChange={setLoteTipoContrato}
                  placeholder="Selecione…"
                  ariaLabel="Tipo de contrato do lote"
                  options={[
                    OPCAO_EM_BRANCO,
                    ...TIPOS_CONTRATO.map((t) => ({ value: t, label: t })),
                  ]}
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
                  options={[
                    OPCAO_EM_BRANCO,
                    ...escalasCat.map((e) => ({ value: e.nome, label: e.nome })),
                  ]}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Setor</span>
                <input
                  className="ds-input"
                  value={loteSetor}
                  onChange={(e) => setLoteSetor(e.target.value)}
                  list="setores-memoria-lote"
                  placeholder="Digite ou escolha um já usado"
                />
                <datalist id="setores-memoria-lote">
                  {setoresMemoria.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label className="grid gap-1.5">
                <span className="ds-label">Departamento</span>
                <input
                  className="ds-input"
                  value={loteDepartamento}
                  onChange={(e) => setLoteDepartamento(e.target.value)}
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

            {/* LOJA POR LINHA (Q9, decisão do diretor). É a ÚNICA coisa deste modal que NÃO é um
                valor só para todos: o mesmo lote costuma ter gente de lojas diferentes, e obrigar um
                lote por loja transformaria a liberação em massa em individual disfarçada. Some
                inteiro quando o cliente não tem lojas, que é a maioria. */}
            {loteCodCliente && loteSelecionadasOk.length > 0 && (
              <LojasDoLote
                codCliente={loteCodCliente}
                pessoas={loteSelecionadasOk.map((x) => ({
                  admissaoId: x.admissaoId,
                  nome: x.candidatoNome,
                }))}
                valores={lojasDoLote}
                onChange={(admissaoId, lojaId) =>
                  setLojasDoLote((atual) => ({ ...atual, [admissaoId]: lojaId }))
                }
              />
            )}

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
                        setLoteBeneficiosValores((v) => ({ ...v, [nome]: maskMoedaBR(e.target.value) }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}

            {/* OBSERVAÇÕES LIVRES do LOTE (Bloco 2 da OST). MESMO campo do individual e MESMA regra
                dos demais campos do lote: o que for escrito aqui é gravado em TODAS as N
                selecionadas. Opcional, não bloqueia. */}
            <label className="grid gap-1.5">
              <span className="ds-label">Observações (opcional)</span>
              <textarea
                className="ds-input min-h-[76px] resize-y py-2"
                maxLength={OBSERVACAO_MAX}
                placeholder="Informação que não cabe nos campos acima. Ex.: VT possui 6% de desconto."
                aria-label="Observações da liberação em massa"
                value={loteObservacao}
                onChange={(e) => setLoteObservacao(e.target.value)}
              />
              <span className="text-[11.5px] text-faint">
                Vale para as {loteSelecionadasOk.length} selecionadas e fica visível na ficha de cada
                candidato. {loteObservacao.length} de {OBSERVACAO_MAX} caracteres.
              </span>
            </label>

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
                  <li key={l.admissaoId}>{caixaAlta(l.candidato)}</li>
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
                    {caixaAlta(f.candidato)}: {f.motivo}
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
            <h2 className="font-display text-xl font-bold">
              {caixaAlta(recusadaAlvo.candidatoNome)}
            </h2>
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
