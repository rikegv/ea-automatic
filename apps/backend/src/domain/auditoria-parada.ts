/**
 * AUDITORIA PARADA: quanto tempo um documento está em `AGUARDANDO_AUDITORIA` e quando isso vira
 * problema visível.
 *
 * POR QUE EXISTE (OST motivo verdadeiro, Bloco 5). `AGUARDANDO_AUDITORIA` é estado de falha de
 * SISTEMA, e falha de sistema não avisa ninguém: o documento simplesmente entra na conta do "que
 * falta" e se confunde com documento que o candidato ainda não mandou. Foi assim que um documento
 * ficou 14h parado e só apareceu porque o diretor abriu aquela admissão por acaso.
 *
 * O QUE ESTE MÓDULO NÃO É: não é um contador permanente na coluna. Isso já foi avaliado e recusado,
 * por ocupar espaço fixo para um estado que quase não existe (1 ocorrência em 16.314 documentos na
 * medição desta OST). O marcador só aparece quando o tempo passa do limiar, e some quando o documento
 * resolve.
 *
 * EMBRIÃO DA TELA DE DIAGNÓSTICO. `resumirParados` é deliberadamente uma função de AGREGAÇÃO sobre
 * uma lista de (estado, atualizadoEm), sem depender de admissão, de tela nem de banco. A tela de
 * diagnóstico que vem depois consome exatamente a mesma função, passando os documentos da base
 * inteira em vez dos de uma admissão só, e recebe pronto o que ela precisa mostrar: quantos estão
 * parados e há quanto tempo está o mais antigo.
 *
 * Módulo PURO: sem I/O, sem Nest, sem PII (§A.6). Só estado e carimbo de tempo.
 */
import { ESTADO_AGUARDANDO_AUDITORIA } from "./auditoria";

/**
 * Limiar a partir do qual a parada fica VISÍVEL: 6 horas. Escolhido pela operação, não pela técnica.
 * Uma auditoria normal leva segundos, então qualquer coisa em horas já é anomalia; 6h é curto o
 * bastante para o documento ser notado no mesmo dia de trabalho e longo o bastante para não acender
 * alarme por um pico do motor de IA no meio da tarde.
 */
export const LIMIAR_AUDITORIA_PARADA_MS = 6 * 60 * 60 * 1000;

/** Documento visto pelo cálculo de parada. Só o que interessa, para servir a qualquer chamador. */
export interface DocumentoParadaEntrada {
  estado: string | null | undefined;
  atualizadoEm: Date | null | undefined;
}

/** Horas inteiras (para baixo) desde o último carimbo. 0 quando não há data. */
export function horasParado(
  atualizadoEm: Date | null | undefined,
  agora: Date = new Date(),
): number {
  if (!atualizadoEm) return 0;
  const ms = agora.getTime() - atualizadoEm.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / (60 * 60 * 1000));
}

/**
 * O documento está PARADO ALÉM DO LIMIAR? Só vale para `AGUARDANDO_AUDITORIA`: os outros estados
 * ou têm veredito (ENTREGUE/INCONFORME) ou são ausência legítima de documento (PENDENTE), e nenhum
 * dos dois é anomalia por ficar parado.
 */
export function auditoriaParada(
  doc: DocumentoParadaEntrada,
  agora: Date = new Date(),
): boolean {
  if (doc.estado !== ESTADO_AGUARDANDO_AUDITORIA) return false;
  if (!doc.atualizadoEm) return false;
  return agora.getTime() - doc.atualizadoEm.getTime() >= LIMIAR_AUDITORIA_PARADA_MS;
}

/** Agregado de paradas. É o formato que a futura tela de diagnóstico consome. */
export interface ResumoParados {
  /** Quantos documentos passaram do limiar. */
  total: number;
  /** Horas do mais antigo entre eles. 0 quando não há nenhum. */
  maisAntigoHoras: number;
}

/**
 * Agrega uma lista qualquer de documentos. Serve para UMA admissão (o marcador do modal) e para a
 * BASE INTEIRA (a tela de diagnóstico), sem mudança nenhuma: a diferença está só em quem monta a
 * lista de entrada.
 */
export function resumirParados(
  docs: DocumentoParadaEntrada[],
  agora: Date = new Date(),
): ResumoParados {
  let total = 0;
  let maisAntigoHoras = 0;
  for (const d of docs) {
    if (!auditoriaParada(d, agora)) continue;
    total += 1;
    const h = horasParado(d.atualizadoEm, agora);
    if (h > maisAntigoHoras) maisAntigoHoras = h;
  }
  return { total, maisAntigoHoras };
}
