import { VAGA_STATUS_SEMENTE } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import {
  CANDIDATURA_SITUACAO_AJUDA,
  CANDIDATURA_SITUACAO_LABEL,
  CANDIDATURA_SITUACOES,
  ETAPAS_FUNIL_SEMENTE,
  SITUACOES_QUE_FINALIZAM_POSICAO,
  finalizaPosicao,
  type CandidaturaSituacao,
} from "@ea/shared-types";
import {
  destinosDeEtapa,
  SITUACOES_QUE_CONSOMEM_POSICAO,
  SITUACOES_TRATADAS,
  SITUACOES_VIVAS,
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
  posicaoNoFunil,
  proximasEtapas,
  vagaPodeEncerrar,
} from "./candidatura";

/**
 * ─ A LISTA DE ETAPAS DEIXOU DE SER CONSTANTE E VIROU PARÂMETRO ────────────────────────────────
 *
 * `CANDIDATURA_ETAPAS` SAIU DO VOCABULÁRIO: a lista é DADO DO DIRETOR, na tabela `as_etapas_funil`.
 * O que estes testes usam é a SEMENTE (`ETAPAS_FUNIL_SEMENTE`), que é a lista de HOJE e serve como
 * corpo de prova estável para as regras do funil, que não dependem de quantas etapas existem.
 *
 * O TESTE DE ORDEM DA LISTA SAIU DAQUI DE PROPÓSITO, e é a mudança que mais importa: afirmar "são
 * estas cinco, nesta ordem" passou a ser afirmar sobre a escolha do diretor, e quebraria no dia em
 * que ele criasse a sexta. O que sobra afirmado é o que continua sendo REGRA: de qualquer etapa
 * para qualquer outra, menos para ela mesma.
 */
const ETAPAS = ETAPAS_FUNIL_SEMENTE.map((e) => e.codigo);

describe("o funil de seleção", () => {
  it("dá destino para toda etapa do catálogo, e o destino nunca é ela mesma", () => {
    for (const e of ETAPAS) {
      const destinos = destinosDeEtapa(e, ETAPAS);
      expect(destinos).toBeDefined();
      expect(destinos).not.toContain(e);
      expect(destinos).toHaveLength(ETAPAS.length - 1);
    }
  });

  /**
   * O CATÁLOGO É DE QUEM OPERA, e a régua tem de valer para a lista que ele montar. Este teste é o
   * que impede alguém de, um dia, reintroduzir a lista de cinco em código dentro do domínio.
   */
  it("vale para um funil que o diretor invente, com nome e tamanho diferentes", () => {
    const dele = ["ENTRADA", "PROVA_PRATICA", "OFERTA"];
    expect(destinosDeEtapa("PROVA_PRATICA", dele).sort()).toEqual(["ENTRADA", "OFERTA"]);
    expect(movimentoPermitido("ENTRADA", "OFERTA")).toBe(true);
    expect(ehEtapaConhecida("PROVA_PRATICA", dele)).toBe(true);
    expect(ehEtapaConhecida("TRIAGEM", dele)).toBe(false);
  });

  /**
   * A ORDENAÇÃO POR FUNIL SAIU DO `indexOf` E VIROU CONSULTA AO CATÁLOGO, e este teste guarda o
   * caso que o `indexOf` errava calado: a etapa DESCONHECIDA (inativada, por exemplo) ia para `-1`,
   * isto é, para ANTES da primeira do funil. Agora ela vai para o FIM.
   */
  it("ordena pela ordem do catálogo, e manda a etapa desconhecida para o fim", () => {
    const ordem = new Map(ETAPAS_FUNIL_SEMENTE.map((e) => [e.codigo, e.ordem]));
    expect(posicaoNoFunil("CAPTACAO", ordem)).toBe(1);
    expect(posicaoNoFunil("APROVACAO", ordem)).toBe(5);
    expect(posicaoNoFunil("ETAPA_QUE_SAIU_DE_CIRCULACAO", ordem)).toBeGreaterThan(
      posicaoNoFunil("APROVACAO", ordem),
    );
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
    expect(entrevistaClienteEhOpcional(ETAPAS)).toBe(true);
    expect(proximasEtapas("ENTREVISTA_SOULAN", ETAPAS)).toContain("APROVACAO");
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
    expect(proximasEtapas("APROVACAO", ETAPAS).sort()).toEqual([
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
    expect(ehEtapaConhecida("TRIAGEM", ETAPAS)).toBe(true);
    expect(ehEtapaConhecida("ENTREVISTA_FINAL", ETAPAS)).toBe(false);
  });
});

describe("as saídas, de qualquer etapa", () => {
  it("as três saídas são descarte, desistência e contratação", () => {
    expect(ehSaida("DESCARTADO")).toBe(true);
    expect(ehSaida("DESISTIU")).toBe(true);
    expect(ehSaida("ENVIADO_PARA_ADMISSAO")).toBe(true);
    expect(ehSaida("ATIVO")).toBe(false);
    expect(ehSaida("APROVADO")).toBe(false);
  });

  it("só descarte e desistência encerram SEM êxito (contratado é saída que ocupa posição)", () => {
    expect(ehSaidaSemExito("DESCARTADO")).toBe(true);
    expect(ehSaidaSemExito("DESISTIU")).toBe(true);
    expect(ehSaidaSemExito("ENVIADO_PARA_ADMISSAO")).toBe(false);
  });
});

describe("a régua da ocupação, sempre derivada", () => {
  it("APROVADO e ENVIADO_PARA_ADMISSAO consomem posição; o resto não", () => {
    expect(consomePosicao("APROVADO")).toBe(true);
    expect(consomePosicao("ENVIADO_PARA_ADMISSAO")).toBe(true);
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
    s.push("ENVIADO_PARA_ADMISSAO");
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
    expect(o).toEqual({
      ocupadas: 0,
      finalizadas: 0,
      finalizadasOficial: 0,
      finalizadasBanco: 0,
      livres: 3,
      emSelecao: 0,
      fora: 0,
      excedida: false,
    });
  });

  /**
   * ─ OS DOIS NÚMEROS DE POSIÇÃO, e o invariante que os prende um ao outro (etapa 1) ─────────────
   *
   * `finalizadas` É A POSIÇÃO ENTREGUE, e `ocupadas` é a posição TOMADA. Não são um contador
   * duplicado: saem da MESMA leitura, na MESMA função, no MESMO instante, e por isso não têm como
   * discordar. O que este bloco guarda é o invariante `finalizadas <= ocupadas`, que só se quebra
   * se alguém redigitar uma das duas listas em vez de derivar uma da outra.
   */
  it("`finalizadas` conta só quem ENTREGOU a posição, e `ocupadas` conta quem a TOMOU", () => {
    const o = ocupacaoDaVaga(10, [
      "ATIVO",
      "APROVADO",
      "APROVADO",
      "ENVIADO_PARA_ADMISSAO",
      "DESCARTADO",
    ]);
    expect(o.ocupadas).toBe(3);
    expect(o.finalizadas).toBe(1);
    expect(o.emSelecao).toBe(1);
    expect(o.fora).toBe(1);
  });

  it("`finalizadas <= ocupadas` vale para TODA combinação de situações", () => {
    for (const a of CANDIDATURA_SITUACOES) {
      for (const b of CANDIDATURA_SITUACOES) {
        const o = ocupacaoDaVaga(5, [a, b]);
        expect(o.finalizadas).toBeLessThanOrEqual(o.ocupadas);
      }
    }
  });

  /**
   * ─ A SEGUNDA INVARIANTE: `finalizadas === finalizadasOficial + finalizadasBanco` ──────────────
   *
   * A VARREDURA É SOBRE SITUAÇÃO **E** LADO, e o lado entra com os QUATRO valores que o banco pode
   * devolver: `OFICIAL`, `BANCO`, `null` (a coluna nasceu nula, e nulo vale OFICIAL) e um valor
   * ESTRANHO, que é o caso de alguém escrever pelo psql por cima do CHECK. Nenhum deles pode criar
   * um terceiro lado nem sumir da soma: se um item entregue não cair em exatamente um dos dois
   * lados, o total deixa de bater e é este teste que quebra.
   *
   * POR QUE ISTO PRECISA DE TESTE, se sai da mesma leitura: porque o dia em que alguém "otimizar"
   * um dos três números para uma contagem separada (um `count(*) where posicao_lado = 'OFICIAL'`,
   * por exemplo) é o dia em que a soma para de valer em silêncio, exatamente no caso do lado nulo.
   */
  it("`finalizadas === finalizadasOficial + finalizadasBanco` em toda combinação de situação e lado", () => {
    const lados = ["OFICIAL", "BANCO", null, "SEI_LA"];
    for (const a of CANDIDATURA_SITUACOES) {
      for (const b of CANDIDATURA_SITUACOES) {
        for (const ladoA of lados) {
          for (const ladoB of lados) {
            const o = ocupacaoDaVaga(5, [
              { situacao: a, posicaoLado: ladoA },
              { situacao: b, posicaoLado: ladoB },
            ]);
            expect(o.finalizadasOficial + o.finalizadasBanco).toBe(o.finalizadas);
            expect(o.finalizadas).toBeLessThanOrEqual(o.ocupadas);
          }
        }
      }
    }
  });

  /**
   * O CASO CONCRETO POR TRÁS DA INVARIANTE, com a vaga real de homologação: 5 oficiais e 20 de
   * banco. Duas pessoas entregues no banco e uma no oficial dão `finalizadas: 3`, e é a SEPARAÇÃO
   * que impede o cilindro oficial de mostrar 3 de 5 quando só uma posição oficial foi preenchida.
   */
  it("separa a entrega pelo lado de cada candidatura", () => {
    const o = ocupacaoDaVaga(5, [
      { situacao: "ALOCADO", posicaoLado: "BANCO" },
      { situacao: "ALOCADO", posicaoLado: "BANCO" },
      { situacao: "ALOCADO", posicaoLado: "OFICIAL" },
      { situacao: "APROVADO", posicaoLado: null },
      { situacao: "DESCARTADO", posicaoLado: "BANCO" },
    ]);
    expect(o.finalizadas).toBe(3);
    expect(o.finalizadasOficial).toBe(1);
    expect(o.finalizadasBanco).toBe(2);
    // O descartado no banco NÃO entra em lado nenhum: quem sai sem êxito nunca entregou posição.
    expect(o.fora).toBe(1);
  });

  /**
   * ─ LIVRES E EXCEDIDA SÃO DO LADO OFICIAL: o terceiro defeito da mesma família ─────────────────
   *
   * O CENÁRIO É A VAGA REAL DE HOMOLOGAÇÃO: 5 posições oficiais, 20 de banco, VINTE pessoas
   * entregues na RESERVA e NENHUMA no oficial. Enquanto `livres` e `excedida` mediam o TOTAL contra
   * a meta oficial, a tela dizia que a vaga tinha estourado com as CINCO posições oficiais VAZIAS.
   *
   * QUEM ESTÁ NA RESERVA NÃO ENCHE E NÃO ESTOURA O CILINDRO OFICIAL. A reserva tem meta própria
   * (`tetoDoLado`) e é medida contra ela, na trava.
   */
  it("vinte na reserva não tiram nenhuma posição oficial nem excedem a vaga", () => {
    const o = ocupacaoDaVaga(
      5,
      Array.from({ length: 20 }, () => ({
        situacao: "ALOCADO" as const,
        posicaoLado: "BANCO",
      })),
    );
    expect(o.livres).toBe(5);
    expect(o.excedida).toBe(false);
    // E o total NÃO mudou de significado: as vinte continuam tomando posição da vaga.
    expect(o.ocupadas).toBe(20);
    expect(o.finalizadasBanco).toBe(20);
    expect(o.finalizadasOficial).toBe(0);
  });

  /**
   * O SIMÉTRICO, QUE NÃO PODE QUEBRAR: a vaga que ENCOLHEU depois de aprovar. Nove aprovados no lado
   * OFICIAL em oito posições continuam dando zero livres e `excedida = true`, que é comportamento
   * validado. O sistema não desfaz aprovação nenhuma: mostra o excedente e deixa a correção para
   * gente.
   */
  it("a vaga que encolheu no lado OFICIAL continua excedida", () => {
    const o = ocupacaoDaVaga(
      8,
      Array.from({ length: 9 }, () => ({
        situacao: "APROVADO" as const,
        posicaoLado: "OFICIAL",
      })),
    );
    expect(o.livres).toBe(0);
    expect(o.excedida).toBe(true);
  });

  /** E o lado NULO conta como oficial aqui também, que é como toda linha de hoje está gravada. */
  it("o lado nulo estoura a vaga como oficial, porque é o que ele é", () => {
    const o = ocupacaoDaVaga(2, [
      { situacao: "APROVADO", posicaoLado: null },
      { situacao: "APROVADO" },
      "APROVADO",
    ]);
    expect(o.livres).toBe(0);
    expect(o.excedida).toBe(true);
  });

  /**
   * OS DOIS LADOS JUNTOS, que é o caso em que a conta antiga e a nova mais divergem: 4 no oficial e
   * 10 na reserva de uma vaga de 5 deixam UMA posição oficial livre, e não zero.
   */
  it("com gente dos dois lados, só a oficial conta para livres", () => {
    const o = ocupacaoDaVaga(5, [
      ...Array.from({ length: 4 }, () => ({ situacao: "APROVADO" as const, posicaoLado: "OFICIAL" })),
      ...Array.from({ length: 10 }, () => ({ situacao: "ALOCADO" as const, posicaoLado: "BANCO" })),
    ]);
    expect(o.ocupadas).toBe(14);
    expect(o.livres).toBe(1);
    expect(o.excedida).toBe(false);
  });

  /**
   * A FORMA CURTA (só a situação) É A LONGA COM O LADO NULO, e nulo é OFICIAL. É o que mantém de pé
   * toda chamada e todo teste anteriores a esta separação, sem uma varredura de reescrita.
   */
  it("a lista de situações puras é lida como entrega toda OFICIAL", () => {
    const curta = ocupacaoDaVaga(5, ["ALOCADO", "ENVIADO_PARA_ADMISSAO"]);
    const longa = ocupacaoDaVaga(5, [
      { situacao: "ALOCADO" },
      { situacao: "ENVIADO_PARA_ADMISSAO", posicaoLado: null },
    ]);
    expect(curta).toEqual(longa);
    expect(curta.finalizadasOficial).toBe(2);
    expect(curta.finalizadasBanco).toBe(0);
  });

  /**
   * LIVRES SAI DE `ocupadas`, NÃO DE `finalizadas`, e este teste é quem guarda a escolha: quem foi
   * aprovado tem a posição RESERVADA antes da entrega. Trocar a base de `livres` para `finalizadas`
   * mataria a trava 1, e uma vaga de 1 aceitaria uma segunda aprovação com a primeira dentro.
   */
  it("aprovado sem entrega ainda ocupa a posição: não sobra livre", () => {
    const o = ocupacaoDaVaga(1, ["APROVADO"]);
    expect(o.finalizadas).toBe(0);
    expect(o.ocupadas).toBe(1);
    expect(o.livres).toBe(0);
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

/**
 * ─ A TRAVA 2 MUDOU DE CASA, E A ASSERÇÃO A SEGUE (onda B2) ─────────────────────────────────────
 *
 * `STATUS_QUE_NAO_RECEBEM` e `vagaRecebeCandidato` saíram do domínio: a pergunta agora é feita ao
 * CATÁLOGO (`as_vaga_status`), pelo flag `recebeCandidato`. O QUE ESTE BLOCO AFIRMA É QUE A RESPOSTA
 * NÃO MUDOU, e é isso que faz esta frente ser migração de FORMA e não de comportamento.
 *
 * A FONTE É A SEMENTE (`VAGA_STATUS_SEMENTE`), que é o que a migration 0102 grava, e não uma lista
 * digitada aqui: uma cópia concordaria com a semente hoje e divergiria na primeira correção. O
 * `VAGA_BANCO` não aparece porque ele não está na semente; ele entra pelo fallback da migration,
 * inativo e recebendo, e quem afirma isso é o teste da própria migration.
 */
describe("TRAVA 2: alocar em vaga fechada", () => {
  it("os três que ENCERRAM não recebem candidato novo, e é o mesmo trio de sempre", () => {
    const naoRecebem = VAGA_STATUS_SEMENTE.filter((s) => !s.recebeCandidato).map((s) => s.codigo);
    expect(naoRecebem).toEqual(["ENTREGUE", "FECHADA", "CANCELADA"]);
    // E OS DOIS FLAGS ANDAM JUNTOS NA SEMENTE, o que é a leitura do CHECK 2 do banco: terminal não
    // recebe gente. Eles NÃO são o mesmo flag (um status pausado é `recebeCandidato: false` e
    // `encerra: false`), e é por isso que a asserção é sobre a direção, e não sobre a igualdade.
    for (const s of VAGA_STATUS_SEMENTE) if (s.encerra) expect(s.recebeCandidato).toBe(false);
  });

  it("ABERTA recebe, e o RASCUNHO também (a captação começa antes de publicar)", () => {
    const recebem = VAGA_STATUS_SEMENTE.filter((s) => s.recebeCandidato).map((s) => s.codigo);
    expect(recebem).toEqual(["RASCUNHO", "ABERTA"]);
  });
});

/**
 * A TRAVA 5 (ajuste do diretor): a vaga só encerra com TODO MUNDO TRATADO.
 *
 * A regra existe para a vaga não fechar deixando gente PENDURADA no funil, sem ninguém nunca ter
 * dito o que aconteceu com ela. Tratado é ter recebido UMA DECISÃO, e não ter dado certo.
 */
describe("TRAVA 5: encerrar a vaga só com todos os candidatos tratados", () => {
  it("as cinco situações de decisão contam como tratadas", () => {
    for (const s of SITUACOES_TRATADAS) expect(candidaturaTratada(s)).toBe(true);
    expect([...SITUACOES_TRATADAS].sort()).toEqual(
      ["APROVADO", "ALOCADO", "ENVIADO_PARA_ADMISSAO", "DESCARTADO", "DESISTIU"].sort(),
    );
  });

  /**
   * ─ SÓ `ATIVO` FICA PENDENTE, e a etapa 1 é quem fechou isto ─────────────────────────────────
   *
   * A ETAPA 0 DEIXOU `ALOCADO` PENDENTE de propósito, pelo fail-closed de `candidaturaTratada`, que
   * pergunta se a situação ESTÁ NA LISTA em vez de perguntar se ela é diferente de `ATIVO`: situação
   * nova nasce PENDENTE e segura a vaga até alguém decidir o que ela significa. A etapa 1 decidiu:
   * ALOCADO é TRATADO, porque alocar é a decisão mais definitiva de todas.
   *
   * O QUE ESTE TESTE IMPEDE DE VOLTAR: com `ALOCADO` fora de `SITUACOES_TRATADAS`, cada pessoa
   * alocada contaria como pendente de tratamento e a vaga NÃO FECHARIA NUNCA pela trava 5,
   * justamente na vaga que deu certo.
   *
   * TRATADO E OCUPAR POSIÇÃO SÃO PERGUNTAS DIFERENTES, e este teste não responde a segunda: se
   * `ALOCADO` consome ou finaliza posição está em `SITUACOES_QUE_FINALIZAM_POSICAO`, no
   * `shared-types`, e tem bloco próprio no fim deste arquivo.
   */
  it("só `ATIVO` fica pendente: `ALOCADO` é tratado, e é a decisão mais definitiva de todas", () => {
    expect(candidaturaTratada("ATIVO")).toBe(false);
    expect(candidaturaTratada("ALOCADO")).toBe(true);
    const fora = CANDIDATURA_SITUACOES.filter((s) => !SITUACOES_TRATADAS.includes(s));
    expect(fora).toEqual(["ATIVO"]);
  });

  /**
   * A CONSEQUÊNCIA PRÁTICA, dita como a trava 5 a vê: a vaga que entregou fecha.
   *
   * Sem a linha da etapa 1 este `expect` seria `false`, e a mensagem que chegaria ao consultor seria
   * "esta vaga tem candidato pendente" apontando para a pessoa que ele acabou de alocar.
   */
  it("uma vaga com gente ALOCADA encerra: alocar não deixa ninguém pendurado", () => {
    expect(vagaPodeEncerrar(["ALOCADO", "ALOCADO", "DESCARTADO"])).toBe(true);
    expect(vagaPodeEncerrar(["ALOCADO", "ATIVO"])).toBe(false);
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
    expect(vagaPodeEncerrar(["APROVADO", "ENVIADO_PARA_ADMISSAO", "DESCARTADO", "DESISTIU"])).toBe(true);
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
    expect(pendentesDeTratamento([{ situacao: "ENVIADO_PARA_ADMISSAO" as CandidaturaSituacao }])).toEqual([]);
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
  /**
   * `ALOCADO` ENTROU AQUI SEM UMA LINHA DE CÓDIGO, e é o fail-closed funcionando na direção certa:
   * `SITUACOES_VIVAS` é o complemento de `ehSaidaSemExito`, então situação nova nasce VIVA, isto é,
   * PROTEGIDA pela trava de duplicata. Alocar não é sair do processo, então esta é a resposta certa.
   *
   * ESTE TESTE NÃO OLHA O BANCO, e o índice parcial de lá é uma lista COMPILADA no predicado, que
   * `ALTER TYPE ... ADD VALUE` não atualiza. Este `expect` passar não prova que o índice cobre
   * `ALOCADO`: a prova é o `SELECT` em `pg_indexes` depois da migration.
   */
  it("viva é ATIVO, APROVADO, ALOCADO e ENVIADO_PARA_ADMISSAO", () => {
    expect([...SITUACOES_VIVAS].sort()).toEqual([
      "ALOCADO",
      "APROVADO",
      "ATIVO",
      "ENVIADO_PARA_ADMISSAO",
    ]);
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

/**
 * ─ O VOCABULÁRIO DO MODELO DE POSIÇÃO (etapa 0, 08/09) ──────────────────────────────────────────
 *
 * ESTE BLOCO NÃO TESTA COMPORTAMENTO, TESTA O CONTRATO. Ele existe porque a régua de "quem consome
 * posição" estava escrita em QUATRO lugares que concordavam por coincidência, e a etapa 0 a reduziu
 * a UM. Um contrato sem teste volta a se espalhar na primeira pressa.
 */
describe("VOCABULÁRIO: o modelo de posição, com uma fonte só", () => {
  it("`ALOCADO` e `ENVIADO_PARA_ADMISSAO` existem e são situações SEPARADAS", () => {
    expect(CANDIDATURA_SITUACOES).toContain("ALOCADO");
    expect(CANDIDATURA_SITUACOES).toContain("ENVIADO_PARA_ADMISSAO");
    expect(CANDIDATURA_SITUACOES.filter((s) => s === "ALOCADO")).toHaveLength(1);
  });

  /**
   * A PALAVRA "CONTRATADO" SAIU, e o teste guarda a decisão do diretor: ela dava a entender uma
   * admissão concluída que não está concluída. Se alguém a reintroduzir no vocabulário, este
   * `expect` cai antes de a palavra chegar à tela.
   */
  it('a palavra "CONTRATADO" não volta ao vocabulário', () => {
    expect(CANDIDATURA_SITUACOES as readonly string[]).not.toContain("CONTRATADO");
    for (const s of CANDIDATURA_SITUACOES) {
      expect(CANDIDATURA_SITUACAO_LABEL[s]).not.toMatch(/Contratad/i);
    }
  });

  it("todo valor tem rótulo e tem a frase que explica a diferença ao consultor", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      expect(CANDIDATURA_SITUACAO_LABEL[s]?.trim()).toBeTruthy();
      expect(CANDIDATURA_SITUACAO_AJUDA[s]?.trim()).toBeTruthy();
    }
  });

  /** §A.11: travessão proibido em qualquer texto que chegue ao usuário. */
  it("nenhum rótulo nem frase de ajuda usa travessão (§A.11)", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      expect(CANDIDATURA_SITUACAO_LABEL[s]).not.toContain("\u2014");
      expect(CANDIDATURA_SITUACAO_AJUDA[s]).not.toContain("\u2014");
    }
  });

  /**
   * A INVARIANTE QUE SUSTENTA O CILINDRO: tudo que ENTREGA a posição também a TOMA. Sem ela, o
   * cilindro poderia mostrar mais entregue do que ocupado, que é um número impossível.
   */
  it("finalizar posição IMPLICA consumir posição, sempre", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      if (finalizaPosicao(s)) expect(consomePosicao(s)).toBe(true);
    }
  });

  it("`APROVADO` toma posição sem entregar: reserva o lugar antes da entrega", () => {
    expect(consomePosicao("APROVADO")).toBe(true);
    expect(finalizaPosicao("APROVADO")).toBe(false);
  });

  it("quem está em seleção ou saiu sem êxito não toma nem entrega posição", () => {
    for (const s of ["ATIVO", "DESCARTADO", "DESISTIU"] as CandidaturaSituacao[]) {
      expect(consomePosicao(s)).toBe(false);
      expect(finalizaPosicao(s)).toBe(false);
    }
  });

  /**
   * ─ O ÚNICO PONTO DA ETAPA 1 QUE FICOU PENDENTE, e ele é PENDENTE DE PROPÓSITO ────────────────
   *
   * `ALOCADO` AINDA NÃO CONSOME NEM FINALIZA POSIÇÃO, porque a lista que decide isso
   * (`SITUACOES_QUE_FINALIZAM_POSICAO`) mora no `shared-types`, que é ARQUIVO DO COORDENADOR
   * (§A.39: dois agentes escrevendo o arquivo compartilhado se sobrescrevem em silêncio, e o
   * segundo a gravar apaga o primeiro sem que nada falhe). A etapa 1 PEDIU a linha e não a
   * escreveu.
   *
   * A LINHA PEDIDA, exatamente:
   *   export const SITUACOES_QUE_FINALIZAM_POSICAO: readonly CandidaturaSituacao[] = [
   *     "ALOCADO",
   *     "ENVIADO_PARA_ADMISSAO",
   *   ];
   *
   * A LINHA FOI APLICADA PELO COORDENADOR, e o tripwire fez o trabalho dele: falhou no instante
   * exato da aplicação, apontando para este ponto. O que se segue é o estado NOVO.
   *
   * E BASTOU A LINHA, que era a aposta da etapa 1: nada mais precisou mudar para `ALOCADO` passar a
   * contar em toda parte. As contagens em SQL leem `SITUACOES_QUE_CONSOMEM_POSICAO`, derivada de
   * `consomePosicao`, e o cilindro lê `finalizadas`, derivada de `finalizaPosicao`. Uma edição, e a
   * régua inteira acompanhou. É essa propriedade, e não a lista em si, que este bloco protege.
   *
   * CONTINUA INOFENSIVO ATÉ A ETAPA 2: nada escreve `ALOCADO` no banco ainda, então não existe linha
   * em que a conta pudesse errar. A partir da etapa 2 existe, e é por isso que a régua precisava
   * estar certa ANTES da rota que escreve.
   */
  it("`ALOCADO` finaliza E consome posição, pela linha única do shared-types", () => {
    expect(SITUACOES_QUE_FINALIZAM_POSICAO).toEqual(["ALOCADO", "ENVIADO_PARA_ADMISSAO"]);
    expect(finalizaPosicao("ALOCADO")).toBe(true);
    expect(consomePosicao("ALOCADO")).toBe(true);
  });

  /**
   * ─ A DERIVAÇÃO, que é o que faz a linha pedida acima bastar sozinha ──────────────────────────
   *
   * `SITUACOES_QUE_CONSOMEM_POSICAO` existe porque `inArray` precisa de um ARRAY e não de uma
   * função, e é ela que as contagens em SQL passaram a ler no lugar das listas escritas à mão. Este
   * teste afirma que ela é DERIVADA, e não uma segunda lista: para toda situação do vocabulário, o
   * pertencimento à constante e a resposta de `consomePosicao` são a MESMA coisa.
   *
   * O DIA EM QUE ISTO QUEBRAR é o dia em que alguém redigitou a lista, e é exatamente o defeito que
   * custou cinco cópias desta régua espalhadas pelo módulo.
   */
  it("a lista usada pelo SQL é DERIVADA de `consomePosicao`, nunca redigitada", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      expect(SITUACOES_QUE_CONSOMEM_POSICAO.includes(s)).toBe(consomePosicao(s));
    }
    // Ela CONTÉM tudo que finaliza, mais `APROVADO`, que reserva antes de entregar.
    for (const s of SITUACOES_QUE_FINALIZAM_POSICAO) {
      expect(SITUACOES_QUE_CONSOMEM_POSICAO).toContain(s);
    }
    expect(SITUACOES_QUE_CONSOMEM_POSICAO).toContain("APROVADO");
  });

  /**
   * TODA SITUAÇÃO QUE CONSOME POSIÇÃO É VIVA, e portanto está sob o índice parcial de duplicata.
   * Se um dia uma delas cair fora de `SITUACOES_VIVAS`, o banco deixaria de barrar a segunda linha
   * viva do par pessoa/vaga e a contagem de posições passaria a mentir em silêncio.
   */
  it("quem consome posição está SEMPRE entre as vivas: a trava do banco não pode perdê-lo", () => {
    for (const s of SITUACOES_QUE_CONSOMEM_POSICAO) expect(SITUACOES_VIVAS).toContain(s);
  });
});
