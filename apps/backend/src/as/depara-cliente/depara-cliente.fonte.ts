/**
 * A PROCEDÊNCIA DO DE/PARA DE CLIENTE, nomeada UMA vez.
 *
 * Ela existe como constante, e não como literal espalhado, pela mesma razão do `FONTE: FonteExterna`
 * do ciclo: o valor está num CHECK do banco (`ck_as_depara_cliente_vaga_fonte`), então `Planilha` ou
 * `planilha_a_s` não seriam "outra grafia", seriam um `insert` que falha em produção e passa em todo
 * teste com banco fingido. Um lugar só para escrever, e todos os leitores perguntam a ele.
 *
 * HOJE HÁ UMA FONTE SÓ, e a coluna existe assim mesmo: a segunda fonte de tradução de cliente não
 * deve virar uma segunda tabela, que é a lição do `as_depara_etapa_externa` (`PANDAPE` e `DIGAI`
 * convivendo na mesma).
 */
export const FONTE_DO_DEPARA_DE_CLIENTE = "PLANILHA_A_S";
