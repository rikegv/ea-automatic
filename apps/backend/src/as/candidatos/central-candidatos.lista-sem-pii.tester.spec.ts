import { describe, expect, it } from "vitest";
import { bancoDaCentral } from "./central-candidatos-conserto.tester-fake";

/**
 * ─ A LISTA SO GANHOU clienteNome/cargoNome, E NADA DE PII (§A.6 / §A.38) ───────────────────────
 *
 * COBERTURA INDEPENDENTE do `tester`. A projecao da candidatura na LISTA e FECHADA de proposito
 * (ver o comentario de `AsCandidaturaNaLista` no shared-types): a trava de forma existe porque o
 * `substituidoCpf` desceu cru por meses sem nenhuma coluna mostra-lo. Campo a MAIS nao quebra nada,
 * so vaza, entao teste de comportamento nunca o pega: so a lista fechada pega.
 *
 * O CONSERTO de 06/10 acrescentou DOIS campos, e so dois: `clienteNome` e `cargoNome`, atributos da
 * VAGA, nao da pessoa. A lista passou de OITO para DEZ campos. Qualquer decimo-primeiro, de qualquer
 * nome, e exatamente o defeito que esta trava impede. E tres dos cinco leitores da rota chamam com
 * `semCandidatura: true` para OFERECER gente para alocacao: campo pessoal aqui vira vitrine.
 */

/** A lista FECHADA de `AsCandidaturaNaLista` apos o conserto, em ordem alfabetica. DEZ campos. */
const DEZ_CAMPOS = [
  "candidatoId",
  "cargoNome",
  "clienteNome",
  "etapa",
  "id",
  "situacao",
  "ultimoContatoEm",
  "vagaCodigo",
  "vagaId",
  "vagaNome",
];

const PROIBIDOS = [
  "motivoDescarte",
  "pretensaoSalarial",
  "candidatoNome",
  "alocadoPorNome",
  "alocadoPorId",
  "posicaoLado",
  "alocadoEm",
  "atualizadoEm",
  "cpf",
  "candidatoCpf",
  "substituidoCpf",
  "temCpf",
  "email",
  "telefone",
  "dataNascimento",
  "cidade",
  "uf",
];

function cenario() {
  return bancoDaCentral({
    candidatos: [{ id: "p1", nome: "Debora Campos De Oliveira", origem: "PANDAPE", cpf: "11144477735" }],
    candidaturas: [{ id: "k1", candidatoId: "p1", vagaId: "v1", etapa: "CAPTACAO", situacao: "ATIVO" }],
    vagas: [{ id: "v1", codigo: "3572904", nomeDivulgacao: "Auxiliar De Limpeza", status: "PENDENTE_REVISAO", codCliente: "C1", cargoId: "G1" }],
    clientes: [{ codCliente: "C1", razaoSocial: "Soulan LTDA", nomeOperacao: "Soulan Operacao" }],
    cargos: [{ id: "G1", nome: "Auxiliar De Limpeza" }],
  });
}

describe("a candidatura da LISTA tem lista FECHADA de dez campos apos o conserto", () => {
  it("devolve EXATAMENTE os dez campos do contrato, nem um a mais", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    const candidatura = pagina.itens[0]?.candidaturas?.[0];

    expect(candidatura, "a lista nao devolveu o funil").toBeDefined();
    expect(
      Object.keys(candidatura!).sort(),
      "campo a mais na projecao e o defeito do `substituidoCpf`: ninguem o mostra e ele desce para a base inteira.",
    ).toEqual(DEZ_CAMPOS);
  });

  it.each(PROIBIDOS)("NAO devolve `%s` na candidatura da lista", async (campo) => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    const candidatura = pagina.itens[0]?.candidaturas?.[0];
    expect(candidatura).toBeDefined();
    expect(candidatura).not.toHaveProperty(campo);
  });

  it("nenhuma chave da candidatura menciona cpf, em qualquer caixa", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    const chaves = Object.keys(pagina.itens[0]!.candidaturas![0]);
    expect(chaves.filter((k) => k.toLowerCase().includes("cpf"))).toEqual([]);
  });

  it("o item do candidato na lista nao ganhou o numero: so `temCpf`, nunca `cpf`", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    const item = pagina.itens[0]! as unknown as Record<string, unknown>;
    expect(item).not.toHaveProperty("cpf");
    expect(item).not.toHaveProperty("email");
    expect(item).not.toHaveProperty("telefone");
    expect(item).toHaveProperty("temCpf");
  });

  it("clienteNome e cargoNome viajam como texto ou null, nunca `Date` nem objeto", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({});
    const c = pagina.itens[0]!.candidaturas![0];
    for (const v of [c.clienteNome, c.cargoNome, c.vagaCodigo, c.vagaNome]) {
      expect(v === null || typeof v === "string").toBe(true);
    }
    expect(c.ultimoContatoEm === null || typeof c.ultimoContatoEm === "string").toBe(true);
  });
});
