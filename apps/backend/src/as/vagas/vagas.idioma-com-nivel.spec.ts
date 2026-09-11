import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { OPCAO_OUTROS } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { CreateVagaDto } from "./vagas.dto";
import { VagasService } from "./vagas.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import {
  catalogoDeStatusFingido,
  linhasDeStatusFingidas,
} from "../vaga-status/vaga-status-catalogo.fake";
import { ReguaDeStatusDaVaga } from "../vaga-status/vaga-status.service";

/**
 * ─ O IDIOMA PASSA A CARREGAR O NÍVEL, E O ESCAPE NÃO PODE SUMIR NO CAMINHO ─────────────────────
 *
 * ┌─ O DEFEITO QUE A AUDITORIA PEGOU ANTES DE ELE CHEGAR NA OPERAÇÃO ───────────────────────────┐
 * │ A linha era `dto.idiomas?.includes(OPCAO_OUTROS) ? texto(dto.idiomasOutros) : null`.        │
 * │ Com a lista virando lista de OBJETOS, `includes("Outros")` é SEMPRE falso, e o ramo `: null`│
 * │ zerava `idiomas_outros` na gravação. Sem erro, sem log, sem ninguém perceber: o consultor   │
 * │ escrevia "Japonês" no escape, salvava o rascunho de novo, e o texto sumia do banco.         │
 * │                                                                                             │
 * │ O CENÁRIO EXATO É A SEGUNDA GRAVAÇÃO, e é por isso que o caso principal aqui salva DUAS     │
 * │ vezes: na primeira o valor vem do corpo, e é na segunda (o corpo montado de volta a partir  │
 * │ do que a tela releu) que a perda aconteceria.                                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `camposDaTrilha` é o mapeamento PURO do corpo para as colunas: não toca no banco, e por isso o
 * `db` nulo prova que nada aqui o usa.
 *
 * §A.6: nenhum dado pessoal. Idioma exigido por uma vaga.
 */
const service = new VagasService(
  null as unknown as Database,
  catalogoDeEtapasFingido() as never,
  catalogoDeStatusFingido() as never,
);

const REGUA = new ReguaDeStatusDaVaga(linhasDeStatusFingidas());

/** O mapeamento de verdade, com a assinatura de verdade (cidade e linha de serviço já resolvidas). */
function campos(dto: Partial<CreateVagaDto>): Record<string, unknown> {
  return (
    service as unknown as {
      camposDaTrilha: (
        r: ReguaDeStatusDaVaga,
        d: CreateVagaDto,
        s: string,
        cidade: null,
        linha: null,
      ) => Record<string, unknown>;
    }
  ).camposDaTrilha(
    REGUA,
    { status: "RASCUNHO", ...dto } as CreateVagaDto,
    "RASCUNHO",
    null,
    null,
  );
}

const INGLES_AVANCADO = { idioma: "Inglês", nivel: "AVANCADO" as const };
const OUTROS_BASICO = { idioma: OPCAO_OUTROS, nivel: "BASICO" as const };

describe("o par idioma+nível vai para a coluna NOVA", () => {
  it("grava o par, e não a lista de textos", () => {
    const c = campos({ idiomasExigidos: [INGLES_AVANCADO] });
    expect(c.idiomasExigidos).toEqual([{ idioma: "Inglês", nivel: "AVANCADO" }]);
  });

  /**
   * A COLUNA VELHA ESTÁ CONGELADA. Escrevê-la junto criaria duas listas de idioma na mesma vaga,
   * com a chance permanente de discordarem, que é exatamente o que a coluna nova existe para evitar.
   */
  it("NÃO escreve a coluna legada `idiomas`", () => {
    expect(campos({ idiomasExigidos: [INGLES_AVANCADO] })).not.toHaveProperty("idiomas");
  });

  it("vaga sem idioma grava nulo, e não lista vazia", () => {
    expect(campos({}).idiomasExigidos).toBeNull();
    expect(campos({ idiomasExigidos: [] }).idiomasExigidos).toBeNull();
  });

  /**
   * `jsonb` É COLUNA SEM ESQUEMA, então o que se grava é montado campo a campo. Um corpo com lixo
   * a mais (que o `forbidNonWhitelisted` do DTO já recusaria, mas que um chamador interno poderia
   * montar) não pode entrar na coluna de carona.
   */
  it("grava SÓ idioma e nível, ignorando qualquer campo a mais do corpo", () => {
    const c = campos({
      idiomasExigidos: [{ ...INGLES_AVANCADO, lixo: "x" } as never],
    });
    expect(c.idiomasExigidos).toEqual([{ idioma: "Inglês", nivel: "AVANCADO" }]);
  });
});

describe("o texto de `Outros` sobrevive (o defeito que a auditoria pegou)", () => {
  it("é gravado quando `Outros` está entre os idiomas escolhidos", () => {
    const c = campos({ idiomasExigidos: [OUTROS_BASICO], idiomasOutros: "Japonês" });
    expect(c.idiomasOutros).toBe("Japonês");
  });

  /**
   * ─ O CASO PRINCIPAL: A SEGUNDA GRAVAÇÃO ──────────────────────────────────────────────────────
   *
   * É aqui que o defeito apareceria. A tela relê a vaga, remonta o mesmo corpo e salva de novo (é o
   * fluxo normal de "continuar o rascunho"), e o texto tem de continuar lá. Com o `includes` de
   * string sobre uma lista de objetos, esta asserção falha na segunda passagem.
   */
  it("continua lá depois de salvar a MESMA vaga duas vezes", () => {
    const corpo = { idiomasExigidos: [INGLES_AVANCADO, OUTROS_BASICO], idiomasOutros: "Japonês" };
    const primeira = campos(corpo);
    expect(primeira.idiomasOutros).toBe("Japonês");

    // A SEGUNDA GRAVAÇÃO, com o corpo remontado a partir do que foi gravado.
    const segunda = campos({
      idiomasExigidos: primeira.idiomasExigidos as never,
      idiomasOutros: primeira.idiomasOutros as string,
    });
    expect(segunda.idiomasOutros).toBe("Japonês");
  });

  /** A regra em si NÃO mudou: desmarcou "Outros", o texto some, senão a vaga guarda um idioma oculto. */
  it("some quando `Outros` NÃO está entre os idiomas escolhidos", () => {
    expect(campos({ idiomasExigidos: [INGLES_AVANCADO], idiomasOutros: "Japonês" }).idiomasOutros).toBeNull();
  });

  /** O apelido de transição alimenta a MESMA régua: o escape não pode depender do nome do campo. */
  it("vale igual pelo nome antigo do campo (`idiomas`)", () => {
    expect(campos({ idiomas: [OUTROS_BASICO], idiomasOutros: "Japonês" }).idiomasOutros).toBe("Japonês");
  });
});

describe("o DTO exige o nível, e recusa JSON arbitrário", () => {
  const valida = (corpo: unknown) =>
    validateSync(plainToInstance(CreateVagaDto, corpo), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it("aceita o par completo", () => {
    expect(valida({ idiomasExigidos: [INGLES_AVANCADO] })).toHaveLength(0);
  });

  /**
   * SEM `@ValidateNested` + `@Type`, o `class-validator` NÃO desce ao objeto, e a coluna (que é
   * `jsonb`, sem esquema) aceitaria qualquer coisa de qualquer autenticado. Estes três casos são a
   * prova de que os decorators estão no lugar, e não uma conferência de estilo.
   */
  it("recusa idioma SEM nível", () => {
    expect(valida({ idiomasExigidos: [{ idioma: "Inglês" }] }).length).toBeGreaterThan(0);
  });

  it("recusa nível fora da escala", () => {
    expect(
      valida({ idiomasExigidos: [{ idioma: "Inglês", nivel: "NATIVO" }] }).length,
    ).toBeGreaterThan(0);
  });

  it("recusa idioma fora da lista fechada", () => {
    expect(
      valida({ idiomasExigidos: [{ idioma: "Klingon", nivel: "BASICO" }] }).length,
    ).toBeGreaterThan(0);
  });

  it("recusa objeto com campo estranho dentro do par", () => {
    expect(
      valida({ idiomasExigidos: [{ ...INGLES_AVANCADO, lixo: "x" }] }).length,
    ).toBeGreaterThan(0);
  });

  /** O corpo ANTIGO (lista de textos) é recusado ALTO, em vez de gravar exigência pela metade. */
  it("recusa o corpo antigo, com lista de textos", () => {
    expect(valida({ idiomasExigidos: ["Inglês"] }).length).toBeGreaterThan(0);
  });

  /** O mesmo idioma duas vezes não é exigência, é contradição: "Inglês básico" e "Inglês fluente". */
  it("recusa o mesmo idioma repetido, com níveis diferentes", () => {
    expect(
      valida({
        idiomasExigidos: [INGLES_AVANCADO, { idioma: "Inglês", nivel: "BASICO" }],
      }).length,
    ).toBeGreaterThan(0);
  });
});
