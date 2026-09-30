import { type CandidaturaSituacao } from "@ea/shared-types";

/**
 * ─ A RÉGUA DA PONTE A&S PARA A ADMISSÃO, COMO DOMÍNIO PURO ─────────────────────────────────────
 *
 * ESTE ARQUIVO NÃO TEM CONSULTA, NÃO TEM NEST E NÃO TEM BANCO. Ele responde UMA pergunta, e só
 * ela: a linha de de/para que acabou de ser resolvida PEDE que uma pré-admissão nasça?
 *
 * ┌─ POR QUE A PERGUNTA É UMA FUNÇÃO, E NÃO UM `if` NO CICLO ────────────────────────────────────┐
 * │ É a mesma correção que o `seguranca` cobrou na ingestão do Digai (`situacaoDeNascimentoDigai`,│
 * │ `domain/digai.ts`): a situação que chega vem da LINHA do de/para, que é DADO editável, e não  │
 * │ código. Um `situacao === 'ENVIADO_PARA_ADMISSAO'` escrito no meio do ciclo é uma régua solta: │
 * │ o dia em que existir um segundo caminho de gravação, ele vai ter a própria cópia da régua, e   │
 * │ as duas concordam até a primeira vez que alguém corrigir uma só. Aqui a régua tem UM dono e   │
 * │ UM teste puro.                                                                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * AS SITUAÇÕES QUE PEDEM PONTE, em lista FECHADA.
 *
 * ┌─ SÓ `ENVIADO_PARA_ADMISSAO`, E O RECORTE É O DO CAMINHO MANUAL ──────────────────────────────┐
 * │ No funil operado por gente, quem faz nascer a pré-admissão é exatamente a saída               │
 * │ `ENVIADO_PARA_ADMISSAO` (`as/candidatos/candidatos.service.ts`, `registrarSaida`). `APROVADO` │
 * │ e `ALOCADO` também CONSOMEM POSIÇÃO da vaga e NÃO criam admissão nenhuma: aprovar é decisão de │
 * │ seleção, alocar é entrega de posição, e nenhuma das duas é "esta pessoa vai ser admitida".     │
 * │ Uma lista mais larga aqui faria a varredura abrir admissão para gente que o time ainda está    │
 * │ conversando, e admissão criada é muito mais caro de desfazer do que etapa trocada.             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO: readonly CandidaturaSituacao[] = [
  "ENVIADO_PARA_ADMISSAO",
];

/** O que a leitura da linha de de/para devolve para quem vai gravar. */
export interface DesfechoDaIngestaoExterna {
  /** A situação a gravar na candidatura. Nulo quer dizer "o de/para não fala de desfecho". */
  situacao: CandidaturaSituacao | null;
  /** Aquela situação pede que uma pré-admissão nasça? */
  pedePonteParaAdmissao: boolean;
}

/**
 * A LEITURA, E ELA NÃO MUDA A SITUAÇÃO QUE RECEBEU.
 *
 * A situação segue intacta de propósito: quem decide o que escrever na candidatura continua sendo o
 * de/para (configuração revisada), e esta função só acrescenta a SEGUNDA resposta, que antes não
 * existia. Peneirar a situação aqui criaria um segundo dono de uma decisão que já tem dono
 * (`lerLinhaDePara`, em `domain/as-etapa-externa.ts`, que já recusa valor fora do vocabulário).
 *
 * SITUAÇÃO AUSENTE NUNCA PEDE PONTE. É o estado normal de toda pasta que não é desfecho, e o
 * fail-closed importa: pasta sem desfecho traduzido não pode virar admissão por omissão.
 */
export function desfechoDaIngestaoExterna(
  daLinhaDeDePara: CandidaturaSituacao | null | undefined,
): DesfechoDaIngestaoExterna {
  const situacao = daLinhaDeDePara ?? null;
  return {
    situacao,
    pedePonteParaAdmissao:
      situacao !== null && SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO.includes(situacao),
  };
}
