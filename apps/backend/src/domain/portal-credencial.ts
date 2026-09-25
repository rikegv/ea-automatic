import { randomUUID } from "node:crypto";

/**
 * PORTAL DO CANDIDATO, CAMADA G1: A REGRA DA CREDENCIAL DE ESCRITA, PURA.
 *
 * Sem banco, sem relógio, sem rede e sem chave: só a régua. Quem assina de fato é o EMISSOR, no
 * nosso projeto do Google, a partir do bilhete cunhado em `portal/portal-bilhete.ts` e trocado por
 * `portal/portal-emissor.service.ts`; quem guarda o estado é `portal/portal-credencial.service.ts`.
 * A chave que assinava a URL dentro deste processo NÃO existe mais.
 * A separação existe para que a parte perigosa, que é decidir SE concede e COM QUE TETO, possa ser
 * provada em teste sem nuvem nenhuma.
 *
 * A DECISÃO QUE ESTA ASSINATURA DE FUNÇÃO EXISTE PARA TRAVAR (exigência 2 do desenho, impeditiva):
 * o estado do link ENTRA e SAI de `emitirCredencialEscrita`. Contar na CONFIRMAÇÃO tornaria
 * ilimitado pedir credencial e nunca enviar nada, e cada credencial já é, na prática, uma chamada
 * gratuita ao motor de IA que atende a esteira de admissão. Quem um dia quiser voltar a contar na
 * chegada vai ter de mudar este contrato, e aí o teste "26 pedidos sem um único envio" quebra antes
 * de chegar em produção.
 *
 * ONDE O ESTADO SOBREVIVE A REINÍCIO: aqui ele é um valor, de propósito. O dono dele é a tabela
 * `portal_credenciais`, uma linha por credencial EMITIDA, e o serviço remonta este estado a cada
 * pedido lendo aquelas linhas por `jti_link`. Se o estado morasse em memória de processo, 26
 * credenciais pedidas sobreviveriam a um restart, a exigência 2 viraria teatro e o teste unitário
 * continuaria verde mentindo.
 *
 * §A.6: nada aqui é dado pessoal. Identificador OPACO da admissão (hash com pepper, nunca o id),
 * código de tipo de documento e bytes.
 */

const MB = 1024 * 1024;

/** Os três números do diretor, mais o ritmo e o prazo. Escritos à mão, não derivados de nada. */
export const LIMITES_PORTAL = {
  /** Teto por arquivo, e também o máximo que o candidato pode DECLARAR ao pedir a credencial. */
  BYTES_MAX_ARQUIVO: 10 * MB,
  /** Quantos arquivos um mesmo link chega a enviar. Conta credencial EMITIDA, não arquivo chegado. */
  ARQUIVOS_MAX_POR_LINK: 25,
  /** Soma dos tamanhos CONCEDIDOS no mesmo link. */
  BYTES_MAX_SOMADOS: 60 * MB,
  /** Ritmo: 10 emissões por minuto, em janela deslizante. É o item U3, movido para a emissão. */
  EMISSOES_POR_JANELA: 10,
  JANELA_RITMO_MS: 60_000,
  /**
   * Prazo da credencial: MINUTOS, nunca horas. Ela é emitida para ser usada em seguida, e prazo de
   * horas é link de escrita circulando no nosso armazenamento.
   */
  TTL_MS: 10 * 60_000,
  /**
   * Teto de EXTRAÇÕES da IA por link, separado do teto de arquivos porque cada leitura é chamada
   * PAGA ao nosso motor e o mesmo arquivo pode ser relido. A folga sobre os 25 arquivos cabe alguma
   * retentativa legítima, não uma fila infinita.
   */
  EXTRACOES_MAX_POR_LINK: 40,
} as const;
// O TETO DE TENTATIVAS DO CANDIDATO NÃO ESTÁ AQUI, E A AUSÊNCIA É DELIBERADA. Ele vive em
// `portal-tentativas.ts` porque é outra coisa: estes tetos protegem o SISTEMA contra abuso e contam
// por LINK; aquele protege o CANDIDATO de um laço e conta por PENDÊNCIA (admissão + tipo de
// documento). Fundidos, um protege mal e o outro pune errado.

/** Tipos aceitos. Compactado fica de fora (item U8): zip com senha é o que nenhum antivírus abre. */
export const TIPOS_ACEITOS_PORTAL = ["application/pdf", "image/jpeg", "image/png"] as const;

const EXTENSAO_POR_TIPO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Motivos de recusa. Enum curto e fechado: é no texto livre que a PII volta para o log. */
export type MotivoCredencial =
  | "TAMANHO"
  | "QUANTIDADE"
  | "SOMA"
  | "RITMO"
  | "FORMATO"
  | "METODO"
  | "EXPIRADA"
  | "EXTRACOES_ESGOTADAS"
  // A pendência já caiu para o time (teto de tentativas). A DECISÃO não é tomada aqui, e sim em
  // `portal-tentativas.ts`, sobre a contagem por pendência: este código existe no enum porque ele é
  // um motivo de RECUSA DE CREDENCIAL como os outros, e a trilha e a mensagem passam pelo mesmo
  // caminho fechado de sempre.
  | "TENTATIVAS_ESGOTADAS";

/**
 * O consumo de UM link. Vem do banco a cada pedido, e volta para o banco depois da concessão.
 *
 * `emissoesMs` guarda só os carimbos dentro da janela do ritmo; o resto é podado a cada emissão,
 * senão um link de vida longa acumularia lista sem fim por nada.
 */
export interface EstadoEmissaoLink {
  emitidas: number;
  bytesConcedidos: number;
  emissoesMs: number[];
  extracoes: number;
}

export function estadoEmissaoInicial(): EstadoEmissaoLink {
  return { emitidas: 0, bytesConcedidos: 0, emissoesMs: [], extracoes: 0 };
}

/**
 * O que a credencial autoriza, e sobretudo o que ela NÃO autoriza.
 *
 * Os três booleanos negativos são declaração explícita, não enfeite: o erro mais comum na
 * configuração é conceder no nível do BUCKET em vez do OBJETO, e aí a credencial do candidato A
 * enumera e baixa o documento do candidato B (item G2, ameaça A15, que é o vazamento em massa deste
 * modelo). Eles existem para que o teste possa afirmar a ausência, e não só supô-la.
 */
export interface CredencialEscrita {
  objeto: string;
  metodo: "PUT";
  permiteLeitura: false;
  permiteListagem: false;
  permiteSobrescrita: false;
  /**
   * OS CABEÇALHOS QUE ENTRAM NA ASSINATURA, e é aqui que mora a exigência 4 inteira. Cabeçalho que
   * fica fora da assinatura o cliente simplesmente omite, e a credencial vira escrita aberta no
   * nosso armazenamento (veto V10). Dentro dela, omitir qualquer um faz o Google recusar o envio
   * por assinatura inválida, sem depender da boa fé de quem chama.
   */
  cabecalhosAssinados: Record<string, string>;
  tipoAssinado: string;
  bytesMax: number;
  /** Epoch em milissegundos. */
  expiraEm: number;
}

export interface EntradaEmissao {
  estado: EstadoEmissaoLink;
  /** Hash com pepper do id da admissão. NUNCA o id: o nome do objeto vai para o log do Google. */
  admissaoIdOpaco: string;
  codigoTipoDocumento: string;
  contentType: string;
  /** Tamanho DECLARADO pelo candidato. Vira o teto assinado e é o que soma nos 60 MB do link. */
  bytes: number;
  agoraMs: number;
  uuid?: string;
}

export type ResultadoEmissao =
  | { ok: true; credencial: CredencialEscrita; estado: EstadoEmissaoLink }
  | { ok: false; motivoCodigo: MotivoCredencial };

/**
 * Concede, ou recusa com código. A ordem das travas é TAMANHO, QUANTIDADE, SOMA e RITMO, e ela não
 * é arbitrária: as três primeiras são definitivas para aquele pedido (o arquivo é grande demais, o
 * link acabou, a cota acabou) e o ritmo é a única que passa sozinha com o tempo. Avaliar o ritmo
 * antes faria o candidato que já estourou a cota receber "tente de novo em um minuto", que é uma
 * mentira educada.
 */
export function emitirCredencialEscrita(entrada: EntradaEmissao): ResultadoEmissao {
  const { estado, bytes, agoraMs } = entrada;

  if (!Number.isFinite(bytes) || !Number.isInteger(bytes) || bytes <= 0) {
    return { ok: false, motivoCodigo: "TAMANHO" };
  }
  if (bytes > LIMITES_PORTAL.BYTES_MAX_ARQUIVO) {
    return { ok: false, motivoCodigo: "TAMANHO" };
  }
  if (!(TIPOS_ACEITOS_PORTAL as readonly string[]).includes(entrada.contentType)) {
    return { ok: false, motivoCodigo: "FORMATO" };
  }
  if (estado.emitidas >= LIMITES_PORTAL.ARQUIVOS_MAX_POR_LINK) {
    return { ok: false, motivoCodigo: "QUANTIDADE" };
  }
  if (estado.bytesConcedidos + bytes > LIMITES_PORTAL.BYTES_MAX_SOMADOS) {
    return { ok: false, motivoCodigo: "SOMA" };
  }
  if (estado.extracoes >= LIMITES_PORTAL.EXTRACOES_MAX_POR_LINK) {
    return { ok: false, motivoCodigo: "EXTRACOES_ESGOTADAS" };
  }

  // Janela DESLIZANTE, e estritamente maior que o início: o candidato lento, que volta exatamente um
  // minuto depois, não pode ser punido por uma comparação frouxa.
  const inicioJanela = agoraMs - LIMITES_PORTAL.JANELA_RITMO_MS;
  const naJanela = estado.emissoesMs.filter((ms) => ms > inicioJanela);
  if (naJanela.length >= LIMITES_PORTAL.EMISSOES_POR_JANELA) {
    return { ok: false, motivoCodigo: "RITMO" };
  }

  const extensao = EXTENSAO_POR_TIPO[entrada.contentType];
  // O código do tipo vem do catálogo `tipos_documento`, que é VIVO e editável pela tela de
  // administração. Saneado aqui porque um código com barra viraria pasta nova no armazenamento.
  const codigo = entrada.codigoTipoDocumento.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 60);
  const uuid = entrada.uuid ?? randomUUID();

  const credencial: CredencialEscrita = {
    // Objeto ÚNICO, nome escolhido por NÓS. O candidato nunca informa caminho nem nome: nome vindo
    // do cliente é travessia de caminho e é sobrescrita de objeto alheio, e o nome de arquivo
    // ORIGINAL é PII por si só (já foi visto CPF em nome de arquivo do Pandapé).
    objeto: `${entrada.admissaoIdOpaco}/${codigo}__${uuid}.${extensao}`,
    metodo: "PUT",
    permiteLeitura: false,
    permiteListagem: false,
    permiteSobrescrita: false,
    cabecalhosAssinados: {
      "content-type": entrada.contentType,
      // A faixa de tamanho. Sem ela a credencial escreve 50 GB e a conta da nuvem é nossa (veto V2
      // no modelo novo). O piso é 0 porque o armazenamento recusa o range quando o corpo é menor
      // que o mínimo, e um envio interrompido no primeiro byte cairia num erro de assinatura em vez
      // de num erro de tamanho; objeto vazio é barrado depois, na confirmação (`portal-chegada`).
      "x-goog-content-length-range": `0,${bytes}`,
      // Grava SÓ se o objeto ainda não existe. É a proibição de sobrescrever, e ela precisa estar
      // DENTRO da assinatura, não na configuração do bucket: sobrescrita apaga prova, inclusive a
      // do próprio candidato.
      "x-goog-if-generation-match": "0",
    },
    tipoAssinado: entrada.contentType,
    bytesMax: bytes,
    expiraEm: agoraMs + LIMITES_PORTAL.TTL_MS,
  };

  return {
    ok: true,
    credencial,
    estado: {
      emitidas: estado.emitidas + 1,
      bytesConcedidos: estado.bytesConcedidos + bytes,
      emissoesMs: [...naJanela, agoraMs],
      extracoes: estado.extracoes,
    },
  };
}

export interface TentativaUso {
  metodo: string;
  contentType: string;
  bytes: number;
}

/**
 * Confere o uso contra o que foi assinado.
 *
 * ISTO NÃO SUBSTITUI A TRAVA DO GOOGLE, e dizer o motivo importa: quem recusa de verdade o cliente
 * que troca o tipo ou o tamanho é o armazenamento, porque os cabeçalhos estão dentro da assinatura.
 * Esta função é a nossa régua do mesmo contrato, usada antes de gastar rede e para a trilha saber
 * QUAL regra o cliente tentou dobrar. Régua só do lado deles não vira evento nosso, e o que não
 * vira evento não aparece na Sala De Segurança.
 */
export function validarUsoCredencial(
  credencial: CredencialEscrita,
  tentativa: TentativaUso,
  agoraMs: number,
): { ok: true } | { ok: false; motivoCodigo: MotivoCredencial } {
  if (tentativa.metodo !== credencial.metodo) return { ok: false, motivoCodigo: "METODO" };
  if (agoraMs > credencial.expiraEm) return { ok: false, motivoCodigo: "EXPIRADA" };
  if (tentativa.contentType !== credencial.tipoAssinado) return { ok: false, motivoCodigo: "FORMATO" };
  if (!Number.isFinite(tentativa.bytes) || tentativa.bytes <= 0 || tentativa.bytes > credencial.bytesMax) {
    return { ok: false, motivoCodigo: "TAMANHO" };
  }
  return { ok: true };
}
