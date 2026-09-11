/**
 * ─ O RECORTE DA LISTA DENTRO DO PAINEL DA VAGA: busca por nome, situação e etapa ───────────────
 *
 * O diretor pediu GESTÃO COMPLETA dentro dos dois cards do painel, pensando no volume: buscar por
 * nome, filtrar por situação e por etapa (multiselect), tudo convivendo com a seleção múltipla e as
 * ações em massa que já existem. Esta é a régua desse recorte, e ela mora aqui, fora do componente,
 * por uma razão que não é estilo.
 *
 * ┌─ A REGRA QUE ESTE ARQUIVO EXISTE PARA GARANTIR ────────────────────────────────────────────┐
 * │ A SELEÇÃO NUNCA SOBREVIVE INVISÍVEL. Linha que sai do recorte à vista, por busca ou por      │
 * │ filtro, SAI DA SELEÇÃO. É a única régua em que o número que a barra mostra e o efeito que o  │
 * │ banco recebe não têm como divergir.                                                          │
 * │                                                                                              │
 * │ E NÃO É PRECAUÇÃO TEÓRICA: antes desta frente a seleção era resolvida sobre a lista INTEIRA  │
 * │ (não sobre o recorte à vista) e o lote mandava todos os ids sem filtrar. Com filtro, marcar  │
 * │ 8, filtrar para 2 e agir afetaria os 8, SEIS DELES INVISÍVEIS. A auditoria de segurança já   │
 * │ tinha achado a versão anterior desse mesmo defeito nesta mesma barra, onde a tela conta      │
 * │ certo e a régua conta errado. Acrescentar filtro sem fechar isso multiplicaria o buraco.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ §A.6 SATISFEITA POR CONSTRUÇÃO, E NÃO POR DISCIPLINA ───────────────────────────────────────
 *
 * A busca é CLIENTE, sobre a lista que o painel já carregou inteira (a maior vaga da homologação
 * tem 51 candidaturas). Então não há endpoint novo, não há parâmetro de URL e não há como um CPF
 * viajar: a lista do painel não carrega CPF, e o que se compara é o NOME. O pedido do diretor ("CPF
 * nunca na URL") vira impossível de violar, em vez de virar uma regra que alguém precisa lembrar.
 *
 * NENHUMA LISTA NOVA DE SITUAÇÃO OU DE ETAPA NASCE AQUI. As situações são o vocabulário de
 * `@ea/shared-types` e as etapas vêm do catálogo do diretor, por endpoint (`useEtapas`), nunca das
 * linhas carregadas: derivar as opções das linhas as faria encolher assim que a primeira fosse
 * escolhida, e não haveria como somar a segunda sem limpar o filtro (§A.37).
 *
 * §A.11 (sem travessão), §A.24 (as frases daqui são apoio, escrita normal).
 */

import { candidaturaViva, type CandidaturaSituacao } from "@ea/shared-types";
import { normalizar } from "@/lib/as-vagas-lista";

/**
 * O VALOR ESPECIAL DA COLUNA ETAPA, E ELE É OPÇÃO DE FILTRO COMO QUALQUER OUTRA (§A.37).
 *
 * A tabela do painel não mostra etapa de quem saiu do funil: ali ela desenha a etiqueta
 * "Fora Do Funil", porque a etapa de uma candidatura encerrada é memória, e não posição atual.
 * Logo, o filtro de etapa também não pode casar por ela: quem filtra "Triagem" e recebe linhas
 * sem nenhuma pill de Triagem está filtrando por um dado que a tela não mostra.
 *
 * SEM ESTA OPÇÃO NÃO DARIA PARA PERGUNTAR "quem já saiu do funil?", que é metade da pergunta que a
 * coluna cria, e é exatamente o caso que o §A.37 descreve. Com ela, o filtro fala a mesma língua
 * da coluna: o que está escrito na célula é o que se escolhe na lista.
 */
export const ETAPA_FORA_DO_FUNIL = "__FORA_DO_FUNIL__";

/** O que a pessoa escolheu. Tudo vazio quer dizer "a lista inteira da aba". */
export interface RecorteDoPainel {
  /** Texto livre, casado contra o NOME e nada mais (§A.6). */
  busca: string;
  situacoes: string[];
  etapas: string[];
}

export const RECORTE_VAZIO: RecorteDoPainel = { busca: "", situacoes: [], etapas: [] };

/** O mínimo que uma linha precisa ter para passar por esta régua. */
export interface LinhaFiltravel {
  candidatoNome: string;
  situacao: CandidaturaSituacao;
  etapa: string;
}

/** Há algum recorte aplicado? É o que decide a frase do vazio e o botão de limpar. */
export function recorteAtivo(r: RecorteDoPainel): boolean {
  return r.busca.trim().length > 0 || r.situacoes.length > 0 || r.etapas.length > 0;
}

/**
 * QUANTOS CRITÉRIOS ESTÃO LIGADOS, para a tela poder dizer isso sem contar na mão. A busca conta
 * como UM, e não como o número de letras digitadas.
 */
export function criteriosAtivos(r: RecorteDoPainel): number {
  return (
    (r.busca.trim().length > 0 ? 1 : 0) +
    (r.situacoes.length > 0 ? 1 : 0) +
    (r.etapas.length > 0 ? 1 : 0)
  );
}

/**
 * O RECORTE, APLICADO. Os três critérios se somam (E, não OU): quem passa é quem satisfaz todos.
 *
 * LISTA VAZIA DE FILTRO QUER DIZER "TODOS", e não "nenhum". É a convenção de todo filtro do
 * sistema, e o contrário faria a tela nascer vazia antes de alguém escolher qualquer coisa.
 *
 * A BUSCA É NORMALIZADA DOS DOIS LADOS pela `normalizar` que a Central de Vagas já usa: sem acento,
 * sem caixa, sem borda em branco. Aplicar de um lado só é o defeito clássico, em que quem digita
 * "Joao" nunca acha "João" e a tela não explica por quê.
 */
export function aplicarRecorte<T extends LinhaFiltravel>(itens: T[], r: RecorteDoPainel): T[] {
  const termo = normalizar(r.busca);
  const situacoes = new Set(r.situacoes);
  const etapas = new Set(r.etapas);

  return itens.filter((c) => {
    if (termo && !normalizar(c.candidatoNome).includes(termo)) return false;
    if (situacoes.size > 0 && !situacoes.has(c.situacao)) return false;
    if (etapas.size > 0 && !etapas.has(etapaVisivel(c))) return false;
    return true;
  });
}

/**
 * A ETAPA QUE A TABELA MOSTRA para aquela linha, que é a que o filtro tem de casar.
 *
 * Para quem está vivo no funil, é a etapa dela. Para quem saiu, é o valor especial, pelo mesmo
 * motivo de a célula escrever "Fora Do Funil": a etapa guardada ali é de onde a pessoa estava
 * quando saiu, e apresentá-la como posição atual desenharia o descartado dentro do funil.
 */
export function etapaVisivel(c: LinhaFiltravel): string {
  return candidaturaViva(c.situacao) ? c.etapa : ETAPA_FORA_DO_FUNIL;
}

/**
 * ─ A REGRA CENTRAL DA FRENTE: A SELEÇÃO PODADA PELO QUE ESTÁ À VISTA ──────────────────────────
 *
 * Devolve só os ids que continuam visíveis. É ela que garante que agir em massa nunca alcance
 * linha que a pessoa não está vendo, e é ela que faz o contador da barra dizer a verdade.
 *
 * ELA É USADA NOS DOIS SENTIDOS, e os dois são necessários:
 *   1. para PODAR o estado quando o recorte muda, e assim o contador não guardar fantasma;
 *   2. para DERIVAR o que vai para a ação em massa, e assim nem um estado desatualizado conseguir
 *      mandar um id invisível para o servidor.
 *
 * A DERIVAÇÃO SOZINHA NÃO BASTARIA (a seleção escondida voltaria à vista ao limpar o filtro, e o
 * número saltaria sem ninguém ter marcado nada), e a PODA SOZINHA também não (ela depende de um
 * efeito rodar na ordem certa). Juntas, o número e o efeito não têm como divergir.
 */
export function selecaoNoRecorte(selecionados: string[], visiveis: { id: string }[]): string[] {
  const idsVisiveis = new Set(visiveis.map((c) => c.id));
  return selecionados.filter((id) => idsVisiveis.has(id));
}
