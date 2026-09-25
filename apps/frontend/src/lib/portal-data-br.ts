/**
 * DATA EM BR É DISPLAY-ONLY na tela do candidato, e este módulo é o único lugar que traduz.
 *
 * POR QUE VIVE FORA DO COMPONENTE, e por que a tradução NÃO pode ir para o backend: o valor do campo
 * de data faz ROUND-TRIP. O candidato confirma exatamente a string que vê, e essa string é
 * persistida em `admissao_dados_gi` e enviada ao G.I. Formatar no backend mudaria o dado que chega ao
 * G.I. Então o servidor emite SEMPRE ISO (`AAAA-MM-DD`), a tela EXIBE BR (`DD/MM/AAAA`), e o que se
 * confirma volta canônico:
 *
 *  - campo NÃO editado: submete o valor ORIGINAL cru do servidor, byte a byte (G.I idêntico a hoje).
 *  - campo EDITADO: submete o canônico ISO de `dataParaCanonico`.
 *
 * As duas funções são o par exato: `dataParaExibicao` ISO para BR, `dataParaCanonico` BR para ISO.
 * Tudo que não casa o formato de data volta INTACTO (RG, CPF, PIS, nome, vazio), porque um número de
 * documento não é uma data e não pode ser remexido.
 *
 * §A.6: funções PURAS. Sem log, sem console, sem rede, sem relógio. Recebem string, devolvem string.
 * §A.11: não produzem texto de UI, então não há travessão a evitar aqui.
 */

// A data ISO que o servidor manda: `AAAA-MM-DD` (aceita barra por robustez de origem). O ano com
// quatro dígitos primeiro é o que distingue de BR e garante a idempotência das duas direções.
const ISO = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
// A data BR que o candidato vê e edita: `DD/MM/AAAA`, dia primeiro, sempre com barra.
const BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Mês 1..12 e dia 1..31, o piso mínimo que separa uma data de um número qualquer de igual forma. */
function mesEDiaValidos(mes: number, dia: number): boolean {
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31;
}

/**
 * ISO para exibição BR. `AAAA-MM-DD` vira `DD/MM/AAAA`. Qualquer outra coisa volta INTACTA: uma data
 * já em BR não casa ISO e retorna como veio, então aplicar duas vezes não estraga (idempotente).
 */
export function dataParaExibicao(valor: string): string {
  const m = ISO.exec(valor);
  if (!m) return valor;
  const [, ano, mes, dia] = m;
  if (!mesEDiaValidos(Number(mes), Number(dia))) return valor;
  return `${dia}/${mes}/${ano}`;
}

/**
 * BR de volta para canônico ISO. `DD/MM/AAAA` vira `AAAA-MM-DD` (sempre com hífen, o formato que o
 * G.I recebe). Qualquer outra coisa volta INTACTA: um valor que não é data BR não é remexido.
 */
export function dataParaCanonico(valor: string): string {
  const m = BR.exec(valor);
  if (!m) return valor;
  const [, dia, mes, ano] = m;
  if (!mesEDiaValidos(Number(mes), Number(dia))) return valor;
  return `${ano}-${mes}-${dia}`;
}
