/**
 * DETECÇÃO DE NOME DE CADASTRO SUSPEITO (OST A / Bloco 6).
 *
 * MOTIVO. O cadastro da Silvia estava com um token DUPLICADO em sequência ("Carla Carla"), e a IA,
 * que confere o nome do documento contra o nome do cadastro, reprovou SEIS documentos bons por "nome
 * não confere". O erro não estava nos documentos nem na IA: estava no cadastro. Antes de rodar o lote
 * é preciso saber a dimensão do problema.
 *
 * Isto aqui só APONTA suspeita, para uma pessoa decidir. NÃO corrige nada, e de propósito: nome é
 * dado de identidade e correção automática pode transformar um nome legítimo em outro nome.
 *
 * Função PURA, sem I/O. Quem chama é o levantamento (`db/nomes-suspeitos.ts`), que grava o resultado
 * num arquivo em vez de despejar nome em log (§A.6).
 */

export type MotivoSuspeita =
  | "TOKEN_REPETIDO"
  | "UMA_PALAVRA"
  | "CARACTERE_ESTRANHO"
  | "ESPACOS_MULTIPLOS"
  | "CAIXA_INCONSISTENTE";

/** Rótulo legível de cada suspeita, para o relatório entregue ao diretor. */
export const ROTULO_SUSPEITA: Readonly<Record<MotivoSuspeita, string>> = {
  TOKEN_REPETIDO: "palavra repetida em sequência",
  UMA_PALAVRA: "nome com uma palavra só",
  CARACTERE_ESTRANHO: "caractere estranho (número, símbolo ou pontuação)",
  ESPACOS_MULTIPLOS: "espaços múltiplos ou sobrando nas pontas",
  CAIXA_INCONSISTENTE: "caixa inconsistente (tudo maiúsculo, tudo minúsculo ou misturada)",
};

/**
 * Severidade do apontamento, para o relatório não afogar o que importa.
 *
 * ALTA: distorce o nome e pode derrubar a conferência da IA contra o documento. É o caso do token
 *       repetido (o da Silvia), do caractere estranho, do nome sem sobrenome e do espaço sobrando.
 * BAIXA: só padronização visual. "MARIA DA SILVA" é o MESMO nome de "Maria da Silva"; a base veio de
 *        planilha em caixa alta, então isso aparece em quase todo cadastro e NÃO foi a causa de
 *        reprovação nenhuma até agora.
 */
export type Severidade = "ALTA" | "BAIXA";

export const SEVERIDADE_DO_MOTIVO: Readonly<Record<MotivoSuspeita, Severidade>> = {
  TOKEN_REPETIDO: "ALTA",
  CARACTERE_ESTRANHO: "ALTA",
  UMA_PALAVRA: "ALTA",
  ESPACOS_MULTIPLOS: "ALTA",
  CAIXA_INCONSISTENTE: "BAIXA",
};

/** Severidade do conjunto de motivos: ALTA se qualquer um for ALTA. */
export function severidadeDe(motivos: MotivoSuspeita[]): Severidade {
  return motivos.some((m) => SEVERIDADE_DO_MOTIVO[m] === "ALTA") ? "ALTA" : "BAIXA";
}

/** Partículas que se repetem legitimamente em nome brasileiro e NÃO contam como token repetido. */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "la", "van"]);

/** Só letras (com acento), espaço, apóstrofo e hífen são esperados num nome. */
const CARACTERE_VALIDO = /^[\p{L}\p{M}\s'’-]+$/u;

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Analisa um nome e devolve os motivos de suspeita (vazio = nada a apontar).
 *
 * Cada critério é conservador de propósito, para o diretor receber uma lista curta e acionável em
 * vez de um despejo do cadastro inteiro:
 *  - TOKEN_REPETIDO: duas palavras iguais EM SEQUÊNCIA (ignorando acento e caixa), fora as partículas
 *    ("de", "da", "dos"...). É o caso exato da Silvia.
 *  - UMA_PALAVRA: nome sem sobrenome não dá para conferir contra documento.
 *  - CARACTERE_ESTRANHO: dígito, símbolo ou pontuação no meio do nome.
 *  - ESPACOS_MULTIPLOS: espaço duplicado ou sobra nas pontas.
 *  - CAIXA_INCONSISTENTE: TUDO MAIÚSCULO, tudo minúsculo, ou uma palavra fora do padrão das outras.
 */
export function motivosDeSuspeita(nomeOriginal: string): MotivoSuspeita[] {
  const nome = nomeOriginal ?? "";
  const motivos: MotivoSuspeita[] = [];
  if (!nome.trim()) return motivos;

  if (nome !== nome.trim() || /\s{2,}/.test(nome)) motivos.push("ESPACOS_MULTIPLOS");
  if (!CARACTERE_VALIDO.test(nome.trim())) motivos.push("CARACTERE_ESTRANHO");

  const palavras = nome.trim().split(/\s+/);
  if (palavras.length < 2) motivos.push("UMA_PALAVRA");

  const chave = (p: string) => semAcento(p).toLowerCase();
  for (let i = 1; i < palavras.length; i++) {
    const atual = chave(palavras[i]);
    if (!atual || PARTICULAS.has(atual)) continue;
    if (atual === chave(palavras[i - 1])) {
      motivos.push("TOKEN_REPETIDO");
      break;
    }
  }

  if (caixaInconsistente(palavras)) motivos.push("CAIXA_INCONSISTENTE");
  return motivos;
}

/** TUDO MAIÚSCULO, tudo minúsculo, ou mistura de padrões entre as palavras significativas. */
function caixaInconsistente(palavras: string[]): boolean {
  const significativas = palavras.filter((p) => !PARTICULAS.has(semAcento(p).toLowerCase()));
  if (significativas.length === 0) return false;
  const letras = significativas.join("");
  if (!/\p{L}/u.test(letras)) return false;
  if (letras === letras.toUpperCase()) return true; // TUDO MAIÚSCULO
  if (letras === letras.toLowerCase()) return true; // tudo minúsculo
  // Mistura: alguma palavra significativa não está em "Capitalizada".
  return significativas.some((p) => {
    const primeira = p.slice(0, 1);
    const resto = p.slice(1);
    return primeira !== primeira.toUpperCase() || resto !== resto.toLowerCase();
  });
}
