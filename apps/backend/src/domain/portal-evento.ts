import { createHash, randomBytes } from "node:crypto";
import { ORIGENS_DE_ENVIO_DO_LINK } from "@ea/shared-types";

/**
 * PORTAL, CAMADA L: A ÚNICA PORTA DE ENTRADA DA TRILHA, E ELA SANITIZA.
 *
 * Hoje o EA não tem NENHUMA tabela de log de acesso ou de tentativa: a única trilha com valores é a
 * `candidato_alteracoes_log`, que é de EDIÇÃO e guarda valores de propósito. Esta é a primeira do
 * outro tipo, e por isso ela nasce com a régua de PII em código.
 *
 * O DESENHO É POR ALLOWLIST, NÃO POR BLOCKLIST, e a diferença é tudo. `montarEventoPortal` recebe o
 * que o chamador tiver na mão, inclusive PII, e COPIA apenas os campos de uma lista fechada de
 * campos técnicos. Um campo novo que alguém acrescente ao payload no futuro simplesmente NÃO
 * ATRAVESSA, sem precisar que ninguém se lembre de proibi-lo. Blocklist só barra o que já se sabia
 * que era perigoso, que é exatamente o campo que não vaza.
 *
 * Sanitizar no PONTO DE ESCRITA é o que impede que o próximo evento novo nasça vazando, porque não
 * existe outro caminho para gravar a trilha.
 *
 * §A.6 e seção 9 do documento de regras: nunca, em campo nenhum, CPF cru, data de nascimento, nome,
 * e-mail, telefone, nome de arquivo original, conteúdo do arquivo, token, cabeçalho de autorização,
 * URL assinada do armazenamento, texto extraído pela IA, nem o caminho completo do objeto.
 */

export const PORTAL_EVENTOS = [
  "PORTAL_LINK_EMITIDO",
  "PORTAL_LINK_REVOGADO",
  // ── O BLOQUEIO MANUAL DO LINK, E ELE É REVERSÍVEL ────────────────────────────────────────────
  //
  // DOIS EVENTOS, e não um com um campo dizendo o sentido: quem consulta a trilha precisa contar
  // "quantos links foram fechados à mão" sem depender de ler o campo de dados de cada linha. E os
  // dois são de natureza diferente do `PORTAL_LINK_REVOGADO`: revogar é TERMINAL (o link não
  // volta), bloquear fecha a porta agora e reabre depois, SEM trocar a URL que o candidato já tem.
  // Contar bloqueio como revogação inflaria justamente o número que sinaliza incidente.
  //
  // §A.6: os dois levam `autorId` (usuário do EA) e o `jti`. Nada do candidato, e nenhum motivo em
  // texto livre: o código é de catálogo (`LINK_BLOQUEADO`).
  "PORTAL_LINK_BLOQUEADO",
  "PORTAL_LINK_DESBLOQUEADO",
  // ── O LINK FOI ENTREGUE AO CANDIDATO (envio automático pelo funil, manual pelo Gerenciador) ──
  //
  // EVENTO PRÓPRIO, e não um campo no `PORTAL_LINK_EMITIDO`, porque emitir e ENTREGAR passaram a
  // ser coisas diferentes: a emissão manual que já existia devolve a URL na tela e quem a entrega
  // é o consultor, à mão, e esses links continuam nascendo sem entrega nenhuma. Contar "quantos
  // candidatos foram efetivamente chamados" a partir da emissão passaria a mentir no dia em que o
  // envio automático ligasse.
  //
  // §A.6: ele leva `jtiLink`, `autorId` (usuário do EA) e `origem`, que já é campo permitido.
  // NENHUM endereço, nenhum CPF, nenhuma URL. A allowlist `CAMPOS_PERMITIDOS` NÃO foi alargada
  // para este evento, e é exatamente essa recusa que a torna uma defesa e não uma formalidade: o
  // registro operacional do envio (carimbo, canal, origem, autor) mora em `portal_links`, que é
  // dado e não log.
  "PORTAL_LINK_ENVIADO",
  "PORTAL_LINK_ABERTO",
  "PORTAL_LINK_RECUSADO",
  "PORTAL_IDENTIFICACAO_OK",
  "PORTAL_IDENTIFICACAO_FALHA",
  "PORTAL_IDENTIFICACAO_BLOQUEADA",
  "PORTAL_LINK_SUSPENSO",
  "PORTAL_SESSAO_EMITIDA",
  "PORTAL_SESSAO_RECUSADA",
  "PORTAL_CREDENCIAL_EMITIDA",
  "PORTAL_CREDENCIAL_RECUSADA",
  "PORTAL_OBJETO_CONFIRMADO",
  "PORTAL_OBJETO_NAO_CONFIRMADO",
  // O expurgo ativo do recusado (exigência 7) que NÃO deu certo. Ele não derruba o caminho do
  // arquivo (condição B6), então sem este evento a falha sumiria: o objeto ficaria no balde
  // esperando a rede de proteção do ciclo de vida, e ninguém saberia. É o mesmo padrão da INT-4,
  // em que falhar ao notificar não desfaz o envelope e vira ERRO visível.
  "PORTAL_OBJETO_NAO_APAGADO",
  // O emissor não devolveu a credencial, e a COTA JÁ FOI DEBITADA (veto V7). A linha de
  // `portal_credenciais` fica de pé de propósito, porque desfazê-la criaria objeto órfão no balde;
  // o preço é que o candidato perde uma emissão, e sem este evento ele seria barrado depois por
  // quantidade sem que ninguém soubesse explicar o motivo.
  "PORTAL_EMISSOR_INDISPONIVEL",
  "PORTAL_UPLOAD_RECUSADO",
  "PORTAL_ANTIVIRUS_DETECCAO",
  "PORTAL_ANTIVIRUS_INDISPONIVEL",
  "PORTAL_EXTRACAO_IA",
  "PORTAL_CAMPO_APLICADO",
  // ── O CANDIDATO CONFIRMOU OS DADOS DO GI (Portal→GI, peça 2) ─────────────────────────────────
  //
  // EVENTO PRÓPRIO, e não o `PORTAL_CAMPO_APLICADO`: aquele conta a extração da IA por documento;
  // este marca a CONFIRMAÇÃO do candidato dos dados que vão ao G.I, que é outro ato e a Sala De
  // Segurança conta separado. §A.6: ele carrega o `jtiLink` e a CONTAGEM de campos confirmados
  // (`camposExtraidosN`), NUNCA o rótulo nem o valor. A allowlist `CAMPOS_PERMITIDOS` NÃO foi
  // alargada: os rótulos do aceite moram em `portal_dados_gi_aceites` (dado, não log), e o valor
  // mora só em `admissao_dados_gi` (§A.6).
  "PORTAL_DADOS_GI_CONFIRMADO",
  "PORTAL_LIMITE_ATINGIDO",
  "PORTAL_RECUPERACAO_SOLICITADA",
  "PORTAL_ORIGEM_RECUSADA",
  // ── A PONTE DO VT CUNHOU UM TOKEN, E ESTE É O ÚNICO RASTRO QUE VAI EXISTIR DELE ──────────────
  //
  // POR QUE ELE PRECISOU EXISTIR (veto da auditoria, item F4). `portal/vt-link` é a única rota do
  // portal que EMITE uma credencial com CPF e nome dentro, e ela nascia sem registro nenhum: se
  // amanhã um token do VT aparecer onde não devia, sem esta linha não há como dizer se ele saiu
  // daqui, de qual link e quando. E o preço de não saber é maior aqui do que em qualquer outra
  // porta, porque o token do VT é verificado OFFLINE pelo app do Firebase: ele NÃO TEM REVOGAÇÃO.
  // Revogar o link, desligar o EA ou apagar a linha não alcança um token já emitido.
  //
  // ELE NÃO É O `PORTAL_LINK_EMITIDO`, e a distinção importa: aquele é o link DO PORTAL, emitido
  // pelo time e revogável; este é o link DO VT, pedido pelo próprio candidato e irrevogável.
  // Contar os dois juntos misturaria uma credencial que morre por botão com uma que só morre pelo
  // relógio.
  //
  // §A.6: leva o `jti` do link do portal que originou o pedido e o `exp` do token emitido (quando
  // aquela credencial deixa de valer). NENHUM CPF, nenhum nome, nenhum token e nenhuma URL: o
  // registro serve para localizar a emissão, não para reconstruí-la. A allowlist `CAMPOS_PERMITIDOS`
  // NÃO foi alargada para este evento, e os dois campos que ele usa já estavam lá.
  "PORTAL_VT_LINK_EMITIDO",
  // ── A VOLTA DA PENDÊNCIA QUE CAIU PARA A FILA DO TIME (itens 5 e 6) ──────────────────────────
  //
  // DOIS EVENTOS, E NÃO UM COM RÓTULO DIFERENTE, porque as duas coisas são de natureza diferente e
  // quem consulta a trilha precisa distingui-las sem ler o campo de dados:
  //
  //  - `PORTAL_REENVIO_SOLICITADO`: o TIME pediu o documento de novo ao candidato. Fluxo NORMAL, do
  //    consultor, depois de a pendência cair na fila dele.
  //  - `PORTAL_TETO_DESTRAVADO`: um MASTER zerou as tentativas. EXCEÇÃO, e ela admite que a RÉGUA
  //    pode estar errada (§A.9: as 91 regras ativas não foram validadas pelo RH). Contar exceção
  //    junto com fluxo normal é perder exatamente o número que diz se a régua está reprovando gente
  //    certa.
  //
  // §A.6: os dois levam `autorId` (usuário do sistema, não o candidato), o código do tipo de
  // documento e a contagem. Nenhum dos dois carrega o motivo escrito pela IA nem texto livre.
  "PORTAL_REENVIO_SOLICITADO",
  "PORTAL_TETO_DESTRAVADO",
  // A TENTATIVA DE DESTRAVAR FORA DA HORA (decisão do diretor: o destrave vale só depois da queda).
  //
  // EVENTO PRÓPRIO, e não `PORTAL_TETO_DESTRAVADO` com resultado de recusa, porque este é o evento
  // que a Sala De Segurança conta para saber quantas vezes a régua precisou ser desmentida (§A.9).
  // Misturar tentativa recusada com destrave feito estragaria exatamente esse número.
  "PORTAL_DESTRAVE_RECUSADO",
] as const;

export type PortalEventoTipo = (typeof PORTAL_EVENTOS)[number];

/** Eventos cujo desfecho é recusa. O resto nasce OK, e o chamador não escolhe isso por engano. */
const TIPOS_RECUSADOS = new Set<string>([
  "PORTAL_LINK_RECUSADO",
  "PORTAL_LINK_REVOGADO",
  // O BLOQUEIO é recusa (a porta fechou); o DESBLOQUEIO não é, e por isso só ele fica de fora.
  "PORTAL_LINK_BLOQUEADO",
  "PORTAL_LINK_SUSPENSO",
  "PORTAL_IDENTIFICACAO_FALHA",
  "PORTAL_IDENTIFICACAO_BLOQUEADA",
  "PORTAL_SESSAO_RECUSADA",
  "PORTAL_CREDENCIAL_RECUSADA",
  "PORTAL_OBJETO_NAO_CONFIRMADO",
  "PORTAL_OBJETO_NAO_APAGADO",
  "PORTAL_EMISSOR_INDISPONIVEL",
  "PORTAL_UPLOAD_RECUSADO",
  "PORTAL_ANTIVIRUS_DETECCAO",
  "PORTAL_ANTIVIRUS_INDISPONIVEL",
  "PORTAL_LIMITE_ATINGIDO",
  "PORTAL_ORIGEM_RECUSADA",
  "PORTAL_DESTRAVE_RECUSADO",
]);

/**
 * Códigos de motivo, fechados. Texto livre vindo de fora é DESCARTADO, não aparado: quem opera
 * escreve o nome da pessoa no campo de observação, e aparar deixaria o pedaço inicial passar.
 */
export const PORTAL_MOTIVOS = [
  // Identificação. Um código só, de propósito: ver o comentário do `NAO_CASOU` abaixo.
  "NAO_CASOU",
  // ── OS DOIS DESFECHOS DO TETO DA IDENTIFICAÇÃO (decisão 5: 5 tentativas em 15 minutos) ───────
  //
  // ELES PRECISAM EXISTIR AQUI, e não é formalidade: `PORTAL_MOTIVOS` é lista FECHADA e
  // `montarEventoPortal` DESCARTA o que não está nela. Um código fora do catálogo não vira texto
  // livre nem erro, vira `motivo_codigo` NULO, e o evento chega à Sala De Segurança dizendo que
  // recusou sem dizer por quê. A frente do teto de tentativas já pagou exatamente este defeito uma
  // vez, e o comentário do `TENTATIVAS_ESGOTADAS` abaixo é a cicatriz dele.
  //
  // NENHUM DOS DOIS NOMEIA A METADE QUE FALHOU, e essa é a linha que não se cruza: eles dizem que o
  // TETO estourou, nunca se o CPF existe ou se a data bateu. O único código de não casamento
  // continua sendo `NAO_CASOU`, forçado por construção lá embaixo.
  //
  // `BLOQUEADO`: o balde de 5 em 15 minutos estourou (`PORTAL_IDENTIFICACAO_BLOQUEADA`). Depois do
  // código abaixo, ele quer dizer especificamente o balde do TOKEN ou o do LINK, ou seja aqueles
  // cuja chave quem tenta NÃO escolhe: quem aparece no evento é o SUSPEITO.
  "BLOQUEADO",
  // `BLOQUEADO_POR_CPF`: estourou o balde GLOBAL POR CPF, e ele é outra coisa, não um `BLOQUEADO`
  // mais específico.
  //
  // A CHAVE DESSE BALDE É ESCOLHIDA POR CAMPO DE FORMULÁRIO, então qualquer um com um link próprio
  // e legítimo enche o balde do CPF de um terceiro. Quem colhe a recusa (e aparece no evento, com
  // o `jti` e o hash de CPF dele) é o ALVO, não o suspeito. Com um código só, a Sala De Segurança
  // lia as duas situações, que são OPOSTAS, com o mesmo nome: no arnês da auditoria foram 13
  // eventos de bloqueio, a maioria no nome da vítima, e o ataque inteiro não acendia nada.
  //
  // É O QUE TORNA O ATAQUE DETECTÁVEL: "muitos `jti` DISTINTOS bloqueados sobre o MESMO hash de
  // CPF" é uma pergunta que só se faz com o código separado.
  //
  // ELE NÃO CHEGA AO CANDIDATO. O corpo do erro continua sendo o mesmo `BLOQUEADO` com a mesma
  // frase nos dois ramos (`CodigoErroIdentificacao`); este é vocabulário de TRILHA.
  "BLOQUEADO_POR_CPF",
  // `SUSPENSO`: o bloqueio progressivo chegou ao fim e o LINK foi suspenso até uma data
  // (`PORTAL_LINK_SUSPENSO`, que grava `suspenso_ate` na linha de `portal_links`). É outra coisa,
  // e não um bloqueio mais longo: o bloqueio é do balde e passa sozinho; a suspensão é da LINHA, e
  // vale para qualquer CPF que tente por aquele link.
  "SUSPENSO",
  // ── A REVOGAÇÃO DO LINK (item L2) ─────────────────────────────────────────────────────────────
  //
  // DOIS CÓDIGOS, e não um com rótulo diferente, porque as duas revogações são de natureza
  // diferente e quem consulta a trilha precisa distingui-las sem ler o campo de dados: uma é ATO de
  // alguém, a outra é EFEITO COLATERAL de uma emissão.
  //
  // `REVOGADO_MANUAL`: o consultor matou o link à mão, normalmente porque ele vazou ou foi para a
  // pessoa errada. Tem autor e é decisão.
  "REVOGADO_MANUAL",
  // `LINK_BLOQUEADO`: a porta foi fechada À MÃO pelo time, e reabre por botão (migration 0121).
  //
  // ELE PRECISA EXISTIR AQUI, e não é formalidade: `PORTAL_MOTIVOS` é lista FECHADA e
  // `montarEventoPortal` DESCARTA o que não está nela. Sem este código, toda recusa das quatro
  // portas do candidato por link bloqueado chegaria à Sala De Segurança com `motivo_codigo` NULO,
  // ou seja, dizendo que recusou sem dizer por quê. É a mesma cicatriz do `TENTATIVAS_ESGOTADAS`.
  //
  // Ele é DIFERENTE do `BLOQUEADO` acima, que é o balde de 5 tentativas em 15 minutos e passa
  // sozinho. Um é do sistema e temporário; este é decisão de alguém e não tem data de fim.
  "LINK_BLOQUEADO",
  // `SUBSTITUIDO`: o link morreu porque um NOVO foi emitido para a mesma admissão. Sem este código,
  // a Sala De Segurança contaria como revogação deliberada o que é rotina de reenvio, e o número de
  // "links revogados" (que é sinal de incidente) ficaria inflado pelo fluxo normal.
  "SUBSTITUIDO",
  // ── AS DUAS REVOGAÇÕES QUE O ENVIO DO LINK CRIOU ─────────────────────────────────────────────
  //
  // NENHUMA DAS DUAS CABIA NOS CÓDIGOS QUE JÁ EXISTIAM, e forçar uma delas em `REVOGADO_MANUAL`
  // ou `SUBSTITUIDO` estragaria os dois números que aqueles códigos existem para separar:
  // `REVOGADO_MANUAL` é ATO deliberado de alguém (sinal de incidente) e `SUBSTITUIDO` é rotina de
  // reemissão. Estas duas não são nem uma coisa nem outra.
  //
  // `ENVIO_FALHOU`: o link foi emitido, o e-mail NÃO saiu, e o link é morto na mesma operação. É a
  // regra que impede credencial órfã: emitir revoga o link anterior, então um envio que falhasse
  // sem desfazer deixaria o candidato SEM o link velho (já revogado) e SEM o novo (que ninguém
  // recebeu). Aqui não há autor humano decidindo nada: é o sistema desfazendo o que começou.
  "ENVIO_FALHOU",
  // `ENVIO_REVERTIDO`: o consultor DESFEZ o "enviar para admissão" no funil de A&S, e o link que
  // aquele envio gerou morre junto (decisão 4 do diretor nesta frente). A pessoa voltou para a
  // seleção, então o prontuário dela não deve continuar aberto para coleta. Também não é revogação
  // manual: ninguém clicou em "revogar link", clicou em "desfazer o envio".
  "ENVIO_REVERTIDO",
  // Emissão da credencial.
  "TAMANHO",
  "QUANTIDADE",
  "SOMA",
  "RITMO",
  "FORMATO",
  "METODO",
  "EXPIRADA",
  "EXTRACOES_ESGOTADAS",
  "TIPO_FORA_DA_REGUA",
  // UM ARQUIVO POR TIPO DE DOCUMENTO (`domain/portal-arquivo-unico.ts`). Código PRÓPRIO, e não
  // reaproveitado do teto: a Sala De Segurança precisa distinguir "mandou dois arquivos do mesmo
  // documento" de "esgotou as tentativas", que são situações diferentes e pedem respostas
  // diferentes de quem opera.
  "ARQUIVO_JA_ENVIADO",
  // Destravar antes de a pendência cair na fila (`domain/portal-tentativas.ts`). Código próprio: a
  // tela decide pelo código, nunca lendo a frase.
  "DESTRAVE_FORA_DA_HORA",
  // O TETO DE TENTATIVAS (`domain/portal-tentativas.ts`). Dois códigos, e NENHUM evento novo: a
  // tentativa que queimou entra como `PORTAL_UPLOAD_RECUSADO` com `REPROVADO`, e a queda para a
  // fila do time entra como `PORTAL_LIMITE_ATINGIDO` com `TENTATIVAS_ESGOTADAS`, que é exatamente a
  // situação que aquele evento já descreve e que a Sala De Segurança já lê.
  //
  // O MOTIVO DA REPROVAÇÃO NÃO VEM PARA CÁ. Ele é texto livre escrito pela IA, endereçado à tela do
  // candidato, e é justamente em campo de texto livre que a PII volta para o log (§A.6). O que a
  // trilha guarda é o CÓDIGO, o tipo de documento e a contagem.
  "TENTATIVAS_ESGOTADAS",
  "REPROVADO",
  "NAO_CONFIGURADO",
  "SEM_SESSAO",
  // Chegada e leitura.
  "OBJETO_AUSENTE",
  "OBJETO_DIVERGENTE",
  "EXTRACAO_FALHOU",
  // Conteúdo recusado pelo leitor (item G6).
  "HEIC",
  "PROTEGIDO_SENHA",
  "CONTEUDO_ATIVO",
  "DIMENSAO",
  "PAGINAS",
  "TEMPO",
  // Varredura do bucket, quando a fronteira F5 for combinada.
  "APAGADO",
  "QUARENTENA",
  "MARCADO",
] as const;

export type PortalMotivo = (typeof PORTAL_MOTIVOS)[number];

/**
 * OS ÚNICOS CAMPOS QUE ATRAVESSAM. Todos técnicos: código de catálogo, contagem, rótulo fixo.
 *
 * O que NÃO está aqui e é tentador: `objeto` (o caminho completo vai para o log do Google e
 * identifica o envio), `url` (é credencial), `campo`/`valor` (é o dado em si).
 *
 * `caminho` SAIU, a pedido da auditoria, enquanto ninguém o usava: num arquivo cuja razão de existir
 * é manter `objeto` fora da trilha, um campo chamado `caminho` é um convite. Removido antes de ter
 * o primeiro chamador, que é quando a remoção custa zero.
 */
const CAMPOS_PERMITIDOS = [
  "codigoTipoDocumento",
  "bytes",
  "bytesMax",
  "tipoPermitido",
  "formato",
  "exp",
  "tentativaN",
  "janela",
  "ate",
  "regra",
  "acao",
  "assinatura",
  "autorId",
  // `origem` ATRAVESSA COM VALOR CONFERIDO, e é o único campo desta lista assim. Ver
  // `VALORES_FECHADOS` logo abaixo: a allowlist de NOME não diz nada sobre o CONTEÚDO, e num
  // arquivo cuja razão de existir é ser lista fechada, um campo que aceita qualquer string é
  // convite para o dia em que alguém passar `origem: email` achando que descreve a procedência.
  "origem",
  "metodo",
] as const;

/**
 * OS CAMPOS CUJO VALOR TAMBÉM É VOCABULÁRIO FECHADO, e não só o nome.
 *
 * Hoje é um só, `origem`, e os dois chamadores do envio passam `"MANUAL"` (fixo no handler) e
 * `"AUTOMATICO"` (carimbado pelo serviço), então nenhuma PII passa por aqui neste instante. A
 * régua não existe pelo hoje: existe porque `montarEventoPortal` recebe o payload SUJO do
 * chamador, e a defesa deste arquivo é justamente não depender de quem chama. Valor fora da lista
 * é DESCARTADO em silêncio, igual ao campo fora da allowlist: a trilha perde um rótulo, que é o
 * lado certo de errar.
 *
 * A lista vem de `ORIGENS_DE_ENVIO_DO_LINK` (contrato compartilhado) em vez de ser recopiada
 * aqui: duas cópias do mesmo vocabulário divergem no primeiro código novo, e a que divergisse
 * seria esta, que ninguém abre para acrescentar origem.
 */
const VALORES_FECHADOS: Record<string, readonly string[]> = {
  origem: ORIGENS_DE_ENVIO_DO_LINK,
};

export interface EventoPortal {
  tipo: PortalEventoTipo;
  jtiLink: string | null;
  candidatoHash: string | null;
  ipHash: string | null;
  uaHash: string | null;
  resultado: "OK" | "RECUSADO";
  motivoCodigo: PortalMotivo | null;
  camposExtraidosN?: number;
  dados: Record<string, unknown>;
}

/**
 * PEPPER DA TRILHA, E ELE FALHA FECHADO.
 *
 * `PORTAL_LOG_PEPPER` ausente NÃO faz o hash virar CPF cru, em hipótese nenhuma: o fallback é um
 * pepper ALEATÓRIO sorteado uma vez por processo. O efeito é que a correlação entre reinícios se
 * perde, o que é exatamente a direção segura (um log que correlaciona de menos é um log fraco; um
 * log que guarda CPF é um incidente).
 *
 * E a exigência de configuração não desaparece por causa desse fallback: quem GRAVA a trilha é o
 * `PortalTrilhaService`, e ele se RECUSA a gravar sem a variável (`pepperObrigatorio`). Aqui, que é
 * função pura e roda em teste sem ambiente, o sorteio evita que a régua de PII só possa ser provada
 * em quem tiver `.env`.
 */
const PEPPER_DE_PROCESSO = randomBytes(32).toString("hex");

export function pepperDaTrilha(): string {
  const configurado = (process.env.PORTAL_LOG_PEPPER ?? "").trim();
  return configurado.length > 0 ? configurado : PEPPER_DE_PROCESSO;
}

function hash(rotulo: string, valor: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${rotulo}:${valor}`).digest("hex").slice(0, 32);
}

/**
 * CPF vira hash com pepper, truncado em 32 hex. Mesmo padrão da `VtService.chaveCpf`, já em
 * produção. Para EXIBIR ao humano, a Sala De Segurança parte do candidato que o consultor já tem
 * direito de ver e deriva o CPF mascarado na hora, a partir da base. Nunca do log.
 */
export function candidatoHashDe(cpf: string, pepper: string = pepperDaTrilha()): string {
  return hash("cpf", cpf.replace(/\D/g, ""), pepper);
}

/**
 * IP vira hash com SAL MENSAL. O sal que muda todo mês é o que impede a trilha de virar tabela de
 * correlação permanente por endereço: passado o mês, o mesmo IP gera outro hash.
 *
 * O IP COMPLETO existe em UM lugar só, a `portal_eventos_ip`, restrita a Master e Super Admin e
 * truncada aos 90 dias (decisão 14 do documento de regras).
 */
export function ipHashDe(ip: string, pepper: string = pepperDaTrilha(), agora: Date = new Date()): string {
  const mes = `${agora.getUTCFullYear()}${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
  return hash(`ip:${mes}`, ip, pepper);
}

/** O agente do navegador também é hash: a string crua é impressão digital de aparelho. */
export function uaHashDe(ua: string, pepper: string = pepperDaTrilha()): string {
  return hash("ua", ua, pepper);
}

/**
 * Trunca o IP para a retenção dos 90 dias: IPv4 perde o último octeto, IPv6 fica nos 48 bits de
 * rede. Sobra a origem aproximada, que é o que a investigação de abuso usa, e vai embora a
 * identificação do assinante.
 */
export function truncarIp(ip: string): string {
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}::`;
  const octetos = ip.split(".");
  if (octetos.length !== 4) return "0.0.0.0";
  return `${octetos[0]}.${octetos[1]}.${octetos[2]}.0`;
}

function contarCampos(cru: Record<string, unknown>): number | undefined {
  if (typeof cru.camposExtraidosN === "number") return cru.camposExtraidosN;
  const fonte = (cru.valoresExtraidos ?? cru.campos) as Record<string, unknown> | undefined;
  if (fonte && typeof fonte === "object") return Object.keys(fonte).length;
  return undefined;
}

/**
 * Monta o registro já reduzido. Recebe o payload sujo do chamador e devolve o que pode ser gravado.
 */
export function montarEventoPortal(
  tipo: PortalEventoTipo,
  cru: Record<string, unknown>,
  pepper: string = pepperDaTrilha(),
): EventoPortal {
  const dados: Record<string, unknown> = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    const valor = cru[campo];
    // Só primitivo atravessa. Objeto aninhado é onde a PII se esconde de uma allowlist rasa.
    if (valor === undefined || valor === null) continue;
    // Campo de vocabulário fechado só atravessa com o valor conferido contra a lista.
    const fechado = VALORES_FECHADOS[campo];
    if (fechado && !(typeof valor === "string" && fechado.includes(valor))) continue;
    if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
      dados[campo] = valor;
    }
  }

  const cpf = typeof cru.cpf === "string" ? cru.cpf : null;
  const ip = typeof cru.ip === "string" ? cru.ip : null;
  const ua = typeof cru.userAgent === "string" ? cru.userAgent : null;
  const jti = typeof cru.jtiLink === "string" ? cru.jtiLink : null;

  // O MOTIVO DA IDENTIFICAÇÃO É SEMPRE O MESMO, MESMO SABENDO O MOTIVO REAL (item L6, veto V7).
  // Separar "CPF inexistente" de "data errada" recria, DENTRO DO NOSSO BANCO, o oráculo de CPF
  // válido que a tela foi desenhada para não ser. O `motivoReal` que o chamador tenha em mãos é
  // deliberadamente ignorado aqui.
  let motivo: PortalMotivo | null = null;
  if (tipo === "PORTAL_IDENTIFICACAO_FALHA") {
    motivo = "NAO_CASOU";
  } else if (
    typeof cru.motivoCodigo === "string" &&
    (PORTAL_MOTIVOS as readonly string[]).includes(cru.motivoCodigo)
  ) {
    motivo = cru.motivoCodigo as PortalMotivo;
  }

  const resultadoCru = cru.resultado;
  const resultado: "OK" | "RECUSADO" =
    resultadoCru === "OK" || resultadoCru === "RECUSADO"
      ? resultadoCru
      : TIPOS_RECUSADOS.has(tipo)
        ? "RECUSADO"
        : "OK";

  const camposExtraidosN = contarCampos(cru);

  return {
    tipo,
    jtiLink: jti,
    candidatoHash: cpf ? candidatoHashDe(cpf, pepper) : null,
    ipHash: ip ? ipHashDe(ip, pepper) : null,
    uaHash: ua ? uaHashDe(ua, pepper) : null,
    resultado,
    motivoCodigo: motivo,
    ...(camposExtraidosN === undefined ? {} : { camposExtraidosN }),
    dados,
  };
}
