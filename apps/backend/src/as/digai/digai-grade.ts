import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ─ A GRADE DE ACESSO DO DIGAI: A TRADUCAO TYPESCRIPT DA GRADE JA AUDITADA ──────────────────────
 *
 * Esta peca NAO INVENTA REGRA NENHUMA. Ela e a traducao, linha por linha, de
 * `/home/henrique/digai-investigacao/grade_digai.py`, que o `seguranca` auditou em 16/09/2026 (26
 * bloqueios, 11 leituras, quatro vetos acatados). Onde o Python e o TypeScript divergem, quem manda
 * e o Python.
 *
 * ┌─ POR QUE A GRADE E A PECA MAIS CARA DESTA FRENTE ────────────────────────────────────────────┐
 * │ O Digai e PRODUCAO DE TERCEIRO, sem sandbox, com CPF real, e o 401 dele ECOA O PATH. Uma       │
 * │ chamada mal formada nao devolve so um erro: ela GRAVA o dado pessoal no log do fornecedor,     │
 * │ onde nao temos como apagar. A grade e PRE-REDE: ela recusa ANTES de a chamada sair, nunca      │
 * │ depois de a resposta chegar.                                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O VETO C DO `seguranca`: "AUTORIZADO" TEM DE SER IDENTICO A "ENVIADO" ──────────────────────┐
 * │ Em Python, `ler` autoriza o path e monta a URL com A MESMA STRING NORMALIZADA. O erro natural │
 * │ em TypeScript seria `autorizar(path); fetch(BASE + path)`, que manda ao fornecedor uma string │
 * │ que a grade NUNCA avaliou: um id valendo `abc?x=1` seria autorizado como `.../abc` e enviado  │
 * │ como `.../abc?x=1`. Por isso `autorizar` DEVOLVE a string normalizada, e e ELA, e so ela, que │
 * │ vai para a rede. Uma so, e o cliente nao tem como usar outra (ver `digai.cliente.ts`).        │
 * │                                                                                               │
 * │ O FRAGMENTO (`#`) E PIOR QUE A QUERY, e por isso ele NAO e cortado aqui: o `fetch` do Node    │
 * │ trunca o fragmento sozinho, entao cortar antes faria a grade avaliar `/screenings/abc` (que    │
 * │ casa a allowlist) enquanto a rede executaria outra coisa. O `#` simplesmente nao esta no       │
 * │ alfabeto do id, logo o path inteiro e RECUSADO, que e a unica saida em que as duas strings     │
 * │ continuam sendo a mesma.                                                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A MENSAGEM DE RECUSA NAO ECOA O PATH (VETO C, segunda metade) ──────────────────────────────┐
 * │ A versao Python ecoa (`path fora da allowlist de leitura: {p}`), e aqui isso seria o vazamento │
 * │ pela porta de dentro: se o id vindo do payload for um CPF, a grade recusa CERTO e escreve o    │
 * │ CPF no NOSSO log, que e permanente e esta fora do alcance do expurgo. Pior: o texto vai parar  │
 * │ no `failedReason` do job, que o BullMQ guarda no Redis sem TTL. A recusa diz o MOTIVO e nada   │
 * │ do path.                                                                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada aqui loga. A grade LANCA, e quem decide o que dizer e quem a chama.
 */

/**
 * O HOST, CONSTANTE E PINADO. Nao vem de dado lido, nao e configuravel: a unica coisa que o
 * chamador controla e o PATH, e o path passa pela allowlist.
 *
 * NAO E `api.hiring.digai.ai`, que e o host da doc legada: aquele nome NAO TEM CERTIFICADO VALIDO
 * (cert `CN=digai.ai`, SAN `*.digai.ai`, e wildcard cobre UM rotulo; `api.hiring` sao dois). Medido
 * em 16/09/2026 com openssl, mais o fato decisivo: os DOIS nomes resolvem para os MESMOS tres IPs e
 * apresentam o MESMO certificado, ou seja e o mesmo balanceador, e trocar o nome nao muda o destino,
 * so usa o nome que aquele servidor consegue provar. NAO "consertar" de volta.
 */
export const DIGAI_BASE_URL = "https://api-screening.digai.ai";

/**
 * O ALFABETO FECHADO DO ID DE ROTA (veto 2 de 16/09).
 *
 * Nunca `[^/]+`. O curinga generico aceita `%2f`, `%2e` e `%00`, e servidor que decodifica ANTES de
 * rotear resolve para recurso FORA da allowlist; a checagem de ".." literal nao pega a forma
 * percentual.
 */
const ID = "[A-Za-z0-9._-]{1,64}";

/**
 * O MESMO ALFABETO, ANCORADO, PARA VALIDAR O ID ANTES DE ELE VIRAR PATH.
 *
 * Esta e a metade do veto C que acontece LONGE daqui: o id do payload do webhook e conferido NO
 * PONTO EM QUE SAI DO PAYLOAD (`ehIdTecnicoDigai`), antes de qualquer concatenacao. Deixar a
 * conferencia so para a grade funcionaria, mas a recusa chegaria carregando o valor suspeito pela
 * pilha inteira, e e justamente o valor que nao pode viajar.
 */
export const ID_TECNICO_DIGAI = new RegExp(`^${ID}$`);

/** CPF com ou sem mascara, na mesma forma da grade Python. */
const RE_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;

/**
 * O VALOR TEM CARA DE DOCUMENTO OU DE TELEFONE?
 *
 * EXPORTADA DE PROPOSITO, e nao duplicada no dominio: em ATS o `userId` as vezes E o documento da
 * pessoa, e o caminho e curto (a varredura descobre a chave, alguem a cola num path). Duas copias
 * desta regra divergiriam no primeiro ajuste, e a que ficasse para tras seria justamente a que
 * decide se o CPF entra numa URL.
 */
export function pareceDocumentoOuTelefone(valor: string): boolean {
  return RE_CPF.test(valor) || /^\d{11}$/.test(valor);
}

/**
 * O id e tecnico (alfabeto fechado, ate 64, e sem cara de documento)? Fail-closed.
 *
 * O ALFABETO SOZINHO NAO BASTA, e este e o furo B4 chegando pela porta do payload: `[A-Za-z0-9._-]`
 * aceita digito, entao um CPF de onze digitos cabe inteiro num id. O recurso e permitido; o VALOR e
 * que nao pode.
 */
export function ehIdTecnicoDigai(valor: unknown): valor is string {
  if (typeof valor !== "string" || !ID_TECNICO_DIGAI.test(valor)) return false;
  /*
   * O PONTO SOZINHO NAO E ID, e esta linha e a outra metade do veto 1 (29/09). O `pathDe` ja
   * recusa `.` e `..` como segmento, entao a rede esta protegida; esta guarda fecha a porta MAIS
   * CEDO, onde o valor sai do payload do fornecedor. Sem ela, um `userId` valendo `.` seria aceito
   * pelo receptor, viraria a chave `digai-.` no Redis e so seria recusado la na frente, pela grade:
   * um job inutil guardado e uma leitura que nunca aconteceria.
   */
  if (valor === "." || valor === "..") return false;
  return !pareceDocumentoOuTelefone(valor);
}

/**
 * OS NOVE PADROES QUE COBREM OS ONZE CAMINHOS DE LEITURA (veto B do `seguranca`, item 2).
 *
 * Traduzir um SUBCONJUNTO seria pior do que nao traduzir: grade que barra a leitura legitima
 * empurra quem constroi a contorna-la, e uma grade contornada nao protege nada. `v\d+` cobre v1 e
 * v2 do mesmo jeito que o Python.
 */
const PADROES_LEITURA: readonly RegExp[] = [
  new RegExp("^/api/v\\d+/public/workspaces$"),
  new RegExp(`^/api/v\\d+/public/workspaces/${ID}/screenings$`),
  new RegExp("^/api/v\\d+/public/screenings$"),
  new RegExp(`^/api/v\\d+/public/screenings/${ID}$`),
  new RegExp(`^/api/v\\d+/public/screenings/${ID}/results$`),
  // O caminho real do pre-cadastro e `/pre-sign-up`, COM HIFENS. As duas formas ficam porque as
  // duas existem na doc publica, e foi o padrao errado (nao o endpoint) que deu 404 em 16/09.
  new RegExp(`^/api/v\\d+/public/screenings/${ID}/pre-sign-up$`),
  new RegExp(`^/api/v\\d+/public/screenings/${ID}/candidates/pre-signup$`),
  // A consulta do MESMO candidato pela chave, que e o que responde se o CPF aparece depois que ele
  // finaliza. SO por `userId`: os irmaos por e-mail e por telefone existem na API e ficam DE FORA DE
  // PROPOSITO, porque poriam dado pessoal dentro da URL.
  new RegExp(`^/api/v\\d+/public/screenings/${ID}/users/${ID}/results$`),
  new RegExp(`^/api/v\\d+/public/screenings/${ID}/results/${ID}$`),
];

/**
 * SEGMENTOS DE RECURSO PROIBIDOS, casados por SEGMENTO INTEIRO e nunca por substring.
 *
 * Casar por substring quebraria a leitura legitima: `add` dentro de um UUID hexadecimal
 * (`6add1e2f-...`) nao e o recurso `add`, e bloquear ali empurra quem constroi a contornar a grade.
 */
const SEGMENTOS_PROIBIDOS: ReadonlySet<string> = new Set([
  "webhook",
  "webhooks",
  "notification",
  "notifications",
  "invitation",
  "invitations",
  "search",
  "lgpd",
  // PII NA URL: estes recursos EXISTEM na API do Digai e ficam barrados de proposito. Ja seriam
  // fail-closed por nao casarem a allowlist; entram aqui tambem para que um alargamento futuro de
  // padrao nao os reabra em silencio.
  "emails",
  "phone-numbers",
  "partner-user-id",
  "requirement",
  "requirements",
  "question",
  "questions",
  "signer",
  "signers",
  "envelope",
  "envelopes",
  "attempt",
  "attempts",
  "approve",
  "notify",
  "generate",
  "remove",
]);

/** Leitura e GET-only, declarado em codigo. Escrita exige entrada propria e explicita (protocolo 6). */
const METODOS_LEITURA: ReadonlySet<string> = new Set(["GET"]);

/** A recusa da grade. Classe propria para quem chama distinguir "a grade barrou" de "a rede caiu". */
export class GradeDigaiViolada extends Error {
  constructor(motivo: string) {
    super(`grade do Digai: ${motivo}`);
    this.name = "GradeDigaiViolada";
  }
}

/**
 * O PATH NORMALIZADO, ou recusa. So aceita path relativo (anti-SSRF).
 *
 * Corta a QUERY (o `?`) pelo mesmo motivo do Python, e NAO corta o fragmento (o `#`): ver o bloco
 * do veto C no topo.
 *
 * ┌─ O PONTO SOZINHO E RECUSADO, E ELE E O VETO 1 DA AUDITORIA DE CODIGO (29/09) ───────────────┐
 * │ O `.` esta DENTRO do alfabeto do id de proposito, porque id legitimo o usa (`sc1.2`). So que │
 * │ um segmento de UM PONTO SO tambem e id valido por aquela regra, e o `new URL` do Node        │
 * │ REMOVE dot-segments. O `seguranca` MEDIU as tres divergencias:                               │
 * │                                                                                              │
 * │   /api/v1/public/screenings/sc1/users/./results -> /api/v1/public/screenings/sc1/users/results│
 * │   /api/v2/public/screenings/./results           -> /api/v2/public/screenings/results          │
 * │   /api/v1/public/workspaces/./screenings        -> /api/v1/public/workspaces/screenings       │
 * │                                                                                              │
 * │ A primeira e a que importa: a grade autorizou `screenings/{ID}/users/{ID}/results` e a rede  │
 * │ executaria `screenings/sc1/users/results`, que NAO CASA padrao nenhum da allowlist. E o veto │
 * │ C renascendo no ultimo salto, uma linha DEPOIS da grade. E `ehIdTecnicoDigai(".")` devolvia  │
 * │ `true`, entao um `userId` valendo `.` vindo do payload do fornecedor chegava ate la.          │
 * │                                                                                              │
 * │ A RECUSA E POR SEGMENTO INTEIRO, e nunca por "contem ponto": o ponto DENTRO do id continua   │
 * │ valendo, e barra-lo quebraria leitura legitima, que e o jeito de a grade ser contornada.      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function pathDe(urlOuPath: string): string {
  if (urlOuPath.includes("://") || urlOuPath.startsWith("//")) {
    throw new GradeDigaiViolada("URL absoluta nao permitida; o chamador controla so o path");
  }
  const semQuery = urlOuPath.split("?", 1)[0]?.trim() ?? "";
  const p = semQuery.startsWith("/") ? semQuery : `/${semQuery}`;
  if (p.split("/").some((seg) => seg === ".." || seg === ".")) {
    throw new GradeDigaiViolada("segmento de ponto nao permitido no path");
  }
  return p;
}

/**
 * ─ A BARREIRA UNICA, E ELA DEVOLVE O QUE VAI PARA A REDE (veto C) ──────────────────────────────
 *
 * Recusa LANCANDO, e nunca devolvendo `false`: um booleano de recusa e ignoravel por descuido, e a
 * unica forma de uma trava nao ser ignorada e ela interromper o fluxo.
 *
 * A mensagem de recusa NAO carrega o path, o segmento nem o metodo cru. §A.6.
 */
export function autorizar(path: string, metodo: string): string {
  /*
   * ─ A COMPARACAO E EXATA, E `get` MINUSCULO E RECUSADO DE PROPOSITO ──────────────────────────
   *
   * Normalizar a caixa aqui pareceria gentileza e seria o contrario: o verbo chega de quem CHAMA, e
   * um chamador que escreve `get` nao esta pedindo leitura com outra grafia, esta montando a
   * requisicao por um caminho que ninguem revisou. Recusar torna o desvio visivel na primeira
   * chamada, em vez de deixa-lo passar ate o dia em que o mesmo caminho montar um `post`.
   */
  if (!METODOS_LEITURA.has(metodo ?? "")) {
    throw new GradeDigaiViolada("metodo proibido: a integracao de leitura e GET apenas");
  }
  const p = pathDe(path);
  for (const seg of p.split("/")) {
    if (SEGMENTOS_PROIBIDOS.has(seg.toLowerCase())) {
      throw new GradeDigaiViolada("segmento de recurso proibido pela allowlist");
    }
    /*
     * PII COMO VALOR DE SEGMENTO, que e o furo B4: o recurso e permitido, o ID e que nao pode ser um
     * CPF ou um telefone. `ID` aceita digito, entao um CPF cabe num segmento de id, e o caminho e
     * curto e provavel: em ATS o userId as vezes E o documento, a varredura descobre a chave, e o
     * passo seguinte e cola-la em `users/{...}/results`. O 401 do Digai ecoa o path.
     */
    if (pareceDocumentoOuTelefone(seg)) {
      throw new GradeDigaiViolada("segmento do path com cara de documento ou telefone");
    }
  }
  for (const rx of PADROES_LEITURA) {
    if (rx.test(p)) return p;
  }
  throw new GradeDigaiViolada("path fora da allowlist de leitura");
}

/**
 * ─ A PORTA DE SAIDA: QUEM AUTORIZA E QUEM MONTA A URL SAO A MESMA FUNCAO (veto C) ──────────────
 *
 * ┌─ O GAP MAIS CONCRETO DO PARECER DE 29/09, E A TRADUCAO ERRADA E A MAIS NATURAL DO MUNDO ────┐
 * │ `autorizar(path); fetch(BASE + path)` autoriza a string NORMALIZADA e envia a CRUA. Um        │
 * │ `attemptId` de payload valendo `abc?x=1` seria autorizado como `.../abc` e enviado com o      │
 * │ `?x=1` colado, que a grade nunca avaliou. Com `#` e pior: o `fetch` do Node trunca o          │
 * │ fragmento, entao o que a grade avaliou nao e o que a rede executa.                            │
 * │                                                                                               │
 * │ DUAS FUNCOES SEPARADAS E O CHAMADOR COLANDO AS PONTAS E O CONVITE AO DESCOMPASSO. Aqui e UMA: │
 * │ o cliente nao concatena nada e nao tem outra forma de montar o destino.                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ESTE COMENTARIO DIZIA "A URL EXATA QUE VAI PARA A REDE", E ERA FALSO (veto 1, 29/09) ───────┐
 * │ Falso porque o cliente ainda passa a string por `new URL`, que NORMALIZA dot-segments: a URL  │
 * │ que sai daqui era a autorizada, e a que ia para a rede podia ser OUTRA. A afirmacao so voltou │
 * │ a ser verdadeira depois de `pathDe` recusar `.` e `..` como SEGMENTO INTEIRO (ver o bloco de  │
 * │ la, com as tres divergencias medidas). O invariante hoje e: para todo path que esta funcao    │
 * │ aceita, `new URL(saida).pathname` e identico a `saida` a partir do host, e o autoteste PROVA  │
 * │ isso construindo o objeto `URL`, e nao comparando so a string de `autorizar`.                 │
 * │                                                                                               │
 * │ Comentario que mente sobre alcance e o modo de falha exato da secao A.26, e foi por acreditar │
 * │ neste que a conferencia depois do `new URL` nunca foi escrita.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function montarUrlAutorizada(path: string, metodo: string): string {
  /*
   * ─ AQUI A GRADE E MAIS ESTRITA QUE O PYTHON, E A DIFERENCA E DELIBERADA ─────────────────────
   *
   * `_path_de` (`grade_digai.py:110`) TRUNCA no `?`, e aquilo e correto: la o que se autoriza e o
   * que se envia sao a mesma string truncada. So que truncar e uma reescrita SILENCIOSA do que o
   * chamador pediu, e quem escreveu `.../abc?x=1` queria mandar `x=1`. Ele nao vai descobrir que
   * o parametro sumiu: vai descobrir que a resposta veio diferente, dias depois.
   *
   * A QUERY TEM PORTA PROPRIA (`validarParams`), com coleira de nome, de tamanho e de conteudo.
   * Query embutida no path e a porta que NAO tem coleira nenhuma, e recusar e o unico desfecho em
   * que o chamador fica sabendo. O mesmo vale para o fragmento, que o `fetch` do Node trunca
   * sozinho: o que a grade avaliaria nao seria o que a rede executaria.
   */
  if (path.includes("?") || path.includes("#")) {
    throw new GradeDigaiViolada(
      "o path de saida nao carrega query nem fragmento: a query vai por parametro",
    );
  }
  return DIGAI_BASE_URL + autorizar(path, metodo);
}

/**
 * ─ A COLEIRA DA QUERY STRING, E ELA E A METADE ESQUECIDA ───────────────────────────────────────
 *
 * `autorizar` so ve o path, entao sem esta funcao a query inteira ficaria sem dono, e ela vai para a
 * MESMA URL que o 401 do fornecedor ecoa.
 *
 * As tres coleiras que o veto B cobrou, e nenhuma delas fica vermelha quando some:
 *   1. FORMATO DA CHAVE: `[A-Za-z][A-Za-z0-9_]{0,39}`. Chave que carrega barra, `&` ou `=` pode
 *      alterar a rota, e chave que comeca com digito nao existe em API nenhuma.
 *   2. TETO DE 64 NO VALOR (era 200 na primeira versao da grade): query string vai para a URL, e
 *      URL vai para o log de acesso do FORNECEDOR, para o historico de shell e para qualquer trace.
 *   3. `@` PROIBIDO NO VALOR: nenhuma consulta legitima de workspace ou de screening precisa de
 *      e-mail. O `@` nao esta no alfabeto abaixo, e a checagem explicita fica junto para que
 *      alargar o alfabeto um dia nao reabra o e-mail em silencio.
 */
export function validarParams(
  params?: Record<string, unknown> | null,
): Record<string, string> | null {
  if (!params) return null;
  const limpo: Record<string, string> = {};
  for (const [chaveCrua, valorCru] of Object.entries(params)) {
    const k = String(chaveCrua);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k)) {
      throw new GradeDigaiViolada("parametro de query com nome invalido");
    }
    const ehEscalar =
      (typeof valorCru === "string" || typeof valorCru === "number") &&
      typeof valorCru !== "boolean";
    if (!ehEscalar || (typeof valorCru === "number" && !Number.isFinite(valorCru))) {
      throw new GradeDigaiViolada("valor de query invalido: so texto curto ou numero");
    }
    const v = String(valorCru);
    if (!/^[A-Za-z0-9 _.,:+-]{0,64}$/.test(v)) {
      throw new GradeDigaiViolada("valor de query com caractere nao permitido ou longo demais");
    }
    if (v.includes("@")) {
      throw new GradeDigaiViolada("valor de query com arroba: e-mail nao vai para a URL");
    }
    if (pareceDocumentoOuTelefone(v)) {
      throw new GradeDigaiViolada("valor de query com cara de documento");
    }
    limpo[k] = v;
  }
  return limpo;
}

// ── A INSPECAO DE FONTE, E ELA RECEBE O TEXTO (veto 3 de 16/09) ────────────────────────────────

/**
 * A regiao inspecionavel: linha de comentario fora.
 *
 * Sem isto, a propria documentacao desta peca (que CITA `client_secret` e `POST` para explicar por
 * que eles estao proibidos) se acusaria, e a unica saida seria parar de documentar o motivo.
 */
function semComentario(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

/**
 * OS NOMES DE PORTA DE REDE, montados em pedacos DE PROPOSITO.
 *
 * Escritos inteiros, o proprio detector apareceria no texto inspecionado e se acusaria. A mesma
 * armadilha foi medida na primeira versao da grade Python, e o comentario de la registra isso.
 */
const PORTAS_DE_REDE: readonly string[] = ["fet" + "ch(", "ht" + "tp(", "reque" + "st(", "axi" + "os"];

/**
 * NOMES QUE DENUNCIAM ESCRITA, casados como DECLARACAO e nunca como substring solta.
 *
 * `escreverCandidato` nao casa com `\bescrever\b`, e e assim que tem de ser: o que se procura e uma
 * porta de escrita EXPOSTA, e nao toda palavra parecida.
 */
const VERBOS_DE_ESCRITA = [
  "gravar",
  "escrever",
  "criar",
  "atualizar",
  "excluir",
  "remover",
  "enviar",
  "notificar",
  "autenticar",
  "create",
  "update",
  "upsert",
  "destroy",
] as const;

/**
 * ─ A INSPECAO ADVERSARIAL, E ELA RECEBE O TEXTO POR PARAMETRO (veto 3, na integra) ─────────────
 *
 * ┌─ O QUE O `seguranca` PROVOU EM 16/09, e e o mais dificil de acreditar ───────────────────────┐
 * │ A inspecao anterior recebia o CAMINHO do arquivo e lia sozinha. Ele COPIOU o arquivo, injetou │
 * │ uma funcao de escrita DEPOIS do ponto onde a inspecao parava de olhar, e obteve VERDE. A      │
 * │ garantia era decoracao.                                                                       │
 * │                                                                                               │
 * │ A correcao tem DUAS metades: a inspecao recebe o TEXTO (metade 1) E o autoteste INJETA o      │
 * │ ataque exigindo que ela acuse (metade 2). So a metade 1 continua sendo decoracao, porque      │
 * │ ninguem prova que ela olha.                                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELA OLHA O TEXTO INTEIRO. Nao ha marcador, nao ha "regiao operacional" e nao ha "regiao de teste":
 * foi exatamente o recorte que o veto 3 furou.
 *
 * UM PARAMETRO SO, e isso e contratual: a assinatura de dois argumentos ja seria a porta para
 * alguem passar um caminho de arquivo de novo.
 */
export function inspecionarFonte(texto: string): string[] {
  const achados: string[] = [];
  const codigo = semComentario(texto ?? "");
  /*
   * A COMPARACAO E INSENSIVEL A CAIXA, e isso nao e zelo: `DIGAI_CLIENT_SECRET` num
   * `process.env` e o MESMO residuo de OAuth que `client_secret` num corpo de formulario, e um
   * detector que so olha minusculas acha o segundo e perde o primeiro, que e o mais provavel dos
   * dois em TypeScript.
   */
  const contem = (agulha: string): boolean => codigo.toLowerCase().includes(agulha.toLowerCase());

  /*
   * O ATALHO DE TLS FICA PROIBIDO NO TEXTO INTEIRO. Desativar a verificacao de certificado entrega o
   * Bearer de PRODUCAO a quem responder no caminho, e o `seguranca` vetou em definitivo em 16/09.
   * Guarda com teste sobrevive a uma refatoracao; lembranca nao (mesma logica da §A.33).
   */
  for (const atalho of [
    "reject" + "Unauthorized",
    "NODE_TLS_" + "REJECT_UNAUTHORIZED",
    "insecure" + "HTTPParser",
    "check" + "ServerIdentity",
    "strict" + "SSL",
  ]) {
    if (contem(atalho)) achados.push(`atalho de TLS proibido na fonte: ${atalho}`);
  }

  /*
   * RESIDUO DE OAUTH (veto B, item 5). O Digai trocou OAuth por Bearer pronto, e o residuo volta do
   * mesmo jeito que o POST volta: alguem reaproveita um trecho antigo e a porta de escrita renasce.
   * Ate 16/09 NENHUM teste provava a remocao deles.
   */
  for (const residuo of ["client_" + "secret", "grant_" + "type", "oidc/" + "token"]) {
    if (contem(residuo)) achados.push(`residuo de OAuth na fonte: ${residuo}`);
  }

  /*
   * PROXY DE AMBIENTE (veto B, item 1). E o equivalente do `trust_env = False` do Python: com um
   * agente de proxy ligado, o HOST PINADO deixa de ser garantia e o Bearer de producao vai para o
   * proxy. Nada disso fica vermelho sozinho quando some, e por isso vira achado aqui.
   */
  /*
   * `setGlobalDispatcher` ENTROU NA LISTA (ressalva 1 da auditoria de 29/09), e ele e o nome que
   * mais importa dos quatro: um `setGlobalDispatcher(new EnvHttpProxyAgent())` escrito em OUTRO
   * arquivo derruba o host pinado DESTE modulo e entrega o Bearer de producao ao proxy, sem nada
   * aqui mudar. A inspecao le so a grade e o cliente, entao ela nao alcanca o `main.ts`: o nome
   * fica aqui para que um dia alguem que traga o despachante PARA CA seja acusado na hora, e para
   * que a lista diga em voz alta o que se procura numa varredura do backend inteiro (feita em
   * 29/09: zero ocorrencias).
   */
  for (const proxy of [
    "Proxy" + "Agent",
    "EnvHttp" + "Proxy" + "Agent",
    "HTTPS_" + "PROXY",
    "http_" + "proxy",
    "setGlobal" + "Dispatcher",
  ]) {
    if (contem(proxy)) achados.push(`proxy de ambiente na fonte: ${proxy}`);
  }

  // VERBO DE ESCRITA COMO DECLARACAO EXPOSTA.
  for (const verbo of VERBOS_DE_ESCRITA) {
    const rx = new RegExp(`(?:function|const|let|var|async)\\s+${verbo}\\b`, "i");
    if (rx.test(codigo)) achados.push(`porta de escrita declarada na fonte: ${verbo}`);
  }

  /*
   * A PORTA DE REDE E UMA SO. Duas saidas de rede significam uma que passa pela grade e outra que
   * nao, e a segunda e sempre a que alguem acrescentou com pressa. Zero e legitimo (um fonte que
   * nao toca a rede), entao o que se acusa e o EXCESSO, nunca a ausencia.
   */
  let portas = 0;
  for (const porta of PORTAS_DE_REDE) {
    portas += codigo.split(porta).length - 1;
  }
  if (portas > 1) {
    achados.push(`a fonte tem ${portas} portas de rede, e o ponto de saida e UNICO`);
  }

  return achados;
}

// ── O AUTOTESTE, ADVERSARIAL E SEM REDE ────────────────────────────────────────────────────────

/** Os bloqueios que a grade TEM de acusar. A lista e a do autoteste Python, sem podar. */
const BLOQUEAR: ReadonlyArray<readonly [string, string]> = [
  ["/api/v1/public/webhooks", "GET"],
  ["/api/v1/public/notification/webhooks", "POST"],
  ["/api/v1/public/screenings/abc/results", "POST"],
  ["/api/v1/public/screenings/abc/candidates/pre-signup", "POST"],
  ["/api/v1/public/screenings/abc", "DELETE"],
  ["/api/v1/public/screenings/abc", "PUT"],
  ["/api/v1/public/search", "GET"],
  ["/api/v1/public/lgpd/removecandidate", "GET"],
  ["/api/v1/public/screenings/abc/requirements", "GET"],
  ["/api/v1/public/screenings/abc/questions", "GET"],
  ["https://evil.invalido/api/v1/public/workspaces", "GET"],
  ["//evil.invalido/api/v1/public/workspaces", "GET"],
  ["/api/v1/private/admin/users", "GET"],
  ["/api/v1/public/screenings/abc/notifications", "POST"],
  ["/api/v1/public/screenings/../workspaces", "GET"],
  ["/api/v1/public/screenings/%2e%2e/results", "GET"],
  /*
   * OS TRES PATHS QUE O `seguranca` MEDIU NO VETO 1 (29/09). Cada um deles era autorizado pela
   * grade e REESCRITO pelo `new URL` do cliente, virando outro path na rede. Ficam aqui como caso
   * de bloqueio para que a regressao seja impossivel de passar despercebida.
   */
  ["/api/v1/public/screenings/sc1/users/./results", "GET"],
  ["/api/v2/public/screenings/./results", "GET"],
  ["/api/v1/public/workspaces/./screenings", "GET"],
  ["/api/v1/public/screenings/abc%2f..%2f..%2fadmin/results", "GET"],
  ["/api/v1/public/screenings/a%00b/results", "GET"],
  ["/api/v1/public/screenings/x#/results", "GET"],
  ["/api/v1/public/screenings/@evil.com/results", "GET"],
  ["/api/v1/public/screenings/a b/results", "GET"],
  ["/api/v1/public/screenings/a%2Fb/results", "GET"],
  [`/api/v1/public/screenings/${"a".repeat(65)}/results`, "GET"],
  ["/api/v2/public/screenings/sc1/results/u1/attempts", "GET"],
  // PII NA URL, e estes endpoints EXISTEM: o 401 deles ecoa o path.
  ["/api/v1/public/screenings/sc1/emails/joao@exemplo.invalido/results", "GET"],
  ["/api/v1/public/screenings/sc1/phone-numbers/11987654321/results", "GET"],
  ["/api/v1/public/screenings/sc1/partner-user-id/12345678900/results", "GET"],
  // PII COMO VALOR DE SEGMENTO (furo B4): o recurso e permitido, o id e que nao pode.
  ["/api/v1/public/screenings/sc1/users/12345678900/results", "GET"],
  ["/api/v1/public/screenings/sc1/users/123.456.789-00/results", "GET"],
  ["/api/v1/public/screenings/sc1/users/11987654321/results", "GET"],
  ["/api/v1/public/screenings/12345678900/results", "GET"],
];

/** As leituras legitimas. Grade que barra a funcao nao protege nada: ela so adia a descoberta. */
const PERMITIR: ReadonlyArray<readonly [string, string]> = [
  ["/api/v1/public/workspaces", "GET"],
  ["/api/v1/public/workspaces/ws1/screenings", "GET"],
  ["/api/v1/public/screenings", "GET"],
  ["/api/v1/public/screenings/sc1", "GET"],
  ["/api/v2/public/screenings/sc1/results", "GET"],
  ["/api/v1/public/screenings/sc1/candidates/pre-signup", "GET"],
  ["/api/v2/public/screenings/sc1/results/u1", "GET"],
  // Id UUID contendo 'add' (hexadecimal) NAO pode ser bloqueado: a denylist casa por SEGMENTO.
  ["/api/v2/public/screenings/6add1e2f-0000-4a00-8000-000000000000/results", "GET"],
  ["/api/v1/public/screenings/sc1/pre-sign-up", "GET"],
  ["/api/v2/public/screenings/sc1/pre-sign-up", "GET"],
  ["/api/v1/public/screenings/sc1/users/u1/results", "GET"],
  // O PONTO DENTRO DO ID CONTINUA VALENDO, e este caso existe para que a correcao do veto 1 nao
  // vire "barrar todo ponto": id com ponto e legitimo, e barra-lo empurraria quem constroi a
  // contornar a grade, que e o unico jeito de ela deixar de proteger.
  ["/api/v2/public/screenings/sc1.2/results", "GET"],
];

const PARAMS_BLOQUEAR: ReadonlyArray<Record<string, unknown>> = [
  { "a&b": "c" },
  { "a/b": "c" },
  { x: "a&b=c" },
  { x: "a/b" },
  { x: "a%2fb" },
  { x: "a?b" },
  { x: "a=b" },
  { "com espaco": "v" },
  { x: true },
  { x: null },
  { x: "z".repeat(65) },
  { x: "12345678900" },
  { x: "123.456.789-00" },
  { x: "joao@exemplo.invalido" },
  { "1x": "v" },
  { page: "1\n2" },
];

const PARAMS_PERMITIR: ReadonlyArray<Record<string, unknown> | null> = [
  null,
  {},
  { page: 1 },
  { limit: "50" },
  { status: "FINISHED" },
  { workspaceId: "ws-1.0_a" },
];

/**
 * ─ O AUTOTESTE: PROVA A TRAVA SEM REDE, E DEVOLVE OS FUROS ─────────────────────────────────────
 *
 * Lista vazia e a unica saida aceitavel. Ele nao imprime nada e nao loga nada: quem decide o que
 * fazer com os furos e quem chamou.
 *
 * ┌─ POR QUE ELE INSPECIONA A GRADE E O CLIENTE, e nao a pasta inteira ──────────────────────────┐
 * │ A regra "a porta de rede e UMA so" e uma afirmacao sobre quem TOCA A REDE, e quem toca a rede │
 * │ neste modulo sao exatamente estes dois arquivos. Estender a inspecao ao repositorio faria a   │
 * │ palavra `escrever` (que ali e escrita no NOSSO banco, sob RBAC e sob o expurgo) ser contada    │
 * │ como porta de escrita em terceiro, e a saida mais facil dali seria afrouxar o detector, que e  │
 * │ o contrario do que o veto 3 pediu. O fonte do modulo INTEIRO tem varredura propria, no         │
 * │ contrato do `tester`.                                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function autotesteDaGrade(): string[] {
  const furos: string[] = [];

  for (const [p, m] of BLOQUEAR) {
    try {
      autorizar(p, m);
      // O PATH NAO ENTRA NA MENSAGEM (veto C): um caso de bloqueio carrega justamente o valor
      // hostil, e o furo seria reportado publicando o que a grade existe para nao publicar.
      furos.push(`deixou passar um caso de bloqueio com o verbo ${m}`);
    } catch {
      // recusou, que e o esperado
    }
  }
  for (const [p, m] of PERMITIR) {
    try {
      const devolvido = autorizar(p, m);
      // O VETO C VIRA ASSERCAO AQUI: o que a grade autoriza e o que vai para a rede tem de ser a
      // MESMA string, e a unica forma de provar isso e comparar as duas.
      if (devolvido !== p) furos.push("a grade devolveu string diferente da autorizada");
    } catch {
      furos.push(`bloqueou leitura legitima: ${m} ${p}`);
    }
  }

  for (const pr of PARAMS_BLOQUEAR) {
    try {
      validarParams(pr);
      furos.push(`validarParams deixou passar: ${Object.keys(pr).join(",")}`);
    } catch {
      // recusou
    }
  }
  for (const pr of PARAMS_PERMITIR) {
    try {
      validarParams(pr);
    } catch {
      furos.push(`validarParams barrou uso legitimo: ${Object.keys(pr ?? {}).join(",")}`);
    }
  }

  // O HOST PINADO: https, dominio do fornecedor, e a URL montada nunca sai dele.
  if (!DIGAI_BASE_URL.startsWith("https://")) furos.push("host pinado nao e HTTPS");
  if (!DIGAI_BASE_URL.endsWith(".digai.ai")) furos.push("host pinado saiu do dominio do fornecedor");
  /*
   * ─ O INVARIANTE E CONFERIDO CONTRA O OBJETO `URL`, E ESSA E A CORRECAO DO VETO 1 ────────────
   *
   * Comparar so a string de `autorizar` era o ponto cego: a divergencia nao nascia na grade, e sim
   * no `new URL` do cliente, que normaliza dot-segments UMA LINHA DEPOIS. O autoteste agora faz o
   * MESMO que a rede faz, e exige que o resultado nao tenha mudado.
   */
  for (const caminho of [
    "/api/v1/public/workspaces",
    "/api/v2/public/screenings/sc1/results",
    "/api/v1/public/screenings/sc1/users/u1/results",
    "/api/v2/public/screenings/sc1.2/results",
  ]) {
    const url = montarUrlAutorizada(caminho, "GET");
    if (!url.startsWith(`${DIGAI_BASE_URL}/api/`)) furos.push("URL montada saiu do host pinado");
    const comoARedeVe = new URL(url);
    if (comoARedeVe.pathname !== caminho) {
      furos.push("o path AUTORIZADO nao sobrevive ao `new URL`: a rede executaria outro caminho");
    }
    if (comoARedeVe.origin !== DIGAI_BASE_URL) furos.push("o `new URL` saiu do host pinado");
  }

  // A INSPECAO CONTRA O FONTE REAL, e depois contra o fonte ADULTERADO (metade 2 do veto 3).
  const fonte = fonteDaRede();
  if (fonte === null) {
    furos.push("o fonte da grade e do cliente nao pode ser lido: a inspecao e fail-closed");
  } else {
    furos.push(...inspecionarFonte(fonte));
    /*
     * O ATAQUE E MONTADO EM PEDACOS, E ISSO NAO E ENFEITE: escrito inteiro, o literal
     * `function gravar` estaria no fonte DESTE arquivo, a inspecao o acharia e o autoteste
     * acusaria a si mesmo. Foi exatamente o que aconteceu na primeira versao, e o Python registra a
     * mesma armadilha no comentario dele.
     */
    const ataque =
      `export ${"func" + "tion"} ${"gra" + "var"}(p: string, corpo: unknown)` +
      ` { return ${"fet" + "ch"}(p, { method: "PO" + "ST", body: corpo }); }`;
    const injetado = `${fonte}\n\n${ataque}\n`;
    if (inspecionarFonte(injetado).length === 0) {
      furos.push("a inspecao de fonte NAO detecta porta de escrita injetada");
    }
  }

  return furos;
}

/**
 * O FONTE DOS DOIS ARQUIVOS QUE TOCAM A REDE. `null` quando nao da para ler, e `null` vira FURO.
 *
 * A extensao varia com o ambiente (`.ts` sob o runner, `.js` no build), e o fail-closed vale para os
 * dois: uma inspecao que devolve "limpo" porque nao achou o arquivo e a decoracao do veto 3 voltando
 * pela terceira porta.
 */
function fonteDaRede(): string | null {
  const pedacos: string[] = [];
  for (const base of ["digai-grade", "digai.cliente"]) {
    let lido: string | null = null;
    for (const ext of [".ts", ".js"]) {
      try {
        lido = readFileSync(join(__dirname, `${base}${ext}`), "utf8");
        break;
      } catch {
        // tenta a proxima extensao
      }
    }
    if (lido === null) return null;
    pedacos.push(lido);
  }
  return pedacos.join("\n");
}
