import { describe, expect, it } from "vitest";
import { CANDIDATURA_ETAPAS, CANDIDATURA_SITUACOES } from "@ea/shared-types";
import { ApiError } from "./api";
import {
  caminhoAteEtapa,
  destinosDeEtapa,
  ehTravaDeVagaCheia,
  entrevistaClienteEhOpcional,
  formatCpf,
  kpiDaCandidatura,
  reentradaPrecisaCiencia,
} from "./as-candidatos";

describe("funil da Central de Candidatos (espelho do domínio do backend)", () => {
  /**
   * O FUNIL NÃO É UM TRILHO (decisão do diretor, 27/08). Estes testes afirmam o CONTRÁRIO do que a
   * versão anterior afirmava, e é essa a mudança: a tela oferece TODAS as etapas como destino, para
   * a frente e para trás, porque a operação real não é linear.
   */
  it("oferece todas as outras etapas como destino, e nunca a atual", () => {
    for (const de of CANDIDATURA_ETAPAS) {
      const destinos = destinosDeEtapa(de);
      expect(destinos).toHaveLength(CANDIDATURA_ETAPAS.length - 1);
      expect(destinos).not.toContain(de);
    }
  });

  it("VOLTA de etapa: da Aprovação se oferece o caminho de volta ao começo", () => {
    expect(destinosDeEtapa("APROVACAO")).toContain("CAPTACAO");
    expect(destinosDeEtapa("ENTREVISTA_CLIENTE")).toContain("ENTREVISTA_SOULAN");
  });

  it("PULA etapa: da Captação se vai direto para a Aprovação", () => {
    expect(destinosDeEtapa("CAPTACAO")).toContain("APROVACAO");
  });

  it("pular a Entrevista Cliente é caminho legítimo, não exceção escondida", () => {
    expect(entrevistaClienteEhOpcional()).toBe(true);
    expect(destinosDeEtapa("ENTREVISTA_SOULAN")).toContain("ENTREVISTA_CLIENTE");
    expect(destinosDeEtapa("ENTREVISTA_SOULAN")).toContain("APROVACAO");
  });
});

describe("caminhoAteEtapa (a etapa de entrada do cadastro)", () => {
  it("entrar em Captação não exige movimento nenhum", () => {
    expect(caminhoAteEtapa("CAPTACAO")).toEqual([]);
  });

  it("entrar em Triagem é um passo só", () => {
    expect(caminhoAteEtapa("TRIAGEM")).toEqual(["TRIAGEM"]);
  });

  /**
   * ERA UMA CAMINHADA DE QUATRO REQUISIÇÕES, VIROU UMA. Com o funil livre, entrar em Aprovação é um
   * movimento único: ou vai inteiro, ou não vai, sem deixar a pessoa parada numa etapa intermediária
   * que ninguém escolheu.
   */
  it("entrar em Aprovação é UM passo, e não a caminhada inteira do funil", () => {
    expect(caminhoAteEtapa("APROVACAO")).toEqual(["APROVACAO"]);
  });

  it("todo destino do caminho é um movimento permitido pela régua", () => {
    for (const destino of CANDIDATURA_ETAPAS) {
      for (const passo of caminhoAteEtapa(destino)) {
        expect(destinosDeEtapa("CAPTACAO")).toContain(passo);
      }
    }
  });
});

describe("kpiDaCandidatura (o card é o filtro, e nenhum estado fica sem número à vista)", () => {
  it("aprovado e contratado são cards DIFERENTES, porque são estados diferentes", () => {
    expect(kpiDaCandidatura("APROVACAO", "APROVADO")).toBe("aprovados");
    expect(kpiDaCandidatura("APROVACAO", "CONTRATADO")).toBe("contratados");
  });

  it("descartado e desistiu são cards DIFERENTES: o time recusou, ou a pessoa saiu", () => {
    expect(kpiDaCandidatura("TRIAGEM", "DESCARTADO")).toBe("descartados");
    expect(kpiDaCandidatura("TRIAGEM", "DESISTIU")).toBe("desistiram");
  });

  it("a situação vence a etapa: quem saiu na triagem não conta como Em Triagem", () => {
    expect(kpiDaCandidatura("TRIAGEM", "ATIVO")).toBe("triagem");
    expect(kpiDaCandidatura("TRIAGEM", "DESCARTADO")).not.toBe("triagem");
  });

  it("as duas entrevistas têm cada uma o seu card", () => {
    expect(kpiDaCandidatura("ENTREVISTA_SOULAN", "ATIVO")).toBe("entrevistaSoulan");
    expect(kpiDaCandidatura("ENTREVISTA_CLIENTE", "ATIVO")).toBe("entrevistaCliente");
  });

  it("quem está ATIVO na etapa de Aprovação tem card próprio, e não some mais da conta", () => {
    expect(kpiDaCandidatura("APROVACAO", "ATIVO")).toBe("emAprovacao");
  });

  it("as cinco etapas vivas caem, cada uma, num card distinto", () => {
    const cards = CANDIDATURA_ETAPAS.map((e) => kpiDaCandidatura(e, "ATIVO"));
    expect(new Set(cards).size).toBe(CANDIDATURA_ETAPAS.length);
  });

  it("toda combinação de etapa e situação tem card: nenhum estado sem número", () => {
    for (const etapa of CANDIDATURA_ETAPAS) {
      for (const situacao of CANDIDATURA_SITUACOES) {
        expect(kpiDaCandidatura(etapa, situacao)).toBeTruthy();
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
