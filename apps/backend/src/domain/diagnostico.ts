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
  /** Admissão afetada, quando o sinal é por admissão. Ausente em sinais sem admissão (coleta de VT). */
  admissaoId?: string;
  /** Nome do candidato (aceitável, CPF não). Ausente quando o sinal não é ligado a uma pessoa. */
  candidato?: string;
  detalhe: string;
  /** Há quanto tempo (horas), quando o sinal tem antiguidade (paradoHa, staging, etc.). */
  horas?: number;
  /**
   * Prefixo do md5 do arquivo (coleta de VT). NÃO é PII (§A.6): o nome do objeto no bucket contém
   * NOME+CPF e nunca é persistido, então o admin localiza o arquivo navegando o bucket pelo digest.
   */
  md5Prefixo?: string;
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
  /** Estado do scheduler da coleta de VT (§A.17 etapa 3). Opcional para compat. */
  vtColeta?: EstadoSchedulerVtColetaSnapshot;
  /** Estado do scheduler da assinatura Clicksign (INT-4). Opcional para compat. */
  clicksign?: EstadoSchedulerClicksignSnapshot;
  /** Estado do verificador de status do Exame (OST Onda 2). Opcional para compat. */
  exame?: EstadoSchedulerExameSnapshot;
  /** Resumo para o alerta (Bloco 7). */
  alerta: ResumoAlerta;
}

/**
 * Bloco do scheduler da COLETA DE VT na tela (§A.17 etapa 3): liga/desliga, se está parado e o
 * resultado do último ciclo (varridas/novos/semAdmissao/falhas). Espelha o bloco do Pandapé, com a
 * contagem extra `semAdmissao` (arquivos varridos que não casaram com admissão viva).
 */
export interface EstadoSchedulerVtColetaSnapshot {
  ligado: boolean;
  parado: boolean;
  ultimoCicloEm: string | null;
  ultimoCicloOkEm: string | null;
  varridas: number;
  novos: number;
  semAdmissao: number;
  falhas: number;
  abortado: boolean;
  nota: string | null;
}

/**
 * Bloco do scheduler da ASSINATURA (INT-4): liga/desliga, se está parado e o resultado do último
 * ciclo. Espelha os outros dois, trocando as contagens pelas que fazem sentido aqui: `assinados`
 * (envelopes que fecharam e foram arquivados no Drive) e `expirados` (passaram do prazo de 30 dias).
 */
export interface EstadoSchedulerClicksignSnapshot {
  ligado: boolean;
  parado: boolean;
  ultimoCicloEm: string | null;
  ultimoCicloOkEm: string | null;
  varridas: number;
  assinados: number;
  expirados: number;
  falhas: number;
  nota: string | null;
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

/**
 * Bloco do VERIFICADOR DO EXAME na tela (OST Onda 2). Espelha os outros três, trocando as contagens
 * pelas que fazem sentido aqui: quantas frentes ele moveu para cada estado de espera no último ciclo,
 * e quantas estão nesses estados AGORA (que é o número que o time usa para agir).
 */
export interface EstadoSchedulerExameSnapshot {
  ligado: boolean;
  parado: boolean;
  ultimoCicloEm: string | null;
  ultimoCicloOkEm: string | null;
  varridas: number;
  aguardando: number;
  pendentes: number;
  falhas: number;
  nota: string | null;
  /** Quantas frentes estão AGORA em cada espera (não é do ciclo, é o estado da fila). */
  totalAguardando: number;
  totalPendentes: number;
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
