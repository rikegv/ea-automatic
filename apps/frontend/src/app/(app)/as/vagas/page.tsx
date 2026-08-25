"use client";

/**
 * CENTRAL DE VAGAS (A&S): abrir vaga é uma TRILHA, fechar vaga é outro momento.
 *
 * POR QUE TRILHA, E NÃO UM MODAL COM TUDO: a abertura tem 38 campos. Empilhados numa caixa só, eles
 * viram uma parede que ninguém lê, e a pessoa desiste no meio sem saber quanto falta. Em 5 passos,
 * cada tela tem UM assunto e o progresso é visível.
 *
 * O STEPPER É O DO WIZARD DE NOVA ADMISSÃO, importado sem alteração nenhuma (§A.26): mesmo círculo
 * numerado, mesmo check no passo vencido, mesma barra de progresso. Um jeito só de caminhar no
 * sistema inteiro.
 *
 * OS DOIS LADOS DA VAGA (frente 2): quem abre é carimbado pelo PAPEL DE A&S da própria sessão, e a
 * trilha pede só a CONTRAPARTE. Recruiter abrindo escolhe o consultor; consultor abrindo escolhe o
 * recruiter. A tela nunca pergunta "quem é você".
 *
 * O FECHAMENTO NÃO ESTÁ NA ABERTURA, e isso é o ponto da OST: data de fechamento, vagas fechadas,
 * salário de fechamento e data prevista de início só aparecem na ação Fechar Vaga, lá na frente.
 *
 * §A.11 (sem travessão), §A.12 (máscara única de tabela), §A.24 (title case em título e tag).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ESCALA_OUTRA,
  OPCAO_OUTRA,
  OPCAO_OUTRO,
  OPCAO_OUTROS,
  PAPEL_AS_LABEL,
  REGIAO_OUTRAS,
  UFS,
  VAGA_DETALHE_HIBRIDO,
  VAGA_ESCOLARIDADE,
  VAGA_ESCOLARIDADE_LABEL,
  VAGA_ETAPAS_PS,
  VAGA_FAIXA_ETARIA,
  VAGA_GENERO,
  VAGA_GENERO_LABEL,
  VAGA_IDIOMAS,
  VAGA_MODELO_TRABALHO,
  VAGA_MODELO_TRABALHO_LABEL,
  VAGA_NATUREZA,
  VAGA_NATUREZA_LABEL,
  VAGA_SAZONALIDADE,
  VAGA_SAZONALIDADE_LABEL,
  VAGA_STATUS,
  VAGA_STATUS_LABEL,
  VAGA_TEMPO_CONTRATO,
  VAGA_TESTES,
  VAGA_TESTE_LABEL,
  VAGA_TIPO_SUBSTITUICAO,
  VAGA_TIPO_SUBSTITUICAO_LABEL,
  VAGA_VINCULO,
  VAGA_VINCULO_LABEL,
  contraparteDe,
  exigeTempoContrato,
  nomeDaUf,
  regioesDaUf,
  rotuloTempoContrato,
  separarOpcaoEscape,
  textoPendencia,
  vagaPendencias,
  type VagaContextoAs,
  type VagaListItem,
  type VagaPendencia,
  type VagaStatus,
} from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { maskMoedaBR, salarioParaCampo } from "@/lib/salario";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Combobox } from "@/components/ui/Combobox";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { Stepper, type StepDef } from "@/components/nova/Stepper";
import type { PillTone } from "@/components/ui/Pill";

interface OpcaoCliente {
  codCliente: string;
  rotulo: string;
  enderecoPadrao: string | null;
  escalaPadrao: string | null;
  /** O contato focal da ÚLTIMA vaga deste cliente (item 1). Nulo = cliente sem vaga anterior. */
  solicitanteNome: string | null;
  solicitanteTelefone: string | null;
  solicitanteEmail: string | null;
}

interface Opcoes {
  cargos: { id: string; nome: string }[];
  clientes: OpcaoCliente[];
  beneficios: { id: string; nome: string; exigeValor: boolean }[];
  motivos: string[];
  /** O cadastro de escalas do menu gerencial (item 5), servido pelo próprio módulo de A&S. */
  escalas: string[];
}

/** Os 5 passos da trilha. O `hint` é a linha de apoio do Stepper, não um título (§A.24). */
const STEPS: StepDef[] = [
  { label: "A Vaga", hint: "Cliente, cargo e posições" },
  { label: "Quem Pediu", hint: "Solicitante e datas" },
  { label: "Contratação", hint: "Vínculo e motivo" },
  { label: "Condições", hint: "Salário e benefícios" },
  { label: "Requisitos", hint: "Quem procuramos" },
];

const MOTIVO_SUBSTITUICAO = "Substituição";

/**
 * TOM DA PILL POR STATUS (§A.12: o ícone acompanha o estado real, nunca é fixo). Entregue é o êxito
 * da vaga (check verde); aberta é trabalho em andamento (exclamação amarela); cancelada é o X
 * vermelho; fechada é encerramento neutro; vaga banco é estado próprio, em azul.
 */
const TOM_STATUS: Record<VagaStatus, PillTone> = {
  // RASCUNHO é neutro de propósito: não é trabalho em andamento (a vaga nem foi publicada) nem
  // êxito nem encerramento. É a vaga que ainda não começou.
  RASCUNHO: "nt",
  ABERTA: "wn",
  ENTREGUE: "ok",
  FECHADA: "nt",
  CANCELADA: "dg",
  VAGA_BANCO: "in",
};

/** Data ISO (yyyy-mm-dd) no formato brasileiro, sem passar por fuso (a string já é a data). */
function dataBr(iso: string | null): string {
  if (!iso) return "não informado";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Valor canônico do banco ("2500.00") no formato que o time lê ("R$ 2.500,00"). */
function moedaBr(v: string | null): string {
  if (!v) return "não informado";
  const formatado = salarioParaCampo(v);
  return formatado ? `R$ ${formatado}` : "não informado";
}

const HOJE = () => new Date().toISOString().slice(0, 10);

/**
 * COMO A VAGA É CHAMADA EM UMA FRASE (rótulo de acessibilidade e de `title`).
 *
 * O CÓDIGO É O NOME DELA quando existe. O rascunho pode ainda não ter número, e aí vale o nome de
 * divulgação; sem os dois, a frase diz "sem código", que é honesto, em vez de "vaga undefined".
 */
function rotuloDaVaga(v: VagaListItem): string {
  return v.codigo ?? v.nomeDivulgacao ?? "sem código";
}

/**
 * UM CONTADOR ESCRITO COMO O DIRETOR PEDIU: "6 de 10 Oficiais, 3 de 10 Banco".
 *
 * O "X DE Y" SÓ APARECE QUANDO O X EXISTE. Enquanto a vaga está aberta ninguém contou nada ainda, e
 * escrever "0 de 10" ali seria afirmar que zero posições foram preenchidas, o que o sistema não sabe:
 * a contagem só nasce no fechamento. Sem contagem, a célula mostra a META, que é o que existe.
 *
 * META AUSENTE mostra "não informado" (§A.11), nunca um traço, e acontece só no rascunho.
 */
function textoContador(lado: string, meta: number | null, fechadas: number | null): string {
  if (meta === null) return `${lado}: não informado`;
  return fechadas === null ? `${lado}: ${meta}` : `${lado}: ${fechadas} de ${meta}`;
}

/**
 * MÁSCARA DE CPF, a mesma do wizard de Nova Admissão. O campo mostra "123.456.789-01" e o que viaja
 * para o backend são os 11 dígitos: quem confere se o dígito fecha é o service, com a mensagem em
 * português (§A.6, o número não volta na mensagem de erro).
 */
function formatCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/**
 * O NÓ DO ESCAPE, na ida: a tela guarda opção e texto separados, o banco guarda UM valor.
 *
 * Escolheu da lista, vale a opção. Escolheu o escape, vale o que a pessoa escreveu, e o SENTINELA
 * NUNCA É GRAVADO: guardar a palavra "Outra" como resposta seria trocar a resposta pela pergunta.
 */
function comEscape(opcao: string, texto: string, sentinela: string): string | undefined {
  if (!opcao) return undefined;
  if (opcao === sentinela) return texto.trim() || undefined;
  return opcao;
}

/** Rótulo de uma lista múltipla numa linha só, com o escape no fim quando ele existe. */
function listaEmTexto(itens: string[], outro: string | null, sentinela: string): string {
  const base = itens.filter((i) => i !== sentinela);
  if (outro?.trim()) base.push(outro.trim());
  return base.length ? base.join(", ") : "não informado";
}

/** O formulário inteiro num objeto só: o rascunho da trilha é este estado, e ele atravessa os passos. */
interface FormVaga {
  codigo: string;
  cargoId: string;
  nomeDivulgacao: string;
  codCliente: string;
  natureza: string;
  status: string;
  sazonalidade: string;
  /**
   * OS DOIS CONTADORES DA VAGA (decisão do diretor, 25/08): oficiais são as contratações de verdade,
   * banco é o excedente aprovado que fica reservado. Texto, como todo campo numérico da trilha, para
   * o input controlado aceitar o campo vazio enquanto a pessoa digita.
   */
  posicoesOficiais: string;
  posicoesBanco: string;

  solicitanteNome: string;
  solicitanteTelefone: string;
  solicitanteEmail: string;
  dataSolicitacao: string;
  dataAlinhamento: string;
  dataAbertura: string;
  dataLimite: string;
  envioShortlist: string;

  contraparteId: string;
  vinculo: string;
  tempoContrato: string;
  motivo: string;
  justificativaMotivo: string;
  tipoSubstituicao: string;
  substituidoNome: string;
  /** Item 3: entra junto do nome, com máscara, e PERSISTE (decisão do diretor). */
  substituidoCpf: string;

  salarioAbertura: string;
  localTrabalho: string;
  /**
   * REGIÃO EM DUAS LISTAS ENCADEADAS (item 7): a UF comanda, as regiões seguem. Trocar a UF LIMPA as
   * regiões marcadas, senão a vaga guardaria região de um estado com a sigla de outro.
   */
  regiaoEstado: string;
  regioes: string[];
  regioesOutras: string;
  /**
   * OS CAMPOS COM ESCAPE guardam DUAS coisas na tela e UMA no banco: a opção escolhida da lista e o
   * texto de "Outra". Na hora de salvar, os dois viram um valor só (ver `comEscape`); ao reabrir a
   * vaga, `separarOpcaoEscape` desfaz o nó e devolve cada metade ao seu controle.
   */
  horarioEscalaOpcao: string;
  horarioEscalaOutra: string;
  modeloTrabalho: string;
  detalheHibridoOpcao: string;
  detalheHibridoOutro: string;
  confidencial: boolean;
  divulgarEmpresa: boolean;

  escolaridade: string;
  faixaEtariaOpcao: string;
  faixaEtariaOutra: string;
  genero: string;
  idiomas: string[];
  idiomasOutros: string;
  cursosConhecimentos: string;
  testesOutro: string;
  experiencia: string;
  atribuicoes: string;
  perfilComportamental: string;
  ambiente: string;
  etapasPs: string[];
  etapasPsOutra: string;
  observacoes: string;
}

const FORM_VAZIO = (): FormVaga => ({
  codigo: "",
  cargoId: "",
  nomeDivulgacao: "",
  codCliente: "",
  natureza: "EFETIVA",
  status: "ABERTA",
  sazonalidade: "OPERACAO_PADRAO",
  posicoesOficiais: "1",
  // BANCO NASCE ZERO: a maioria das vagas não reserva excedente, e zero é resposta, não lacuna.
  posicoesBanco: "0",

  solicitanteNome: "",
  solicitanteTelefone: "",
  solicitanteEmail: "",
  dataSolicitacao: "",
  dataAlinhamento: "",
  dataAbertura: HOJE(),
  dataLimite: "",
  envioShortlist: "",

  contraparteId: "",
  vinculo: "",
  tempoContrato: "",
  motivo: "",
  justificativaMotivo: "",
  tipoSubstituicao: "",
  substituidoNome: "",
  substituidoCpf: "",

  salarioAbertura: "",
  localTrabalho: "",
  regiaoEstado: "",
  regioes: [],
  regioesOutras: "",
  horarioEscalaOpcao: "",
  horarioEscalaOutra: "",
  modeloTrabalho: "",
  detalheHibridoOpcao: "",
  detalheHibridoOutro: "",
  confidencial: false,
  divulgarEmpresa: true,

  escolaridade: "",
  faixaEtariaOpcao: "",
  faixaEtariaOutra: "",
  genero: "INDIFERENTE",
  idiomas: [],
  idiomasOutros: "",
  cursosConhecimentos: "",
  testesOutro: "",
  experiencia: "",
  atribuicoes: "",
  perfilComportamental: "",
  ambiente: "",
  etapasPs: [],
  etapasPsOutra: "",
  observacoes: "",
});

/**
 * O ASTERISCO VERMELHO DO OBRIGATÓRIO (item 1 da OST de 25/08).
 *
 * POR QUE UM ELEMENTO, e não " *" escrito dentro do rótulo como estava antes: dentro da string ele é
 * cinza como o resto do rótulo e não salta aos olhos, que é justamente o que o diretor pediu. Fora
 * dela ele ganha a cor de alerta do DS e o leitor de tela ganha "obrigatório" por extenso, em vez de
 * ler um asterisco solto no meio da frase.
 */
function Obrigatorio() {
  return (
    <span className="text-danger" aria-hidden>
      {" *"}
    </span>
  );
}

/**
 * Rótulo de campo, no padrão do DS.
 *
 * O `id` VAI NO CONTÊINER, e não no input, e isso é deliberado: é o alvo do salto vindo da lista de
 * pendências do publicar (item 4). Saltar para o contêiner deixa o RÓTULO visível junto do campo,
 * enquanto saltar para o input sozinho encostaria o campo no topo da área rolante, sem o nome dele.
 * Quem recebe o foco continua sendo o controle de dentro (ver `irParaPendencia`).
 */
function Campo({
  rotulo,
  children,
  largo = false,
  obrigatorio = false,
  id,
}: {
  rotulo: string;
  children: React.ReactNode;
  largo?: boolean;
  obrigatorio?: boolean;
  id?: string;
}) {
  return (
    <label
      id={id}
      className={largo ? "flex flex-col gap-1.5 md:col-span-2" : "flex flex-col gap-1.5"}
    >
      <span className="text-[12.5px] text-dim">
        {rotulo}
        {obrigatorio && <Obrigatorio />}
        {obrigatorio && <span className="sr-only"> (obrigatório)</span>}
      </span>
      {children}
    </label>
  );
}

/** Campo com seletor (o Select do DS não é um `input`, então o rótulo não pode ser `label`). */
function CampoSelect({
  rotulo,
  children,
  largo = false,
  obrigatorio = false,
  id,
}: {
  rotulo: string;
  children: React.ReactNode;
  largo?: boolean;
  obrigatorio?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={largo ? "flex flex-col gap-1.5 md:col-span-2" : "flex flex-col gap-1.5"}
    >
      <span className="text-[12.5px] text-dim">
        {rotulo}
        {obrigatorio && <Obrigatorio />}
        {obrigatorio && <span className="sr-only"> (obrigatório)</span>}
      </span>
      {children}
    </div>
  );
}

export default function CentralDeVagasPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<VagaListItem[]>([]);
  const [opcoes, setOpcoes] = useState<Opcoes>({
    cargos: [],
    clientes: [],
    beneficios: [],
    motivos: [],
    escalas: [],
  });
  const [contexto, setContexto] = useState<VagaContextoAs>({
    papelAs: null,
    nome: "",
    contraparte: [],
  });
  const [loading, setLoading] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);

  // ── Trilha de abertura ────────────────────────────────────────────────────
  const [aberto, setAberto] = useState(false);
  const [step, setStep] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [form, setForm] = useState<FormVaga>(FORM_VAZIO);
  const [beneficios, setBeneficios] = useState<Record<string, { marcado: boolean; valor: string }>>(
    {},
  );
  const [testes, setTestes] = useState<string[]>([]);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  /**
   * O RASCUNHO EM EDIÇÃO (item 3). Nulo é abertura nova; com id, a trilha CONTINUA aquela vaga, e o
   * salvamento vira PATCH em vez de POST. Sem isto, cada "Salvar Rascunho" criaria um rascunho novo
   * e o consultor terminaria com quatro cópias da mesma vaga na listagem.
   */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /**
   * O QUE FALTOU NA TENTATIVA DE PUBLICAR (item 4). Vazio é "nada pendente" OU "ainda não tentou": o
   * painel só aparece depois de a pessoa clicar em publicar, porque acusar pendência no passo 1 de
   * uma trilha recém-aberta seria gritar antes de ela ter tido chance de preencher.
   */
  const [pendencias, setPendencias] = useState<VagaPendencia[]>([]);
  /**
   * A ÁREA ROLANTE DA TRILHA. Existe por um defeito PEGO NA PROVA VISUAL (§A.13): o painel de
   * pendências nasceu no fim do miolo, e no passo 5, que é longo, ele ficava ABAIXO DA DOBRA. Quem
   * clicava em publicar via a tela não fazer nada, sem saber que a resposta estava lá embaixo.
   *
   * A correção tem duas partes: o painel subiu para o TOPO do passo, e o miolo volta ao topo quando
   * ele aparece. Só uma das duas não bastaria: com o painel no topo e a área rolada para baixo, a
   * pessoa continuaria olhando para o meio do formulário.
   */
  const mioloRef = useRef<HTMLDivElement | null>(null);

  /** Item 8: a vaga completa vive num modal, aberto pelo olho da linha. Null = modal fechado. */
  const [verAlvo, setVerAlvo] = useState<VagaListItem | null>(null);

  // ── Fechar vaga ───────────────────────────────────────────────────────────
  const [fecharAlvo, setFecharAlvo] = useState<VagaListItem | null>(null);
  const [fechando, setFechando] = useState(false);
  const [erroFechar, setErroFechar] = useState<string | null>(null);
  const [fechForm, setFechForm] = useState({
    dataFechamento: HOJE(),
    /** Uma contagem para cada meta (os dois contadores, 25/08): oficiais e banco. */
    vagasFechadas: "",
    vagasFechadasBanco: "",
    salarioFechamento: "",
    dataPrevistaInicio: "",
    enviarParaAdmissao: false,
  });

  /**
   * EDITAR SÓ OS DOIS CONTADORES DEPOIS (decisão do diretor, 25/08: "continuam editáveis depois").
   *
   * MODAL PRÓPRIO, E NÃO A TRILHA REABERTA: a vaga publicada continua não voltando para a trilha de
   * abertura, como já estava decidido. Aqui se corrige o par de números, que é o que foi pedido, sem
   * transformar a vaga publicada num formulário de 38 campos aberto para edição livre.
   */
  const [posAlvo, setPosAlvo] = useState<VagaListItem | null>(null);
  const [salvandoPos, setSalvandoPos] = useState(false);
  const [erroPos, setErroPos] = useState<string | null>(null);
  const [posForm, setPosForm] = useState({ oficiais: "", banco: "" });

  const set = <K extends keyof FormVaga>(campo: K, valor: FormVaga[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, ops, ctx] = await Promise.all([
        apiFetch<VagaListItem[]>("/as/vagas", { token }),
        apiFetch<Opcoes>("/as/vagas/opcoes", { token }),
        apiFetch<VagaContextoAs>("/as/vagas/contexto", { token }),
      ]);
      setRows(lista);
      setOpcoes(ops);
      setContexto(ctx);
      setErroLista(null);
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void carregar();
  }, [token, carregar]);

  function abrirTrilha() {
    setForm(FORM_VAZIO());
    setBeneficios({});
    setTestes([]);
    setStep(0);
    setErroForm(null);
    setPendencias([]);
    setEditandoId(null);
    setAberto(true);
  }

  /**
   * CONTINUAR UM RASCUNHO (item 3): a mesma trilha, com a vaga de volta dentro dela.
   *
   * A DIFERENÇA PARA O CLONE, e é toda a diferença: aqui o CÓDIGO VOLTA e o `editandoId` é marcado,
   * então o salvamento ATUALIZA aquela vaga em vez de criar outra. No clone o código nasce vazio e
   * uma vaga nova é criada, porque cada processo seletivo tem o número dele.
   */
  function continuarRascunho(v: VagaListItem) {
    preencherTrilhaCom(v, { manterCodigo: true });
    setEditandoId(v.id);
  }

  /**
   * CLONAR A VAGA (item 8): abre a trilha com os dados da vaga escolhida, para edição.
   *
   * O QUE NÃO É COPIADO, e é o ponto da clonagem: o CÓDIGO nasce vazio. Cada abertura é um processo
   * seletivo com número próprio, e a trava de duplicidade do backend recusaria o código repetido no
   * fim da trilha, depois de a pessoa ter revisado os 37 outros campos. Melhor o campo pedir o
   * número novo no passo 1, que é onde ele é preenchido.
   *
   * O FECHAMENTO TAMBÉM NÃO VEM (data, vagas fechadas, salário de fechamento): é de outro momento e
   * de outra vaga. O clone nasce ABERTA, como qualquer abertura.
   *
   * OS CAMPOS COM ESCAPE são desfeitos na volta por `separarOpcaoEscape`: o que estava no catálogo
   * volta como opção marcada, o que era texto livre volta pelo escape, escrito. É o que faz o clone
   * devolver a vaga do jeito que ela foi preenchida, em vez de perder o que estava fora da lista.
   */
  function clonarVaga(v: VagaListItem) {
    preencherTrilhaCom(v, { manterCodigo: false });
    setEditandoId(null);
  }

  /** A trilha recebendo uma vaga de volta. Usada pelo clone (sem código) e pelo rascunho (com). */
  function preencherTrilhaCom(v: VagaListItem, { manterCodigo }: { manterCodigo: boolean }) {
    const escala = separarOpcaoEscape(v.horarioEscala, opcoes.escalas, ESCALA_OUTRA);
    const faixa = separarOpcaoEscape(v.faixaEtaria, VAGA_FAIXA_ETARIA, OPCAO_OUTRA);
    const hibrido = separarOpcaoEscape(v.detalheHibrido, VAGA_DETALHE_HIBRIDO, OPCAO_OUTRO);

    setForm({
      ...FORM_VAZIO(),
      // No CLONE o código NÃO vem: é o número do processo seletivo, e cada abertura tem o seu. No
      // RASCUNHO ele volta, porque é a MESMA vaga sendo continuada.
      codigo: manterCodigo ? (v.codigo ?? "") : "",
      cargoId: v.cargoId ?? "",
      nomeDivulgacao: v.nomeDivulgacao ?? "",
      codCliente: v.codCliente ?? "",
      natureza: v.natureza ?? "EFETIVA",
      // SEMPRE "ABERTA", nos dois casos. No clone porque a abertura é nova; no rascunho porque o
      // seletor guarda o status que a vaga terá AO PUBLICAR, e "Rascunho" não é opção dele: rascunho
      // é o botão de salvar, não uma escolha de status.
      status: "ABERTA",
      sazonalidade: v.sazonalidade,
      posicoesOficiais: v.posicoesOficiais === null ? "" : String(v.posicoesOficiais),
      posicoesBanco: String(v.posicoesBanco),

      solicitanteNome: v.solicitanteNome ?? "",
      solicitanteTelefone: v.solicitanteTelefone ?? "",
      solicitanteEmail: v.solicitanteEmail ?? "",
      dataSolicitacao: v.dataSolicitacao ?? "",
      dataAlinhamento: v.dataAlinhamento ?? "",
      // O rascunho volta com a data que ele tinha, inclusive VAZIA. O clone é abertura nova, e nasce
      // com hoje: copiar a data de abertura da vaga antiga dataria a vaga nova no passado.
      dataAbertura: manterCodigo ? (v.dataAbertura ?? "") : HOJE(),
      dataLimite: manterCodigo ? (v.dataLimite ?? "") : "",
      envioShortlist: manterCodigo ? (v.envioShortlist ?? "") : "",

      vinculo: v.vinculo ?? "",
      tempoContrato: v.tempoContrato ?? "",
      motivo: v.motivo ?? "",
      justificativaMotivo: v.justificativaMotivo ?? "",
      tipoSubstituicao: v.tipoSubstituicao ?? "",
      substituidoNome: v.substituidoNome ?? "",
      substituidoCpf: v.substituidoCpf ? formatCpf(v.substituidoCpf) : "",

      salarioAbertura: salarioParaCampo(v.salarioAbertura),
      localTrabalho: v.localTrabalho ?? "",
      regiaoEstado: v.regiaoEstado ?? "",
      regioes: v.regioes,
      regioesOutras: v.regioesOutras ?? "",
      horarioEscalaOpcao: escala.opcao,
      horarioEscalaOutra: escala.texto,
      modeloTrabalho: v.modeloTrabalho ?? "",
      detalheHibridoOpcao: hibrido.opcao,
      detalheHibridoOutro: hibrido.texto,
      confidencial: v.confidencial,
      divulgarEmpresa: v.divulgarEmpresa,

      escolaridade: v.escolaridade ?? "",
      faixaEtariaOpcao: faixa.opcao,
      faixaEtariaOutra: faixa.texto,
      genero: v.genero,
      idiomas: v.idiomas,
      idiomasOutros: v.idiomasOutros ?? "",
      cursosConhecimentos: v.cursosConhecimentos ?? "",
      testesOutro: v.testesOutro ?? "",
      experiencia: v.experiencia ?? "",
      atribuicoes: v.atribuicoes ?? "",
      perfilComportamental: v.perfilComportamental ?? "",
      ambiente: v.ambiente ?? "",
      etapasPs: v.etapasPs,
      etapasPsOutra: v.etapasPsOutra ?? "",
      observacoes: v.observacoes ?? "",
    });
    setBeneficios(
      Object.fromEntries(
        v.beneficios.map((b) => [b.id, { marcado: true, valor: salarioParaCampo(b.valor) }]),
      ),
    );
    setTestes(v.testes);
    setVerAlvo(null);
    setStep(0);
    setErroForm(null);
    setPendencias([]);
    setAberto(true);
  }

  /** Fechar por engano não pode custar 38 campos: com rascunho na mão, pergunta antes de descartar. */
  function pedirParaSair() {
    const vazio = JSON.stringify(form) === JSON.stringify({ ...FORM_VAZIO(), dataAbertura: form.dataAbertura });
    if (vazio && testes.length === 0 && Object.keys(beneficios).length === 0) {
      setAberto(false);
      return;
    }
    setConfirmarDescarte(true);
  }

  /**
   * O QUE O CLIENTE JÁ SABE RESPONDER (F1 mais o item 1 da OST de 22/08).
   *
   * Escolhido o cliente no passo 1, três blocos nascem preenchidos: o local de trabalho e a escala
   * pelos PADRÕES cadastrados do cliente (§A.3), e o SOLICITANTE pela ÚLTIMA VAGA daquele cliente,
   * que é o item 1. Tudo EDITÁVEL: é sugestão, não amarra, e quem trocou de contato troca na hora.
   *
   * SÓ PREENCHE CAMPO VAZIO, e essa regra é o ponto todo. Sobrescrever o que a pessoa já digitou
   * apagaria trabalho na frente dela; quem trocar de cliente no meio da trilha mantém o que
   * escreveu e recebe só o que ainda faltava.
   *
   * A ESCALA CAI NA LISTA (item 5): se o padrão do cliente for uma escala que EXISTE no catálogo,
   * ela vira a opção escolhida; se for texto que ninguém cadastrou, entra por "Outra escala", com o
   * texto preservado. É o `separarOpcaoEscape` fazendo o mesmo trabalho da reabertura da vaga.
   *
   * CLIENTE SEM VAGA ANTERIOR não traz solicitante, e o passo 2 nasce em branco, como o diretor
   * pediu: `null` do backend vira `""`, não vira "não informado" escrito dentro do campo.
   */
  function escolherCliente(cod: string) {
    const c = opcoes.clientes.find((x) => x.codCliente === cod);
    const escala = separarOpcaoEscape(c?.escalaPadrao, opcoes.escalas, ESCALA_OUTRA);
    setForm((f) => ({
      ...f,
      codCliente: cod,
      localTrabalho: f.localTrabalho || (c?.enderecoPadrao ?? ""),
      horarioEscalaOpcao: f.horarioEscalaOpcao || escala.opcao,
      horarioEscalaOutra: f.horarioEscalaOutra || escala.texto,
      solicitanteNome: f.solicitanteNome || (c?.solicitanteNome ?? ""),
      solicitanteTelefone: f.solicitanteTelefone || (c?.solicitanteTelefone ?? ""),
      solicitanteEmail: f.solicitanteEmail || (c?.solicitanteEmail ?? ""),
    }));
  }

  /**
   * TROCAR O ESTADO LIMPA AS REGIÕES (item 7). Sem isto, quem marcasse "Zona Leste" em SP e depois
   * trocasse para o Ceará ficaria com uma região paulista marcada numa vaga cearense: a segunda
   * lista nem mostraria, e o backend recusaria o salvamento no fim da trilha, com o trabalho já
   * feito. Limpar na hora da troca é o que faz a tela e o backend concordarem.
   */
  function escolherEstado(uf: string) {
    setForm((f) =>
      f.regiaoEstado === uf ? f : { ...f, regiaoEstado: uf, regioes: [], regioesOutras: "" },
    );
  }

  /**
   * O QUE FALTA PARA PUBLICAR, CALCULADO O TEMPO TODO (itens 1 a 4 da OST de 25/08).
   *
   * A MESMA FUNÇÃO DO BACKEND (`vagaPendencias`, no shared-types), sobre o formulário em memória. É
   * ela que responde às três perguntas da tela com uma resposta só: quais campos ganham asterisco,
   * se o publicar pode seguir e o que listar quando ele não puder.
   */
  const pendenciasAgora = useMemo(
    () =>
      vagaPendencias({
        codigo: form.codigo,
        nomeDivulgacao: form.nomeDivulgacao,
        cargoId: form.cargoId,
        posicoesOficiais: form.posicoesOficiais,
        natureza: form.natureza,
        sazonalidade: form.sazonalidade,
        status: form.status,
        dataAbertura: form.dataAbertura,
      }),
    [form],
  );

  /**
   * CLICAR NA PENDÊNCIA E CAIR NO CAMPO (item 4, o pedido literal do diretor).
   *
   * Troca o passo e, no quadro seguinte, rola até o campo e põe o cursor nele. O `requestAnimationFrame`
   * não é enfeite: no mesmo quadro do `setStep` o campo do outro passo AINDA NÃO EXISTE no DOM (a
   * trilha só monta os campos do passo atual), então `getElementById` voltaria nulo e o salto não
   * aconteceria. Esperar um quadro é esperar o React montar o passo novo.
   *
   * O FOCO VAI NO CONTROLE, o rolar vai no CONTÊINER: assim o rótulo do campo fica visível junto,
   * em vez de o campo encostar no topo da área rolante sem o nome dele.
   */
  function irParaPendencia(p: VagaPendencia) {
    setStep(p.passo);
    requestAnimationFrame(() => {
      const alvo = document.getElementById(p.ancora);
      if (!alvo) return;
      alvo.scrollIntoView({ block: "center", behavior: "smooth" });
      const controle = alvo.querySelector<HTMLElement>("input, textarea, button");
      controle?.focus({ preventScroll: true });
    });
  }

  /**
   * O ÚNICO CAMINHO DE ESCRITA DA TRILHA, nos dois destinos.
   *
   * RASCUNHO não cobra nada e grava o que houver. PUBLICAR passa pela régua ANTES de sair da tela: se
   * faltar campo obrigatório, a lista INTEIRA aparece no rodapé, clicável, e nenhuma chamada é feita.
   * O backend confere a mesma régua e é a autoridade; esta trava aqui é para a pessoa não descobrir a
   * pendência depois de uma ida ao servidor.
   *
   * POST OU PATCH pelo `editandoId`: continuar um rascunho ATUALIZA aquela vaga, nunca cria outra.
   */
  async function enviar(publicar: boolean) {
    if (salvando) return;
    setErroForm(null);

    if (publicar) {
      if (pendenciasAgora.length > 0) {
        setPendencias(pendenciasAgora);
        mioloRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setPendencias([]);
    }

    setSalvando(true);
    try {
      const marcados = Object.entries(beneficios)
        .filter(([, v]) => v.marcado)
        .map(([id, v]) => ({ beneficioId: id, valor: v.valor.trim() || undefined }));
      await apiFetch(editandoId ? `/as/vagas/${editandoId}` : "/as/vagas", {
        method: editandoId ? "PATCH" : "POST",
        token,
        body: {
          codigo: form.codigo || undefined,
          cargoId: form.cargoId || undefined,
          nomeDivulgacao: form.nomeDivulgacao || undefined,
          codCliente: form.codCliente || undefined,
          natureza: form.natureza || undefined,
          status: publicar ? form.status : "RASCUNHO",
          sazonalidade: form.sazonalidade,
          posicoesOficiais:
            Number(form.posicoesOficiais) > 0 ? Number(form.posicoesOficiais) : undefined,
          // ZERO É VALOR AQUI, não ausência: o `undefined` fica só para o campo em branco, senão
          // apagar o número do banco não teria como ser gravado.
          posicoesBanco: form.posicoesBanco === "" ? undefined : Number(form.posicoesBanco),

          solicitanteNome: form.solicitanteNome || undefined,
          solicitanteTelefone: form.solicitanteTelefone || undefined,
          solicitanteEmail: form.solicitanteEmail || undefined,
          dataSolicitacao: form.dataSolicitacao || undefined,
          dataAlinhamento: form.dataAlinhamento || undefined,
          dataAbertura: form.dataAbertura || undefined,
          dataLimite: form.dataLimite || undefined,
          envioShortlist: form.envioShortlist || undefined,

          contraparteId: form.contraparteId || undefined,
          vinculo: form.vinculo || undefined,
          // Item 2: vínculo sem prazo não manda tempo. O backend também zera, mas mandar o campo de
          // um controle que a tela nem desenhou seria pedir para o servidor limpar sujeira nossa.
          tempoContrato: exigeTempoContrato(form.vinculo)
            ? form.tempoContrato || undefined
            : undefined,
          motivo: form.motivo || undefined,
          justificativaMotivo: form.justificativaMotivo || undefined,
          tipoSubstituicao: form.tipoSubstituicao || undefined,
          substituidoNome: form.substituidoNome || undefined,
          substituidoCpf: form.substituidoCpf || undefined,

          salarioAbertura: form.salarioAbertura || undefined,
          beneficios: marcados,
          localTrabalho: form.localTrabalho || undefined,
          regiaoEstado: form.regiaoEstado || undefined,
          regioes: form.regioes.length ? form.regioes : undefined,
          regioesOutras: form.regioes.includes(REGIAO_OUTRAS)
            ? form.regioesOutras || undefined
            : undefined,
          horarioEscala: comEscape(
            form.horarioEscalaOpcao,
            form.horarioEscalaOutra,
            ESCALA_OUTRA,
          ),
          modeloTrabalho: form.modeloTrabalho || undefined,
          detalheHibrido: comEscape(
            form.detalheHibridoOpcao,
            form.detalheHibridoOutro,
            OPCAO_OUTRO,
          ),
          confidencial: form.confidencial,
          divulgarEmpresa: form.divulgarEmpresa,

          escolaridade: form.escolaridade || undefined,
          faixaEtaria: comEscape(form.faixaEtariaOpcao, form.faixaEtariaOutra, OPCAO_OUTRA),
          genero: form.genero,
          idiomas: form.idiomas.length ? form.idiomas : undefined,
          idiomasOutros: form.idiomas.includes(OPCAO_OUTROS)
            ? form.idiomasOutros || undefined
            : undefined,
          cursosConhecimentos: form.cursosConhecimentos || undefined,
          testes,
          testesOutro: form.testesOutro || undefined,
          experiencia: form.experiencia || undefined,
          atribuicoes: form.atribuicoes || undefined,
          perfilComportamental: form.perfilComportamental || undefined,
          ambiente: form.ambiente || undefined,
          etapasPs: form.etapasPs.length ? form.etapasPs : undefined,
          etapasPsOutra: form.etapasPs.includes(OPCAO_OUTRA)
            ? form.etapasPsOutra || undefined
            : undefined,
          observacoes: form.observacoes || undefined,
        },
      });
      setAberto(false);
      await carregar();
    } catch (err) {
      // O erro do código duplicado é do passo 1: a trilha volta para lá, senão a mensagem aparece
      // numa tela que não tem o campo que ela cita.
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      if (msg.toLowerCase().includes("código")) setStep(0);
      setErroForm(msg);
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    /**
     * A TRILHA SÓ PUBLICA NO ÚLTIMO PASSO, e esta guarda existe por um defeito real, pego na prova
     * visual: clicar "Continuar" no passo 4 ABRIA A VAGA sem passar pelos requisitos.
     *
     * O motivo é sutil e vale registrar. O rodapé trocava o MESMO botão entre "Continuar"
     * (type=button) e "Abrir Vaga" (type=submit). O React trata os dois como o mesmo nó, então
     * atualizava o atributo `type` durante o próprio clique; o navegador só decide a ação padrão
     * DEPOIS de despachar o evento, e a essa altura o botão já era submit. A vaga nascia com os
     * passos 1 a 4 e o passo 5 em branco, sem ninguém perceber.
     *
     * A correção tem duas camadas: `key` diferente em cada botão (o nó é trocado, não atualizado) e
     * esta guarda, que é a que não depende de detalhe de reconciliação. Ela vale MAIS agora que a
     * navegação é livre: Enter num campo do passo 1 não pode publicar a vaga.
     */
    if (step !== STEPS.length - 1) return;
    await enviar(true);
  }

  function abrirPosicoes(v: VagaListItem) {
    setPosAlvo(v);
    setErroPos(null);
    setPosForm({
      oficiais: v.posicoesOficiais === null ? "" : String(v.posicoesOficiais),
      banco: String(v.posicoesBanco),
    });
  }

  async function confirmarPosicoes(e: FormEvent) {
    e.preventDefault();
    if (!posAlvo || salvandoPos) return;
    setErroPos(null);

    const oficiais = Number(posForm.oficiais);
    const banco = Number(posForm.banco);
    // A MESMA RÉGUA DO BACKEND, aqui só para não gastar uma ida ao servidor com o que a tela já sabe:
    // vaga sem contratação não é vaga, e banco negativo não existe.
    if (!Number.isInteger(oficiais) || oficiais < 1) {
      setErroPos("O nº de posições oficiais precisa ser um número inteiro a partir de 1.");
      return;
    }
    if (!Number.isInteger(banco) || banco < 0) {
      setErroPos("O nº de posições de banco precisa ser um número inteiro, zero ou mais.");
      return;
    }

    setSalvandoPos(true);
    try {
      await apiFetch(`/as/vagas/${posAlvo.id}/posicoes`, {
        method: "PATCH",
        token,
        body: { posicoesOficiais: oficiais, posicoesBanco: banco },
      });
      setPosAlvo(null);
      await carregar();
    } catch (err) {
      setErroPos(err instanceof Error ? err.message : "Erro ao salvar as posições da vaga");
    } finally {
      setSalvandoPos(false);
    }
  }

  function abrirFechamento(v: VagaListItem) {
    setFecharAlvo(v);
    setErroFechar(null);
    setFechForm({
      dataFechamento: HOJE(),
      // CADA CONTAGEM NASCE NA SUA META, que é o caso mais comum (a vaga fechou o que abriu) e o que
      // dá menos digitação. A meta oficial pode ser nula no rascunho, e aí o campo nasce vazio.
      vagasFechadas: v.posicoesOficiais === null ? "" : String(v.posicoesOficiais),
      vagasFechadasBanco: String(v.posicoesBanco),
      salarioFechamento: salarioParaCampo(v.salarioAbertura),
      dataPrevistaInicio: "",
      enviarParaAdmissao: false,
    });
  }

  async function confirmarFechamento(e: FormEvent) {
    e.preventDefault();
    if (!fecharAlvo) return;
    setErroFechar(null);

    /**
     * A TRAVA EM PORTUGUÊS, e não no atributo `max` do input.
     *
     * Com `max`, quem barrava era o navegador, com a bolha nativa dele: "Value must be less than or
     * equal to 3", em inglês e fora do idioma visual do sistema. A régua é a mesma do backend, que
     * continua sendo a autoridade; aqui ela só evita a ida ao servidor, com a frase que o time lê.
     */
    const fechadas = fechForm.vagasFechadas === "" ? null : Number(fechForm.vagasFechadas);
    const fechadasBanco =
      fechForm.vagasFechadasBanco === "" ? null : Number(fechForm.vagasFechadasBanco);

    /**
     * OS DOIS LADOS CONFERIDOS SEPARADAMENTE (os dois contadores, 25/08), a mesma régua do domínio
     * (`excessoDePosicoes`): sobra no banco não autoriza contratar a mais no oficial.
     *
     * A META OFICIAL PODE SER NULA (coluna nulável desde o rascunho). Sem meta não há teto a exceder,
     * e o fechamento segue: a vaga publicada sempre tem meta, porque a régua não deixa publicar sem
     * ela. A meta de BANCO nunca é nula, e zero significa "esta vaga não reservou excedente".
     */
    if (
      fechadas !== null &&
      fecharAlvo.posicoesOficiais !== null &&
      fechadas > fecharAlvo.posicoesOficiais
    ) {
      setErroFechar(
        `A vaga tem ${fecharAlvo.posicoesOficiais} ${fecharAlvo.posicoesOficiais === 1 ? "posição oficial" : "posições oficiais"}: o número de vagas fechadas não pode ser maior que isso.`,
      );
      return;
    }
    if (fechadasBanco !== null && fechadasBanco > fecharAlvo.posicoesBanco) {
      setErroFechar(
        `A vaga tem ${fecharAlvo.posicoesBanco} ${fecharAlvo.posicoesBanco === 1 ? "posição de banco" : "posições de banco"}: o número de vagas fechadas de banco não pode ser maior que isso.`,
      );
      return;
    }

    setFechando(true);
    try {
      await apiFetch(`/as/vagas/${fecharAlvo.id}/fechar`, {
        method: "POST",
        token,
        body: {
          dataFechamento: fechForm.dataFechamento,
          vagasFechadas: fechadas ?? undefined,
          vagasFechadasBanco: fechadasBanco ?? undefined,
          salarioFechamento: fechForm.salarioFechamento || undefined,
          dataPrevistaInicio: fechForm.dataPrevistaInicio || undefined,
          enviarParaAdmissao: fechForm.enviarParaAdmissao,
        },
      });
      setFecharAlvo(null);
      await carregar();
    } catch (err) {
      setErroFechar(err instanceof Error ? err.message : "Erro ao fechar a vaga");
    } finally {
      setFechando(false);
    }
  }

  const optCargos = useMemo(
    () => opcoes.cargos.map((c) => ({ value: c.id, label: c.nome })),
    [opcoes.cargos],
  );
  const optClientes = useMemo(
    () => opcoes.clientes.map((c) => ({ value: c.codCliente, label: c.rotulo })),
    [opcoes.clientes],
  );

  const ladoOposto = contexto.papelAs ? contraparteDe(contexto.papelAs) : null;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Central De Vagas"
        subtitle="Cada linha é uma abertura de vaga, com identificador próprio do EA. O código é o número do processo seletivo, digitado à mão e único no sistema: cada nova abertura, mesmo do mesmo cliente e do mesmo cargo, tem o seu."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          {loading
            ? "Carregando as vagas."
            : `${rows.length} ${rows.length === 1 ? "vaga cadastrada" : "vagas cadastradas"}.`}
        </p>
        <Button onClick={abrirTrilha} className="py-2.5">
          Abrir vaga
        </Button>
      </div>

      {erroLista && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erroLista}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="overflow-x-auto">
          {/* ITEM 8: A LISTA DEIXOU DE SER UM EXCEL.
              Eram 13 colunas, e ler uma linha exigia rolagem lateral: a tela pedia 1560px de largura
              e a vaga era falada em 7 dados. Ficaram só os que identificam a vaga na fila (código,
              nome, cliente, cargo, vínculo, posições e status). Todo o RESTO não sumiu: mora no
              modal do olho, que abre a vaga completa.

              §A.12/§A.20: cabeçalhos centralizados, larguras proporcionais, sem coluna esmagada.
              Com 8 colunas em vez de 13, cada uma cabe sem apertar e a tabela não rola mais na
              horizontal na largura normal da tela. */}
          <table className="ds-table min-w-[960px]">
            <thead>
              <tr>
                <th className="w-[9%] text-center">Código</th>
                <th className="w-[21%] text-center">Vaga</th>
                <th className="w-[15%] text-center">Cliente</th>
                <th className="w-[14%] text-center">Cargo Da Vaga</th>
                <th className="w-[10%] text-center">Vínculo</th>
                {/* §A.20: a coluna ganhou espaço porque passou a carregar DOIS contadores, um por
                    linha. Com os 7% de antes, "Oficiais: 6 de 10" quebraria no meio da palavra. */}
                <th className="w-[14%] text-center">Posições</th>
                <th className="w-[9%] text-center">Status</th>
                <th className="w-[8%] text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Nenhuma vaga cadastrada ainda. Use o botão Abrir vaga.
                  </td>
                </tr>
              ) : (
                rows.map((v) => (
                  <tr key={v.id}>
                    {/* O RASCUNHO PODE NÃO TER PREENCHIDO ESTAS COLUNAS AINDA, e a célula vazia diz
                        "não informado" (§A.11), nunca um traço nem um espaço em branco que o leitor
                        confunde com erro de carregamento. */}
                    <td className="text-center font-mono text-[12.5px]">
                      {v.codigo ?? "não informado"}
                    </td>
                    <td className="font-semibold">{v.nomeDivulgacao ?? "não informado"}</td>
                    <td className="text-center">{v.clienteNome ?? "não informado"}</td>
                    <td className="text-center">{v.cargoNome ?? "não informado"}</td>
                    <td className="text-center">
                      {v.vinculo ? VAGA_VINCULO_LABEL[v.vinculo] : "não informado"}
                    </td>
                    {/* OS DOIS CONTADORES NA MESMA COLUNA, um por linha: o oficial em cima, com o
                        peso do texto normal, e o banco embaixo, mais discreto, porque é o excedente
                        reservado e não a contratação de verdade. */}
                    <td className="text-center">
                      <div className="flex flex-col items-center gap-0.5 leading-tight">
                        <span className="whitespace-nowrap">
                          {textoContador("Oficiais", v.posicoesOficiais, v.vagasFechadas)}
                        </span>
                        <span className="whitespace-nowrap text-[12px] text-dim">
                          {textoContador("Banco", v.posicoesBanco, v.vagasFechadasBanco)}
                        </span>
                      </div>
                    </td>
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <StatusPill
                          tone={TOM_STATUS[v.status]}
                          label={VAGA_STATUS_LABEL[v.status]}
                        />
                      </span>
                    </td>
                    {/* AÇÕES SÓ EM ÍCONE, sem texto. Cada uma leva `title` e `aria-label` com a
                        frase inteira: o ícone é o atalho de quem já conhece a tela, e o rótulo
                        continua alcançável por quem passa o mouse e por leitor de tela. */}
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        {v.status === "ABERTA" && (
                          <button
                            type="button"
                            title="Fechar vaga"
                            aria-label={`Fechar a vaga ${rotuloDaVaga(v)}`}
                            onClick={() => abrirFechamento(v)}
                            className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
                          >
                            <Icon name="lock" className="h-4 w-4" />
                          </button>
                        )}
                        {/* EDITAR AS POSIÇÕES (os dois contadores, 25/08): aparece na vaga que
                            ainda está viva e fora do rascunho. No RASCUNHO os dois campos já são
                            editados na própria trilha, e na vaga ENCERRADA a meta não muda mais,
                            porque ela já foi confrontada com a contagem do fechamento. */}
                        {(v.status === "ABERTA" || v.status === "VAGA_BANCO") && (
                          <button
                            type="button"
                            title="Editar as posições da vaga"
                            aria-label={`Editar as posições da vaga ${rotuloDaVaga(v)}`}
                            onClick={() => abrirPosicoes(v)}
                            className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
                          >
                            <Icon name="users" className="h-4 w-4" />
                          </button>
                        )}
                        {/* CONTINUAR O RASCUNHO (item 3): só o rascunho tem lápis, porque só ele
                            volta para a trilha. Vaga publicada não é editada por aqui. */}
                        {v.status === "RASCUNHO" && (
                          <button
                            type="button"
                            title="Continuar o rascunho"
                            aria-label={`Continuar o rascunho da vaga ${rotuloDaVaga(v)}`}
                            onClick={() => continuarRascunho(v)}
                            className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
                          >
                            <Icon name="pen" className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Ver a vaga completa"
                          aria-label={`Ver a vaga ${rotuloDaVaga(v)} completa`}
                          onClick={() => setVerAlvo(v)}
                          className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
                        >
                          <Icon name="eye" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Clonar a vaga"
                          aria-label={`Clonar a vaga ${rotuloDaVaga(v)}`}
                          onClick={() => clonarVaga(v)}
                          className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
                        >
                          <Icon name="copy" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ── TRILHA DE ABERTURA ────────────────────────────────────────────── */}
      {aberto && (
        <Modal
          onClose={pedirParaSair}
          className="max-w-[1100px] p-0"
          ariaLabel="Abrir vaga"
        >
          <form onSubmit={salvar} className="flex max-h-[86vh] flex-col">
            {/* TOPO FIXO: título e Stepper nunca saem da vista, então a pessoa sempre sabe onde está. */}
            <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
              <div className="eyebrow !mb-1">Atração e Seleção</div>
              <h2 className="mb-4 text-lg font-semibold text-text">Abrir Vaga</h2>
              <Stepper steps={STEPS} current={step} />
            </div>

            {/* MIOLO ROLANDO: só os campos do passo atual. */}
            <div ref={mioloRef} className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
              {/*
                O QUE FALTA PARA PUBLICAR (item 4): a lista INTEIRA, cada linha com o passo e o nome
                do campo, e cada linha CLICÁVEL para cair direto nele. Aparece só depois de a pessoa
                tentar publicar, e some sozinha assim que ela preenche o que faltava.
              */}
              {pendencias.length > 0 && pendenciasAgora.length > 0 && (
                <div
                  className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-3"
                  role="alert"
                >
                  <p className="mb-2 text-sm font-semibold text-danger">
                    Falta preencher para publicar a vaga
                  </p>
                  <ul className="flex flex-col gap-1">
                    {pendenciasAgora.map((pendencia) => (
                      <li key={pendencia.campo}>
                        <button
                          type="button"
                          onClick={() => irParaPendencia(pendencia)}
                          className="text-left text-sm text-danger underline decoration-dotted underline-offset-4 transition hover:decoration-solid"
                        >
                          {textoPendencia(pendencia)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[12.5px] text-dim">
                    Clique no item para ir ao campo. Se ainda não tem a informação, salve como
                    rascunho e volte depois.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {step === 0 && (
                  <>
                    <CampoSelect rotulo="Cliente" largo>
                      {/* NULÁVEL de propósito: vaga sem cliente vinculado entra e não trava nada. */}
                      {/*
                        PRIMEIRO CAMPO NO SELETOR PREMIUM DO A&S (Combobox). É o campo certo para
                        estrear: a lista de clientes é a mais longa da trilha, então ele exercita
                        busca por digitação, navegação por teclado e o botão de limpar de uma vez.
                        Os demais seletores da trilha seguem no Select do DS até o diretor aprovar
                        este visual.
                      */}
                      <Combobox
                        value={form.codCliente}
                        onChange={escolherCliente}
                        options={optClientes}
                        searchable
                        limpavel
                        placeholder="Sem cliente vinculado"
                        ariaLabel="Cliente da vaga"
                      />
                    </CampoSelect>

                    <Campo rotulo="Código da vaga" obrigatorio id="vaga-codigo">
                      <input
                        value={form.codigo}
                        onChange={(e) => set("codigo", e.target.value)}
                        placeholder="Ex.: 511805"
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="Nome de divulgação" largo obrigatorio id="vaga-nome-divulgacao">
                      <input
                        value={form.nomeDivulgacao}
                        onChange={(e) => set("nomeDivulgacao", e.target.value)}
                        placeholder="Como a vaga é anunciada"
                        className="ds-input"
                      />
                    </Campo>

                    <CampoSelect rotulo="Cargo" obrigatorio id="vaga-cargo">
                      {/* O seletor SUGERE e não bloqueia: o catálogo inteiro fica alcançável pela busca. */}
                      <Select
                        value={form.cargoId}
                        onChange={(v) => set("cargoId", v)}
                        options={optCargos}
                        searchable
                        placeholder="Selecionar cargo"
                        ariaLabel="Cargo da vaga"
                      />
                    </CampoSelect>

                    {/* OS DOIS CONTADORES DA VAGA (decisão do diretor, 25/08), lado a lado no passo
                        em que a vaga é dimensionada: OFICIAIS são as contratações de verdade, BANCO é
                        o excedente aprovado que fica reservado (o caso Blue Skies, 10 e 10).

                        SÓ O OFICIAL É OBRIGATÓRIO: vaga sem contratação não é vaga, mas vaga sem
                        banco é a maioria delas, e cobrar o banco transformaria o estado normal em
                        pendência de publicação. */}
                    <Campo rotulo="Nº de posições oficiais" obrigatorio id="vaga-posicoes-oficiais">
                      <input
                        type="number"
                        min={1}
                        value={form.posicoesOficiais}
                        onChange={(e) => set("posicoesOficiais", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="Nº de posições de banco" id="vaga-posicoes-banco">
                      <input
                        type="number"
                        min={0}
                        value={form.posicoesBanco}
                        onChange={(e) => set("posicoesBanco", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    <CampoSelect rotulo="Natureza" obrigatorio id="vaga-natureza">
                      <Select
                        value={form.natureza}
                        onChange={(v) => set("natureza", v)}
                        options={VAGA_NATUREZA.map((n) => ({
                          value: n,
                          label: VAGA_NATUREZA_LABEL[n],
                        }))}
                        ariaLabel="Natureza da vaga"
                      />
                    </CampoSelect>

                    <CampoSelect rotulo="Sazonalidade" obrigatorio id="vaga-sazonalidade">
                      <Select
                        value={form.sazonalidade}
                        onChange={(v) => set("sazonalidade", v)}
                        options={VAGA_SAZONALIDADE.map((s) => ({
                          value: s,
                          label: VAGA_SAZONALIDADE_LABEL[s],
                        }))}
                        ariaLabel="Sazonalidade da vaga"
                      />
                    </CampoSelect>

                    <CampoSelect rotulo="Status" obrigatorio id="vaga-status">
                      <Select
                        value={form.status}
                        onChange={(v) => set("status", v)}
                        /*
                          RASCUNHO FICA DE FORA DA LISTA (item 3): ele é o BOTÃO "Salvar Rascunho",
                          não uma escolha de status. Oferecê-lo aqui criaria dois caminhos para o
                          mesmo estado, e o segundo publicaria uma vaga chamando-a de rascunho.
                        */
                        options={VAGA_STATUS.filter((s) => s !== "RASCUNHO").map((s) => ({
                          value: s,
                          label: VAGA_STATUS_LABEL[s],
                        }))}
                        ariaLabel="Status da vaga"
                      />
                    </CampoSelect>
                  </>
                )}

                {step === 1 && (
                  <>
                    <Campo rotulo="Nome do solicitante ou contato focal" largo>
                      <input
                        value={form.solicitanteNome}
                        onChange={(e) => set("solicitanteNome", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="Telefone do solicitante">
                      <input
                        value={form.solicitanteTelefone}
                        onChange={(e) => set("solicitanteTelefone", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="E-mail do solicitante">
                      <input
                        type="email"
                        value={form.solicitanteEmail}
                        onChange={(e) => set("solicitanteEmail", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="Data de solicitação">
                      <input
                        type="date"
                        value={form.dataSolicitacao}
                        onChange={(e) => set("dataSolicitacao", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="Data de alinhamento da vaga">
                      <input
                        type="date"
                        value={form.dataAlinhamento}
                        onChange={(e) => set("dataAlinhamento", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="Data de abertura" obrigatorio id="vaga-data-abertura">
                      <input
                        type="date"
                        value={form.dataAbertura}
                        onChange={(e) => set("dataAbertura", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    {/* DATA LIMITE EM QUALQUER VAGA (correção de 21/08): a amarração com a vaga
                        sazonal foi removida, qualquer natureza pode ter prazo. */}
                    <Campo rotulo="Data limite">
                      <input
                        type="date"
                        value={form.dataLimite}
                        onChange={(e) => set("dataLimite", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="Envio da shortlist">
                      <input
                        type="date"
                        value={form.envioShortlist}
                        onChange={(e) => set("envioShortlist", e.target.value)}
                        className="ds-input"
                      />
                    </Campo>
                  </>
                )}

                {step === 2 && (
                  <>
                    {/* OS DOIS LADOS DA VAGA. O lado de quem abre é carimbado sozinho e aparece só
                        como informação; a trilha pede um seletor, o do lado oposto. */}
                    <div className="md:col-span-2">
                      {contexto.papelAs ? (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                          <p className="text-[12.5px] text-dim">
                            Você abre esta vaga como{" "}
                            <strong className="text-text">
                              {PAPEL_AS_LABEL[contexto.papelAs]}
                            </strong>
                            . O outro lado é quem você escolher abaixo.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-4 py-3">
                          <p className="text-[12.5px] text-danger">
                            Seu usuário ainda não tem papel de A&S. Peça ao administrador para
                            definir Consultor ou Recruiter no seu cadastro antes de abrir a vaga.
                          </p>
                        </div>
                      )}
                    </div>

                    {ladoOposto && (
                      <CampoSelect rotulo={PAPEL_AS_LABEL[ladoOposto]} largo>
                        <Select
                          value={form.contraparteId}
                          onChange={(v) => set("contraparteId", v)}
                          options={[
                            { value: "", label: "não informado" },
                            ...contexto.contraparte.map((p) => ({ value: p.id, label: p.nome })),
                          ]}
                          searchable
                          placeholder={`Selecionar ${PAPEL_AS_LABEL[ladoOposto].toLowerCase()}`}
                          ariaLabel={`${PAPEL_AS_LABEL[ladoOposto]} da vaga`}
                        />
                      </CampoSelect>
                    )}

                    <CampoSelect rotulo="Vínculo">
                      <Select
                        value={form.vinculo}
                        onChange={(v) => set("vinculo", v)}
                        options={[
                          { value: "", label: "não informado" },
                          ...VAGA_VINCULO.map((v) => ({
                            value: v,
                            label: VAGA_VINCULO_LABEL[v],
                          })),
                        ]}
                        ariaLabel="Vínculo da contratação"
                      />
                    </CampoSelect>

                    {/* ITEM 2: TEMPO DE CONTRATO SÓ EM VÍNCULO COM PRAZO (temporário, estágio,
                        jovem aprendiz). Perguntar quantos dias dura uma vaga EFETIVA é pedir o que
                        não tem resposta, e o campo ficava vazio em toda vaga efetiva. A régua é a
                        mesma do backend (`exigeTempoContrato`), que também recusa gravar o prazo
                        fora desses vínculos: esconder na tela sem zerar no servidor deixaria prazo
                        órfão gravado numa vaga sem prazo. */}
                    {exigeTempoContrato(form.vinculo) && (
                      <CampoSelect rotulo="Tempo de contrato">
                        <Select
                          value={form.tempoContrato}
                          onChange={(v) => set("tempoContrato", v)}
                          options={[
                            { value: "", label: "não informado" },
                            ...VAGA_TEMPO_CONTRATO.map((t) => ({
                              value: t,
                              label: rotuloTempoContrato(t),
                            })),
                          ]}
                          ariaLabel="Tempo de contrato"
                        />
                      </CampoSelect>
                    )}

                    <CampoSelect rotulo="Motivo da contratação">
                      <Select
                        value={form.motivo}
                        onChange={(v) => set("motivo", v)}
                        options={[
                          { value: "", label: "não informado" },
                          ...opcoes.motivos.map((m) => ({ value: m, label: m })),
                        ]}
                        ariaLabel="Motivo da contratação"
                      />
                    </CampoSelect>

                    <Campo rotulo="Justificativa do motivo">
                      <input
                        value={form.justificativaMotivo}
                        onChange={(e) => set("justificativaMotivo", e.target.value)}
                        placeholder="Ex.: demanda de pedidos"
                        className="ds-input"
                      />
                    </Campo>

                    {/* O bloco de substituição NASCE ESCONDIDO e abre sozinho: campo que não se
                        aplica não ocupa espaço na tela. */}
                    {form.motivo === MOTIVO_SUBSTITUICAO && (
                      <>
                        <CampoSelect rotulo="Tipo de substituição">
                          <Select
                            value={form.tipoSubstituicao}
                            onChange={(v) => set("tipoSubstituicao", v)}
                            options={[
                              { value: "", label: "não informado" },
                              ...VAGA_TIPO_SUBSTITUICAO.map((t) => ({
                                value: t,
                                label: VAGA_TIPO_SUBSTITUICAO_LABEL[t],
                              })),
                            ]}
                            ariaLabel="Tipo de substituição"
                          />
                        </CampoSelect>

                        <Campo rotulo="Nome do substituído">
                          <input
                            value={form.substituidoNome}
                            onChange={(e) => set("substituidoNome", e.target.value)}
                            className="ds-input"
                          />
                        </Campo>

                        {/* ITEM 3: o CPF abre JUNTO do nome e PERSISTE (decisão do diretor). É
                            exigência legal: o time de cadastro do ADM precisa do número para a
                            folha e o eSocial. A máscara é da tela, os 11 dígitos é o que viaja, e
                            quem confere se o dígito fecha é o backend. */}
                        <Campo rotulo="CPF do substituído">
                          <input
                            inputMode="numeric"
                            value={form.substituidoCpf}
                            onChange={(e) => set("substituidoCpf", formatCpf(e.target.value))}
                            placeholder="000.000.000-00"
                            className="ds-input"
                          />
                        </Campo>

                        <p className="text-[12px] text-faint md:col-span-2">
                          O CPF do substituído fica guardado na vaga por exigência legal, para o
                          cadastro do ADM.
                        </p>
                      </>
                    )}
                  </>
                )}

                {step === 3 && (
                  <>
                    <Campo rotulo="Salário de abertura">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-faint">
                          R$
                        </span>
                        <input
                          inputMode="decimal"
                          value={form.salarioAbertura}
                          onChange={(e) => set("salarioAbertura", maskMoedaBR(e.target.value))}
                          placeholder="2.500,00"
                          className="ds-input pl-9"
                        />
                      </div>
                    </Campo>

                    <CampoSelect rotulo="Modelo de trabalho">
                      <Select
                        value={form.modeloTrabalho}
                        onChange={(v) => set("modeloTrabalho", v)}
                        options={[
                          { value: "", label: "não informado" },
                          ...VAGA_MODELO_TRABALHO.map((m) => ({
                            value: m,
                            label: VAGA_MODELO_TRABALHO_LABEL[m],
                          })),
                        ]}
                        ariaLabel="Modelo de trabalho"
                      />
                    </CampoSelect>

                    {form.modeloTrabalho === "HIBRIDO" && (
                      <>
                        {/* ITEM 6: lista fechada, com "Outro" abrindo o texto ao lado. Só existe
                            dentro do modelo HÍBRIDO, e o backend descarta o valor fora dele. */}
                        <CampoSelect rotulo="Detalhe do híbrido">
                          <Select
                            value={form.detalheHibridoOpcao}
                            onChange={(v) => set("detalheHibridoOpcao", v)}
                            options={[
                              { value: "", label: "não informado" },
                              ...VAGA_DETALHE_HIBRIDO.map((d) => ({ value: d, label: d })),
                            ]}
                            ariaLabel="Detalhe do híbrido"
                          />
                        </CampoSelect>

                        {form.detalheHibridoOpcao === OPCAO_OUTRO && (
                          <Campo rotulo="Qual é o detalhe do híbrido">
                            <input
                              value={form.detalheHibridoOutro}
                              onChange={(e) => set("detalheHibridoOutro", e.target.value)}
                              placeholder="O que a lista acima não cobre"
                              className="ds-input"
                            />
                          </Campo>
                        )}
                      </>
                    )}

                    <Campo rotulo="Local de trabalho" largo>
                      <textarea
                        value={form.localTrabalho}
                        onChange={(e) => set("localTrabalho", e.target.value)}
                        className="ds-input min-h-[64px] resize-y"
                      />
                    </Campo>

                    {/* ITEM 7: REGIÃO NÍVEL BRASIL, EM DUAS LISTAS ENCADEADAS. Primeiro o estado,
                        e só então as regiões DELE, em seleção múltipla. Somadas, as regiões dos 27
                        estados passam de 250: numa lista única, achar "Zona Leste" seria rolar o
                        país inteiro. */}
                    <CampoSelect rotulo="Estado da abordagem">
                      <Select
                        value={form.regiaoEstado}
                        onChange={escolherEstado}
                        options={[
                          { value: "", label: "não informado" },
                          ...UFS.map((u) => ({ value: u.uf, label: `${u.uf} - ${u.nome}` })),
                        ]}
                        ariaLabel="Estado da abordagem"
                      />
                    </CampoSelect>

                    {/* A SEGUNDA LISTA NASCE FECHADA e só abre com o estado escolhido: oferecer
                        região sem saber de que estado ela é seria oferecer as 250 de uma vez. */}
                    <CampoSelect rotulo="Regiões possíveis para abordagem">
                      {form.regiaoEstado ? (
                        <MultiSelect
                          values={form.regioes}
                          onChange={(v) => set("regioes", v)}
                          options={regioesDaUf(form.regiaoEstado).map((r) => ({
                            value: r,
                            label: r,
                          }))}
                          placeholder="Selecionar as regiões"
                          ariaLabel="Regiões possíveis para abordagem"
                        />
                      ) : (
                        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[12.5px] text-faint">
                          Escolha o estado ao lado para ver as regiões.
                        </p>
                      )}
                    </CampoSelect>

                    {form.regioes.includes(REGIAO_OUTRAS) && (
                      <Campo rotulo="Quais outras regiões" largo>
                        <input
                          value={form.regioesOutras}
                          onChange={(e) => set("regioesOutras", e.target.value)}
                          placeholder="O que a lista acima não cobre"
                          className="ds-input"
                        />
                      </Campo>
                    )}

                    {/* ITEM 5: HORÁRIO E ESCALA VEM DO CADASTRO DO MENU GERENCIAL, o mesmo
                        `escalas_catalogo` da tela /admin/escalas e da Liberação. Reusado sem tocar
                        nele, e servido pelo próprio módulo de A&S porque `/catalogos` é área ADM.

                        A LISTA TEM BUSCA POR DIGITAÇÃO (o Select liga sozinho acima de 8 opções, e
                        aqui são 153), porque o catálogo guarda o horário POR EXTENSO de cada
                        operação, não siglas de escala.

                        "OUTRA ESCALA" abre o texto, e o que for escrito ali NÃO entra no catálogo,
                        por decisão do diretor: fica na vaga. */}
                    <CampoSelect rotulo="Horário e escala" largo>
                      <Select
                        value={form.horarioEscalaOpcao}
                        onChange={(v) => set("horarioEscalaOpcao", v)}
                        options={[
                          { value: "", label: "não informado" },
                          ...opcoes.escalas.map((e) => ({ value: e, label: e })),
                          { value: ESCALA_OUTRA, label: ESCALA_OUTRA },
                        ]}
                        searchable
                        menuFit
                        ariaLabel="Horário e escala"
                      />
                    </CampoSelect>

                    {form.horarioEscalaOpcao === ESCALA_OUTRA && (
                      <Campo rotulo="Qual é a escala" largo>
                        <textarea
                          value={form.horarioEscalaOutra}
                          onChange={(e) => set("horarioEscalaOutra", e.target.value)}
                          placeholder="Escreva o horário e a escala desta vaga"
                          className="ds-input min-h-[64px] resize-y"
                        />
                      </Campo>
                    )}

                    <div className="flex flex-wrap gap-3 md:col-span-2">
                      <label className="flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                        <input
                          type="checkbox"
                          checked={form.confidencial}
                          onChange={(e) => set("confidencial", e.target.checked)}
                        />
                        <span className="text-sm text-text">Vaga confidencial</span>
                      </label>
                      <label className="flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                        <input
                          type="checkbox"
                          checked={form.divulgarEmpresa}
                          onChange={(e) => set("divulgarEmpresa", e.target.checked)}
                        />
                        <span className="text-sm text-text">
                          Autorizado divulgar o nome da empresa
                        </span>
                      </label>
                    </div>

                    {/* BENEFÍCIOS DO CADASTRO QUE JÁ EXISTE, cada um com o SEU valor: marcou, o campo
                        de valor acende ao lado, e benefício que não pede valor fica só marcado. É a
                        mesma mecânica da tela de Benefícios. */}
                    <div className="md:col-span-2">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="text-[12.5px] text-dim">Benefícios da vaga</span>
                        <span className="text-[11.5px] text-faint">
                          {Object.values(beneficios).filter((b) => b.marcado).length} selecionado(s)
                        </span>
                      </div>
                      {opcoes.beneficios.length === 0 ? (
                        <p className="text-[12.5px] text-faint">
                          Nenhum benefício ativo no cadastro de benefícios.
                        </p>
                      ) : (
                        <div className="ea-scroll grid max-h-[30vh] grid-cols-1 gap-1.5 overflow-y-auto md:grid-cols-2">
                          {opcoes.beneficios.map((b) => {
                            const item = beneficios[b.id] ?? { marcado: false, valor: "" };
                            return (
                              <label
                                key={b.id}
                                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={item.marcado}
                                  onChange={(e) =>
                                    setBeneficios((atual) => ({
                                      ...atual,
                                      [b.id]: { ...item, marcado: e.target.checked },
                                    }))
                                  }
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-text">
                                  {b.nome}
                                </span>
                                {b.exigeValor && (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={item.valor}
                                    onChange={(e) =>
                                      setBeneficios((atual) => ({
                                        ...atual,
                                        [b.id]: {
                                          ...item,
                                          valor: maskMoedaBR(e.target.value),
                                        },
                                      }))
                                    }
                                    disabled={!item.marcado}
                                    placeholder="valor"
                                    aria-label={`Valor de ${b.nome}`}
                                    className="h-9 w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-right text-sm text-text outline-none transition placeholder:text-faint focus:border-[var(--accent)] disabled:opacity-40"
                                  />
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <CampoSelect rotulo="Escolaridade">
                      <Select
                        value={form.escolaridade}
                        onChange={(v) => set("escolaridade", v)}
                        options={[
                          { value: "", label: "não informado" },
                          ...VAGA_ESCOLARIDADE.map((e) => ({
                            value: e,
                            label: VAGA_ESCOLARIDADE_LABEL[e],
                          })),
                        ]}
                        ariaLabel="Escolaridade exigida"
                      />
                    </CampoSelect>

                    {/* ITEM 6: lista fechada, "Outra" abre o texto. "Indiferente" é RESPOSTA, e
                        não ausência de resposta: quem não escolheu nada segue em "não informado". */}
                    <CampoSelect rotulo="Faixa etária">
                      <Select
                        value={form.faixaEtariaOpcao}
                        onChange={(v) => set("faixaEtariaOpcao", v)}
                        options={[
                          { value: "", label: "não informado" },
                          ...VAGA_FAIXA_ETARIA.map((f) => ({ value: f, label: f })),
                        ]}
                        ariaLabel="Faixa etária"
                      />
                    </CampoSelect>

                    {form.faixaEtariaOpcao === OPCAO_OUTRA && (
                      <Campo rotulo="Qual é a faixa etária">
                        <input
                          value={form.faixaEtariaOutra}
                          onChange={(e) => set("faixaEtariaOutra", e.target.value)}
                          placeholder="O que a lista acima não cobre"
                          className="ds-input"
                        />
                      </Campo>
                    )}

                    <CampoSelect rotulo="Gênero">
                      <Select
                        value={form.genero}
                        onChange={(v) => set("genero", v)}
                        options={VAGA_GENERO.map((g) => ({ value: g, label: VAGA_GENERO_LABEL[g] }))}
                        ariaLabel="Gênero"
                      />
                    </CampoSelect>

                    {/* ITEM 6: seleção MÚLTIPLA. Era texto, e "inglês avançado", "Inglês/Espanhol"
                        e "ingles basico" eram três grafias da mesma exigência, nenhuma filtrável. */}
                    <CampoSelect rotulo="Idiomas">
                      <MultiSelect
                        values={form.idiomas}
                        onChange={(v) => set("idiomas", v)}
                        options={VAGA_IDIOMAS.map((i) => ({ value: i, label: i }))}
                        placeholder="Selecionar os idiomas"
                        ariaLabel="Idiomas"
                      />
                    </CampoSelect>

                    {form.idiomas.includes(OPCAO_OUTROS) && (
                      <Campo rotulo="Quais outros idiomas" largo>
                        <input
                          value={form.idiomasOutros}
                          onChange={(e) => set("idiomasOutros", e.target.value)}
                          placeholder="O que a lista acima não cobre"
                          className="ds-input"
                        />
                      </Campo>
                    )}

                    <Campo rotulo="Cursos e conhecimentos necessários" largo>
                      <textarea
                        value={form.cursosConhecimentos}
                        onChange={(e) => set("cursosConhecimentos", e.target.value)}
                        className="ds-input min-h-[64px] resize-y"
                      />
                    </Campo>

                    <div className="md:col-span-2">
                      <span className="mb-1.5 block text-[12.5px] text-dim">
                        Aplicação de testes
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                        {VAGA_TESTES.map((t) => (
                          <label
                            key={t}
                            className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                          >
                            <input
                              type="checkbox"
                              checked={testes.includes(t)}
                              onChange={(e) =>
                                setTestes((atual) =>
                                  e.target.checked
                                    ? [...atual, t]
                                    : atual.filter((x) => x !== t),
                                )
                              }
                            />
                            <span className="text-sm text-text">{VAGA_TESTE_LABEL[t]}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <Campo rotulo="Outro teste" largo>
                      <input
                        value={form.testesOutro}
                        onChange={(e) => set("testesOutro", e.target.value)}
                        placeholder="O que a lista acima não cobre"
                        className="ds-input"
                      />
                    </Campo>

                    <Campo rotulo="Experiência necessária" largo>
                      <textarea
                        value={form.experiencia}
                        onChange={(e) => set("experiencia", e.target.value)}
                        className="ds-input min-h-[64px] resize-y"
                      />
                    </Campo>

                    <Campo rotulo="Principais atribuições e responsabilidades" largo>
                      <textarea
                        value={form.atribuicoes}
                        onChange={(e) => set("atribuicoes", e.target.value)}
                        className="ds-input min-h-[80px] resize-y"
                      />
                    </Campo>

                    <Campo rotulo="Perfil comportamental" largo>
                      <textarea
                        value={form.perfilComportamental}
                        onChange={(e) => set("perfilComportamental", e.target.value)}
                        className="ds-input min-h-[64px] resize-y"
                      />
                    </Campo>

                    <Campo rotulo="Ambiente em que o profissional será inserido" largo>
                      <textarea
                        value={form.ambiente}
                        onChange={(e) => set("ambiente", e.target.value)}
                        className="ds-input min-h-[64px] resize-y"
                      />
                    </Campo>

                    {/* ITEM 6: seleção MÚLTIPLA, na ordem em que as etapas costumam acontecer e
                        não em ordem alfabética, porque é assim que o time lê o processo. */}
                    <CampoSelect rotulo="Etapas do processo seletivo com a empresa" largo>
                      <MultiSelect
                        values={form.etapasPs}
                        onChange={(v) => set("etapasPs", v)}
                        options={VAGA_ETAPAS_PS.map((e) => ({ value: e, label: e }))}
                        placeholder="Selecionar as etapas"
                        ariaLabel="Etapas do processo seletivo com a empresa"
                      />
                    </CampoSelect>

                    {form.etapasPs.includes(OPCAO_OUTRA) && (
                      <Campo rotulo="Qual é a outra etapa" largo>
                        <input
                          value={form.etapasPsOutra}
                          onChange={(e) => set("etapasPsOutra", e.target.value)}
                          placeholder="O que a lista acima não cobre"
                          className="ds-input"
                        />
                      </Campo>
                    )}

                    <Campo rotulo="Observações" largo>
                      <textarea
                        value={form.observacoes}
                        onChange={(e) => set("observacoes", e.target.value)}
                        className="ds-input min-h-[64px] resize-y"
                      />
                    </Campo>
                  </>
                )}
              </div>

              {erroForm && (
                <p
                  className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
                  role="alert"
                >
                  {erroForm}
                </p>
              )}
            </div>

            {/* RODAPÉ FIXO: navegação sempre no mesmo lugar, com a posição na trilha no meio. */}
            <div className="flex flex-none items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => (step === 0 ? pedirParaSair() : setStep((s) => s - 1))}
                disabled={salvando}
              >
                {step === 0 ? "Cancelar" : "Voltar"}
              </Button>

              <span className="text-[12.5px] text-dim">
                Passo {step + 1} de {STEPS.length}
              </span>

              <div className="flex items-center gap-3">
                {/*
                  SALVAR RASCUNHO EM QUALQUER PASSO (item 3): a vaga que o consultor ainda não tem
                  como completar sai da cabeça dele e entra no sistema, sem cobrar nada.
                */}
                <Button type="button" variant="secondary" onClick={() => void enviar(false)} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar Rascunho"}
                </Button>

                {step < STEPS.length - 1 ? (
                  <Button key="continuar" type="button" onClick={() => setStep((s) => s + 1)}>
                    {/*
                      NAVEGAÇÃO LIVRE (item 2, mudança de regra do diretor): NENHUM passo trava o
                      avanço, nem o passo 1. A trava dos obrigatórios saiu daqui e foi para o
                      publicar, que é o momento em que ela significa alguma coisa.
                    */}
                    Continuar
                  </Button>
                ) : (
                  <Button key="abrir" type="submit" disabled={salvando}>
                    {salvando
                      ? "Publicando…"
                      : editandoId
                        ? "Publicar Vaga"
                        : "Abrir Vaga"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={confirmarDescarte}
        title="Descartar Esta Vaga?"
        message="Você preencheu campos que ainda não foram salvos. Se sair agora, eles se perdem."
        confirmLabel="Descartar"
        cancelLabel="Continuar preenchendo"
        tone="danger"
        onConfirm={() => {
          setConfirmarDescarte(false);
          setAberto(false);
        }}
        onCancel={() => setConfirmarDescarte(false)}
      />

      {/* ── EDITAR AS POSIÇÕES ────────────────────────────────────────────── */}
      {posAlvo && (
        <Modal
          onClose={() => setPosAlvo(null)}
          className="max-w-[480px] p-6"
          ariaLabel="Editar as posições da vaga"
        >
          <form onSubmit={confirmarPosicoes}>
            <div className="mb-5">
              <div className="eyebrow !mb-1">Atração e Seleção</div>
              <h2 className="text-lg font-semibold text-text">Editar Posições</h2>
              <p className="mt-1 text-[12.5px] text-dim">
                {posAlvo.nomeDivulgacao ?? "não informado"}, código{" "}
                {posAlvo.codigo ?? "não informado"}. Oficiais são as contratações de verdade, banco é
                o excedente aprovado que fica reservado.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Campo rotulo="Nº de posições oficiais" obrigatorio>
                <input
                  type="number"
                  min={1}
                  value={posForm.oficiais}
                  onChange={(e) => setPosForm({ ...posForm, oficiais: e.target.value })}
                  className="ds-input"
                />
              </Campo>

              <Campo rotulo="Nº de posições de banco">
                <input
                  type="number"
                  min={0}
                  value={posForm.banco}
                  onChange={(e) => setPosForm({ ...posForm, banco: e.target.value })}
                  className="ds-input"
                />
              </Campo>
            </div>

            {erroPos && (
              <p
                className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
                role="alert"
              >
                {erroPos}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPosAlvo(null)}
                disabled={salvandoPos}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoPos}>
                {salvandoPos ? "Salvando…" : "Salvar posições"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── FECHAR VAGA ───────────────────────────────────────────────────── */}
      {fecharAlvo && (
        <Modal
          onClose={() => setFecharAlvo(null)}
          className="max-w-[560px] p-6"
          ariaLabel="Fechar vaga"
        >
          <form onSubmit={confirmarFechamento}>
            <div className="mb-5">
              <div className="eyebrow !mb-1">Atração e Seleção</div>
              <h2 className="text-lg font-semibold text-text">Fechar Vaga</h2>
              <p className="mt-1 text-[12.5px] text-dim">
                {fecharAlvo.nomeDivulgacao}, código {fecharAlvo.codigo}, com{" "}
                {fecharAlvo.posicoesOficiais ?? "não informado"}{" "}
                {fecharAlvo.posicoesOficiais === 1 ? "posição oficial" : "posições oficiais"}
                {fecharAlvo.posicoesBanco > 0
                  ? ` e ${fecharAlvo.posicoesBanco} ${fecharAlvo.posicoesBanco === 1 ? "posição de banco" : "posições de banco"}`
                  : ""}
                .
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Campo rotulo="Data do fechamento" obrigatorio>
                <input
                  required
                  type="date"
                  value={fechForm.dataFechamento}
                  onChange={(e) => setFechForm({ ...fechForm, dataFechamento: e.target.value })}
                  className="ds-input"
                />
              </Campo>

              <Campo rotulo="Nº de vagas fechadas">
                {/* A trava vive também no backend, que conhece a meta; aqui ela só evita a ida ao
                    servidor para dizer o que a tela já sabe. */}
                <input
                  type="number"
                  min={0}
                  value={fechForm.vagasFechadas}
                  onChange={(e) => setFechForm({ ...fechForm, vagasFechadas: e.target.value })}
                  className="ds-input"
                />
              </Campo>

              {/* O FECHAMENTO DO BANCO SÓ APARECE NA VAGA QUE RESERVOU BANCO. Com meta zero, o campo
                  seria um controle que só sabe recusar o que a pessoa digitar nele. */}
              {fecharAlvo.posicoesBanco > 0 && (
                <Campo rotulo="Nº de vagas fechadas de banco">
                  <input
                    type="number"
                    min={0}
                    value={fechForm.vagasFechadasBanco}
                    onChange={(e) =>
                      setFechForm({ ...fechForm, vagasFechadasBanco: e.target.value })
                    }
                    className="ds-input"
                  />
                </Campo>
              )}

              <Campo rotulo="Salário de fechamento">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12.5px] text-faint">
                    R$
                  </span>
                  <input
                    inputMode="decimal"
                    value={fechForm.salarioFechamento}
                    onChange={(e) =>
                      setFechForm({ ...fechForm, salarioFechamento: maskMoedaBR(e.target.value) })
                    }
                    placeholder="2.500,00"
                    className="ds-input pl-9"
                  />
                </div>
              </Campo>

              <Campo rotulo="Data prevista para início">
                <input
                  type="date"
                  value={fechForm.dataPrevistaInicio}
                  onChange={(e) => setFechForm({ ...fechForm, dataPrevistaInicio: e.target.value })}
                  className="ds-input"
                />
              </Campo>
            </div>

            {/* AS DUAS OPÇÕES DE FECHAMENTO. A segunda REGISTRA A INTENÇÃO e não liga nada na
                esteira: a ponte com a admissão é frente separada, e o aviso abaixo diz isso na
                tela, para ninguém esperar uma admissão que ainda não nasce daqui. */}
            <div className="mt-5 flex flex-col gap-2">
              <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <input
                  type="radio"
                  name="destino-fechamento"
                  className="mt-1"
                  checked={!fechForm.enviarParaAdmissao}
                  onChange={() => setFechForm({ ...fechForm, enviarParaAdmissao: false })}
                />
                <span className="text-sm text-text">
                  Fechar a vaga e finalizar o processo seletivo
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <input
                  type="radio"
                  name="destino-fechamento"
                  className="mt-1"
                  checked={fechForm.enviarParaAdmissao}
                  onChange={() => setFechForm({ ...fechForm, enviarParaAdmissao: true })}
                />
                <span className="text-sm text-text">
                  Finalizar o processo seletivo e enviar para admissão
                  <span className="mt-0.5 block text-[11.5px] text-dim">
                    A intenção fica registrada na vaga. A passagem para a esteira de admissão é a
                    próxima frente e ainda não acontece automaticamente.
                  </span>
                </span>
              </label>
            </div>

            {erroFechar && (
              <p
                className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
                role="alert"
              >
                {erroFechar}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFecharAlvo(null)}
                disabled={fechando}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={fechando}>
                {fechando ? "Fechando…" : "Fechar vaga"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── VER A VAGA COMPLETA (item 8) ──────────────────────────────────── */}
      {verAlvo && (
        <Modal onClose={() => setVerAlvo(null)} className="max-w-[900px] p-0" ariaLabel="Ver a vaga">
          <div className="flex max-h-[86vh] flex-col">
            <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
              <div className="eyebrow !mb-1">Atração e Seleção</div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-text">
                  {verAlvo.nomeDivulgacao ?? "Vaga Sem Nome De Divulgação"}
                </h2>
                <StatusPill
                  tone={TOM_STATUS[verAlvo.status]}
                  label={VAGA_STATUS_LABEL[verAlvo.status]}
                />
              </div>
              <p className="mt-1 text-[12.5px] text-dim">
                Código {verAlvo.codigo ?? "não informado"}. Aberta em{" "}
                {dataBr(verAlvo.dataAbertura)} por{" "}
                {verAlvo.abertoPorNome ?? "não informado"}.
              </p>
            </div>

            <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
              <BlocoFicha titulo="A Vaga">
                <Linha rotulo="Cliente" valor={verAlvo.clienteNome} />
                <Linha rotulo="Cargo da vaga" valor={verAlvo.cargoNome} />
                <Linha
                  rotulo="Natureza"
                  valor={verAlvo.natureza ? VAGA_NATUREZA_LABEL[verAlvo.natureza] : null}
                />
                <Linha
                  rotulo="Vínculo"
                  valor={verAlvo.vinculo ? VAGA_VINCULO_LABEL[verAlvo.vinculo] : null}
                />
                {/* OS DOIS CONTADORES, cada um na sua linha: a ficha é onde a vaga é lida inteira. */}
                <Linha
                  rotulo="Posições oficiais"
                  valor={
                    verAlvo.posicoesOficiais === null ? null : String(verAlvo.posicoesOficiais)
                  }
                />
                <Linha rotulo="Posições de banco" valor={String(verAlvo.posicoesBanco)} />
                <Linha
                  rotulo="Sazonalidade"
                  valor={VAGA_SAZONALIDADE_LABEL[verAlvo.sazonalidade]}
                />
                {/* Item 2: o tempo de contrato só se mostra onde ele existe, pela mesma régua que
                    esconde o campo na trilha. */}
                {exigeTempoContrato(verAlvo.vinculo) && (
                  <Linha
                    rotulo="Tempo de contrato"
                    valor={verAlvo.tempoContrato ? rotuloTempoContrato(verAlvo.tempoContrato) : null}
                  />
                )}
              </BlocoFicha>

              <BlocoFicha titulo="Quem Pediu">
                <Linha rotulo="Solicitante" valor={verAlvo.solicitanteNome} />
                <Linha rotulo="Telefone" valor={verAlvo.solicitanteTelefone} />
                <Linha rotulo="E-mail" valor={verAlvo.solicitanteEmail} />
                <Linha rotulo="Consultor" valor={verAlvo.consultorNome} />
                <Linha rotulo="Recruiter" valor={verAlvo.recruiterNome} />
                <Linha rotulo="Data de solicitação" valor={dataBr(verAlvo.dataSolicitacao)} />
                <Linha rotulo="Data de alinhamento" valor={dataBr(verAlvo.dataAlinhamento)} />
                <Linha rotulo="Data limite" valor={dataBr(verAlvo.dataLimite)} />
                <Linha rotulo="Envio da shortlist" valor={dataBr(verAlvo.envioShortlist)} />
              </BlocoFicha>

              <BlocoFicha titulo="Contratação">
                <Linha rotulo="Motivo" valor={verAlvo.motivo} />
                <Linha rotulo="Justificativa" valor={verAlvo.justificativaMotivo} />
                {verAlvo.motivo === MOTIVO_SUBSTITUICAO && (
                  <>
                    <Linha
                      rotulo="Tipo de substituição"
                      valor={
                        verAlvo.tipoSubstituicao
                          ? VAGA_TIPO_SUBSTITUICAO_LABEL[verAlvo.tipoSubstituicao]
                          : null
                      }
                    />
                    <Linha rotulo="Nome do substituído" valor={verAlvo.substituidoNome} />
                    {/* Item 3: o CPF aparece MASCARADO para leitura. §A.6: a rota inteira do módulo
                        é fechada pelo menu `as-vagas`, e o número nunca vai para log. */}
                    <Linha
                      rotulo="CPF do substituído"
                      valor={verAlvo.substituidoCpf ? formatCpf(verAlvo.substituidoCpf) : null}
                    />
                  </>
                )}
              </BlocoFicha>

              <BlocoFicha titulo="Condições">
                <Linha rotulo="Salário de abertura" valor={moedaBr(verAlvo.salarioAbertura)} />
                <Linha
                  rotulo="Benefícios"
                  valor={
                    verAlvo.beneficios.length
                      ? verAlvo.beneficios
                          .map((b) => (b.valor ? `${b.nome}: ${salarioParaCampo(b.valor)}` : b.nome))
                          .join(", ")
                      : null
                  }
                  largo
                />
                <Linha rotulo="Local de trabalho" valor={verAlvo.localTrabalho} largo />
                <Linha
                  rotulo="Estado da abordagem"
                  valor={verAlvo.regiaoEstado ? nomeDaUf(verAlvo.regiaoEstado) : null}
                />
                <Linha
                  rotulo="Regiões de abordagem"
                  valor={listaEmTexto(verAlvo.regioes, verAlvo.regioesOutras, REGIAO_OUTRAS)}
                  largo
                />
                <Linha rotulo="Horário e escala" valor={verAlvo.horarioEscala} largo />
                <Linha
                  rotulo="Modelo de trabalho"
                  valor={
                    verAlvo.modeloTrabalho
                      ? VAGA_MODELO_TRABALHO_LABEL[verAlvo.modeloTrabalho]
                      : null
                  }
                />
                {verAlvo.modeloTrabalho === "HIBRIDO" && (
                  <Linha rotulo="Detalhe do híbrido" valor={verAlvo.detalheHibrido} />
                )}
                <Linha rotulo="Vaga confidencial" valor={verAlvo.confidencial ? "Sim" : "Não"} />
                <Linha
                  rotulo="Divulgar o nome da empresa"
                  valor={verAlvo.divulgarEmpresa ? "Sim" : "Não"}
                />
              </BlocoFicha>

              <BlocoFicha titulo="Requisitos">
                <Linha
                  rotulo="Escolaridade"
                  valor={
                    verAlvo.escolaridade ? VAGA_ESCOLARIDADE_LABEL[verAlvo.escolaridade] : null
                  }
                />
                <Linha rotulo="Faixa etária" valor={verAlvo.faixaEtaria} />
                <Linha rotulo="Gênero" valor={VAGA_GENERO_LABEL[verAlvo.genero]} />
                <Linha
                  rotulo="Idiomas"
                  valor={listaEmTexto(verAlvo.idiomas, verAlvo.idiomasOutros, OPCAO_OUTROS)}
                />
                <Linha
                  rotulo="Cursos e conhecimentos"
                  valor={verAlvo.cursosConhecimentos}
                  largo
                />
                <Linha
                  rotulo="Testes"
                  valor={listaEmTexto(
                    verAlvo.testes.map((t) => VAGA_TESTE_LABEL[t as keyof typeof VAGA_TESTE_LABEL]),
                    verAlvo.testesOutro,
                    "",
                  )}
                  largo
                />
                <Linha rotulo="Experiência necessária" valor={verAlvo.experiencia} largo />
                <Linha rotulo="Principais atribuições" valor={verAlvo.atribuicoes} largo />
                <Linha rotulo="Perfil comportamental" valor={verAlvo.perfilComportamental} largo />
                <Linha rotulo="Ambiente" valor={verAlvo.ambiente} largo />
                <Linha
                  rotulo="Etapas do processo seletivo"
                  valor={listaEmTexto(verAlvo.etapasPs, verAlvo.etapasPsOutra, OPCAO_OUTRA)}
                  largo
                />
                <Linha rotulo="Observações" valor={verAlvo.observacoes} largo />
              </BlocoFicha>

              {/* O FECHAMENTO SÓ APARECE NA VAGA FECHADA: numa vaga aberta seria um bloco de
                  "não informado" repetido quatro vezes, dizendo o óbvio. */}
              {verAlvo.dataFechamento && (
                <BlocoFicha titulo="Fechamento">
                  <Linha rotulo="Data do fechamento" valor={dataBr(verAlvo.dataFechamento)} />
                  <Linha
                    rotulo="Vagas fechadas"
                    valor={verAlvo.vagasFechadas === null ? null : String(verAlvo.vagasFechadas)}
                  />
                  <Linha
                    rotulo="Vagas fechadas de banco"
                    valor={
                      verAlvo.vagasFechadasBanco === null
                        ? null
                        : String(verAlvo.vagasFechadasBanco)
                    }
                  />
                  <Linha
                    rotulo="Salário de fechamento"
                    valor={moedaBr(verAlvo.salarioFechamento)}
                  />
                  <Linha
                    rotulo="Data prevista para início"
                    valor={dataBr(verAlvo.dataPrevistaInicio)}
                  />
                  <Linha
                    rotulo="Enviar para admissão"
                    valor={verAlvo.enviarParaAdmissao ? "Sim" : "Não"}
                  />
                </BlocoFicha>
              )}
            </div>

            <div className="flex-none border-t border-[var(--border)] px-6 py-4">
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setVerAlvo(null)}>
                  Fechar
                </Button>
                <Button type="button" onClick={() => clonarVaga(verAlvo)}>
                  Clonar esta vaga
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Bloco da ficha da vaga: um assunto por bloco, os mesmos cinco da trilha. */
function BlocoFicha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2.5 text-[13px] font-semibold text-text">{titulo}</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 md:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

/**
 * Uma linha da ficha. Vazio vira "não informado" (§A.11), NUNCA um traço: o leitor precisa saber que
 * ninguém respondeu, e um glifo solto não diz isso.
 */
function Linha({
  rotulo,
  valor,
  largo = false,
}: {
  rotulo: string;
  valor: string | null | undefined;
  largo?: boolean;
}) {
  const texto = valor?.trim() ? valor.trim() : "não informado";
  return (
    <div className={largo ? "md:col-span-2" : undefined}>
      <span className="block text-[11.5px] text-faint">{rotulo}</span>
      <span className="block whitespace-pre-wrap break-words text-[13px] text-text">{texto}</span>
    </div>
  );
}
