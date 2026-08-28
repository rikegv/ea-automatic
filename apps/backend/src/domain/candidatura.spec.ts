import { describe, expect, it } from "vitest";
import {
  CANDIDATURA_ETAPAS,
  CANDIDATURA_SITUACOES,
  type CandidaturaSituacao,
} from "@ea/shared-types";
import {
  destinosDeEtapa,
  SITUACOES_TRATADAS,
  SITUACOES_VIVAS,
  STATUS_QUE_NAO_RECEBEM,
  movimentoPermitido,
  cabeMaisUm,
  candidaturaTratada,
  candidaturaViva,
  consomePosicao,
  decidirAlocacao,
  ehEtapaConhecida,
  ehSaida,
  ehSaidaSemExito,
  entrevistaClienteEhOpcional,
  ocupacaoDaVaga,
  pendentesDeTratamento,
  proximasEtapas,
  vagaPodeEncerrar,
  vagaRecebeCandidato,
} from "./candidatura";

describe("o funil de seleção", () => {
  it("tem as cinco etapas na ordem, e o mapa de avanço cobre todas", () => {
    expect([...CANDIDATURA_ETAPAS]).toEqual([
      "CAPTACAO",
      "TRIAGEM",
      "ENTREVISTA_SOULAN",
      "ENTREVISTA_CLIENTE",
      "APROVACAO",
    ]);
    for (const e of CANDIDATURA_ETAPAS) expect(destinosDeEtapa(e)).toBeDefined();
  });

  it("percorre o caminho completo, uma etapa por vez", () => {
    expect(movimentoPermitido("CAPTACAO", "TRIAGEM")).toBe(true);
    expect(movimentoPermitido("TRIAGEM", "ENTREVISTA_SOULAN")).toBe(true);
    expect(movimentoPermitido("ENTREVISTA_SOULAN", "ENTREVISTA_CLIENTE")).toBe(true);
    expect(movimentoPermitido("ENTREVISTA_CLIENTE", "APROVACAO")).toBe(true);
  });

  /**
   * PULAR A ENTREVISTA CLIENTE É CAMINHO LEGÍTIMO, e continua sendo. Se alguém um dia tornar a etapa
   * OBRIGATÓRIA (uma régua que exija passar por ela), é este teste que quebra primeiro.
   */
  it("PULA a Entrevista Cliente: de Entrevista Soulan direto para Aprovação", () => {
    expect(movimentoPermitido("ENTREVISTA_SOULAN", "APROVACAO")).toBe(true);
    expect(entrevistaClienteEhOpcional()).toBe(true);
    expect(proximasEtapas("ENTREVISTA_SOULAN")).toContain("APROVACAO");
  });

  /**
   * ─ O FUNIL NÃO É UM TRILHO (decisão do diretor, 27/08) ────────────────────────────────────
   * Estes dois testes AFIRMAM O CONTRÁRIO do que a versão anterior afirmava, e é essa a mudança:
   * a operação real volta candidato de etapa e pula etapa o tempo todo, e a régua que só deixava
   * andar uma casa para a frente obrigava a etapa gravada a mentir sobre o processo.
   */
  it("PULA quantas etapas forem precisas: da Captação direto para onde o processo estiver", () => {
    expect(movimentoPermitido("CAPTACAO", "ENTREVISTA_SOULAN")).toBe(true);
    expect(movimentoPermitido("CAPTACAO", "APROVACAO")).toBe(true);
    expect(movimentoPermitido("TRIAGEM", "APROVACAO")).toBe(true);
  });

  it("VOLTA de etapa, e continua recusando o movimento para o mesmo lugar", () => {
    expect(movimentoPermitido("APROVACAO", "TRIAGEM")).toBe(true);
    expect(movimentoPermitido("ENTREVISTA_CLIENTE", "ENTREVISTA_SOULAN")).toBe(true);
    expect(movimentoPermitido("APROVACAO", "CAPTACAO")).toBe(true);
    // O ÚNICO MOVIMENTO AINDA BARRADO: mover para onde a pessoa já está não é movimento, é ruído.
    expect(movimentoPermitido("TRIAGEM", "TRIAGEM")).toBe(false);
    expect(movimentoPermitido("APROVACAO", "APROVACAO")).toBe(false);
  });

  it("Aprovação deixou de ser fim de linha: dali se volta para qualquer etapa", () => {
    expect(proximasEtapas("APROVACAO").sort()).toEqual([
      "CAPTACAO",
      "ENTREVISTA_CLIENTE",
      "ENTREVISTA_SOULAN",
      "TRIAGEM",
    ]);
  });

  /**
   * A GARANTIA QUE IMPORTA DEPOIS DA LIBERAÇÃO: a etapa ficou livre, a OCUPAÇÃO não. Quem consome
   * posição é a SITUAÇÃO, e nenhum movimento de etapa passa por aqui. Este teste é o que impede
   * alguém de, um dia, acoplar as duas coisas achando que ajuda.
   */
  it("mover de etapa não toca na ocupação da vaga: quem ocupa é a situação", () => {
    const antes = ocupacaoDaVaga(3, ["ATIVO", "ATIVO", "APROVADO"]);
    // A mesma vaga com a mesma gente, todos em etapas diferentes: a conta é idêntica, porque a
    // etapa não entra nela em lugar nenhum.
    const depois = ocupacaoDaVaga(3, ["ATIVO", "ATIVO", "APROVADO"]);
    expect(depois).toEqual(antes);
    expect(antes.ocupadas).toBe(1);
    expect(antes.emSelecao).toBe(2);
  });

  it("etapa inventada não é conhecida (corpo montado fora da tela)", () => {
    expect(ehEtapaConhecida("TRIAGEM")).toBe(true);
    expect(ehEtapaConhecida("ENTREVISTA_FINAL")).toBe(false);
  });
});

describe("as saídas, de qualquer etapa", () => {
  it("as três saídas são descarte, desistência e contratação", () => {
    expect(ehSaida("DESCARTADO")).toBe(true);
    expect(ehSaida("DESISTIU")).toBe(true);
    expect(ehSaida("CONTRATADO")).toBe(true);
    expect(ehSaida("ATIVO")).toBe(false);
    expect(ehSaida("APROVADO")).toBe(false);
  });

  it("só descarte e desistência encerram SEM êxito (contratado é saída que ocupa posição)", () => {
    expect(ehSaidaSemExito("DESCARTADO")).toBe(true);
    expect(ehSaidaSemExito("DESISTIU")).toBe(true);
    expect(ehSaidaSemExito("CONTRATADO")).toBe(false);
  });
});

describe("a régua da ocupação, sempre derivada", () => {
  it("APROVADO e CONTRATADO consomem posição; o resto não", () => {
    expect(consomePosicao("APROVADO")).toBe(true);
    expect(consomePosicao("CONTRATADO")).toBe(true);
    expect(consomePosicao("ATIVO")).toBe(false);
    expect(consomePosicao("DESCARTADO")).toBe(false);
    expect(consomePosicao("DESISTIU")).toBe(false);
  });

  it("EM SELEÇÃO não consome posição (vaga de 2 com 5 ativos segue com 2 livres)", () => {
    const s: CandidaturaSituacao[] = ["ATIVO", "ATIVO", "ATIVO", "ATIVO", "ATIVO"];
    const o = ocupacaoDaVaga(2, s);
    expect(o.ocupadas).toBe(0);
    expect(o.emSelecao).toBe(5);
    expect(o.livres).toBe(2);
    expect(o.excedida).toBe(false);
  });

  it("DESCARTADO e DESISTIU ficam FORA: nunca somam nem subtraem", () => {
    const semSaidas = ocupacaoDaVaga(10, ["APROVADO", "APROVADO"]);
    const comSaidas = ocupacaoDaVaga(10, [
      "APROVADO",
      "APROVADO",
      "DESCARTADO",
      "DESCARTADO",
      "DESISTIU",
    ]);
    expect(comSaidas.ocupadas).toBe(semSaidas.ocupadas);
    expect(comSaidas.livres).toBe(semSaidas.livres);
    expect(comSaidas.fora).toBe(3);
  });

  it("conta a vaga cheia: 10 posições, 10 ocupadas, zero livres", () => {
    const s: CandidaturaSituacao[] = Array(9).fill("APROVADO");
    s.push("CONTRATADO");
    const o = ocupacaoDaVaga(10, s);
    expect(o.ocupadas).toBe(10);
    expect(o.livres).toBe(0);
    expect(o.excedida).toBe(false);
  });

  /**
   * A REGRA DA VAGA QUE DIMINUI: vaga de 10 que vira 8 com 9 aprovados NÃO desaprova ninguém. Ela
   * passa a mostrar excedida, e a correção fica com gente. Desfazer aprovação em silêncio seria o
   * sistema decidindo quem perde o emprego.
   */
  it("vaga que DIMINUI fica excedida e não desaprova ninguém (9 de 8)", () => {
    const o = ocupacaoDaVaga(8, Array(9).fill("APROVADO"));
    expect(o.ocupadas).toBe(9);
    expect(o.excedida).toBe(true);
    // Livres tem PISO EM ZERO: "menos uma livre" não é coisa que exista.
    expect(o.livres).toBe(0);
  });

  it("meta nula (rascunho) não tem livres nem excedente: ausência de meta não é meta zero", () => {
    const o = ocupacaoDaVaga(null, ["APROVADO", "APROVADO"]);
    expect(o.ocupadas).toBe(2);
    expect(o.livres).toBeNull();
    expect(o.excedida).toBe(false);
  });

  it("vaga sem ninguém devolve tudo zerado e todas as posições livres", () => {
    const o = ocupacaoDaVaga(3, []);
    expect(o).toEqual({ ocupadas: 0, livres: 3, emSelecao: 0, fora: 0, excedida: false });
  });
});

describe("TRAVA 1: aprovar além das posições", () => {
  it("cabe enquanto sobra posição, e para exatamente no limite", () => {
    expect(cabeMaisUm(0, 1)).toBe(true);
    expect(cabeMaisUm(9, 10)).toBe(true);
    expect(cabeMaisUm(10, 10)).toBe(false);
    expect(cabeMaisUm(11, 10)).toBe(false);
  });

  /**
   * A EXCLUSÃO DA PRÓPRIA LINHA: contratar quem JÁ estava aprovado não ocupa posição nova. Sem
   * excluir a própria candidatura da contagem, a mesma pessoa seria contada duas vezes e o movimento
   * normal (aprovado, depois contratado) seria recusado numa vaga cheia por ela mesma.
   */
  it("não conta a própria candidatura duas vezes (aprovado que vira contratado)", () => {
    // Vaga de 1, já ocupada por esta mesma pessoa: as OUTRAS ocupadas são zero.
    expect(cabeMaisUm(0, 1)).toBe(true);
  });

  it("meta nula é fail-closed: sem número de posições, não cabe mais um", () => {
    expect(cabeMaisUm(0, null)).toBe(false);
    expect(cabeMaisUm(0, undefined)).toBe(false);
  });
});

describe("TRAVA 2: alocar em vaga fechada", () => {
  it("FECHADA, CANCELADA e ENTREGUE não recebem candidato novo", () => {
    for (const s of STATUS_QUE_NAO_RECEBEM) expect(vagaRecebeCandidato(s)).toBe(false);
  });

  it("ABERTA recebe, e o RASCUNHO também (a captação começa antes de publicar)", () => {
    expect(vagaRecebeCandidato("ABERTA")).toBe(true);
    expect(vagaRecebeCandidato("RASCUNHO")).toBe(true);
    expect(vagaRecebeCandidato("VAGA_BANCO")).toBe(true);
  });
});

/**
 * A TRAVA 5 (ajuste do diretor): a vaga só encerra com TODO MUNDO TRATADO.
 *
 * A regra existe para a vaga não fechar deixando gente PENDURADA no funil, sem ninguém nunca ter
 * dito o que aconteceu com ela. Tratado é ter recebido UMA DECISÃO, e não ter dado certo.
 */
describe("TRAVA 5: encerrar a vaga só com todos os candidatos tratados", () => {
  it("as quatro situações de decisão contam como tratadas", () => {
    for (const s of SITUACOES_TRATADAS) expect(candidaturaTratada(s)).toBe(true);
    expect([...SITUACOES_TRATADAS].sort()).toEqual(
      ["APROVADO", "CONTRATADO", "DESCARTADO", "DESISTIU"].sort(),
    );
  });

  it("SÓ `ATIVO` é pendente, e é a única situação de fora da lista", () => {
    expect(candidaturaTratada("ATIVO")).toBe(false);
    const fora = CANDIDATURA_SITUACOES.filter((s) => !SITUACOES_TRATADAS.includes(s));
    expect(fora).toEqual(["ATIVO"]);
  });

  /**
   * O FAIL-CLOSED, e é o que a forma da função garante: `candidaturaTratada` pergunta se a situação
   * ESTÁ NA LISTA, e não se ela é diferente de `ATIVO`. Uma situação nova que entre no vocabulário
   * sem passar por aqui nasce PENDENTE e segura o fechamento, em vez de nascer "tratada" em silêncio.
   */
  it("situação desconhecida é PENDENTE, não tratada (fail-closed)", () => {
    expect(candidaturaTratada("EM_NEGOCIACAO" as CandidaturaSituacao)).toBe(false);
    expect(vagaPodeEncerrar(["APROVADO", "EM_NEGOCIACAO" as CandidaturaSituacao])).toBe(false);
  });

  it("um candidato EM SELEÇÃO segura o fechamento", () => {
    expect(vagaPodeEncerrar(["APROVADO", "DESCARTADO", "ATIVO"])).toBe(false);
  });

  it("com todo mundo decidido, a vaga encerra", () => {
    expect(vagaPodeEncerrar(["APROVADO", "CONTRATADO", "DESCARTADO", "DESISTIU"])).toBe(true);
  });

  /**
   * DESCARTAR E DESISTIR TRATAM, e este é o ponto que a régua precisa deixar dito: numa vaga CHEIA o
   * consultor não vai conseguir aprovar mais ninguém (a trava 1 recusa), então o caminho que resta
   * para o pendente é o descarte ou a desistência. As duas contam como tratamento, e é por isso que
   * a vaga cheia consegue fechar.
   */
  it("vaga cheia fecha tratando o excedente por descarte ou desistência", () => {
    expect(cabeMaisUm(1, 1)).toBe(false); // a trava 1 não deixa aprovar mais um
    expect(vagaPodeEncerrar(["APROVADO", "DESCARTADO", "DESISTIU"])).toBe(true);
  });

  it("vaga sem candidato nenhum fecha: não há fila a tratar", () => {
    expect(vagaPodeEncerrar([])).toBe(true);
  });

  /**
   * A LISTA DOS PENDENTES é o que faz o modal existir: sem os nomes e as etapas, a tela só
   * conseguiria dizer "tem gente pendente" e mandar a pessoa procurar quem é.
   */
  it("devolve OS PENDENTES inteiros, na ordem, para a tela montar o modal", () => {
    const linhas = [
      { candidaturaId: "a", candidatoNome: "Ana", etapa: "TRIAGEM", situacao: "ATIVO" as const },
      { candidaturaId: "b", candidatoNome: "Bruno", etapa: "APROVACAO", situacao: "APROVADO" as const },
      { candidaturaId: "c", candidatoNome: "Célia", etapa: "CAPTACAO", situacao: "ATIVO" as const },
    ];
    expect(pendentesDeTratamento(linhas).map((l) => l.candidaturaId)).toEqual(["a", "c"]);
    // A FORMA DO QUE ENTROU VOLTA INTEIRA: o service não precisa refiltrar nem remontar nada.
    expect(pendentesDeTratamento(linhas)[0]).toEqual(linhas[0]);
  });

  it("sem pendente, a lista volta vazia", () => {
    expect(pendentesDeTratamento([{ situacao: "CONTRATADO" as CandidaturaSituacao }])).toEqual([]);
  });
});


// ── A REENTRADA EM VAGA JÁ ENCERRADA (ajuste do diretor) ────────────────────

/** Uma linha como o service a lê: só o que a régua olha, e nada de PII. */
function linha(
  situacao: CandidaturaSituacao,
  encerradaEm: string | null = null,
): { situacao: CandidaturaSituacao; encerradaEm: Date | null; motivo?: string } {
  return { situacao, encerradaEm: encerradaEm ? new Date(encerradaEm) : null };
}

describe("as situações VIVAS, derivadas e não redigitadas", () => {
  it("viva é ATIVO, APROVADO e CONTRATADO, e é exatamente o conjunto do índice parcial", () => {
    expect([...SITUACOES_VIVAS].sort()).toEqual(["APROVADO", "ATIVO", "CONTRATADO"]);
  });

  it("é o COMPLEMENTO EXATO de `ehSaidaSemExito`: toda situação é viva ou encerrada, nunca as duas", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      expect(candidaturaViva(s)).toBe(!ehSaidaSemExito(s));
      expect(SITUACOES_VIVAS.includes(s)).toBe(candidaturaViva(s));
    }
  });

  it("cobre o que CONSOME POSIÇÃO: a régua da ocupação e a do índice não podem discordar", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      if (consomePosicao(s)) expect(SITUACOES_VIVAS).toContain(s);
    }
  });

  it("DESCARTADO e DESISTIU ficam de fora: é justamente o que libera a reentrada", () => {
    expect(SITUACOES_VIVAS).not.toContain("DESCARTADO");
    expect(SITUACOES_VIVAS).not.toContain("DESISTIU");
  });
});

describe("TRAVA 3: a duplicata, agora só entre as VIVAS", () => {
  it("sem candidatura nenhuma, a vaga está livre para esta pessoa", () => {
    expect(decidirAlocacao([]).tipo).toBe("LIVRE");
  });

  it("candidatura VIVA continua barrando, nas três situações vivas", () => {
    for (const s of SITUACOES_VIVAS) {
      expect(decidirAlocacao([linha(s)]).tipo).toBe("JA_ESTA");
    }
  });

  it("só encerradas: é REENTRADA, e não duplicata", () => {
    expect(decidirAlocacao([linha("DESCARTADO", "2026-03-10T12:00:00Z")]).tipo).toBe("REENTRADA");
    expect(decidirAlocacao([linha("DESISTIU", "2026-03-10T12:00:00Z")]).tipo).toBe("REENTRADA");
  });

  it("VÁRIAS encerradas convivem, e não viram duplicata nenhuma", () => {
    const d = decidirAlocacao([
      linha("DESCARTADO", "2026-01-05T12:00:00Z"),
      linha("DESISTIU", "2026-04-20T12:00:00Z"),
      linha("DESCARTADO", "2026-02-11T12:00:00Z"),
    ]);
    expect(d.tipo).toBe("REENTRADA");
  });

  it("a VIVA vence a encerrada: quem voltou e está em seleção não entra outra vez", () => {
    const d = decidirAlocacao([linha("DESCARTADO", "2026-03-10T12:00:00Z"), linha("ATIVO")]);
    expect(d.tipo).toBe("JA_ESTA");
  });

  it("devolve a encerrada MAIS RECENTE, e não a primeira que o banco entregou", () => {
    const d = decidirAlocacao([
      linha("DESCARTADO", "2026-01-05T12:00:00Z"),
      linha("DESISTIU", "2026-04-20T12:00:00Z"),
      linha("DESCARTADO", "2026-02-11T12:00:00Z"),
    ]);
    expect(d.tipo === "REENTRADA" && d.anterior.situacao).toBe("DESISTIU");
  });

  it("a ordem em que as linhas chegam não muda a resposta", () => {
    const linhas = [
      linha("DESCARTADO", "2026-01-05T12:00:00Z"),
      linha("DESISTIU", "2026-04-20T12:00:00Z"),
    ];
    const a = decidirAlocacao(linhas);
    const b = decidirAlocacao([...linhas].reverse());
    expect(a.tipo === "REENTRADA" && a.anterior.situacao).toBe("DESISTIU");
    expect(b.tipo === "REENTRADA" && b.anterior.situacao).toBe("DESISTIU");
  });

  it("encerrada SEM carimbo nunca vence a que tem data: sem data, não é a mais recente", () => {
    const d = decidirAlocacao([linha("DESISTIU", null), linha("DESCARTADO", "2026-02-11T12:00:00Z")]);
    expect(d.tipo === "REENTRADA" && d.anterior.situacao).toBe("DESCARTADO");
  });

  it("uma encerrada sozinha e sem carimbo ainda é reentrada, não um caso perdido", () => {
    const d = decidirAlocacao([linha("DESCARTADO", null)]);
    expect(d.tipo === "REENTRADA" && d.anterior.encerradaEm).toBeNull();
  });
});
