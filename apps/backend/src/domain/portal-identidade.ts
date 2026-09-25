import { sign, verify, type KeyObject } from "node:crypto";
// SÓ O TIPO, e só para provar em tempo de compilação que os motivos do link morto são códigos do
// catálogo da trilha. Import de tipo não cria dependência em tempo de execução nem ciclo.
import type { PortalMotivo } from "./portal-evento";

/**
 * PORTAL, CAMADA DE IDENTIDADE: os DOIS bilhetes e a decisão que os separa do candidato.
 *
 * Fonte: `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md`, decisões 2 (prazo de 72 horas), 3 (o link
 * NÃO é de uso único), 4 (revogação), 5 (5 tentativas em 15 minutos) e 10 (segredo próprio), mais
 * o item L6 da seção 9 (o motivo da falha de identificação é SEMPRE `NAO_CASOU`).
 *
 * ┌─ POR QUE ESTE ARQUIVO É SÓ FUNÇÃO PURA ────────────────────────────────────────────────────┐
 * │ Ele é a única coisa entre um link que anda pelo WhatsApp e a trilha documental de uma       │
 * │ pessoa. Sem banco, sem relógio implícito e sem ambiente, cada régua daqui é provável em     │
 * │ teste sem `.env` e sem Postgres, e é isso que permite varrer as 32 combinações da decisão   │
 * │ em vez de confiar nos três caminhos que alguém lembrou de exercitar.                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ══ DOIS BILHETES, DUAS CHAVES, E A SEGUNDA CHAVE É O PONTO ════════════════════════════════════
 *
 * O LINK (`typ: "portal-link"`, 72 horas) e a SESSÃO (`typ: "portal"`, 30 minutos) têm a MESMA
 * forma: JWS compacto, Ed25519, no molde já provado em produção por `vt-coleta/vt-link-token.ts` e
 * repetido em `portal/portal-bilhete.ts`. O que os distingue no papel é um claim, o `typ`.
 *
 * E UM CLAIM É POUCO PARA SEPARAR 72 HORAS DE 30 MINUTOS. Por isso o par de chaves do LINK
 * (`PORTAL_LINK_*`) é SEPARADO do par da SESSÃO (`PORTAL_SESSION_*`): no dia em que a checagem de
 * `typ` cair numa refatoração, com chave compartilhada um link de 72 horas passa a valer como
 * sessão de 72 horas e NADA falha, nem teste nem produção. Com chaves distintas, o mesmo descuido
 * dá assinatura inválida, que é um erro barulhento. A checagem de `typ` continua existindo nos dois
 * verificadores; a chave separada é a rede embaixo dela.
 *
 * A RECUSA DE ALGORITMO VEM ANTES DA CONTA DA ASSINATURA, e a ordem é a defesa: com chave pública
 * em circulação, verificar sem FIXAR o algoritmo aceita um bilhete forjado com HMAC sobre a própria
 * chave pública. Mesma régua do `PortalSessaoGuard` e do `verificarBilhete`.
 *
 * §A.6, veto V5: NENHUM dos dois bilhetes carrega CPF, nome ou data de nascimento. O token do link
 * do VT carrega (`ClaimsTokenVt`), porque o app externo depende disso, e foi exatamente esse
 * precedente que o parecer proibiu repetir aqui: este bilhete mora no armazenamento do navegador de
 * um celular que anda na rua. O que amarra tudo é a admissão mais o `jti` do link.
 *
 * Este arquivo não loga nada, e não pode: os dois bilhetes SÃO credencial.
 */

/** Tamanho exato de uma assinatura Ed25519. Ver o comentário em `verificarLink`. */
const TAMANHO_ASSINATURA_ED25519 = 64;

/** O único algoritmo aceito, nos dois sentidos. Conferido antes de qualquer conta. */
const ALG = "EdDSA";

/** Cabeçalho fixo do JWS. `EdDSA` = Ed25519. */
const CABECALHO = { alg: ALG, typ: "JWT" } as const;

/** Discriminador do bilhete do LINK. */
export const TIPO_LINK = "portal-link";

/** Discriminador do bilhete da SESSÃO. É o que o `PortalSessaoGuard` exige. */
export const TIPO_SESSAO = "portal";

/** Decisão 2 do documento de regras. */
export const PORTAL_LINK_TTL_HORAS = 72;

/** Vida da sessão do candidato: tempo de enviar os documentos, não mais que isso. */
export const PORTAL_SESSAO_TTL_MINUTOS = 30;

/** Claims do bilhete do LINK. Lista FECHADA, e o teste de PII varre exatamente isto. */
export interface ClaimsLinkPortal {
  /** id da admissão. */
  sub: string;
  /** id da LINHA em `portal_links`, que é o que torna a revogação possível. */
  jti: string;
  typ: typeof TIPO_LINK;
  iat: number;
  exp: number;
}

/** Claims do bilhete da SESSÃO. Mesma lista, outro `typ`. */
export interface ClaimsSessaoPortal {
  sub: string;
  /** `jti` do LINK que originou a sessão. É a chave da cota de arquivos. */
  jti: string;
  typ: typeof TIPO_SESSAO;
  iat: number;
  exp: number;
}

/** Motivos de recusa do verificador do link. Técnicos, e nenhum deles fala de CPF. */
export type MotivoRecusaLink = "FORMATO" | "ALG" | "ASSINATURA" | "TIPO" | "EXPIRADO";

export type VerificacaoDoLink =
  | { ok: true; admissaoId: string; jti: string; expMs: number }
  | { ok: false; motivo: MotivoRecusaLink };

function b64urlDeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function assinar(payload: unknown, chavePrivada: KeyObject): string {
  const entrada = `${b64urlDeJson(CABECALHO)}.${b64urlDeJson(payload)}`;
  return `${entrada}.${sign(null, Buffer.from(entrada, "utf8"), chavePrivada).toString("base64url")}`;
}

/**
 * Cunha o bilhete do LINK. `agoraMs` é injetável para teste determinístico, e `jti` vem de FORA de
 * propósito: quem o sorteia é quem grava a LINHA, e o bilhete tem de levar o id daquela linha. Um
 * `jti` sorteado aqui dentro daria um bilhete que aponta para uma linha que não existe.
 */
export function cunharLink(
  dados: { admissaoId: string; jti: string; agoraMs: number; ttlHoras: number },
  chavePrivada: KeyObject,
): string {
  const iat = Math.floor(dados.agoraMs / 1000);
  const claims: ClaimsLinkPortal = {
    sub: dados.admissaoId,
    jti: dados.jti,
    typ: TIPO_LINK,
    iat,
    exp: iat + Math.round(dados.ttlHoras * 3600),
  };
  return assinar(claims, chavePrivada);
}

/**
 * Cunha o bilhete da SESSÃO, que é o par do que o `PortalSessaoGuard` já verifica em produção.
 *
 * O `jti` é o DO LINK, e ele vem do TOKEN que o candidato apresentou, nunca do corpo do pedido: é
 * por ele que a cota de 25 arquivos e 60 MB é contada, e deixar o cliente escolhê-lo faria a cota
 * nunca se esgotar.
 */
export function cunharSessao(
  dados: { admissaoId: string; jti: string; agoraMs: number; ttlMinutos: number },
  chavePrivada: KeyObject,
): string {
  const iat = Math.floor(dados.agoraMs / 1000);
  const claims: ClaimsSessaoPortal = {
    sub: dados.admissaoId,
    jti: dados.jti,
    typ: TIPO_SESSAO,
    iat,
    exp: iat + Math.round(dados.ttlMinutos * 60),
  };
  return assinar(claims, chavePrivada);
}

/**
 * Confere o bilhete do LINK: formato, ALGORITMO, assinatura, TIPO e prazo, nesta ordem.
 *
 * DEVOLVE VEREDITO, NÃO LANÇA, e a diferença importa no chamador: a rota de identificação precisa
 * contar a tentativa e registrar a trilha ANTES de responder, e um `throw` aqui empurraria essa
 * decisão para um `catch` genérico, onde ela se perde.
 *
 * O `exp` DAQUI NÃO É A AUTORIDADE DO PRAZO. Quem manda é `expira_em` da LINHA em `portal_links`:
 * um bilhete é auto-suficiente e imutável, então sem a linha não há como encurtar o prazo de um
 * link já entregue nem revogá-lo. Este `exp` é o teto barato, conferido antes de tocar o banco.
 */
export function verificarLink(
  token: string,
  chavePublica: KeyObject,
  agoraMs: number,
): VerificacaoDoLink {
  const partes = token.split(".");
  if (partes.length !== 3) return { ok: false, motivo: "FORMATO" };
  const [cabecalhoB64, payloadB64, assinaturaB64] = partes;

  let cabecalho: { alg?: unknown };
  try {
    cabecalho = JSON.parse(Buffer.from(cabecalhoB64, "base64url").toString("utf8")) as {
      alg?: unknown;
    };
  } catch {
    return { ok: false, motivo: "FORMATO" };
  }
  if (typeof cabecalho !== "object" || cabecalho === null) return { ok: false, motivo: "FORMATO" };
  // A FIXAÇÃO DO ALGORITMO, e ela vem ANTES da conta da assinatura de propósito (confusão de
  // algoritmo). `alg` ausente cai aqui junto com `none`, `HS256` e o resto.
  if (cabecalho.alg !== ALG) return { ok: false, motivo: "ALG" };

  // ── A ASSINATURA, E A CODIFICAÇÃO DELA TAMBÉM ────────────────────────────────────────────────
  //
  // MEDIDO, e é um detalhe que parece pedantismo até se olhar o número: uma assinatura Ed25519 tem
  // 64 bytes, que em base64url ocupam 86 caracteres e carregam 516 bits de espaço para 512 bits de
  // dado. Sobram QUATRO BITS DE FOLGA no último caractere, e o decodificador do Node simplesmente
  // os ignora. Trocar o último caractere de `A` para `B` produz um token DIFERENTE que decodifica
  // para os MESMOS 64 bytes, e a verificação passa.
  //
  // Na prática isso é maleabilidade de codificação: o mesmo bilhete tem várias grafias válidas. Ele
  // não forja assinatura nenhuma (os bytes continuam sendo os que a chave privada produziu), mas
  // quebra qualquer coisa que use a STRING do token como identidade, e é o tipo de frouxidão que
  // encontra uma consequência anos depois. Aqui o tamanho é conferido e a grafia é exigida
  // CANÔNICA: reencodar os bytes tem de devolver exatamente o que veio.
  const assinatura = Buffer.from(assinaturaB64, "base64url");
  if (assinatura.length !== TAMANHO_ASSINATURA_ED25519) return { ok: false, motivo: "ASSINATURA" };
  if (assinatura.toString("base64url") !== assinaturaB64) return { ok: false, motivo: "ASSINATURA" };

  const entrada = `${cabecalhoB64}.${payloadB64}`;
  if (!verify(null, Buffer.from(entrada, "utf8"), chavePublica, assinatura)) {
    return { ok: false, motivo: "ASSINATURA" };
  }

  let payload: Partial<ClaimsLinkPortal>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<ClaimsLinkPortal>;
  } catch {
    return { ok: false, motivo: "FORMATO" };
  }
  if (typeof payload !== "object" || payload === null) return { ok: false, motivo: "FORMATO" };
  // O TIPO. Sem esta linha, a sessão de 30 minutos serviria de link e o link de 72 horas serviria
  // de sessão, com a assinatura fechando nos dois casos se um dia as chaves voltarem a ser uma só.
  if (payload.typ !== TIPO_LINK) return { ok: false, motivo: "TIPO" };
  if (typeof payload.sub !== "string" || !payload.sub) return { ok: false, motivo: "FORMATO" };
  if (typeof payload.jti !== "string" || !payload.jti) return { ok: false, motivo: "FORMATO" };
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= agoraMs) {
    return { ok: false, motivo: "EXPIRADO" };
  }

  return { ok: true, admissaoId: payload.sub, jti: payload.jti, expMs: payload.exp * 1000 };
}

/** Códigos de recusa da identificação. Todos de catálogo, nenhum deles nomeia metade nenhuma. */
export type MotivoDaIdentificacao = "BLOQUEADO" | "LINK_MORTO" | "NAO_CASOU";

export interface EntradaDaIdentificacao {
  /** Existe linha em `portal_links` para este `jti`. */
  linkVivo: boolean;
  revogado: boolean;
  expirado: boolean;
  /** CPF **e** data de nascimento casaram com o candidato DA ADMISSÃO DO LINK. */
  casou: boolean;
  bloqueado: boolean;
}

export interface DecisaoDaIdentificacao {
  ok: boolean;
  motivoCodigo: MotivoDaIdentificacao | null;
}

/**
 * A DECISÃO, E A ORDEM DAS PERGUNTAS É A REGRA DE SEGURANÇA.
 *
 * 1. BLOQUEADO VENCE TUDO, inclusive o casamento certo. Se quem está bloqueado e acerta o CPF
 *    recebesse resposta diferente de quem está bloqueado e erra, o teto de tentativas viraria o
 *    próprio oráculo que ele existe para fechar.
 * 2. LINK MORTO vence o casamento, e revogado, expirado e inexistente colapsam no MESMO código.
 *    Separá-los diria a quem tem um link vencido se o CPF que ele digitou existe, que é o oráculo
 *    voltando pela porta de trás, fora do alcance da decisão 5.
 * 3. Só então o casamento, com UM código só (`NAO_CASOU`, item L6): "este CPF não existe" e "a data
 *    está errada" são a mesma resposta, sempre.
 *
 * Recusa SEMPRE tem código, e sucesso NUNCA tem: recusa sem código é log mudo, e é do log que a
 * Sala De Segurança tira o que aconteceu.
 */
export function decisaoDaIdentificacao(entrada: EntradaDaIdentificacao): DecisaoDaIdentificacao {
  if (entrada.bloqueado) return { ok: false, motivoCodigo: "BLOQUEADO" };
  if (!entrada.linkVivo || entrada.revogado || entrada.expirado) {
    return { ok: false, motivoCodigo: "LINK_MORTO" };
  }
  if (!entrada.casou) return { ok: false, motivoCodigo: "NAO_CASOU" };
  return { ok: true, motivoCodigo: null };
}

/**
 * O PRAZO DA SESSÃO É O MENOR ENTRE OS DOIS, e este é o furo que a auditoria prévia achou ANTES de
 * existir código: sessão de 30 minutos emitida contra um link que vence em 5 sobrevive 25 minutos
 * ao próprio link, e nesse intervalo o candidato continua escrevendo no armazenamento.
 *
 * Devolve MINUTOS, que é a unidade que `cunharSessao` recebe, e nunca menos que zero.
 */
export function minutosDaSessao(agoraMs: number, expDoLinkMs: number, tetoMinutos: number): number {
  const restamMinutos = (expDoLinkMs - agoraMs) / 60_000;
  return Math.max(0, Math.min(tetoMinutos, restamMinutos));
}

export interface EstadoDaLinhaDoLink {
  existe: boolean;
  revogado: boolean;
  /**
   * Vencida, suspensa OU BLOQUEADA À MÃO. As três matam o link, e para o CANDIDATO elas são a
   * mesma coisa: uma frase só, sem dizer qual das três, que é como se evita dar a ele um oráculo
   * sobre o próprio bloqueio. Quem precisa distinguir é o CONSULTOR, e ele olha o painel.
   */
  expirado: boolean;
  /** Bloqueio MANUAL e reversível, decidido pelo time. Separado para a trilha e para o painel. */
  bloqueado: boolean;
  /**
   * Suspensão do bloqueio PROGRESSIVO, que tem data de fim e passa sozinha. Ela entra em
   * `expirado` como sempre entrou (para o candidato as três são a mesma frase); o campo próprio
   * existe porque a TRILHA precisa nomeá-la, e nomear é o que a `motivoDoLinkMorto` faz.
   */
  suspenso: boolean;
  vivo: boolean;
  expiraEmMs: number | null;
  motivoCodigo: MotivoDoLinkMorto | null;
}

/**
 * OS QUATRO MOTIVOS DE UM LINK MORTO, e todos são código de CATÁLOGO (`PORTAL_MOTIVOS`).
 *
 * A linha de baixo não é decoração: `montarEventoPortal` DESCARTA em silêncio o código que não
 * esteja no catálogo, e o evento chega à Sala De Segurança dizendo que recusou sem dizer por quê
 * (a cicatriz do `TENTATIVAS_ESGOTADAS`). Com a checagem de tipo, um motivo novo escrito aqui e
 * esquecido lá para de COMPILAR, em vez de virar `motivo_codigo` nulo em produção.
 */
export type MotivoDoLinkMorto = "REVOGADO_MANUAL" | "LINK_BLOQUEADO" | "SUSPENSO" | "EXPIRADA";
const _motivosSaoDeCatalogo: PortalMotivo = null as unknown as MotivoDoLinkMorto;
void _motivosSaoDeCatalogo;

/**
 * ══ POR QUE UM LINK MORTO MORREU, EM UMA FUNÇÃO PURA SÓ (achado S28) ═════════════════════════
 *
 * ┌─ O DEFEITO QUE ISTO FECHA ──────────────────────────────────────────────────────────────────┐
 * │ `PortalLinkVivoService` gravava na trilha `motivoCodigo: "EXPIRADA"` FIXO, em toda recusa.   │
 * │ Link REVOGADO, BLOQUEADO à mão ou SUSPENSO pelo teto chegavam à Sala De Segurança como       │
 * │ "expirada", e quem lê o log não tinha como saber que alguém tinha fechado aquela porta de    │
 * │ propósito. §A.6 não era violado (só `jti` e código); o que se perdia era FIDELIDADE, e       │
 * │ trilha que descreve errado é pior que trilha ausente, porque é lida como verdade.            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELA É PURA E MORA NO DOMÍNIO, ao lado de `estadoDaLinha`, e não num `switch` dentro do serviço:
 * quem decide "o link está vivo?" já é uma função só, e o motivo tem de morar na mesma casa. Régua
 * escrita no serviço seria a segunda verdade sobre o mesmo estado, e a divergência apareceria como
 * "a porta A diz revogado e a porta B diz expirada" sobre o MESMO link.
 *
 * A PRECEDÊNCIA É REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO, a mesma do painel
 * (`estadoDoLinkNoPainel`), e ela responde "o que se faz agora": revogado não volta (emita outro),
 * bloqueado volta por botão, suspenso passa sozinho, vencido se resolve reemitindo. Um link pode
 * estar nos quatro ao mesmo tempo, e dizer o mais fraco mandaria o consultor reemitir um link que
 * ele mesmo matou.
 *
 * LINHA AUSENTE É REVOGAÇÃO, e não um quinto código: um bilhete que fecha assinatura e não tem
 * linha é uma linha que sumiu, não um forjado (a chave privada não saiu daqui).
 *
 * VIVO NÃO TEM MOTIVO: recusa sempre tem código, sucesso nunca tem.
 */
export function motivoDoLinkMorto(estado: {
  existe: boolean;
  revogado: boolean;
  bloqueado: boolean;
  suspenso: boolean;
  vivo: boolean;
}): MotivoDoLinkMorto | null {
  if (estado.vivo) return null;
  if (!estado.existe || estado.revogado) return "REVOGADO_MANUAL";
  if (estado.bloqueado) return "LINK_BLOQUEADO";
  if (estado.suspenso) return "SUSPENSO";
  return "EXPIRADA";
}

/**
 * Lê o estado da linha. FUNÇÃO SEPARADA de propósito: ela é pura, e é a régua que decide se a
 * sessão nasce, se a credencial é emitida e se a confirmação passa. Os três precisam da MESMA
 * resposta, e uma régua repetida em três lugares diverge no primeiro ajuste.
 *
 * LINHA AUSENTE É LINK MORTO, e nunca "link sem restrição": é a direção segura, e é o que faz um
 * bilhete assinado cuja linha foi apagada parar de valer.
 */
export function estadoDaLinha(
  // OS CAMPOS SÃO OPCIONAIS DE PROPÓSITO, e a comparação abaixo é com `!= null` em vez de
  // `!== null`. Uma projeção que não peça `suspenso_ate` devolve `undefined`, não `null`, e a
  // comparação estrita transformaria a coluna ausente em "suspensão ativa", ou seja, em portal
  // fechado por um campo que ninguém pediu.
  // A CONTRAPARTIDA DESSA ESCOLHA: coluna não projetada vira "sem restrição", e uma restrição
  // nova esquecida numa das leituras deixa AQUELA porta aberta sem nada falhar. A trava contra
  // isso é `portal/portal-link-colunas.ts`, a projeção única que as cinco leituras espalham.
  linha:
    | {
        expiraEm?: Date | null;
        revogadoEm?: Date | null;
        suspensoAte?: Date | null;
        bloqueadoEm?: Date | null;
      }
    | undefined
    | null,
  agoraMs: number,
): EstadoDaLinhaDoLink {
  if (!linha) {
    const ausente = {
      existe: false,
      revogado: false,
      expirado: false,
      bloqueado: false,
      suspenso: false,
      vivo: false,
    };
    return {
      ...ausente,
      expiraEmMs: null,
      // Um bilhete que fecha assinatura e não tem linha é uma linha que sumiu, não um forjado: a
      // chave privada não saiu daqui. Para a trilha, isso é uma revogação que aconteceu, e quem
      // diz isso é a MESMA função que nomeia os outros três motivos.
      motivoCodigo: motivoDoLinkMorto(ausente),
    };
  }
  const revogado = linha.revogadoEm != null && linha.revogadoEm.getTime() <= agoraMs;
  // PRAZO AUSENTE É LINK VENCIDO, nunca link eterno: linha sem `expira_em` é dado quebrado, e a
  // direção segura para dado quebrado é fechar.
  const vencido = linha.expiraEm == null || linha.expiraEm.getTime() <= agoraMs;
  const suspenso = linha.suspensoAte != null && linha.suspensoAte.getTime() > agoraMs;
  /**
   * O BLOQUEIO MANUAL MORA AQUI DENTRO, e não em cada porta.
   *
   * Posto no painel ou no controller, ele valeria só onde alguém lembrasse de perguntar, e a
   * pergunta que importa ("o link está vivo?") já tem UM dono, que é esta função: são QUATRO
   * leituras chamando-a (identificação, emissão de credencial, confirmação do envio e leitura das
   * pendências), mais o painel. Escrever a régua fora dela é criar a segunda verdade sobre o
   * estado do link, e a divergência seria "a emissão recusa e a confirmação aceita".
   *
   * NÃO TEM DATA DE FIM, ao contrário da suspensão: ele acaba quando uma pessoa decide.
   */
  const bloqueado = linha.bloqueadoEm != null && linha.bloqueadoEm.getTime() <= agoraMs;
  // SUSPENSO E BLOQUEADO ENTRAM COMO EXPIRADO, e não como estados à parte, porque para fora os
  // três são idênticos por exigência (a mensagem é uma só) e porque `decisaoDaIdentificacao` já
  // colapsa revogado, expirado e inexistente no mesmo código. É isso que faz o bloqueio valer nas
  // quatro portas sem tocar em nenhuma delas.
  const expirado = vencido || suspenso || bloqueado;
  const estado = {
    existe: true,
    revogado,
    expirado,
    bloqueado,
    suspenso,
    vivo: !revogado && !expirado,
  };
  return {
    ...estado,
    expiraEmMs: linha.expiraEm?.getTime() ?? null,
    // O MOTIVO SAI DE `motivoDoLinkMorto`, e não de um ternário escrito aqui: é lá que a
    // precedência (REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO) está documentada e provada.
    motivoCodigo: motivoDoLinkMorto(estado),
  };
}
