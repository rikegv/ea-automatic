/**
 * Mapeamento PURO do veredito da IA (AuditoriaStatus) para o estado persistido do documento
 * (§A.3 regra 7 — só status, nunca o arquivo). Centraliza a tradução que o `AuditoriaService`
 * aplica ao gravar `documentos_admissao.estado`. Testável isoladamente.
 */
import { AUDITORIA_PARA_ESTADO, type AuditoriaStatus } from "@ea/shared-types";

export type EstadoDocumentoPersistido = "PENDENTE" | "ENTREGUE" | "INCONFORME";

/**
 * Estado de documento COLETADO porém ainda NÃO auditado (desacoplamento coleta/auditoria). Gravado
 * ANTES de chamar a IA; se a IA cair, o documento permanece neste estado (coleta preservada,
 * auditoria pendente, reprocessável). Não é veredito da IA, por isso fica fora de `EstadoDocumentoPersistido`.
 */
export const ESTADO_AGUARDANDO_AUDITORIA = "AGUARDANDO_AUDITORIA" as const;

/** Veredito da IA → estado_documento. VALIDADO→ENTREGUE, INCONFORME→INCONFORME, PENDENTE→PENDENTE. */
export function estadoDocumentoDeAuditoria(status: AuditoriaStatus): EstadoDocumentoPersistido {
  return AUDITORIA_PARA_ESTADO[status];
}

/** Estado que `decidirDestino` pode gravar: o veredito persistido OU a coleta sem veredito. */
export type EstadoDestinoDocumento =
  | EstadoDocumentoPersistido
  | typeof ESTADO_AGUARDANDO_AUDITORIA;

/** O destino de um documento após o veredito da IA: o estado a gravar e se vai a conferência humana. */
export interface DestinoDocumento {
  estado: EstadoDestinoDocumento;
  /** Marca "conferir autenticidade": o documento vai para a fila HUMANA em vez de auto-aprovar. */
  conferirAutenticidade: boolean;
}

/**
 * O CHOKEPOINT da auto-aprovação (§A.38, decisão do diretor). A IA valida DADO e REGRA, não
 * AUTENTICIDADE, e no caminho feliz não há humano: um documento forjado com os dados certos passava
 * direto a ENTREGUE. Esta função é a rede embaixo desse caminho, e é a ÚNICA porta por onde um
 * veredito da IA vira estado de documento auto-aprovado.
 *
 * ORTOGONALIDADE (ver `ResultadoAuditoria` em shared-types): `autenticidadeSuspeita` NÃO rebaixa o
 * `status` (um VALIDADO continua VALIDADO para a IA). O que muda é o DESTINO: um VALIDADO suspeito
 * NÃO é auto-aprovado; fica em AGUARDANDO_AUDITORIA com a marca `conferirAutenticidade`, e vai para a
 * conferência HUMANA (a saída humana limpa a marca, `validacao-humana.service`). Precedência humana
 * sobre a IA.
 *
 * Tabela-verdade EXATA:
 *  - VALIDADO   + suspeita=false → { ENTREGUE,              conferir=false }
 *  - VALIDADO   + suspeita=true  → { AGUARDANDO_AUDITORIA,  conferir=true  }  (NUNCA ENTREGUE)
 *  - INCONFORME + (qualquer)     → { INCONFORME,            conferir=false }
 *  - PENDENTE   + (qualquer)     → { PENDENTE,              conferir=false }  (como hoje)
 *
 * Pura e sem efeito: o chamador é quem grava. `autenticidadeSuspeita` opcional, `undefined` = false
 * (sem sinais de autenticidade cadastrados, o comportamento é idêntico ao de hoje).
 */
export function decidirDestino(
  status: AuditoriaStatus,
  autenticidadeSuspeita?: boolean,
): DestinoDocumento {
  if (status === "VALIDADO" && autenticidadeSuspeita === true) {
    return { estado: ESTADO_AGUARDANDO_AUDITORIA, conferirAutenticidade: true };
  }
  return { estado: AUDITORIA_PARA_ESTADO[status], conferirAutenticidade: false };
}

/** Categoria da regra de auditoria, espelha o enum do banco (§A.38). */
export type CategoriaRegraAuditoria = "CONFORMIDADE" | "AUTENTICIDADE";

/**
 * Separa as regras ativas de um tipo nos DOIS blocos que a IA recebe (§A.38): CONFORMIDADE (dirige o
 * `status`) e SINAIS DE AUTENTICIDADE (ortogonais). Pura: o chamador faz a I/O da leitura. Ambos os
 * blocos carregam só `{ descricaoRegra }`, que é o que viaja para o ai-service (texto, sem PII).
 */
export function separarRegrasPorCategoria(
  linhas: Array<{ descricaoRegra: string; categoria: CategoriaRegraAuditoria }>,
): {
  regras: Array<{ descricaoRegra: string }>;
  sinaisAutenticidade: Array<{ descricaoRegra: string }>;
} {
  const regras: Array<{ descricaoRegra: string }> = [];
  const sinaisAutenticidade: Array<{ descricaoRegra: string }> = [];
  for (const l of linhas) {
    const destino = l.categoria === "AUTENTICIDADE" ? sinaisAutenticidade : regras;
    destino.push({ descricaoRegra: l.descricaoRegra });
  }
  return { regras, sinaisAutenticidade };
}

/** Trunca o motivo do veredito para caber em `observacao` (cap defensivo — sem PII, §A.6). */
export function limitarMotivo(motivo: string | null | undefined, max = 500): string {
  return (motivo ?? "").slice(0, max);
}

/**
 * O rótulo curto do aviso, Title Case (§A.24). É a primeira coisa que o humano da fila lê, e por
 * isso é a última coisa que o corte pode remover.
 */
export const ROTULO_SUSPEITA_AUTENTICIDADE = "Suspeita De Autenticidade";

/**
 * O AVISO INTEIRO, TEXTO FIXO NOSSO. Nada que a IA escreveu é interpolado aqui, e é isso que torna
 * a `observacao` PII-free POR CONSTRUÇÃO, em vez de por confiar que o modelo obedeceu à instrução.
 */
export const AVISO_SUSPEITA_AUTENTICIDADE =
  `${ROTULO_SUSPEITA_AUTENTICIDADE}. Conferir a via oficial antes de aceitar.` as const;

/**
 * A OBSERVAÇÃO QUE O HUMANO DA FILA LÊ, e o conserto de uma marca que era ESCRITA E NUNCA LIDA.
 *
 * `conferir_autenticidade` e `autenticidade_motivo` eram gravados e nenhuma tela os mostrava
 * (medido: zero ocorrência no frontend). O documento suspeito chegava à fila como "Aguardando
 * auditoria" exibindo a `observacao` do veredito de CONFORMIDADE, que diz que ele está bom: o
 * consultor conferia sem saber que a parada era suspeita de autenticidade. A conferência humana só
 * funciona se o humano souber que há o que conferir.
 *
 * A SAÍDA É A `observacao` DO PRÓPRIO VEREDITO, prefixada. Nenhum campo novo no contrato e nenhuma
 * linha a mais em `esteira.service.ts`, que é código validado de outra frente (§A.26). O campo
 * próprio com badge na modal é proposta ao diretor, não se constrói aqui.
 *
 * O CRITÉRIO CRU DA IA NÃO ENTRA, E O PARÂMETRO NEM EXISTE. O aviso é TEXTO FIXO do EA: a
 * `observacao` é lida pela Esteira e está a um `select` de distância de superfícies que não são a
 * fila do consultor, então concatenar texto livre do modelo acoplaria conteúdo dele a uma coluna
 * que não tem como garantir o que recebe. Receber `autenticidadeMotivo` e não usá-lo seria o convite
 * para alguém interpolar depois, então ele fica FORA da assinatura. O critério continua gravado em
 * `documentos_admissao.autenticidade_motivo` pelos dois chamadores: nada se perde, e é de lá que a
 * tela da opção (b) vai lê-lo quando o diretor aprovar.
 *
 * FUNÇÃO ÚNICA PARA OS DOIS ESCRITORES (`auditoria.service` no passo 5 e `portal-credencial.service`
 * na confirmação do candidato): a mesma frase nos dois caminhos por construção, não por cópia.
 *
 * ORDEM = PRIORIDADE NO CORTE. O aviso vem PRIMEIRO e o motivo do veredito vem depois, então o cap
 * de tamanho só come a cauda: o aviso de suspeita nunca é perdido, qualquer que seja o tamanho do
 * motivo. Era o requisito explícito, e a ordenação é o que o garante sem contabilidade de bytes.
 *
 * SEM SUSPEITA, O TEXTO NÃO MUDA UM BYTE: o retorno é exatamente `limitarMotivo(motivo)`, que é o
 * que os dois chamadores já gravavam. Nenhum documento sem suspeita tem a observação alterada.
 *
 * §A.11: sem travessão. §A.24: rótulo em Title Case, frase de apoio em escrita normal.
 */
export function observacaoDoVeredito(
  entrada: {
    motivo?: string | null;
    /** `destino.conferirAutenticidade`, nunca o `autenticidadeSuspeita` cru: quem decide é `decidirDestino`. */
    suspeita: boolean;
  },
  max = 500,
): string {
  if (!entrada.suspeita) return limitarMotivo(entrada.motivo, max);
  const motivo = (entrada.motivo ?? "").trim();
  const cauda = motivo ? ` Motivo do veredito: ${motivo}` : "";
  return `${AVISO_SUSPEITA_AUTENTICIDADE}${cauda}`.slice(0, max);
}
