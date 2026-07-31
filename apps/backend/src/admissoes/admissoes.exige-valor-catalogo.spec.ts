import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { beneficioExigeValor } from "@ea/shared-types";
import { AdmissoesService } from "./admissoes.service";

/**
 * A EXIGÊNCIA DE VALOR VEM DA COLUNA, NÃO DO NOME (OST cadastro de benefícios por tela).
 *
 * Antes, `validarValoresDoPacote` decidia por `beneficioExigeValor(nome)`, uma constante do
 * shared-types que casava por TEXTO. Isso produzia dois defeitos reais:
 *  1) benefício cadastrado com nome novo nascia SEM exigir valor, e só deploy corrigia;
 *  2) RENOMEAR um benefício mudava a exigência em silêncio, sem erro nenhum.
 *
 * Agora a fonte da verdade é `beneficios_catalogo.exige_valor`. Estes testes provam a inversão pelos
 * dois lados: um nome que a régua antiga NÃO reconhece passa a exigir valor porque a coluna diz, e um
 * nome que a régua antiga reconhece deixa de exigir porque a coluna diz. Se alguém reverter para o
 * casamento por nome, os dois quebram.
 */

/** Fake do Drizzle: só o `select().from().where()` que a validação usa. */
function makeService(catalogo: { id: string; nome: string; exigeValor: boolean }[]) {
  const db = {
    select: () => ({ from: () => ({ where: () => Promise.resolve(catalogo) }) }),
  };
  const service = new AdmissoesService(db as never);
  // Método privado de propósito (é regra interna da criação/edição); o teste chama pelo nome.
  return (pacote: { beneficioId: string; valor?: number }[]) =>
    (
      service as unknown as {
        validarValoresDoPacote(p: { beneficioId: string; valor?: number }[]): Promise<void>;
      }
    ).validarValoresDoPacote(pacote);
}

describe("validarValoresDoPacote: a régua é a COLUNA do cadastro", () => {
  it("nome DESCONHECIDO pela régua antiga passa a EXIGIR valor quando a coluna manda", async () => {
    // Sanidade: pela régua antiga, este nome nunca exigiria valor.
    expect(beneficioExigeValor("Auxílio home office")).toBe(false);

    const validar = makeService([
      { id: "b1", nome: "Auxílio home office", exigeValor: true },
    ]);
    await expect(validar([{ beneficioId: "b1" }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar([{ beneficioId: "b1" }])).rejects.toThrow(/Auxílio home office/);
    // Com valor, passa.
    await expect(validar([{ beneficioId: "b1", valor: 200 }])).resolves.toBeUndefined();
  });

  it("nome RECONHECIDO pela régua antiga deixa de exigir quando a coluna desliga", async () => {
    // Sanidade: pela régua antiga, "VR (Vale-Refeição)" exigiria valor.
    expect(beneficioExigeValor("VR (Vale-Refeição)")).toBe(true);

    const validar = makeService([{ id: "b2", nome: "VR (Vale-Refeição)", exigeValor: false }]);
    await expect(validar([{ beneficioId: "b2" }])).resolves.toBeUndefined();
  });

  it("RENOMEAR não muda a exigência: o que vale é a coluna da linha renomeada", async () => {
    // A linha foi renomeada para um texto que a régua antiga não reconhece, mas segue exigindo.
    expect(beneficioExigeValor("Ticket de refeição")).toBe(false);
    const validar = makeService([{ id: "b3", nome: "Ticket de refeição", exigeValor: true }]);
    await expect(validar([{ beneficioId: "b3" }])).rejects.toThrow(/Ticket de refeição/);
  });

  /**
   * Achado do próprio teste, e a melhor ilustração de por que a régua por NOME tinha de sair: o
   * casamento é por PREFIXO, então "Vale Refeição" (o VR escrito por extenso) bate na chave "VA" do
   * Vale-Alimentação. Renomear o VR assim faria a régua antiga acertar por acidente, e um nome
   * qualquer começando com "AM"/"VA"/"VR" passaria a exigir valor sem ninguém pedir. Com a coluna,
   * o texto do nome não decide mais nada.
   */
  it("a régua por NOME casava por prefixo e acertava/errava por acidente", () => {
    expect(beneficioExigeValor("Vale Refeição")).toBe(true); // casou com a chave "VA", não com "VR"
    expect(beneficioExigeValor("Vale Cultura")).toBe(true); // benefício SEM valor, casaria mesmo assim
    expect(beneficioExigeValor("Amparo funeral")).toBe(true); // casou com "AM"
  });

  it("os 6 do backfill seguem exigindo valor (nada mudou de comportamento na entrega)", async () => {
    const seis = [
      "VR (Vale-Refeição)",
      "VA (Vale-Alimentação)",
      "AM (Assistência Médica)",
      "Cesta básica",
      "Participação nos lucros (PLR)",
      "Auxílio creche",
    ];
    const catalogo = seis.map((nome, i) => ({ id: `x${i}`, nome, exigeValor: true }));
    const validar = makeService(catalogo);
    for (const [i, nome] of seis.entries()) {
      await expect(validar([{ beneficioId: `x${i}` }]), nome).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    // E todos passam quando o valor vem junto.
    await expect(
      validar(catalogo.map((c) => ({ beneficioId: c.id, valor: 100 }))),
    ).resolves.toBeUndefined();
  });

  it("os que NÃO exigem seguem passando sem valor", async () => {
    const validar = makeService([
      { id: "v1", nome: "VT (Vale-Transporte)", exigeValor: false },
      { id: "v2", nome: "Seguro de vida", exigeValor: false },
    ]);
    await expect(
      validar([{ beneficioId: "v1" }, { beneficioId: "v2" }]),
    ).resolves.toBeUndefined();
  });

  it("pacote vazio não consulta nada nem reclama (regra 5: não-bloqueio)", async () => {
    const validar = makeService([]);
    await expect(validar([])).resolves.toBeUndefined();
  });
});
