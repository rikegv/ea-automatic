import type { PassoDaTrilhaPortal } from "@ea/shared-types";

/**
 * A RÉGUA PURA DA TRILHA DA SOL (Portal do Candidato). Sem React, sem rede, sem relógio.
 *
 * POR QUE ELA VIVE FORA DO COMPONENTE: a casa do tabuleiro mistura TRÊS fontes de verdade, e cada
 * uma tem dono diferente. O ESTADO DO DOCUMENTO é do servidor (`PassoDaTrilhaPortal.estado`, cinco
 * valores derivados do enum do banco mais o teto); a POSIÇÃO é da navegação (qual casa o candidato
 * olha agora); e o PULADO é memória da VISITA, que o servidor não guarda de propósito (pular não é
 * fato do processo, é "não tenho o documento na mão agora"). Misturadas dentro do JSX, nenhuma das
 * três é afirmável em teste, e o defeito aparece como cor errada no celular do candidato, que é
 * onde ninguém consegue reproduzir.
 *
 * A PRECEDÊNCIA É SEMPRE DO SERVIDOR. A visita só pinta o que continua ACIONÁVEL pelo candidato:
 * aceito segue aceito mesmo pulado, e o que caiu para o time segue do time mesmo pulado. O contrário
 * faria a tela pedir de novo um documento que a emissão de credencial RECUSA, prometendo o que a
 * rota nega.
 *
 * §A.6: nada aqui é dado pessoal. Código de catálogo, nome de documento e contagem de bytes.
 * §A.11: nenhum travessão nas mensagens, que são lidas pelo candidato.
 */

/**
 * A memória da SESSÃO do candidato. Nasce vazia a cada abertura do link, e isso é desenho: fechou a
 * aba, o pulado some e a casa volta a ser pendência comum, exatamente como o servidor a vê.
 */
export type Visita = { pulados: Set<string> };

/** O que a casa mostra: os seis estados do contrato mais os dois que são da tela. */
export type EstadoDaCasa =
  | "ACEITO"
  | "EM_ANALISE"
  | "AGUARDANDO_VALIDACAO"
  | "AJUSTAR"
  | "ATUAL"
  | "PULADO"
  | "NO_TIME"
  | "PENDENTE";

// Os números do servidor, repetidos aqui como PADRÃO e conferidos por teste contra
// `domain/portal-credencial.ts`: a tela recusa ANTES de gastar uma credencial, e recusar com número
// diferente do servidor é impedir envio legítimo (para menos) ou queimar tentativa (para mais).
//
// ELES SÃO O PADRÃO, NÃO A VERDADE. A verdade é `trilha.limites`, que o servidor manda no contrato,
// e é ele que a tela passa em toda chamada real. Estas constantes valem só enquanto os limites do
// servidor não estão em mãos (a primeira renderização e o teste da régua pura). Sem isso são duas
// verdades esperando divergir: no dia em que o servidor mudar o teto, a tela recusaria o que ele
// aceita ou gastaria credencial com o que ele vai recusar.
const MB = 1024 * 1024;
const BYTES_MAX_ARQUIVO = 10 * MB;
const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png"];

/** Os limites como o servidor os manda em `TrilhaDoCandidato.limites`. */
export type LimitesDeArquivo = { bytesMaxArquivo: number; tiposAceitos: string[] };

/**
 * O teto em MB, para a frase que o candidato lê. DERIVADO do valor em uso, nunca escrito no texto:
 * mensagem com número fixo é a terceira verdade, e é a que mente sem ninguém perceber.
 *
 * Uma casa decimal só quando o valor não é redondo, e vírgula, que é como se escreve número aqui.
 */
export function tetoEmMb(bytes: number): string {
  const mb = Math.round((bytes / MB) * 10) / 10;
  return `${String(mb).replace(".", ",")} MB`;
}

/** O teto de fato em uso: o do servidor quando veio, o padrão local enquanto não veio. */
function tetoDeBytes(limites?: LimitesDeArquivo | null): number {
  return limites && limites.bytesMaxArquivo > 0 ? limites.bytesMaxArquivo : BYTES_MAX_ARQUIVO;
}

/**
 * O candidato ainda pode enviar NESTA casa?
 *
 * Só `PENDENTE` e `AJUSTAR` aceitam envio, e ainda assim só com tentativa sobrando. `ACEITO` já tem
 * o documento, `EM_ANALISE` tem um envio em aberto (a régua do arquivo único barra o segundo) e
 * `NO_TIME` bateu o teto. O contador é conferido ALÉM do estado: estado e contagem discordando é
 * inconsistência do servidor, e a tela cai para o lado seguro, porque oferecer o envio ali gastaria
 * o gesto do candidato para colher recusa da rota.
 */
export function podeEnviar(passo: PassoDaTrilhaPortal): boolean {
  if (passo.estado !== "PENDENTE" && passo.estado !== "AJUSTAR") return false;
  if (passo.tentativas.noTime) return false;
  return passo.tentativas.restantes > 0;
}

/** A cor da casa. Estado do servidor primeiro; posição e visita só decidem entre as acionáveis. */
export function estadoDaCasa(
  passo: PassoDaTrilhaPortal,
  ehAtual: boolean,
  visita: Visita,
): EstadoDaCasa {
  // Casa que o candidato não pode mover: o servidor manda, e nem estar em cima dela muda a cor.
  if (!podeEnviar(passo)) return passo.estado;
  if (ehAtual) return "ATUAL";
  if (visita.pulados.has(passo.codigoTipoDocumento)) return "PULADO";
  return passo.estado;
}

/**
 * A PRÓXIMA CASA que o candidato tem como resolver, ou nulo quando não resta nada dele.
 *
 * Percorre o círculo a partir da casa seguinte à atual, DUAS vezes: na primeira só o que ele ainda
 * não viu, na segunda o que ele pulou. É o que faz pular não virar beco (a pulada volta a ser
 * oferecida quando a trilha dá a volta) sem reoferecer o pulado antes do inédito.
 *
 * A casa atual fica FORA das duas passadas: avançar é sair de onde se está.
 */
export function proximoPasso(
  passos: PassoDaTrilhaPortal[],
  atual: number,
  visita: Visita,
): number | null {
  const n = passos.length;
  if (n === 0) return null;

  const roda = (querPulado: boolean): number | null => {
    for (let salto = 1; salto <= n; salto++) {
      const i = (((atual + salto) % n) + n) % n;
      if (i === atual) continue;
      const passo = passos[i];
      if (!podeEnviar(passo)) continue;
      if (visita.pulados.has(passo.codigoTipoDocumento) !== querPulado) continue;
      return i;
    }
    return null;
  };

  return roda(false) ?? roda(true);
}

/**
 * A recusa do arquivo ANTES de pedir credencial, com o texto escrito por nós.
 *
 * NADA DE MENSAGEM DE BIBLIOTECA nem de código seco: quem lê é o candidato no celular, e a frase
 * precisa dizer o que fazer em seguida. §A.11: sem travessão.
 *
 * OS LIMITES SÃO DO SERVIDOR quando ele os manda (`trilha.limites`, segundo parâmetro, que a tela
 * passa em toda chamada real). Sem eles, valem as constantes locais, que é o caso da régua pura em
 * teste e o da tela antes de a trilha chegar. Lista de tipos vazia é contrato incompleto, e aí o
 * padrão também prevalece: recusar tudo seria pior que recusar pelo número de ontem.
 */
export function validarArquivo(
  arquivo: { type: string; size: number },
  limites?: LimitesDeArquivo | null,
): { ok: true } | { ok: false; mensagem: string } {
  const tipos = limites && limites.tiposAceitos.length > 0 ? limites.tiposAceitos : TIPOS_ACEITOS;
  const teto = tetoDeBytes(limites);

  if (!arquivo.size || arquivo.size <= 0) {
    return {
      ok: false,
      mensagem: "Este arquivo está vazio. Escolha o arquivo do documento e envie de novo.",
    };
  }
  if (!tipos.includes(arquivo.type)) {
    return { ok: false, mensagem: "Envie o documento em PDF, JPG ou PNG." };
  }
  if (arquivo.size > teto) {
    return {
      ok: false,
      mensagem: `Este arquivo passa do tamanho permitido. Envie um arquivo de até ${tetoEmMb(teto)}.`,
    };
  }
  return { ok: true };
}

/** O teto em MB para a frase de instrução da casa, pela MESMA régua da recusa. */
export function tetoDeEnvioEmMb(limites?: LimitesDeArquivo | null): string {
  return tetoEmMb(tetoDeBytes(limites));
}

/**
 * O placar do fim da trilha. Cada casa cai em UM balde só, e a soma dos baldes é o total: balde que
 * conta duas vezes faz o resumo prometer trabalho que não existe.
 */
export function resumoFinal(
  passos: PassoDaTrilhaPortal[],
  visita: Visita,
): { aceitos: number; pulados: number; noTime: number; pendentes: number } {
  const resumo = { aceitos: 0, pulados: 0, noTime: 0, pendentes: 0 };
  for (const passo of passos) {
    if (passo.estado === "ACEITO") resumo.aceitos++;
    else if (passo.estado === "NO_TIME") resumo.noTime++;
    // Pular só conta onde ainda havia o que o candidato pudesse fazer. Pular o que já é do time, ou
    // o que já foi aceito, é gesto sem efeito, e contá-lo diria ao candidato que sobrou trabalho
    // dele onde não sobrou.
    else if (podeEnviar(passo) && visita.pulados.has(passo.codigoTipoDocumento)) resumo.pulados++;
    else resumo.pendentes++;
  }
  return resumo;
}

/**
 * A VOLTA DA ABA: QUANDO RELER A TRILHA, e este é o pedaço que decide, sozinho, se a recarga é
 * ajuda ou atropelo. Função PURA de propósito: o efeito da página só liga o ouvinte e obedece.
 *
 * POR QUE A RECARGA EXISTE: o candidato sai da aba para preencher o vale-transporte e volta. A
 * baixa daquela casa é dada do outro lado, pela varredura da coleta, e sem reler a trilha ele fica
 * olhando uma casa pendente que já foi resolvida, até recarregar a página na mão.
 *
 * POR QUE CADA GUARDA ESTÁ AQUI:
 *  · `tela`: só a TRILHA relê. Na identificação, no termo e no "o que reunir" não há trilha na
 *    frente dele, e recarregar ali só arriscaria mexer no que a pessoa está preenchendo.
 *  · `terminou`: a conclusão é tela TERMINAL. O placar já foi dado, e não há casa a repintar.
 *  · `temSessao`: sem sessão não há o que pedir, e pedir sem ela só produziria o 401 que já
 *    reabriria a identificação por nada.
 *  · `envioEmAndamento`: um arquivo subindo é o gesto do candidato, e ele ganha de qualquer
 *    atualização de fundo. A recarga é IGNORADA, não enfileirada: o próprio envio relê a trilha
 *    quando termina, então nada se perde por deixá-la passar.
 *  · `jaCarregando`: leitura já em voo. Duas leituras concorrentes só embaralham a ordem das
 *    respostas.
 *
 * É UM EVENTO, UMA LEITURA. Não há intervalo, não há repetição, não há laço: quem chama isto é o
 * `visibilitychange`, e ele só acontece quando a aba volta a aparecer.
 */
export function deveRecarregarAoVoltar(estado: {
  tela: string;
  terminou: boolean;
  temSessao: boolean;
  envioEmAndamento: boolean;
  jaCarregando: boolean;
  visivel: boolean;
}): boolean {
  if (!estado.visivel) return false;
  if (estado.tela !== "TRILHA") return false;
  if (estado.terminou) return false;
  if (!estado.temSessao) return false;
  if (estado.envioEmAndamento) return false;
  if (estado.jaCarregando) return false;
  return true;
}
