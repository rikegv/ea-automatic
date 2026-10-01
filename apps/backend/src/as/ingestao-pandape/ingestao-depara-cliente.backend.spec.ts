import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { EstadoDaPropostaDeCliente, OrigemDaPropostaDeCliente } from "@ea/shared-types";
import { IngestaoDeParaCliente } from "./ingestao-depara-cliente.service";
import { novoResumo } from "./ingestao-ciclo";

/**
 * ─ O ÚNICO ESCRITOR DA PROPOSTA, MEDIDO PELA INSTRUÇÃO QUE ELE MANDA AO DRIVER ─────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO MEDE A INSTRUÇÃO, E NÃO O EFEITO ──────────────────────────────────────┐
 * │ Ele não tem Postgres, e isso está DECLARADO: a suíte da ingestão inteira mede sentido contra  │
 * │ banco fingido. O que se afirma aqui é o que o DRIVER RECEBE, compilado com o `PgDialect` real, │
 * │ que é o mesmo molde do `ingestao-bind-array.backend.spec.ts` (aquele arquivo existe porque     │
 * │ 3.680 testes verdes conviveram com a instrução CENTRAL de uma frente sendo inexecutável).      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS DUAS COISAS QUE ESTE ARQUIVO PROVA, e as duas são irreversíveis se quebrarem:
 *  1. a escrita NÃO TOCA `cod_cliente`: aquele valor desce para a pré-admissão e decide a régua
 *     documental e a pasta do prontuário no Drive, e arquivamento no Drive não se desfaz (§A.33);
 *  2. a escrita NÃO TOCA `atualizado_em`: aquele carimbo é o RELÓGIO DO EXPURGO de quem está dentro
 *     da vaga, e empurrá-lo 48 vezes por dia renovaria a retenção de todo mundo, sem nada falhar.
 *
 * §A.6: todo dado aqui é SINTÉTICO. Códigos de vaga na faixa 9xxxxx, clientes `CLI-TESTE-n`, razão
 * social inventada. Nenhum CPF, nenhum nome de pessoa, nenhum salário.
 */

/**
 * O VOCABULÁRIO COMPARTILHADO, CONSUMIDO PELO TIPO E NÃO PELO VALOR.
 *
 * ┌─ POR QUE NÃO SE IMPORTA A CONSTANTE ─────────────────────────────────────────────────────────┐
 * │ `const` NOVA do `@ea/shared-types` chega `undefined` em tempo de execução até o pacote ser    │
 * │ construído, e o typecheck passa (o alias resolve o FONTE), então o erro parece bug de lógica. │
 * │ A construção do pacote é passo de PUBLICAÇÃO, coordenado por quem publica.                    │
 * │                                                                                               │
 * │ A LISTA ABAIXO É TIPADA CONTRA O VOCABULÁRIO, e é isso que mantém a trava: acrescentar,        │
 * │ renomear ou remover um valor lá quebra ESTE arquivo no typecheck, sem depender de build.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const ORIGENS: readonly OrigemDaPropostaDeCliente[] = ["PLANILHA_ID_VAGA", "PLANILHA_REQUISICAO"];
const ESTADO_AO_NASCER: EstadoDaPropostaDeCliente = "PROPOSTO";

const dialeto = new PgDialect();
const VAGA_ID = "11111111-1111-4111-8111-111111111111";
const COD = "CLI-TESTE-1";
const NOME = "ALFA SERVICOS LTDA";

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

/** A linha do de/para como o banco a devolve, com o código já conferido contra o catálogo. */
const linhaDoBanco = (over: Record<string, unknown> = {}) => ({
  codigo_externo: "900001",
  nome_cliente: NOME,
  cod_cliente: COD,
  confirmado: true,
  codigo_no_catalogo: COD,
  ...over,
});

const escritas = (instrucoes: { sql: string; params: unknown[] }[]) =>
  instrucoes.filter((i) => /^\s*update/i.test(i.sql));

describe("a proposta é escrita em colunas próprias, e NUNCA em `cod_cliente`", () => {
  it("o `update` nomeia as quatro colunas da proposta e mais nenhuma", async () => {
    /*
     * ┌─ O MUTANTE QUE ISTO MATA, E ELE É O CONSERTO ÓBVIO ────────────────────────────────────┐
     * │ Acrescentar `cod_cliente = ${...}` a esta escrita. Ela roda de 30 em 30 minutos, para as │
     * │ 470 vagas abertas, então o cliente que uma pessoa conferiu na liberação passaria a ser   │
     * │ reescrito 48 vezes por dia, sem autor, sem data e sem trilha. A auditoria do mapa mediu  │
     * │ esse caminho e o VETOU; aqui ele fica travado por teste, e não por lembrança.            │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { db, instrucoes } = bancoQueAnota([[linhaDoBanco()]]);
    const resumo = novoResumo();

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      resumo,
    );

    const update = escritas(instrucoes);
    expect(update, "a proposta não foi gravada").toHaveLength(1);
    const texto = update[0]?.sql ?? "";
    for (const coluna of [
      "cliente_proposto",
      "cliente_proposto_nome",
      "cliente_proposto_origem",
      "cliente_proposto_estado",
    ]) {
      expect(texto, `a escrita deixou de gravar ${coluna}`).toContain(coluna);
    }
    /*
     * A BUSCA É PELA ATRIBUIÇÃO (`coluna = `), e não pelo nome: `cod_cliente` aparece na CONSULTA de
     * leitura (é a coluna do de/para e a do catálogo), e tem de continuar aparecendo lá. O que não
     * pode existir é a ESCRITA dela, e é o `=` que distingue as duas coisas.
     */
    expect(texto.match(/\bcod_cliente\s*=/g) ?? [], "a proposta escreveu `cod_cliente`").toEqual([]);
  });

  it("o `update` NÃO empurra `atualizado_em`, que é o relógio do expurgo", async () => {
    /*
     * MUTANTE QUE ISTO MATA: `atualizado_em = now()` acrescentado "para a linha ficar carimbada". É
     * a trava do DIARIO, aplicada à coluna que decide por quanto tempo o CPF, o e-mail, o telefone e
     * o nascimento de quem está dentro da vaga continuam guardados.
     */
    const { db, instrucoes } = bancoQueAnota([[linhaDoBanco()]]);

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      novoResumo(),
    );

    for (const i of escritas(instrucoes)) {
      expect(i.sql, "a escrita da proposta empurrou `atualizado_em`").not.toContain("atualizado_em");
    }
  });

  it("a escrita é CONDICIONAL: a volta que não muda nada não escreve nada", async () => {
    /*
     * DEFEITO QUE PEGA: 470 escritas a cada 30 minutos sobre linhas idênticas. Além do desperdício,
     * é por aqui que o estado `CONFIRMADO` seria revertido a `PROPOSTO` 48 vezes por dia, apagando
     * o registro de que uma PESSOA aceitou aquela proposta.
     */
    const { db, instrucoes } = bancoQueAnota([[linhaDoBanco()]]);

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      novoResumo(),
    );

    expect(escritas(instrucoes)[0]?.sql ?? "").toContain("is distinct from");
  });

  it("o estado gravado é `PROPOSTO`, do vocabulário compartilhado, e nunca `CONFIRMADO`", async () => {
    /*
     * A CONDIÇÃO C1 DA AUDITORIA, APLICADA À COLUNA: proposta nova NUNCA nasce conferida. Nascendo
     * `CONFIRMADO`, a tela a apresentaria como valor já escolhido, quem libera assinaria a escolha da
     * planilha sem conferir, e a trilha passaria a afirmar que uma pessoa escolheu.
     */
    const { db, instrucoes } = bancoQueAnota([[linhaDoBanco()]]);

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      novoResumo(),
    );

    const texto = escritas(instrucoes)[0]?.sql ?? "";
    expect(texto).toContain(`'${ESTADO_AO_NASCER}'`);
    expect(texto, "a ingestão carimbou a proposta como conferida").not.toContain("'CONFIRMADO'");
  });
});

describe("as duas chaves, e o que sobe para o resumo é CONTAGEM", () => {
  it("casou pelo id: conta `comCodigo` e grava a origem do id da vaga", async () => {
    const { db, instrucoes } = bancoQueAnota([[linhaDoBanco()]]);
    const resumo = novoResumo();

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: "900002" },
      resumo,
    );

    expect(resumo.propostasDeClienteComCodigo).toBe(1);
    expect(ORIGENS).toContain("PLANILHA_ID_VAGA");
    expect(escritas(instrucoes)[0]?.params).toContain("PLANILHA_ID_VAGA");
  });

  it("casou pela requisição: a origem registrada é a da cadeia de reabertura", async () => {
    /*
     * POR QUE A ORIGEM VIAJA GRAVADA: a `reference` casa por CADEIA DE REABERTURA e é inferência
     * mais fraca que a direta. Quem for conferir uma proposta errada precisa saber por qual porta
     * ela entrou, e sem isso a investigação começa do zero.
     */
    const { db, instrucoes } = bancoQueAnota([
      [linhaDoBanco({ codigo_externo: "900002" })],
    ]);
    const resumo = novoResumo();

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: "900002" },
      resumo,
    );

    expect(resumo.propostasDeClienteComCodigo).toBe(1);
    expect(escritas(instrucoes)[0]?.params).toContain("PLANILHA_REQUISICAO");
  });

  it("as duas chaves discordando: vale o id da vaga, e a discordância é CONTADA", async () => {
    /*
     * REQUISITO DO BRIEFING, item 3. Hoje a divergência é ZERO em 263 de 263 medidas, e o zero é
     * FOTOGRAFIA de uma planilha que o time edita durante o dia, não invariante: apareceu uma linha
     * nova entre a cópia da manhã e a leitura da tarde.
     *
     * MUTANTE QUE ISTO MATA: descartar a discordância em silêncio, que é o que acontece quando o
     * primeiro `if` que casa ganha e ninguém olha o outro lado.
     */
    const { db, instrucoes } = bancoQueAnota([
      [
        linhaDoBanco(),
        linhaDoBanco({
          codigo_externo: "900002",
          nome_cliente: "BETA LOGISTICA SA",
          cod_cliente: "CLI-TESTE-2",
          codigo_no_catalogo: "CLI-TESTE-2",
        }),
      ],
    ]);
    const resumo = novoResumo();

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: "900002" },
      resumo,
    );

    expect(resumo.chavesDaPlanilhaDiscordantes).toBe(1);
    expect(escritas(instrucoes)[0]?.params, "a proposta não veio da chave primária").toContain(COD);
  });

  it("curadoria NÃO confirmada: grava o NOME, não grava o código, e conta `soNome`", async () => {
    /*
     * É ISSO QUE PRESERVA AS 154 VAGAS que têm nome e não têm código: 59 dos 95 nomes da planilha não
     * existem no catálogo da Admissão, incluindo as 11 variantes de Gerdau, nenhuma cadastrada.
     * Suprimir o nome junto com o código jogaria fora a parte caríssima do trabalho, que é descobrir
     * QUAL cliente é.
     */
    const { db, instrucoes } = bancoQueAnota([[linhaDoBanco({ confirmado: false })]]);
    const resumo = novoResumo();

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      resumo,
    );

    expect(resumo.propostasDeClienteSoNome).toBe(1);
    const params = escritas(instrucoes)[0]?.params ?? [];
    expect(params).toContain(NOME);
    expect(params, "o palpite não confirmado virou código gravado").not.toContain(COD);
  });

  it("código que o catálogo do EA não tem: degrada para só nome, conta, e NÃO lança", async () => {
    /*
     * BLOQUEIO 5 DA AUDITORIA, e o dano do fail-closed ERRADO é perda de INGESTÃO: um `throw` aqui
     * derrubaria a escrita da vaga de 30 em 30 minutos, e a vaga PARARIA DE ENTRAR. A frente de
     * preenchimento viraria perda de entrada, que é muito pior do que não propor.
     */
    const { db } = bancoQueAnota([[linhaDoBanco({ codigo_no_catalogo: null })]]);
    const resumo = novoResumo();

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      resumo,
    );

    expect(resumo.codigosDeClienteForaDoCatalogo).toBe(1);
    expect(resumo.propostasDeClienteSoNome).toBe(1);
    /* AUSENTE É ZERO, e é o que o campo opcional significa: esta volta não propôs com código. */
    expect(resumo.propostasDeClienteComCodigo ?? 0).toBe(0);
  });

  it("a planilha não tem a vaga: LIMPA a proposta antiga e conta", async () => {
    /*
     * POR QUE LIMPAR, e não deixar como estava: a linha pode ter sido corrigida, apagada ou desligada
     * pelo diretor, e uma proposta ERRADA que sobrevive na tela é pior do que proposta nenhuma,
     * porque vem com cara de trabalho feito. O caso perigoso (a leitura falhou) está no teste abaixo.
     */
    const { db, instrucoes } = bancoQueAnota([[]]);
    const resumo = novoResumo();

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      resumo,
    );

    expect(resumo.propostasDeClienteSemLinhaNaPlanilha).toBe(1);
    const texto = escritas(instrucoes)[0]?.sql ?? "";
    expect(texto).toContain("cliente_proposto = null");
    expect(texto, "a limpeza também é condicional").toContain("cliente_proposto_nome is not null");
    expect(texto, "a limpeza tocou o cliente de verdade").not.toMatch(/\bcod_cliente\s*=/);
  });

  it("a CONSULTA que falha não escreve nada, e não apaga a proposta de ontem", async () => {
    /*
     * ┌─ A DISTINÇÃO QUE ESTE TESTE GUARDA, E ELA É A DIFERENÇA ENTRE DUAS AÇÕES OPOSTAS ───────┐
     * │ "A planilha não tem esta vaga" LIMPA a proposta. "O banco não respondeu" NÃO TOCA EM      │
     * │ NADA. Colapsar as duas faria uma indisponibilidade de banco apagar as 312 propostas de    │
     * │ uma vez, e o sintoma seria a tela de revisão esvaziar sem nenhum alarme.                  │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const instrucoes: string[] = [];
    const db = {
      execute: (q: unknown) => {
        instrucoes.push(dialeto.sqlToQuery(q as never).sql);
        return Promise.reject(new Error("22P02 com o valor dentro do detail"));
      },
    } as never;
    const resumo = novoResumo();

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      resumo,
    );

    expect(instrucoes.filter((s) => /^\s*update/i.test(s)), "escreveu com a leitura falhada").toEqual(
      [],
    );
    expect(resumo.propostasDeClienteSemLinhaNaPlanilha ?? 0).toBe(0);
    expect(resumo.erros, "a falha de planilha virou erro de ingestão").toBe(0);
  });

  it("a leitura filtra por `ativo`, que é o gesto do diretor de parar de confiar na tradução", async () => {
    const { db, instrucoes } = bancoQueAnota([[linhaDoBanco()]]);

    await new IngestaoDeParaCliente(db).resolverERegistrar(
      VAGA_ID,
      { idVacancy: 900001, reference: null },
      novoResumo(),
    );

    const leitura = instrucoes[0]?.sql ?? "";
    expect(leitura).toContain("ativo = true");
    expect(leitura, "a leitura não confere o código contra o catálogo").toContain("left join clientes");
  });
});
