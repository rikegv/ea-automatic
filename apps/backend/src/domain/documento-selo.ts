/**
 * SELO DO CARD DE DOCUMENTO: quando um documento em AGUARDANDO_AUDITORIA é, na verdade, uma REPROVAÇÃO.
 *
 * POR QUE EXISTE. O card da aba Auditoria deriva o selo do `estado` do documento. Um documento
 * reprovado pela auditoria automática PELO PORTAL fica em `AGUARDANDO_AUDITORIA`: o Portal grava o
 * MOTIVO da reprovação em `observacao`, mas NÃO rebaixa o estado (comportamento de sempre do Portal,
 * `portal-credencial.service.ts`, ramo INCONFORME/PENDENTE). Resultado: o selo exibia "Aguardando
 * auditoria" enquanto o motivo de recusa aparecia logo abaixo. O time lia "aguardando" e não via a
 * reprovação. Esta função é a régua que separa os dois casos, para o selo acompanhar o resultado real.
 *
 * A DECISÃO É PELO ESTADO REAL DO DOCUMENTO, não por tabela paralela. `documentos_admissao.observacao`
 * é o que a tela mostra e o que o ÚLTIMO veredito escreveu; é a fonte da verdade do que está na casa
 * AGORA. (O `portal_credenciais.reprovado_em` é o livro-razão do teto de tentativas, por envio, e pode
 * divergir do estado exibido quando houve reenvio; por isso NÃO é a fonte do selo.)
 *
 * OS CASOS DE AGUARDANDO_AUDITORIA, e por que só UM é reprovação:
 *  - COLETADO sem veredito (régua ou ASO): "Documento coletado..." / "ASO anexado...". NÃO é recusa.
 *  - PARADA DE SISTEMA (quota, motor fora, credencial, inesperado): `MOTIVO_FALHA_IA`. O documento
 *    está íntegro, a falha é NOSSA. NÃO é recusa.
 *  - SUSPEITA DE AUTENTICIDADE (`conferir_autenticidade`): veredito VALIDADO esperando conferência
 *    HUMANA (§A.38). NÃO é recusa, é um documento aprovado à espera de olho humano.
 *  - VEREDITO DE REPROVAÇÃO gravado pelo Portal (INCONFORME/PENDENTE): a `observacao` é o motivo da
 *    recusa da IA. É ESTE, e só este, que vira "Reprovado".
 *
 * §A.6: opera só sobre `estado`, a marca de autenticidade e `observacao` (texto PII-free por
 * construção, já exibido na tela). Não lê nem registra dado do candidato. Módulo PURO: sem I/O, sem Nest.
 */
import { ESTADO_AGUARDANDO_AUDITORIA, OBSERVACAO_COLETADO_AGUARDANDO } from "./auditoria";
import { MOTIVO_FALHA_IA } from "./falha-auditoria";

/**
 * Prefixo da observação de COLETA do ASO (`EsteiraService.anexarAso`), cujo texto é parametrizado
 * pelos bytes recebidos ("ASO anexado (N bytes), aguardando a análise por I.A."), então o casamento
 * aqui é por prefixo, não por igualdade. É o único texto de espera não-constante.
 */
export const PREFIXO_OBSERVACAO_ASO_COLETADO = "ASO anexado";

/**
 * Observações que NÃO são reprovação, por igualdade exata: a coleta da régua e todas as paradas de
 * sistema. Montada a partir das MESMAS constantes que os escritores usam, para não divergir.
 */
const OBSERVACOES_NAO_REPROVACAO: ReadonlySet<string> = new Set<string>([
  OBSERVACAO_COLETADO_AGUARDANDO,
  ...Object.values(MOTIVO_FALHA_IA),
]);

/** A `observacao` é de ESPERA (coleta) ou PARADA de sistema, e portanto não é um veredito de recusa. */
function observacaoNaoEhReprovacao(observacao: string): boolean {
  if (OBSERVACOES_NAO_REPROVACAO.has(observacao)) return true;
  return observacao.startsWith(PREFIXO_OBSERVACAO_ASO_COLETADO);
}

/**
 * O documento foi REPROVADO pela auditoria e está preso em AGUARDANDO_AUDITORIA (caminho do Portal).
 *
 * Verdadeiro SOMENTE quando: estado é AGUARDANDO_AUDITORIA, não há marca de autenticidade (que é
 * documento aprovado à espera de humano, não recusa), e a `observacao` é um veredito de reprovação
 * (há motivo gravado, e ele não é texto de coleta nem de parada de sistema). A presença do motivo é
 * condição NECESSÁRIA: sem `observacao`, o documento é só "aguardando de verdade" e retorna falso.
 *
 * Documento já em INCONFORME (reprovação do upload manual) NÃO passa por aqui: ele tem estado próprio
 * e selo próprio ("Inconforme"), fora do escopo desta régua.
 */
export function documentoReprovadoNaAuditoria(doc: {
  estado: string | null | undefined;
  observacao: string | null | undefined;
  conferirAutenticidade?: boolean | null;
}): boolean {
  if (doc.estado !== ESTADO_AGUARDANDO_AUDITORIA) return false;
  if (doc.conferirAutenticidade === true) return false;
  const observacao = doc.observacao;
  if (!observacao || observacao.trim() === "") return false;
  if (observacaoNaoEhReprovacao(observacao)) return false;
  return true;
}
