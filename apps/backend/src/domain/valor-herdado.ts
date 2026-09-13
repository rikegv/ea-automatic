import type { AsValorHerdado } from "@ea/shared-types";

/**
 * ─ A RESOLUÇÃO DA HERANÇA VAGA ← CLIENTE (Onda E), PURA E EM UM LUGAR SÓ ───────────────────────
 *
 * ┌─ A REGRA INTEIRA, EM UMA LINHA ────────────────────────────────────────────────────────────────┐
 * │ NULO na vaga = **HERDA** do cliente. PREENCHIDO na vaga = **SOBREPÕE**, só naquela vaga.       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ELA DEVOLVE A ORIGEM JUNTO DO VALOR, e as duas coisas viajam sempre coladas de propósito: a tela
 * precisa distinguir "este é o comercial do cliente" de "esta vaga escolheu outro", e o diretor
 * precisa enxergar qual vaga foge do padrão do cliente. Devolver só o rótulo faria as duas chegarem
 * idênticas, e a informação de onde o valor veio se perderia antes de sair do backend.
 *
 * ┌─ `AUSENTE` É O CASO MAJORITÁRIO NO COMEÇO, E NÃO UM ERRO ──────────────────────────────────────┐
 * │ São 249 clientes que o diretor vai classificar aos poucos, e a vaga de um cliente ainda sem     │
 * │ segmento não tem de onde herdar. `AUSENTE` também cobre a VAGA SEM CLIENTE, que existe de       │
 * │ verdade (rascunho, e a vaga importada cujo cliente não casou). A tela escreve "não informado"   │
 * │ (§A.11), nunca traço e nunca vazio.                                                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RÓTULO VEM DO JOIN, E ISSO INCLUI O CATÁLOGO **INATIVADO**: a vaga do ano passado continua
 * dizendo de que segmento ela era, e de quem era, mesmo depois de o segmento sair de circulação ou
 * de a pessoa sair da empresa. O join lê a TABELA, não a lista de ativos, e é essa distinção que
 * impede o rótulo de virar um vazio silencioso (o mesmo precedente da etapa fantasma).
 *
 * PURA E SEM BANCO de propósito: é ela que o teste pode exercitar nos quatro estados (sobreposto,
 * herdado, ausente por cliente sem valor, ausente por vaga sem cliente) sem subir nada.
 */
export function resolverHerdado(
  idDaVaga: number | null,
  rotuloDaVaga: string | null,
  idDoCliente: number | null,
  rotuloDoCliente: string | null,
): AsValorHerdado {
  // A SOBREPOSIÇÃO VENCE, e é a primeira pergunta: quem preencheu na vaga decidiu para aquela vaga.
  if (idDaVaga !== null && idDaVaga !== undefined) {
    return { id: idDaVaga, rotulo: rotuloDaVaga ?? null, origem: "SOBREPOSTO" };
  }
  // SEM SOBREPOSIÇÃO, VALE O DO CLIENTE, VIVO: trocar o comercial do cliente troca o desta vaga
  // também, que é a herança viva que o diretor escolheu (12/09).
  if (idDoCliente !== null && idDoCliente !== undefined) {
    return { id: idDoCliente, rotulo: rotuloDoCliente ?? null, origem: "HERDADO" };
  }
  // NEM UM NEM OUTRO. Não é erro: é o cliente ainda não classificado, ou a vaga sem cliente.
  return { id: null, rotulo: null, origem: "AUSENTE" };
}
