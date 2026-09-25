import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { LIMITES_PORTAL } from "../domain/portal-credencial";

/**
 * O BILHETE DE TROCA DO PORTAL: o que o EA manda ao EMISSOR para receber de volta uma URL assinada.
 *
 * POR QUE ELE EXISTE. A chave privada RSA que assinava a URL V4 sai do EA. Quem assina passa a ser um
 * emissor com identidade de runtime no nosso projeto do Google, e o EA passa a guardar UM segredo só,
 * a chave privada Ed25519 daqui. O ganho não é "zero segredo", é rebaixamento de poder.
 *
 * E O REBAIXAMENTO PRECISA SER DITO COM EXATIDÃO, PORQUE A VERSÃO CONFORTÁVEL DELE É FALSA. Esta
 * chave cunha bilhete para os QUATRO destinos, `apagar` inclusive: ela é UMA chave, e o destino é só
 * um claim que ela assina. Quem a roubar pode, dentro do que cada identidade do emissor permitir,
 * pedir escrita de um objeto E pedir a remoção de um objeto cujo nome conheça. O que ela NÃO compra,
 * e é isto que sobrou de verdade em relação à chave RSA de antes: não assina método arbitrário, não
 * alcança caminho arbitrário do balde, não escolhe tipo, teto de bytes, prazo nem sobrescrita (o
 * emissor reimpõe os quatro), não lê e não lista, e se desliga apagando a chave pública do emissor
 * em vez de rotacionar segredo e reimplantar.
 *
 * A SEGUNDA CHAVE, uma para escrita e outra para curadoria, fecharia o que sobrou. Ela fica
 * PROPOSTA E NÃO CONSTRUÍDA (§A.31), para quando o emissor existir: hoje não há emissor para
 * distribuir a segunda chave pública, e criar duas agora seria gerir rotação de uma chave que
 * ninguém verifica.
 *
 * QUEM ESCOLHE O QUÊ, e esta é a condição B1 do parecer, decidida pelo coordenador. O EA escolhe o
 * MÉTODO, o NOME DO OBJETO e os TRÊS CABEÇALHOS que entram na assinatura, e os três viajam DENTRO
 * deste bilhete assinado. O emissor monta apenas o que depende da identidade dele e que o EA não tem
 * como saber (a credencial de assinatura, a data e a região), e NÃO PODE acrescentar, remover nem
 * reordenar cabeçalho. Ele CONFERE o que veio contra a régua dele e RECUSA; nunca completa em
 * silêncio. Um emissor que remonte a string canônica está vetado por B1; um que assine sem conferir
 * está vetado pelo desenho, porque aí a chave só teria mudado de nome.
 *
 * O CONTRATO DA RESPOSTA, que o emissor tem de cumprir e que o EA CONFERE em
 * `portal-emissor.service.ts`. Ele não é opcional e não é tolerado pela metade:
 *   - `assinar-escrita` devolve `url`, `cabecalhos` e `expiraEm`. A `url` tem de ser `https`, do
 *     armazenamento do Google, do BALDE e do OBJETO que vieram no bilhete; os `cabecalhos` têm de
 *     ser exatamente os de `hdr`, sem acrescentar, remover nem reordenar (veto V6 e condição B1).
 *   - `metadado` ECOA o objeto consultado, no campo `objeto`, além de `existe`, `bytes`,
 *     `contentType` e `geracao`. Eco ausente ou diferente é RECUSA. Sem o eco, a conferência de
 *     objeto divergente de `domain/portal-chegada.ts` vira tautologia, porque o EA estaria
 *     comparando o nome com ele mesmo, e um emissor que responda sobre outro objeto confirmaria uma
 *     chegada que não houve.
 *   - `corrigir-tipo` e `apagar` devolvem `ok` booleano. Nada de `ok` verdadeiro é falha.
 *
 * ZERO DADO PESSOAL, E ISSO É O QUE PERMITE O BILHETE ATRAVESSAR UM TERCEIRO. Nenhum claim carrega
 * CPF, nome, e-mail, data de nascimento nem id de candidato. O nome do objeto já chega opaco (hash da
 * admissão com pepper, ver `portal-objeto.ts`), e o emissor não precisa saber de quem é o arquivo.
 * É a diferença deliberada em relação ao token do link do VT, que carrega CPF e nome porque o app
 * externo depende deles.
 *
 * A FORMA É COPIADA DE `vt-coleta/vt-link-token.ts`, SEM IMPORTAR E SEM ALTERAR AQUELE ARQUIVO
 * (§A.26). Ele é produção validada do VT, de outra frente, e extrair dali um módulo compartilhado
 * para economizar trinta linhas mexeria em código já aprovado. A duplicação é deliberada e fica
 * escrita aqui. O que se reusa é a forma provada: JWS compacto no molde de um JWT, cabeçalho com o
 * algoritmo, carregador de chave privada em base64, assinatura e verificação nativas do Node, e a
 * RECUSA EXPLÍCITA de algoritmo inesperado, que é a defesa contra confusão de algoritmo.
 *
 * §A.6: este arquivo não loga nada. O bilhete É uma credencial, então ele não é persistido, não é
 * logado e não volta em mensagem de erro.
 */

/** Prazo do bilhete. Curto por construção: a única viagem que ele faz é do EA ao emissor. */
export const BILHETE_TTL_SEGUNDOS = 60;

/**
 * O TETO DOS DEZ MINUTOS, IMPOSTO AQUI E NÃO COMBINADO COM QUEM CHAMA (condição B4).
 *
 * O furo que este teto fecha é o mais sutil da frente. O emissor é SEM ESTADO e confere o bilhete
 * offline, então o mesmo bilhete pode ser trocado por mais de uma URL: quem o guardou pede uma URL
 * nova depois de a primeira expirar, quantas vezes quiser, até o BILHETE vencer. O prazo efetivo da
 * credencial deixa de ser o da URL e passa a ser o do bilhete, e um prazo de horas (copiado por
 * distração do token de SESSÃO do candidato, por exemplo) vira uma credencial de horas SEM QUE NADA
 * FALHE. Por isso o teto mora no código que cunha, e não na disciplina de quem chama: nenhum
 * instante que viaje dentro do bilhete passa de `LIMITES_PORTAL.TTL_MS` contado da emissão.
 *
 * Uso único de verdade é impossível sem estado no emissor, e é honesto dizer isso: o que se compra
 * é um TETO DE TEMPO CURTO, não uso único. Com dez minutos e a cota já debitada na emissão, o
 * resíduo é aceitável.
 */
export const BILHETE_TETO_SEGUNDOS = Math.floor(LIMITES_PORTAL.TTL_MS / 1000);

/**
 * Os quatro destinos, fechados. O destino entra na assinatura, então bilhete de escrita NÃO serve
 * para apagar: são rotas diferentes e identidades diferentes no emissor (condições B2 e B3).
 */
export const BILHETE_DESTINOS = ["assinar-escrita", "metadado", "corrigir-tipo", "apagar"] as const;

export type BilheteDestino = (typeof BILHETE_DESTINOS)[number];

/**
 * A ORDEM CANÔNICA DOS CABEÇALHOS: tipo de conteúdo, faixa de tamanho, trava de geração.
 *
 * Ela é fixada aqui, e não deixada ao acaso da ordem de inserção do objeto, porque o emissor confere
 * a ordem e recusa quando ela difere. Qualquer cabeçalho fora desta lista vem depois, em ordem
 * alfabética, que é o caso da correção de tipo (origem da cópia e diretiva de metadado).
 */
export const ORDEM_CANONICA_CABECALHOS = [
  "content-type",
  "x-goog-content-length-range",
  "x-goog-if-generation-match",
] as const;

/** Cabeçalho do JWS. `EdDSA` = Ed25519. O `kid` é opcional e serve à rotação sem janela. */
export interface CabecalhoBilhete {
  alg: "EdDSA";
  typ: "JWT";
  kid?: string;
}

/**
 * OS CLAIMS DO BILHETE, E A LISTA É FECHADA. Contrato compartilhado com o emissor, que vive fora
 * deste repositório: divergência aqui não quebra teste nenhum, quebra no primeiro envio real.
 */
export interface ClaimsBilhete {
  /** Destino, que é a rota e a identidade do emissor. */
  dst: BilheteDestino;
  /** Nome do balde. */
  bkt: string;
  /** Nome do objeto, já opaco, escolhido pelo EA. */
  obj: string;
  /** Método a assinar. */
  mtd: string;
  /** Os cabeçalhos que entram na assinatura, escolhidos pelo EA, na ordem canônica. */
  hdr: Record<string, string>;
  /** Prazo pedido para a URL, em segundos. O emissor pode reduzir, nunca aumentar. */
  ttl: number;
  /** Prazo ABSOLUTO da credencial, em epoch de segundos (condição B4). */
  abs: number;
  /** Identificador único do bilhete. */
  jti: string;
  /** Emitido em (epoch, segundos). */
  iat: number;
  /** Expira em (epoch, segundos), sempre `iat` + 60. */
  exp: number;
}

/**
 * Os nomes dos claims, para o teste que afirma que nada além disto atravessa. Um claim novo que
 * alguém acrescente sem atualizar esta lista reprova no teste, que é o ponto.
 */
export const CLAIMS_DO_BILHETE = [
  "dst",
  "bkt",
  "obj",
  "mtd",
  "hdr",
  "ttl",
  "abs",
  "jti",
  "iat",
  "exp",
] as const;

/** O que o chamador informa. Emissão, expiração e identificador são postos aqui dentro. */
export interface DadosBilhete {
  destino: BilheteDestino;
  bucket: string;
  objeto: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  ttlSegundos: number;
  /** Prazo absoluto da credencial, em epoch de SEGUNDOS. */
  absEpoch: number;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDeJson(obj: unknown): string {
  return base64url(Buffer.from(JSON.stringify(obj), "utf8"));
}

/**
 * Põe os cabeçalhos na ordem canônica: primeiro os três da régua, na ordem fixa, depois o resto em
 * ordem alfabética. Os nomes vão em minúsculas, que é como a assinatura V4 os canoniza.
 */
export function ordenarCabecalhos(cabecalhos: Record<string, string>): Record<string, string> {
  const normalizados = new Map<string, string>();
  for (const [nome, valor] of Object.entries(cabecalhos)) {
    normalizados.set(nome.toLowerCase(), String(valor).trim().replace(/\s+/g, " "));
  }
  const ordenado: Record<string, string> = {};
  for (const nome of ORDEM_CANONICA_CABECALHOS) {
    const valor = normalizados.get(nome);
    if (valor !== undefined) {
      ordenado[nome] = valor;
      normalizados.delete(nome);
    }
  }
  for (const nome of [...normalizados.keys()].sort()) {
    ordenado[nome] = normalizados.get(nome) as string;
  }
  return ordenado;
}

/**
 * Importa a chave privada Ed25519 a partir do valor da env `PORTAL_EMISSOR_BILHETE_PRIVATE_KEY`: um
 * PEM PKCS8 codificado em base64, para caber numa linha só do arquivo de ambiente (mesmo formato de
 * `VT_LINK_PRIVATE_KEY`).
 *
 * DEVOLVE `null` QUANDO A ENV ESTÁ AUSENTE OU VAZIA, E NUNCA LANÇA NO BOOT. O módulo do Portal sobe
 * INERTE: sem emissor configurado as rotas se recusam a emitir, no mesmo molde do webhook do Pandapé,
 * que nasce fechado e sem hardcode. Valor presente e ilegível também devolve `null`, porque um erro
 * de formato numa variável de ambiente não pode derrubar o serviço inteiro.
 */
export function carregarChavePrivadaBilhete(privateKeyBase64: string | undefined | null): KeyObject | null {
  const b64 = (privateKeyBase64 ?? "").trim();
  if (!b64) return null;
  try {
    const pem = Buffer.from(b64, "base64").toString("utf8");
    return createPrivateKey(pem);
  } catch {
    return null;
  }
}

/**
 * Cunha o bilhete. `agora` é injetável para teste determinístico; `kid` vazio significa chave única.
 */
export function cunharBilhete(
  dados: DadosBilhete,
  chavePrivada: KeyObject,
  kid?: string | null,
  agora: Date = new Date(),
): string {
  const iat = Math.floor(agora.getTime() / 1000);
  const identificador = (kid ?? "").trim();
  const cabecalho: CabecalhoBilhete = {
    alg: "EdDSA",
    typ: "JWT",
    ...(identificador ? { kid: identificador } : {}),
  };
  // O TETO É APLICADO AQUI, sobre o que o chamador pediu, e ele CORTA em vez de confiar. Ver
  // `BILHETE_TETO_SEGUNDOS`: prazo maior que o da credencial não é recusado com exceção porque
  // derrubar o envio do candidato por um número grande demais trocaria um teto por uma queda; ele é
  // simplesmente reduzido ao teto, que é o resultado seguro e é o que o emissor também reimporia.
  const tetoAbs = iat + BILHETE_TETO_SEGUNDOS;
  const claims: ClaimsBilhete = {
    dst: dados.destino,
    bkt: dados.bucket,
    obj: dados.objeto,
    mtd: dados.metodo,
    hdr: ordenarCabecalhos(dados.cabecalhos),
    ttl: Math.min(Math.max(0, Math.floor(dados.ttlSegundos)), BILHETE_TETO_SEGUNDOS),
    abs: Math.min(Math.floor(dados.absEpoch), tetoAbs),
    jti: randomUUID(),
    iat,
    exp: iat + BILHETE_TTL_SEGUNDOS,
  };
  const entrada = `${b64urlDeJson(cabecalho)}.${b64urlDeJson(claims)}`;
  const assinatura = sign(null, Buffer.from(entrada, "utf8"), chavePrivada);
  return `${entrada}.${base64url(assinatura)}`;
}

/**
 * Confere o bilhete com a CHAVE PÚBLICA (SPKI PEM) e devolve os claims.
 *
 * O verificador real é o EMISSOR, que roda fora deste repositório. Esta função existe para provar o
 * ida e volta em teste e para documentar, em código, exatamente o que o emissor tem de conferir:
 * formato, ALGORITMO FIXADO, assinatura e validade. Lança `Error` em qualquer desvio, e a recusa de
 * algoritmo vem ANTES da conta da assinatura, que é a defesa contra confusão de algoritmo.
 */
export function verificarBilhete(
  bilhete: string,
  chavePublicaPem: string,
  agora: Date = new Date(),
): ClaimsBilhete {
  const partes = bilhete.split(".");
  if (partes.length !== 3) throw new Error("bilhete do portal malformado");
  const [cabecalhoB64, payloadB64, sigB64] = partes;

  const cabecalho = JSON.parse(Buffer.from(cabecalhoB64, "base64url").toString("utf8")) as {
    alg?: string;
  };
  if (cabecalho.alg !== "EdDSA") throw new Error("alg do bilhete do portal inesperado");

  const entrada = `${cabecalhoB64}.${payloadB64}`;
  const chavePublica = createPublicKey(chavePublicaPem);
  const ok = verify(null, Buffer.from(entrada, "utf8"), chavePublica, Buffer.from(sigB64, "base64url"));
  if (!ok) throw new Error("assinatura do bilhete do portal invalida");

  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ClaimsBilhete;
  const agoraSeg = Math.floor(agora.getTime() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= agoraSeg) {
    throw new Error("bilhete do portal expirado");
  }
  if (!(BILHETE_DESTINOS as readonly string[]).includes(claims.dst)) {
    throw new Error("destino do bilhete do portal desconhecido");
  }
  return claims;
}
