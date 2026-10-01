import { MOTIVOS_DA_TRAVA_DE_ACESSO, MOTIVO_DA_TRAVA_LABEL } from "@ea/shared-types";

/**
 * A RÉGUA DO ACESSO POR E-MAIL DO PORTAL, fora das telas para poder ser testada.
 *
 * ┌─ O QUE ESTA PORTA É, E O QUE ELA NUNCA FAZ ─────────────────────────────────────────────────┐
 * │ Ela NÃO emite sessão e NÃO abre o Portal. Ela prova a posse de uma caixa de e-mail e, com    │
 * │ isso, pede ao servidor que ENVIE o link do Portal para aquela mesma caixa. A chave de acesso │
 * │ continua sendo link + CPF + nascimento em `POST portal/identificar`, byte a byte como antes. │
 * │ É por isso que não existe, em lugar nenhum deste módulo, nada que pareça "entrar agora".     │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS PROIBIÇÕES DA AUDITORIA QUE MORAM AQUI, e é por isso que elas moram AQUI ──────────┐
 * │ 1. NENHUM ORÁCULO DE ENUMERAÇÃO. O pedido de código responde igual para todo e-mail, exista  │
 * │    ou não, então a tela avança para o passo do código SEMPRE. Nenhuma frase deste arquivo    │
 * │    diz, ou permite deduzir, que um e-mail está ou não cadastrado.                            │
 * │ 2. NENHUM DADO DA PESSOA ANTES DA IDENTIDADE PROVADA. A confirmação do código devolve um     │
 * │    bilhete e nada mais: posse de caixa não é prova de identidade (6 e-mails medidos em       │
 * │    produção são compartilhados por 12 CPFs, 5 deles com dois nomes diferentes). Por isso não │
 * │    existe aqui nenhum "confirme que é você, MARIA S.".                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: CPF, data de nascimento, e-mail e código NÃO passam por armazenamento do navegador, não
 * entram em URL e não entram em log. Eles vivem no estado do formulário e no corpo da requisição.
 * §A.11: nenhum travessão em texto de tela.
 */

// ── As rotas ────────────────────────────────────────────────────────────────────────────────────

export const ROTA_SOLICITAR_CODIGO = "/portal/acesso-email/solicitar";
export const ROTA_CONFIRMAR_CODIGO = "/portal/acesso-email/confirmar";
export const ROTA_IDENTIDADE_DO_ACESSO = "/portal/acesso-email/identidade";

/** A fila do time e o destrave. Fora do prefixo `portal/`, que a barreira allowlista (contrato §6). */
export const ROTA_TRAVAS = "/esteira/portal-painel/travas";
export const rotaDestravar = (id: string) => `/esteira/portal-painel/travas/${id}/destravar`;

// ── O código ────────────────────────────────────────────────────────────────────────────────────

/** 6 dígitos, número do contrato (§2). A tela não decide o tamanho: ela obedece. */
export const TAMANHO_DO_CODIGO = 6;

/** O campo aceita só dígito, e recorta no tamanho do contrato. Colar "123 456" continua valendo. */
export function digitosDoCodigo(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, TAMANHO_DO_CODIGO);
}

export function codigoCompleto(valor: string): boolean {
  return digitosDoCodigo(valor).length === TAMANHO_DO_CODIGO;
}

/**
 * O E-MAIL, conferido SÓ NA FORMA, e de propósito nada além disso.
 *
 * A tela não tem como saber se o endereço existe, e se soubesse não poderia dizer (proibição 1 do
 * cabeçalho). Esta função existe só para o botão não disparar uma requisição por um campo que
 * claramente ainda está no meio da digitação.
 */
export function emailAparentaValido(valor: string): boolean {
  const limpo = valor.trim();
  if (limpo.length < 5 || limpo.length > 254) return false;
  if (/\s/.test(limpo)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(limpo);
}

/** `trim` e minúsculas, o mesmo `normalizarEmail` do domínio. Não é Gmail-aware de propósito. */
export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * O PRAZO QUE A PESSOA VÊ, em `mm:ss`. Ela precisa saber que a coisa vence, senão fica olhando um
 * código morto e conclui que o sistema está quebrado.
 */
export function contagemRegressiva(msRestantes: number): string {
  const total = Math.max(0, Math.floor(msRestantes / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

/** Quando o prazo chega ao fim, o botão de confirmar sai de cena e sobra pedir outro código. */
export function prazoVencido(msRestantes: number): boolean {
  return msRestantes <= 0;
}

// ── O vocabulário das recusas ───────────────────────────────────────────────────────────────────

/**
 * ┌─ A PORTA TEM DOIS DESFECHOS DE ERRO, E SÓ DOIS, e a TELA NÃO PODE INVENTAR UM TERCEIRO ─────┐
 * │ A RECUSA É UMA SÓ (401, `ACESSO_RECUSADO`): código errado, código vencido, bilhete morto, CPF │
 * │ com dígito inválido, ficha anonimizada e TRAVA ATIVA devolvem a MESMA frase, o MESMO corpo e o │
 * │ MESMO status. O outro desfecho é o 503 de porta desligada, que não depende do que foi digitado.│
 * │                                                                                              │
 * │ ISSO NÃO É LIMITAÇÃO DO BACKEND, É A EXIGÊNCIA O5 DA AUDITORIA. Distinguir qualquer um desses │
 * │ casos contaria a quem tenta algo sobre o nosso cadastro: que o e-mail existe, que o CPF        │
 * │ confere, que a data bateu, ou que aquela pessoa está sob disputa. Um terceiro desfecho na tela │
 * │ recria o oráculo pela porta da redação.                                                        │
 * │                                                                                              │
 * │ CONSEQUÊNCIA PRÁTICA, e ela é deliberada: a tela de `TRAVADO` NÃO é alcançável hoje, porque o │
 * │ servidor não diz que travou. O mapeamento de 403/409 fica aqui como a ÚNICA linha a mexer no   │
 * │ dia em que existir um sinal, e não como um `if` espalhado pelo componente.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export type DesfechoDaRecusa =
  /** A recusa ÚNICA da porta. Dá para tentar de novo, e o servidor não diz por que recusou. */
  | "RECUSADO"
  /** Travado: reservado, ver o bloco acima. Hoje o servidor não o distingue, e isso é correto. */
  | "TRAVADO"
  /** Teto do servidor. Não dizemos quantas tentativas restam (isso ajudaria quem está chutando). */
  | "MUITAS_TENTATIVAS"
  /** A porta está desligada (sem correio, sem segredo). Não é erro da pessoa. */
  | "INDISPONIVEL"
  | "FALHA";

export function desfechoDaRecusa(status: number): DesfechoDaRecusa {
  switch (status) {
    // 401 é A RECUSA da porta, e 400 é a validação de FORMA do corpo, que o backend mantém
    // deliberadamente pobre ("Informe um CPF válido") para não virar um terceiro desfecho.
    case 400:
    case 401:
      return "RECUSADO";
    case 403:
    case 409:
      return "TRAVADO";
    case 429:
      return "MUITAS_TENTATIVAS";
    case 503:
      return "INDISPONIVEL";
    default:
      return "FALHA";
  }
}

/**
 * AS FRASES, e todas elas são NEUTRAS por obrigação.
 *
 * Nenhuma diz qual campo divergiu, nenhuma diz que o CPF já existe, nenhuma diz quantas tentativas
 * restam e nenhuma diz se o e-mail está cadastrado. Cada uma dessas frases seria uma resposta a
 * pergunta que a porta existe para não responder.
 *
 * ELAS SÃO A RESERVA, não a primeira escolha: a frase autoritativa é a do SERVIDOR, e quem a lê é
 * `mensagemDaRecusa`. Reescrever recusa na tela é como o oráculo volta pela porta da redação.
 *
 * §A.24: são frases de apoio e de erro, então escrita normal, não Title Case.
 */
export const FRASE_DA_RECUSA: Record<DesfechoDaRecusa, string> = {
  RECUSADO:
    "Não foi possível continuar. Confira os dados e tente de novo, ou procure o seu contato do RH.",
  TRAVADO:
    "Não conseguimos confirmar os seus dados por aqui. Fale com o RH que está acompanhando a sua admissão para seguir.",
  MUITAS_TENTATIVAS: "Você tentou várias vezes agora. Aguarde alguns minutos e tente de novo.",
  INDISPONIVEL: "Este caminho está indisponível agora. Fale com o RH para receber o seu link.",
  FALHA: "Não conseguimos concluir agora. Tente de novo em instantes.",
};

/**
 * A MENSAGEM QUE A PESSOA LÊ VEM DO SERVIDOR, e há uma armadilha conhecida no caminho.
 *
 * ┌─ POR QUE O 401 NÃO PODE USAR O `message` DO `ApiError` ─────────────────────────────────────┐
 * │ O cliente HTTP REESCREVE o `message` de todo 401 para "Sua sessão expirou..." (`lib/api`), que │
 * │ é a frase certa para o operador do EA e ERRADA para o candidato, que não tem conta nenhuma.   │
 * │ É por isso que o backend manda a recusa também em `mensagem` no CORPO: é esse campo que          │
 * │ atravessa a reescrita intacto. Ler o `message` no 401 mostraria ao candidato uma frase sobre    │
 * │ uma sessão que ele nunca teve.                                                                │
 * │                                                                                              │
 * │ Nos outros status o `message` é o do próprio servidor e serve: no 400 ele é a orientação de    │
 * │ FORMA, mantida pobre de propósito ("Informe um CPF válido").                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function mensagemDaRecusa(erro: {
  status: number;
  message?: string;
  data?: unknown;
}): string {
  const corpo = erro.data as { mensagem?: unknown } | null | undefined;
  const doCorpo = typeof corpo?.mensagem === "string" ? corpo.mensagem.trim() : "";
  if (doCorpo) return doCorpo;

  const desfecho = desfechoDaRecusa(erro.status);
  const doServidor = (erro.message ?? "").trim();
  if (erro.status !== 401 && desfecho === "RECUSADO" && doServidor) return doServidor;
  return FRASE_DA_RECUSA[desfecho];
}

/** A frase do código errado. Uma só, sem contador, para os dois casos (errado e vencido). */
export const FRASE_CODIGO_NAO_CONFERE =
  "Código inválido ou vencido. Confira o que chegou no seu e-mail ou peça outro código.";

/** A frase do pedido de código recusado pelo teto. Calma, sem número de tentativa. */
export const FRASE_PEDIDO_NO_TETO =
  "Você já pediu código várias vezes agora. Aguarde alguns minutos e tente de novo.";

// ── A fila de travas, na tela do time ───────────────────────────────────────────────────────────

/** O catálogo dos filtros, servido por ENDPOINT e não derivado das linhas da página (§A.37). */
export const ROTA_FILTROS_DAS_TRAVAS = "/esteira/portal-painel/travas/filtros";

export interface CatalogoDasTravas {
  motivos: readonly string[];
  situacoes: readonly string[];
}

/**
 * O MOTIVO DO DESTRAVE É O MOTIVO DA PRÓPRIA TRAVA, e isso NÃO é economia de catálogo.
 *
 * ┌─ O GESTO É DE RECONHECIMENTO, e o servidor CONFERE ────────────────────────────────────────┐
 * │ `POST travas/:id/destravar` aceita `{ motivoCodigo }` da lista `MOTIVOS_DA_TRAVA_DE_ACESSO` e │
 * │ exige que ele seja o MESMO motivo da linha. Errar o motivo NÃO destrava, e a tentativa vira    │
 * │ linha de trilha (`PORTAL_ACESSO_DESTRAVE_RECUSADO`). Quer dizer: a tela não está perguntando   │
 * │ "por que você destravou", está pedindo que a pessoa DECLARE o que ela está desfazendo, e num    │
 * │ caso (`CPF_DE_OUTRO_CANDIDATO`) o que se desfaz é a proteção de DUAS pessoas disputando o      │
 * │ mesmo CPF.                                                                                    │
 * │                                                                                              │
 * │ POR ISSO A LISTA OFERECE OS QUATRO, e não só o da linha: um seletor com uma opção só faria o  │
 * │ reconhecimento virar carimbo, que é exatamente o botão apertado sem olhar que a conferência do │
 * │ servidor existe para impedir.                                                                 │
 * │                                                                                              │
 * │ NÃO EXISTE CAMPO DE TEXTO LIVRE, nem aqui nem no DTO: a tabela não tem coluna de observação,   │
 * │ de propósito (§A.6, quem opera escreve o nome da pessoa em campo livre).                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const OPCOES_DE_MOTIVO_DA_TRAVA = MOTIVOS_DA_TRAVA_DE_ACESSO.map((v) => ({
  value: v as string,
  label: MOTIVO_DA_TRAVA_LABEL[v],
}));

/** O seletor do destrave é o MESMO catálogo, pela razão do bloco acima. */
export const OPCOES_DO_DESTRAVE = OPCOES_DE_MOTIVO_DA_TRAVA;

/** A situação da linha, derivada do carimbo. Não é coluna do banco: é leitura. */
export type SituacaoDaTrava = "ABERTA" | "DESTRAVADA";

export function situacaoDaTrava(t: { destravadoEm: string | null }): SituacaoDaTrava {
  return t.destravadoEm ? "DESTRAVADA" : "ABERTA";
}

/**
 * O ÍCONE ACOMPANHA O ESTADO REAL, nunca é fixo (§A.12): destravada vira check verde, aberta vira
 * exclamação amarela. O `rank` é a ordem da coluna no clique, da fila de trabalho para o resolvido,
 * e é a mesma ordem que o servidor já usa por padrão (abertas primeiro).
 */
export interface RotuloDaTrava {
  label: string;
  tone: "ok" | "wn";
  icone: "check" | "alert";
  rank: number;
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDaTrava, RotuloDaTrava> = {
  ABERTA: { label: "Aberta", tone: "wn", icone: "alert", rank: 0 },
  DESTRAVADA: { label: "Destravada", tone: "ok", icone: "check", rank: 1 },
};

export const OPCOES_DE_SITUACAO_DA_TRAVA: { value: SituacaoDaTrava; label: string }[] = [
  { value: "ABERTA", label: ROTULO_DA_SITUACAO.ABERTA.label },
  { value: "DESTRAVADA", label: ROTULO_DA_SITUACAO.DESTRAVADA.label },
];

/** Situação fora do catálogo não derruba a célula. */
export function rotuloDaSituacao(s: string): RotuloDaTrava {
  return (
    (ROTULO_DA_SITUACAO as Record<string, RotuloDaTrava | undefined>)[s] ??
    ROTULO_DA_SITUACAO.ABERTA
  );
}

/** Motivo fora do catálogo não derruba a tabela: vira o próprio código, legível e sem mentira. */
export function rotuloDoMotivo(codigo: string): string {
  return (
    (MOTIVO_DA_TRAVA_LABEL as Record<string, string | undefined>)[codigo] ?? codigo ?? "não informado"
  );
}

export interface FiltrosDasTravas {
  motivos?: string[];
  situacoes?: string[];
  nome?: string;
}

/**
 * A CONSULTA DA FILA, e aqui há UMA TRADUÇÃO DELIBERADA entre a tela e a rota.
 *
 * ┌─ A TELA OFERECE MÚLTIPLA SELEÇÃO (§A.28), E A ROTA RECEBE UM VALOR EM `situacao` ───────────┐
 * │ `ABERTA` e `DESTRAVADA` são o complemento exato uma da outra, então escolher as DUAS é o     │
 * │ mesmo que não filtrar, e é assim que a tradução funciona: nenhuma ou ambas viram parâmetro   │
 * │ nenhum; exatamente uma viaja em `situacao`. O componente continua sendo o multiselect        │
 * │ compartilhado, e a consulta continua sendo a que o backend implementou. Traduzir aqui é o    │
 * │ oposto de mandar um parâmetro para ser ignorado, que é a divergência que o painel já pagou.  │
 * │                                                                                            │
 * │ `motivos` é múltiplo dos dois lados: viaja separado por vírgula e a cláusula vira `IN`.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function queryDasTravas(f: FiltrosDasTravas): string {
  const q = new URLSearchParams();
  const motivos = (f.motivos ?? []).map((s) => s.trim()).filter(Boolean);
  if (motivos.length) q.set("motivos", motivos.join(","));

  const situacoes = Array.from(new Set((f.situacoes ?? []).map((s) => s.trim()).filter(Boolean)));
  if (situacoes.length === 1) q.set("situacao", situacoes[0]);

  const nome = (f.nome ?? "").trim();
  if (nome) q.set("nome", nome);
  return q.toString();
}

export function contarFiltrosDasTravas(f: FiltrosDasTravas): number {
  return (
    (f.motivos?.length ? 1 : 0) +
    (f.situacoes?.length ? 1 : 0) +
    ((f.nome ?? "").trim() ? 1 : 0)
  );
}

/** Só o que a fila de trabalho precisa: quem ainda está travado. É o badge da aba. */
export function contarTravadas(itens: { destravadoEm: string | null }[]): number {
  return itens.filter((t) => t.destravadoEm === null).length;
}

/**
 * O DESTRAVE PODE SER RECUSADO COM STATUS 200, e ignorar isso seria mentir na tela.
 *
 * A rota devolve `{ destravado: boolean }`: `false` quando a linha já estava destravada, quando o id
 * não existe ou quando o motivo declarado NÃO é o da trava. Nenhum desses casos lança, então "não
 * deu erro" NÃO significa "destravou". Quem confere é esta função, e a tela obedece a ela.
 *
 * ┌─ POR QUE A FRASE FALA DE TELA VELHA, e não de erro de digitação ────────────────────────────┐
 * │ Os três casos de recusa têm a MESMA causa prática: a fila mudou depois que esta tela carregou. │
 * │ Outra pessoa destravou, ou a trava foi REABERTA com outro motivo (a porta reabre a linha e     │
 * │ troca o `motivo_codigo` quando ela estava destravada). A guarda do backend existe exatamente   │
 * │ para impedir o destrave às cegas com dado velho, então a tela traduz isso e RECARREGA, em vez  │
 * │ de deixar a pessoa insistindo com o mesmo valor obsoleto.                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const FRASE_DESTRAVE_RECUSADO =
  "Não destravamos: a fila mudou desde que esta tela abriu. Acabamos de atualizar os dados, confira o motivo em destaque e confirme de novo.";

/** A linha saiu da fila entre o carregamento e o clique (filtro ou outra pessoa mexeu). */
export const FRASE_TRAVA_SUMIU =
  "Esta trava não está mais na fila. Acabamos de atualizar a lista.";
