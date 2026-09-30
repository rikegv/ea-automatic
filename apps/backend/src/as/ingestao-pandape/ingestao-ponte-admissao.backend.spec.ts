import { describe, expect, it, vi } from "vitest";
import { IngestaoPonteParaAdmissao } from "./ingestao-ponte-admissao";
import { bancoFingido, consultaQueCasa } from "./ingestao-repositorio.tester-fake";

/**
 * ─ O ADAPTADOR DA PONTE: O COMO, DEPOIS QUE O CICLO JÁ DECIDIU O QUANDO ────────────────────────
 *
 * O `quando` (só no nascimento, só na situação que pede) é medido em
 * `ingestao-ponte-admissao.ciclo.backend.spec.ts`. Aqui se prova o que só existe DEPOIS da porta: a
 * guarda de idempotência por `admissao_id`, o adiamento por CPF, o reuso do caminho manual e a forma
 * das duas instruções que tocam o banco.
 *
 * O BANCO RESPONDE POR SENTIDO, e não por ordem de chamada (`bancoFingido`): o adaptador pode passar
 * a fazer uma leitura a mais amanhã, e um fake posicional entregaria a resposta errada para a
 * consulta certa, deixando o teste verde com o defeito aberto.
 *
 * §A.6: o CPF usado é um válido de teste, nunca de pessoa, e nada aqui vai a log (o adaptador não
 * loga: quem loga é o ciclo, e só o rótulo do motivo).
 */

const CPF_DE_TESTE = "52998224725";
const CANDIDATURA = "00000000-0000-4000-8000-0000000000c1";
const VAGA = "00000000-0000-4000-8000-0000000000a1";
const ADMISSAO = "00000000-0000-4000-8000-0000000000ad";

function snapshotDaPonte(over: Record<string, unknown> = {}) {
  return {
    candidato: {
      cpf: CPF_DE_TESTE,
      nome: "NomeSintetico SobrenomeSintetico",
      email: null,
      telefone: null,
      dataNascimento: null,
    },
    // NULOS DE PROPÓSITO: a vaga do A&S pode não ter cliente nem cargo resolvidos (§A.5), e a
    // pré-admissão nasce assim mesmo, como pendência da Liberação.
    codCliente: null,
    cargoId: null,
    idVacancy: "9001",
    vagaFolha: {},
    ...over,
  };
}

function montar(
  opcoes: {
    linhaDaCandidatura?: Record<string, unknown> | null;
    snapshot?: unknown;
    metas?: { posicoes_oficiais: number | null; posicoes_banco: number | null } | null;
    ocupadas?: { lado: string | null; quantas: number }[];
    vivas?: { id: string; idVacancy: string | null }[];
  } = {},
) {
  const linha =
    opcoes.linhaDaCandidatura === undefined
      ? { admissao_id: null, vaga_id: VAGA }
      : opcoes.linhaDaCandidatura;
  const banco = bancoFingido([
    { quando: /from as_candidaturas where id =/, devolve: linha ? [linha] : [] },
    { quando: /from vagas where id =/, devolve: opcoes.metas === null ? [] : [opcoes.metas ?? { posicoes_oficiais: 2, posicoes_banco: 0 }] },
    { quando: /group by posicao_lado/, devolve: opcoes.ocupadas ?? [{ lado: null, quantas: 1 }] },
  ]);
  const candidatos = {
    dadosDaPonteParaAdmissao: vi
      .fn()
      .mockResolvedValue(opcoes.snapshot === undefined ? snapshotDaPonte() : opcoes.snapshot),
  };
  const admissoes = {
    vivasPorCpf: vi.fn().mockResolvedValue(opcoes.vivas ?? []),
    criarPreAdmissaoDoFunil: vi.fn().mockResolvedValue({ admissaoId: ADMISSAO, jaExistia: false }),
  };
  const ponte = new IngestaoPonteParaAdmissao(
    banco.db,
    candidatos as never,
    admissoes as never,
  );
  return { ponte, banco, candidatos, admissoes };
}

describe("o adaptador da ponte para a admissão", () => {
  it("cria a pré-admissão do funil e aponta a candidatura para ela", async () => {
    const { ponte, banco, admissoes } = montar();
    const r = await ponte.criar(CANDIDATURA);
    expect(r).toEqual({ feita: true, posicaoExcedida: false });

    // REUSA O CAMINHO MANUAL, e não escreve admissão à mão: é lá que moram o nascimento em
    // AGUARDANDO_LIBERACAO, a captura do unique parcial, o TTL do CPF do substituído e o dígito.
    expect(admissoes.criarPreAdmissaoDoFunil).toHaveBeenCalledTimes(1);
    const entrada = admissoes.criarPreAdmissaoDoFunil.mock.calls[0][0];
    expect(entrada.candidato.cpf).toBe(CPF_DE_TESTE);
    // CLIENTE E CARGO NULOS ENTRAM: viram pendência na Liberação, nunca `cod_cliente` inventado.
    expect(entrada.codCliente).toBeNull();
    expect(entrada.cargoId).toBeNull();

    const update = consultaQueCasa(banco.consultas, /update as_candidaturas/);
    expect(update).not.toBeNull();
    expect(update).toContain("admissao_id =");
    /*
     * O `where ... admissao_id is null` FECHA A CORRIDA COM O CAMINHO MANUAL: um consultor pode
     * enviar a mesma pessoa para a admissão no intervalo entre a leitura da guarda e esta gravação, e
     * sobrescrever ali trocaria o apontamento em silêncio, deixando a admissão dele órfã.
     */
    expect(update).toContain("admissao_id is null");
  });

  /*
   * ─ A GUARDA DE IDEMPOTÊNCIA, E POR QUE ELA NÃO É LUXO ────────────────────────────────────────
   *
   * O unique parcial da admissão (`uq_admissao_cpf_vaga_viva`) só vale enquanto o farol é VIVO: a
   * admissão já CONCLUÍDA ou DECLINADA sai do índice, e sem esta leitura uma segunda admissão
   * nasceria da mesma candidatura. `admissao_id` é o registro local do "já fiz".
   */
  it("NÃO cria de novo quando a candidatura já aponta para uma admissão", async () => {
    const { ponte, banco, admissoes, candidatos } = montar({
      linhaDaCandidatura: { admissao_id: ADMISSAO, vaga_id: VAGA },
    });
    const r = await ponte.criar(CANDIDATURA);
    expect(r).toEqual({ feita: false, motivo: "JA_TEM_ADMISSAO" });
    expect(admissoes.criarPreAdmissaoDoFunil).not.toHaveBeenCalled();
    // E NEM O SNAPSHOT É LIDO: a guarda é a PRIMEIRA coisa, então a volta que não tem o que fazer
    // custa uma consulta, e não o cadastro inteiro da pessoa passando pela memória do processo.
    expect(candidatos.dadosDaPonteParaAdmissao).not.toHaveBeenCalled();
    expect(consultaQueCasa(banco.consultas, /update as_candidaturas/)).toBeNull();
  });

  it.each([
    ["ausente", null],
    ["inválido", "00000000000"],
  ])("ADIA quando o CPF é %s, sem criar nada", async (_rotulo, cpf) => {
    const { ponte, banco, admissoes } = montar({
      snapshot: snapshotDaPonte({
        candidato: {
          cpf,
          nome: "NomeSintetico",
          email: null,
          telefone: null,
          dataNascimento: null,
        },
      }),
    });
    const r = await ponte.criar(CANDIDATURA);
    /*
     * ADIAR, E NUNCA INVENTAR NEM FALHAR: a candidatura já está gravada, e o CPF é a chave de
     * identidade da admissão. O validador é o mesmo do resto do sistema porque o motivo é de dedup:
     * um lixo repetido no ATS (`00000000000`) juntaria pessoas diferentes, e fusão de ficha não se
     * desfaz.
     */
    expect(r).toEqual({ feita: false, motivo: "SEM_CPF" });
    expect(admissoes.criarPreAdmissaoDoFunil).not.toHaveBeenCalled();
    expect(consultaQueCasa(banco.consultas, /update as_candidaturas/)).toBeNull();
  });

  it("candidatura que não existe mais não vira admissão nenhuma", async () => {
    const { ponte, admissoes } = montar({ linhaDaCandidatura: null });
    expect(await ponte.criar(CANDIDATURA)).toEqual({
      feita: false,
      motivo: "CANDIDATURA_AUSENTE",
    });
    expect(admissoes.criarPreAdmissaoDoFunil).not.toHaveBeenCalled();
  });

  /*
   * A SOBRE-OCUPAÇÃO É CONTADA, NUNCA TRAVADA (premissa declarada): o ATS é a fonte do fato, e
   * recusar o fato faria a base divergir da realidade em silêncio. A conta é a do domínio, com a
   * mesma lista de situações da trava do funil, e o lado nulo da candidatura conta como OFICIAL.
   */
  it("ACUSA a posição excedida e AINDA ASSIM cria a admissão", async () => {
    const { ponte, admissoes } = montar({
      metas: { posicoes_oficiais: 2, posicoes_banco: 0 },
      ocupadas: [{ lado: null, quantas: 3 }],
    });
    expect(await ponte.criar(CANDIDATURA)).toEqual({ feita: true, posicaoExcedida: true });
    expect(admissoes.criarPreAdmissaoDoFunil).toHaveBeenCalledTimes(1);
  });

  it("a ocupação do BANCO não acusa excesso no lado OFICIAL", async () => {
    // Era o defeito medido na vaga real de homologação: um número só medido contra dois tetos.
    const { ponte } = montar({
      metas: { posicoes_oficiais: 2, posicoes_banco: 20 },
      ocupadas: [
        { lado: "BANCO", quantas: 15 },
        { lado: "OFICIAL", quantas: 1 },
      ],
    });
    expect(await ponte.criar(CANDIDATURA)).toEqual({ feita: true, posicaoExcedida: false });
  });

  it("vaga SEM meta definida não acusa excesso", async () => {
    // Vaga que ninguém dimensionou não tem teto a exceder, e inventar um produziria alarme sobre
    // rascunho. Mesmo fail-closed de `tetoDoLado`.
    const { ponte } = montar({
      metas: { posicoes_oficiais: null, posicoes_banco: 0 },
      ocupadas: [{ lado: null, quantas: 9 }],
    });
    expect(await ponte.criar(CANDIDATURA)).toEqual({ feita: true, posicaoExcedida: false });
  });

  it("a contagem da ocupação usa a lista de situações que CONSOMEM posição", async () => {
    const { ponte, banco } = montar();
    await ponte.criar(CANDIDATURA);
    const contagem = consultaQueCasa(banco.consultas, /group by posicao_lado/) ?? "";
    // Os valores viajam como PARÂMETRO (não aparecem no texto), então o que se afirma é a FORMA: a
    // contagem é por lado e filtrada por situação, e não um `count(*)` de tudo.
    expect(contagem).toContain("situacao in");
    expect(contagem).toContain("group by posicao_lado");
  });

  it("marca `possivelDuplicata` quando já há admissão viva ambígua do mesmo CPF", async () => {
    const { ponte, admissoes } = montar({ vivas: [{ id: "adm-viva", idVacancy: null }] });
    await ponte.criar(CANDIDATURA);
    // MESMO CRITÉRIO DO CAMINHO MANUAL E DO PANDAPÉ: sinaliza na tela, e NÃO bloqueia. É isso que a
    // torna adequada a um caminho automático.
    expect(admissoes.criarPreAdmissaoDoFunil.mock.calls[0][0].possivelDuplicata).toBe(true);
  });
});
