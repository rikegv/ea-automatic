import {
  SEM_ORIGEM_DE_ENVIO,
  type AbaDoPainelPortal,
  type EstadoLinkPainel,
  type FiltrosDoPainelPortal,
  type LinhaDoPainelPortal,
  type RecorteDoPainelPortal,
} from "@ea/shared-types";

/**
 * A RÉGUA DO GERENCIADOR DO PORTAL, fora da tela para poder ser testada.
 *
 * A página é grande e mistura três coisas: marcação, chamadas e DECISÃO (o que cada linha é, o que
 * cada botão faz, o que vai na URL da consulta). A decisão mora aqui, e é dela que os testes
 * falam; a tela só desenha o que este módulo afirma.
 *
 * §A.6 vale em cada linha deste arquivo: nada de CPF, nada de IP, nada de navegador, nada de
 * contagem de tentativa. O que passa por aqui é nome, cliente, cargo, documento, data e estado.
 */

// ── As rotas ────────────────────────────────────────────────────────────────────────────────────

export const ROTA_CONTADORES = "/esteira/portal-painel/contadores";
export const ROTA_CANDIDATOS = "/esteira/portal-painel/candidatos";
export const ROTA_CATALOGO_FILTROS = "/esteira/portal-painel/filtros";

/** Emitir link novo: revoga os anteriores da mesma admissão e devolve a URL UMA vez. */
export const rotaEmitir = (admissaoId: string) => `/portal/links/${admissaoId}`;

/**
 * BLOQUEAR E DESBLOQUEAR, e aqui há UMA PERGUNTA ABERTA PARA O COORDENADOR.
 *
 * O par de rotas combinado é `POST /portal/links/:jti/bloquear` e `.../desbloquear`, no mesmo
 * molde do `:jti/revogar` que já existe. Só que o CONTRATO desta rodada
 * (`LinhaDoPainelPortal`) NÃO traz o `jti` da linha: ele tem `admissaoId` e mais nada que
 * identifique o bilhete. Então a tela tem duas saídas, e as duas passam por aqui:
 *
 *  1. o contrato ganha um `linkJti` na linha, e este módulo passa a mandá-lo (é o que a função já
 *     faz quando o campo aparece: ela PREFERE o jti);
 *  2. ou as rotas passam a receber o `admissaoId`, que é o que a tela tem em mãos hoje.
 *
 * Mandar o `admissaoId` num parâmetro que o backend lê como `jti` seria o pior dos mundos: os dois
 * são UUID, o `ParseUUIDPipe` aceitaria, e a operação erraria em silêncio. Por isso o identificador
 * é escolhido em UM lugar só, aqui, e trocar de modelo é uma linha.
 */
export function identificadorDoLink(l: LinhaComJtiOpcional): string | null {
  return l.linkJti ?? null;
}

/**
 * A linha do contrato. O `jti` DEIXOU DE SER OPCIONAL nele, e o alias sobrevive só para não
 * espalhar a troca de nome por toda a tela.
 *
 * ┌─ NÃO EXISTE MAIS RESERVA PARA O `admissaoId`, e a retirada é deliberada ────────────────────┐
 * │ Enquanto o contrato não tinha o `jti`, cair no `admissaoId` era o menos pior. Agora que ele  │
 * │ existe, essa reserva vira o defeito que ela evitava: os dois são UUID, o `ParseUUIDPipe`     │
 * │ aceita os dois, e a rota agiria sobre um link que não é aquele, EM SILÊNCIO. Sem `jti` não   │
 * │ há link vivo para bloquear, e a resposta certa é não oferecer o botão.                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export type LinhaComJtiOpcional = LinhaDoPainelPortal & { linkJti?: string | null };

export const rotaBloquear = (id: string) => `/portal/links/${id}/bloquear`;
export const rotaDesbloquear = (id: string) => `/portal/links/${id}/desbloquear`;

// ── O estado do link ────────────────────────────────────────────────────────────────────────────

/** Os tons do `Pill` do design system, repetidos aqui para o módulo não importar componente. */
export type TomDoLink = "ok" | "wn" | "or" | "dg" | "nt" | "in";

export interface RotuloDeLink {
  label: string;
  tone: TomDoLink;
  rank: number;
}

/**
 * Os CINCO estados do contrato, com o rótulo de tela em Title Case (§A.24). O dado é o do backend;
 * o texto é escolha desta tela, e por isso `SUSPENSO` aparece como "Acesso Bloqueado
 * Temporariamente", que é o que o consultor entende sem saber o vocabulário interno.
 *
 * `BLOQUEADO` (decisão manual do time) e `SUSPENSO` (bloqueio automático por tentativa errada) são
 * ESTADOS DIFERENTES e por isso têm rótulos diferentes: confundi-los faria o consultor achar que
 * desbloqueia no botão algo que só passa sozinho.
 *
 * O `rank` DAQUI É ORDEM DE TABELA, e não a precedência do contrato. Quem resolve QUAL estado vale
 * quando mais de um se aplica é o backend, pela precedência auditada
 * (REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO > VIVO), e a linha chega com UM estado só. O rank
 * abaixo é a ordem em que a coluna Link ordena no clique, do link que abre para o link que morreu,
 * que é a leitura de uma fila de trabalho. São coisas diferentes e não devem ser igualadas.
 */
export const ROTULO_DO_LINK: Record<EstadoLinkPainel, RotuloDeLink> = {
  VIVO: { label: "Ativo", tone: "ok", rank: 0 },
  BLOQUEADO: { label: "Bloqueado", tone: "dg", rank: 1 },
  SUSPENSO: { label: "Acesso Bloqueado Temporariamente", tone: "or", rank: 2 },
  VENCIDO: { label: "Vencido", tone: "wn", rank: 3 },
  REVOGADO: { label: "Revogado", tone: "dg", rank: 4 },
};

export const LINK_DESCONHECIDO: RotuloDeLink = { label: "Não Informado", tone: "nt", rank: 9 };

/** Estado fora do catálogo não derruba a tabela: vira etiqueta neutra no fim da ordenação. */
export function linkDaLinha(estado: string): RotuloDeLink {
  return (ROTULO_DO_LINK as Record<string, RotuloDeLink | undefined>)[estado] ?? LINK_DESCONHECIDO;
}

/**
 * QUAL É A AÇÃO DO BOTÃO QUE ALTERNA, e por que ela não existe em todo estado.
 *
 * A RÉGUA É A DO CONTRATO: o botão só faz sentido em link que NÃO está `REVOGADO` nem `VENCIDO`,
 * e `SUSPENSO` é do sistema e passa sozinho. Sobram os dois estados que o time controla de fato:
 * só `VIVO` se bloqueia, e só `BLOQUEADO` se desbloqueia. Link `VENCIDO` ou `REVOGADO` já está
 * morto: bloquear o que não abre é teatro, e desbloquear devolveria a impressão de que o candidato
 * voltou a entrar quando ele não volta. `SUSPENSO` é do SISTEMA e passa sozinho (§A.6, escalada por
 * tentativa errada), então também não tem botão: o caminho de quem quer fechar de vez é bloquear
 * depois que a suspensão cair, ou emitir link novo, que mata o anterior.
 */
export type AcaoDeLink = "bloquear" | "desbloquear" | null;

export function acaoDoLink(estado: EstadoLinkPainel | string): AcaoDeLink {
  if (estado === "VIVO") return "bloquear";
  if (estado === "BLOQUEADO") return "desbloquear";
  return null;
}

/** Por que o botão está apagado, dito em voz alta em vez de sumir sem explicação (§A.11). */
export function motivoSemAcaoDeLink(estado: EstadoLinkPainel | string): string {
  if (estado === "SUSPENSO")
    return "O bloqueio temporário é automático e passa sozinho. Gere um link novo para trocar o acesso.";
  if (estado === "VENCIDO") return "O link venceu. Gere um link novo para o candidato voltar.";
  if (estado === "REVOGADO")
    return "O link foi revogado por uma emissão nova. Gere um link novo para o candidato voltar.";
  return "Nenhum link vivo para bloquear. Gere um link primeiro.";
}

// ── A situação da linha ─────────────────────────────────────────────────────────────────────────

/**
 * NÃO HAVIA NADA A ENVIAR, e este caso precisa de nome próprio.
 *
 * Existe par (cliente, cargo) sem NENHUM documento obrigatório na régua. Sem esta distinção, "zero
 * pendentes" fica verdadeiro por vacuidade: a linha diria "Concluiu" e pintaria a barra cheia para
 * um candidato que não enviou absolutamente nada. ENTREGOU TUDO e NÃO HAVIA O QUE ENTREGAR são
 * estados diferentes, e é a régua vazia que os confunde.
 */
export function semRegua(l: LinhaDoPainelPortal): boolean {
  return l.obrigatorios === 0;
}

/** Todo obrigatório aceito. Régua vazia NÃO é coleta completa: ver `semRegua`. */
export function coletaCompleta(l: LinhaDoPainelPortal): boolean {
  return l.obrigatorios > 0 && l.aceitos >= l.obrigatorios;
}

/**
 * CONCLUIU, com a MESMA régua do contador `concluiram`: acessou E não tem obrigatório pendente. Só
 * "zero pendentes" marcaria como concluída a coleta que o consultor resolveu pela Esteira sem o
 * candidato nunca ter entrado, e aí a linha contradiria o card logo acima dela.
 */
export function concluiu(l: LinhaDoPainelPortal): boolean {
  return l.ultimoAcessoEm !== null && coletaCompleta(l);
}

export interface SituacaoDaLinha {
  label: string;
  tone: TomDoLink;
  icone: "check" | "alert" | "clock" | "arr" | "doc";
}

/** A situação, derivada só do que o contrato manda. O ícone acompanha o estado real (§A.12). */
export function situacaoDaLinha(l: LinhaDoPainelPortal): SituacaoDaLinha {
  // Régua vazia vem PRIMEIRO: nenhum dos outros rótulos é verdadeiro para quem não tinha o que
  // enviar, e o mais perigoso deles ("Concluiu") era justamente o que aparecia.
  if (semRegua(l)) return { label: "Sem Régua", tone: "nt", icone: "doc" };
  if (concluiu(l)) return { label: "Concluiu", tone: "ok", icone: "check" };
  if (l.noTime) return { label: "Intervenção Humana", tone: "wn", icone: "alert" };
  if (!l.ultimoAcessoEm) return { label: "Não Acessou", tone: "nt", icone: "clock" };
  return { label: "Em Andamento", tone: "in", icone: "arr" };
}

/** Rank da situação para a ordenação por clique: a fila de trabalho primeiro. */
export function rankSituacao(l: LinhaDoPainelPortal): number {
  if (semRegua(l)) return 4; // não há trabalho a cobrar aqui: vai para o fim da fila
  if (l.noTime && !concluiu(l)) return 0;
  if (concluiu(l)) return 3;
  if (!l.ultimoAcessoEm) return 2;
  return 1;
}

/** A frase do `title` do cilindro de progresso. Escrita aqui porque é vocabulário desta tela. */
export function tituloDoProgresso(l: LinhaDoPainelPortal): string {
  if (semRegua(l))
    return "A régua deste cliente e cargo não exige nenhum documento obrigatório, não há o que cobrar.";
  const pct = Math.min(100, Math.round((l.aceitos / l.obrigatorios) * 100));
  return coletaCompleta(l)
    ? `Todos os ${l.obrigatorios} documentos obrigatórios foram aceitos.`
    : `${l.aceitos} de ${l.obrigatorios} documentos obrigatórios aceitos, ${pct}% da régua. Ainda há documento pendente.`;
}

// ── Os cards do funil ───────────────────────────────────────────────────────────────────────────

/**
 * Os cards são FILTRO, em toggle e mutuamente exclusivos (§A.12), no mesmo padrão do Gerenciador.
 * "Encaminhados" é o conjunto inteiro, então clicar nele limpa a seleção em vez de criar um recorte
 * que já é a tabela toda.
 */
export type CardId =
  | "encaminhados"
  | "acessaram"
  | "naoAcessaram"
  | "concluiram"
  | "intervencaoHumana";

/**
 * O recorte em vigor, e ele é O DO CONTRATO (`RecorteDoPainelPortal`), não uma cópia local.
 *
 * `""` = sem recorte. O alias sobrevive só para não espalhar a troca de nome pela tela inteira.
 */
export type Recorte = RecorteDoPainelPortal;

/**
 * ┌─ O `noRecorte` FOI APAGADO, e não é limpeza: ele MENTIA de duas formas ─────────────────────┐
 * │ Ele filtrava NO CLIENTE, sobre o que já estava carregado, e isso errava duas vezes:         │
 * │                                                                                              │
 * │ 1. DISCORDAVA DA ABA. Os contadores contam o universo inteiro (as duas abas), a tabela é     │
 * │    cortada pela ABA no servidor, e o card recortava o que a aba já tinha cortado. Medido na  │
 * │    homologação em 21/09: o card dizia "Acessaram 2" e clicar nele ZERAVA a tabela, porque os │
 * │    dois que acessaram já tinham concluído e estavam na OUTRA aba.                            │
 * │ 2. MENTIRIA EM SILÊNCIO acima de 100 encaminhados. O teto da página é `POR_PAGINA`, então o  │
 * │    recorte passaria a valer só sobre a primeira página, sem nada na tela dizendo isso, que é │
 * │    exatamente o "filtro que a tela oferece e a consulta ignora" da §A.28.                    │
 * │                                                                                              │
 * │ Agora o recorte é PARÂMETRO DA CONSULTA (`queryDoPainel`), o total e a paginação passam a    │
 * │ refleti-lo, e QUANDO ELE EXISTE A ABA NÃO VIAJA (ver a nota lá embaixo). Nenhuma função de   │
 * │ recorte volta a este arquivo: uma segunda régua aqui recriaria a divergência de cima.        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ── A origem do envio ───────────────────────────────────────────────────────────────────────────

/**
 * O RÓTULO DA ORIGEM, em Title Case (§A.24). O dado é o do backend; o texto é escolha desta tela.
 *
 * `ENTREGA_A_MAO` tem nome próprio e NÃO é "Manual" de propósito (ver a nota do contrato): manual
 * é o RH ENVIANDO por e-mail pelo Gerenciador, e entrega à mão é o link copiado para o consultor
 * passar por fora, sem o sistema entregar nada.
 *
 * A OPÇÃO DO FILTRO PARA "SEM ORIGEM" DIZ A MESMA COISA QUE A CÉLULA, "Não Informado", e não um
 * segundo vocabulário ("Sem Origem"): quem vê a célula escrita de um jeito procura o filtro com
 * aquela palavra, e duas palavras para o mesmo estado é o começo de uma pergunta de suporte.
 */
export const ROTULO_DA_ORIGEM: Record<string, string> = {
  AUTOMATICO: "Automático",
  MANUAL: "Manual",
  ENTREGA_A_MAO: "Entrega À Mão",
  [SEM_ORIGEM_DE_ENVIO]: "Não Informado",
};

/**
 * A célula da coluna. Link emitido antes desta frente não tem origem, e isso NÃO é defeito: ele diz
 * "não informado" (§A.11), nunca traço. Código fora do catálogo aparece cru em vez de sumir.
 */
export function rotuloDaOrigem(o: string | null | undefined): string {
  if (!o) return "não informado";
  return ROTULO_DA_ORIGEM[o] ?? o;
}

// ── A consulta ──────────────────────────────────────────────────────────────────────────────────

/**
 * A QUERY DA LISTA, montada num lugar só.
 *
 * Os nomes dos parâmetros são os MESMOS campos de `FiltrosDoPainelPortal`, que é o contrato desta
 * rodada; os de lista viajam separados por vírgula, que é o formato que o `parseMulti` do backend
 * já lê em todas as telas multi-select do sistema (§A.28).
 *
 * FILTRO VAZIO NÃO VIAJA: parâmetro presente e vazio é o começo de um `IN ()` que não casa com
 * nada, e o sintoma seria a tela vazia sem ninguém entender por quê.
 */
export function queryDoPainel(f: FiltrosDoPainelPortal): string {
  const q = new URLSearchParams();
  const lista = (chave: string, v?: string[]) => {
    const limpos = (v ?? []).map((s) => s.trim()).filter(Boolean);
    if (limpos.length) q.set(chave, limpos.join(","));
  };
  const texto = (chave: string, v?: string) => {
    const limpo = (v ?? "").trim();
    if (limpo) q.set(chave, limpo);
  };

  /**
   * O RECORTE MANDA, E QUANDO ELE EXISTE A ABA NÃO VIAJA.
   *
   * O card conta o universo inteiro, as duas abas somadas, então mandar os dois juntos devolveria
   * a interseção: era exatamente isso que ZERAVA a tabela (o card "Acessaram" cruzado com a aba
   * "Em Andamento"). A escolha é feita AQUI, num lugar só, e não no backend "que ignora a aba":
   * parâmetro que viaja para ser ignorado é a próxima divergência esperando acontecer.
   */
  if (f.recorte) q.set("recorte", f.recorte);
  else if (f.aba) q.set("aba", f.aba);
  texto("nome", f.nome);
  lista("clientes", f.clientes);
  lista("cargos", f.cargos);
  lista("documentos", f.documentos);
  lista("situacoes", f.situacoes);
  lista("estadosLink", f.estadosLink);
  lista("origens", f.origens);
  texto("ultimoAcessoDe", f.ultimoAcessoDe);
  texto("ultimoAcessoAte", f.ultimoAcessoAte);
  texto("dataAdmissaoDe", f.dataAdmissaoDe);
  texto("dataAdmissaoAte", f.dataAdmissaoAte);
  if (f.pagina) q.set("pagina", String(f.pagina));
  if (f.tamanho) q.set("tamanho", String(f.tamanho));
  return q.toString();
}

/**
 * QUANTOS FILTROS ESTÃO ATIVOS, para o badge do `FiltroTrigger`.
 *
 * A ABA NÃO CONTA: ela não é filtro, é onde a pessoa está. Contá-la deixaria o badge aceso o tempo
 * todo e o "Limpar filtros" pareceria quebrado. O RECORTE DO CARD TAMBÉM NÃO CONTA, pelo mesmo
 * motivo somado a um segundo: ele já tem indicação própria na tela (o card aceso e a frase ao lado
 * dele), e some com um clique no mesmo card, não no "Limpar filtros". Cada intervalo de data conta UMA vez, mesmo com as
 * duas pontas preenchidas: é um filtro só na cabeça de quem usa.
 */
export function contarFiltros(f: FiltrosDoPainelPortal): number {
  let n = 0;
  if ((f.nome ?? "").trim()) n += 1;
  for (const l of [f.clientes, f.cargos, f.documentos, f.situacoes, f.estadosLink, f.origens]) {
    if (l && l.length) n += 1;
  }
  if (f.ultimoAcessoDe || f.ultimoAcessoAte) n += 1;
  if (f.dataAdmissaoDe || f.dataAdmissaoAte) n += 1;
  return n;
}

// ── Datas ───────────────────────────────────────────────────────────────────────────────────────

/** Data e hora em pt-BR. Sem valor, devolve o marcador da §A.11 (nunca o glifo). */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * DATA DE ADMISSÃO, que é DIA e não instante.
 *
 * Ela chega como `aaaa-mm-dd` e é formatada NA MÃO, sem passar por `new Date`: `new Date("2026-09-20")`
 * é meia-noite em UTC, e no fuso de São Paulo isso vira o DIA ANTERIOR na tela. Admissão que
 * aparece um dia antes da real é erro de operação, não de estilo.
 *
 * `null` NÃO é erro: admissão de banco não tem data, e a célula diz "não informado" (§A.11).
 */
export function formatarDataAdmissao(iso: string | null | undefined): string {
  if (!iso) return "não informado";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "não informado";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ── As abas ─────────────────────────────────────────────────────────────────────────────────────

/**
 * AS DUAS ABAS, com o rótulo em Title Case (§A.24). A frente de trabalho é a padrão: quem terminou
 * a entrega sai da fila e só volta quando alguém procura.
 */
export const ABAS: {
  id: AbaDoPainelPortal;
  label: string;
  icone: "arr" | "check";
  vazio: string;
}[] = [
  {
    id: "EM_ANDAMENTO",
    label: "Em Andamento",
    icone: "arr",
    vazio: "Nenhum candidato em andamento. Quem terminou a entrega está na aba Concluído.",
  },
  {
    id: "CONCLUIDO",
    label: "Concluído",
    icone: "check",
    vazio: "Ninguém concluiu a entrega ainda.",
  },
];

// ── O modal do olho: a ficha enxuta da linha ────────────────────────────────────────────────────

/**
 * A FICHA DE LEITURA DO CANDIDATO, e ela é montada AQUI, fora da tela, por razão de SEGURANÇA e
 * não de arrumação.
 *
 * ┌─ ESTA FUNÇÃO É A LISTA FECHADA DO QUE O MODAL PODE MOSTRAR (§A.6) ──────────────────────────┐
 * │ O painel foi desenhado desde o primeiro dia para NÃO projetar CPF, e um modal de detalhe é   │
 * │ o lugar clássico onde o dado pessoal volta "porque é detalhe". NUNCA CPF, NUNCA e-mail em    │
 * │ claro, NUNCA telefone, NUNCA a URL do link (que é credencial de acesso aos documentos).      │
 * │                                                                                               │
 * │ A ficha lê SÓ a linha que a tabela já tem em mãos: ela não recebe token, não faz chamada e   │
 * │ não tem como buscar campo em outro endpoint, então acrescentar um dado novo aqui exige       │
 * │ acrescentá-lo antes ao contrato da LISTA, que é auditado. O teste desta função varre o       │
 * │ resultado inteiro atrás de arroba, de dígito de CPF e de `http`.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ENXUTO É O REQUISITO: nove campos, uma coluna de rótulo e uma de valor, nada de aba, nada de
 * histórico e nenhuma ação dentro dele. O nome do candidato NÃO entra na lista porque ele é o
 * título do modal.
 */
export interface CampoDoDetalhe {
  rotulo: string;
  valor: string;
  /** Presente quando o valor é uma ETIQUETA de estado, e a tela o desenha como `Pill` (§A.24). */
  tom?: TomDoLink;
}

export function camposDoDetalhe(l: LinhaDoPainelPortal): CampoDoDetalhe[] {
  const sit = situacaoDaLinha(l);
  const link = linkDaLinha(l.estadoLink);
  return [
    { rotulo: "Cliente", valor: l.cliente || "não informado" },
    { rotulo: "Cargo", valor: l.cargo || "não informado" },
    { rotulo: "Data De Admissão", valor: formatarDataAdmissao(l.dataAdmissao) },
    { rotulo: "Situação", valor: sit.label, tom: sit.tone },
    { rotulo: "Documento Atual", valor: l.documentoAtual || "não informado" },
    // "Nada a enviar" e "0 de 0 aceitos" são coisas diferentes, e a distinção é a mesma da coluna
    // Progresso: régua vazia não é entrega completa.
    {
      rotulo: "Progresso Da Régua",
      valor: semRegua(l) ? "nada a enviar" : `${l.aceitos} de ${l.obrigatorios} aceitos`,
    },
    // Vazio aqui NÃO é defeito: quem tem régua completa e nunca acessou teve os documentos
    // entregues pelo consultor via Esteira, e o carimbo é do PORTAL.
    { rotulo: "Último Acesso", valor: formatarDataHora(l.ultimoAcessoEm) },
    { rotulo: "Estado Do Link", valor: link.label, tom: link.tone },
    { rotulo: "Origem Do Envio", valor: rotuloDaOrigem(l.origemEnvio) },
  ];
}
