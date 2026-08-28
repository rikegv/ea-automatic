/**
 * CENTRAL DE CANDIDATOS (A&S, onda 1): o cliente HTTP da tela e as réguas que ela precisa.
 *
 * §A.6, E É A REGRA QUE MOLDA ESTE ARQUIVO INTEIRO. O CPF nunca entra numa URL, num `router.push`,
 * num `searchParams` nem num link. A busca é `POST /as/candidatos/buscar` com o número NO CORPO,
 * porque query string aparece em log de proxy, em histórico de navegador e no cabeçalho `Referer`.
 * Não existe (nem no backend, nem aqui) uma listagem GET deste módulo, justamente para não sobrar a
 * porta em que alguém acrescentaria `?cpf=` sem pensar.
 *
 * A SEGUNDA METADE DA MESMA REGRA: a LISTA devolve `temCpf`, um booleano, e nunca o número. Quem
 * mostra CPF é a FICHA, uma pessoa por vez e por clique deliberado. Por isso a tela NÃO hidrata a
 * lista com fichas: puxar a ficha de todo mundo para preencher colunas traria o CPF da base inteira
 * para o navegador e desfaria, em uma linha, a minimização que o backend construiu.
 *
 * DE ONDE VÊM AS COLUNAS DE FUNIL, ENTÃO: do PAINEL DA VAGA (`GET /as/candidatos/vaga/:id`), que
 * devolve as candidaturas com etapa e situação e NÃO devolve CPF nenhum. É a única fonte de funil
 * que respeita a minimização, e é a que a tela usa.
 */

import type { AsCandidaturaEtapaItem } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import {
  CANDIDATURA_ETAPAS,
  type AsCandidatoFicha,
  type AsCandidatoListItem,
  type AsCandidaturaItem,
  type AsContatoItem,
  type AsReentradaPrecisaCiencia,
  type CandidaturaEtapa,
  type CandidaturaSituacao,
} from "@ea/shared-types";

// ── O CLIENTE HTTP ──────────────────────────────────────────────────────────

export interface BuscaCandidatos {
  nome?: string;
  /** §A.6: viaja NO CORPO do POST. Nunca em URL, nunca em query string. */
  cpf?: string;
  origem?: string;
  vagaId?: string;
  /**
   * SÓ QUEM NÃO ESTÁ EM VAGA NENHUMA. É o filtro que abre a alocação SEM CPF: a lista devolve nome,
   * cidade/UF, origem e `temCpf`, e a alocação segue pelo `id`, que sempre foi a chave da tabela.
   * O CPF continua fora do caminho inteiro, inclusive da resposta.
   */
  semCandidatura?: boolean;
}

/**
 * A BUSCA. `POST` e não `GET`, e a diferença não é de estilo: é o que mantém o CPF fora da URL.
 * Campo vazio não é enviado, para o backend não receber filtro em branco e devolver lista vazia.
 */
export function buscarCandidatos(
  filtros: BuscaCandidatos,
  token: string | null,
): Promise<AsCandidatoListItem[]> {
  const body: Record<string, string | boolean> = {};
  if (filtros.nome?.trim()) body.nome = filtros.nome.trim();
  if (filtros.cpf?.trim()) body.cpf = filtros.cpf.trim();
  if (filtros.origem) body.origem = filtros.origem;
  if (filtros.vagaId) body.vagaId = filtros.vagaId;
  // Booleano só é enviado quando VERDADEIRO: `semCandidatura: false` no corpo diria ao backend algo
  // que ele não precisa ouvir, e a busca padrão é justamente "todo mundo".
  if (filtros.semCandidatura) body.semCandidatura = true;
  return apiFetch<AsCandidatoListItem[]>("/as/candidatos/buscar", {
    method: "POST",
    token,
    body,
  });
}

export function fichaCandidato(id: string, token: string | null): Promise<AsCandidatoFicha> {
  return apiFetch<AsCandidatoFicha>(`/as/candidatos/${id}`, { token });
}

export function painelDaVaga(
  vagaId: string,
  token: string | null,
): Promise<{ candidaturas: AsCandidaturaItem[] }> {
  return apiFetch<{ candidaturas: AsCandidaturaItem[] }>(`/as/candidatos/vaga/${vagaId}`, {
    token,
  });
}

export function criarCandidato(
  body: Record<string, unknown>,
  token: string | null,
): Promise<AsCandidatoFicha> {
  return apiFetch<AsCandidatoFicha>("/as/candidatos", { method: "POST", token, body });
}

/**
 * ALOCAR EM VAGA, com a CIÊNCIA DA REENTRADA como parâmetro nomeado do que ela é.
 *
 * `cienteReentrada` só entra no corpo quando é VERDADEIRO, e a razão é a mesma do `semCandidatura`
 * da busca: mandar `false` diria ao backend algo que ele não precisa ouvir, e um `false` explícito
 * no corpo tem cara de decisão tomada quando é só a ausência de decisão. A primeira tentativa vai
 * SEMPRE sem o campo, que é o que faz o aviso aparecer; a segunda leva o campo porque o consultor
 * clicou no ciente, e não porque a tela decidiu insistir.
 */
export function alocarEmVaga(
  candidatoId: string,
  vagaId: string,
  token: string | null,
  opts: { cienteReentrada?: boolean } = {},
): Promise<AsCandidaturaItem> {
  const body: Record<string, unknown> = { vagaId };
  if (opts.cienteReentrada) body.cienteReentrada = true;
  return apiFetch<AsCandidaturaItem>(`/as/candidatos/${candidatoId}/candidaturas`, {
    method: "POST",
    token,
    body,
  });
}

export function moverEtapa(
  candidaturaId: string,
  etapa: CandidaturaEtapa,
  token: string | null,
): Promise<AsCandidaturaItem> {
  return apiFetch<AsCandidaturaItem>(`/as/candidatos/candidaturas/${candidaturaId}/etapa`, {
    method: "PATCH",
    token,
    body: { etapa },
  });
}

export function aprovarCandidatura(
  candidaturaId: string,
  token: string | null,
): Promise<AsCandidaturaItem> {
  return apiFetch<AsCandidaturaItem>(`/as/candidatos/candidaturas/${candidaturaId}/aprovar`, {
    method: "POST",
    token,
  });
}

/**
 * REGISTRAR SAÍDA. `motivo` É OBRIGATÓRIO NOS TRÊS DESFECHOS desde o ajuste 7 do diretor, e o tipo
 * aqui passou de `string | undefined` para `string` justamente para o compilador cobrar isso de quem
 * chamar: a exigência mora no DTO do backend, e uma assinatura opcional na tela deixaria o erro
 * aparecer só como 400 em produção.
 */
export function registrarSaida(
  candidaturaId: string,
  situacao: "DESCARTADO" | "DESISTIU" | "CONTRATADO",
  motivo: string,
  token: string | null,
): Promise<AsCandidaturaItem> {
  return apiFetch<AsCandidaturaItem>(`/as/candidatos/candidaturas/${candidaturaId}/saida`, {
    method: "POST",
    token,
    body: { situacao, motivo },
  });
}

/**
 * TROCAR A VAGA da candidatura (item 5 do diretor), só MASTER e SUPER_ADMIN.
 *
 * PATCH, e não POST: a candidatura já existe e uma propriedade dela muda. POST diria que algo nasce,
 * que é o que o "Trazer De Volta" faz e esta operação deliberadamente NÃO faz.
 */
export function trocarVagaDaCandidatura(
  candidaturaId: string,
  vagaId: string,
  motivo: string | undefined,
  token: string | null,
): Promise<AsCandidaturaItem> {
  return apiFetch<AsCandidaturaItem>(`/as/candidatos/candidaturas/${candidaturaId}/vaga`, {
    method: "PATCH",
    token,
    body: motivo ? { vagaId, motivo } : { vagaId },
  });
}

/** A LINHA DO TEMPO DE ETAPAS de uma candidatura (peça P3 do bug 1). */
export function listarHistoricoEtapas(
  candidaturaId: string,
  token: string | null,
): Promise<AsCandidaturaEtapaItem[]> {
  return apiFetch<AsCandidaturaEtapaItem[]>(
    `/as/candidatos/candidaturas/${candidaturaId}/etapas`,
    { token },
  );
}

export function registrarContato(
  candidaturaId: string,
  body: { tipo: string; resumo: string; ocorridoEm?: string },
  token: string | null,
): Promise<AsContatoItem> {
  return apiFetch<AsContatoItem>(`/as/candidatos/candidaturas/${candidaturaId}/contatos`, {
    method: "POST",
    token,
    body,
  });
}

export function listarContatos(
  candidaturaId: string,
  token: string | null,
): Promise<AsContatoItem[]> {
  return apiFetch<AsContatoItem[]>(`/as/candidatos/candidaturas/${candidaturaId}/contatos`, {
    token,
  });
}

// ── O FUNIL, DO LADO DA TELA ────────────────────────────────────────────────

/**
 * PARA ONDE ESTA CANDIDATURA PODE IR. Espelha `destinosDeEtapa` do domínio do backend, que continua
 * sendo a autoridade: ele revalida e devolve a frase de recusa pronta, e é ela que a tela exibe.
 * Aqui a régua existe só para a tela OFERECER o destino certo, em vez de oferecer tudo e deixar o
 * consultor descobrir o que é permitido pelo erro.
 *
 * O FUNIL DEIXOU DE SER UM TRILHO (decisão do diretor, 27/08): de qualquer etapa se vai para
 * qualquer outra, para a frente, para trás e com pulo. A operação real não é linear, e a régua
 * antiga (uma casa por vez) obrigava a etapa gravada a mentir sobre o processo. A justificativa
 * inteira, e a garantia de que isso não toca a contagem de posições da vaga, mora no domínio.
 *
 * ESTA É UMA FUNÇÃO, e não mais um mapa constante, porque a resposta agora é DERIVADA do catálogo:
 * etapa nova no `CANDIDATURA_ETAPAS` nasce como destino de todas as outras, sem ninguém ter de
 * lembrar de acrescentar cinco linhas num mapa.
 */
export function destinosDeEtapa(de: CandidaturaEtapa): CandidaturaEtapa[] {
  return CANDIDATURA_ETAPAS.filter((e) => e !== de);
}

/** A entrevista com o cliente é opcional? Dito em função, para o teste afirmar isso diretamente. */
export function entrevistaClienteEhOpcional(): boolean {
  return destinosDeEtapa("ENTREVISTA_SOULAN").includes("APROVACAO");
}

/**
 * A ETAPA DE ENTRADA ESCOLHIDA NO CADASTRO, em UM passo.
 *
 * A candidatura SEMPRE nasce em `CAPTACAO` (é o backend que decide isso). Quando o consultor diz que
 * a pessoa já entra em Triagem, a tela precisa movê-la até lá.
 *
 * ERA UMA CAMINHADA, VIROU UM PASSO. Enquanto o backend só aceitava avanço de uma etapa por vez,
 * entrar em Aprovação custava quatro requisições em sequência, e uma falha no meio deixava a pessoa
 * parada numa etapa intermediária que ninguém tinha escolhido. Com o movimento livre, um único
 * `moverEtapa` leva ao destino: ou vai inteiro, ou não vai.
 *
 * A ASSINATURA CONTINUA DEVOLVENDO LISTA, e não uma etapa só, porque quem chama percorre o retorno
 * em laço. Devolver `[destino]` mantém o laço válido sem tocar no chamador (§A.26); `CAPTACAO` como
 * destino devolve lista vazia, que é o correto, já que ela é o ponto de partida.
 */
export function caminhoAteEtapa(destino: CandidaturaEtapa): CandidaturaEtapa[] {
  return destino === "CAPTACAO" ? [] : [destino];
}

// ── OS KPIs, QUE SÃO O FILTRO ───────────────────────────────────────────────

/**
 * OS CARDS DO FUNIL: um por ESTADO DE VERDADE, e nenhum estado sem número à vista.
 *
 * O QUE MUDOU E POR QUE (ajuste do diretor). O conjunto anterior tinha seis cards e escondia cinco
 * estados dentro de fusões: "Em Entrevista" somava Soulan com Cliente, "Aprovados" somava aprovado
 * com contratado, "Descartados" somava descartado com desistiu, e quem estava ATIVO na Aprovação não
 * tinha card nenhum. As duas primeiras fusões são justamente as que doem numa análise de funil:
 *  - APROVADO e CONTRATADO são estados DIFERENTES (um virou admissão, o outro ainda não);
 *  - DESCARTADO e DESISTIU também (o time recusou, ou a pessoa saiu por conta própria).
 * Somados, esses pares respondem "quantos saíram", e nunca "por que saíram", que é a pergunta real.
 *
 * A REGRA CONTINUA A MESMA: uma candidatura cai em UM card só, sem contagem dupla. A SITUAÇÃO vence
 * a ETAPA, porque quem já recebeu decisão não está mais em fila viva; a etapa só decide entre os
 * cinco cards de quem segue `ATIVO`.
 */
export type KpiFunil =
  | "captacao"
  | "triagem"
  | "entrevistaSoulan"
  | "entrevistaCliente"
  | "emAprovacao"
  | "aprovados"
  | "contratados"
  | "descartados"
  | "desistiram";

/**
 * `total` é a base de tudo e `semVaga` é a pessoa que está na base e ainda não entrou em vaga
 * nenhuma. Nenhum dos dois vem de uma candidatura (o segundo é, por definição, a AUSÊNCIA de uma),
 * então eles vivem fora do `KpiFunil` e são contados pela tela.
 */
export type KpiId = "total" | "semVaga" | KpiFunil;

/**
 * A QUE CARD UMA CANDIDATURA PERTENCE. Total, agora: toda combinação de etapa e situação tem card,
 * e é por isso que o retorno deixou de ser anulável. O estado sem número à vista era exatamente o
 * buraco que o ajuste fechou (quem estava ATIVO na Aprovação não aparecia em card nenhum).
 */
export function kpiDaCandidatura(etapa: CandidaturaEtapa, situacao: CandidaturaSituacao): KpiFunil {
  // OS DESFECHOS PRIMEIRO: recebida a decisão, a etapa em que ela foi tomada não muda o card.
  if (situacao === "APROVADO") return "aprovados";
  if (situacao === "CONTRATADO") return "contratados";
  if (situacao === "DESCARTADO") return "descartados";
  if (situacao === "DESISTIU") return "desistiram";
  // E AS CINCO ETAPAS VIVAS, na ordem do funil.
  if (etapa === "CAPTACAO") return "captacao";
  if (etapa === "TRIAGEM") return "triagem";
  if (etapa === "ENTREVISTA_SOULAN") return "entrevistaSoulan";
  if (etapa === "ENTREVISTA_CLIENTE") return "entrevistaCliente";
  return "emAprovacao";
}

/**
 * A FRASE DA VAGA CHEIA É DO BACKEND, MAS NÃO SERVE EM TODO CONTEXTO.
 *
 * A trava de posições devolve "Esta vaga tem N posições e as N já estão preenchidas. Reprove alguém
 * ou aumente as posições da vaga.", e ela está CERTA onde nasceu: quem está tocando o funil de uma
 * vaga aberta pode mesmo reprovar alguém ou rever as posições.
 *
 * DENTRO DO MODAL DE ENCERRAMENTO DA VAGA ela fica ambígua, por dois motivos concretos: "reprove"
 * não é verbo de botão nenhum do sistema (as saídas se chamam Descartado, Desistiu e Contratado), e
 * "aumente as posições" é conselho ruim para quem está encerrando, ainda mais porque a edição de
 * posições RECUSA vaga encerrada. Esta função reconhece a frase para a tela poder traduzi-la para o
 * contexto. A mensagem do backend NÃO é alterada: ela continua correta no lugar de origem.
 */
export function ehTravaDeVagaCheia(mensagem: string): boolean {
  const limpa = mensagem
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return /ja est(a|ao) preenchid/.test(limpa);
}

// ── OS DOIS 409 DA ALOCAÇÃO, QUE NÃO SÃO A MESMA COISA ──────────────────────

/**
 * A REENTRADA EM VAGA JÁ ENCERRADA, RECONHECIDA PELO CORPO E NUNCA PELO TEXTO.
 *
 * ┌─ O PONTO FINO, e é o motivo de esta função existir ─────────────────────────────────────────┐
 * │ A MESMA rota devolve DOIS 409 diferentes, e tratá-los igual seria o erro caro:               │
 * │  - "Esta pessoa já está nesta vaga." é erro SECO. A pessoa está VIVA na vaga agora, não há    │
 * │    nada a confirmar, e o corpo vem sem estrutura nenhuma. Continua sendo erro na tela.        │
 * │  - `reason: "reentradaAposEncerramento"` é uma PERGUNTA. O processo anterior acabou, a        │
 * │    reentrada é permitida, e o backend manda a data e o motivo justamente para o consultor     │
 * │    decidir com eles na frente.                                                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CASA-SE PELO CAMPO `reason`, no mesmo espírito do `candidatosPendentes` da Central de Vagas.
 * Casar pela frase quebraria no dia em que alguém corrigisse uma vírgula da mensagem, e quebraria
 * do jeito pior: silenciosamente, transformando a pergunta de volta em beco sem saída.
 *
 * `needsConfirmation` É CONFERIDO, e não presumido do `reason`: é o campo que diz se a tela PODE
 * oferecer o "estou ciente". Ele não é sempre verdadeiro no módulo (a trava de encerramento da vaga
 * manda `false`, porque lá não existe confirmar mesmo assim), então lê-lo é ler a verdade em vez de
 * deduzi-la do nome do motivo.
 */
export function reentradaPrecisaCiencia(err: unknown): AsReentradaPrecisaCiencia | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const corpo = err.data as Partial<AsReentradaPrecisaCiencia> | undefined;
  if (corpo?.reason !== "reentradaAposEncerramento" || corpo.needsConfirmation !== true) return null;
  if (typeof corpo.message !== "string" || !corpo.anterior) return null;
  return corpo as AsReentradaPrecisaCiencia;
}

// ── HIGIENE DE TELA ─────────────────────────────────────────────────────────

/**
 * MÁSCARA DE CPF, a mesma do wizard de Nova Admissão e da Central de Vagas. O campo mostra
 * "123.456.789-01" e o que viaja é o número limpo, no CORPO do POST (§A.6).
 */
export function formatCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Data e hora ISO no formato que o time lê. Vazio vira "não informado" (§A.11). */
export function dataHoraBr(iso: string | null | undefined): string {
  if (!iso) return "não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Data ISO (yyyy-mm-dd) no formato brasileiro, sem passar por fuso (a string já é a data). */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "não informado";
  const [a, m, d] = iso.slice(0, 10).split("-");
  if (!a || !m || !d) return "não informado";
  return `${d}/${m}/${a}`;
}

/**
 * A MENSAGEM DE ERRO QUE A TELA MOSTRA É A DO BACKEND, sempre. As quatro travas do módulo (aprovar
 * além das posições, alocar em vaga encerrada, duplicar candidatura e a corrida entre dois
 * consultores) já chegam com o texto pronto e com a instrução do que fazer. Reescrever aqui seria
 * ter duas versões da mesma regra, e a da tela envelheceria primeiro.
 */
export function mensagemDoErro(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
