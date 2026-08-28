import { describe, expect, it } from "vitest";
import type { EstadoFrente } from "./frentes";
import { podeAbrirCadastro } from "./frentes";
import {
  conclui,
  desfazLiberacaoSemAso,
  ehStatusDinamico,
  isReversao,
  isStatusValido,
  ORDEM_STATUS,
  reversaoDerrubaCadastro,
  STATUS_CONCLUI,
} from "./esteira";

describe("conclui() / isStatusValido() (§A.3 status por frente)", () => {
  it("conclui marca só o status terminal de cada frente", () => {
    expect(conclui("AUDITORIA", "ANALISE_OK")).toBe(true);
    expect(conclui("AUDITORIA", "ANALISE_PENDENTE")).toBe(false);
    expect(conclui("EXAME", "APTO")).toBe(true);
    expect(conclui("EXAME", "AGENDADO")).toBe(false);
    // Reorganização (migration 0026): o concluinte do Cadastro é CADASTRADO, não mais INTEGRACAO.
    expect(conclui("CADASTRO_CONTRATO", "CADASTRADO")).toBe(true);
    expect(conclui("CADASTRO_CONTRATO", "A_CADASTRAR")).toBe(false);
    // Os status da esteira manual antiga saíram do catálogo e não concluem mais nada.
    expect(conclui("CADASTRO_CONTRATO", "INTEGRACAO")).toBe(false);
    expect(conclui("CADASTRO_CONTRATO", "ENVIADO")).toBe(false);
  });

  it("STATUS_CONCLUI casa com o catálogo seedado", () => {
    expect(STATUS_CONCLUI).toEqual({
      AUDITORIA: "ANALISE_OK",
      EXAME: "APTO",
      CADASTRO_CONTRATO: "CADASTRADO",
      // INTEGRAÇÃO, a última etapa (decisão do diretor). Concluir aqui é o FIM da esteira: a
      // admissão passa a viver no Gerenciador.
      INTEGRACAO: "REALIZADO",
      // IFRACTAL é SEMENTE, não verdade: quem conclui a frente do iFractal é a coluna `conclui` do
      // catálogo no banco, que o time edita pela tela do menu gerencial. A entrada existe porque o
      // mapa é TOTAL, e nenhum caminho de código do iFractal a consulta.
      IFRACTAL: "FINALIZADO",
    });
  });

  it("o iFractal NÃO responde pelas réguas de código: a lista dele vive no banco", () => {
    // A consequência deliberada de `ORDEM_STATUS.IFRACTAL` ser vazio. Se um dia alguém escrever a
    // semente naquele mapa, este teste cai e a pessoa lê o porquê antes de criar a segunda verdade.
    expect(ehStatusDinamico("IFRACTAL")).toBe(true);
    expect(ehStatusDinamico("AUDITORIA")).toBe(false);
    expect(isStatusValido("IFRACTAL", "FINALIZADO")).toBe(false);
    expect(isStatusValido("IFRACTAL", "NAO_CADASTRADO")).toBe(false);
    // Sem ordem em código, mover status no iFractal nunca caracteriza recuo: é o "move livre" pedido.
    expect(isReversao("IFRACTAL", "FINALIZADO", "NAO_CADASTRADO")).toBe(false);
  });

  it("isStatusValido reconhece só os status da própria frente", () => {
    expect(isStatusValido("AUDITORIA", "ANALISE_OK")).toBe(true);
    expect(isStatusValido("AUDITORIA", "DECLINOU")).toBe(true);
    // status válido, mas de outra frente:
    expect(isStatusValido("AUDITORIA", "APTO")).toBe(false);
    expect(isStatusValido("CADASTRO_CONTRATO", "CADASTRADO")).toBe(true);
    expect(isStatusValido("CADASTRO_CONTRATO", "FOO")).toBe(false);
    // Resíduo da esteira manual: fora do catálogo desde a 0026.
    expect(isStatusValido("CADASTRO_CONTRATO", "INTEGRACAO")).toBe(false);
    expect(isStatusValido("CADASTRO_CONTRATO", "ENVIAR")).toBe(false);
    expect(isStatusValido("CADASTRO_CONTRATO", "ENVIADO")).toBe(false);
  });

  it("ORDEM_STATUS cobre todos os status de cada frente (progressão)", () => {
    expect(ORDEM_STATUS.AUDITORIA).toEqual([
      "ANALISE_PENDENTE",
      "AGUARDA_REENVIO",
      "ANALISE_OK",
      "DECLINOU",
    ]);
    // Os dois status de espera do ASO entraram na OST Onda 2, entre Agendado e Apto: descrevem a
    // espera pelo ASO e NÃO concluem. O APTO segue sendo o único concluinte da frente.
    //
    // O LIBERADO_SEM_ASO entrou depois (OST do ADM), no último degrau antes do Apto: ele destrava o
    // avanço no meio da espera, sem concluir. A POSIÇÃO é o que define reversão, e é por isso que
    // ela é afirmada aqui e não só no catálogo do banco.
    expect(ORDEM_STATUS.EXAME).toEqual([
      "A_AGENDAR",
      "AGENDADO",
      "AGUARDANDO_ASO",
      "ASO_PENDENTE",
      "LIBERADO_SEM_ASO",
      "APTO",
      "CANCELADO",
    ]);
    // A coluna Cadastro tem só estes dois (0026): "A Cadastrar" e o concluinte "Cadastrado".
    expect(ORDEM_STATUS.CADASTRO_CONTRATO).toEqual(["A_CADASTRAR", "CADASTRADO"]);
  });
});

describe("isReversao() — recuo de etapa (F8)", () => {
  it("detecta voltar etapa na progressão", () => {
    expect(isReversao("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE")).toBe(true);
    expect(isReversao("EXAME", "APTO", "A_AGENDAR")).toBe(true);
    expect(isReversao("CADASTRO_CONTRATO", "CADASTRADO", "A_CADASTRAR")).toBe(true);
  });

  it("liberar sem ASO é AVANÇO, e voltar dali é RECUO", () => {
    // A liberação vem depois da espera e antes do apto: sair da espera para ela é andar, e voltar
    // dela para o agendamento é recuar, com o alerta de reversão que a frente já tem.
    expect(isReversao("EXAME", "ASO_PENDENTE", "LIBERADO_SEM_ASO")).toBe(false);
    expect(isReversao("EXAME", "LIBERADO_SEM_ASO", "APTO")).toBe(false);
    expect(isReversao("EXAME", "LIBERADO_SEM_ASO", "AGENDADO")).toBe(true);
    expect(isReversao("EXAME", "APTO", "LIBERADO_SEM_ASO")).toBe(true);
  });

  it("liberar sem ASO NÃO conclui a frente", () => {
    // O par do teste acima, e o que sustenta a frente inteira: quem conclui o EXAME é só o APTO.
    expect(conclui("EXAME", "LIBERADO_SEM_ASO")).toBe(false);
    expect(conclui("EXAME", "APTO")).toBe(true);
  });

  it("avançar ou repetir não é reversão", () => {
    expect(isReversao("AUDITORIA", "ANALISE_PENDENTE", "ANALISE_OK")).toBe(false);
    expect(isReversao("EXAME", "A_AGENDAR", "AGENDADO")).toBe(false);
    expect(isReversao("EXAME", "APTO", "APTO")).toBe(false);
  });

  it("status fora do catálogo nunca é reversão", () => {
    expect(isReversao("AUDITORIA", "FOO", "ANALISE_OK")).toBe(false);
    expect(isReversao("AUDITORIA", "ANALISE_OK", "BAR")).toBe(false);
  });
});

describe("GATE CONTÍNUO do Cadastro (§A.3 regra 3) — sequência operacional", () => {
  // Modela o estado das duas frentes concluintes ao longo das mudanças de status.
  const gate = (auditoriaStatus: string, exameStatus: string): boolean => {
    const frentes: EstadoFrente[] = [
      { tipo: "AUDITORIA", concluida: conclui("AUDITORIA", auditoriaStatus) },
      { tipo: "EXAME", concluida: conclui("EXAME", exameStatus) },
    ];
    return podeAbrirCadastro(frentes);
  };

  it("sobe AUDITORIA→ok e EXAME→apto ⇒ abre; reverte AUDITORIA ⇒ recua; reabre ao voltar a ok", () => {
    // partida: nada concluído
    expect(gate("ANALISE_PENDENTE", "A_AGENDAR")).toBe(false);
    // AUDITORIA conclui, EXAME ainda não → independência (regra 2), não abre
    expect(gate("ANALISE_OK", "AGENDADO")).toBe(false);
    // EXAME conclui também → gate abre
    expect(gate("ANALISE_OK", "APTO")).toBe(true);
    // REVERSÃO: AUDITORIA recua para pendente → gate RECUA
    expect(gate("ANALISE_PENDENTE", "APTO")).toBe(false);
    // volta AUDITORIA para ok → gate REABRE (continuidade)
    expect(gate("ANALISE_OK", "APTO")).toBe(true);
  });
});

describe("reversaoDerrubaCadastro() — alerta de reabrir pendência", () => {
  it("true quando uma concluinte cai do terminal com o cadastro aberto", () => {
    // gate estava aberto (AUDITORIA ok + EXAME apto) e AUDITORIA recua
    expect(reversaoDerrubaCadastro("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE", true)).toBe(true);
    expect(reversaoDerrubaCadastro("EXAME", "APTO", "AGENDADO", true)).toBe(true);
  });

  it("false quando o gate nem estava aberto", () => {
    expect(reversaoDerrubaCadastro("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE", false)).toBe(
      false,
    );
  });

  it("false quando a frente não saiu do status terminal (não recua o gate)", () => {
    // de não conclui → não havia conclusão para derrubar
    expect(reversaoDerrubaCadastro("AUDITORIA", "AGUARDA_REENVIO", "ANALISE_PENDENTE", true)).toBe(
      false,
    );
    // para ainda conclui → continua concluída
    expect(reversaoDerrubaCadastro("EXAME", "APTO", "APTO", true)).toBe(false);
  });

  it("CADASTRO_CONTRATO nunca derruba o próprio gate", () => {
    expect(reversaoDerrubaCadastro("CADASTRO_CONTRATO", "CADASTRADO", "A_CADASTRAR", true)).toBe(
      false,
    );
  });
});

/**
 * DESFAZER A LIBERAÇÃO SEM ASO TAMBÉM ALERTA (ajuste final da OST, decisão do diretor).
 *
 * O alerta de reversão existe para uma coisa: o gate do Cadastro FECHAR debaixo de um candidato que
 * já está sendo trabalhado. Enquanto a regra testava `conclui(de)`, ela cobria só o recuo do APTO, e
 * o recuo da liberação passava em silêncio, numa admissão que pode já ter cadastrado, integrado e
 * ido para a assinatura. É o mesmo perigo pela mesma porta.
 */
describe("reversaoDerrubaCadastro() com a liberação sem ASO", () => {
  it("ALERTA ao voltar de Liberado Sem ASO para Agendado (o gate fecha)", () => {
    expect(reversaoDerrubaCadastro("EXAME", "LIBERADO_SEM_ASO", "AGENDADO", true)).toBe(true);
  });

  it("NÃO alerta se o Cadastro nem chegou a abrir", () => {
    expect(reversaoDerrubaCadastro("EXAME", "LIBERADO_SEM_ASO", "AGENDADO", false)).toBe(false);
  });

  it("NÃO alerta indo do liberado para o APTO: o ASO chegou e o gate segue aberto", () => {
    expect(reversaoDerrubaCadastro("EXAME", "LIBERADO_SEM_ASO", "APTO", true)).toBe(false);
  });

  it("NÃO alerta indo do APTO para o liberado: o gate também segue aberto", () => {
    // Trocar de status com o gate aberto dos dois lados não derruba nada. O alerta é sobre FECHAR.
    expect(reversaoDerrubaCadastro("EXAME", "APTO", "LIBERADO_SEM_ASO", true)).toBe(false);
  });

  it("o recado sabe QUAL dos dois recuos aconteceu", () => {
    // "Reabre pendência" descreve o recuo do APTO e não serve para o recuo da liberação, onde o que
    // se perde é o direito de avançar, não um documento.
    expect(desfazLiberacaoSemAso("EXAME", "LIBERADO_SEM_ASO", "AGENDADO")).toBe(true);
    expect(desfazLiberacaoSemAso("EXAME", "LIBERADO_SEM_ASO", "APTO")).toBe(false);
    expect(desfazLiberacaoSemAso("EXAME", "APTO", "AGENDADO")).toBe(false);
    expect(desfazLiberacaoSemAso("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE")).toBe(false);
  });
});
