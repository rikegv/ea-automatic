import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import * as dtosDoModulo from "./vagas.dto";

/**
 * ─ O CORPO DO CANCELAMENTO DA VAGA, ESPECIFICADO ANTES DO CÓDIGO (§A.40, regra 2) ───────────────
 *
 * ┌─ POR QUE A RÉGUA MORA NO DTO, E NÃO NA TELA ────────────────────────────────────────────────┐
 * │ REGRA QUE VIVE APENAS NO NAVEGADOR NÃO É REGRA, e o módulo já pagou por isso: o motivo do    │
 * │ desvínculo era exigido só na tela, e qualquer chamada direta gravava desfecho SEM MOTIVO.    │
 * │ Aqui o buraco seria pior, porque o que fica sem explicação é o CANCELAMENTO INTEIRO de uma   │
 * │ vaga, que é o evento que alguém vai querer entender seis meses depois.                        │
 * │                                                                                             │
 * │ E O `@MinLength` SOZINHO NÃO BASTA: ele mede a string CRUA, então `"   "` passa com três     │
 * │ caracteres, o service apara na gravação e o motivo chega VAZIO ao banco. O corpo precisa ser │
 * │ APARADO ANTES DE VALIDADO, que é a correção que a saída individual já recebeu em 09/09.      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O `forcar` COMO BOOLEANO DE VERDADE É REQUISITO DE AUTORIDADE, não de tipagem. O `ValidationPipe`
 * global roda com `transform: true` e SEM conversão implícita, então uma string atravessa como
 * string: `forcar: "false"` é TRUTHY em JavaScript e um `if (dto.forcar)` passaria a FORÇAR o
 * cancelamento de quem mandou exatamente o contrário. `@IsBoolean` é o que fecha isso.
 *
 * O NOME DA CLASSE É PROPOSTA DESTE ARQUIVO, e por isso ele a resolve por NOME em vez de importá-la:
 * enquanto ela não existir, cada teste falha com uma frase que diz QUAL classe falta, em vez de o
 * arquivo inteiro morrer na importação. Nome diferente se ajusta aqui, em uma linha.
 */

const NOME_DA_CLASSE = "CancelarVagaDto";

function classe(): new () => object {
  const alvo = (dtosDoModulo as unknown as Record<string, unknown>)[NOME_DA_CLASSE];
  if (typeof alvo !== "function") {
    throw new Error(
      `A classe ${NOME_DA_CLASSE} ainda não existe em vagas.dto. Enquanto o cancelamento não for construído, este arquivo é a especificação dela.`,
    );
  }
  return alvo as new () => object;
}

const VALIDO = { motivo: "Cliente cancelou a solicitação", dataCancelamento: "2026-09-10" };

/** Valida como o `ValidationPipe` global valida: `whitelist` e `forbidNonWhitelisted` ligados. */
function erros(corpo: Record<string, unknown>, campo?: string) {
  const instancia = plainToInstance(classe(), corpo) as object;
  const lista = validateSync(instancia, { whitelist: true, forbidNonWhitelisted: true });
  return campo ? lista.filter((e) => e.property === campo) : lista;
}

function instancia(corpo: Record<string, unknown>): Record<string, unknown> {
  return plainToInstance(classe(), corpo) as Record<string, unknown>;
}

describe("o corpo válido mínimo passa", () => {
  it("motivo do catálogo e data bastam: `observacao` e `forcar` são opcionais", () => {
    expect(erros(VALIDO)).toHaveLength(0);
  });

  it("com observação e com `forcar` booleano também passa", () => {
    expect(erros({ ...VALIDO, observacao: "o cliente avisou por e-mail", forcar: true })).toHaveLength(0);
  });
});

describe("o MOTIVO é obrigatório, e espaço em branco não é motivo", () => {
  it("recusa o motivo AUSENTE", () => {
    expect(erros({ dataCancelamento: VALIDO.dataCancelamento }, "motivo").length).toBeGreaterThan(0);
  });

  it("recusa o motivo VAZIO", () => {
    expect(erros({ ...VALIDO, motivo: "" }, "motivo").length).toBeGreaterThan(0);
  });

  /** O caso que o `@MinLength` sozinho deixa passar: três caracteres que não dizem nada. */
  it('recusa o motivo "   " (só espaços)', () => {
    expect(erros({ ...VALIDO, motivo: "   " }, "motivo").length).toBeGreaterThan(0);
  });

  it("recusa o motivo que é só espaços e quebra de linha", () => {
    expect(erros({ ...VALIDO, motivo: " \n\t " }, "motivo").length).toBeGreaterThan(0);
  });

  it("recusa o motivo que não é texto", () => {
    expect(erros({ ...VALIDO, motivo: 42 }, "motivo").length).toBeGreaterThan(0);
  });

  /**
   * APARADO ANTES DE VALIDAR, e a consequência é que o valor APARADO é o que segue para o service.
   * Sem isto, o catálogo é consultado com um nome cercado de espaços e o motivo legítimo é recusado
   * como se não existisse.
   */
  it("apara as bordas do motivo que veio com espaço em volta", () => {
    const corpo = instancia({ ...VALIDO, motivo: "  Cliente cancelou a solicitação  " });
    expect(corpo.motivo).toBe("Cliente cancelou a solicitação");
    expect(erros({ ...VALIDO, motivo: "  Cliente cancelou a solicitação  " })).toHaveLength(0);
  });
});

describe("a DATA do cancelamento é obrigatória e é data", () => {
  it("recusa a data AUSENTE", () => {
    expect(erros({ motivo: VALIDO.motivo }, "dataCancelamento").length).toBeGreaterThan(0);
  });

  it("recusa a data no formato brasileiro, que não é ISO", () => {
    expect(
      erros({ ...VALIDO, dataCancelamento: "10/09/2026" }, "dataCancelamento").length,
    ).toBeGreaterThan(0);
  });

  it("recusa lixo no lugar da data", () => {
    expect(erros({ ...VALIDO, dataCancelamento: "ontem" }, "dataCancelamento").length).toBeGreaterThan(0);
  });
});

describe("o `forcar` é BOOLEANO, e a string truthy não força nada", () => {
  it('recusa a string "true"', () => {
    expect(erros({ ...VALIDO, forcar: "true" }, "forcar").length).toBeGreaterThan(0);
  });

  /** O caso perverso: `"false"` é TRUTHY, e um `if (dto.forcar)` forçaria o oposto do pedido. */
  it('recusa a string "false"', () => {
    expect(erros({ ...VALIDO, forcar: "false" }, "forcar").length).toBeGreaterThan(0);
  });

  it("recusa o número 1", () => {
    expect(erros({ ...VALIDO, forcar: 1 }, "forcar").length).toBeGreaterThan(0);
  });

  it("aceita `false` explícito", () => {
    expect(erros({ ...VALIDO, forcar: false })).toHaveLength(0);
  });
});

describe("o corpo não é porta de entrada para autoridade nem para trilha", () => {
  /**
   * O PAPEL VEM DA SESSÃO (§A.6 e a régua da rota irmã de fechamento), e a AUTORIA da trilha também.
   * Com `forbidNonWhitelisted` global, um campo que a classe não declara é 400. Se alguém DECLARAR
   * um destes campos aqui, este teste fica vermelho antes de o corpo virar caminho de promoção.
   */
  it.each(["papel", "canceladaPorId", "cancelamentoForcadoPorId", "status", "usuarioId"])(
    "recusa o campo %s no corpo",
    (campo) => {
      expect(erros({ ...VALIDO, [campo]: "x" }).length).toBeGreaterThan(0);
    },
  );
});
