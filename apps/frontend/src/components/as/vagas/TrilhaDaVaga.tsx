"use client";

/**
 * A TRILHA DA VAGA: o formulário de abertura, EXTRAÍDO da Central de Vagas para poder ser REUSADO.
 *
 * POR QUE ELE SAIU DA PÁGINA, e por que a extração veio ANTES do reuso: a tela "Liberar Vaga" vai
 * passar a pedir a vaga INTEIRA, porque o Pandapé a manda incompleta, e o diretor exigiu REUSAR
 * este formulário em vez de escrever um segundo (§A.26). Duas cópias divergem no primeiro campo
 * novo, e o campo novo aqui é semanal.
 *
 * A RODADA 1 (a extração) NÃO MUDOU COMPORTAMENTO NENHUM: mesmos 5 passos, mesma régua, mesmas
 * mensagens. A RODADA 2 ligou o `liberacao`, e ela NÃO TOCA nos outros três modos: tudo o que o
 * modo novo faz de diferente está atrás de um `ehLiberacao`.
 *
 * O MODO É QUEM DIZ DE ONDE A TRILHA NASCE. `nova` abre em branco; `rascunho` continua aquela vaga
 * (o código volta e o salvamento é PATCH); `clone` copia os campos e deixa o código vazio, porque
 * cada processo seletivo tem o número dele. `liberacao` completa a vaga que a varredura do Pandapé
 * espelhou incompleta, e é a tela "Liberar Vaga" que o monta.
 *
 * ┌─ O QUE O `liberacao` FAZ DE DIFERENTE, em quatro linhas ────────────────────────────────────┐
 * │ 1. ESCONDE o seletor de Status (o destino é fixo, resolvido no servidor) e o bloco da        │
 * │    contraparte (a vaga espelhada tem `abertoPorId` NULO), e deixa o CÓDIGO em leitura.       │
 * │ 2. A RÉGUA olha o status de DESTINO (o papel `ABERTURA`), nunca o da fila: com o da fila ela │
 * │    não cobraria nada, que é o buraco que o servidor já teve de fechar do lado dele.          │
 * │ 3. O RODAPÉ tem três botões: Cancelar, "Salvar sem liberar" (PATCH, a vaga FICA na fila) e   │
 * │    "Liberar vaga" (POST, grava e move na mesma transação), este desabilitado enquanto faltar │
 * │    obrigatório, com a lista clicável no topo desde a abertura.                                │
 * │ 4. O `status` NÃO viaja no corpo: na fila, quem move a vaga é a liberação e mais nada.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O COMPONENTE SÓ EXISTE MONTADO, e é por isso que o antigo `aberto` sumiu: a página monta quando
 * abre e desmonta quando fecha, com `key` na vaga, então o estado do formulário nasce limpo a cada
 * abertura em vez de depender de alguém lembrar de zerá-lo.
 *
 * §A.11 (sem travessão), §A.24 (title case em título e tag), §A.35 (nenhum `<select>` cru: são 20
 * `Select` e 2 `Combobox` do design system), §A.41 (o `ui/Modal` não fecha ao clicar fora; a saída
 * é o Cancelar do rodapé, o Salvar, ou a tecla Escape).
 */

import { useMemo, useRef, useState, type FormEvent } from "react";
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
  VAGA_TEMPO_CONTRATO,
  VAGA_TESTES,
  VAGA_TESTE_LABEL,
  VAGA_TIPO_SUBSTITUICAO,
  VAGA_TIPO_SUBSTITUICAO_LABEL,
  VAGA_VINCULO,
  VAGA_VINCULO_LABEL,
  contraparteDe,
  exigeMotivoContratacao,
  exigeTempoContrato,
  regioesDaUf,
  rotuloTempoContrato,
  separarOpcaoEscape,
  textoPendencia,
  IDIOMA_NIVEIS,
  IDIOMA_NIVEL_LABEL,
  type AsLinhaDeServico,
  type AsVagaIdioma,
  type IdiomaNivel,
  type VagaContextoAs,
  type VagaDetalhe,
  type VagaListItem,
  type VagaPendencia,
} from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { maskMoedaBR, salarioParaCampo } from "@/lib/salario";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { Stepper, type StepDef } from "@/components/nova/Stepper";
import { useCidades } from "@/lib/as-cidades";
import { corDoTom } from "@/lib/as-etapas";
import { pendenciasComLinhaDeServico } from "@/lib/as-linhas-servico";
import { type AsSegmento } from "@/lib/as-segmentos";
import { statusDePublicacao, statusDoPapel, type AsVagaStatus } from "@/lib/as-status-vaga";
import { avisoDeReducaoNaTrilha } from "@/lib/as-vaga-meta";
import { liberarVagaPendenteRevisao, salvarVagaEmRevisao } from "@/lib/as-vagas-revisao";

export interface OpcaoCliente {
  codCliente: string;
  rotulo: string;
  /**
   * O DESEMPATE DO NOME REPETIDO (Onda D). O `rotulo` passou a ser o NOME PURO, sem o código na
   * frente, e 138 dos 232 clientes ativos compartilham o nome com outro (o maior grupo tem 52
   * linhas iguais). O CNPJ é o que separa essas filiais, e por isso ele viaja junto.
   *
   * OPCIONAL de propósito: a tela continua montando a lista se o backend ainda não mandar o campo,
   * e nesse caso o desempate cai no `codCliente`, que sempre existe.
   */
  cnpj?: string | null;
  enderecoPadrao: string | null;
  escalaPadrao: string | null;
  /** O contato focal da ÚLTIMA vaga deste cliente (item 1). Nulo = cliente sem vaga anterior. */
  solicitanteNome: string | null;
  solicitanteTelefone: string | null;
  solicitanteEmail: string | null;
}

export interface Opcoes {
  cargos: { id: string; nome: string }[];
  clientes: OpcaoCliente[];
  beneficios: { id: string; nome: string; exigeValor: boolean }[];
  motivos: string[];
  /** Os consultores de A&S, para o filtro da coluna do item 16. Vem do endpoint, não das linhas. */
  consultores: { id: string; nome: string }[];
  /** O cadastro de escalas do menu gerencial (item 5), servido pelo próprio módulo de A&S. */
  escalas: string[];
  /**
   * OS COMERCIAIS (Onda E), servidos POR AQUI e não por uma rota de catálogo aberta: a lista é de
   * NOMES DE PESSOA, e esta superfície já é governada pelo menu desta tela (§A.6).
   *
   * OS INATIVOS VÊM JUNTO, com o `ativo` ao lado, e o flag é o que deixa as duas superfícies
   * conviverem sem uma segunda rota: o FILTRO quer todo mundo (a vaga de quem saiu da empresa é
   * justamente a que se procura quando alguém sai), e o SELETOR da trilha quer só os ativos, porque
   * não se oferece quem saiu para uma vaga nova.
   */
  comerciais: { id: number; rotulo: string; ativo: boolean }[];
}

/** Os 5 passos da trilha. O `hint` é a linha de apoio do Stepper, não um título (§A.24). */
const STEPS: StepDef[] = [
  { label: "A Vaga", hint: "Cliente, cargo e posições" },
  { label: "Quem Pediu", hint: "Solicitante e datas" },
  { label: "Contratação", hint: "Vínculo e motivo" },
  { label: "Condições", hint: "Salário e benefícios" },
  { label: "Requisitos", hint: "Quem procuramos" },
];

export const MOTIVO_SUBSTITUICAO = "Substituição";

export const HOJE = () => new Date().toISOString().slice(0, 10);

/**
 * OS IDIOMAS DA VAGA VOLTANDO PARA O FORMULÁRIO, lendo os DOIS campos do contrato.
 *
 * ┌─ SÃO DOIS CAMPOS, E ELES CONVIVEM DE PROPÓSITO ───────────────────────────────────────────┐
 * │ `idiomasExigidos` é o par idioma+nível, e é ele que a Onda C escreve. `idiomas` é a lista   │
 * │ legada, só de nomes, CONGELADA: ela não foi convertida, e é isso que torna a virada          │
 * │ reversível. A tela lê o NOVO e CAI no antigo quando ele vier vazio, que é o caso da vaga     │
 * │ aberta antes desta onda.                                                                     │
 * │                                                                                              │
 * │ O IDIOMA LEGADO VOLTA SEM NÍVEL, e isso é honesto: ninguém escolheu nível nenhum lá atrás, e │
 * │ inventar "Básico" seria gravar uma exigência que a vaga nunca fez. O nível fica pendente, a  │
 * │ caixa daquele idioma diz "nível não informado", e a trilha cobra antes de publicar, que é    │
 * │ exatamente o que o nível obrigatório quer dizer.                                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TIPO DA LEITURA É `VagaIdiomaGravado` (nível ANULÁVEL), e não o `AsVagaIdioma` da escrita
 * (nível OBRIGATÓRIO). Os dois existem separados para que nenhum ponto que GRAVA passe a aceitar
 * nível ausente por omissão: aqui se lê o que pode ser ENCONTRADO, e lá se escreve o que é EXIGIDO.
 */
export function idiomasDaVaga(v: VagaListItem): {
  idiomas: string[];
  idiomaNiveis: Record<string, string>;
} {
  if (v.idiomasExigidos.length > 0) {
    const niveis: Record<string, string> = {};
    for (const par of v.idiomasExigidos) if (par.nivel) niveis[par.idioma] = par.nivel;
    return { idiomas: v.idiomasExigidos.map((par) => par.idioma), idiomaNiveis: niveis };
  }
  return { idiomas: v.idiomas, idiomaNiveis: {} };
}

/**
 * MÁSCARA DE CPF, a mesma do wizard de Nova Admissão. O campo mostra "123.456.789-01" e o que viaja
 * para o backend são os 11 dígitos: quem confere se o dígito fecha é o service, com a mensagem em
 * português (§A.6, o número não volta na mensagem de erro).
 */
export function formatCpf(valor: string): string {
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

/** O formulário inteiro num objeto só: o rascunho da trilha é este estado, e ele atravessa os passos. */
interface FormVaga {
  codigo: string;
  cargoId: string;
  nomeDivulgacao: string;
  codCliente: string;
  natureza: string;
  status: string;
  sazonalidade: string;
  /** O id do catálogo `as_linhas_servico`, como texto porque vem de um `Select` (Onda C, peça 1). */
  linhaServicoId: string;
  /**
   * ─ A SOBREPOSIÇÃO DE SEGMENTO E COMERCIAL (Onda E). VAZIO SIGNIFICA **HERDAR** ───────────────
   *
   * ELES NÃO SÃO "CAMPO EM BRANCO", e a diferença é a onda inteira: vazio aqui não quer dizer "a
   * vaga não tem segmento", quer dizer "a vaga vale o segmento do CLIENTE, vivo". Preencher é a
   * EXCEÇÃO, e significa "esta vaga foge do padrão do cliente". É por isso que o campo do payload
   * vira `undefined` quando vazio, e nunca zero nem string vazia: ausente é o que o servidor lê
   * como herdar.
   *
   * O NOME CARREGA "SOBREPOSTO" DE PROPÓSITO, o mesmo cuidado que o contrato tomou: chamá-lo de
   * `segmentoId` poria, ao lado do valor EFETIVO da vaga, um campo que vale nulo justamente em quem
   * herda, e quem o pegasse para escrever um filtro teria o conteúdo errado sem nenhum vermelho.
   */
  segmentoSobrepostoId: string;
  comercialSobrepostoId: string;
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
  /** O código do IBGE da cidade, como texto pelo mesmo motivo (Onda C, peça 2). */
  cidadeId: string;
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
  /**
   * O NÍVEL DE CADA IDIOMA ESCOLHIDO, indexado pelo idioma (Onda C, peça 3).
   *
   * MAPA, E NÃO UMA SEGUNDA LISTA: duas listas casadas por POSIÇÃO desalinham na primeira remoção
   * do meio, e o par viaja para o servidor como objeto (`AsVagaIdioma`) justamente para não ter
   * como desalinhar. Aqui o mapa é só a forma mais direta de o formulário guardar a escolha.
   */
  idiomaNiveis: Record<string, string>;
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
  linhaServicoId: "",
  // VAZIO É HERDAR, e é o estado normal: a vaga nasce valendo o segmento e o comercial do cliente.
  segmentoSobrepostoId: "",
  comercialSobrepostoId: "",
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
  cidadeId: "",
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
  idiomaNiveis: {},
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
export function Campo({
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

/**
 * DE ONDE A TRILHA NASCE. O modo é lido UMA VEZ, na montagem: a página troca a `key` quando troca
 * de vaga, então nunca existe um formulário meio de uma vaga e meio de outra.
 *
 * `liberacao` É PRODUZIDO PELA TELA "Liberar Vaga" (`as/vagas-pendentes-revisao`), e não pela
 * Central de Vagas: é a vaga que a varredura do Pandapé espelhou incompleta, sendo completada para
 * sair da fila. O que ele esconde e o que ele grava está no topo do arquivo.
 *
 * A VAGA CHEGA COMO `VagaDetalhe`, E NÃO MAIS COMO `VagaListItem` (correção de LGPD ativo,
 * 22/09/2026): o `substituidoCpf` SAIU da resposta da lista, que descia o CPF de toda vaga para todo
 * consultor a cada carga. Agora quem abre a trilha (editar rascunho, clonar ou liberar) busca a vaga
 * por `GET /as/vagas/:id`, UMA por vez, e passa o detalhe (lista MAIS o CPF) para cá. O
 * `estadoInicial` lê `v.substituidoCpf` para preencher o campo, e só encontra o CPF por causa disso.
 */
export type ModoDaTrilha =
  | { tipo: "nova" }
  | { tipo: "rascunho"; vaga: VagaDetalhe }
  | { tipo: "clone"; vaga: VagaDetalhe }
  | { tipo: "liberacao"; vaga: VagaDetalhe };

/**
 * O QUE A TRILHA NÃO BUSCA SOZINHA, e é de propósito: a Central de Vagas já lê `opcoes`, `contexto`
 * e o catálogo de segmentos para os FILTROS dela, e as listas de cliente e de cargo são as MESMAS
 * do filtro e do formulário. Buscar de novo aqui daria duas leituras do mesmo endpoint por
 * abertura, e duas listas que podem discordar.
 *
 * O STATUS E A LINHA DE SERVIÇO TAMBÉM CHEGAM PRONTOS, e isso NÃO é zelo: os ganchos deles nascem
 * com `carregando: true` e resolvem só depois do primeiro quadro. Montados aqui dentro, o seletor de
 * Linha De Serviço piscaria "Carregando as linhas…" e o de Status abriria sem opção nenhuma a cada
 * abertura da trilha, que é mudança de comportamento numa frente que não pode ter nenhuma. A página
 * já os tem lidos, e quem montar a trilha na segunda tela lê pelos mesmos dois ganchos de uma linha
 * (`useStatusVaga`, `useLinhasServico`), que são memoizados por carga de página.
 *
 * A CIDADE É A EXCEÇÃO e continua sendo lida aqui dentro: ela depende da UF DO FORMULÁRIO, que é
 * estado da trilha, e a página não teria como saber o que buscar.
 */
export interface CatalogosDaTrilha {
  opcoes: Opcoes;
  contexto: VagaContextoAs;
  segmentos: AsSegmento[];
  optClientes: { value: string; label: string; hint?: string; busca?: string }[];
  optCargos: { value: string; label: string }[];
  /** `useStatusVaga(token).status`, o catálogo COMPLETO (o seletor recorta com `statusDePublicacao`). */
  statusVaga: AsVagaStatus[];
  /** `useLinhasServico(token)`: as ATIVAS, e o "ainda estou lendo" que desabilita o seletor. */
  linhasAtivas: AsLinhaDeServico[];
  carregandoLinhas: boolean;
}

export interface TrilhaDaVagaProps {
  modo: ModoDaTrilha;
  catalogos: CatalogosDaTrilha;
  token?: string | null;
  /** Sair sem gravar (Cancelar, Escape, descarte confirmado). */
  onFechar: () => void;
  /** Gravou (rascunho ou publicação). A página fecha a trilha e relê a lista. */
  onGravada: () => void | Promise<void>;
}

interface EstadoInicial {
  form: FormVaga;
  beneficios: Record<string, { marcado: boolean; valor: string }>;
  testes: string[];
}

/**
 * A TRILHA RECEBENDO UMA VAGA DE VOLTA, agora como ESTADO INICIAL e não como uma sequência de
 * `set`. É o antigo `preencherTrilhaCom`, com o mesmo conteúdo campo a campo: o clone entra sem
 * código e sem as datas da vaga antiga, o rascunho entra com tudo, e os campos com escape são
 * desfeitos por `separarOpcaoEscape`, que devolve a metade da lista e a metade escrita.
 */
function estadoInicial(modo: ModoDaTrilha, opcoes: Opcoes): EstadoInicial {
  if (modo.tipo === "nova") return { form: FORM_VAZIO(), beneficios: {}, testes: [] };

  const v = modo.vaga;
  /* SÓ O CLONE PERDE O CÓDIGO: o rascunho continua a MESMA vaga, e a liberação também trabalha
     sobre uma vaga que já existe. */
  const manterCodigo = modo.tipo !== "clone";
  const escala = separarOpcaoEscape(v.horarioEscala, opcoes.escalas, ESCALA_OUTRA);
  const faixa = separarOpcaoEscape(v.faixaEtaria, VAGA_FAIXA_ETARIA, OPCAO_OUTRA);
  const hibrido = separarOpcaoEscape(v.detalheHibrido, VAGA_DETALHE_HIBRIDO, OPCAO_OUTRO);

  return {
    form: {
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
      // ONDA C: o clone e o rascunho trazem de volta a classificação e a cidade. O `?? ""` é o que
      // faz a vaga antiga (anterior à Onda C) abrir a trilha com o campo vazio, em vez de quebrar.
      linhaServicoId: v.linhaServicoId ? String(v.linhaServicoId) : "",
      /* ONDA E: volta a SOBREPOSIÇÃO (`...SobrepostoId`), NUNCA o valor efetivo (`v.segmento.id`).
       Trazer o efetivo transformaria em sobreposição o que era herança: a vaga passaria a carimbar
       o segmento que o cliente tinha HOJE e deixaria de acompanhar a troca no cliente, que é
       exatamente a herança viva que o diretor escolheu (12/09). O clone herda como a original. */
      segmentoSobrepostoId: v.segmentoSobrepostoId ? String(v.segmentoSobrepostoId) : "",
      comercialSobrepostoId: v.comercialSobrepostoId ? String(v.comercialSobrepostoId) : "",
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
      cidadeId: v.cidadeId ? String(v.cidadeId) : "",
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
      ...idiomasDaVaga(v),
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
    },
    beneficios: Object.fromEntries(
      v.beneficios.map((b) => [b.id, { marcado: true, valor: salarioParaCampo(b.valor) }]),
    ),
    testes: v.testes,
  };
}

export function TrilhaDaVaga({ modo, catalogos, token, onFechar, onGravada }: TrilhaDaVagaProps) {
  const {
    opcoes,
    contexto,
    segmentos,
    optClientes,
    optCargos,
    statusVaga: catalogoStatus,
    linhasAtivas: linhasAtivasDoCatalogo,
    carregandoLinhas,
  } = catalogos;

  /**
   * A VAGA EM EDIÇÃO, que é o antigo `editandoId` virado leitura do modo. Ela responde a duas
   * perguntas: se o salvamento é PATCH ou POST, e qual é o "de" da comparação de meta reduzida.
   *
   * O "DE" SAI DA LINHA DA LISTA, como saía antes: a trilha é montada com `key` na vaga, então o
   * objeto aqui é o mesmo que a tabela tinha no clique, e a lista não é relida com o modal aberto.
   */
  const vagaEmEdicao = modo.tipo === "rascunho" || modo.tipo === "liberacao" ? modo.vaga : null;
  const editandoId = vagaEmEdicao?.id ?? null;

  /**
   * ─ O MODO LIBERAÇÃO, QUE É A TRILHA SERVINDO A TELA "LIBERAR VAGA" (rodada 2) ─────────────────
   *
   * A VAGA CHEGA DO PANDAPÉ INCOMPLETA: o ATS não tem benefícios, escala, salário nem endereço, e
   * nem sequer o cliente (a varredura espelha a vaga com `cod_cliente` NULO). A tela pedia só o
   * cliente; agora ela pede a vaga INTEIRA, pelo MESMO formulário da Central de Vagas (§A.26:
   * reusar, nunca duplicar), e sem obrigatório a vaga NÃO sai da fila.
   *
   * O QUE ESTE MODO ESCONDE, e por que cada um:
   *  . o SELETOR DE STATUS, porque o destino é FIXO e resolvido NO SERVIDOR (o papel `ABERTURA`,
   *    pelo catálogo). Oferecer a escolha seria oferecer uma decisão que a tela não toma, e o corpo
   *    desta porta nem carrega `status`;
   *  . o BLOCO DA CONTRAPARTE, porque a vaga espelhada tem `abertoPorId` NULO: ninguém a abriu
   *    aqui. Sem um lado, não há lado oposto a escolher, e o campo não faria nada;
   *  . o CÓDIGO fica em LEITURA, porque ele é o número da vaga NO ATS. É por ele que o espelho se
   *    reconhece na reentrega da varredura, e reescrevê-lo aqui desfaria esse par em silêncio.
   */
  const ehLiberacao = modo.tipo === "liberacao";

  /* LIDO UMA VEZ, NA MONTAGEM. Trocar de vaga é remontar (a `key` da página), então não existe o
     caso de o modo mudar por baixo de um formulário já preenchido. */
  const [inicial] = useState<EstadoInicial>(() => estadoInicial(modo, opcoes));

  const [step, setStep] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [form, setForm] = useState<FormVaga>(inicial.form);
  /**
   * AS CIDADES DO ESTADO ESCOLHIDO (Onda C, peça 2). Sem estado, nenhuma requisição acontece: antes
   * de escolher a UF não há o que perguntar. A memória é por UF, então trocar o estado ida e volta
   * (o gesto de quem está conferindo) não custa uma ida ao servidor a cada troca.
   */
  const {
    cidades: cidadesDaUf,
    carregando: carregandoCidades,
    erro: erroCidades,
  } = useCidades(form.regiaoEstado, token);

  const [beneficios, setBeneficios] = useState<Record<string, { marcado: boolean; valor: string }>>(
    inicial.beneficios,
  );
  const [testes, setTestes] = useState<string[]>(inicial.testes);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
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

  /**
   * O MESMO AVISO, NA SEGUNDA PORTA DA META: o formulário da trilha.
   *
   * A TRILHA TAMBÉM REGRAVA A META, e o backend já registra a redução vinda por ela. Registro sem
   * aviso é o oposto do que o diretor pediu: a pessoa reduziria a meta salvando o formulário, ficaria
   * rastreada, e ninguém teria dito a ela.
   *
   * O `publicar` VIAJA JUNTO pelo mesmo motivo dos números no irmão: a confirmação precisa refazer o
   * envio no destino que a pessoa escolheu. Confirmar um aviso aberto pelo "Salvar Rascunho" e a vaga
   * nascer publicada seria a tela fazendo outra coisa do que foi clicado.
   */
  const [avisoTrilha, setAvisoTrilha] = useState<{ texto: string; publicar: boolean } | null>(null);

  const set = <K extends keyof FormVaga>(campo: K, valor: FormVaga[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  /* AS DUAS LISTAS DA TRILHA. A primeira opção é a HERANÇA, e ela existe para poder VOLTAR: sem
     ela, uma sobreposição escolhida por engano ficaria para sempre, porque o seletor não teria como
     devolver a vaga ao padrão do cliente. "Herdar do cliente" não é "não informado": é o estado
     normal, e dizer isso no lugar de um vazio mudo é o que impede o consultor de achar que o campo
     ficou por preencher. */
  const segmentosDaTrilha = useMemo(
    () => [
      { value: "", label: "Herdar do cliente" },
      ...segmentos
        .filter((sg) => sg.ativo || String(sg.id) === form.segmentoSobrepostoId)
        .map((sg) => ({
          value: String(sg.id),
          label: sg.ativo ? sg.rotulo : `${sg.rotulo} (inativo)`,
        })),
    ],
    [segmentos, form.segmentoSobrepostoId],
  );
  const comerciaisDaTrilha = useMemo(
    () => [
      { value: "", label: "Herdar do cliente" },
      ...opcoes.comerciais
        .filter((c) => c.ativo || String(c.id) === form.comercialSobrepostoId)
        .map((c) => ({
          value: String(c.id),
          label: c.ativo ? c.rotulo : `${c.rotulo} (inativo)`,
        })),
    ],
    [opcoes.comerciais, form.comercialSobrepostoId],
  );

  const ladoOposto = contexto.papelAs ? contraparteDe(contexto.papelAs) : null;

  /** Fechar por engano não pode custar 38 campos: com rascunho na mão, pergunta antes de descartar. */
  function pedirParaSair() {
    const vazio =
      JSON.stringify(form) === JSON.stringify({ ...FORM_VAZIO(), dataAbertura: form.dataAbertura });
    if (vazio && testes.length === 0 && Object.keys(beneficios).length === 0) {
      onFechar();
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
      /* TROCAR O ESTADO ZERA A CIDADE, pelo mesmo motivo de zerar as regiões: a cidade escolhida
         pertence ao estado anterior, e mantê-la deixaria a vaga com cidade de um estado e UF de
         outro, que é exatamente a incoerência que a derivação da UF pela cidade existe para
         impedir do lado do servidor. */
      f.regiaoEstado === uf
        ? f
        : { ...f, regiaoEstado: uf, cidadeId: "", regioes: [], regioesOutras: "" },
    );
  }

  /**
   * O QUE FALTA PARA PUBLICAR, CALCULADO O TEMPO TODO (itens 1 a 4 da OST de 25/08).
   *
   * A MESMA FUNÇÃO DO BACKEND (`vagaPendencias`, no shared-types), sobre o formulário em memória. É
   * ela que responde às três perguntas da tela com uma resposta só: quais campos ganham asterisco,
   * se o publicar pode seguir e o que listar quando ele não puder.
   */
  /**
   * ─ O STATUS QUE A RÉGUA VÊ, NO MODO LIBERAÇÃO, É O DESTINO E NUNCA O ATUAL ────────────────────
   *
   * É O ERRO MAIS FÁCIL DE COMETER AQUI. Passar `vaga.status` (o código da FILA) faria a régua ler
   * o campo `status` como PREENCHIDO, liberar o botão com os onze em branco, e o servidor recusar
   * depois. É a mesma correção que o `liberarPendenteRevisao` fez do lado de lá, pelo mesmo motivo.
   *
   * O CATÁLOGO AINDA NÃO CHEGOU? Cai no `form.status`, que nasce "ABERTA". Um vazio aqui listaria
   * "falta o Status" apontando para um seletor que este modo ESCONDE, e a pessoa ficaria com uma
   * pendência que ela não tem como resolver em tela nenhuma.
   */
  const statusDaRegua = ehLiberacao
    ? (statusDoPapel("ABERTURA", catalogoStatus)?.codigo ?? form.status)
    : form.status;

  const pendenciasAgora = useMemo(
    () =>
      pendenciasComLinhaDeServico({
        // ESTA LISTA É O TERCEIRO PONTO DE EDIÇÃO DE TODO OBRIGATÓRIO NOVO, e o mais fácil de
        // esquecer: a régua indexa por TEXTO e todo campo do contrato é opcional, então o campo
        // que não for passado aqui chega `undefined`, é lido como VAZIO e a pendência fica listada
        // para sempre, com o campo preenchido na frente da pessoa e o typecheck VERDE. Como o
        // `enviar(publicar)` barra na lista antes de qualquer chamada, o esquecimento não vira um
        // aviso errado: vira vaga que não publica pela tela, nunca.
        // Os três pontos são: a entrada em `VAGA_OBRIGATORIOS`, o campo com `id`/`obrigatorio` na
        // trilha, e esta lista.
        codCliente: form.codCliente,
        codigo: form.codigo,
        // ONDA C: a linha de serviço entra na MESMA régua, então o asterisco, a trava do publicar e
        // a lista clicável de pendências passam a contá-la juntos, sem nenhum `if` novo na tela.
        linhaServicoId: form.linhaServicoId,
        nomeDivulgacao: form.nomeDivulgacao,
        cargoId: form.cargoId,
        posicoesOficiais: form.posicoesOficiais,
        natureza: form.natureza,
        sazonalidade: form.sazonalidade,
        // O DESTINO no modo liberação, o escolhido nos demais. Ver `statusDaRegua`, logo acima.
        status: statusDaRegua,
        dataAbertura: form.dataAbertura,
        dataLimite: form.dataLimite,
      }),
    [form, statusDaRegua],
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
   *
   * O `jaAvisado` É A VOLTA DA CONFIRMAÇÃO da redução de meta, e não um jeito de pular o aviso: o
   * único chamador que o passa como verdadeiro é o botão do próprio diálogo, depois de a pessoa ter
   * lido a frase. Sem ele, confirmar reabriria o mesmo aviso para sempre.
   */
  async function enviar(publicar: boolean, jaAvisado = false) {
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

    /**
     * A META QUE VAI NO CORPO, CALCULADA UMA VEZ SÓ, porque ela é lida por dois: o aviso, que a
     * descreve para a pessoa, e o envio, que a grava. Duas contas separadas abririam a fresta de
     * alguém confirmar uma frase e o servidor receber outro número.
     */
    const metaEnviada = {
      oficiais: Number(form.posicoesOficiais) > 0 ? Number(form.posicoesOficiais) : undefined,
      // ZERO É VALOR AQUI, não ausência: o `undefined` fica só para o campo em branco, senão
      // apagar o número do banco não teria como ser gravado.
      banco: form.posicoesBanco === "" ? undefined : Number(form.posicoesBanco),
    };

    /**
     * ┌─ A SEGUNDA PORTA DA META TAMBÉM AVISA ──────────────────────────────────────────────────┐
     * │ O diálogo de posições não é o único lugar que baixa a meta: este formulário a regrava      │
     * │ junto com os outros campos, e o backend já registra a redução vinda por aqui. Uma porta que │
     * │ REGISTRA e não AVISA é o oposto do que o diretor pediu, porque a pessoa fica rastreada sem  │
     * │ que ninguém tenha dito a ela.                                                              │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * SÓ COM VAGA ANTERIOR, e é o que separa esta porta da irmã: abertura NOVA não tem "de", então o
     * primeiro preenchimento DEFINE a meta em vez de reduzi-la. Sem `editandoId` não há comparação.
     *
     * O "DE" SAI DA LISTA, que é a vaga como ela está GRAVADA, e é contra ela que o servidor compara.
     * Um retrato tirado na abertura da trilha envelheceria em silêncio.
     *
     * A RÉGUA É A MESMA DO DIÁLOGO DE POSIÇÕES (`@/lib/as-vaga-meta`), inclusive o cuidado com o
     * campo vazio: em branco, o servidor PRESERVA a meta oficial, e avisar de uma "queda para zero"
     * que não vai acontecer seria um aviso mentindo.
     */
    if (!jaAvisado) {
      const anterior = vagaEmEdicao ?? undefined;
      const aviso = avisoDeReducaoNaTrilha(
        anterior ? { oficiais: anterior.posicoesOficiais, banco: anterior.posicoesBanco } : null,
        metaEnviada,
      );
      if (aviso) {
        setAvisoTrilha({ texto: aviso, publicar });
        return;
      }
    }

    // O DIÁLOGO SAI DA FRENTE QUANDO O SALVAMENTO COMEÇA: o estado de "salvando" e a mensagem de
    // erro moram no formulário, e uma pergunta por cima esconderia a resposta.
    setAvisoTrilha(null);
    setSalvando(true);
    try {
      const marcados = Object.entries(beneficios)
        .filter(([, v]) => v.marcado)
        .map(([id, v]) => ({ beneficioId: id, valor: v.valor.trim() || undefined }));
      /**
       * O CORPO É MONTADO UMA VEZ SÓ e serve às TRÊS portas: o POST/PATCH da Central de Vagas, o
       * `PATCH` do "Salvar sem liberar" e o POST da liberação. Montá-lo por destino abriria a
       * chance de um campo novo entrar num caminho e faltar no outro, que é o defeito que a
       * extração do formulário existe para impedir.
       */
      const corpo = {
          codigo: form.codigo || undefined,
          cargoId: form.cargoId || undefined,
          nomeDivulgacao: form.nomeDivulgacao || undefined,
          codCliente: form.codCliente || undefined,
          natureza: form.natureza || undefined,
          /*
           * ─ NO MODO LIBERAÇÃO O `status` NÃO VIAJA, E A AUSÊNCIA É A TRAVA ────────────────────
           * Na fila quem move a vaga é a LIBERAÇÃO, e mais nada: o destino é o papel `ABERTURA`,
           * resolvido pelo catálogo NO SERVIDOR. O `PATCH` do "Salvar sem liberar" grava o status
           * ATUAL de propósito (a vaga continua na fila), e mandar "RASCUNHO" daqui seria pedir
           * para tirá-la dela por uma rota de edição, sem trilha e sem a régua dos obrigatórios.
           */
          ...(ehLiberacao ? {} : { status: publicar ? form.status : "RASCUNHO" }),
          sazonalidade: form.sazonalidade,
          /* ONDA C: o id do catálogo. `undefined` quando vazio, e nunca `0` nem string vazia: o
             rascunho pode ser salvo sem ela, e quem cobra a PRESENÇA na publicação é a régua
             única, dos dois lados. */
          linhaServicoId: form.linhaServicoId ? Number(form.linhaServicoId) : undefined,
          /* ONDA E: `undefined` quando vazio, e é isso que o servidor lê como HERDAR do cliente
             (o DTO recusa zero e string vazia de propósito). Mandar o campo só quando há escolha é
             o que mantém a herança viva: a vaga sem sobreposição continua acompanhando o cliente. */
          segmentoId: form.segmentoSobrepostoId ? Number(form.segmentoSobrepostoId) : undefined,
          comercialId: form.comercialSobrepostoId ? Number(form.comercialSobrepostoId) : undefined,
          posicoesOficiais: metaEnviada.oficiais,
          posicoesBanco: metaEnviada.banco,

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
          /* ONDA C: o código do IBGE. A UF continua indo (é ela que filtra a cidade e é ela que a
             régua de regiões confere), e com a cidade presente o servidor deriva a UF dela: uma
             fonte só, sem chance de a vaga ficar com cidade de um estado e UF de outro. */
          cidadeId: form.cidadeId ? Number(form.cidadeId) : undefined,
          regioes: form.regioes.length ? form.regioes : undefined,
          regioesOutras: form.regioes.includes(REGIAO_OUTRAS)
            ? form.regioesOutras || undefined
            : undefined,
          horarioEscala: comEscape(form.horarioEscalaOpcao, form.horarioEscalaOutra, ESCALA_OUTRA),
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
          /* ONDA C: O PAR IDIOMA + NÍVEL, montado aqui uma vez só. O "Outros" NÃO entra na lista
             de exigências, e nunca entrou: ele é o escape que leva o texto para `idiomasOutros`, e
             mandá-lo como um idioma com nível gravaria uma exigência chamada "Outros".

             IDIOMA SEM NÍVEL NÃO VIAJA. O servidor recusaria o par incompleto (e deve recusar), e
             mandá-lo seria trocar a frase que a tela já escreve na caixa daquele idioma ("nível não
             informado", ao lado do nome) por um 400 genérico no fim do formulário. */
          /* O NOME CANÔNICO DO CAMPO DE ESCRITA É `idiomasExigidos`. O backend ainda aceita o
             `idiomas` antigo no corpo, por compatibilidade, mas mandar pelo nome velho deixaria a
             tela apontando para o campo congelado logo na frente em que ele foi congelado. */
          idiomasExigidos: (() => {
            const pares: AsVagaIdioma[] = form.idiomas
              .filter((i) => i !== OPCAO_OUTROS && form.idiomaNiveis[i])
              .map((i) => ({ idioma: i, nivel: form.idiomaNiveis[i] as IdiomaNivel }));
            return pares.length ? pares : undefined;
          })(),
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
      };

      /**
       * ─ AS DUAS PORTAS DA LIBERAÇÃO, E A DIFERENÇA ENTRE ELAS É A FILA ─────────────────────────
       *
       * "Salvar sem liberar" GRAVA E A VAGA FICA. "Liberar vaga" grava E move, na MESMA transação
       * do servidor, depois de cobrar os onze obrigatórios. Ninguém completa quarenta campos numa
       * sentada, e sem a primeira porta parar no meio custaria o trabalho inteiro.
       */
      if (ehLiberacao && editandoId) {
        if (publicar) await liberarVagaPendenteRevisao(editandoId, corpo, token);
        else await salvarVagaEmRevisao(editandoId, corpo, token);
      } else {
        await apiFetch(editandoId ? `/as/vagas/${editandoId}` : "/as/vagas", {
          method: editandoId ? "PATCH" : "POST",
          token,
          body: corpo,
        });
      }
      await onGravada();
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

  return (
    <>
      <Modal
        onClose={pedirParaSair}
        className="max-w-[1100px] p-0"
        /* O rótulo acompanha o modo: quem usa leitor de tela ouve o que a trilha está fazendo, e
           "Abrir vaga" numa vaga que já existe seria a tela dizendo outra coisa do que faz. */
        ariaLabel={ehLiberacao ? "Liberar vaga" : "Abrir vaga"}
      >
        <form onSubmit={salvar} className="flex max-h-[86vh] flex-col">
          {/* TOPO FIXO: título e Stepper nunca saem da vista, então a pessoa sempre sabe onde está. */}
          <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
            <div className="eyebrow !mb-1">Atração e Seleção</div>
            {/* §A.24: título em title case, e ele diz o que a trilha está fazendo. */}
            <h2 className="mb-4 text-lg font-semibold text-text">
              {ehLiberacao ? "Liberar Vaga" : "Abrir Vaga"}
            </h2>
            {ehLiberacao && (
              <p className="-mt-3 mb-4 text-[12.5px] text-dim">
                Esta vaga entrou sozinha pela varredura do Pandapé, e o ATS não manda cliente,
                salário, benefícios, escala nem endereço. Complete o que falta para liberar. Se
                ainda não tem tudo, salve sem liberar e volte depois: a vaga continua na fila.
              </p>
            )}
            <Stepper steps={STEPS} current={step} />
          </div>

          {/* MIOLO ROLANDO: só os campos do passo atual. */}
          <div ref={mioloRef} className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
            {/*
                O QUE FALTA PARA PUBLICAR (item 4): a lista INTEIRA, cada linha com o passo e o nome
                do campo, e cada linha CLICÁVEL para cair direto nele. Aparece só depois de a pessoa
                tentar publicar, e some sozinha assim que ela preenche o que faltava.
              */}
            {/*
                NO MODO LIBERAÇÃO A LISTA APARECE DESDE A ABERTURA, e não depois de uma tentativa:
                lá o botão NASCE DESABILITADO enquanto houver pendência, então não existe a
                tentativa que faria a lista aparecer. Sem isto, a pessoa veria um botão apagado e
                nenhuma explicação, que é o defeito que a lista clicável existe para matar.
              */}
            {(ehLiberacao || pendencias.length > 0) && pendenciasAgora.length > 0 && (
              <div
                className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-3"
                role="alert"
              >
                <p className="mb-2 text-sm font-semibold text-danger">
                  {ehLiberacao
                    ? "Falta preencher para liberar a vaga"
                    : "Falta preencher para publicar a vaga"}
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
                  {ehLiberacao
                    ? "Clique no item para ir ao campo. Se ainda não tem a informação, salve sem liberar e volte depois."
                    : "Clique no item para ir ao campo. Se ainda não tem a informação, salve como rascunho e volte depois."}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {step === 0 && (
                <>
                  <CampoSelect rotulo="Cliente" largo obrigatorio id="vaga-cliente">
                    {/* OBRIGATÓRIO PARA PUBLICAR (Onda D), e a coluna do banco CONTINUA NULÁVEL.
                          O campo nasceu sem trava nenhuma em 25/08 ("vaga sem cliente vinculado
                          entra e não trava nada"), e o diretor reverteu a decisão em 12/09: toda
                          vaga tem cliente. O que mudou é só o PUBLICAR, que passa pela régua
                          compartilhada; o RASCUNHO segue salvando sem cliente, que é o que mantém
                          de pé o não-bloqueio do §A.3 regra 5.

                          O `id` é a ÂNCORA da pendência clicável: sem ele, o item da lista "falta o
                          Cliente" seria clicável e não levaria a lugar nenhum. */}
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
                      placeholder="Selecionar cliente"
                      ariaLabel="Cliente da vaga"
                    />
                  </CampoSelect>

                  <Campo rotulo="Código da vaga" obrigatorio id="vaga-codigo">
                    {/*
                        NO MODO LIBERAÇÃO ELE É LEITURA, e não uma conveniência: este número é o da
                        vaga NO PANDAPÉ, e é por ele que o espelho se reconhece quando a varredura
                        reentrega a mesma vaga. Reescrevê-lo aqui desfaria esse par em silêncio, e o
                        ATS passaria a criar uma segunda vaga para o mesmo processo seletivo.

                        `readOnly` e não `disabled`: o campo continua alcançável pelo teclado e
                        legível por leitor de tela, e o valor continua viajando no corpo.
                      */}
                    <input
                      value={form.codigo}
                      onChange={(e) => set("codigo", e.target.value)}
                      placeholder="Ex.: 511805"
                      className={ehLiberacao ? "ds-input cursor-not-allowed opacity-70" : "ds-input"}
                      readOnly={ehLiberacao}
                      aria-readonly={ehLiberacao || undefined}
                      title={ehLiberacao ? "Código da vaga no Pandapé, não editável." : undefined}
                    />
                    {ehLiberacao && (
                      <span className="text-[12px] text-faint">
                        Código da vaga no Pandapé. Não é editável aqui.
                      </span>
                    )}
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

                  {/* ─ LINHA DE SERVIÇO (Onda C, peça 1), OBRIGATÓRIA ──────────────────────
                        ELA FICA ENTRE SAZONALIDADE E STATUS, e o lugar é o da leitura: natureza,
                        sazonalidade e linha de serviço são as TRÊS classificações da vaga, e ficam
                        juntas; o status é o estado dela, e fecha o passo.

                        O ASTERISCO NÃO É ESCRITO AQUI. Ele vem da régua declarativa, a mesma que
                        trava o publicar e lista a pendência clicável, e é por isso que
                        `pendenciasComLinhaDeServico` existe: acrescentar um obrigatório continua
                        sendo acrescentar UMA entrada numa lista, e não três lugares para lembrar.

                        AS OPÇÕES SÃO AS ATIVAS DO CATÁLOGO (§A.35, `Select` do design system, que
                        liga a busca sozinho acima de 8 itens). Linha inativada some da escolha e
                        continua escrita nas vagas antigas, que é o que `incluirInativas=1` na
                        leitura garante. */}
                  <CampoSelect rotulo="Linha de serviço" obrigatorio id="vaga-linha-servico">
                    <Select
                      value={form.linhaServicoId}
                      onChange={(v) => set("linhaServicoId", v)}
                      options={linhasAtivasDoCatalogo.map((l) => ({
                        value: String(l.id),
                        label: l.rotulo,
                      }))}
                      placeholder={
                        carregandoLinhas ? "Carregando as linhas…" : "Escolha a linha de serviço"
                      }
                      disabled={carregandoLinhas}
                      ariaLabel="Linha de serviço da vaga"
                    />
                    {/* O CATÁLOGO VAZIO É DITO, e não escondido atrás de um seletor que não abre
                          nada: sem linha cadastrada a vaga não publica, e quem lê precisa do
                          caminho. É a mesma frase do catálogo de motivos de cancelamento. */}
                    {!carregandoLinhas && linhasAtivasDoCatalogo.length === 0 && (
                      <span className="mt-1 block text-[12px] text-warn">
                        Nenhuma linha de serviço está cadastrada. Cadastre em Menu Gerencial, Linhas
                        De Serviço.
                      </span>
                    )}
                  </CampoSelect>

                  {/* ─ SEGMENTO E COMERCIAL (Onda E): A SOBREPOSIÇÃO, E ELA É A EXCEÇÃO ─────
                        ELES FICAM DEPOIS DA LINHA DE SERVIÇO porque são a mesma leitura: natureza,
                        sazonalidade, linha de serviço, segmento e comercial são as classificações
                        da vaga, e ficam juntas; o status é o estado dela, e fecha o passo.

                        NENHUM DOS DOIS É OBRIGATÓRIO, e nem entra na régua de pendências: vazio
                        aqui não é lacuna, é HERANÇA. A vaga nasce valendo o segmento e o comercial
                        do cliente, VIVOS, e trocá-los no cadastro do cliente corrige todas as vagas
                        dele de uma vez (decisão do diretor, 12/09). Preencher aqui é dizer "esta
                        vaga foge do padrão do cliente", e é o caso raro.

                        A PRIMEIRA OPÇÃO É A VOLTA PARA A HERANÇA, e sem ela uma sobreposição
                        escolhida por engano ficaria para sempre, porque o seletor não teria como
                        devolver a vaga ao padrão do cliente.

                        §A.35: `Select` do design system, que liga a busca sozinho acima de 8 itens,
                        e nunca o `<select>` do navegador. */}
                  <CampoSelect rotulo="Segmento" id="vaga-segmento">
                    <Select
                      value={form.segmentoSobrepostoId}
                      onChange={(v) => set("segmentoSobrepostoId", v)}
                      options={segmentosDaTrilha}
                      placeholder="Herdar do cliente"
                      ariaLabel="Segmento desta vaga"
                    />
                    <span className="mt-1 block text-[12px] text-faint">
                      Sem escolha, a vaga vale o segmento do cliente e acompanha as correções feitas
                      lá.
                    </span>
                  </CampoSelect>

                  <CampoSelect rotulo="Comercial" id="vaga-comercial">
                    <Select
                      value={form.comercialSobrepostoId}
                      onChange={(v) => set("comercialSobrepostoId", v)}
                      options={comerciaisDaTrilha}
                      placeholder="Herdar do cliente"
                      ariaLabel="Comercial desta vaga"
                    />
                    <span className="mt-1 block text-[12px] text-faint">
                      Sem escolha, a vaga vale o comercial que atende o cliente hoje.
                    </span>
                  </CampoSelect>

                  {/*
                      O SELETOR DE STATUS SOME NO MODO LIBERAÇÃO. O destino é FIXO (o papel
                      `ABERTURA`) e quem o resolve é o servidor, pelo catálogo: oferecer a escolha
                      seria oferecer uma decisão que esta tela não toma, e o corpo desta porta nem
                      carrega `status`. A régua continua contando o campo, pelo DESTINO
                      (`statusDaRegua`), então nada deixa de ser cobrado por ele sumir.
                    */}
                  {!ehLiberacao && (
                  <CampoSelect rotulo="Status" obrigatorio id="vaga-status">
                    <Select
                      value={form.status}
                      onChange={(v) => set("status", v)}
                      /*
                          ─ A LISTA É `ativo && daTrilha`, LIDA DO CATÁLOGO (onda B2) ──────────

                          ELA ERA `VAGA_STATUS_PUBLICACAO`, montada por EXCLUSÃO, e o preço estava
                          no ar: "Entregue" aparecia aqui e o backend recusava com 400, porque a
                          lista da tela era PROIBIÇÃO e a do servidor era PERMISSÃO. Quem clicava na
                          opção que a própria tela ofereceu recebia um erro dizendo que não pode.

                          Agora a régua é a coluna `daTrilha`, lida pelos dois lados, e o que ela
                          tira daqui ninguém precisou escrever: os três que ENCERRAM a vaga (a porta
                          que a auditoria de segurança vetou: encerrar tem duas portas com régua, e
                          o seletor de um formulário não é a terceira), os INATIVOS, e o RASCUNHO,
                          que é o botão "Salvar Rascunho" e não uma escolha de status.

                          E O CAMINHO INVERSO TAMBÉM VALE: o status que o diretor criar e marcar
                          como da trilha aparece aqui SOZINHO, sem ninguém voltar neste arquivo.
                        */
                      options={statusDePublicacao(catalogoStatus).map((st) => ({
                        value: st.codigo,
                        label: st.rotulo,
                        color: corDoTom(st.tom),
                      }))}
                      ariaLabel="Status da vaga"
                    />
                  </CampoSelect>
                  )}
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

                  {/* ITEM 19 DO MAPA DO TIME (07/09): "Data limite" virou "Previsão de entrega",
                        que é como a operação chama o prazo. SÓ O RÓTULO MUDOU: a coluna do banco
                        segue `data_limite` de propósito, porque renomear coluna é migração
                        destrutiva por um ganho de zero.

                        MINÚSCULA NO "entrega" porque isto é RÓTULO DE CAMPO, e não título nem tag
                        (§A.24): os vizinhos são "Data de abertura" e "Data de solicitação", e uma
                        maiúscula sozinha no meio da coluna leria como erro de digitação.

                        PRAZO EM QUALQUER VAGA (correção de 21/08): a amarração com a vaga sazonal
                        foi removida, qualquer natureza pode ter prazo.

                        OBRIGATÓRIA PARA PUBLICAR (Onda D): entrou na régua compartilhada, e com ela
                        o asterisco, a trava do publicar e a pendência clicável (o `id` é a âncora
                        do salto). O RASCUNHO continua salvando sem prazo. De passagem, é isto que
                        faz a coluna SLA De Entrega parar de dizer "não informado": ela lê
                        exatamente este campo. */}
                  <Campo rotulo="Previsão de entrega" obrigatorio id="vaga-previsao-entrega">
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
                          <strong className="text-text">{PAPEL_AS_LABEL[contexto.papelAs]}</strong>.
                          O outro lado é quem você escolher abaixo.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-4 py-3">
                        <p className="text-[12.5px] text-danger">
                          Seu usuário ainda não tem papel de A&S. Peça ao administrador para definir
                          Consultor ou Recruiter no seu cadastro antes de abrir a vaga.
                        </p>
                      </div>
                    )}
                  </div>

                  {/*
                      O BLOCO DA CONTRAPARTE SOME NO MODO LIBERAÇÃO. A vaga espelhada do Pandapé tem
                      `abertoPorId` NULO: ninguém a abriu aqui, então não há um lado de quem abre
                      para ter um lado oposto. O campo apareceria e não faria nada, que é pior do
                      que não aparecer.
                    */}
                  {ladoOposto && !ehLiberacao && (
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

                  {/* ITEM 1 DO MAPA DO TIME (decisão do diretor, 07/09): MOTIVO, JUSTIFICATIVA E
                        SUBSTITUIÇÃO SÓ NO VÍNCULO TEMPORÁRIO.

                        Fora do temporário estes campos não têm resposta, e ficavam na tela pedindo
                        uma: "por que estamos contratando" é pergunta do contrato por prazo, e o
                        time preenchia "Aumento de demanda" em vaga efetiva só para não deixar em
                        branco. A régua é a mesma do backend (`exigeMotivoContratacao`), que também
                        ZERA os campos na gravação: esconder na tela sem zerar no servidor deixaria
                        motivo órfão numa vaga efetiva, e, no CPF do substituído, dado pessoal
                        guardado sem necessidade (§A.6).

                        ISTO NÃO TORNA NADA OBRIGATÓRIO: `motivo` nunca esteve em
                        `VAGA_OBRIGATORIOS`, então a régua do publicar não mudou. Era opcional e
                        segue opcional, dentro do temporário.

                        O TEMPO DE CONTRATO, logo acima, NÃO ENTRA aqui: ele tem régua própria
                        (`exigeTempoContrato`, três vínculos) e continua aparecendo como aparecia. */}
                  {exigeMotivoContratacao(form.vinculo) && (
                    <>
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

                  {/* ─ CIDADE (Onda C, peça 2): CAMPO NOVO AO LADO DO ESTADO ──────────────
                        A UF NÃO SAIU, e isso é correção de premissa: ela é quem FILTRA a cidade, e
                        é ela que a régua de regiões do backend continua conferindo. A cidade entra
                        ao lado, não no lugar.

                        A BUSCA NÃO É OPCIONAL AQUI (§A.35): são 5.570 municípios no país, e o maior
                        estado sozinho tem 853. O `Combobox` do design system com `searchable` é o
                        único jeito de o campo ser usável; sem ela, escolher uma cidade seria rolar
                        uma lista de centenas de linhas.

                        A LISTA SÓ É BUSCADA QUANDO O ESTADO É ESCOLHIDO, e por isso o campo nasce
                        fechado dizendo o que fazer: baixar o país inteiro para preencher um campo
                        seria meio megabyte em toda abertura de vaga, e a esmagadora maioria dele de
                        estados que aquela vaga nunca vai citar. */}
                  <CampoSelect rotulo="Cidade">
                    {form.regiaoEstado ? (
                      <>
                        <Combobox
                          value={form.cidadeId}
                          onChange={(v) => set("cidadeId", v)}
                          options={cidadesDaUf.map((c) => ({
                            value: String(c.id),
                            label: c.nome,
                          }))}
                          placeholder={
                            carregandoCidades
                              ? "Carregando as cidades…"
                              : "Busque pelo nome da cidade"
                          }
                          ariaLabel="Cidade da vaga"
                          searchable
                          limpavel
                        />
                        {erroCidades && (
                          <span className="mt-1 block text-[12px] text-warn">{erroCidades}</span>
                        )}
                      </>
                    ) : (
                      <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[12.5px] text-faint">
                        Escolha o estado ao lado para buscar a cidade.
                      </p>
                    )}
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
                      options={VAGA_GENERO.map((g) => ({
                        value: g,
                        label: VAGA_GENERO_LABEL[g],
                      }))}
                      ariaLabel="Gênero"
                    />
                  </CampoSelect>

                  {/* ITEM 6: seleção MÚLTIPLA. Era texto, e "inglês avançado", "Inglês/Espanhol"
                        e "ingles basico" eram três grafias da mesma exigência, nenhuma filtrável. */}
                  <CampoSelect rotulo="Idiomas">
                    <MultiSelect
                      values={form.idiomas}
                      /* DESMARCAR UM IDIOMA LEVA O NÍVEL DELE JUNTO. Sem isto, o mapa guardaria o
                           nível de um idioma que ninguém mais exige, e ele voltaria sozinho no dia
                           em que a pessoa remarcasse o idioma, com um valor que ela não escolheu
                           naquela sessão. O par nasce e morre junto. */
                      onChange={(v) => {
                        setForm((f) => ({
                          ...f,
                          idiomas: v,
                          idiomaNiveis: Object.fromEntries(
                            Object.entries(f.idiomaNiveis).filter(([idioma]) => v.includes(idioma)),
                          ),
                        }));
                      }}
                      options={VAGA_IDIOMAS.map((i) => ({ value: i, label: i }))}
                      placeholder="Selecionar os idiomas"
                      ariaLabel="Idiomas"
                    />
                  </CampoSelect>

                  {/* ─ O NÍVEL DE CADA IDIOMA (Onda C, peça 3) ──────────────────────────────
                        UMA CAIXA POR IDIOMA ESCOLHIDO, e o nível é OBRIGATÓRIO em cada uma: idioma
                        sem nível é a caixa de texto de volta com outro nome, que é justamente o que
                        esta peça existe para acabar. A exigência "inglês" não diz nada; "inglês
                        fluente" e "inglês básico" são vagas diferentes.

                        O PAR VIAJA COMO OBJETO (`AsVagaIdioma`), nunca como duas listas casadas por
                        posição: duas listas desalinham na primeira remoção do meio, e o desalinho
                        grava uma exigência que ninguém pediu sem nada falhar.

                        O QUE FALTA É DITO NA PRÓPRIA CAIXA, e não só no fim: quem escolheu quatro
                        idiomas precisa ver QUAL deles está sem nível, e não uma frase genérica
                        embaixo do formulário. A vaga antiga volta do clone sem nível nenhum (a
                        coluna nova nasceu vazia), e aí a caixa diz exatamente isso, em vez de
                        inventar um "Básico" que ninguém escolheu. */}
                  {form.idiomas.filter((i) => i !== OPCAO_OUTROS).length > 0 && (
                    <Campo rotulo="Nível de cada idioma" largo obrigatorio>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {form.idiomas
                          .filter((i) => i !== OPCAO_OUTROS)
                          .map((idioma) => {
                            const nivel = form.idiomaNiveis[idioma] ?? "";
                            return (
                              <div
                                key={idioma}
                                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3"
                              >
                                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[12.5px] font-semibold text-text">
                                    {idioma}
                                  </span>
                                  {!nivel && (
                                    <span className="text-[11.5px] text-warn">
                                      nível não informado
                                    </span>
                                  )}
                                </div>
                                <Select
                                  value={nivel}
                                  onChange={(v) =>
                                    setForm((f) => ({
                                      ...f,
                                      idiomaNiveis: { ...f.idiomaNiveis, [idioma]: v },
                                    }))
                                  }
                                  options={IDIOMA_NIVEIS.map((n) => ({
                                    value: n,
                                    label: IDIOMA_NIVEL_LABEL[n],
                                  }))}
                                  placeholder="Escolha o nível"
                                  ariaLabel={`Nível de ${idioma}`}
                                />
                              </div>
                            );
                          })}
                      </div>
                    </Campo>
                  )}

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
                    <span className="mb-1.5 block text-[12.5px] text-dim">Aplicação de testes</span>
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
                                e.target.checked ? [...atual, t] : atual.filter((x) => x !== t),
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
            {/*
                NO MODO LIBERAÇÃO O "Cancelar" NÃO SOME NO PASSO 2, e isso é decisão de rodapé: os
                três botões do gesto (Cancelar, Salvar sem liberar, Liberar vaga) ficam à vista o
                tempo todo, e o "Voltar" entra ao lado em vez de ocupar o lugar do Cancelar. No modo
                normal o botão continua sendo UM só, exatamente como o diretor já validou.
              */}
            <div className="flex items-center gap-2">
              {ehLiberacao ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={pedirParaSair}
                    disabled={salvando}
                  >
                    Cancelar
                  </Button>
                  {step > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setStep((s) => s - 1)}
                      disabled={salvando}
                    >
                      Voltar
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => (step === 0 ? pedirParaSair() : setStep((s) => s - 1))}
                  disabled={salvando}
                >
                  {step === 0 ? "Cancelar" : "Voltar"}
                </Button>
              )}
            </div>

            <span className="text-[12.5px] text-dim">
              Passo {step + 1} de {STEPS.length}
            </span>

            <div className="flex items-center gap-3">
              {/*
                  SALVAR RASCUNHO EM QUALQUER PASSO (item 3): a vaga que o consultor ainda não tem
                  como completar sai da cabeça dele e entra no sistema, sem cobrar nada.
                */}
              {/*
                  NO MODO LIBERAÇÃO ELE VIRA "Salvar sem liberar", e o verbo é o contrato: a vaga
                  NÃO é um rascunho, ela é uma vaga viva na fila de revisão, e o `PATCH` a deixa
                  exatamente onde estava. Botão é COMANDO, então escrita normal (§A.24).
                */}
              <Button
                type="button"
                variant="secondary"
                onClick={() => void enviar(false)}
                disabled={salvando}
              >
                {salvando
                  ? "Salvando…"
                  : ehLiberacao
                    ? "Salvar sem liberar"
                    : "Salvar Rascunho"}
              </Button>

              {step < STEPS.length - 1 && (
                <Button key="continuar" type="button" onClick={() => setStep((s) => s + 1)}>
                  {/*
                      NAVEGAÇÃO LIVRE (item 2, mudança de regra do diretor): NENHUM passo trava o
                      avanço, nem o passo 1. A trava dos obrigatórios saiu daqui e foi para o
                      publicar, que é o momento em que ela significa alguma coisa.
                    */}
                  Continuar
                </Button>
              )}

              {/*
                  ─ "LIBERAR VAGA" APARECE EM TODO PASSO, e DESABILITADO enquanto faltar campo ───
                  Ele não espera o último passo como o "Abrir Vaga" do modo normal: quem completa a
                  vaga do Pandapé preenche por onde consegue, e a lista clicável no topo já leva a
                  cada pendência. Enquanto ela não zerar o botão fica apagado, com o motivo escrito
                  no `title` e contado ao lado.

                  A TRAVA DE VERDADE CONTINUA SENDO DO SERVIDOR: ele cobra os onze ANTES de
                  escrever e recusa com a lista inteira. Isto aqui é o aviso, para ninguém clicar no
                  que seria recusado.
                */}
              {ehLiberacao ? (
                <Button
                  key="liberar"
                  type="button"
                  onClick={() => void enviar(true)}
                  disabled={salvando || pendenciasAgora.length > 0}
                  title={
                    pendenciasAgora.length > 0
                      ? `Falta preencher ${pendenciasAgora.length} ${pendenciasAgora.length === 1 ? "campo obrigatório" : "campos obrigatórios"}.`
                      : undefined
                  }
                >
                  {salvando
                    ? "Liberando…"
                    : pendenciasAgora.length > 0
                      ? `Liberar vaga (${pendenciasAgora.length} pendente${pendenciasAgora.length === 1 ? "" : "s"})`
                      : "Liberar vaga"}
                </Button>
              ) : (
                step === STEPS.length - 1 && (
                  <Button key="abrir" type="submit" disabled={salvando}>
                    {salvando ? "Publicando…" : editandoId ? "Publicar Vaga" : "Abrir Vaga"}
                  </Button>
                )
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* ── O AVISO DA REDUÇÃO DE META, NA PORTA DA TRILHA ────────────────
          O MESMO TEXTO DA OUTRA PORTA, de propósito: é a mesma ação, com a mesma consequência, e
          duas frases diferentes para o mesmo gesto ensinariam que uma delas é a séria.

          TRANSPARÊNCIA, NÃO ACUSAÇÃO, então `warn` e não `danger`: baixar a meta é direito do
          consultor, e um diálogo vermelho transformaria operação normal em suspeita. `warn` também
          não é `default`, porque o check azul do `default` vestia de SUCESSO um aviso que a pessoa
          ainda pode cancelar (decisão do diretor, 09/09).

          O BOTÃO REPETE O QUE FOI CLICADO ("Publicar Vaga" ou "Salvar Rascunho"): quem confirma está
          terminando a ação que começou, e um verbo novo aqui sugeriria uma segunda ação que não
          existe. */}
      <ConfirmDialog
        /* A GUARDA VIROU A MONTAGEM: o diálogo mora DENTRO da trilha, então fechar a trilha o leva
           junto e não sobra na tela uma pergunta sobre uma vaga que não está mais em edição. Era
           esse o papel do antigo `aberto` da página. */
        open={avisoTrilha !== null}
        title="Reduzir A Meta De Posições?"
        message={avisoTrilha?.texto ?? ""}
        /* O BOTÃO REPETE O QUE FOI CLICADO, e no modo liberação os verbos são outros: confirmar um
           aviso aberto pelo "Salvar sem liberar" num botão escrito "Salvar Rascunho" faria a
           pergunta falar de um gesto que a tela não oferece. */
        confirmLabel={
          ehLiberacao
            ? avisoTrilha?.publicar
              ? "Liberar vaga"
              : "Salvar sem liberar"
            : avisoTrilha?.publicar
              ? "Publicar Vaga"
              : "Salvar Rascunho"
        }
        cancelLabel="Cancelar"
        tone="warn"
        busy={salvando}
        onConfirm={() => {
          if (avisoTrilha) void enviar(avisoTrilha.publicar, true);
        }}
        onCancel={() => setAvisoTrilha(null)}
      />

      <ConfirmDialog
        open={confirmarDescarte}
        /* NO MODO LIBERAÇÃO A VAGA NÃO É DESCARTADA, e dizer que é seria mentir: ela já existe e
           continua na fila. O que se perde é o PREENCHIMENTO, e é isso que a pergunta diz. */
        title={ehLiberacao ? "Sair Sem Salvar?" : "Descartar Esta Vaga?"}
        message={
          ehLiberacao
            ? "Você preencheu campos que ainda não foram salvos. Se sair agora, eles se perdem e a vaga continua na fila como está. Para guardar o que já fez, use Salvar sem liberar."
            : "Você preencheu campos que ainda não foram salvos. Se sair agora, eles se perdem."
        }
        confirmLabel="Descartar"
        cancelLabel="Continuar preenchendo"
        tone="danger"
        onConfirm={() => {
          setConfirmarDescarte(false);
          onFechar();
        }}
        onCancel={() => setConfirmarDescarte(false)}
      />
    </>
  );
}
