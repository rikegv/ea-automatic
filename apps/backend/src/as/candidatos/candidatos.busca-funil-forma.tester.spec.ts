import { describe, expect, it } from "vitest";
import { bancoDaBuscaComFunil } from "./busca-funil.tester-fake";

/**
 * ─ A TRAVA DE FORMA DA RESPOSTA, e e ela que faltava quando o `substituidoCpf` passou meses ──────
 *
 * ┌─ O DANO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR QUE VOLTE ─────────────────────────────────────┐
 * │ A lista de vagas descia `substituidoCpf` CRU por meses, para toda vaga, e ninguem viu:      │
 * │ nenhuma coluna da tela o mostrava e nenhum teste olhava a FORMA da resposta. Teste de        │
 * │ comportamento nao pega campo a MAIS, so pega campo a MENOS, porque campo sobrando nao quebra │
 * │ nada: ele so vaza.                                                                           │
 * │                                                                                              │
 * │ Entao a assercao aqui e por LISTA FECHADA. O item de candidatura que a LISTA devolve tem     │
 * │ EXATAMENTE oito campos, e qualquer nono campo, de qualquer nome, reprova.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS PROIBIDOS POR NOME sao os que o veto da auditoria barrou (emenda E-2 do mapa):
 * `motivoDescarte` (texto livre do consultor sobre a recusa, 2.336 linhas preenchidas em producao)
 * e `pretensaoSalarial` (dado financeiro) vem de `AsCandidaturaItem`, cuja autorizacao §A.6 esta
 * concedida SOBRE A PREMISSA de que a busca nao o usa. `candidatoNome` e os demais sobram sem
 * nenhuma coluna para mostra-los, que e a definicao do defeito do `substituidoCpf`.
 *
 * E tres dos cinco leitores desta rota (emenda E-1) chamam com `semCandidatura: true` para
 * OFERECER pessoas: com a projecao larga, o modal de alocar viraria vitrine do motivo da recusa.
 */

/**
 * A lista FECHADA do contrato `AsCandidaturaNaLista`, em ordem alfabetica.
 *
 * `clienteNome` e `cargoNome` ENTRARAM em 06/10/2026: cliente e cargo da VAGA passaram a vir do
 * proprio funil, para a tela parar de cruzar contra `/as/vagas` (que a Central de Vagas filtrou para
 * so liberada). Sao ATRIBUTOS DA VAGA, nao dado pessoal do candidato (§A.6), e por isso entram na
 * lista FECHADA em vez de na lista de PROIBIDOS logo abaixo.
 */
const CAMPOS = [
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
  "posicaoLado",
  "alocadoEm",
  "atualizadoEm",
  "alocadoPorId",
  "cpf",
  "candidatoCpf",
  "substituidoCpf",
  "temCpf",
];

function cenarioDeUmaPessoaComUmaCandidatura() {
  return bancoDaBuscaComFunil({
    pessoas: [{ id: "pessoa-1", nome: "Debora Campos De Oliveira" }],
    candidaturas: [
      {
        id: "cand-1",
        candidatoId: "pessoa-1",
        vagaId: "vaga-1",
        vagaCodigo: "3572904",
        vagaNome: "Auxiliar De Limpeza",
        etapa: "CAPTACAO",
        situacao: "ATIVO",
        ultimoContatoEm: new Date("2026-09-30T13:00:00.000Z"),
        vagaStatus: "PENDENTE_REVISAO",
      },
    ],
  });
}

describe("a candidatura que a LISTA devolve tem lista FECHADA de dez campos", () => {
  it("devolve EXATAMENTE os dez campos do contrato, nem um a mais", async () => {
    const { service } = cenarioDeUmaPessoaComUmaCandidatura();
    const pagina = await service.buscar({});

    const candidaturas = pagina.itens[0]?.candidaturas;
    expect(
      candidaturas,
      "a lista nao devolveu o funil: sem ele a tela volta a pedir um painel por vaga, que e o 429.",
    ).toBeDefined();
    expect(candidaturas).toHaveLength(1);

    expect(
      Object.keys(candidaturas![0]).sort(),
      "campo a mais na projecao da lista e exatamente o defeito do `substituidoCpf`: ninguem o mostra e ele desce para a base inteira.",
    ).toEqual(CAMPOS);
  });

  it.each(PROIBIDOS)("NAO devolve `%s`", async (campo) => {
    const { service } = cenarioDeUmaPessoaComUmaCandidatura();
    const pagina = await service.buscar({});
    const candidatura = pagina.itens[0]?.candidaturas?.[0];
    expect(candidatura).toBeDefined();
    expect(
      candidatura,
      `\`${campo}\` nao tem coluna nenhuma nesta tela e desceria para toda a pagina, em todos os cinco leitores da rota.`,
    ).not.toHaveProperty(campo);
  });

  it("nenhuma chave do item de candidatura menciona cpf, em qualquer caixa", async () => {
    const { service } = cenarioDeUmaPessoaComUmaCandidatura();
    const pagina = await service.buscar({});
    const chaves = Object.keys(pagina.itens[0]!.candidaturas![0]);
    expect(chaves.filter((k) => k.toLowerCase().includes("cpf"))).toEqual([]);
  });

  /**
   * O TIPO TAMBEM E CONTRATO: `ultimoContatoEm` e `string | null`, e nao o `Date` que o driver
   * entrega. Deixar o `Date` passar cru faz a tela receber um objeto onde espera texto, e o erro
   * aparece so na renderizacao, longe daqui.
   */
  it("os campos viajam no tipo do contrato: texto, nunca `Date`", async () => {
    const { service } = cenarioDeUmaPessoaComUmaCandidatura();
    const pagina = await service.buscar({});
    const c = pagina.itens[0]!.candidaturas![0];

    expect(typeof c.id).toBe("string");
    expect(typeof c.candidatoId).toBe("string");
    expect(typeof c.vagaId).toBe("string");
    expect(typeof c.etapa).toBe("string");
    expect(typeof c.situacao).toBe("string");
    expect(c.ultimoContatoEm, "`Date` cru no lugar do texto ISO.").not.toBeInstanceOf(Date);
    expect(typeof c.ultimoContatoEm).toBe("string");
  });

  it("sem contato registrado, `ultimoContatoEm` e nulo e nao `undefined`", async () => {
    const { service } = bancoDaBuscaComFunil({
      pessoas: [{ id: "pessoa-1", nome: "Debora Oliveira" }],
      candidaturas: [
        { id: "cand-1", candidatoId: "pessoa-1", vagaId: "vaga-1", ultimoContatoEm: null },
      ],
    });
    const pagina = await service.buscar({});
    expect(pagina.itens[0]!.candidaturas![0].ultimoContatoEm).toBeNull();
  });
});
