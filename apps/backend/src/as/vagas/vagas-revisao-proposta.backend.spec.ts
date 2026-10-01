import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  PROCEDENCIAS_DO_CLIENTE_DA_LIBERACAO,
  fraseDaProcedenciaDoCliente,
  procedenciaDoClienteNaLiberacao,
  propostasDeClienteDasVagas,
} from "./vagas-revisao-proposta";

/**
 * ─ A PROCEDÊNCIA DO CLIENTE NA LIBERAÇÃO (item 8): "ESCOLHIDO" OU "ACEITO"? ────────────────────
 *
 * ┌─ A PERGUNTA SÓ APARECE NO DIA RUIM, E É POR ISSO QUE ELA TEM DE ESTAR GRAVADA ANTES ─────────┐
 * │ Quando uma linha da planilha estiver errada, a única pergunta que importa é se aquele cliente │
 * │ foi ESCOLHIDO por alguém ou ACEITO da proposta, porque é ela que diz QUANTAS vagas herdaram o │
 * │ mesmo erro. Sem o registro, a investigação começa do zero e termina em "não dá para saber".    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A FUNÇÃO NUNCA LANÇA, E ISSO É DESENHO ─────────────────────────────────────────────────────┐
 * │ A liberação da vaga é caminho humano JÁ VALIDADO, e ela não pode falhar porque uma coluna de   │
 * │ proposta não respondeu (§A.26). Sem resposta, a procedência é `ESCOLHIDO`, que é a verdade      │
 * │ CONSERVADORA: ninguém pode afirmar que houve aceite de proposta.                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: todo dado é sintético, e o que a trilha recebe são DOIS CÓDIGOS. Nenhum nome de empresa
 * entra na observação do evento, e nenhum dado de candidato passa por aqui.
 */

const dialeto = new PgDialect();
const VAGA_ID = "11111111-1111-4111-8111-111111111111";
const COD = "CLI-TESTE-1";

function txFingido(linhas: Record<string, unknown>[]) {
  const instrucoes: string[] = [];
  const tx = {
    execute: (consulta: unknown) => {
      instrucoes.push(dialeto.sqlToQuery(consulta as never).sql);
      return Promise.resolve(linhas);
    },
  };
  return { tx, instrucoes };
}

const escritas = (instrucoes: string[]) => instrucoes.filter((s) => /^\s*update/i.test(s));

describe("a procedência do cliente com que a vaga saiu da fila", () => {
  it("sem proposta nenhuma: ESCOLHIDO, e nada é carimbado", async () => {
    const { tx, instrucoes } = txFingido([
      { cliente_proposto: null, cliente_proposto_origem: null },
    ]);

    const p = await procedenciaDoClienteNaLiberacao(tx, VAGA_ID, COD);

    expect(p).toBe("ESCOLHIDO");
    expect(escritas(instrucoes), "carimbou aceite sem proposta").toEqual([]);
  });

  it("proposta de OUTRO cliente: ESCOLHIDO, e a proposta NÃO é marcada como confirmada", async () => {
    /*
     * ┌─ O DEFEITO QUE ISTO IMPEDE É DE REGISTRO, E ELE MENTE PARA SEMPRE ──────────────────────┐
     * │ Carimbar `CONFIRMADO` quando a pessoa escolheu OUTRO cliente faria a vaga afirmar que a  │
     * │ proposta da planilha foi aceita, quando ela foi justamente RECUSADA. No dia em que se     │
     * │ for contar quantas vagas herdaram uma linha errada, essa vaga entraria na conta errada.   │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { tx, instrucoes } = txFingido([
      { cliente_proposto: "CLI-TESTE-2", cliente_proposto_origem: "PLANILHA_ID_VAGA" },
    ]);

    const p = await procedenciaDoClienteNaLiberacao(tx, VAGA_ID, COD);

    expect(p).toBe("ESCOLHIDO");
    expect(escritas(instrucoes)).toEqual([]);
  });

  it("aceitou a proposta do ID DA VAGA: procedência própria, e carimbo CONFIRMADO", async () => {
    const { tx, instrucoes } = txFingido([
      { cliente_proposto: COD, cliente_proposto_origem: "PLANILHA_ID_VAGA" },
    ]);

    const p = await procedenciaDoClienteNaLiberacao(tx, VAGA_ID, COD);

    expect(p).toBe("ACEITO_DEPARA_ID_VAGA");
    const update = escritas(instrucoes)[0] ?? "";
    expect(update).toContain("cliente_proposto_estado = 'CONFIRMADO'");
    /*
     * ELE SÓ ESCREVE O ESTADO: nem `cod_cliente` (que a liberação escreve por outro caminho, com
     * trilha), nem a proposta (que é o registro do que FOI proposto), nem `atualizado_em` (que é o
     * relógio do expurgo de quem está dentro da vaga).
     */
    expect(update).not.toMatch(/\bcod_cliente\s*=/);
    expect(update).not.toContain("cliente_proposto_nome =");
    expect(update).not.toContain("atualizado_em");
    expect(update, "o carimbo também é condicional").toContain("is distinct from");
  });

  it("aceitou a proposta da REQUISIÇÃO: a procedência distingue as duas chaves", async () => {
    /*
     * POR QUE AS DUAS PROCEDÊNCIAS SÃO SEPARADAS: a `reference` casa pela CADEIA DE REABERTURA e é
     * inferência mais fraca que a direta, então um erro que entrou por ela tem alcance diferente de
     * um que entrou pelo id da vaga. Um código só para "veio da planilha" juntaria as duas conversas.
     */
    const { tx } = txFingido([
      { cliente_proposto: COD, cliente_proposto_origem: "PLANILHA_REQUISICAO" },
    ]);

    expect(await procedenciaDoClienteNaLiberacao(tx, VAGA_ID, COD)).toBe(
      "ACEITO_DEPARA_REQUISICAO",
    );
  });

  it("caixa e espaço não decidem: o mesmo código é o mesmo código", async () => {
    const { tx } = txFingido([
      { cliente_proposto: ` ${COD.toLowerCase()} `, cliente_proposto_origem: "PLANILHA_ID_VAGA" },
    ]);

    expect(await procedenciaDoClienteNaLiberacao(tx, VAGA_ID, ` ${COD} `)).toBe(
      "ACEITO_DEPARA_ID_VAGA",
    );
  });

  it("a consulta que FALHA não derruba a liberação, e devolve o conservador", async () => {
    /*
     * §A.26 NA PRÁTICA: a liberação é código validado, e o que esta frente acrescenta a ela é um
     * REGISTRO. Registro que derruba o gesto que ele registra é pior que registro nenhum, e aqui o
     * custo da falha seria uma vaga real travando na operação.
     */
    const tx = { execute: () => Promise.reject(new Error("22P02")) };

    expect(await procedenciaDoClienteNaLiberacao(tx, VAGA_ID, COD)).toBe("ESCOLHIDO");
  });

  it("a origem desconhecida cai para ESCOLHIDO, e não inventa procedência", async () => {
    /*
     * FAIL-CLOSED do vocabulário: um valor de origem que o código não conhece (migração pela metade,
     * linha escrita à mão no banco) não pode virar uma procedência inventada na trilha.
     */
    const { tx } = txFingido([
      { cliente_proposto: COD, cliente_proposto_origem: "PLANILHA_QUE_NINGUEM_DESENHOU" },
    ]);

    expect(await procedenciaDoClienteNaLiberacao(tx, VAGA_ID, COD)).toBe("ESCOLHIDO");
  });
});

describe("a frase que entra na trilha", () => {
  it("diz o cliente e a procedência, e NÃO carrega nome de empresa", () => {
    const frase = fraseDaProcedenciaDoCliente(COD, "ACEITO_DEPARA_ID_VAGA");

    expect(frase).toContain(COD);
    expect(frase).toContain("ACEITO_DEPARA_ID_VAGA");
    /* §A.11: travessão PROIBIDO em texto que chega ao usuário, e a observação da trilha é lida. */
    expect(frase, "a frase da trilha usa travessão (§A.11)").not.toContain("—");
  });

  it("as três procedências são as declaradas, e todas cabem na frase", () => {
    expect([...PROCEDENCIAS_DO_CLIENTE_DA_LIBERACAO].sort()).toEqual([
      "ACEITO_DEPARA_ID_VAGA",
      "ACEITO_DEPARA_REQUISICAO",
      "ESCOLHIDO",
    ]);
    for (const p of PROCEDENCIAS_DO_CLIENTE_DA_LIBERACAO) {
      expect(fraseDaProcedenciaDoCliente(COD, p)).toContain(p);
    }
  });
});

describe("a proposta que desce para a tela de revisão", () => {
  it("vem marcada como NÃO conferida, sempre (condição C1 da auditoria)", async () => {
    /*
     * ┌─ SEM A MARCA, A PROPOSTA CHEGA IGUAL A UM VALOR JÁ GRAVADO ──────────────────────────────┐
     * │ Ela apareceria pré-preenchida no seletor, quem libera assinaria a escolha da planilha sem │
     * │ ter conferido, e a trilha passaria a afirmar que uma PESSOA escolheu. É por isso que      │
     * │ `conferida` é `false` no TIPO, e não só no valor.                                         │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { tx } = txFingido([
      {
        id: VAGA_ID,
        cliente_proposto: COD,
        cliente_proposto_nome: "ALFA SERVICOS LTDA",
        cliente_proposto_origem: "PLANILHA_ID_VAGA",
      },
    ]);

    const propostas = await propostasDeClienteDasVagas(tx, [VAGA_ID]);

    expect(propostas[VAGA_ID]).toMatchObject({
      codClienteProposto: COD,
      nomeClienteProposto: "ALFA SERVICOS LTDA",
      origem: "PLANILHA_ID_VAGA",
      conferida: false,
    });
  });

  it("sem ids pedidos, não consulta nada: a tela não varre a tabela inteira", async () => {
    /*
     * §A.6, minimização: devolver proposta de vaga que ninguém pediu é dado atravessando sem
     * necessidade, e numa lista de 470 linhas isso é a tabela inteira saindo por uma rota de leitura.
     */
    const { tx, instrucoes } = txFingido([]);

    expect(await propostasDeClienteDasVagas(tx, [])).toEqual({});
    expect(instrucoes).toEqual([]);
  });

  it("a consulta filtra por proposta EXISTENTE, e é por lote de id", async () => {
    const { tx, instrucoes } = txFingido([]);

    await propostasDeClienteDasVagas(tx, [VAGA_ID, VAGA_ID]);

    const consulta = instrucoes[0] ?? "";
    expect(consulta).toContain("cliente_proposto_nome is not null");
    expect(consulta).toContain("where id in");
    /* O id repetido não vira dois parâmetros: a lista é deduplicada antes de compor a consulta. */
    expect((consulta.match(/\$\d+/g) ?? []).length).toBe(1);
  });
});
