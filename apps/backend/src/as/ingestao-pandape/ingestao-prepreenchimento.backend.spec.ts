import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { IngestaoDeParaCliente } from "./ingestao-depara-cliente.service";
import { novoResumo } from "./ingestao-ciclo";
import { PROCEDENCIA_DA_PLANILHA } from "../../domain/as-planilha-prepreenchimento";

/**
 * ─ O PRÉ-PREENCHIMENTO DA VAGA EM REVISÃO, MEDIDO PELA INSTRUÇÃO QUE O DRIVER RECEBE ───────────
 *
 * ┌─ POR QUE ESTE ARQUIVO MEDE A INSTRUÇÃO, E NÃO O EFEITO ──────────────────────────────────────┐
 * │ Ele não tem Postgres, e isso está DECLARADO: a suíte da ingestão inteira mede sentido contra  │
 * │ banco fingido (molde do `ingestao-bind-array.backend.spec.ts`, que existe porque 3.680 testes │
 * │ verdes conviveram com a instrução CENTRAL de uma frente sendo inexecutável). Aqui isso é       │
 * │ ainda mais apropriado: as DUAS travas desta frente MORAM na instrução, de propósito, e não em  │
 * │ `if` de TypeScript, então é a instrução que precisa ser asserida.                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS QUATRO COISAS QUE ESTE ARQUIVO PROVA, e as quatro são caras se quebrarem:
 *  1. NÃO TOCA `atualizado_em` da vaga, que é o RELÓGIO DO EXPURGO de quem está dentro dela. A
 *     varredura dá uma volta a cada 30 minutos: empurrá-lo renovaria a retenção de todo mundo 48
 *     vezes por dia, para sempre, sem nada ficar vermelho (§A.6);
 *  2. SÓ ESCREVE ONDE A COLUNA ESTÁ NULA, com o `coalesce` e o `is null` na própria instrução. Medido
 *     em produção: 9 vagas já têm natureza, 7 linha de serviço e 94 cargo, e o que uma PESSOA
 *     preencheu não é reescrito;
 *  3. PRÉ-PREENCHER NÃO É LIBERAR: nada de `status`, `status_manual_em`, `encerrada_em` ou papel;
 *  4. É INDEPENDENTE DA PROPOSTA DE CLIENTE: a proposta inalterada (regime estável) e a proposta
 *     AMBÍGUA não impedem o pré-preenchimento, porque a abstenção desta frente é POR CAMPO.
 *
 * §A.6: todo dado aqui é SINTÉTICO. Códigos de vaga na faixa 9xxxxx, clientes `CLI-TESTE-n`, cargos
 * em UUID inventado. Nenhum CPF, nenhum nome de pessoa, nenhum salário.
 */

const dialeto = new PgDialect();
const VAGA_ID = "11111111-1111-4111-8111-111111111111";
const COD = "CLI-TESTE-1";
const NOME = "ALFA SERVICOS LTDA";
const CARGO_ID = "99999999-9999-4999-8999-999999999999";

/** O banco que só ANOTA: devolve as respostas na ordem e guarda a instrução compilada. */
function bancoQueAnota(respostas: unknown[][]) {
  const fila = [...respostas];
  const instrucoes: { sql: string; params: unknown[] }[] = [];
  const db = {
    execute: (consulta: unknown) => {
      const c = dialeto.sqlToQuery(consulta as never);
      instrucoes.push({ sql: c.sql, params: c.params });
      return Promise.resolve(fila.shift() ?? []);
    },
  };
  return { db: db as never, instrucoes };
}

/** A linha do espelho como o banco a devolve, agora com as cinco colunas do pré-preenchimento. */
const linhaDoBanco = (over: Record<string, unknown> = {}) => ({
  codigo_externo: "900001",
  nome_cliente: NOME,
  cod_cliente: COD,
  confirmado: true,
  codigo_no_catalogo: COD,
  natureza_planilha: "EFETIVA",
  linha_servico_id_planilha: 3,
  cargo_id_planilha: CARGO_ID,
  data_abertura_planilha: "2026-02-01",
  data_limite_planilha: "2026-03-15",
  ...over,
});

const semPrePreenchimento = {
  natureza_planilha: null,
  linha_servico_id_planilha: null,
  cargo_id_planilha: null,
  data_abertura_planilha: null,
  data_limite_planilha: null,
};

const updates = (instrucoes: { sql: string; params: unknown[] }[]) =>
  instrucoes.filter((i) => /^\s*update/i.test(i.sql));

/** O `update` do PRÉ-PREENCHIMENTO, distinguido do da proposta pela coluna que só ele escreve. */
const oDoPrePreenchimento = (instrucoes: { sql: string; params: unknown[] }[]) =>
  updates(instrucoes).find((i) => /natureza_origem/.test(i.sql));

/** O recorte do `set` até o `where`: é ali que `coluna =` significa ESCRITA, e não filtro. */
const setDoUpdate = (texto: string) => /set([\s\S]*?)\bwhere\b/i.exec(texto)?.[1] ?? "";

async function rodar(respostas: unknown[][], chaves?: { idVacancy: number; reference: string | null }) {
  const { db, instrucoes } = bancoQueAnota(respostas);
  await new IngestaoDeParaCliente(db).resolverERegistrar(
    VAGA_ID,
    chaves ?? { idVacancy: 900001, reference: null },
    novoResumo(),
  );
  return instrucoes;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. AS DUAS TRAVAS INVIOLÁVEIS
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("as duas travas do pré-preenchimento, e as duas moram na INSTRUÇÃO", () => {
  it("NÃO empurra `atualizado_em`: ele é o relógio do expurgo de quem está dentro da vaga", async () => {
    /*
     * MUTANTE QUE ISTO MATA: `atualizado_em = now()` acrescentado "para a linha ficar carimbada". É a
     * trava do DIARIO, aplicada à coluna que decide por quanto tempo o CPF, o e-mail, o telefone e o
     * nascimento de quem está dentro da vaga continuam guardados. A varredura roda 48 vezes por dia
     * sobre 470 vagas: ninguém nunca mais seria expurgado, e nada ficaria vermelho.
     */
    const instrucoes = await rodar([[linhaDoBanco()]]);

    for (const i of updates(instrucoes)) {
      expect(i.sql, "uma escrita desta volta empurrou `atualizado_em`").not.toContain(
        "atualizado_em",
      );
    }
  });

  it("só escreve onde a coluna está NULA: `coalesce` no `set` e `is null` no `where`", async () => {
    /*
     * ┌─ O DEFEITO QUE ISTO IMPEDE É DESTRUTIVO E SILENCIOSO ────────────────────────────────────┐
     * │ Medido: 9 vagas já têm natureza, 7 linha de serviço, 94 cargo. Sem o `coalesce`, a         │
     * │ varredura reescreveria o que uma PESSOA digitou, de 30 em 30 minutos, com o valor de uma    │
     * │ planilha que ela pode ter corrigido justamente por estar errada. E o conserto NÃO pode ser  │
     * │ um `if` em TypeScript: entre a leitura e a escrita cabe o salvamento de outra pessoa, e um  │
     * │ `if` se perde numa refatoração (é o argumento da §A.33 sobre o fallback removido).          │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: `set natureza = $1` sem o `coalesce`.
     */
    const instrucoes = await rodar([[linhaDoBanco()]]);
    const pre = oDoPrePreenchimento(instrucoes);
    expect(pre, "o pré-preenchimento não foi escrito").toBeDefined();
    const texto = pre?.sql ?? "";
    const atribuicoes = setDoUpdate(texto);

    for (const coluna of [
      "natureza",
      "linha_servico_id",
      "cargo_id",
      "data_abertura",
      "data_limite",
    ]) {
      expect(atribuicoes, `${coluna} é escrita sem proteger o valor humano`).toContain(
        `coalesce(${coluna},`,
      );
      expect(texto, `o \`where\` não exige ${coluna} nula`).toMatch(
        new RegExp(`${coluna}\\s+is null`),
      );
    }
  });

  it("a procedência é carimbada SÓ no campo que acabou de ser preenchido", async () => {
    /*
     * O `case when <coluna> is null and <valor> is not null` é o que amarra o carimbo ao mesmo fato
     * que preencheu o campo. Fora dessa condição, a procedência passaria a afirmar "veio da planilha"
     * sobre um valor DIGITADO por uma pessoa, e a pergunta que a coluna existe para responder ("quantas
     * vagas herdaram o erro daquela linha?") passaria a contar gente junto.
     */
    const instrucoes = await rodar([[linhaDoBanco()]]);
    const texto = oDoPrePreenchimento(instrucoes)?.sql ?? "";

    for (const coluna of [
      "natureza_origem",
      "linha_servico_origem",
      "cargo_origem",
      "data_abertura_origem",
      "data_limite_origem",
    ]) {
      expect(setDoUpdate(texto), `${coluna} não é carimbada`).toContain(`${coluna} = case`);
    }
    /* O valor é o do vocabulário fechado do CHECK, e vem do domínio, não de um literal digitado. */
    expect(oDoPrePreenchimento(instrucoes)?.params).toContain(PROCEDENCIA_DA_PLANILHA);
    expect(PROCEDENCIA_DA_PLANILHA).toBe("PLANILHA");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. PRÉ-PREENCHER NÃO É LIBERAR
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("pré-preencher NÃO é liberar, e a vaga continua em REVISÃO", () => {
  it("nenhuma escrita toca status, papel, encerramento ou recusa", async () => {
    /*
     * ┌─ A LINHA QUE NÃO SE CRUZA ──────────────────────────────────────────────────────────────┐
     * │ Encher os obrigatórios é ÚTIL e é o pedido; avançar a vaga é DECISÃO DE GENTE, com autor,  │
     * │ data e trilha. A derivação de status lê o FUNIL (presença de candidato) e o carimbo manual, │
     * │ nunca a completude do formulário, então preencher não avança nada por si. Esta asserção é a │
     * │ fechadura: ela proíbe o caminho de escrita, em vez de confiar na derivação.                 │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const instrucoes = await rodar([[linhaDoBanco()]]);

    for (const i of updates(instrucoes)) {
      const atribuicoes = setDoUpdate(i.sql);
      for (const proibida of [
        "status",
        "status_manual_em",
        "encerrada_em",
        "recusada_em",
        "cod_cliente",
      ]) {
        expect(
          atribuicoes.match(new RegExp(`\\b${proibida}\\s*=[^=]`)) ?? [],
          `o pré-preenchimento escreveu ${proibida}`,
        ).toEqual([]);
      }
    }
  });

  it("escreve as CINCO colunas do pré-preenchimento e as CINCO procedências, e mais nenhuma", async () => {
    /*
     * A LISTA FECHADA, pelo lado positivo. Sem ela, a forma mais fácil de ficar verde no teste acima
     * seria não escrever nada, e a frente nasceria inerte sem ninguém notar.
     */
    const atribuicoes = setDoUpdate(oDoPrePreenchimento(await rodar([[linhaDoBanco()]]))?.sql ?? "");
    const colunasEscritas = [...atribuicoes.matchAll(/(\w+)\s*=/g)]
      .map((m) => m[1] as string)
      .filter((c) => c !== "when" && c !== "then" && c !== "else");

    expect([...new Set(colunasEscritas)].sort()).toEqual(
      [
        "cargo_id",
        "cargo_origem",
        "data_abertura",
        "data_abertura_origem",
        "data_limite",
        "data_limite_origem",
        "linha_servico_id",
        "linha_servico_origem",
        "natureza",
        "natureza_origem",
      ].sort(),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. A INDEPENDÊNCIA DA PROPOSTA DE CLIENTE
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("o pré-preenchimento é INDEPENDENTE da proposta de cliente", () => {
  it("a proposta de cliente AMBÍGUA não impede o pré-preenchimento", async () => {
    /*
     * ┌─ ABSTENÇÃO POR CAMPO, APLICADA AO CAMINHO DE ESCRITA ───────────────────────────────────┐
     * │ Duas chaves apontando para clientes diferentes faz a proposta de cliente sair como         │
     * │ `NENHUMA` e a antiga ser LIMPA. Isso é sobre o CLIENTE: a célula de atendimento, o cargo e  │
     * │ as datas daquele código continuam valendo, e withhold-las seria transformar a abstenção por │
     * │ campo em abstenção por linha, que é exatamente o que a régua proíbe.                        │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * MUTANTE QUE ISTO MATA: pendurar o pré-preenchimento no `update` da proposta, depois dos
     * `return` dos caminhos de saída dela.
     */
    const instrucoes = await rodar(
      [
        [
          linhaDoBanco(),
          linhaDoBanco({
            codigo_externo: "900001",
            nome_cliente: "BETA LOGISTICA SA",
            cod_cliente: "CLI-TESTE-2",
            codigo_no_catalogo: "CLI-TESTE-2",
          }),
        ],
      ],
      { idVacancy: 900001, reference: null },
    );

    expect(oDoPrePreenchimento(instrucoes), "a ambiguidade de cliente apagou o resto").toBeDefined();
  });

  it("a proposta de cliente INALTERADA (regime estável) não impede o pré-preenchimento", async () => {
    /*
     * ┌─ A RAZÃO MAIS CONCRETA DE AS DUAS ESCRITAS SEREM SEPARADAS ─────────────────────────────┐
     * │ O `update` da proposta é condicional ao CLIENTE ter mudado (`is distinct from`), e em regime │
     * │ estável ele NÃO RODA: 470 vagas com a mesma proposta de ontem produzem zero escrita, por     │
     * │ desenho. Pendurar o pré-preenchimento nele faria a frente NUNCA preencher nada a partir da   │
     * │ segunda volta, isto é nascer inerte, e o sintoma seria "funcionou no teste e não em produção".│
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * O banco fingido não avalia o `where`, então o que se assere é a EXISTÊNCIA da instrução
     * separada: ela é mandada mesmo quando a da proposta não teria efeito.
     */
    const instrucoes = await rodar([[linhaDoBanco()]]);

    const pre = oDoPrePreenchimento(instrucoes);
    const daProposta = updates(instrucoes).find((i) => /cliente_proposto_nome\s*=/.test(i.sql));
    expect(pre, "o pré-preenchimento não é instrução própria").toBeDefined();
    expect(daProposta, "a proposta deixou de ser escrita").toBeDefined();
    expect(pre?.sql, "as duas escritas voltaram a ser a mesma instrução").not.toContain(
      "cliente_proposto",
    );
  });

  it("a planilha não tem a vaga: LIMPA a proposta e NÃO escreve pré-preenchimento", async () => {
    /*
     * Sem linha no espelho não há o que pré-preencher, então a instrução não é nem montada. E a
     * limpeza da proposta NÃO apaga os cinco campos da vaga: a linha da planilha ter sumido não é
     * motivo para apagar o cargo que a vaga já tem (seria destruir dado por ausência de informação).
     */
    const instrucoes = await rodar([[]]);

    expect(oDoPrePreenchimento(instrucoes)).toBeUndefined();
    const limpeza = updates(instrucoes)[0];
    const atribuicoes = setDoUpdate(limpeza?.sql ?? "");
    for (const coluna of ["natureza", "cargo_id", "linha_servico_id", "data_abertura"]) {
      expect(atribuicoes, `a limpeza da proposta apagou ${coluna}`).not.toContain(`${coluna} =`);
    }
  });

  it("a CONSULTA que falha não escreve nada, nem a proposta nem o pré-preenchimento", async () => {
    const instrucoes: string[] = [];
    const db = {
      execute: (q: unknown) => {
        instrucoes.push(dialeto.sqlToQuery(q as never).sql);
        return Promise.reject(new Error("22P02 com o valor dentro do detail"));
      },
    } as never;

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      novoResumo(),
    );

    expect(instrucoes.filter((s) => /^\s*update/i.test(s))).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. NADA A PREENCHER, E A PRECEDÊNCIA DAS CHAVES
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("nada a preencher não manda instrução, e a chave que vale é a mesma da proposta", () => {
  it("espelho SEM pré-preenchimento: nenhuma instrução de pré-preenchimento é mandada", async () => {
    /*
     * É O ESTADO DE HOJE EM PRODUÇÃO, antes da primeira sincronização com as colunas novas: as cinco
     * colunas do espelho nascem nulas. Mandar um `update` com cinco nulos não faria dano (o `where`
     * recusa), mas gastaria 470 instruções por volta e, pior, apareceria no log de consulta lenta como
     * se a frente estivesse trabalhando.
     */
    const instrucoes = await rodar([[linhaDoBanco(semPrePreenchimento)]]);

    expect(oDoPrePreenchimento(instrucoes)).toBeUndefined();
    /* E a proposta de cliente continua sendo escrita: uma coisa não depende da outra. */
    expect(updates(instrucoes).find((i) => /cliente_proposto_nome\s*=/.test(i.sql))).toBeDefined();
  });

  it("UM campo só: a instrução sai, e os outros quatro entram como nulo (não são escritos)", async () => {
    /*
     * A abstenção por campo chegando ao banco: o `coalesce(cargo_id, null)` devolve o valor atual, e
     * o `case` não carimba procedência nenhuma, porque a condição exige valor não nulo. Nada é
     * apagado por estar vazio.
     */
    const instrucoes = await rodar([
      [linhaDoBanco({ ...semPrePreenchimento, linha_servico_id_planilha: 3 })],
    ]);

    const pre = oDoPrePreenchimento(instrucoes);
    expect(pre, "o único campo disponível não foi escrito").toBeDefined();
    expect(pre?.params).toContain(3);
  });

  it("`IdVacancy` GANHA da `reference`, a mesma precedência da proposta de cliente", async () => {
    /*
     * A `reference` casa por CADEIA DE REABERTURA, que é inferência mais fraca. A régua precisa ser a
     * MESMA da proposta de cliente, senão a vaga receberia o cliente de um código e o cargo de outro,
     * e a linha ficaria montada de pedaços de duas vagas diferentes.
     */
    const OUTRO_CARGO = "88888888-8888-4888-8888-888888888888";
    const instrucoes = await rodar(
      [
        [
          linhaDoBanco({ codigo_externo: "900002", cargo_id_planilha: OUTRO_CARGO }),
          linhaDoBanco({ codigo_externo: "900001", cargo_id_planilha: CARGO_ID }),
        ],
      ],
      { idVacancy: 900001, reference: "900002" },
    );

    const params = oDoPrePreenchimento(instrucoes)?.params ?? [];
    expect(params, "o pré-preenchimento veio da chave mais fraca").toContain(CARGO_ID);
    expect(params).not.toContain(OUTRO_CARGO);
  });
});
