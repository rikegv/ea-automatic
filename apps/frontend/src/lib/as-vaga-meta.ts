/**
 * ─ A REDUÇÃO DA META DE POSIÇÕES: O AVISO ANTES E O RASTRO DEPOIS ─────────────────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────────────────────────┐
 * │ A auditoria de segurança provou que o gate de Master do fechamento era CONTORNÁVEL sem tocar  │
 * │ no gate: `fechar()` recusa enquanto sobra posição OFICIAL em aberto, mas a meta é editável por │
 * │ uma rota irmã (`PATCH /as/vagas/:id/posicoes`). Baixando a meta até o número já entregue, a    │
 * │ subtração dava zero e a vaga fechava pela porta NORMAL: sem Master, sem forçar e com a trilha │
 * │ do forçamento em branco.                                                                      │
 * │                                                                                               │
 * │ A DECISÃO DO DIRETOR É RASTRO, E NÃO TRAVA. Baixar a meta continua sendo do consultor: existe  │
 * │ vaga que encolhe de verdade, e travar isso pararia operação legítima para impedir um gesto que │
 * │ é legítimo na imensa maioria das vezes. O que muda é que o gesto deixa de ser SILENCIOSO.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SÃO DUAS PEÇAS, E AS DUAS SÃO DE TEXTO, por isso moram aqui e não dentro da tela: o AVISO que a
 * pessoa lê antes de confirmar e a FRASE do rastro que o painel da vaga mostra depois. Frase escrita
 * no meio de um componente de três mil linhas não tem como ser afirmada, e as duas erram em silêncio
 * quando erram (um "de undefined para 1" continua renderizando).
 *
 * O AVISO APARECE SÓ NA REDUÇÃO, e essa régua é o coração da peça. AUMENTAR a meta não contorna gate
 * nenhum: afasta o fechamento em vez de aproximá-lo. Avisar no caso inofensivo treinaria a pessoa a
 * fechar o diálogo sem ler, e o aviso que importa chegaria já ignorado.
 *
 * O TEXTO DIZ O DE/PARA CONCRETO, e não uma frase genérica sobre registro. "Esta ação fica
 * registrada" não informa nada a quem está baixando de 5 para 1: é o tamanho do gesto que faz a
 * pessoa parar e conferir se era isso mesmo que ela queria.
 *
 * E É TRANSPARÊNCIA, NÃO ACUSAÇÃO. O consultor TEM o direito de baixar a meta, então o texto informa
 * que fica registrado e quem registrou, e nada além. Um aviso com tom de flagrante transformaria uma
 * operação normal em suspeita, e ensinaria o time a evitar a tela em vez de usá-la.
 *
 * §A.6: números de posições da vaga, um nome de usuário INTERNO e uma data. Nenhum dado de
 * candidato, nenhum CPF.
 * §A.11 (sem travessão, ausência é "não informado"), §A.24 (as frases daqui são apoio e mensagem de
 * diálogo, escrita normal; o título em title case mora na tela).
 */

import type { VagaMetaReducao } from "@ea/shared-types";

/**
 * A META DOS DOIS LADOS, do jeito que a vaga a guarda.
 *
 * `oficiais` É NULÁVEL porque a vaga em RASCUNHO ainda não tem meta oficial, e sem meta anterior não
 * existe redução: não há de onde descer. Tratar o nulo como zero faria toda vaga de rascunho avisar
 * "a meta oficial cai de 0 para 3" no primeiro preenchimento, que é o oposto do que o aviso serve
 * para dizer.
 */
export interface MetaDePosicoes {
  oficiais: number | null;
  banco: number;
}

/** Os lados que ENCOLHERAM. Os dois falsos significam "não houve redução nenhuma". */
export interface LadosReduzidos {
  oficiais: boolean;
  banco: boolean;
}

/**
 * QUAIS LADOS ENCOLHERAM, comparando a meta gravada com a que a tela vai salvar.
 *
 * OS DOIS LADOS SÃO CONFERIDOS SEPARADAMENTE, e não pela soma. Somar deixaria passar exatamente o
 * caso que a auditoria encontrou: baixar o OFICIAL de 5 para 1 subindo o banco de 0 para 4 mantém a
 * soma em 5, e é a meta oficial, sozinha, que o gate do fechamento lê.
 */
export function ladosReduzidos(de: MetaDePosicoes, para: MetaDePosicoes): LadosReduzidos {
  return {
    oficiais: de.oficiais !== null && para.oficiais !== null && para.oficiais < de.oficiais,
    banco: para.banco < de.banco,
  };
}

/** Houve redução em ALGUM dos dois lados? É esta pergunta que decide se o aviso aparece. */
export function houveReducaoDeMeta(de: MetaDePosicoes, para: MetaDePosicoes): boolean {
  const l = ladosReduzidos(de, para);
  return l.oficiais || l.banco;
}

/**
 * A FRASE FINAL DO AVISO, sempre a mesma, declarada uma vez.
 *
 * ELA DIZ TRÊS COISAS, NESTA ORDEM: que a decisão continua sendo da pessoa, que o sistema salva
 * normalmente (o aviso NÃO bloqueia) e que o registro guarda autor e data. A ordem é a que evita a
 * leitura de acusação: primeiro o direito, depois o registro.
 */
const AVISO_RODAPE =
  "Reduzir a meta continua sendo uma decisão sua e o sistema salva normalmente. A alteração fica registrada na vaga, com o seu nome e a data, para a trilha responder depois por que a meta mudou.";

/**
 * O AVISO QUE A PESSOA LÊ ANTES DE CONFIRMAR, ou NULO quando não houve redução.
 *
 * O NULO É O CONTRATO, e é ele que mantém a régua num lugar só: a tela pergunta "tem aviso?" e não
 * "reduziu?", então não existe caminho em que ela decida sozinha mostrar o diálogo por engano.
 *
 * SÓ O LADO QUE ENCOLHEU É CITADO. Quem baixou o banco e subiu o oficial lê uma frase sobre o banco,
 * e nada sobre o oficial: citar o lado que aumentou misturaria o gesto que pede transparência com o
 * que não pede, e o de/para deixaria de ser a informação central do texto.
 */
export function avisoDeReducaoDeMeta(de: MetaDePosicoes, para: MetaDePosicoes): string | null {
  const l = ladosReduzidos(de, para);
  const frases: string[] = [];
  if (l.oficiais) frases.push(`A meta oficial cai de ${de.oficiais} para ${para.oficiais}.`);
  if (l.banco) frases.push(`A meta de banco cai de ${de.banco} para ${para.banco}.`);
  if (frases.length === 0) return null;
  return `${frases.join(" ")} ${AVISO_RODAPE}`;
}

/**
 * ─ A SEGUNDA PORTA DA META: A TRILHA DE ABERTURA ──────────────────────────────────────────────
 *
 * A META NÃO É EDITADA SÓ PELO DIÁLOGO DE POSIÇÕES. O formulário da trilha (`PATCH /as/vagas/:id`,
 * a continuação do rascunho) carrega os dois números e os regrava junto com os outros 37 campos. O
 * backend já registra a redução vinda por ali; sem esta peça, a pessoa reduziria a meta pela trilha,
 * ficaria registrada e ninguém teria dito a ela, que é o oposto do que o aviso existe para fazer.
 *
 * O QUE MUDA EM RELAÇÃO AO DIÁLOGO DE POSIÇÕES é só o CORPO enviado, e é por isso que esta peça é um
 * ADAPTADOR e não uma régua nova: ela traduz "o que o formulário mandou" para "o que a vaga vai
 * ficar" e entrega o resultado ao `avisoDeReducaoDeMeta`, que continua sendo a única régua. Duas
 * réguas para a mesma pergunta divergem na primeira correção feita só em uma delas.
 */

/**
 * A META DO JEITO QUE A TRILHA MANDA, com `undefined` no campo vazio, dos dois lados.
 *
 * OS DOIS AUSENTES NÃO SIGNIFICAM A MESMA COISA no servidor, e essa assimetria é o motivo inteiro
 * desta interface existir separada da `MetaDePosicoes`.
 */
export interface MetaEnviadaPelaTrilha {
  oficiais?: number;
  banco?: number;
}

/**
 * COMO A VAGA VAI FICAR depois de a trilha salvar, espelhando o servidor campo a campo.
 *
 * OFICIAL AUSENTE PRESERVA O NÚMERO GRAVADO (`metaOficialDaTrilha`, `vagas.service.ts`): campo em
 * branco na trilha é "não mexi na meta", e NÃO uma redução a zero. Tratá-lo como zero faria o aviso
 * abrir dizendo "a meta oficial cai de 3 para 0" para quem não tocou no campo, e um aviso que mente
 * uma vez deixa de ser lido nas outras.
 *
 * BANCO AUSENTE VALE ZERO (`camposDaTrilha`), e aí a redução é REAL: a coluna é NOT NULL, "sem
 * banco" é resposta e não lacuna, e apagar o campo de uma vaga que tinha 4 de banco baixa a meta de
 * verdade. O aviso aparece, como deve.
 */
export function metaQueATrilhaGrava(
  anterior: MetaDePosicoes,
  enviado: MetaEnviadaPelaTrilha,
): MetaDePosicoes {
  return {
    oficiais: enviado.oficiais ?? anterior.oficiais,
    banco: enviado.banco ?? 0,
  };
}

/**
 * O AVISO DA TRILHA, ou NULO quando não há o que avisar. Mesmo contrato do irmão: a tela pergunta
 * "tem aviso?", nunca "reduziu?".
 *
 * SEM VAGA ANTERIOR NÃO HÁ AVISO, e é o primeiro caso do arquivo. Abrir vaga nova não tem "de": o
 * primeiro preenchimento DEFINE a meta, e chamar isso de redução avisaria toda abertura da casa.
 */
export function avisoDeReducaoNaTrilha(
  anterior: MetaDePosicoes | null,
  enviado: MetaEnviadaPelaTrilha,
): string | null {
  if (anterior === null) return null;
  return avisoDeReducaoDeMeta(anterior, metaQueATrilhaGrava(anterior, enviado));
}

/**
 * A FRASE DE UMA LINHA DO RASTRO, no painel da vaga.
 *
 * O TEMPO VERBAL É PASSADO, pela mesma razão da trilha do fechamento forçado: os quatro números são
 * congelados no instante da redução e nunca recalculados. A meta pode ter mudado outras vezes depois
 * desta linha, e uma frase no presente faria a trilha contar uma história diferente da que aconteceu.
 *
 * SÓ O LADO QUE MUDOU ENTRA NA FRASE. O contrato traz os quatro números sempre, e o lado que não
 * mexeu chega com o `de` igual ao `para`: escrever "a meta de banco caiu de 0 para 0" encheria a
 * trilha de linhas que não aconteceram.
 *
 * O AUTOR PODE SER NULO (usuário removido depois), e a frase diz "não informado" (§A.11) em vez de
 * esconder a linha: a redução aconteceu, e perder o autor não apaga o fato.
 */
export function fraseDaReducaoDeMeta(r: VagaMetaReducao, quando: string): string {
  const partes: string[] = [];
  if (r.paraOficiais < r.deOficiais) {
    partes.push(`a meta oficial caiu de ${r.deOficiais} para ${r.paraOficiais}`);
  }
  if (r.paraBanco < r.deBanco) {
    partes.push(`a meta de banco caiu de ${r.deBanco} para ${r.paraBanco}`);
  }
  const quem = `Reduzida por ${r.porNome ?? "não informado"} em ${quando}`;
  // A LINHA SEM LADO NENHUM não deveria existir (o backend só registra redução), e mesmo assim ela
  // sai legível: a alternativa era um "Reduzida por Fulano em tal dia: ." pendurado na tela.
  return partes.length === 0 ? `${quem}.` : `${quem}: ${partes.join(" e ")}.`;
}
