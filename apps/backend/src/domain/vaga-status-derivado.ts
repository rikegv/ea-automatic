import type { VagaStatusPapel } from "@ea/shared-types";

/**
 * ─ O STATUS DA VAGA DERIVADO DO FUNIL, COM O MANUAL PEGAJOSO (Frente B da Central de Vagas) ─────
 *
 * ┌─ O CONCEITO DO DIRETOR, E ELE É O ARQUIVO INTEIRO ─────────────────────────────────────────────┐
 * │ HÁ DOIS NÍVEIS. O da VAGA tem QUATRO estados (Aberta, Entregue, Fechada, Cancelada). Todo o    │
 * │ resto (Divulgação, Triagem, Captação, Entrevista Soulan, Shortlist, Entrevista Cliente,        │
 * │ Admissão) é movimentação do CANDIDATO, não da vaga. O estado da VAGA DERIVA de onde os         │
 * │ candidatos estão, automaticamente, e o time TAMBÉM move a vaga à mão.                          │
 * │                                                                                                │
 * │ SEM EXIGIR ORDEM: se o candidato pular etapas (e ele pula, o funil é livre desde 27/08), a     │
 * │ vaga acompanha. É por isso que a pergunta desta função é de PRESENÇA ("existe alguém com o     │
 * │ cliente?") e nunca de PROGRESSÃO ("a etapa anterior foi cumprida?").                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O PADRÃO É O DO `farol_global` DA ADMISSÃO (§A.3), LIDO ANTES DE SER COPIADO ─────────────────
 *
 * Lá: o automático DERIVA, os manuais são PEGAJOSOS e a automação nunca os sobrescreve. Aqui é o
 * mesmo contrato, com UMA diferença de forma que precisa estar escrita para ninguém "simplificar"
 * de volta:
 *
 *   NO FAROL, O PEGAJOSO É UM CONJUNTO DE ESTADOS (`FAROL_MANUAL`), e isso basta porque nenhum
 *   estado manual é alcançável pela derivação. AQUI NÃO BASTA: `ABERTA` e `ENTREGUE` são
 *   alcançáveis pelos DOIS caminhos, então o VALOR do status não diz quem o escreveu. O que gruda
 *   é o CARIMBO (`vagas.status_manual_em`), não o valor.
 *
 * E essa não é uma invenção desta frente: é literalmente a correção do bug de 13/08/2026 no
 * `deriveFarolGlobal`, onde a resposta certa também não foi engrossar a lista de manuais (isso
 * congelaria a derivação para quem chega no estado sozinho) e sim ler a FLAG que registra a
 * decisão explícita do usuário.
 *
 * ─ O QUE ESTA FUNÇÃO NÃO FAZ: FECHAR VAGA ───────────────────────────────────────────────────────
 *
 * "CONTRATADO => FECHADA" NÃO É DERIVÁVEL COM SEGURANÇA, e a razão é aritmética antes de ser de
 * processo: uma vaga de 10 posições com 1 contratado NÃO PODE FECHAR. E mesmo na última posição, o
 * fechamento tem régua que esta função não tem como cumprir: todo candidato TRATADO (trava 5, sem
 * forçar nem para Master), todas as posições OFICIAIS entregues (trava 6, com aceite de Master), e
 * uma `data_fechamento` que é FATO COMERCIAL vindo do formulário, não do relógio. Derivar aqui
 * seria pular as três ou inventar a data.
 *
 * ENTÃO `FECHADA` E `CANCELADA` CONTINUAM SÓ PELAS PORTAS PRÓPRIAS (`fechar` e `cancelar`), que é
 * a mesma decisão que mantém as duas fora do destino do "mover status". Esta função só alterna
 * entre ABERTURA e ENTREGA, e para TODO o resto ela devolve `null`, que quer dizer "não é comigo".
 *
 * FUNÇÃO PURA: sem banco, sem data, sem relógio. Quem lê o funil e quem grava é o chamador.
 */
export interface DerivacaoDeStatusDaVaga {
  /** O código do status ATUAL da vaga, lido SOB o `SELECT ... FOR UPDATE` pelo chamador. */
  atual: string;
  /** O papel de sistema do status atual, resolvido pelo catálogo (`ReguaDeStatusDaVaga`). */
  papelAtual: VagaStatusPapel;
  /**
   * O status atual foi posto À MÃO? (`vagas.status_manual_em` preenchido)
   *
   * PREENCHIDO, A DERIVAÇÃO NÃO ENCOSTA. É o pegajoso, e ele é DELIBERADAMENTE mais forte do que a
   * régua do funil: o time move a vaga à mão porque sabe de algo que o funil não conta (o cliente
   * pediu para segurar, a vaga virou outra coisa), e uma derivação que desfizesse isso na primeira
   * movimentação de candidato transformaria a decisão do consultor em ruído.
   */
  manual: boolean;
  /**
   * EXISTE CANDIDATURA VIVA EM ETAPA DE ENTREGA AO CLIENTE?
   *
   * VIVA, e não qualquer uma: quem foi descartado ou desistiu saiu do processo, e contá-lo deixaria
   * a vaga eternamente ENTREGUE por causa de alguém que o cliente recusou em março.
   *
   * QUEM SÃO AS ETAPAS DE ENTREGA vem do CATÁLOGO (`as_etapas_funil.entrega_ao_cliente`), nunca de
   * um código escrito aqui: a lista de etapas é do diretor.
   */
  temCandidatoComCliente: boolean;
  /** O código do papel ABERTURA, resolvido pelo catálogo. Nunca literal. */
  codigoAbertura: string;
  /** O código do papel ENTREGA, resolvido pelo catálogo. Nunca literal. */
  codigoEntrega: string;
}

/**
 * ─ OS DOIS PAPÉIS EM QUE A VAGA ESTÁ EM PROCESSO: ABERTURA E ENTREGA ────────────────────────────
 *
 * SÃO OS DOIS ESTADOS VIVOS do conceito dos quatro (Aberta, Entregue, Fechada, Cancelada), e a
 * mesma lista responde DUAS perguntas que antes eram uma só porque a ENTREGA encerrava:
 *   1. o que a DERIVAÇÃO alcança;
 *   2. de onde as PORTAS DE ENCERRAMENTO (`fechar` e `cancelar`) podem encerrar.
 *
 * UMA LISTA SÓ, E NÃO DUAS IGUAIS, porque as duas perguntas têm a MESMA resposta pela MESMA razão
 * (a vaga está viva e em processo), e duas listas iguais divergem no primeiro dia em que alguém
 * acrescentar um papel a uma delas.
 *
 * TUDO O QUE NÃO ESTÁ AQUI FICA DE FORA, E CADA AUSÊNCIA É UMA DECISÃO:
 *   RASCUNHO   publica pela trilha de abertura, que confere os obrigatórios. Derivar publicaria, e
 *              encerrar encerraria uma vaga que nunca existiu.
 *   REVISAO    sai pela liberação, que confere o cliente que a varredura não trouxe.
 *   FECHAMENTO e CANCELAMENTO são desfechos: a vaga só encerra UMA vez, e ressuscitá-los por
 *              movimento de candidato seria a terceira porta que `podeSerDestinoManual` impede.
 *   LIVRE      é o status que o DIRETOR criou (um "Stand By", um "Aguardando Cliente"). Ele não
 *              está no conceito dos quatro estados, e a derivação não tem o que dizer sobre ele.
 *              Arrastá-lo para ABERTA apagaria uma escolha que ninguém pediu para desfazer. Para
 *              encerrar, a vaga volta primeiro para ABERTA pelo "mover status", que é o caminho de
 *              volta que `movivelManualmente` existe para garantir.
 */
const PAPEIS_DE_VAGA_EM_PROCESSO: readonly VagaStatusPapel[] = ["ABERTURA", "ENTREGA"];

/**
 * A VAGA NESTE PAPEL ESTÁ EM PROCESSO? (viva, nem pré-publicação nem desfecho)
 *
 * ELA EXISTE, NA DERIVAÇÃO, PARA O CHAMADOR SAIR ANTES DE CONSULTAR O BANCO: `deriveStatusDaVaga`
 * já responderia `null` para o papel fora de alcance, mas responderia DEPOIS de alguém ter contado
 * o funil, e vaga em rascunho, encerrada ou num status do diretor é a maioria dos movimentos de
 * candidato numa base com milhares de vagas.
 *
 * ELA EXISTE, NAS PORTAS, PORQUE A ENTREGA DEIXOU DE ENCERRAR: até a Frente B as duas perguntavam
 * `ehDoPapel(status, "ABERTURA")`, e isso bastava porque `ENTREGUE` era terminal. Com ela viva, a
 * pergunta literal deixaria a vaga ENTREGUE SEM PORTA DE SAÍDA: não daria para fechar (o caminho
 * normal, o candidato que estava com o cliente foi contratado) nem para cancelar (o cliente
 * desistiu). Ela ficaria presa até alguém movê-la à mão de volta para Aberta.
 */
export function papelDeVagaEmProcesso(papel: VagaStatusPapel): boolean {
  return PAPEIS_DE_VAGA_EM_PROCESSO.includes(papel);
}

/**
 * ─ ESTE MOVIMENTO PODE MUDAR A RESPOSTA DA DERIVAÇÃO? ───────────────────────────────────────────
 *
 * ┌─ A PROVA, E ELA É O QUE TORNA O ATALHO LEGÍTIMO EM VEZ DE ARRISCADO ──────────────────────────┐
 * │ A derivação pergunta UMA coisa: "existe candidatura VIVA em etapa de entrega ao cliente?".    │
 * │ Isso é um EXISTS sobre o par (etapa, situação viva). Um movimento só pode mudar a resposta se │
 * │ ele MEXER numa linha que entra ou sai desse conjunto, e para isso ele precisa TOCAR uma etapa │
 * │ de entrega:                                                                                   │
 * │   . mudar a SITUAÇÃO de quem está fora da entrega não acrescenta nem tira ninguém do conjunto;│
 * │   . fazer NASCER candidatura numa etapa fora da entrega idem;                                 │
 * │   . MOVER entre duas etapas fora da entrega idem;                                             │
 * │   . TROCAR de vaga sem mudar de etapa, estando fora da entrega, idem nas duas vagas.          │
 * │ Se QUALQUER das etapas envolvidas (a de origem ou a de destino) for de entrega, a resposta    │
 * │ pode mudar, e aí a derivação roda.                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE O ATALHO EXISTE, e não é otimização prematura: sem ele, TODO gesto de candidato (mover,
 * aprovar, alocar, descartar, trocar) passa a fazer um `SELECT ... FOR UPDATE` na vaga mais um
 * `exists` no funil, para responder uma pergunta cuja resposta não mudou. É custo por gesto, para
 * sempre, e é TRAVA por gesto: alocar e descartar passariam a serializar na linha da vaga, que é
 * justamente o que o caminho simples do `registrarSaida` evita de propósito.
 *
 * FAIL-CLOSED NA DIREÇÃO QUE IMPORTA: na dúvida ele devolve `true` (deriva), porque derivar de
 * mais é inócuo (a derivação é idempotente e não muda nada quando o destino já é o atual) e derivar
 * de menos deixa o status da vaga mentindo.
 */
export function movimentoPodeMudarAEntrega(
  etapasEnvolvidas: readonly (string | null | undefined)[],
  etapasDeEntrega: ReadonlySet<string>,
): boolean {
  if (etapasDeEntrega.size === 0) return false;
  return etapasEnvolvidas.some((e) => (e ? etapasDeEntrega.has(e) : false));
}

/**
 * O STATUS QUE A VAGA DEVERIA TER, ou `null` quando a derivação não tem nada a dizer.
 *
 * `null` É "NÃO MEXE", e cobre três casos que o chamador não precisa distinguir: o status já é o
 * derivado (gravar de novo encheria a trilha de linhas que não contam nada), o movimento foi
 * manual (pegajoso), ou o papel está fora do alcance.
 */
export function deriveStatusDaVaga(i: DerivacaoDeStatusDaVaga): string | null {
  if (i.manual) return null;
  if (!PAPEIS_DE_VAGA_EM_PROCESSO.includes(i.papelAtual)) return null;

  const destino = i.temCandidatoComCliente ? i.codigoEntrega : i.codigoAbertura;
  return destino === i.atual ? null : destino;
}

/**
 * A OBSERVAÇÃO QUE FICA NA TRILHA DA VAGA quando quem moveu foi a derivação, e não uma pessoa.
 *
 * ELA PRECISA DIZER QUE FOI AUTOMÁTICA, em palavras: `as_vaga_status_eventos.por_id` guarda o
 * usuário cuja ação DISPAROU a derivação (quem moveu o candidato de etapa), e sem esta frase a
 * linha do tempo afirmaria que aquela pessoa moveu a VAGA, que é um gesto diferente e mais pesado.
 *
 * §A.11: sem travessão. §A.6: vocabulário de processo, nenhum nome, nenhum id de candidato.
 */
export function narrativaDaDerivacao(temCandidatoComCliente: boolean): string {
  return temCandidatoComCliente
    ? "Status derivado do funil: há candidato em etapa de entrega ao cliente."
    : "Status derivado do funil: não há mais candidato em etapa de entrega ao cliente.";
}
