/**
 * DOMÍNIO PURO da TELA DE DIAGNÓSTICO (OST). Sem I/O: só os tipos do snapshot e a regra do que conta
 * como "problema" para acender o alerta (Bloco 7). O serviço monta os números; aqui mora a decisão.
 *
 * §A.6: nada de PII neste módulo. O nome do candidato, onde a tela precisa identificar a admissão,
 * é montado pelo serviço, não aqui.
 */

/** Estado de uma dependência externa (Bloco 3). `degradado` = responde mas com ressalva. */
export type EstadoDependencia = "ok" | "fora" | "degradado" | "indisponivel";

export interface Dependencia {
  nome: string;
  estado: EstadoDependencia;
  /** Frase curta do que foi verificado e do resultado (sem PII). */
  detalhe: string;
  /** ISO da última verificação. */
  verificadoEm: string;
  /** Último erro conhecido (sem PII), quando houver. */
  ultimoErro?: string;
}

/** Um sinal do Bloco 1/2: contagem + itens afetados (identificados sem CPF/URL). */
export interface Sinal {
  chave: string;
  rotulo: string;
  total: number;
  /** Itens afetados; cada um identificado por admissão (nome do candidato é aceitável, CPF não). */
  itens: SinalItem[];
}

export interface SinalItem {
  admissaoId: string;
  candidato: string;
  detalhe: string;
  /** Há quanto tempo (horas), quando o sinal tem antiguidade (paradoHa, staging, etc.). */
  horas?: number;
}

/** Histórico agregado (Bloco 6). */
export interface HistoricoFamilia {
  familia: string;
  ultimas24h: number;
  ultimos7d: number;
}

export interface DiagnosticoSnapshot {
  geradoEm: string;
  sinais: Sinal[];
  fopagSemPasta: Sinal;
  dependencias: Dependencia[];
  ultimaColeta: {
    quando: string | null;
    candidato: string | null;
    arquivos: number;
    /** Rótulo honesto: é "quando o EA foi buscar", NÃO "quando o candidato enviou". */
    nota: string;
  };
  historico: HistoricoFamilia[];
  /** Estado do scheduler de re-consulta do Pandapé (OST scheduler, Bloco 4). */
  scheduler: EstadoSchedulerSnapshot;
  /** Resumo para o alerta (Bloco 7). */
  alerta: ResumoAlerta;
}

/**
 * Bloco do scheduler na tela (Bloco 4): liga/desliga, se está parado (sem ciclo há mais que o limiar,
 * só quando ligado) e o resultado do último ciclo (varridas/novos/falhas). Alimenta o card e o toggle.
 */
export interface EstadoSchedulerSnapshot {
  ligado: boolean;
  parado: boolean;
  ultimoCicloEm: string | null;
  ultimoCicloOkEm: string | null;
  varridas: number;
  novos: number;
  falhas: number;
  abortado: boolean;
  nota: string | null;
}

export interface ResumoAlerta {
  /** true se há QUALQUER problema (aciona o badge e o popup). */
  aceso: boolean;
  /** Quantos problemas distintos (para o número no badge). */
  total: number;
  /** Motivos curtos, para o popup. */
  motivos: string[];
}

/**
 * REGRA DO QUE ACENDE O ALERTA (Bloco 7), declarada e centralizada. Acende quando:
 *  - qualquer sinal do Bloco 1 estiver acima de zero (coleta perdida, régua fechada sem pasta,
 *    parado > 6h, falha de sistema por família);
 *  - houver cliente Fopag sem pasta mapeada com admissão travada (Bloco 2);
 *  - qualquer dependência externa estiver `fora`.
 *
 * NÃO acende por ruído: dependência `degradado` (responde com ressalva) e `indisponivel` (não deu para
 * checar, ex.: sem credencial em ambiente sem token) NÃO acendem sozinhas, para a tela não piscar
 * vermelho por uma checagem que não pôde rodar. Só `fora` (provado fora do ar) acende.
 */
export function calcularAlerta(
  sinais: Sinal[],
  fopagSemPasta: Sinal,
  dependencias: Dependencia[],
): ResumoAlerta {
  const motivos: string[] = [];

  for (const s of sinais) {
    if (s.total > 0) motivos.push(`${s.rotulo}: ${s.total}`);
  }
  if (fopagSemPasta.total > 0) {
    motivos.push(`${fopagSemPasta.rotulo}: ${fopagSemPasta.total}`);
  }
  for (const d of dependencias) {
    if (d.estado === "fora") motivos.push(`${d.nome} fora do ar`);
  }

  return { aceso: motivos.length > 0, total: motivos.length, motivos };
}
