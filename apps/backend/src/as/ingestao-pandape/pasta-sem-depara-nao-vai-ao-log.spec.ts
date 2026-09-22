import { describe, expect, it } from "vitest";
import { marcaDeChaveExterna, normalizarChaveExterna } from "../../domain/as-etapa-externa";
import { executarCicloDeIngestao } from "./ingestao-ciclo";
import { SAL_DE_TESTE, SENTINELA, criarMatch, criarMundo } from "./ingestao-varredura.tester-fake";

/**
 * ─ A PASTA SEM DE/PARA NÃO PODE IR PARA O LOG COM O NOME QUE VEIO DO ATS (achado R1) ───────────
 *
 * ┌─ O QUE O `seguranca` CONTESTOU, E POR QUE ELE ESTÁ CERTO ──────────────────────────────────────┐
 * │ O código afirmava que nome de pasta "é nome de vaga, nunca dado de pessoa", e isso é            │
 * │ SUPOSIÇÃO. O nome é TEXTO LIVRE digitado no ATS, e o próprio repositório desta frente já        │
 * │ recusou texto do ATS pelo motivo oposto: "é digitado lá fora e já chegou com nome de gente      │
 * │ dentro". Uma pasta "Reservados Fulano de Tal" põe nome de candidato num log PERMANENTE, fora do │
 * │ alcance do `aplicarRetencao`, que só sabe expurgar o que está no banco.                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TESTE MEDE O DADO QUE SAI DO CICLO, não o texto do fonte: procurar a palavra `marca` no código
 * ficaria verde no dia em que alguém voltasse a empilhar a chave crua por outro caminho.
 *
 * A FUNÇÃO OPERACIONAL CONTINUA COBERTA na segunda seção: sumir com o registro conserta o §A.6 e
 * reabre a perda silenciosa de 35% da entrada, que é o defeito que a linha existe para evitar.
 *
 * §A.6: nenhum dado real. A sentinela é inventada, feita para ser procurada onde não pode aparecer.
 */

/** Uma pasta com nome de gente dentro, que é exatamente o caso que a suposição não cobria. */
const PASTA_COM_NOME = `Reservados ${SENTINELA.nome} ${SENTINELA.sobrenome}`;

async function cicloComPastaSemDePara() {
  const mundo = criarMundo({
    vagas: [{ idVacancy: 9101, reference: "PS-1", job: "Cargo", city: "SP", numberVacancies: 1 }],
    pastas: { 9101: [{ idVacancyFolder: 55, name: PASTA_COM_NOME }] },
    matches: {
      9101: [
        criarMatch({ idCandidate: 1, idMatch: 1, idVacancy: 9101, idVacancyFolder: 55, insertDate: "2026-09-16T10:00:00Z" }),
      ],
    },
    // DE/PARA VAZIO de propósito: é a recusa fail-closed que produz o registro sob teste.
    dePara: {},
  });
  return { mundo, resumo: await mundo.rodar(executarCicloDeIngestao) };
}

describe("o nome da pasta do ATS não sai do ciclo", () => {
  it("o registro da recusa não carrega o nome da pasta, nem pedaço dele", async () => {
    const { resumo } = await cicloComPastaSemDePara();
    const registrado = resumo.etapasNaoMapeadas.join(" ").toLowerCase();

    for (const proibido of [SENTINELA.nome, SENTINELA.sobrenome, "reservados"]) {
      expect(
        registrado.includes(proibido.toLowerCase()),
        `o registro da pasta sem de/para carrega \`${proibido}\`. Nome de pasta é texto livre do ATS e o log é permanente: o que for escrito ali fica fora do alcance do \`aplicarRetencao\` para sempre.`,
      ).toBe(false);
    }
  });

  it("truncar não bastaria: nem o começo do nome sobrevive", async () => {
    const { resumo } = await cicloComPastaSemDePara();
    const inicio = normalizarChaveExterna(PASTA_COM_NOME).slice(0, 12);
    expect(
      resumo.etapasNaoMapeadas.join(" ").toLowerCase().includes(inicio),
      "truncar é encurtamento, não controle: o primeiro pedaço de um nome continua sendo o nome da pessoa",
    ).toBe(false);
  });

  it("o log da varredura sai do resumo, então ele não tem outra fonte do nome cru", async () => {
    const { mundo, resumo } = await cicloComPastaSemDePara();
    const logs = JSON.stringify(mundo.obs.logs).toLowerCase();
    expect(logs.includes(SENTINELA.nome.toLowerCase())).toBe(false);
    expect(logs.includes(SENTINELA.sobrenome.toLowerCase())).toBe(false);
    expect(resumo.erros, "o cenário é de recusa por de/para, não de erro").toBe(0);
  });
});

describe("a recusa continua VISÍVEL para quem opera", () => {
  it("a pasta sem de/para é registrada, uma vez, pela marca estável dela", async () => {
    const { resumo } = await cicloComPastaSemDePara();
    expect(
      resumo.etapasNaoMapeadas,
      "sem registro nenhum, a recusa fail-closed vira perda silenciosa de 35% da entrada",
    ).toEqual([marcaDeChaveExterna(normalizarChaveExterna(PASTA_COM_NOME), SAL_DE_TESTE)]);
  });

  it("a mesma pasta produz a MESMA marca na passada seguinte, que é o que diz 'são sempre as mesmas'", async () => {
    const { mundo, resumo } = await cicloComPastaSemDePara();
    const segundo = await mundo.rodar(executarCicloDeIngestao);
    expect(segundo.etapasNaoMapeadas).toEqual(resumo.etapasNaoMapeadas);
  });

  it("pastas diferentes não colapsam numa marca só", () => {
    const a = marcaDeChaveExterna(normalizarChaveExterna("Short List"), SAL_DE_TESTE);
    const b = marcaDeChaveExterna(normalizarChaveExterna("Reservados"), SAL_DE_TESTE);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});
