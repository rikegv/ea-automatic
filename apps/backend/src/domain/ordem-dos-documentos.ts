import type { ExigenciaDocumento } from "@ea/shared-types";

/**
 * ══ A ORDEM EM QUE O CANDIDATO VÊ OS DOCUMENTOS, EM UM LUGAR SÓ ═══════════════════════════════
 *
 * PURA E ISOLADA DE PROPÓSITO. A ordem é decisão do DIRETOR, e decisão de diretor muda: trocar de
 * leitura tem de ser mexer nesta função de poucas linhas, e não caçar um `sort` dentro de um
 * serviço com consulta, trilha e estado no meio. Também é o que permite testá-la sem banco.
 *
 * ══ QUEM LÊ ISTO, E SÃO DOIS, POR EXIGÊNCIA DO PRÓPRIO DESENHO ════════════════════════════════
 *
 *  1. `PortalDocumentosService.passos` (a trilha da Sol), que é a tela do candidato;
 *  2. `ReguaCompletudeService.proximoObrigatorioPendenteMap`, a coluna "Documento Atual" do
 *     Gerenciador do Portal, que responde "em que documento esta pessoa está".
 *
 * OS DOIS TÊM DE CONCORDAR, e essa é a razão de a régua ter saído do serviço. A coluna do RH diz
 * qual é o PRÓXIMO da fila do candidato; se ela ordenar por uma régua e a tela dele por outra, o
 * RH cobra um documento e a pessoa está olhando outro. O comentário daquele método já registrava a
 * dependência ("a ordem é a mesma que o candidato vê") quando a régua era só o nome; agora que ela
 * tem uma lista fixa dentro, o acordo passou a ser código compartilhado em vez de promessa.
 */

/**
 * OS SETE PRIMEIROS, NA ORDEM QUE O DIRETOR PEDIU (decisão de 21/09/2026, confirmada por ele em
 * resposta à pergunta do coordenador).
 *
 * São CÓDIGOS do catálogo `tipos_documento`, e não nomes: nome é editável na tela da Régua (§A.3,
 * catálogo VIVO) e uma renomeação para corrigir grafia mudaria a ordem sem ninguém perceber. O
 * `codigo` é a identidade técnica, e a própria tela de tipos recusa regerá-lo ao renomear.
 *
 * ┌─ CUIDADO QUE CUSTOU UMA CORREÇÃO: SÃO DOIS DOCUMENTOS DE CERTIDÃO, E O DA LISTA É O COMBINADO ┐
 * │ O catálogo tem `CERTIDAO_CASAMENTO` ("Certidão de Casamento") E `CERTIDAO_NASC_CASAMENTO`     │
 * │ ("Certidão de Nascimento ou Casamento"). O diretor escreveu "Certidão de Casamento" e a       │
 * │ leitura literal apontou para o primeiro; perguntado, ele esclareceu que o que o time usa é o  │
 * │ COMBINADO. `CERTIDAO_CASAMENTO` NÃO entra nesta lista e segue com os demais, sem ordem nova.  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE NÃO ESTÁ AQUI NÃO GANHA "POSIÇÃO VAZIA". Esta lista ordena o que EXISTE na admissão; ela
 * não cria casa nenhuma. Documento que a régua do cargo não pede simplesmente não aparece na
 * trilha, porque os passos saem de `documentos_admissao` (ver o cabeçalho de
 * `portal-documentos.service.ts`), e é isso que faz o exemplo do diretor acontecer: "se o cargo
 * não pede, pula".
 */
export const DOCUMENTOS_EM_ORDEM_FIXA: readonly string[] = [
  "RG",
  "CPF",
  "COMPROVANTE_RESIDENCIA",
  "DADOS_BANCARIOS",
  "COMPROVANTE_ESCOLARIDADE",
  "CTPS",
  "CERTIDAO_NASC_CASAMENTO",
] as const;

/** Posição na lista fixa; quem não está nela vai para o fim, empatado, e desempata pelo nome. */
export function posicaoNaOrdemFixa(codigoTipoDocumento: string): number {
  const i = DOCUMENTOS_EM_ORDEM_FIXA.indexOf(codigoTipoDocumento);
  return i === -1 ? DOCUMENTOS_EM_ORDEM_FIXA.length : i;
}

/**
 * MEDIDO, e é a medição que originou a régua da exigência: a régua média tem 11 linhas e a maior
 * tem 32. Numa lista desse tamanho, no celular, o que está no topo é o que é feito; o facultativo
 * disputando espaço com o obrigatório custa o documento que segura a admissão.
 */
const PESO_EXIGENCIA: Record<ExigenciaDocumento, number> = {
  OBRIGATORIO: 0,
  FACULTATIVO: 1,
  NAO_OBRIGATORIO: 2,
};

/** O mínimo que a comparação precisa saber. Serve tanto ao passo da trilha quanto à linha do RH. */
export interface DocumentoOrdenavel {
  codigoTipoDocumento: string;
  nome: string;
  exigencia: ExigenciaDocumento;
}

/**
 * ══ A CHAVE: (exigência, posição na lista dos 7, nome) ════════════════════════════════════════
 *
 * ┌─ AS DUAS LEITURAS POSSÍVEIS DO PEDIDO, E QUAL ESTÁ ATIVA ───────────────────────────────────┐
 * │ (A) ATIVA. Os 7 valem DENTRO de cada faixa de exigência: obrigatórios primeiro (e, entre     │
 * │     eles, os 7 na ordem pedida), depois facultativos, depois o que ninguém cobra.            │
 * │ (B) Os 7 estritamente primeiro, seja qual for a exigência, e o resto atrás.                  │
 * │                                                                                               │
 * │ O DIRETOR ESCOLHEU A (21/09/2026), respondendo à pergunta do coordenador. Trocar para B é    │
 * │ mover a comparação da posição para ANTES da comparação do peso, nesta função, e mais nada.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MOTIVO É MEDIDO, sobre as 135 réguas de produção: `CERTIDAO_NASC_CASAMENTO` é NÃO OBRIGATÓRIA
 * em 133 delas. Na leitura B, em quase todo cargo um documento que ninguém exige apareceria ANTES
 * dos obrigatórios, que é exatamente o que a régua da exigência foi escrita para evitar. Na
 * leitura A ela cai naturalmente para o fim onde não é cobrada, e os outros seis (obrigatórios em
 * praticamente tudo) abrem a trilha na ordem pedida.
 *
 * O DESEMPATE FINAL CONTINUA SENDO O NOME em pt-BR, que é a ordem que a pessoa consegue prever.
 */
export function compararDocumentosDaTrilha(a: DocumentoOrdenavel, b: DocumentoOrdenavel): number {
  const peso = PESO_EXIGENCIA[a.exigencia] - PESO_EXIGENCIA[b.exigencia];
  if (peso !== 0) return peso;
  const fixa = posicaoNaOrdemFixa(a.codigoTipoDocumento) - posicaoNaOrdemFixa(b.codigoTipoDocumento);
  if (fixa !== 0) return fixa;
  return a.nome.localeCompare(b.nome, "pt-BR");
}
