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
  type AsCandidaturaPendente,
  type AsVagaFechamentoBloqueado,
} from "@ea/shared-types";
import { ApiError, apiFetch } from "@/lib/api";
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
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { TOM_STATUS_VAGA } from "@/lib/as-candidatos-visual";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { cn } from "@/lib/cn";
import { Stepper, type StepDef } from "@/components/nova/Stepper";
import { CandidatosPendentesModal } from "@/components/as/vagas/CandidatosPendentesModal";
import { CandidatosDaVagaModal } from "@/components/as/vagas/CandidatosDaVagaModal";

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
// O MAPA SUBIU PARA `lib/as-candidatos-visual.ts` (ajuste 4), sem alterar um valor sequer: o resumo
// da vaga passou a aparecer também dentro da Central de Candidatos, e duas cópias fariam a mesma
// vaga ganhar cores diferentes em duas telas. O nome local fica, e todas as leituras seguem iguais.
const TOM_STATUS = TOM_STATUS_VAGA;

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
 * A RECUSA DO FECHAMENTO POR CANDIDATO PENDENTE, reconhecida pelo CORPO e não pelo texto.
 *
 * O backend responde 409 com `{ reason: "candidatosPendentes", pendentes: [...] }`, no mesmo espírito
 * do `needsConfirmation` que a Esteira já usa: um objeto para a tela CONSUMIR. Casar por frase seria
 * frágil (a mensagem muda no singular e no plural, e mudaria de novo em qualquer ajuste de texto).
 */
function fechamentoBloqueado(err: unknown): AsVagaFechamentoBloqueado | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const corpo = err.data as Partial<AsVagaFechamentoBloqueado> | undefined;
  if (corpo?.reason !== "candidatosPendentes" || !Array.isArray(corpo.pendentes)) return null;
  return corpo as AsVagaFechamentoBloqueado;
}

/*
 * O `textoContador` MORAVA AQUI e saiu com o cilindro (OST de 27/08). Ele escrevia a célula de
 * Posições como texto ("Oficiais: 6 de 10"), e essa célula passou a ser desenhada pelo
 * `CilindroMeta`, logo abaixo. Nenhuma outra tela o chamava, então ele saiu inteiro em vez de ficar
 * como peça morta; o que ele dizia em palavras (a diferença entre "ninguém contou ainda" e "zero
 * preenchidas", e o "não informado" da meta nula) continua dito, agora no `title` do cilindro.
 */

/** Trilho do cilindro: a mesma hairline tonal que o painel de Alto Volume usa nas barras dele. */
const TRILHO_POSICOES = "color-mix(in srgb, var(--text) 9%, transparent)";

/**
 * ─ QUANTAS POSIÇÕES JÁ ESTÃO PREENCHIDAS, e este é O PONTO DE COSTURA DA ALOCAÇÃO ─────────────
 *
 * HOJE a única contagem que existe é a do FECHAMENTO (`vagasFechadas` / `vagasFechadasBanco`), que
 * só nasce quando alguém fecha a vaga. Enquanto a vaga está aberta ela é nula, e nulo aqui vira
 * ZERO de propósito: o cilindro precisa de um número para desenhar, e "ninguém contou ainda" e
 * "ninguém preenchido ainda" desenham a mesma barra vazia. A diferença entre os dois continua
 * dita em palavras, no `title` da célula.
 *
 * QUANDO A ALOCAÇÃO LIGAR, O CILINDRO ENCHE SOZINHO, e a mudança é DESTA FUNÇÃO, de lugar nenhum
 * mais. A Central de Candidatos já sabe quem ocupa posição (`consomePosicao`: APROVADO e
 * CONTRATADO, em `domain/candidatura.ts`), e o que falta é o número chegar até aqui: basta
 * `VagaListItem` passar a trazer o par de contagens de ocupação e esta função preferi-lo ao
 * fechamento. Nenhuma linha da tabela, do cabeçalho ou da ordenação muda junto, porque todas leem
 * daqui.
 *
 * A ORDEM DA PREFERÊNCIA JÁ ESTÁ ESCRITA para o dia da virada: ocupação real primeiro, contagem de
 * fechamento depois. A vaga encerrada continua mostrando o que foi contado no fechamento, que é o
 * número autoritativo dela, e a vaga viva passa a mostrar quem já está dentro.
 */
function preenchidas(v: VagaListItem, lado: "oficial" | "banco"): number {
  const doFechamento = lado === "oficial" ? v.vagasFechadas : v.vagasFechadasBanco;
  return doFechamento ?? 0;
}

/**
 * ─ O CILINDRO DE UMA META (item da OST de 27/08) ──────────────────────────────────────────────
 *
 * A coluna Posições era texto solto ("Oficiais: 2, Banco: 0") e virou DOIS cilindros do MESMO
 * tamanho, um por meta. O tamanho igual não é detalhe: é o que deixa comparar oficial e banco de
 * relance, e é por isso que o cilindro de banco é desenhado mesmo quando a meta é zero.
 *
 * O NÚMERO FICA NO FIM DO CILINDRO, alinhado à borda direita do trilho, na linha do rótulo: dentro
 * de uma coluna estreita, empilhar rótulo, barra e número em três alturas dobraria a altura de toda
 * linha da tabela sem acrescentar leitura (§A.20).
 *
 * META ATINGIDA FICA VERDE E DIZ O NOME, dentro da própria barra cheia, que é onde sobra espaço
 * exatamente quando ela enche. O verde é o `--ok` do sistema, o mesmo das pills de êxito.
 *
 * META ZERO não desenha barra cheia nem vazia: "esta vaga não reservou banco" não é meta cumprida
 * nem meta pendente, e pintar de verde diria que alguma coisa foi entregue. Ela mostra o traço
 * apagado e o número zero.
 *
 * META NULA (só no rascunho) mostra "não informado" (§A.11), sem cilindro: não há meta a encher.
 */
function CilindroMeta({
  rotulo,
  meta,
  feitas,
  contado,
}: {
  rotulo: string;
  meta: number | null;
  feitas: number;
  /** A contagem já aconteceu? Falso é vaga aberta, em que ninguém contou nada ainda. */
  contado: boolean;
}) {
  if (meta === null) {
    return (
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</span>
        <span className="text-[11px] text-faint">não informado</span>
      </div>
    );
  }

  const cheia = meta > 0 && feitas >= meta;
  const pct = meta > 0 ? Math.min(100, Math.round((feitas / meta) * 100)) : 0;
  // Piso de 6% para preenchimento não nulo: 1 de 40 desenharia uma lasca invisível, e a barra
  // mentiria dizendo que não entrou ninguém. O mesmo piso das barras de loja do Alto Volume.
  const largura = feitas <= 0 ? 0 : Math.max(6, pct);
  const cor = cheia ? "var(--ok)" : "var(--accent)";

  return (
    <div
      title={
        meta === 0
          ? `${rotulo}: esta vaga não reservou posições.`
          : contado
            ? `${rotulo}: ${feitas} de ${meta} preenchidas, ${pct}% da meta.`
            : `${rotulo}: meta de ${meta}. A contagem de preenchimento ainda não existe para esta vaga.`
      }
    >
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-faint">{rotulo}</span>
        <span
          className="whitespace-nowrap text-[11.5px] font-semibold tabular-nums"
          style={{ color: cheia ? "var(--ok)" : "var(--text)" }}
        >
          {feitas} / {meta}
        </span>
      </div>
      <div
        className="relative mt-0.5 h-[14px] w-full overflow-hidden rounded-full"
        style={{ background: TRILHO_POSICOES }}
        role="progressbar"
        aria-valuenow={feitas}
        aria-valuemin={0}
        aria-valuemax={meta}
        aria-label={`${rotulo}: ${feitas} de ${meta}`}
      >
        {largura > 0 && (
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${largura}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${cor} 45%, transparent), ${cor})`,
            }}
          />
        )}
        {/* O RÓTULO DE META ATINGIDA MORA DENTRO DA BARRA CHEIA, que é justamente quando há 100% da
            largura disponível para ele. Em branco sobre o verde, ele lê nos dois temas sem depender
            de token de texto. `pointer-events-none` para não roubar o `title` da célula. */}
        {cheia && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-[9px] font-bold uppercase tracking-wide text-white">
            Meta Atingida
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * OS ESTADOS EM QUE A VAGA JÁ TERMINOU. A vaga encerrada tem `dataFechamento` escrita pela ação de
 * fechar, e é ela que CONGELA o contador de dias (decisão do diretor, 27/08).
 *
 * CANCELADA entra na lista porque ela É um encerramento, mesmo que hoje nenhuma rota escreva esse
 * status: quando a ação de cancelar existir, o contador já vai congelar sozinho, sem ninguém ter de
 * lembrar de voltar aqui.
 */
const STATUS_ENCERRADOS: VagaStatus[] = ["ENTREGUE", "FECHADA", "CANCELADA"];

/**
 * ─ HÁ QUANTOS DIAS A VAGA ESTÁ ABERTA (item 1 da OST de 27/08) ───────────────────────────────
 *
 * O CONTADOR CONGELA NO FECHAMENTO (decisão do diretor): a vaga ABERTA conta da abertura até HOJE e
 * sobe um a cada dia; a vaga ENCERRADA conta da abertura até a data de fechamento e para ali. Em vez
 * de uma coluna que esvazia assim que o processo termina, o número vira o TEMPO DE ATENDIMENTO
 * daquela vaga, que é comparável entre vagas e por isso vale a ordenação.
 *
 * SEM DATA DE ABERTURA NÃO HÁ CONTA, e isso é o rascunho: a coluna devolve `null`, a célula escreve
 * "não informado" (§A.11) e o `useOrdenacao` manda a linha para o fim nas duas direções.
 *
 * A CONTA É EM DIAS DE CALENDÁRIO, feita em UTC sobre a data pura (`yyyy-mm-dd`), sem hora e sem
 * fuso. Passar por `new Date(iso)` local faria a virada do horário de verão devolver 41,96 dias e o
 * arredondamento oscilar de um dia conforme a máquina de quem abre a tela.
 *
 * ENCERRAMENTO ANTES DA ABERTURA (dado torto vindo da carga) devolveria negativo; o piso em zero
 * mantém a coluna legível sem inventar número.
 */
function diasEmAberto(v: VagaListItem): number | null {
  if (!v.dataAbertura) return null;
  const encerrada = STATUS_ENCERRADOS.includes(v.status);
  const fim = encerrada ? v.dataFechamento : HOJE();
  // Vaga encerrada SEM data de fechamento é dado incompleto, e contar até hoje mentiria que ela
  // segue aberta. Sem o fim, não há conta.
  if (!fim) return null;
  const ini = Date.parse(`${v.dataAbertura.slice(0, 10)}T00:00:00Z`);
  const fimMs = Date.parse(`${fim.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ini) || Number.isNaN(fimMs)) return null;
  return Math.max(0, Math.round((fimMs - ini) / 86_400_000));
}

/** O número de dias como o time lê. `null` vira "não informado" (§A.11), nunca traço nem vazio. */
function textoDias(dias: number | null): string {
  if (dias === null) return "não informado";
  return dias === 1 ? "1 dia" : `${dias} dias`;
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

  /**
   * ─ OS FILTROS DA TELA (item 2 da OST de 27/08), TODOS DE MÚLTIPLA SELEÇÃO (§A.28) ────────────
   *
   * NASCEM MÚLTIPLOS, e não "simples agora, múltiplos depois": a régua de um valor só se espalha
   * pela consulta, pelo estado e pela contagem dos cards, e desfazer isso custa mais do que nascer
   * certo. Cada um é uma LISTA, e lista vazia é "todos".
   *
   * ELES RODAM NO CLIENTE, e isso é honesto aqui: `GET /as/vagas` devolve a lista INTEIRA, sem
   * paginação no servidor, então filtrar em memória filtra o conjunto todo e não uma página. É a
   * mesma leitura que autorizou a ordenação client-side desta tela.
   *
   * O SELETOR É O `Combobox` NO MODO MÚLTIPLO, que já existia e nunca tinha sido usado: chips no
   * gatilho, caixas de marcação na lista, busca por digitação, teclado completo e botão de limpar.
   * Nenhuma linha dele foi alterada por esta frente (§A.26): a tela só passou a consumir o modo que
   * o componente já oferecia.
   *
   * A DATA DE ABERTURA É UM PERÍODO, e período não é seleção múltipla: são duas pontas, De e Até, o
   * mesmo par que o Gerenciador já usa em "Período". Marcar datas soltas numa lista responderia a
   * outra pergunta ("abriu exatamente nestes dias") e não à que o time faz ("abriu neste intervalo").
   */
  const [busca, setBusca] = useState("");
  const [fClientes, setFClientes] = useState<string[]>([]);
  const [fCargos, setFCargos] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fVinculos, setFVinculos] = useState<string[]>([]);
  const [abertaDe, setAbertaDe] = useState("");
  const [abertaAte, setAbertaAte] = useState("");

  /**
   * O CARD ATIVO (item 3 da OST). "total" é o estado de repouso, e cada outro valor é um STATUS do
   * catálogo: o card não tem régua própria, ele filtra pela mesma coluna que a pill da linha mostra.
   * Clicar no card já ativo volta para o Total, que é o toggle do §A.12.
   */
  const [cardAtivo, setCardAtivo] = useState<VagaStatus | "total">("total");

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
  /** A vaga cujos candidatos vinculados estão sendo consultados (item 6, sentido vaga para pessoa). */
  const [candidatosAlvo, setCandidatosAlvo] = useState<VagaListItem | null>(null);

  // ── Fechar vaga ───────────────────────────────────────────────────────────
  const [fecharAlvo, setFecharAlvo] = useState<VagaListItem | null>(null);
  const [fechando, setFechando] = useState(false);
  const [erroFechar, setErroFechar] = useState<string | null>(null);
  /**
   * OS CANDIDATOS QUE SEGURAM O FECHAMENTO. Não é uma mensagem, é uma LISTA: o backend recusa com
   * 409 estruturado (`reason: "candidatosPendentes"`) e manda quem está em seleção, para o consultor
   * tratar cada um sem sair da tela. Null = ninguém segurando, ou ainda não se tentou fechar.
   */
  const [pendentesFech, setPendentesFech] = useState<AsCandidaturaPendente[] | null>(null);
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

  /**
   * A CHEGADA VINDA DA FICHA DO CANDIDATO (item 6 do diretor, sentido pessoa para vaga).
   *
   * O botão "Ver vaga" da ficha manda para `/as/vagas?vaga=CODIGO`, e este efeito abre o descritivo
   * completo daquela linha assim que a lista chega. É o MESMO modal do olhinho (`setVerAlvo`), e não
   * uma segunda tela: uma cópia do descritivo envelheceria no primeiro campo novo que a vaga
   * ganhasse.
   *
   * RODA UMA VEZ SÓ (`abriuPelaUrl`), senão fechar o modal com o parâmetro ainda na URL o reabriria
   * na hora, e a tela ficaria presa. O parâmetro é LIMPO da barra de endereço depois de usado, para
   * um F5 não trazer o modal de volta.
   *
   * CÓDIGO NÃO ENCONTRADO NÃO É ERRO: a vaga pode ter sido cancelada ou estar fora do recorte de
   * área do usuário. A tela abre normalmente, sem modal e sem alarme.
   *
   * §A.6: o que trafega na URL é o CÓDIGO DA VAGA, dado de processo. Nada da pessoa vem junto.
   */
  const [abriuPelaUrl, setAbriuPelaUrl] = useState(false);
  useEffect(() => {
    if (abriuPelaUrl || rows.length === 0) return;
    const codigo = new URLSearchParams(window.location.search).get("vaga");
    if (!codigo) return;
    setAbriuPelaUrl(true);
    const alvo = rows.find((v) => v.codigo === codigo);
    if (alvo) setVerAlvo(alvo);
    window.history.replaceState({}, "", window.location.pathname);
  }, [rows, abriuPelaUrl]);

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
    setPendentesFech(null);
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

  function confirmarFechamento(e: FormEvent) {
    e.preventDefault();
    void enviarFechamento();
  }

  /**
   * O ENVIO DO FECHAMENTO, separado do `submit` do formulário porque ele é disparado de DOIS lugares:
   * o botão do formulário e, depois que a fila de pendentes zera, o botão do modal de pendentes. O
   * corpo é o mesmo nos dois casos, e é o que já estava preenchido: reabrir o formulário para a
   * pessoa redigitar o que ela acabou de digitar seria perder o preenchimento por nada.
   */
  async function enviarFechamento() {
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
      setPendentesFech(null);
      await carregar();
    } catch (err) {
      /**
       * A RECUSA POR CANDIDATO PENDENTE NÃO É UMA FRASE, É UMA FILA. O 409 vem estruturado, com a
       * lista de quem está em seleção, e a tela abre o modal para tratar cada um ali mesmo. Sem
       * isso, o consultor leria "há 3 candidatos pendentes", sairia daqui para descobrir quem são e
       * voltaria. As demais recusas seguem exibindo a mensagem do backend, como sempre.
       */
      const bloqueio = fechamentoBloqueado(err);
      if (bloqueio) {
        setPendentesFech(bloqueio.pendentes);
        setErroFechar(null);
      } else {
        setErroFechar(err instanceof Error ? err.message : "Erro ao fechar a vaga");
      }
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

  /**
   * ─ A CADEIA DA TELA, e a ORDEM DELA IMPORTA ───────────────────────────────────────────────────
   *
   *   rows (o que o backend mandou)
   *     → filtradas  (o modal de filtros)
   *     → kpis       (a conta dos cards, sobre o RECORTE FILTRADO)
   *     → visiveis   (o card ativo)
   *     → ord.itens  (a ordenação clicável)
   *
   * OS CARDS CONTAM O QUE O FILTRO DEIXOU PASSAR, e não a base inteira. Filtrar por um cliente e ver
   * "Abertas: 312" ao lado de uma lista de 4 linhas seria o card contradizendo a tabela na mesma
   * tela. A conta é do recorte; o Total do card é o total DO RECORTE.
   *
   * O CARD FICA DEPOIS DA CONTA, de propósito: se ele entrasse antes, escolher "Abertas" zeraria
   * todos os outros cards e não haveria como voltar clicando, porque o card de destino mostraria
   * zero. Contando antes, os cards continuam sendo o mapa e o card ativo é só o recorte da tabela.
   *
   * A ORDENAÇÃO ENVOLVE O FIM DA CADEIA, e é isso que faz filtro e ordenação CONVIVEREM: trocar de
   * filtro só troca a lista que entra no `useOrdenacao`, e a coluna escolhida continua de pé porque
   * ela mora no estado do hook, não na lista.
   */
  const filtradas = useMemo(() => {
    const termo = busca
      .trim()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    const setClientes = new Set(fClientes);
    const setCargos = new Set(fCargos);
    const setStatus = new Set(fStatus);
    const setVinculos = new Set(fVinculos);

    return rows.filter((v) => {
      // A BUSCA COBRE CÓDIGO E NOME DE DIVULGAÇÃO, que são os dois jeitos de a vaga ser chamada: o
      // recruiter procura pelo número do processo, o consultor procura pelo nome do anúncio.
      if (termo) {
        const alvo = `${v.codigo ?? ""} ${v.nomeDivulgacao ?? ""}`
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      // LISTA VAZIA É "TODOS". Sem isso, a tela abriria com a tabela vazia esperando alguém marcar
      // alguma coisa em cada um dos cinco filtros.
      if (setClientes.size && !(v.codCliente && setClientes.has(v.codCliente))) return false;
      if (setCargos.size && !(v.cargoId && setCargos.has(v.cargoId))) return false;
      if (setStatus.size && !setStatus.has(v.status)) return false;
      if (setVinculos.size && !(v.vinculo && setVinculos.has(v.vinculo))) return false;
      /*
       * O PERÍODO COMPARA STRING COM STRING, e isso é proposital: `dataAbertura` é `yyyy-mm-dd`, uma
       * data pura, e nessa forma a ordem alfabética É a ordem cronológica. Converter para `Date`
       * traria fuso para dentro de uma comparação que não tem hora, e a vaga aberta no dia da ponta
       * cairia fora do intervalo por três horas de diferença.
       *
       * A VAGA SEM DATA (rascunho) SAI quando há período escolhido: quem pergunta "abriu entre estas
       * datas" não está pedindo as que ainda não abriram.
       */
      if (abertaDe || abertaAte) {
        const d = v.dataAbertura?.slice(0, 10);
        if (!d) return false;
        if (abertaDe && d < abertaDe) return false;
        if (abertaAte && d > abertaAte) return false;
      }
      return true;
    });
  }, [rows, busca, fClientes, fCargos, fStatus, fVinculos, abertaDe, abertaAte]);

  /**
   * A CONTA DOS CARDS (item 3 da OST). SETE cards, e nenhum estado do catálogo fica sem número
   * (decisão do diretor, 27/08, a mesma da Central de Candidatos): a soma dos seis estados fecha
   * exatamente com o Total, então quem olha a linha sabe que não sobrou vaga escondida em lugar
   * nenhum. Sem os cards de Rascunho e Vaga Banco, a soma não bateria e o rascunho, que é justamente
   * a vaga que alguém deixou pela metade, seria o único estado invisível da tela.
   *
   * A CONTA É PELO CATÁLOGO (`VAGA_STATUS`), não por uma lista escrita à mão aqui: status novo no
   * catálogo nasce contado, sem ninguém ter de lembrar de voltar neste bloco.
   */
  const kpis = useMemo(() => {
    const conta = Object.fromEntries(VAGA_STATUS.map((st) => [st, 0])) as Record<VagaStatus, number>;
    for (const v of filtradas) conta[v.status] += 1;
    return { total: filtradas.length, porStatus: conta };
  }, [filtradas]);

  const doCard = useMemo(
    () => (cardAtivo === "total" ? filtradas : filtradas.filter((v) => v.status === cardAtivo)),
    [filtradas, cardAtivo],
  );

  const filtrosAtivos =
    (busca.trim() ? 1 : 0) +
    (fClientes.length ? 1 : 0) +
    (fCargos.length ? 1 : 0) +
    (fStatus.length ? 1 : 0) +
    (fVinculos.length ? 1 : 0) +
    (abertaDe || abertaAte ? 1 : 0);

  const limparFiltros = useCallback(() => {
    setBusca("");
    setFClientes([]);
    setFCargos([]);
    setFStatus([]);
    setFVinculos([]);
    setAbertaDe("");
    setAbertaAte("");
  }, []);

  /**
   * ─ §A.29: A ORDENAÇÃO CLICÁVEL, com a MESMA peça do resto do sistema ─────────────────────────
   *
   * `useOrdenacao` + `ColunaOrdenavel`, os mesmos da Integração, da Gestão Das Assinaturas e da
   * Central de Candidatos. Nada de ordenação escrita à mão nesta tela.
   *
   * Sem clique, a lista sai EXATAMENTE como o backend mandou; a ordenação é sobreposição por ação do
   * usuário, e o desempate é a posição original, então linhas de valor igual não embaralham a cada
   * clique. Client-side é honesto aqui: a tela carrega a lista inteira de `GET /as/vagas`, sem
   * paginação no servidor.
   *
   * CÓDIGO É TEXTO, mas ordena como gente espera: o comparador usa `numeric: true`, então o código 9
   * vem antes do 10 em vez de depois, que é o que a ordem alfabética crua faria.
   *
   * STATUS ORDENA PELO CATÁLOGO (`VAGA_STATUS`), que está na ordem da VIDA da vaga: rascunho, aberta,
   * entregue, fechada, cancelada, banco. Pelo rótulo, "Aberta" viria depois de nada e "Rascunho" iria
   * para o fim, e a coluna deixaria de contar a história do processo.
   *
   * POSIÇÕES ORDENA PELA META OFICIAL, e só por ela (ver a nota no cabeçalho da coluna).
   *
   * O RASCUNHO PODE NÃO TER NADA DISSO PREENCHIDO, e todo campo nulo é devolvido como nulo: o
   * `useOrdenacao` manda vazio para o FIM nas duas direções, então inverter a seta nunca traz um
   * bloco de "não informado" para o topo empurrando a vaga de verdade para baixo.
   */
  const colunasOrdenaveis = useMemo<ColOrd<VagaListItem>[]>(
    () => [
      { chave: "codigo", tipo: "texto", valor: (v) => v.codigo },
      { chave: "vaga", tipo: "texto", valor: (v) => v.nomeDivulgacao },
      { chave: "cliente", tipo: "texto", valor: (v) => v.clienteNome },
      { chave: "cargo", tipo: "texto", valor: (v) => v.cargoNome },
      // Vínculo ordena pelo RÓTULO, e não pelo catálogo: a lista de vínculos não é um fluxo, é um
      // conjunto de tipos, e quem procura "Efetivo" procura pela letra E.
      {
        chave: "vinculo",
        tipo: "texto",
        valor: (v) => (v.vinculo ? VAGA_VINCULO_LABEL[v.vinculo] : null),
      },
      /**
       * POSIÇÕES ORDENA PELA META OFICIAL (`posicoesOficiais`), das maiores para as menores no
       * primeiro clique. A célula carrega DOIS números, e só um deles pode mandar na ordem:
       *  - o OFICIAL é a contratação de verdade, e o BANCO é excedente reservado, então ordenar pelo
       *    banco colocaria na frente da fila vaga que talvez não contrate ninguém;
       *  - a META existe em toda vaga publicada, enquanto a CONTAGEM (`vagasFechadas`) só nasce no
       *    fechamento: ordenar por ela deixaria quase a lista toda vazia e a ordem seria inútil;
       *  - a meta está À VISTA na célula ("Oficiais: 10" ou "Oficiais: 6 de 10"), então a ordem que
       *    aparece na tela é conferível pelo que a tela mostra, e não por um número derivado que
       *    ninguém vê.
       * Rascunho sem meta devolve nulo e cai no fim, nas duas direções.
       */
      { chave: "posicoes", tipo: "numero", valor: (v) => v.posicoesOficiais },
      { chave: "status", tipo: "status", valor: (v) => VAGA_STATUS.indexOf(v.status) },
      /**
       * AS DUAS COLUNAS DE TEMPO (item 1 da OST de 27/08), e cada uma ordena pelo SEU dado, não uma
       * pela outra: a data ordena pela data (`tipo: "data"`, a mais recente no primeiro clique) e os
       * dias ordenam pelo NÚMERO (`tipo: "numero"`, o maior no primeiro clique, que é o que se
       * procura numa fila). Elas parecem intercambiáveis e não são: entre uma vaga aberta ontem e
       * uma encerrada há um ano depois de 400 dias em aberto, a data põe a de ontem no topo e os
       * dias põem a de 400. São duas perguntas diferentes, e por isso duas colunas.
       *
       * `dataAbertura` NUNCA passa por `new Date` aqui: o `useOrdenacao` compara a string
       * `yyyy-mm-dd` por `Date.parse`, e nessa forma canônica a ordem já é a cronológica.
       *
       * Rascunho sem data e vaga encerrada sem data de fechamento devolvem nulo, e o `useOrdenacao`
       * manda vazio para o FIM nas duas direções.
       */
      { chave: "abertura", tipo: "data", valor: (v) => v.dataAbertura },
      { chave: "dias", tipo: "numero", valor: (v) => diasEmAberto(v) },
    ],
    [],
  );
  const ord = useOrdenacao(colunasOrdenaveis, doCard);
  const visiveis = ord.itens;

  const ladoOposto = contexto.papelAs ? contraparteDe(contexto.papelAs) : null;

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Central De Vagas"
        subtitle="Cada linha é uma abertura de vaga, com identificador próprio do EA. O código é o número do processo seletivo, digitado à mão e único no sistema: cada nova abertura, mesmo do mesmo cliente e do mesmo cargo, tem o seu."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* A CONTAGEM SEGUE O RECORTE, e não a base. Antes ela dizia sempre "2.106 vagas
            cadastradas", inclusive com a tabela mostrando 4 linhas depois de um filtro: a frase
            contradiz a tela. Com filtro aplicado ela diz quantas o filtro deixou passar, e de
            quantas, para o total da base continuar à vista. */}
        <p className="text-sm text-dim">
          {loading
            ? "Carregando as vagas."
            : visiveis.length === rows.length
              ? `${rows.length} ${rows.length === 1 ? "vaga cadastrada" : "vagas cadastradas"}.`
              : `${visiveis.length} de ${rows.length} ${rows.length === 1 ? "vaga" : "vagas"}, pelo recorte atual.`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="ds-input w-72 rounded-full"
            placeholder="Buscar por código ou nome da vaga"
            aria-label="Buscar por código ou nome da vaga"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {/* §A.28: O MODAL DE FILTROS (item 2), o mesmo gatilho e o mesmo modal da Esteira, do
              Gerenciador, das Não Conformidades e da Central de Candidatos. Nenhum componente novo
              de filtro nasceu nesta frente: a tela consome o padrão que já existe. */}
          <FiltroTrigger count={filtrosAtivos} onLimpar={limparFiltros}>
            <FiltroCampo label="Cliente">
              <Combobox
                multiple
                value={fClientes}
                onChange={setFClientes}
                options={optClientes}
                placeholder="Todos"
                ariaLabel="Cliente"
                searchable
                limpavel
              />
            </FiltroCampo>
            <FiltroCampo label="Cargo Da Vaga">
              <Combobox
                multiple
                value={fCargos}
                onChange={setFCargos}
                options={optCargos}
                placeholder="Todos"
                ariaLabel="Cargo da vaga"
                searchable
                limpavel
              />
            </FiltroCampo>
            <FiltroCampo label="Status">
              <Combobox
                multiple
                value={fStatus}
                onChange={setFStatus}
                options={VAGA_STATUS.map((st) => ({ value: st, label: VAGA_STATUS_LABEL[st] }))}
                placeholder="Todos"
                ariaLabel="Status"
                limpavel
              />
            </FiltroCampo>
            <FiltroCampo label="Vínculo">
              <Combobox
                multiple
                value={fVinculos}
                onChange={setFVinculos}
                options={VAGA_VINCULO.map((vi) => ({
                  value: vi,
                  label: VAGA_VINCULO_LABEL[vi],
                }))}
                placeholder="Todos"
                ariaLabel="Vínculo"
                limpavel
              />
            </FiltroCampo>
            {/* O PERÍODO É O MESMO PAR DE PONTAS DO GERENCIADOR: `max` numa e `min` na outra, para o
                próprio calendário impedir um intervalo invertido em vez de a tela ter de explicar
                depois que não veio nada porque o "de" é maior que o "até". */}
            <FiltroCampo label="Data De Abertura">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="ds-input"
                  aria-label="Aberta a partir de"
                  value={abertaDe}
                  max={abertaAte || undefined}
                  onChange={(e) => setAbertaDe(e.target.value)}
                />
                <input
                  type="date"
                  className="ds-input"
                  aria-label="Aberta até"
                  value={abertaAte}
                  min={abertaDe || undefined}
                  onChange={(e) => setAbertaAte(e.target.value)}
                />
              </div>
              <p className="mt-1 text-[11.5px] text-faint">
                Com um período escolhido, a vaga em rascunho fica de fora: ela ainda não tem data de
                abertura.
              </p>
            </FiltroCampo>
          </FiltroTrigger>
          <Button onClick={abrirTrilha} className="py-2.5">
            Abrir vaga
          </Button>
        </div>
      </div>

      {erroLista && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erroLista}
        </p>
      )}

      {/* ── A LINHA DE KPIs DA CENTRAL DE VAGAS (item 3 da OST de 27/08) ─────────────────────
          O MESMO VISUAL DAS OUTRAS TELAS: card de vidro, ícone acima, número grande e rótulo, e
          TODO card é clicável como filtro em toggle (§A.12), com o clique no card ativo voltando
          para o Total.

          A ORDEM É A DA VIDA DA VAGA, da esquerda para a direita: Total, o que ainda não nasceu
          (Rascunho), o que está em pé (Abertas, Vaga Banco) e os três desfechos (Entregues,
          Fechadas, Canceladas). Lida em linha, ela conta o processo, que é o que a ordem alfabética
          esconderia.

          A COR SEPARA O QUE COBRA DO QUE JÁ PASSOU: Abertas em atenção, porque é a fila viva de
          quem trabalha nesta tela; Entregues em êxito; Canceladas em alerta; Rascunho e Fechadas
          neutros, porque nem cobram nem comemoram. */}
      <div className="mb-[18px] grid grid-cols-2 gap-[12px] sm:grid-cols-4 xl:grid-cols-7">
        <Kpi id="total" rotulo="Total De Vagas" valor={kpis.total} icone="layers" />
        <Kpi id="RASCUNHO" rotulo="Rascunhos" valor={kpis.porStatus.RASCUNHO} icone="pen" />
        <Kpi
          id="ABERTA"
          rotulo="Abertas"
          valor={kpis.porStatus.ABERTA}
          icone="clock"
          tom="var(--warn)"
        />
        <Kpi
          id="VAGA_BANCO"
          rotulo="Vaga Banco"
          valor={kpis.porStatus.VAGA_BANCO}
          icone="folder"
          tom="var(--accent)"
        />
        <Kpi
          id="ENTREGUE"
          rotulo="Entregues"
          valor={kpis.porStatus.ENTREGUE}
          icone="check"
          tom="var(--ok)"
        />
        <Kpi id="FECHADA" rotulo="Fechadas" valor={kpis.porStatus.FECHADA} icone="lock" />
        <Kpi
          id="CANCELADA"
          rotulo="Canceladas"
          valor={kpis.porStatus.CANCELADA}
          icone="x"
          tom="var(--danger)"
        />
      </div>

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
          {/* §A.20 (item 4 da OST de 27/08): AS LARGURAS FORAM REDISTRIBUÍDAS, e não espremidas para
              caber duas colunas a mais. As dez porcentagens somam 100 e o piso subiu de 960px para
              1220px, MEDIDO no browser e não estimado: é a soma das larguras mínimas reais das dez
              colunas depois de os três rótulos longos ganharem quebra de linha, e é a largura em que
              a linha mais cheia (quatro botões de ação, "Pessoa Jurídica (PJ)" e "Oficiais: 6 de 10")
              cabe sem nenhum texto cortado. Numa tela de 1600px a tabela INTEIRA aparece sem rolagem
              lateral, coluna de Ações incluída, que é o defeito que a prova visual pegou no primeiro
              corte. Acima desse piso ela ESTICA: as porcentagens repartem a tela toda em vez de
              deixar folga sobrando de um lado e coluna apertada do outro, que é o aproveitamento
              pedido. Abaixo dele a tabela ROLA na horizontal, como manda o §A.12, em vez de espremer. */}
          <table className="ds-table min-w-[1220px]">
            <thead>
              <tr>
                {/* §A.29: o cabeçalho ordena por clique. O `<th>` é o mesmo de antes, com a mesma
                    largura e a mesma divisória do §A.12: o que entra dentro dele é o botão com a
                    seta. Ações fica de fora, porque não há o que comparar entre botões. */}
                <ColunaOrdenavel as="th" ord={ord} chave="codigo" className="w-[8%] text-center">
                  Código
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="vaga" className="w-[13%] text-center">
                  Vaga
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[11%] text-center">
                  Cliente
                </ColunaOrdenavel>
                {/* §A.20, MEDIDO NO BROWSER E NÃO ESTIMADO: o `ColunaOrdenavel` põe o rótulo num
                    `truncate`, que é `white-space: nowrap`, então "CARGO DA VAGA" numa linha só
                    exigia 150px de largura MÍNIMA e empurrava a tabela inteira para além da tela.
                    O `whitespace-normal` devolve ao rótulo o direito de quebrar: em tela larga ele
                    continua numa linha só, e quando aperta ele vira duas linhas em vez de roubar
                    espaço das colunas de dado. Duas linhas de cabeçalho é leitura; rótulo cortado
                    com reticências é supressão, que é o que a regra proíbe. */}
                <ColunaOrdenavel as="th" ord={ord} chave="cargo" className="w-[10%] text-center">
                  <span className="whitespace-normal">Cargo Da Vaga</span>
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="vinculo" className="w-[9%] text-center">
                  Vínculo
                </ColunaOrdenavel>
                {/* §A.20: a coluna ganhou espaço porque passou a carregar DOIS contadores, um por
                    linha. Com os 7% de antes, "Oficiais: 6 de 10" quebraria no meio da palavra.
                    Ela ordena pela META OFICIAL, a de cima: o banco é excedente reservado e não
                    manda na fila (a justificativa inteira está em `colunasOrdenaveis`). */}
                {/* §A.20: a coluna subiu de 10% para 14% porque passou a carregar DOIS cilindros
                    com rótulo e contagem, e não mais duas linhas de texto. Abaixo disso a barra
                    ficava curta demais para o preenchimento ser comparável de relance, que é a
                    única coisa que um cilindro faz melhor que um número. */}
                <ColunaOrdenavel as="th" ord={ord} chave="posicoes" className="w-[14%] text-center">
                  Posições
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-[8%] text-center">
                  Status
                </ColunaOrdenavel>
                {/* AS DUAS COLUNAS DE TEMPO (item 1), com a mesma quebra de rótulo do Cargo e pelo
                    mesmo motivo medido: em uma linha só, "DATA DE ABERTURA" pedia 169px e
                    "DIAS EM ABERTO" pedia 151px de largura MÍNIMA, e os dois juntos eram o que
                    empurrava a coluna Ações para fora da tela. Quebrando, elas pedem o tamanho do
                    dado que carregam ("01/06/2026" e "não informado"), que é o justo. */}
                <ColunaOrdenavel as="th" ord={ord} chave="abertura" className="w-[8%] text-center">
                  <span className="whitespace-normal">Data De Abertura</span>
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="dias" className="w-[8%] text-center">
                  <span className="whitespace-normal">Dias Em Aberto</span>
                </ColunaOrdenavel>
                <th className="w-[11%] text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : visiveis.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-faint">
                    {rows.length === 0
                      ? "Nenhuma vaga cadastrada ainda. Use o botão Abrir vaga."
                      : "Nenhuma vaga corresponde ao filtro aplicado. Ajuste os filtros ou limpe todos."}
                  </td>
                </tr>
              ) : (
                visiveis.map((v) => (
                  <tr key={v.id}>
                    {/* O RASCUNHO PODE NÃO TER PREENCHIDO ESTAS COLUNAS AINDA, e a célula vazia diz
                        "não informado" (§A.11), nunca um traço nem um espaço em branco que o leitor
                        confunde com erro de carregamento. */}
                    {/* §A.20: o código NÃO QUEBRA. A coluna é estreita e o cabeçalho passou a
                        dividir o espaço com a seta de ordenação (§A.29); sem o `nowrap`, um código
                        com hífen ("PS-2026-001") partia em duas linhas no meio do número. Com ele,
                        a coluna pede a largura de que precisa e a tabela tira a folga de quem tem. */}
                    <td className="whitespace-nowrap text-center font-mono text-[12.5px]">
                      {v.codigo ?? "não informado"}
                    </td>
                    <td className="font-semibold">{v.nomeDivulgacao ?? "não informado"}</td>
                    <td className="text-center">{v.clienteNome ?? "não informado"}</td>
                    <td className="text-center">{v.cargoNome ?? "não informado"}</td>
                    <td className="text-center">
                      {v.vinculo ? VAGA_VINCULO_LABEL[v.vinculo] : "não informado"}
                    </td>
                    {/* OS DOIS CILINDROS, um por meta, do MESMO tamanho: o oficial em cima, porque
                        é a contratação de verdade, e o banco embaixo, que é o excedente reservado.
                        O texto solto que morava aqui ("Oficiais: 2, Banco: 0") virou barra de meta
                        que enche, e a régua de preenchimento mora em `preenchidas`, uma função só. */}
                    <td>
                      <div className="flex flex-col gap-1.5">
                        <CilindroMeta
                          rotulo="Oficiais"
                          meta={v.posicoesOficiais}
                          feitas={preenchidas(v, "oficial")}
                          contado={v.vagasFechadas !== null}
                        />
                        <CilindroMeta
                          rotulo="Banco"
                          meta={v.posicoesBanco}
                          feitas={preenchidas(v, "banco")}
                          contado={v.vagasFechadasBanco !== null}
                        />
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
                    {/* DATA DE ABERTURA (item 1). `nowrap` porque "25/08/2026" numa coluna de 8%
                        quebraria em duas linhas no meio do ano. Rascunho sem data escreve
                        "não informado" (§A.11), como as demais colunas da linha. */}
                    <td className="whitespace-nowrap text-center">{dataBr(v.dataAbertura)}</td>
                    {/* DIAS EM ABERTO (item 1), CONGELADO no fechamento (decisão do diretor).
                        A vaga VIVA (aberta ou de banco) tem o número em destaque, porque é o dela
                        que sobe todo dia e é por ele que a fila é priorizada; a vaga ENCERRADA
                        mostra o mesmo número em tom discreto, já que ali ele é histórico e não
                        cobrança. A frase inteira fica no `title`, para quem passa o mouse. */}
                    <td className="text-center">
                      <span
                        className={
                          STATUS_ENCERRADOS.includes(v.status) ? "text-dim" : "font-semibold"
                        }
                        title={
                          v.dataAbertura === null
                            ? "A vaga ainda não tem data de abertura."
                            : STATUS_ENCERRADOS.includes(v.status)
                              ? `Ficou aberta por ${textoDias(diasEmAberto(v))}, da abertura até o fechamento.`
                              : `Aberta há ${textoDias(diasEmAberto(v))}, contando até hoje.`
                        }
                      >
                        {textoDias(diasEmAberto(v))}
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
                        {/* VER CANDIDATOS VINCULADOS (item 6 do diretor): a ponte da Central de
                            Vagas para a Central de Candidatos, no sentido vaga para pessoa. Lê a
                            MESMA rota do painel da vaga que a outra tela já usa, e por isso não
                            devolve CPF nenhum (§A.6). O ícone `filter` é o mesmo da Central De
                            Candidatos na barra lateral: o funil já é o símbolo daquela tela. */}
                        <button
                          type="button"
                          title="Ver os candidatos vinculados"
                          aria-label={`Ver os candidatos vinculados à vaga ${rotuloDaVaga(v)}`}
                          onClick={() => setCandidatosAlvo(v)}
                          className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
                        >
                          <Icon name="filter" className="h-4 w-4" />
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
      {/* Com a fila de pendentes aberta, o formulário sai da frente e o preenchimento FICA no
          estado: cancelar a fila devolve o formulário como estava, sem redigitar nada. */}
      {fecharAlvo && !pendentesFech && (
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

      {/* ── OS CANDIDATOS QUE SEGURAM O FECHAMENTO ────────────────────────── */}
      {fecharAlvo && pendentesFech && (
        <CandidatosPendentesModal
          vagaRotulo={fecharAlvo.nomeDivulgacao ?? rotuloDaVaga(fecharAlvo)}
          pendentes={pendentesFech}
          token={token}
          fechando={fechando}
          onClose={() => setPendentesFech(null)}
          onTratou={() => void carregar()}
          onFecharVaga={() => void enviarFechamento()}
        />
      )}

      {/* ── VER A VAGA COMPLETA (item 8) ──────────────────────────────────── */}
      {candidatosAlvo && (
        <CandidatosDaVagaModal
          vagaId={candidatosAlvo.id}
          vagaRotulo={rotuloDaVaga(candidatosAlvo)}
          token={token}
          onClose={() => setCandidatosAlvo(null)}
        />
      )}

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

  /**
   * O CARD DE INDICADOR, QUE É O PRÓPRIO FILTRO (§A.12), na mesma forma da Central de Candidatos:
   * ícone acima, número grande, rótulo embaixo, e o card ativo com a borda de destaque mais o
   * check. Clicar no card ativo volta para o Total, que é o toggle pedido pela regra.
   *
   * É UMA FUNÇÃO DENTRO DO COMPONENTE, e não um componente à parte, porque ela lê `cardAtivo` e
   * `loading` do estado da tela. Extrair para fora obrigaria a passar os dois em cada um dos sete
   * cards, sem ganho nenhum: ela não é reusada por outra tela.
   */
  function Kpi({
    id,
    rotulo,
    valor,
    icone,
    tom,
  }: {
    id: VagaStatus | "total";
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
          {loading ? "…" : valor}
        </div>
        <div className="lbl">{rotulo}</div>
      </GlassCard>
    );
  }
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
