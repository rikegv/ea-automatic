import { describe, expect, it } from "vitest";
import { CANDIDATURA_SITUACOES, ETAPAS_FUNIL_SEMENTE } from "@ea/shared-types";
import { ApiError } from "./api";
import {
  caminhoAteEtapa,
  destinosDeEtapa,
  ehTravaDeVagaCheia,
  entrevistaClienteEhOpcional,
  bancoPrecisaCiencia,
  formatCpf,
  cardDaCandidatura,
  reentradaPrecisaCiencia,
} from "./as-candidatos";

/**
 * O FUNIL DO TESTE. A lista de etapas passou a ser DADO DO DIRETOR (`as_etapas_funil`), então ela
 * chega às funções por PARÂMETRO e não por constante importada. O corpo de prova aqui é a semente
 * (as cinco de hoje), usada como um catálogo qualquer: o que estes testes afirmam é a RÉGUA sobre a
 * lista recebida, e ela vale para a lista que o diretor cadastrar depois.
 */
const ETAPAS = ETAPAS_FUNIL_SEMENTE.map((e) => e.codigo);
/** A etapa de nascimento do catálogo de prova: hoje a Captação, e amanhã o que ele marcar. */
const NASCE_EM = "CAPTACAO";

describe("funil da Central de Candidatos (espelho do domínio do backend)", () => {
  /**
   * O FUNIL NÃO É UM TRILHO (decisão do diretor, 27/08). Estes testes afirmam o CONTRÁRIO do que a
   * versão anterior afirmava, e é essa a mudança: a tela oferece TODAS as etapas como destino, para
   * a frente e para trás, porque a operação real não é linear.
   */
  it("oferece todas as outras etapas como destino, e nunca a atual", () => {
    for (const de of ETAPAS) {
      const destinos = destinosDeEtapa(de, ETAPAS);
      expect(destinos).toHaveLength(ETAPAS.length - 1);
      expect(destinos).not.toContain(de);
    }
  });

  it("VOLTA de etapa: da Aprovação se oferece o caminho de volta ao começo", () => {
    expect(destinosDeEtapa("APROVACAO", ETAPAS)).toContain("CAPTACAO");
    expect(destinosDeEtapa("ENTREVISTA_CLIENTE", ETAPAS)).toContain("ENTREVISTA_SOULAN");
  });

  it("PULA etapa: da Captação se vai direto para a Aprovação", () => {
    expect(destinosDeEtapa("CAPTACAO", ETAPAS)).toContain("APROVACAO");
  });

  it("pular a Entrevista Cliente é caminho legítimo, não exceção escondida", () => {
    expect(entrevistaClienteEhOpcional(ETAPAS)).toBe(true);
    expect(destinosDeEtapa("ENTREVISTA_SOULAN", ETAPAS)).toContain("ENTREVISTA_CLIENTE");
    expect(destinosDeEtapa("ENTREVISTA_SOULAN", ETAPAS)).toContain("APROVACAO");
  });
});

describe("caminhoAteEtapa (a etapa de entrada do cadastro)", () => {
  it("entrar em Captação não exige movimento nenhum", () => {
    expect(caminhoAteEtapa("CAPTACAO", NASCE_EM)).toEqual([]);
  });

  it("entrar em Triagem é um passo só", () => {
    expect(caminhoAteEtapa("TRIAGEM", NASCE_EM)).toEqual(["TRIAGEM"]);
  });

  /**
   * ERA UMA CAMINHADA DE QUATRO REQUISIÇÕES, VIROU UMA. Com o funil livre, entrar em Aprovação é um
   * movimento único: ou vai inteiro, ou não vai, sem deixar a pessoa parada numa etapa intermediária
   * que ninguém escolheu.
   */
  it("entrar em Aprovação é UM passo, e não a caminhada inteira do funil", () => {
    expect(caminhoAteEtapa("APROVACAO", NASCE_EM)).toEqual(["APROVACAO"]);
  });

  /**
   * A ETAPA DE NASCIMENTO NÃO É MAIS `"CAPTACAO"` ESCRITO NA FUNÇÃO: ela é a coluna `inicial` do
   * catálogo. Se o diretor marcar a Triagem como inicial, cadastrar alguém "entrando em Triagem"
   * NÃO pode disparar movimento nenhum, senão o histórico da pessoa ganha um evento de mudança de
   * etapa que nunca aconteceu, e a Captação (que ela nunca viu) aparece como origem.
   */
  it("entrar na PRÓPRIA etapa de nascimento não exige movimento, seja ela qual for", () => {
    expect(caminhoAteEtapa("TRIAGEM", "TRIAGEM")).toEqual([]);
    expect(caminhoAteEtapa("CAPTACAO", "TRIAGEM")).toEqual(["CAPTACAO"]);
  });

  /**
   * SEM ETAPA INICIAL MARCADA no catálogo, a tela não inventa uma: o movimento é pedido, e quem
   * recusa com a frase certa é o backend. Adivinhar aqui faria a tela discordar dele em silêncio.
   */
  it("sem etapa de nascimento conhecida, o destino continua sendo um passo explícito", () => {
    expect(caminhoAteEtapa("CAPTACAO", null)).toEqual(["CAPTACAO"]);
  });

  it("todo destino do caminho é um movimento permitido pela régua", () => {
    for (const destino of ETAPAS) {
      for (const passo of caminhoAteEtapa(destino, NASCE_EM)) {
        expect(destinosDeEtapa("CAPTACAO", ETAPAS)).toContain(passo);
      }
    }
  });
});

describe("cardDaCandidatura (a chave do card é o CÓDIGO, e não um nome escrito à mão)", () => {
  /**
   * A RÉGUA EM UMA FRASE: quem está ATIVO é contado pela ETAPA, quem já recebeu decisão é contado
   * pela SITUAÇÃO. É a mesma do contrato do backend (`porEtapa` conta só quem está em seleção,
   * `porDesfecho` conta o resto), e é o que faz as duas fileiras do sistema, a da Central De Vagas e
   * a da Central De Candidatos, responderem pela mesma pergunta.
   */
  it("a etapa NOVA do diretor ganha a chave dela, e não cai no card de Aprovação", () => {
    // O DEFEITO QUE ESTA FUNÇÃO SUBSTITUI, afirmado ao contrário: a versão anterior tinha cinco
    // ramos de etapa escritos à mão e um `return` final, então qualquer etapa fora daquela lista era
    // contada como "Em Aprovação", em silêncio. Aqui a chave é o próprio código.
    expect(cardDaCandidatura("DINAMICA_DE_GRUPO", "ATIVO")).toBe("DINAMICA_DE_GRUPO");
    expect(cardDaCandidatura("PROVA_TECNICA", "ATIVO")).toBe("PROVA_TECNICA");
  });

  it("cada etapa viva do catálogo cai numa chave distinta", () => {
    const chaves = ETAPAS.map((e) => cardDaCandidatura(e, "ATIVO"));
    expect(new Set(chaves).size).toBe(ETAPAS.length);
  });

  it("a situação vence a etapa: quem saiu na triagem não conta como Em Triagem", () => {
    expect(cardDaCandidatura("TRIAGEM", "ATIVO")).toBe("TRIAGEM");
    expect(cardDaCandidatura("TRIAGEM", "DESCARTADO")).toBe("DESCARTADO");
    expect(cardDaCandidatura("TRIAGEM", "DESCARTADO")).not.toBe("TRIAGEM");
  });

  it("ALOCADO deixou de ser fundido com APROVADO: são cards DIFERENTES", () => {
    // A FUSÃO ESCONDIA GENTE: `APROVADO` reserva a posição e `ALOCADO` a entrega, e somados no mesmo
    // card ninguém enxergava quantos já tinham sido entregues à vaga.
    expect(cardDaCandidatura("APROVACAO", "APROVADO")).toBe("APROVADO");
    expect(cardDaCandidatura("APROVACAO", "ALOCADO")).toBe("ALOCADO");
    expect(cardDaCandidatura("APROVACAO", "ALOCADO")).not.toBe(
      cardDaCandidatura("APROVACAO", "APROVADO"),
    );
  });

  it("aprovado, contratado, descartado e desistiu continuam separados", () => {
    expect(cardDaCandidatura("APROVACAO", "ENVIADO_PARA_ADMISSAO")).toBe("ENVIADO_PARA_ADMISSAO");
    expect(cardDaCandidatura("TRIAGEM", "DESISTIU")).toBe("DESISTIU");
    const chaves = CANDIDATURA_SITUACOES.filter((s) => s !== "ATIVO").map((s) =>
      cardDaCandidatura("TRIAGEM", s),
    );
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("os desfechos BONS não voltam para o card de etapa, e é aqui que o atalho fácil erra", () => {
    // A ARMADILHA MEDIDA: `candidaturaViva` é o complemento de `ehSaidaSemExito`, então ela devolve
    // VERDADEIRO para APROVADO, ALOCADO e ENVIADO_PARA_ADMISSAO. Cortar a fileira por ela mandaria
    // os três de volta para os cards de ETAPA, e a tela diria que gente já aprovada continua
    // esperando decisão na Triagem. O corte é `ATIVO`, e este teste é a trava disso.
    for (const situacao of ["APROVADO", "ALOCADO", "ENVIADO_PARA_ADMISSAO"] as const) {
      for (const etapa of ETAPAS) {
        expect(cardDaCandidatura(etapa, situacao)).not.toBe(etapa);
        expect(cardDaCandidatura(etapa, situacao)).toBe(situacao);
      }
    }
  });

  it("a etapa não muda o card de quem já tem desfecho", () => {
    const chaves = ETAPAS.map((e) => cardDaCandidatura(e, "ALOCADO"));
    expect(new Set(chaves).size).toBe(1);
  });

  it("toda combinação de etapa e situação tem card: nenhum estado sem número", () => {
    for (const etapa of ETAPAS) {
      for (const situacao of CANDIDATURA_SITUACOES) {
        expect(cardDaCandidatura(etapa, situacao)).toBeTruthy();
      }
    }
  });

  it("as chaves reservadas da tela NÃO colidem com código de catálogo", () => {
    // `total` e `semVaga` são minúsculos de propósito: código de etapa e de situação é MAIÚSCULO no
    // sistema inteiro, então nenhum card do catálogo pode roubar o filtro de um dos dois.
    for (const etapa of ETAPAS) {
      for (const situacao of CANDIDATURA_SITUACOES) {
        expect(["total", "semVaga"]).not.toContain(cardDaCandidatura(etapa, situacao));
      }
    }
  });
});

describe("ehTravaDeVagaCheia (a tela traduz a frase, o backend continua com a dele)", () => {
  it("reconhece a recusa por posições preenchidas, no plural e no singular", () => {
    expect(
      ehTravaDeVagaCheia(
        "Esta vaga tem 3 posições e as 3 já estão preenchidas. Reprove alguém ou aumente as posições da vaga.",
      ),
    ).toBe(true);
    expect(
      ehTravaDeVagaCheia(
        "Esta vaga tem 1 posição e ela já está preenchida. Reprove alguém ou aumente as posições da vaga.",
      ),
    ).toBe(true);
  });

  it("não confunde com as outras travas do módulo, que seguem exibindo a frase do backend", () => {
    expect(
      ehTravaDeVagaCheia(
        "Esta vaga ainda não tem o número de posições definido. Informe as posições da vaga antes de aprovar.",
      ),
    ).toBe(false);
    expect(ehTravaDeVagaCheia("Esta vaga está Fechada e não recebe candidato novo.")).toBe(false);
  });
});

describe("formatCpf (máscara de tela; o número viaja limpo e no corpo do POST)", () => {
  it("mascara conforme a digitação e para nos 11 dígitos", () => {
    expect(formatCpf("123")).toBe("123");
    expect(formatCpf("1234")).toBe("123.4");
    expect(formatCpf("12345678901")).toBe("123.456.789-01");
    expect(formatCpf("123456789012345")).toBe("123.456.789-01");
  });

  it("ignora o que não é dígito", () => {
    expect(formatCpf("abc123def456ghi789jk01")).toBe("123.456.789-01");
  });
});

describe("reentradaPrecisaCiencia (os DOIS 409 da alocação, que não são a mesma coisa)", () => {
  const corpoDaReentrada = {
    needsConfirmation: true,
    reason: "reentradaAposEncerramento",
    message:
      "Esta pessoa já foi descartada desta vaga em 25/08/2026, com o motivo registrado: perfil não aderente. " +
      "A reentrada é permitida e o processo anterior fica no histórico. Confirme que está ciente para alocar de novo.",
    anterior: {
      situacao: "DESCARTADO",
      encerradaEm: "2026-08-25T21:11:48.128Z",
      motivo: "perfil não aderente",
    },
  };

  it("reconhece a reentrada e devolve a data e o motivo do processo anterior", () => {
    const aviso = reentradaPrecisaCiencia(new ApiError(corpoDaReentrada.message, 409, corpoDaReentrada));
    expect(aviso).not.toBeNull();
    expect(aviso?.anterior.situacao).toBe("DESCARTADO");
    expect(aviso?.anterior.encerradaEm).toBe("2026-08-25T21:11:48.128Z");
    expect(aviso?.anterior.motivo).toBe("perfil não aderente");
  });

  it("NÃO oferece ciência para o 409 seco de quem já está viva na vaga", () => {
    const seco = new ApiError("Esta pessoa já está nesta vaga.", 409, {
      statusCode: 409,
      message: "Esta pessoa já está nesta vaga.",
      error: "Conflict",
    });
    expect(reentradaPrecisaCiencia(seco)).toBeNull();
  });

  it("casa pelo campo reason, e não pela frase: mudar o texto não muda a decisão", () => {
    const outroTexto = { ...corpoDaReentrada, message: "Qualquer outra redação, com outra vírgula." };
    expect(reentradaPrecisaCiencia(new ApiError(outroTexto.message, 409, outroTexto))).not.toBeNull();
    // E o inverso: a frase certa com o reason errado NÃO abre a ciência.
    const reasonErrado = { ...corpoDaReentrada, reason: "candidatosPendentes" };
    expect(reentradaPrecisaCiencia(new ApiError(reasonErrado.message, 409, reasonErrado))).toBeNull();
  });

  it("ignora o que não é 409 e o que não é erro do cliente HTTP", () => {
    expect(reentradaPrecisaCiencia(new ApiError("Vaga não encontrada.", 404, corpoDaReentrada))).toBeNull();
    expect(reentradaPrecisaCiencia(new Error("Falha de rede"))).toBeNull();
    expect(reentradaPrecisaCiencia(null)).toBeNull();
  });

  it("exige needsConfirmation verdadeiro: sem ele não há saída a oferecer", () => {
    const semSaida = { ...corpoDaReentrada, needsConfirmation: false };
    expect(reentradaPrecisaCiencia(new ApiError(semSaida.message, 409, semSaida))).toBeNull();
  });
});

describe("bancoPrecisaCiencia (o TERCEIRO 409 do módulo: avisa, não bloqueia)", () => {
  const corpo = {
    needsConfirmation: true,
    reason: "bancoComOficiaisAbertas",
    message:
      "Esta vaga ainda tem 3 posições oficiais abertas. Alocar no banco deixa a posição oficial em aberto. " +
      "Confirme que é isso mesmo que você quer.",
    oficiaisAbertas: 3,
  };

  it("reconhece o aviso e devolve QUANTAS posições oficiais continuam abertas", () => {
    const aviso = bancoPrecisaCiencia(new ApiError(corpo.message, 409, corpo));
    expect(aviso).not.toBeNull();
    expect(aviso?.oficiaisAbertas).toBe(3);
    expect(aviso?.message).toContain("3 posições oficiais abertas");
  });

  it("casa pelo campo reason, e não pela frase: mudar o texto não muda a decisão", () => {
    const outroTexto = { ...corpo, message: "Outra redação qualquer, com outra vírgula." };
    expect(bancoPrecisaCiencia(new ApiError(outroTexto.message, 409, outroTexto))).not.toBeNull();
  });

  it("NÃO se confunde com o aviso de reentrada, que é outra pergunta e outro modal", () => {
    const reentrada = {
      needsConfirmation: true,
      reason: "reentradaAposEncerramento",
      message: "Esta pessoa já foi descartada desta vaga.",
      anterior: { situacao: "DESCARTADO", encerradaEm: null, motivo: null },
    };
    expect(bancoPrecisaCiencia(new ApiError(reentrada.message, 409, reentrada))).toBeNull();
    expect(reentradaPrecisaCiencia(new ApiError(corpo.message, 409, corpo))).toBeNull();
  });

  it("NÃO oferece ciência para a vaga cheia, que é recusa seca e não tem confirmar mesmo assim", () => {
    const cheia = new ApiError(
      "Esta vaga tem 3 posições e as 3 já estão preenchidas. Reprove alguém ou aumente as posições da vaga.",
      409,
      { statusCode: 409, message: "Esta vaga tem 3 posições e as 3 já estão preenchidas.", error: "Conflict" },
    );
    expect(bancoPrecisaCiencia(cheia)).toBeNull();
  });

  it("exige o NÚMERO: sem ele a frase viraria clique automático, e o aviso não se abre", () => {
    const semNumero = { ...corpo, oficiaisAbertas: undefined };
    expect(bancoPrecisaCiencia(new ApiError(corpo.message, 409, semNumero))).toBeNull();
  });

  it("ignora o que não é 409 e o que não é erro do cliente HTTP", () => {
    expect(bancoPrecisaCiencia(new ApiError(corpo.message, 404, corpo))).toBeNull();
    expect(bancoPrecisaCiencia(new Error("Falha de rede"))).toBeNull();
    expect(bancoPrecisaCiencia(null)).toBeNull();
  });
});
