import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { DeParaClienteService } from "./depara-cliente.service";
import { FalhaDaPlanilhaViva } from "./planilha-viva.service";
import { CABECALHOS_DA_PLANILHA_DE_CLIENTE } from "../../domain/as-planilha-cliente-colunas";

/**
 * ─ A SINCRONIZAÇÃO DA PLANILHA COM O CATÁLOGO: O QUE ELA PODE E O QUE ELA NUNCA PODE ───────────
 *
 * ┌─ AS TRÊS REGRAS DE ESCRITA, E AS TRÊS SÃO SOBRE NÃO DESFAZER DECISÃO DE GENTE ──────────────┐
 * │ 1. falha de leitura NÃO apaga, NÃO desliga e NÃO invalida nada: planilha ilegível hoje não    │
 * │    pode destruir a proposta de ontem;                                                         │
 * │ 2. ela NUNCA religa linha desligada, porque `ativo = true` é gesto humano e uma sincronização  │
 * │    que religasse desfaria a decisão do diretor de 30 em 30 minutos;                           │
 * │ 3. ela NUNCA toca linha confirmada, porque o vínculo que uma pessoa carimbou não é recalculado │
 * │    pelo palpite da fábrica. A exceção é o NOME mudar na planilha, e aí a confirmação CAI.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM POSTGRES, E ISSO ESTÁ DECLARADO: o que se mede é a INSTRUÇÃO que o driver receberia, compilada
 * com o `PgDialect` real (mesmo molde do `ingestao-bind-array.backend.spec.ts`). O efeito no banco
 * não é afirmado aqui, e nenhuma asserção deste arquivo depende de ele ter acontecido.
 *
 * §A.6: todo dado é SINTÉTICO. Nomes de empresa inventados, códigos `CLI-TESTE-n`, chaves na faixa
 * 9xxxxx. Nenhum CPF, nenhum nome de pessoa, nenhum salário, nada da planilha real.
 */

const dialeto = new PgDialect();

const CATALOGO = [
  { cod_cliente: "CLI-TESTE-1", razao_social: "ALFA SERVICOS LTDA", nome_operacao: null },
  { cod_cliente: "CLI-TESTE-2", razao_social: "BETA LOGISTICA SA", nome_operacao: "BETAO" },
];

/** O banco fingido: responde por FORMA da consulta e anota tudo que foi mandado executar. */
function bancoFingido(existentes: Record<string, unknown>[] = []) {
  const instrucoes: { sql: string; params: unknown[] }[] = [];
  const db = {
    execute: (consulta: unknown) => {
      const c = dialeto.sqlToQuery(consulta as never);
      instrucoes.push({ sql: c.sql, params: c.params });
      if (/from\s+clientes/i.test(c.sql)) return Promise.resolve(CATALOGO);
      if (/from\s+"?as_depara_cliente_vaga"?/i.test(c.sql)) return Promise.resolve(existentes);
      return Promise.resolve([]);
    },
  };
  return { db: db as never, instrucoes };
}

/** A planilha fingida, no formato que a borda HTTP devolve depois de peneirar. */
function planilhaFingida(
  linhas: { codigo: string | null; cliente: string | null; status?: string | null }[],
) {
  return {
    estaAtiva: () => true,
    ler: () =>
      Promise.resolve({
        totalLinhas: linhas.length,
        linhas: linhas.map((l) => ({ codigo: l.codigo, cliente: l.cliente, cargo: null, status: l.status ?? null })),
      }),
  } as never;
}

const linhaExistente = (over: Record<string, unknown> = {}) => ({
  id: 7,
  codigo_externo: "900001",
  nome_cliente: "ALFA SERVICOS LTDA",
  cod_cliente: "CLI-TESTE-1",
  casamento: "EXATO",
  confirmado: false,
  ativo: true,
  ...over,
});

const escritas = (instrucoes: { sql: string; params: unknown[] }[]) =>
  instrucoes.filter((i) => /^\s*(insert|update)/i.test(i.sql));

describe("a leitura que falha não escreve NADA, em nenhuma das três famílias", () => {
  it.each([["TRANSITORIA"], ["DEFINITIVA"], ["INALCANCAVEL"]] as const)(
    "falha %s: zero escrita, e o resumo diz qual foi",
    async (familia) => {
      /*
       * ┌─ O REQUISITO DO COORDENADOR, NA LETRA ────────────────────────────────────────────────┐
       * │ 422 (cabeçalho faltando) e 413 (planilha acima do teto) são falhas de CICLO que não     │
       * │ podem apagar nem invalidar o de/para já gravado. O defeito que isto impede é o pior     │
       * │ possível: uma coluna renomeada na planilha derrubaria as 312 traduções de uma vez, e o  │
       * │ sintoma seria a tela de revisão esvaziar sem nenhum alarme.                             │
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       */
      const { db, instrucoes } = bancoFingido([linhaExistente()]);
      const planilha = {
        estaAtiva: () => true,
        ler: () => Promise.reject(new FalhaDaPlanilhaViva(familia, "recusada")),
      } as never;

      const resumo = await new DeParaClienteService(db, planilha).sincronizar();

      expect(resumo.falha).toBe(familia);
      expect(escritas(instrucoes), "a falha de leitura escreveu no catálogo").toEqual([]);
      expect(resumo.linhasCriadas).toBe(0);
      expect(resumo.linhasDesligadasPorAmbiguidade).toBe(0);
    },
  );

  it("sem a variável de ambiente, nasce INERTE: não lê e não escreve", async () => {
    /*
     * §A.5: sem insumo, a porta nasce fechada, e sem hardcode. Um identificador de planilha fixo no
     * código faria a sincronização apontar para a planilha errada por um valor esquecido num commit,
     * e faria a homologação ler dado de produção.
     */
    const { db, instrucoes } = bancoFingido();
    let leu = false;
    const planilha = {
      estaAtiva: () => false,
      ler: () => {
        leu = true;
        return Promise.reject(new Error("não deveria ter lido"));
      },
    } as never;

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(leu, "a sincronização inerte foi buscar a planilha").toBe(false);
    expect(instrucoes, "a sincronização inerte tocou o banco").toEqual([]);
    expect(resumo.falha).toBe("DEFINITIVA");
  });
});

describe("o que a sincronização PROPÕE, e o que ela nunca desfaz", () => {
  it("chave nova com nome que casa EXATO: cria a linha com o palpite, NÃO confirmada", async () => {
    const { db, instrucoes } = bancoFingido([]);
    const planilha = planilhaFingida([{ codigo: "900001", cliente: "Alfa Serviços Ltda" }]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo.linhasCriadas).toBe(1);
    expect(resumo.palpitesExatos).toBe(1);
    const insert = escritas(instrucoes)[0];
    expect(insert?.sql ?? "").toMatch(/insert into as_depara_cliente_vaga/i);
    expect(insert?.params).toContain("CLI-TESTE-1");
    /*
     * A CONDIÇÃO C1 DA AUDITORIA: o palpite da fábrica NUNCA nasce confirmado. O insert não nomeia
     * `confirmado_em`, então o carimbo fica nulo, que é a verdade: ninguém conferiu.
     */
    expect(insert?.sql ?? "", "o palpite nasceu confirmado").not.toContain("confirmado_em");
  });

  it("o NOME COMERCIAL do catálogo também casa, e não cria ambiguidade com a razão social", async () => {
    /*
     * A CAUSA MEDIDA de só 31 de 164 clientes terem casado está escrita no schema: a base do time usa
     * NOME COMERCIAL contra RAZÃO SOCIAL. As duas entradas do MESMO código não são duas opiniões,
     * porque a ambiguidade é contada por CÓDIGO DISTINTO, nunca por entrada.
     */
    const { db } = bancoFingido([]);
    const planilha = planilhaFingida([{ codigo: "900002", cliente: "BETAO" }]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo.palpitesExatos).toBe(1);
    expect(resumo.semPalpite).toBe(0);
  });

  it("linha CONFIRMADA com o mesmo nome não é tocada, nem para corrigir o palpite", async () => {
    /*
     * MUTANTE QUE ISTO MATA: recalcular o palpite em toda passada "para manter o catálogo em dia".
     * Ele sobrescreveria, de 30 em 30 minutos, o vínculo que uma pessoa escolheu a mão, sem autor e
     * sem data, que é exatamente o defeito que a auditoria do mapa vetou em `vagas.cod_cliente`.
     */
    const { db, instrucoes } = bancoFingido([
      linhaExistente({ confirmado: true, cod_cliente: "CLI-TESTE-2", casamento: null }),
    ]);
    const planilha = planilhaFingida([{ codigo: "900001", cliente: "ALFA SERVICOS LTDA" }]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(escritas(instrucoes), "a sincronização mexeu em linha confirmada").toEqual([]);
    expect(resumo.linhasAtualizadas).toBe(0);
  });

  it("linha PENDENTE com o palpite já igual não escreve: a passada estável é muda", async () => {
    const { db, instrucoes } = bancoFingido([linhaExistente()]);
    const planilha = planilhaFingida([{ codigo: "900001", cliente: "ALFA SERVICOS LTDA" }]);

    await new DeParaClienteService(db, planilha).sincronizar();

    expect(escritas(instrucoes)).toEqual([]);
  });

  it("o NOME mudou na planilha: reabre a curadoria e DERRUBA a confirmação", async () => {
    /*
     * ┌─ POR QUE A CONFIRMAÇÃO CAI, E ISSO NÃO É PERDER TRABALHO ────────────────────────────────┐
     * │ A confirmação era sobre OUTRO cliente. Mantê-la faria a tela afirmar que uma pessoa        │
     * │ confirmou um vínculo que ela nunca viu, e o de/para passaria a propor o cliente ANTIGO     │
     * │ para a vaga que mudou de dono na planilha, com cara de dado conferido.                     │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { db, instrucoes } = bancoFingido([linhaExistente({ confirmado: true })]);
    const planilha = planilhaFingida([{ codigo: "900001", cliente: "BETA LOGISTICA SA" }]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo.confirmacoesDesfeitasPorTrocaDeNome).toBe(1);
    const update = escritas(instrucoes)[0]?.sql ?? "";
    expect(update).toContain("confirmado_em = null");
    expect(update).toContain("confirmado_por_id = null");
    expect(update, "a reabertura religou a tradução por conta própria").not.toContain("ativo =");
  });

  it("caixa e espaço diferentes NÃO são troca de nome", async () => {
    /*
     * DEFEITO QUE PEGA: a planilha é digitada por várias pessoas. Comparar o nome cru faria toda
     * passada achar que o nome mudou, derrubando a confirmação de todo mundo 48 vezes por dia.
     */
    const { db, instrucoes } = bancoFingido([linhaExistente({ confirmado: true })]);
    const planilha = planilhaFingida([{ codigo: "900001", cliente: "  alfa  serviços ltda " }]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo.confirmacoesDesfeitasPorTrocaDeNome).toBe(0);
    expect(escritas(instrucoes)).toEqual([]);
  });

  it("linha DESLIGADA nunca é religada pela sincronização", async () => {
    /*
     * `ativo = true` É GESTO HUMANO. Uma sincronização que religasse desfaria a decisão do diretor
     * de "pare de confiar nesta tradução" de 30 em 30 minutos, e ele não teria como manter a
     * decisão de pé: o único caminho de volta é a rota de curadoria, com uma pessoa clicando.
     */
    const { db, instrucoes } = bancoFingido([linhaExistente({ ativo: false })]);
    const planilha = planilhaFingida([{ codigo: "900001", cliente: "ALFA SERVICOS LTDA" }]);

    await new DeParaClienteService(db, planilha).sincronizar();

    for (const i of escritas(instrucoes)) {
      expect(i.sql, "a sincronização religou a tradução").not.toMatch(/ativo\s*=\s*true/i);
    }
  });
});

describe("a ambiguidade: abstém-se, conta, e desliga a tradução que virou contraditória", () => {
  it("dois clientes no mesmo código não criam linha nenhuma", async () => {
    /*
     * REGRA 6 DO BRIEFING. Nunca "o último vence", nunca "escolhe um". O zero de ambiguidade medido
     * hoje é FOTOGRAFIA de uma planilha que o time edita durante o dia, e isso foi provado nesta
     * frente: apareceu uma linha nova entre a cópia da manhã e a leitura da tarde.
     */
    const { db, instrucoes } = bancoFingido([]);
    const planilha = planilhaFingida([
      { codigo: "900001", cliente: "ALFA SERVICOS LTDA" },
      { codigo: "900001", cliente: "BETA LOGISTICA SA" },
    ]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo.ambiguos).toBe(1);
    expect(resumo.linhasCriadas).toBe(0);
    expect(escritas(instrucoes)).toEqual([]);
  });

  it("a tradução que JÁ existia e virou ambígua é DESLIGADA, e isso é contado", async () => {
    /*
     * ┌─ O BURACO QUE ISTO FECHA, E ELE NÃO ESTAVA NO BRIEFING ──────────────────────────────────┐
     * │ Abster-se cobre a chave NOVA. Se a chave já tinha linha e a planilha passou a se            │
     * │ contradizer, abster-se em silêncio deixaria a resposta ANTIGA continuar sendo proposta      │
     * │ para sempre, afirmando na tela algo que a fonte já não afirma. Desligar é o fail-closed, e  │
     * │ religar é humano, então a decisão volta para quem tem de olhar a planilha.                  │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { db, instrucoes } = bancoFingido([linhaExistente()]);
    const planilha = planilhaFingida([
      { codigo: "900001", cliente: "ALFA SERVICOS LTDA" },
      { codigo: "900001", cliente: "BETA LOGISTICA SA" },
    ]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo.linhasDesligadasPorAmbiguidade).toBe(1);
    const update = escritas(instrucoes)[0]?.sql ?? "";
    expect(update).toMatch(/ativo\s*=\s*\$?\d*false|ativo = false/i);
    expect(update).toContain("'AMBIGUO'");
  });
});

describe("o que a planilha recusa é CONTADO, e cada classe tem o seu contador", () => {
  it("malformado, família interna do EA e vazio são contados separadamente", async () => {
    /*
     * BLOQUEIO 3 DA AUDITORIA, e os três são AÇÕES diferentes: malformado é linha para o time
     * consertar na planilha; `SL...` é vaga do EA que nunca vai casar e não é erro de ninguém; vazio
     * é o normal de 868 linhas medidas. Um contador só junta as três e não aciona nenhuma.
     */
    const { db } = bancoFingido([]);
    const planilha = planilhaFingida([
      { codigo: "Vaga interna", cliente: "ALFA SERVICOS LTDA" },
      { codigo: "#N/D", cliente: "ALFA SERVICOS LTDA" },
      { codigo: "SL00000049", cliente: "ALFA SERVICOS LTDA" },
      { codigo: null, cliente: "ALFA SERVICOS LTDA" },
      { codigo: "900001", cliente: "ALFA SERVICOS LTDA" },
    ]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(resumo).toMatchObject({
      malformados: 2,
      codigosInternos: 1,
      vazios: 1,
      chaves: 1,
    });
  });

  it("o resumo NÃO carrega nenhum valor cru da planilha", async () => {
    /*
     * §A.6. A coluna é TEXTO LIVRE digitado por gente, e nesta casa texto livre de ATS JÁ CHEGOU COM
     * NOME DE PESSOA DENTRO (achado R1 do `seguranca`). Este resumo é devolvido por rota E vai para
     * o log, que é permanente e está fora do alcance do `aplicarRetencao`.
     */
    const CANARIO = "CANARIO-NAO-PODE-SAIR-9z9z9z";
    const { db } = bancoFingido([]);
    const planilha = planilhaFingida([
      { codigo: `Vaga interna ${CANARIO}`, cliente: `ALFA ${CANARIO}` },
      { codigo: "900001", cliente: `ALFA SERVICOS LTDA ${CANARIO}` },
    ]);

    const resumo = await new DeParaClienteService(db, planilha).sincronizar();

    expect(JSON.stringify(resumo)).not.toContain(CANARIO);
    for (const [campo, valor] of Object.entries(resumo)) {
      if (campo === "falha") continue;
      expect(typeof valor, `o resumo tem campo não numérico: ${campo}`).toBe("number");
    }
  });

  it("a planilha NÃO é copiada para o catálogo além do código, do nome do cliente e do STATUS (F2)", async () => {
    /*
     * ┌─ O QUE É COPIADO, E O QUE NÃO É (atualizado na F2, 06/10/2026) ──────────────────────────┐
     * │ Guardar coluna da planilha criaria CÓPIA de dado fora do alcance do expurgo, e a planilha   │
     * │ tem salário, consultor e nome de candidato aprovado. O CARGO continua morrendo aqui (frente │
     * │ própria por decisão do diretor, texto livre).                                              │
     * │                                                                                            │
     * │ O STATUS MUDOU DE LADO: a F2 passou a gravá-lo em `status_planilha`, mas como TOKEN         │
     * │ CANÔNICO FECHADO (ABERTO/ENTREGUE/FECHADO/CANCELADO/OUTRO), não como texto cru. Status é    │
     * │ ciclo de vida da vaga, NÃO dado pessoal (§A.6), e é o ESPELHO que o gate de entrada e a fila │
     * │ de revisão leem. Então a coluna `status_planilha` É esperada no insert; o que não pode é o   │
     * │ CABEÇALHO/texto cru da planilha chegar ao banco.                                            │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { db, instrucoes } = bancoFingido([]);
    const planilha = planilhaFingida([{ codigo: "900001", cliente: "ALFA SERVICOS LTDA" }]);

    await new DeParaClienteService(db, planilha).sincronizar();

    const insert = escritas(instrucoes)[0]?.sql ?? "";
    /* O CARGO continua fora, e o cabeçalho real da planilha nunca vira coluna de banco. */
    expect(insert, "a sincronização copiou a coluna cargo da planilha").not.toContain("cargo");
    expect(insert).not.toContain(CABECALHOS_DA_PLANILHA_DE_CLIENTE.cargo);
    expect(insert).not.toContain(CABECALHOS_DA_PLANILHA_DE_CLIENTE.status);
    /* O STATUS da vaga, agora SIM, como coluna canônica do espelho (F2). */
    expect(insert, "a F2 passou a gravar o status canônico da vaga no espelho").toContain(
      "status_planilha",
    );
  });

  it("grava o STATUS CANÔNICO (não o texto cru): 'Aberto' vira 'ABERTO' no insert da linha nova (F2)", async () => {
    const { db, instrucoes } = bancoFingido([]);
    const planilha = planilhaFingida([
      { codigo: "900001", cliente: "ALFA SERVICOS LTDA", status: "Aberto" },
    ]);

    await new DeParaClienteService(db, planilha).sincronizar();

    const insert = escritas(instrucoes)[0];
    expect(insert?.sql ?? "").toContain("status_planilha");
    expect(insert?.params, "o token canônico ABERTO foi gravado").toContain("ABERTO");
    expect(insert?.params, "o texto cru da planilha não é gravado").not.toContain("Aberto");
  });

  it("refresca o STATUS de linha JÁ EXISTENTE quando ele muda, sem reabrir curadoria (F2)", async () => {
    const { db, instrucoes } = bancoFingido([
      linhaExistente({ confirmado: true, cod_cliente: "CLI-TESTE-1", status_planilha: "ABERTO" }),
    ]);
    const planilha = planilhaFingida([
      { codigo: "900001", cliente: "ALFA SERVICOS LTDA", status: "Fechado" },
    ]);

    await new DeParaClienteService(db, planilha).sincronizar();

    const updates = escritas(instrucoes);
    expect(updates.length, "só a atualização do status, sem tocar a curadoria confirmada").toBe(1);
    const u = updates[0];
    expect(u.sql).toContain("status_planilha");
    expect(u.sql, "não reabre curadoria de cliente").not.toContain("confirmado_em = null");
    expect(u.params, "o novo status canônico FECHADO foi gravado").toContain("FECHADO");
  });

  it("passada ESTÁVEL de status é MUDA: status igual não escreve (F2)", async () => {
    const { db, instrucoes } = bancoFingido([
      linhaExistente({ status_planilha: "ABERTO" }),
    ]);
    const planilha = planilhaFingida([
      { codigo: "900001", cliente: "ALFA SERVICOS LTDA", status: "aberto" },
    ]);

    await new DeParaClienteService(db, planilha).sincronizar();

    expect(escritas(instrucoes), "status igual e palpite igual: nada a escrever").toEqual([]);
  });
});
