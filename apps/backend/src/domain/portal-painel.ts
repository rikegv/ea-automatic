/**
 * O GERENCIADOR DO PORTAL, A PARTE QUE NÃO TOCA O BANCO.
 *
 * Aqui moram as três decisões que a tela do RH depende e que precisam ser provadas sem subir
 * Postgres: o ESTADO DO LINK, a CONTA dos cinco contadores e o TETO da paginação. O serviço faz
 * SQL; este arquivo faz régua.
 *
 * ┌─ §A.6: O QUE ESTE MÓDULO NÃO CONHECE, E A AUSÊNCIA É O DESENHO ─────────────────────────────┐
 * │ Não existe aqui IP (em claro ou hasheado), `ua_hash`, geografia, CONTAGEM DE TENTATIVAS DE   │
 * │ IDENTIFICAÇÃO FALHA nem listagem de evento. Tudo isso é a SALA DE SEGURANÇA, que é de Master │
 * │ e Super Admin por decisão do diretor. A contagem de falha em especial é o ORÁCULO que o      │
 * │ catálogo de log fechou ao forçar `NAO_CASOU` em toda identificação recusada: devolvê-la numa │
 * │ tela operacional reabriria, por outra porta, o que custou um veto para fechar.               │
 * │                                                                                              │
 * │ Do bloqueio progressivo sai APENAS o estado binário `SUSPENSO`, sem o número de tentativas e │
 * │ SEM A DATA DE FIM: "está suspenso" é o que o consultor precisa para agir, "acaba às 14h32" é │
 * │ o que diz a quem insiste quando voltar a tentar.                                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

import { estadoDaLinha } from "./portal-identidade";

// ══ O ESTADO DO LINK ═════════════════════════════════════════════════════════════════════════

/**
 * Os quatro estados que a coluna "link" mostra.
 *
 * `estadoDaLinha` (o domínio que as QUATRO portas do candidato já consultam) COLAPSA suspenso
 * dentro de expirado, e isso é correto lá: para o candidato os dois são a mesma frase, e é assim
 * que se evita dar a ele um oráculo sobre o próprio bloqueio. Para o CONSULTOR eles são ações
 * diferentes (vencido se resolve reemitindo, suspenso passa sozinho), então o painel separa os
 * dois. A régua do "vivo" continua sendo a do domínio, e não uma quinta cópia: aqui só se
 * DESEMPACOTA o motivo.
 */
export type EstadoLinkPainel = "VIVO" | "VENCIDO" | "REVOGADO" | "SUSPENSO" | "BLOQUEADO";

export interface LinhaDeLinkDoPainel {
  expiraEm?: Date | null;
  revogadoEm?: Date | null;
  suspensoAte?: Date | null;
  bloqueadoEm?: Date | null;
}

/**
 * A PRECEDÊNCIA É REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO > VIVO, e ela responde "o que o consultor faz
 * agora": link revogado não volta (emite outro), suspenso passa sozinho (espere), vencido se
 * resolve reemitindo. Um link pode estar nos três ao mesmo tempo, e mostrar o mais fraco deles
 * mandaria o consultor reemitir um link que ele mesmo matou.
 *
 * SEM LINHA NÃO HÁ ESTADO: quem chama só pergunta por admissão que TEM link, e a ausência aqui é
 * tratada como revogado pelo próprio domínio (linha que sumiu é link que morreu).
 */
export function estadoDoLinkNoPainel(
  linha: LinhaDeLinkDoPainel | undefined | null,
  agoraMs: number,
): EstadoLinkPainel {
  const estado = estadoDaLinha(linha, agoraMs);
  if (estado.revogado || !estado.existe) return "REVOGADO";
  // BLOQUEADO VEM ANTES DE SUSPENSO, e a ordem responde de novo "o que se faz agora": o bloqueio é
  // decisão de alguém e se desfaz por botão; a suspensão é do sistema e passa sozinha. Mostrar
  // "suspenso" para um link que o time bloqueou mandaria o consultor ESPERAR por algo que só acaba
  // quando ele mesmo clicar.
  if (estado.bloqueado) return "BLOQUEADO";
  if (linha?.suspensoAte != null && linha.suspensoAte.getTime() > agoraMs) return "SUSPENSO";
  if (estado.expirado) return "VENCIDO";
  return "VIVO";
}

// ══ OS CINCO CONTADORES ══════════════════════════════════════════════════════════════════════

/**
 * O que se sabe de UMA admissão encaminhada. Tudo já é resultado de consulta; nada aqui recalcula
 * régua (`ReguaCompletudeService` é a fonte única dos obrigatórios, §A.19).
 */
export interface FatoDaAdmissaoNoPainel {
  /**
   * `primeiro_acesso_em` preenchido em ALGUM link da admissão, e a palavra "algum" é o ponto:
   * emitir um link novo revoga o anterior e nasce sem carimbo, então olhar só o link vigente
   * apagaria o acesso de quem já tinha entrado pelo link antigo.
   */
  acessou: boolean;
  /**
   * QUANTOS OBRIGATÓRIOS A RÉGUA DO PAR (cliente + cargo) COBRA. Zero significa RÉGUA VAZIA, que
   * NÃO é o mesmo que coleta completa, e é por isso que este campo existe separado do de baixo.
   */
  obrigatorios: number;
  /** Obrigatórios da régua ainda não ENTREGUE. Vem do lote de `ReguaCompletudeService`. */
  obrigatoriosPendentes: number;
  /**
   * Quantos obrigatórios JÁ foram entregues, quando o chamador sabe. Opcional porque o contador
   * viveu sem ele até aqui; presente, é ele que decide a conclusão, e é o que faz a SOBRE-ENTREGA
   * (entregou mais do que a régua pede) contar como régua cumprida, no mesmo critério da tela.
   */
  aceitos?: number;
  /** Pendência em `portal_pendencias_no_time` que caiu e ainda NÃO foi reaberta. */
  noTime: boolean;
}

export interface ContadoresDoPainel {
  encaminhados: number;
  acessaram: number;
  naoAcessaram: number;
  concluiram: number;
  intervencaoHumana: number;
}

/**
 * OS CINCO NÚMEROS, e o único que tem história é o de CONCLUÍRAM.
 *
 * ┌─ CONCLUIR É "ACESSOU **E** ZERO OBRIGATÓRIO PENDENTE", NUNCA SÓ O SEGUNDO ──────────────────┐
 * │ "Zero obrigatório pendente" sozinho fecha IGUAL quando o consultor subiu tudo pela Esteira e │
 * │ o candidato nunca abriu o link: o painel exibiria conclusão de COLETA que não houve, e o     │
 * │ painel inteiro existe para medir a coleta. Acesso sem documento também não é conclusão, por  │
 * │ isso a conjunção.                                                                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ RÉGUA VAZIA NÃO CONCLUI NADA (achado M1 da auditoria de código) ───────────────────────────┐
 * │ `obrigatoriosPendentesCountMap` pré-semeia ZERO para todo id consultado e só incrementa      │
 * │ sobre o `innerJoin` com `regua_documental`. Logo, um par (cliente + cargo) SEM NENHUMA linha │
 * │ `OBRIGATORIO` devolve "zero pendentes", que não é "coleta completa": é "ninguém disse o que  │
 * │ cobrar". MEDIDO CONTRA A PRODUÇÃO: 1.963 admissões vivas, 6 delas sem régua obrigatória,     │
 * │ todas EM_ADMISSAO, ou seja, DENTRO do recorte deste painel. E `emitirLink` não checa farol,  │
 * │ nem cargo, nem régua: emitido o link para uma das 6 e aberto pelo candidato, o painel diria  │
 * │ "concluiu, 0 de 0" para quem não enviou UM documento.                                        │
 * │                                                                                              │
 * │ ESCOLHA: a admissão sem régua fica FORA de CONCLUÍRAM, e não ganha contador próprio. O       │
 * │ motivo de não inventar um sexto número é que ele não descreveria o candidato, e sim um       │
 * │ CADASTRO INCOMPLETO do par cliente+cargo, que é trabalho de outra tela (a Régua documental) e │
 * │ contador novo não pedido é escopo que o diretor não aprovou (§A.31). Ficando fora, ela       │
 * │ aparece exatamente como o que é: encaminhada, acessada e NÃO concluída, visível na lista com │
 * │ "0 de 0" e sem próximo documento, que é o retrato honesto de uma coleta que não pode fechar. │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO ACESSARAM É DERIVADO (encaminhados menos acessaram), e não uma sexta consulta: derivado, os
 * dois números não têm como divergir; consultado em separado, eles divergem no primeiro ajuste e a
 * soma deixa de fechar na tela.
 *
 * INTERVENÇÃO HUMANA É ORTOGONAL aos outros quatro, de propósito: uma admissão pode ter caído para
 * o time E ter concluído depois (o time resolveu e o documento entrou). Os cinco não somam
 * `encaminhados`, e apresentá-los como fatias de uma pizza seria a leitura errada.
 */
export function contarPainel(fatos: readonly FatoDaAdmissaoNoPainel[]): ContadoresDoPainel {
  let acessaram = 0;
  let concluiram = 0;
  let intervencaoHumana = 0;
  for (const fato of fatos) {
    // CADA NÚMERO SAI DE `noCard`, que é A MESMA função que recorta a tabela quando o card é
    // clicado. Não existe aqui nenhuma condição escrita à mão: era essa segunda escrita que
    // deixava o card e o contador livres para discordarem no primeiro ajuste.
    if (noCard("acessaram", fato)) acessaram += 1;
    if (noCard("concluiram", fato)) concluiram += 1;
    if (noCard("intervencaoHumana", fato)) intervencaoHumana += 1;
  }
  return {
    encaminhados: fatos.length,
    acessaram,
    naoAcessaram: fatos.length - acessaram,
    concluiram,
    intervencaoHumana,
  };
}

// ══ O RECORTE DO CARD ═══════════════════════════════════════════════════════════════════════

/**
 * OS QUATRO CARDS QUE RECORTAM A TABELA, e o quinto que não recorta.
 *
 * "Encaminhados" é o universo inteiro, então ele NÃO entra nesta lista: clicar nele é LIMPAR o
 * recorte, e um valor próprio para "todos" seria um recorte que não recorta, com uma segunda
 * maneira de dizer a mesma coisa que a ausência do parâmetro já diz.
 *
 * Os nomes são os do contrato da tela (`CardId`), e não uma tradução: o dia em que o servidor
 * batizar `acessaram` de `ACESSOU`, a tela passa a mandar um valor que o servidor recusa, e o
 * sintoma é a tabela vazia sem ninguém entender por quê.
 */
export const CARDS_DO_PAINEL = [
  "acessaram",
  "naoAcessaram",
  "concluiram",
  "intervencaoHumana",
] as const;

export type CardDoPainel = (typeof CARDS_DO_PAINEL)[number];

/**
 * O recorte pedido, normalizado. Vazio e ausente são "todos" (nenhum recorte).
 *
 * VALOR DESCONHECIDO NÃO VIRA "TODOS": ele é RECUSADO por quem chama, no mesmo molde do intervalo
 * de datas (`dataIsoDoFiltro` + `pontaPedida`). Cair em "todos" devolveria MAIS linhas do que o
 * pedido, com a tela apresentando o resultado como se o recorte tivesse sido aplicado, que é
 * exatamente a mentira que a §A.28 nomeia. Devolve `null` para "sem recorte" e `undefined` para
 * "pediram algo que não existe", que são coisas diferentes e precisavam de respostas diferentes.
 */
export function recorteDoCard(valor: string | null | undefined): CardDoPainel | null | undefined {
  const cru = (valor ?? "").trim();
  if (!cru) return null;
  return (CARDS_DO_PAINEL as readonly string[]).includes(cru) ? (cru as CardDoPainel) : undefined;
}

/**
 * ESTA FUNÇÃO É O CARD E É O CONTADOR, e ela existe por causa de um defeito medido.
 *
 * ┌─ O QUE ESTAVA ERRADO, medido na homologação em 21/09 ───────────────────────────────────────┐
 * │ Os cinco contadores estavam CERTOS, e ainda assim clicar em "Acessaram" ZERAVA a tabela. A   │
 * │ causa não era conta errada, era DISCORDÂNCIA DE RECORTE: o contador contava as duas abas, a  │
 * │ tabela vinha recortada pela aba (padrão `EM_ANDAMENTO`) e o card filtrava NO CLIENTE o que a │
 * │ aba já tinha cortado. Os dois que tinham acessado estavam na aba CONCLUÍDO, então o card     │
 * │ dizia 2 e a tabela mostrava 0.                                                               │
 * │                                                                                              │
 * │ E HAVIA UM SEGUNDO DEFEITO no mesmo lugar, que ninguém tinha reportado porque a base é       │
 * │ pequena: o recorte do cliente rodava sobre a PÁGINA (no máximo 100 linhas). Passados 100     │
 * │ encaminhados, o card passaria a filtrar só a primeira página e a mentir em silêncio (§A.28). │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A DECISÃO DO DIRETOR É QUE O CARD FILTRA, INCLUSIVE OS FINALIZADOS, e o recorte passou para o
 * servidor. Daí esta função: card e contador saem da MESMA expressão, então não têm como
 * divergir. Duas expressões para a mesma pergunta é o defeito que esta rodada existe para matar.
 *
 * `naoAcessaram` é a negação de `acessaram` AQUI DENTRO, e continua sendo derivado no contador
 * (`encaminhados - acessaram`): as duas formas dão o mesmo número por construção, e é isso que
 * faz a soma fechar na tela.
 */
export function noCard(card: CardDoPainel, fato: FatoDaAdmissaoNoPainel): boolean {
  switch (card) {
    case "acessaram":
      return fato.acessou;
    case "naoAcessaram":
      return !fato.acessou;
    case "concluiram":
      return concluiuAColeta(fato);
    case "intervencaoHumana":
      return fato.noTime;
  }
}

// ══ O TETO DA PÁGINA ═════════════════════════════════════════════════════════════════════════

/** Página cheia por padrão, sem o cliente pedir. */
export const PAGINA_PADRAO_PAINEL = 25;
/**
 * O TETO, E ELE É DO SERVIDOR. A base tem 2.156 admissões: `?tamanho=100000` de uma tela ou de um
 * `curl` autenticado traria a lista nominal inteira de candidato, cargo e cliente numa resposta só,
 * que é o extrato que a §A.6 manda não produzir. Teto na tela é sugestão; teto aqui é regra.
 */
export const PAGINA_MAXIMA_PAINEL = 100;
/**
 * O TETO DO ÍNDICE DA PÁGINA (achado L1 da auditoria de código), e ele fechou uma afirmação falsa.
 *
 * O teto acima corta o TAMANHO; a PÁGINA não tinha nenhum, e o comentário desta função dizia que
 * "o número gigante cai na direção segura". Não caía: `?pagina=1e19` virava um `OFFSET` fora de
 * faixa, e a auditoria REPRODUZIU o `bigint out of range` no banco. É 500 em rota autenticada, sem
 * vazamento, mas é erro de servidor causado por entrada do cliente, e documentação que mente sobre
 * uma proteção é pior do que a proteção ausente.
 *
 * 10.000 páginas vezes 100 por página são 1.000.000 de linhas, muito além das 2.156 admissões da
 * base inteira: nenhum uso legítimo chega perto, e o limite continua bem dentro do inteiro que o
 * Postgres aceita em `OFFSET`.
 */
export const PAGINA_MAXIMA_INDICE_PAINEL = 10_000;

export interface RecorteDaPagina {
  limite: number;
  deslocamento: number;
}

/**
 * Normaliza página e tamanho. TUDO que chega de fora é suspeito: texto, negativo, fracionário e
 * `NaN` caem na direção segura (página cheia padrão, começo da lista), e o número gigante é
 * CORTADO nos dois eixos, o do tamanho e o do índice. Nada aqui lança: paginação inválida não é
 * erro do usuário, é entrada a normalizar.
 *
 * OS DOIS TETOS SÃO NECESSÁRIOS, e essa era a lacuna do L1: cortar só o tamanho protege o volume
 * da resposta e deixa o `OFFSET` livre para estourar a faixa do inteiro no banco.
 */
export function recorteDaPagina(entrada: {
  pagina?: number | string | null;
  tamanho?: number | string | null;
}): RecorteDaPagina {
  const tamanho = inteiroPositivo(entrada.tamanho) ?? PAGINA_PADRAO_PAINEL;
  const pagina = inteiroPositivo(entrada.pagina) ?? 1;
  const limite = Math.min(tamanho, PAGINA_MAXIMA_PAINEL);
  const indice = Math.min(pagina, PAGINA_MAXIMA_INDICE_PAINEL);
  return { limite, deslocamento: (indice - 1) * limite };
}

function inteiroPositivo(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return null;
  const inteiro = Math.floor(numero);
  return inteiro >= 1 ? inteiro : null;
}

// ══ A RÉGUA DE "CONCLUIU", UMA SÓ ════════════════════════════════════════════════════════════

/**
 * O QUE BASTA SABER PARA DIZER SE A COLETA FECHOU. Subconjunto de `FatoDaAdmissaoNoPainel` de
 * propósito: a aba não precisa saber de `noTime` para recortar, e pedir o fato inteiro obrigaria
 * quem chama a inventar um campo que não usa.
 */
export interface FatoDaConclusao {
  /**
   * OS DOIS VOCABULÁRIOS DA MESMA PERGUNTA, e é isso que permite UMA função servir aos dois lados.
   *
   * O CONTADOR fala em `acessou` e `obrigatoriosPendentes` (é o que a consulta devolve); a LINHA
   * da tela fala em `ultimoAcessoEm` e `aceitos` (é o que o contrato publica). Obrigar um dos dois
   * a traduzir para o vocabulário do outro seria reintroduzir, na tradução, a régua que esta
   * função existe para unificar.
   */
  acessou?: boolean;
  ultimoAcessoEm?: string | null;
  obrigatorios: number;
  obrigatoriosPendentes?: number;
  aceitos?: number;
}

/**
 * CONCLUIU A COLETA: acessou **E** a régua existe **E** não sobrou obrigatório pendente.
 *
 * ┌─ POR QUE ISTO VIROU FUNÇÃO, E A AUDITORIA JÁ TINHA APONTADO ────────────────────────────────┐
 * │ A mesma régua estava escrita DUAS vezes: aqui, dentro de `contarPainel` (que decide o card   │
 * │ CONCLUÍRAM), e na tela, em `concluiu()`. Duas cópias divergem no primeiro ajuste, e a         │
 * │ divergência desta em especial é a pior possível: o card diria um número e a linha logo abaixo │
 * │ dele diria outra coisa sobre a MESMA pessoa. Agora a ABA (recorte do servidor) e o CARD saem  │
 * │ da mesma função, e a tela passa a consumir o recorte em vez de recalcular.                    │
 * │                                                                                               │
 * │ A conjunção continua com as TRÊS condições, pelos motivos já registrados acima: acesso sem    │
 * │ documento não é coleta, documento sem acesso é trabalho do consultor pela Esteira, e RÉGUA    │
 * │ VAZIA (achado M1) se disfarça de coleta completa em "zero pendentes".                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function concluiuAColeta(fato: FatoDaConclusao): boolean {
  const acessou = fato.acessou ?? fato.ultimoAcessoEm != null;
  /**
   * QUANDO SE SABE QUANTOS FORAM ACEITOS, A COMPARAÇÃO É `>=`, e a diferença tem nome:
   * SOBRE-ENTREGA. Ela chega como pendente NEGATIVO (`total - entregues`), e com a comparação
   * estrita a pessoa que entregou A MAIS ficaria eternamente "em andamento", presa na fila de
   * trabalho de um time que não tem o que cobrar dela.
   */
  if (typeof fato.aceitos === "number") {
    return acessou && fato.obrigatorios > 0 && fato.aceitos >= fato.obrigatorios;
  }
  /**
   * SEM `aceitos`, sobra o contador de pendentes, e aí a comparação é ESTRITA de propósito:
   * número negativo, aqui, não é sobre-entrega conhecida, é DADO QUEBRADO chegando de um chamador
   * que não disse quantos aceitou. Dado quebrado não conclui nada, que é a direção segura.
   */
  return Boolean(fato.acessou && fato.obrigatorios > 0 && fato.obrigatoriosPendentes === 0);
}

// ══ A SITUAÇÃO DA LINHA ══════════════════════════════════════════════════════════════════════

/**
 * A SITUAÇÃO, que é a pergunta "onde ele está agora" e o filtro de mesmo nome.
 *
 * A ORDEM DA DECISÃO É A REGRA, e ela repete a que a tela já usa: RÉGUA VAZIA vem PRIMEIRO porque
 * nenhum dos outros rótulos é verdadeiro para quem não tinha o que enviar, e o mais perigoso deles
 * ("Concluiu") era justamente o que aparecia. Depois conclusão, depois queda para o time, depois a
 * ausência de acesso, e só no fim a coleta em curso.
 *
 * O RÓTULO MORA AQUI JUNTO com o código porque o catálogo do filtro (§A.37) é servido pelo
 * backend: rótulo escrito de novo na tela é a segunda cópia de sempre, e desta vez seria uma cópia
 * que o usuário lê. Title case (§A.24), sem travessão (§A.11).
 */
export const SITUACOES_DO_PAINEL = [
  { valor: "SEM_REGUA", rotulo: "Sem Régua" },
  { valor: "CONCLUIU", rotulo: "Concluiu" },
  { valor: "INTERVENCAO_HUMANA", rotulo: "Intervenção Humana" },
  { valor: "NAO_ACESSOU", rotulo: "Não Acessou" },
  { valor: "EM_ANDAMENTO", rotulo: "Em Andamento" },
] as const;

export type SituacaoDoPainel = (typeof SITUACOES_DO_PAINEL)[number]["valor"];

export function situacaoNoPainel(fato: FatoDaAdmissaoNoPainel): SituacaoDoPainel {
  if (fato.obrigatorios === 0) return "SEM_REGUA";
  if (concluiuAColeta(fato)) return "CONCLUIU";
  if (fato.noTime) return "INTERVENCAO_HUMANA";
  if (!fato.acessou) return "NAO_ACESSOU";
  return "EM_ANDAMENTO";
}

// ══ A ABA ════════════════════════════════════════════════════════════════════════════════════

/**
 * AS DUAS ABAS, recortadas NO SERVIDOR pela MESMA função que conta o card.
 *
 * O recorte é do servidor e não da tela porque filtro de tela sobre página paginada mente: ele
 * esconde DEPOIS de o servidor ter contado, então a segunda página traz gente que a aba deveria ter
 * excluído e o total nunca fecha. Os CONTADORES, por outro lado, continuam sendo do universo
 * inteiro (as duas abas somam o mesmo funil): card que muda quando se troca de aba deixa de ser o
 * funil da coleta e vira o tamanho da fila com outro nome.
 */
export type AbaDoPainel = "EM_ANDAMENTO" | "CONCLUIDO";

export function abaDoPainel(valor: string | null | undefined): AbaDoPainel {
  return valor === "CONCLUIDO" ? "CONCLUIDO" : "EM_ANDAMENTO";
}

export function naAba(aba: AbaDoPainel, fato: FatoDaConclusao): boolean {
  return concluiuAColeta(fato) === (aba === "CONCLUIDO");
}

// ══ AS DATAS DOS INTERVALOS ══════════════════════════════════════════════════════════════════

/** `aaaa-mm-dd`, e nada além disso. Texto livre em filtro de data vira erro de driver. */
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza a ponta de um intervalo de datas. Vazio é "sem ponta"; qualquer outra coisa é RECUSA
 * explícita (o serviço devolve 400), e não silêncio: filtro que a tela oferece e o servidor ignora
 * é pior que filtro nenhum, porque a lista responde como se o recorte tivesse sido aplicado.
 */
export function dataIsoDoFiltro(valor: string | null | undefined): string | null {
  const cru = (valor ?? "").trim();
  if (!cru) return null;
  if (!DATA_ISO.test(cru)) return null;
  const d = new Date(`${cru}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : cru;
}

/** A ponta foi PEDIDA (tem texto), independentemente de ser válida. */
export function pontaPedida(valor: string | null | undefined): boolean {
  return (valor ?? "").trim().length > 0;
}

/**
 * O DIA de um carimbo, no fuso do SERVIDOR, para comparar com a data que a pessoa digitou.
 *
 * Comparar o carimbo em UTC jogaria o acesso das 21h de um dia para o dia seguinte durante metade
 * do ano, e o filtro "último acesso hoje" perderia justamente quem entrou à noite, que é quando o
 * candidato mexe no celular.
 */
export function diaLocalDoCarimbo(data: Date): string {
  const ano = data.getFullYear();
  const mes = `${data.getMonth() + 1}`.padStart(2, "0");
  const dia = `${data.getDate()}`.padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Intervalo fechado nas duas pontas, com qualquer uma delas opcional. */
export function dentroDoIntervalo(dia: string, de: string | null, ate: string | null): boolean {
  if (de && dia < de) return false;
  if (ate && dia > ate) return false;
  return true;
}
