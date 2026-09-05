import { describe, expect, it } from "vitest";
import { estadoDosCamposDeCpf, resumoDosCamposDeCpf } from "./estado-cpf-pandape";

/** CPFs SINTÉTICOS, dígito calculado só para a suite. Nenhum dado real entra aqui (§A.6). */
const VALIDO = "52998224725";
const INVALIDO = "12345678900";
const ZERADO = "00000000000";

function answers(...pares: { fieldName: string; answer: unknown }[]) {
  return pares;
}

describe("estadoDosCamposDeCpf", () => {
  /** O retrato exato da Zelda (idPreCollaborator 421114): cadastro zerado, um campo errado, um certo. */
  it("CASO ZELDA: mostra o cadastro inválido, o campo errado e o campo com o CPF certo", () => {
    const linhas = estadoDosCamposDeCpf(
      {
        answers: answers(
          { fieldName: "CPF", answer: VALIDO },
          { fieldName: "Nome Completo", answer: "FULANO" },
          { fieldName: "Número do CPF", answer: INVALIDO },
        ),
      },
      { cpf: ZERADO },
    );

    expect(linhas).toEqual([
      { origem: "Cadastro do candidato (Match)", estado: "inválido", lidoPeloEa: true },
      { origem: 'Formulário, campo "CPF"', estado: "válido", lidoPeloEa: true },
      { origem: 'Formulário, campo "Número do CPF"', estado: "inválido", lidoPeloEa: true },
    ]);
    expect(resumoDosCamposDeCpf(linhas)).toContain("deve puxar");
  });

  it("MOSTRA o campo de terceiro, marcado como não lido, em vez de escondê-lo", () => {
    const linhas = estadoDosCamposDeCpf(
      { answers: answers({ fieldName: "CPF do dependente", answer: VALIDO }) },
      { cpf: ZERADO },
    );
    const terceiro = linhas.find((l) => l.origem.includes("dependente"));
    expect(terceiro?.lidoPeloEa).toBe(false);
    expect(terceiro?.observacao).toContain("terceiro");
    expect(terceiro?.observacao).not.toContain("Recusado");
    // E o resumo NÃO promete que vai puxar por causa dele.
    expect(resumoDosCamposDeCpf(linhas)).toContain("vai falhar");
  });

  it("ignora campo que nem fala de CPF", () => {
    const linhas = estadoDosCamposDeCpf(
      { answers: answers({ fieldName: "Número do PIS", answer: VALIDO }) },
      { cpf: VALIDO },
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.estado).toBe("válido");
  });

  it("diz quando o Match nem voltou, que é diagnóstico diferente de CPF vazio", () => {
    const linhas = estadoDosCamposDeCpf({ answers: [] }, undefined);
    expect(linhas[0]!.estado).toBe("ausente");
    expect(linhas[0]!.observacao).toContain("não devolveu o Match");
  });

  it("inclui o cadastro do pré-colaborador só quando ele existe", () => {
    expect(estadoDosCamposDeCpf({ answers: [] }, { cpf: VALIDO })).toHaveLength(1);
    const com = estadoDosCamposDeCpf({ cpf: VALIDO, answers: [] }, { cpf: ZERADO });
    expect(com).toHaveLength(2);
    expect(com[0]!.origem).toContain("pré-colaborador");
  });

  /** §A.6: a régua inteira existe para não expor CPF. Se um número vazar aqui, o teste cai. */
  it("NUNCA devolve o número do CPF, em nenhum campo", () => {
    const linhas = estadoDosCamposDeCpf(
      {
        cpf: VALIDO,
        answers: answers(
          { fieldName: "CPF", answer: VALIDO },
          { fieldName: "CPF do cônjuge", answer: INVALIDO },
        ),
      },
      { cpf: ZERADO },
    );
    const serializado = JSON.stringify(linhas);
    for (const cpf of [VALIDO, INVALIDO, ZERADO]) {
      expect(serializado).not.toContain(cpf);
    }
  });

  it("payload fora do formato não derruba o retrato", () => {
    const linhas = estadoDosCamposDeCpf(
      { answers: [null, "texto", 42, { semCampos: true }] as never },
      { cpf: ZERADO },
    );
    expect(linhas).toHaveLength(1);
  });
});
