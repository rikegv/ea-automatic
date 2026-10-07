import { describe, expect, it } from "vitest";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";
import {
  CAMPOS_DO_PRE_PREENCHIMENTO,
  PROCEDENCIA_DA_PLANILHA,
  camposComProcedenciaDaPlanilha,
} from "../../domain/as-planilha-prepreenchimento";
import {
  CENARIO_NOVO,
  CODIGO_ENTREGA,
  EVENTO_1,
  MASTER,
  VAGA,
  bancoDoReabrir,
  escritasEm,
  eventoDeCancelamento,
  pessoa,
  portaDe,
  type BancoDoReabrir,
} from "./reabrir-vaga.tester-fake";

/**
 * ─ A SÉTIMA PORTA: A REABERTURA É GRAVAÇÃO HUMANA DA DATA LIMITE (§A.38, cobertura independente) ─
 *
 * ┌─ O REQUISITO, E ELE NÃO É "chamar `procedenciaALimpar`" ─────────────────────────────────────┐
 * │ A regra do diretor é: o carimbo `PLANILHA` afirma que AQUELE VALOR veio da planilha, e TODA   │
 * │ gravação humana daquele valor desfaz a afirmação. A reabertura TROCA a previsão de entrega    │
 * │ (na ENTREGA ela é OBRIGATÓRIA: o lançamento recusa a reabertura sem prazo novo), então ela é   │
 * │ gravação humana da `data_limite` como qualquer outra. QUAL função faz a limpeza é escolha de   │
 * │ implementação; o que este arquivo mede é o EFEITO na coluna e na lista que a tela lê.          │
 * │                                                                                               │
 * │ O DANO, se a limpeza não acontecer, não para na tela: o nome do campo entra no RETRATO         │
 * │ PERMANENTE da ponte (`as_candidatura_etapas.procedencia_planilha`), que é imutável, e a        │
 * │ contagem do dia ruim ("quantas vagas herdaram o erro da planilha?") passa a contar uma vaga    │
 * │ cujo prazo um Master renegociou à mão.                                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE OS DOIS CAMINHOS, E NÃO UM ────────────────────────────────────────────────────────┐
 * │ O objeto dos carimbos é ESPALHADO em DOIS `update(vagas).set()`: o da reabertura de           │
 * │ CANCELAMENTO e o de dentro da reabertura de ENTREGA. Cobrir um só deixa o outro regredir      │
 * │ sozinho, e o par é justamente o que mantém a correção no objeto COMPARTILHADO em vez de       │
 * │ duplicada nos dois `set`.                                                                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E A LIMPEZA É POR CAMPO: reabrir troca o PRAZO, e não o tipo de vaga, nem o cargo, nem a célula,
 * nem a data de abertura. Limpar os cinco de uma vez seria o defeito simétrico, e ele apagaria a
 * resposta da pergunta que a coluna existe para responder.
 *
 * §A.6: dado SINTÉTICO (o fixture do `reabrir-vaga.tester-fake`). Nada aqui asserta nome de pessoa.
 * §A.11: sem travessão.
 */

const PRAZO_ANTIGO = "2026-09-20";
const PRAZO_NOVO = "2026-11-30";

const porta = (banco: BancoDoReabrir) =>
  portaDe(
    new VagasService(
      banco.db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
    ),
  );

/** A vaga CANCELADA (o padrão do fixture), com o cancelamento NOVO e o prazo antigo gravado. */
function vagaCancelada() {
  const banco = bancoDoReabrir({
    pessoas: CENARIO_NOVO(),
    eventos: [eventoDeCancelamento(EVENTO_1)],
  });
  banco.vaga.dataLimite = PRAZO_ANTIGO;
  return banco;
}

/** A vaga ENTREGUE, o caminho em que o prazo novo é EXIGIDO (há lançamento quando falta). */
function vagaEntregue() {
  const banco = bancoDoReabrir({
    status: CODIGO_ENTREGA,
    encerradaEm: null,
    pessoas: [pessoa("Ana", "ATIVO", { etapa: "ENTREVISTA_CLIENTE" })],
  });
  banco.vaga.dataLimite = PRAZO_ANTIGO;
  return banco;
}

const updatesDaVaga = (banco: BancoDoReabrir) =>
  escritasEm(banco, "vagas").filter((e) => e.tipo === "update");

/** O que os `update` da vaga escreveram, somado: é a linha depois da reabertura. */
const escritoNaVaga = (banco: BancoDoReabrir): Record<string, unknown> =>
  Object.assign({}, ...updatesDaVaga(banco).map((u) => u.valores));

/** A vaga com os CINCO campos carimbados, como o pré-preenchimento a deixa. */
const CARIMBADA_NOS_CINCO: Record<string, unknown> = {
  naturezaOrigem: PROCEDENCIA_DA_PLANILHA,
  linhaServicoOrigem: PROCEDENCIA_DA_PLANILHA,
  cargoOrigem: PROCEDENCIA_DA_PLANILHA,
  dataAberturaOrigem: PROCEDENCIA_DA_PLANILHA,
  dataLimiteOrigem: PROCEDENCIA_DA_PLANILHA,
};

const AS_OUTRAS_QUATRO_ORIGENS = [
  "naturezaOrigem",
  "linhaServicoOrigem",
  "cargoOrigem",
  "dataAberturaOrigem",
];

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. O CASO DO `seguranca`: PRAZO NOVO LIMPA O CARIMBO DO PRAZO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("reabrir com prazo novo é gravação humana da data limite", () => {
  it("CANCELAMENTO: o prazo novo entra e `data_limite_origem` é LIMPA na mesma escrita", async () => {
    const banco = vagaCancelada();

    await porta(banco).reabrir(
      VAGA,
      { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO },
      MASTER,
    );

    const escrito = escritoNaVaga(banco);
    expect(escrito.dataLimite, "o prazo novo não foi gravado").toBe(PRAZO_NOVO);
    expect(
      escrito.dataLimiteOrigem,
      "a reabertura trocou a data limite e deixou o carimbo dizendo que ela veio da planilha",
    ).toBeNull();
    /* A cópia do prazo anterior continua sendo o registro da renegociação. */
    expect(escrito.dataLimiteAnterior).toBe(PRAZO_ANTIGO);
  });

  it("ENTREGA: o mesmo, e aqui o prazo novo é OBRIGATÓRIO (o caminho é forçado)", async () => {
    const banco = vagaEntregue();

    await porta(banco).reabrir(
      VAGA,
      { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO },
      MASTER,
    );

    const escrito = escritoNaVaga(banco);
    expect(escrito.dataLimite).toBe(PRAZO_NOVO);
    expect(
      escrito.dataLimiteOrigem,
      "a reabertura da ENTREGA trocou a data limite e não limpou o carimbo: este é o site que o objeto compartilhado precisa alcançar",
    ).toBeNull();
    expect(escrito.dataLimiteAnterior).toBe(PRAZO_ANTIGO);
  });

  it("a lista que a tela lê passa a NÃO marcar a data limite, e continua marcando as outras", async () => {
    const banco = vagaEntregue();

    await porta(banco).reabrir(
      VAGA,
      { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO },
      MASTER,
    );

    /*
     * A LINHA DEPOIS DA REABERTURA: os cinco carimbos de antes, sobrescritos pelo que o `update`
     * escreveu. É assim que `list()` a leria na requisição seguinte, e é ela que alimenta
     * `camposVindosDaPlanilha`.
     */
    const depois = { ...CARIMBADA_NOS_CINCO, ...escritoNaVaga(banco) };
    const campos = camposComProcedenciaDaPlanilha(depois);
    expect(campos).not.toContain("dataLimite");
    expect(campos).toEqual(["natureza", "linhaServico", "cargo", "dataAbertura"]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. O SIMÉTRICO: SEM PRAZO NOVO, NADA SE LIMPA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("reabrir SEM prazo novo não limpa carimbo nenhum", () => {
  it("CANCELAMENTO sem `dataLimite` no corpo: a data não muda, então a origem é PRESERVADA", async () => {
    const banco = vagaCancelada();

    await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, MASTER);

    const chaves = updatesDaVaga(banco).flatMap((u) => Object.keys(u.valores));
    expect(
      chaves,
      "a reabertura sem prazo novo limpou o carimbo de uma data que ela não trocou",
    ).not.toContain("dataLimiteOrigem");
    expect(chaves, "a reabertura sem prazo novo escreveu na data limite").not.toContain(
      "dataLimite",
    );
    expect(chaves).not.toContain("dataLimiteAnterior");
  });

  it("e a lista continua marcando os CINCO campos: preservar não é apagar", async () => {
    const banco = vagaCancelada();

    await porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"] }, MASTER);

    const depois = { ...CARIMBADA_NOS_CINCO, ...escritoNaVaga(banco) };
    expect(camposComProcedenciaDaPlanilha(depois)).toEqual([...CAMPOS_DO_PRE_PREENCHIMENTO]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. A LIMPEZA É POR CAMPO, NOS DOIS CAMINHOS
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a reabertura troca o PRAZO, e não os outros quatro campos", () => {
  for (const [nome, montar] of [
    ["CANCELAMENTO", vagaCancelada],
    ["ENTREGA", vagaEntregue],
  ] as const) {
    it(`${nome}: nenhuma das outras quatro procedências é tocada, nem os quatro valores`, async () => {
      const banco = montar();

      await porta(banco).reabrir(
        VAGA,
        { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO },
        MASTER,
      );

      const chaves = updatesDaVaga(banco).flatMap((u) => Object.keys(u.valores));
      for (const origem of AS_OUTRAS_QUATRO_ORIGENS) {
        expect(chaves, `a reabertura limpou ${origem}, que ela não tem como ter mudado`).not.toContain(
          origem,
        );
      }
      for (const valor of ["natureza", "linhaServicoId", "cargoId", "dataAbertura"]) {
        expect(chaves, `a reabertura escreveu em ${valor}`).not.toContain(valor);
      }
    });

    /**
     * A PROPRIEDADE, e é ela que pega a OITAVA porta destes dois fluxos: QUALQUER `update` da vaga
     * que escreva `data_limite` tem de limpar `data_limite_origem` na MESMA escrita. Carimbo que
     * viaja em outro `update` é carimbo que pode não acontecer, e a transação não ajuda quando a
     * segunda instrução simplesmente não existe.
     */
    it(`${nome}: todo \`update\` que escreve a data limite limpa a origem na MESMA instrução`, async () => {
      const banco = montar();

      await porta(banco).reabrir(
        VAGA,
        { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO },
        MASTER,
      );

      const queEscrevemOPrazo = updatesDaVaga(banco).filter((u) => "dataLimite" in u.valores);
      expect(queEscrevemOPrazo.length, "nenhum update escreveu a data limite").toBeGreaterThan(0);
      for (const u of queEscrevemOPrazo) {
        expect(
          u.valores,
          "um `update` escreveu a data limite sem limpar a procedência dela na mesma instrução",
        ).toHaveProperty("dataLimiteOrigem", null);
      }
    });
  }
});
