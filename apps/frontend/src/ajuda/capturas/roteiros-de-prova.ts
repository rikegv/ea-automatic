/**
 * ─ A EXCEÇÃO DECLARADA: ROTEIROS QUE EXISTEM PARA PROVAR O MOTOR ───────────────────────────────
 *
 * A varredura de coerência cruza artigo e roteiro pelo nome do arquivo e acusa duas coisas: PNG
 * ÓRFÃO (o roteiro produz imagem que artigo nenhum mostra) e ROTEIRO SEM ARTIGO. As duas estão
 * certas, e o que elas protegem é concreto: imagem que passa pelo gate entra no repositório PARA
 * SEMPRE, e imagem que nenhum artigo mostra é custo permanente que ninguém nunca lê.
 *
 * Só existe UM caso legítimo de roteiro sem artigo, e é o artefato de PROVA DO MOTOR: o roteiro que
 * existe para exercitar a captura, a anotação e os gates contra uma tela real, em geral antes de o
 * conteúdo existir. Ele é pedido pelo próprio plano (provar o motor em um roteiro só, de uma tela
 * sem dado de pessoa, antes de qualquer captura em lote).
 *
 * ┌─ POR QUE A EXCEÇÃO É DECLARADA AQUI, E NÃO IMPLÍCITA ────────────────────────────────────────┐
 * │ Implícita, ela é o estado de hoje: um caso legítimo deixando dois testes vermelhos. Teste       │
 * │ vermelho por motivo legítimo não fica vermelho por muito tempo: na próxima sessão ele vira "o   │
 * │ teste está chato", e o conserto que aparece é AFROUXAR A VARREDURA INTEIRA para calar um caso   │
 * │ só. Aí o PNG órfão de verdade passa a entrar sem alarme, que é precisamente o que a varredura   │
 * │ existia para impedir. Declarada, a exceção é conferível, tem dono e aparece no diff.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTA LISTA NÃO É, e esta é a metade que importa ──────────────────────────────────────┐
 * │ ELA NÃO É ONDE SE PÕE ROTEIRO CUJO ARTIGO AINDA NÃO FOI ESCRITO. Roteiro sem artigo por atraso │
 * │ de conteúdo TEM DE CONTINUAR VERMELHO: é exatamente o defeito que a varredura existe para      │
 * │ pegar, e adiar o artigo é como um manual fica com imagem que não ensina nada.                  │
 * │                                                                                                │
 * │ A lista é pequena por natureza, e o dia em que ela CRESCER não é sinal de que o motor precisa   │
 * │ de mais provas: é sinal de que alguém a está usando para calar o teste. Entrada nova aqui pede  │
 * │ uma linha dizendo o que ela prova e quando sai.                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E NÃO É LICENÇA PARA GRAVAR: o roteiro de prova roda em ENSAIO (`pnpm ajuda:capturar --slug=...
 * --ensaio`), que anota, mede e passa pelos gates sem escrever imagem. Se um dia ele precisar gravar
 * de verdade, o print que ele produzir é órfão de fato, e a resposta certa é escrever o artigo, não
 * alongar esta lista.
 */
export const ROTEIROS_DE_PROVA_DO_MOTOR: readonly string[] = [
  /**
   * `tarifas-de-transporte`: a tela escolhida para provar o motor porque ela NÃO tem dado de pessoa
   * (tabela de tarifa pública: cidade, transporte, valor), e o plano proíbe captura em lote antes do
   * veredito do `seguranca` sobre o gate de PII. Ela também exercita o defeito conhecido do spike: o
   * primeiro alvo é o TÍTULO, colado no topo, que é onde o rótulo saía cortado.
   *
   * SAI DESTA LISTA quando existir artigo de Tarifas De Transporte, e aí ela volta a ser um roteiro
   * comum, conferido pela varredura como todos os outros.
   */
  "tarifas-de-transporte",
];

/** Serve à varredura: o roteiro está declarado como artefato de prova do motor? */
export function ehRoteiroDeProvaDoMotor(slug: string): boolean {
  return ROTEIROS_DE_PROVA_DO_MOTOR.includes(slug);
}
