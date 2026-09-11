/**
 * ─ O SLA DE ENTREGA DA VAGA (Onda C, peça 4) ──────────────────────────────────────────────────
 *
 * Quantos dias faltam para a entrega prometida: `dataLimite` (a "Previsão de entrega" da tela)
 * menos hoje. Ele SUBSTITUI a
 * coluna "Dias Em Aberto", e a troca é de pergunta: aquela dizia há quanto tempo a vaga existe (um
 * número que só cresce), esta diz se a promessa vai ser cumprida (um número que se aproxima de
 * zero). A primeira é história, a segunda é cobrança.
 *
 * NADA DE BANCO: `data_prevista_inicio` já existe e já é servida. Isto é derivação, e por isso mora
 * numa função pura com teste, e não dentro da célula.
 *
 * ┌─ OS TRÊS CASOS EM QUE ESTA COLUNA ERRA, e é para eles que os estados existem ──────────────┐
 * │ 1. PREVISÃO AUSENTE é o caso COMUM (2 das 3 vagas de produção). A célula diz "não informado" │
 * │    (§A.11), nunca um traço e nunca "0 dias". "0 dias" ali seria a tela afirmando que a       │
 * │    entrega é HOJE para uma vaga que nunca prometeu data nenhuma.                             │
 * │ 2. PRAZO VENCIDO é ESTADO PRÓPRIO, e não "0 dias". Uma vaga cinco dias atrasada e uma que    │
 * │    vence hoje são situações diferentes, e achatar as duas em zero apagaria justamente a que  │
 * │    precisa de ação.                                                                          │
 * │ 3. VAGA ENCERRADA não tem prazo correndo. Ver o bloco do congelamento, logo abaixo.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CONGELAMENTO, HERDADO DA COLUNA QUE SAI, E É A PARTE QUE EXIGE DECISÃO ─────────────────┐
 * │ "Dias Em Aberto" CONGELAVA no fechamento por decisão do diretor: a vaga encerrada contava da │
 * │ abertura até a data de fechamento e parava ali, virando o TEMPO DE ATENDIMENTO, comparável   │
 * │ entre vagas. Sem esse cuidado, a coluna esvaziaria assim que o processo terminasse.          │
 * │                                                                                              │
 * │ O EQUIVALENTE AQUI É CONGELAR NO FECHAMENTO, E NÃO ZERAR NEM ESCONDER: a vaga encerrada      │
 * │ mostra a MARGEM QUE ELA TINHA quando fechou (previsão menos data de fechamento), que responde │
 * │ "entregou dentro do prazo?" e continua comparável. Um SLA que segue correndo numa vaga        │
 * │ fechada é cobrança sobre trabalho que acabou, e em um mês toda vaga encerrada apareceria      │
 * │ vermelha sem que ninguém tivesse atrasado nada.                                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CONTA É EM DIAS DE CALENDÁRIO, em UTC sobre a data pura (`yyyy-mm-dd`), sem hora e sem fuso,
 * pela mesma razão medida na coluna antiga: `new Date(iso)` local faz a virada do horário de verão
 * devolver 41,96 dias e o arredondamento oscilar de um dia conforme a máquina de quem abre a tela.
 *
 * §A.11 (sem travessão), §A.24 (as etiquetas dos estados são title case; as frases são apoio).
 */

/** O estado do prazo daquela vaga. É ele que decide a cor, o selo, o filtro e a ordenação. */
export type EstadoDoSla =
  | "SEM_PREVISAO"
  | "VENCIDO"
  | "ATENCAO"
  | "NO_PRAZO"
  | "ENCERRADA";

/** O limite do selo de atenção, em dias. Decisão do diretor: 2 dias ou menos. */
export const DIAS_DE_ATENCAO = 2;

export interface Sla {
  estado: EstadoDoSla;
  /**
   * OS DIAS, com sinal: positivo é quanto falta, negativo é há quanto tempo venceu, zero é hoje.
   * Nulo quando não há conta a fazer. Na vaga ENCERRADA é a margem congelada no fechamento.
   */
  dias: number | null;
  /** O que a célula escreve. */
  texto: string;
  /** A frase inteira, para o `title`. */
  detalhe: string;
}

/**
 * O mínimo que uma vaga precisa ter para esta régua responder.
 *
 * ┌─ O CAMPO É `dataLimite`, E O NOME DELE NÃO É O RÓTULO DA TELA ─────────────────────────────┐
 * │ `data_limite` É a "Previsão de entrega": em 07/09 o RÓTULO foi trocado (é como a operação   │
 * │ chama o prazo) e a COLUNA ficou como estava, de propósito, porque renomear coluna é migração │
 * │ destrutiva por ganho zero. Está escrito no comentário do próprio campo, na trilha.           │
 * │                                                                                             │
 * │ EXISTE UM `data_prevista_inicio`, E ELE NÃO É ESTE. Aquele é outro campo, preenchido só no   │
 * │ modal de FECHAR a vaga, e uma régua de SLA apoiada nele mostraria "não informado" em 100%    │
 * │ das vagas VIVAS, para sempre: o prazo só existiria depois de a vaga acabar. Os dois nomes se │
 * │ parecem, e a confusão entre eles já custou uma rodada nesta onda. Quem lê o prazo da vaga    │
 * │ ABERTA lê `dataLimite`, que é preenchido na ABERTURA, no formulário que o time já usa.       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface VagaComPrazo {
  /** A "Previsão de entrega" da tela, preenchida na abertura da vaga. */
  dataLimite: string | null;
  dataFechamento: string | null;
}

/** ETIQUETA (§A.24), e é o rótulo que o filtro mostra. */
export const SLA_ESTADO_LABEL: Record<EstadoDoSla, string> = {
  SEM_PREVISAO: "Sem Previsão",
  VENCIDO: "Prazo Vencido",
  ATENCAO: "Prazo Curto",
  NO_PRAZO: "No Prazo",
  ENCERRADA: "Vaga Encerrada",
};

/** A ordem em que os estados aparecem no filtro: do mais urgente ao histórico. */
export const SLA_ESTADOS: readonly EstadoDoSla[] = [
  "VENCIDO",
  "ATENCAO",
  "NO_PRAZO",
  "SEM_PREVISAO",
  "ENCERRADA",
];

function emDias(de: string, ate: string): number | null {
  const a = Date.parse(`${de.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${ate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

/** "3 dias" ou "1 dia", sem sinal. Quem dá o sentido é a frase em volta. */
function plural(dias: number): string {
  return Math.abs(dias) === 1 ? "1 dia" : `${Math.abs(dias)} dias`;
}

/**
 * O SLA DE UMA VAGA.
 *
 * `hoje` ENTRA POR PARÂMETRO, e não é `new Date()` aqui dentro: régua que lê o relógio não se testa
 * sem congelar o tempo, e é a tela que sabe qual é o "hoje" dela.
 *
 * `encerrada` TAMBÉM ENTRA DE FORA, pelo mesmo motivo da coluna antiga: quem responde se o status
 * encerra é o CATÁLOGO (`vagaEncerrada`, flag `encerra`), e uma segunda lista de status aqui
 * divergiria dela no dia em que o diretor criasse um status novo.
 */
export function slaDaVaga(v: VagaComPrazo, encerrada: boolean, hoje: string): Sla {
  if (!v.dataLimite) {
    return {
      estado: "SEM_PREVISAO",
      dias: null,
      texto: "não informado",
      detalhe: "Esta vaga não tem previsão de entrega preenchida, então não há prazo a acompanhar.",
    };
  }

  if (encerrada) {
    /* CONGELADO NO FECHAMENTO. Sem data de fechamento a conta não existe: contar até hoje diria que
       o prazo dela ainda corre, que é o oposto do que o congelamento existe para dizer. */
    if (!v.dataFechamento) {
      return {
        estado: "ENCERRADA",
        dias: null,
        texto: "não informado",
        detalhe:
          "A vaga está encerrada e não tem data de encerramento registrada, então não dá para dizer com quanta margem ela terminou.",
      };
    }
    const margem = emDias(v.dataLimite, v.dataFechamento);
    if (margem === null) {
      return {
        estado: "ENCERRADA",
        dias: null,
        texto: "não informado",
        detalhe: "A vaga está encerrada e as datas registradas não permitem calcular a margem.",
      };
    }
    return {
      estado: "ENCERRADA",
      dias: margem,
      texto: margem < 0 ? `${plural(margem)} de atraso` : `${plural(margem)} de folga`,
      detalhe:
        margem < 0
          ? `A vaga foi encerrada ${plural(margem)} depois da previsão de entrega. O prazo parou de correr no encerramento.`
          : `A vaga foi encerrada com ${plural(margem)} de folga em relação à previsão de entrega. O prazo parou de correr no encerramento.`,
    };
  }

  const dias = emDias(v.dataLimite, hoje);
  if (dias === null) {
    /* ─ QUEM ESTÁ ERRADO, A VAGA OU O RELÓGIO DA TELA? (defeito 3 da auditoria de teste) ───────
       A PRIMEIRA VERSÃO CULPAVA O CAMPO, SEMPRE: "a previsão registrada não é uma data válida".
       Com a previsão PERFEITA e o `hoje` ilegível, essa frase manda o consultor editar uma vaga que
       está correta, e ele vai procurar um defeito que não existe até desistir. As duas causas
       chegam aqui pelo mesmo `null`, e só quem separa é uma segunda leitura. */
    const previsaoLegivel = !Number.isNaN(Date.parse(`${v.dataLimite.slice(0, 10)}T00:00:00Z`));
    return {
      estado: "SEM_PREVISAO",
      dias: null,
      texto: "não informado",
      detalhe: previsaoLegivel
        ? "Não foi possível calcular o prazo agora. A previsão de entrega desta vaga está preenchida e correta, então não há nada a corrigir nela."
        : "A previsão de entrega registrada nesta vaga não é uma data válida.",
    };
  }

  if (dias < 0) {
    return {
      estado: "VENCIDO",
      dias,
      texto: `vencido há ${plural(dias)}`,
      detalhe: `A previsão de entrega passou há ${plural(dias)} e a vaga continua aberta.`,
    };
  }

  if (dias === 0) {
    return {
      estado: "ATENCAO",
      dias,
      texto: "vence hoje",
      detalhe: "A previsão de entrega desta vaga é hoje.",
    };
  }

  return {
    estado: dias <= DIAS_DE_ATENCAO ? "ATENCAO" : "NO_PRAZO",
    dias,
    texto: `faltam ${plural(dias)}`,
    detalhe:
      dias <= DIAS_DE_ATENCAO
        ? `Faltam ${plural(dias)} para a previsão de entrega desta vaga.`
        : `Faltam ${plural(dias)} para a previsão de entrega.`,
  };
}

/**
 * ─ O DESLOCAMENTO QUE TIRA A VAGA ENCERRADA DA DISPUTA POR URGÊNCIA ───────────────────────────
 *
 * Um número maior que qualquer prazo de vaga viva que exista na prática (são dias de calendário; um
 * milhão de dias são 2.700 anos). Ele não é comparado com nada de fora: serve só para empurrar o
 * bloco inteiro das encerradas para depois do bloco inteiro das vivas.
 */
const DESLOCAMENTO_ENCERRADA = 1_000_000;

/**
 * ─ A CHAVE DE ORDENAÇÃO (§A.29): quanto MENOR, mais urgente ───────────────────────────────────
 *
 * ┌─ A VAGA ENCERRADA NÃO DISPUTA URGÊNCIA COM A VIVA, e este era o pior defeito da régua ─────┐
 * │ A primeira versão devolvia `sla.dias` para todo mundo. Só que na vaga ENCERRADA esse número │
 * │ é a MARGEM CONGELADA, que vive na mesma escala numérica do prazo de quem ainda está de pé:  │
 * │ uma encerrada com 9 dias de atraso (-9) ordenava NA FRENTE de uma viva vencida há 3 (-3), e │
 * │ uma encerrada com folga se intercalava no meio das vivas no prazo. Quem ordena a coluna     │
 * │ para achar o que está pegando fogo recebia processo TERMINADO no topo da fila.              │
 * │                                                                                             │
 * │ É o "cobrança sobre trabalho que acabou" voltando pela porta da ordenação, depois de a      │
 * │ célula já ter sido resolvida com o congelamento e com o tom discreto.                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SÃO DOIS BLOCOS, E NUNCA UMA MISTURA: primeiro TODAS as vivas, na urgência delas (o vencido no
 * topo), e depois TODAS as encerradas, entre si na margem que tiveram. O histórico continua
 * ordenável, que é o que a coluna antiga entregava, mas em um bloco próprio.
 *
 * QUEM NÃO TEM PRAZO VAI PARA O FIM, nas duas direções, exatamente como a coluna antiga fazia com o
 * rascunho sem data de abertura: ausência de prazo não é um prazo enorme, e misturá-la na escala
 * faria a vaga sem previsão disputar posição com a que vence amanhã.
 */
export function ordemDoSla(sla: Sla): number | null {
  if (sla.dias === null) return null;
  return sla.estado === "ENCERRADA" ? DESLOCAMENTO_ENCERRADA + sla.dias : sla.dias;
}
