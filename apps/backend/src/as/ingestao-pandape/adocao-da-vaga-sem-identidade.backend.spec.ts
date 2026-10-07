import { describe, expect, it } from "vitest";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import {
  CODIGO,
  bancoDaRevisao,
  catalogoDaRevisao,
  escritaDaVaga,
  valorNoSet,
} from "./vaga-pendente-revisao.tester-fake";

/**
 * ─ A ADOÇÃO DA VAGA SEM IDENTIDADE: OS CONTRATOS DO AUTOR ──────────────────────────────────────
 *
 * A cobertura do requisito (adota com uma candidata, abstém-se com zero e com duas ou mais, não
 * toca a recusada, é idempotente, não escreve outro campo) está em
 * `adocao-da-vaga-sem-identidade.tester.spec.ts`, escrita por outro agente A PARTIR DO REQUISITO
 * (§A.38/§A.40). ESTE arquivo NÃO a repete: ele mede as consequências que só quem escreveu o
 * caminho enxerga, e cada uma é um jeito de a correção ficar verde por fora e errada por dentro.
 *
 *  1. `atualizado_em` NÃO É EMPURRADO PELA ADOÇÃO. §A.6: aquela coluna é o RELÓGIO DO EXPURGO de
 *     quem está dentro da vaga, e é por isso que o caminho de cima deixa de emitir `update` quando
 *     não tem o que escrever. A adoção não precisa dela para nada.
 *  2. A MATRÍCULA É GRAVADA APONTANDO PARA A VAGA ADOTADA. Sem ela, a volta seguinte acha a vaga
 *     pelo número, vê `da_varredura` falso e LANÇA "vaga de outro dono": a adoção viraria uma
 *     exceção de 30 em 30 minutos.
 *  3. ADOTAR CONTA COMO ESCRITA, inclusive quando os campos do ATS já estão iguais e o refresh não
 *     grava nada: sem o ajuste do contador, o ciclo registraria "nada aconteceu" na única volta que
 *     deu identidade à vaga.
 *  4. A VAGA JÁ LIBERADA (papel ABERTURA) NÃO É ADOTADA, e o caminho de hoje (criar) segue valendo.
 *     A medição está no comentário do método: a fronteira do `encerrarAusentes` é a MATRÍCULA, as 5
 *     vagas sem número de produção têm ZERO matrícula, logo é a adoção que as colocaria no regime
 *     em que o ATS fecha vaga sem autor. Enquanto o diretor não decidir o contrário, abster-se.
 *
 * §A.6: dado sintético, zero PII. §A.11: sem travessão.
 */

const ID_DA_CANDIDATA = "00000000-0000-4000-8000-0000000000ad";

/** A candidata lida pela adoção, com os campos que o fluxo precisa depois. */
const candidata = (status: string, iguaisAoAts = false) => ({
  id: ID_DA_CANDIDATA,
  status,
  codigo: "codigo-que-veio-do-ats",
  // IGUAIS AO ATS = o refresh dos quatro campos não tem o que escrever e devolve zero linha, que é
  // o cenário em que o contador precisa do ajuste da adoção.
  nome_divulgacao: iguaisAoAts ? "titulo-que-veio-do-ats" : "titulo-conferido-por-pessoa",
  cidade_id: iguaisAoAts ? null : 10,
  posicoes_oficiais: iguaisAoAts ? 2 : 9,
});

/**
 * A volta em que a busca pelo número NÃO acha nada e a adoção encontra UMA candidata.
 *
 * As respostas são por SENTIDO, e a ORDEM entre elas importa: o `update` da adoção repete
 * `id_vacancy_pandape is null` no `where` (compare-and-swap), então ele casaria também a regra da
 * leitura. A instrução que ESCREVE é reconhecida primeiro, pelo `set`.
 */
async function rodarVolta(
  status: string,
  opcoes: { iguaisAoAts?: boolean; semCandidata?: boolean } = {},
) {
  const cat = catalogoDaRevisao();
  const banco = bancoDaRevisao([
    // 1. A ESCRITA da adoção.
    { quando: /set id_vacancy_pandape/, devolve: [{ id: ID_DA_CANDIDATA }] },
    // 2. A LEITURA da candidata.
    {
      quando: /from vagas where codigo =/,
      devolve: opcoes.semCandidata ? [] : [candidata(status, opcoes.iguaisAoAts)],
    },
    // 3. O refresh dos quatro campos do ATS, que só acontece com a vaga ainda em revisão.
    {
      quando: /^update vagas set codigo/,
      devolve: opcoes.iguaisAoAts ? [] : [{ id: ID_DA_CANDIDATA }],
    },
    // 4. O insert do nascimento, para o caso em que a adoção se abstém.
    { quando: /insert into vagas/, devolve: [{ id: "00000000-0000-4000-8000-0000000000no" }] },
    // 5. A busca pelo número: nada, que é o que abre o caminho da adoção.
    { quando: /select[\s\S]*from vagas v/, devolve: [] },
  ]);
  const repo = new IngestaoRepositorio(banco.db, cat.servico as never, null as never);
  const resultado = await repo.escrever(escritaDaVaga(null));
  const consultas = banco.consultas.map((c) => c.toLowerCase());
  return {
    resultado,
    consultas,
    adocao: consultas.find((c) => /set id_vacancy_pandape/.test(c)) ?? "",
    leituraDaCandidata: consultas.find((c) => /from vagas where codigo =/.test(c)) ?? "",
    matricula: consultas.find((c) => /insert into as_varredura_vagas/.test(c)) ?? "",
    inserts: consultas.filter((c) => /insert into vagas/.test(c)),
    updates: consultas.filter((c) => /update vagas/.test(c)),
  };
}

describe("a adoção da vaga sem identidade: os contratos do autor", () => {
  it("NÃO empurra `atualizado_em`, que é o relógio do expurgo de quem está dentro da vaga", async () => {
    const v = await rodarVolta(CODIGO.pendenteRevisao, { iguaisAoAts: true });

    expect(v.adocao, "nenhuma instrução gravou a identidade").not.toBe("");
    expect(
      valorNoSet(v.adocao, "atualizado_em"),
      "a adoção empurrou `atualizado_em`: §A.6, a retenção de todas as candidaturas da vaga foi renovada sem autor e sem trilha",
    ).toBeNull();
    expect(
      valorNoSet(v.adocao, "id_vacancy_pandape"),
      "a adoção tem de gravar a identidade, que é a única coisa que ela faz",
    ).not.toBeNull();
  });

  it("grava a MATRÍCULA apontando para a vaga adotada, com o mesmo `on conflict` do nascimento", async () => {
    const v = await rodarVolta(CODIGO.pendenteRevisao);

    expect(
      v.matricula,
      "a vaga adotada ficou sem matrícula: a volta seguinte a acha pelo número, vê `da_varredura` falso e LANÇA vaga de outro dono, de 30 em 30 minutos",
    ).toContain("insert into as_varredura_vagas");
    expect(v.matricula).toContain(ID_DA_CANDIDATA.toLowerCase());
    expect(
      v.matricula,
      "sem o `do update`, a linha do número que sobreviveu a um cascade continuaria apontando para nada",
    ).toContain("on conflict (id_vacancy_pandape) do update");
  });

  it("NÃO cria vaga nenhuma quando adotou (a gêmea é exatamente o insert que não pode acontecer)", async () => {
    const v = await rodarVolta(CODIGO.pendenteRevisao);

    expect(v.inserts, "adotou E criou: a vaga gêmea nasceu do mesmo jeito").toEqual([]);
  });

  it("CONTA a adoção como escrita mesmo quando o refresh não grava nada (campos já iguais ao ATS)", async () => {
    const v = await rodarVolta(CODIGO.pendenteRevisao, { iguaisAoAts: true });

    expect(
      v.resultado.linhasAfetadas,
      "a volta que deu identidade à vaga reportou zero linha afetada: o ciclo registra nada aconteceu justamente na volta que aconteceu",
    ).toBe(1);
    expect(v.resultado.id).toBe(ID_DA_CANDIDATA);
  });

  it("a candidata em papel ABERTURA (liberada por uma pessoa) NÃO é adotada, e o caminho de hoje segue", async () => {
    const v = await rodarVolta(CODIGO.abertura);

    expect(
      v.adocao,
      "adotou uma vaga JÁ LIBERADA: a matrícula a colocaria no regime do `encerrarAusentes`, e o ATS passaria a poder fechar, sem autor, a vaga que uma pessoa liberou",
    ).toBe("");
    expect(
      v.leituraDaCandidata,
      "a leitura da candidata tem de exigir o papel REVISAO no próprio SQL",
    ).toMatch(/papel = 'revisao'/);
    expect(
      v.inserts.length,
      "não adotando, o comportamento de hoje (criar a vaga) tem de valer",
    ).toBe(1);
    expect(
      v.updates.filter((u) => /set id_vacancy_pandape/.test(u)),
      "nenhuma identidade podia ter sido gravada",
    ).toEqual([]);
  });

  it("IDEMPOTÊNCIA POR CONSTRUÇÃO: achando a vaga pelo número, nem PERGUNTA pela candidata", async () => {
    const cat = catalogoDaRevisao();
    const banco = bancoDaRevisao([
      {
        quando: /select[\s\S]*from vagas v/,
        devolve: [
          {
            id: ID_DA_CANDIDATA,
            status: CODIGO.abertura,
            codigo: "codigo-que-veio-do-ats",
            nome_divulgacao: "titulo-que-veio-do-ats",
            cidade_id: null,
            posicoes_oficiais: 2,
            status_antes: null,
            da_varredura: true,
            recusada_em: null,
            encerrou: false,
          },
        ],
      },
    ]);
    const repo = new IngestaoRepositorio(banco.db, cat.servico as never, null as never);
    await repo.escrever(escritaDaVaga(null));
    const consultas = banco.consultas.map((c) => c.toLowerCase());

    expect(
      consultas.filter((c) => /set id_vacancy_pandape/.test(c)),
      "a vaga já adotada foi adotada de novo: a identidade é escrita de 30 em 30 minutos, para sempre",
    ).toEqual([]);
    expect(
      consultas.filter((c) => /id_vacancy_pandape is null/.test(c)),
      "a volta rotineira paga uma consulta por candidata que nunca vai existir",
    ).toEqual([]);
  });
});
