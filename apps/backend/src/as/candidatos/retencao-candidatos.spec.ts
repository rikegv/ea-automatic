import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import { RetencaoCandidatosService } from "./retencao-candidatos.service";

/**
 * ─ O EXPURGO DE RETENÇÃO NÃO PODE ALCANÇAR QUEM ESTÁ EM PROCESSO (§A.6, LGPD) ───────────────────
 *
 * O QUE A VARREDURA FAZ: anonimiza o candidato cujas candidaturas estão TODAS encerradas sem êxito
 * há mais de 6 MESES (o prazo era de 2 anos e ENCOLHEU por decisão do diretor). Ela apaga nome, CPF, e-mail, telefone, data de nascimento e o id do ATS, e é
 * IRREVERSÍVEL: não há de onde restaurar o dado depois.
 *
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, e ele é silencioso por natureza. A lista de "quem
 * está em processo vivo" estava DIGITADA À MÃO dentro do SQL, com três valores. Com `ALOCADO` no
 * vocabulário e fora daquela linha, uma pessoa ALOCADA, ocupando posição OFICIAL de uma vaga,
 * contaria como pessoa sem processo vivo e seria anonimizada assim que o prazo vencesse. Nada
 * falharia, nada seria logado além de uma contagem, e o dado não voltaria.
 *
 * POR QUE O TESTE OLHA O SQL, e não o resultado: o filtro inteiro mora DENTRO da consulta, então um
 * fake de banco que devolve linhas prontas passa igual com o filtro certo ou errado, e não trava
 * nada. É o mesmo motivo (e a mesma técnica) do `fopag-cliente-inativo.spec.ts`.
 *
 * E POR QUE ELE APAGA OS COMENTÁRIOS ANTES DE OLHAR: o mesmo tropeço já documentado lá. O comentário
 * que explica a regra fala das mesmas palavras que a regra usa, então procurá-las no texto cru
 * passaria mesmo com a cláusula removida. Aqui só o SQL executável é lido.
 */

/**
 * Reconstrói o texto da consulta a partir dos pedaços do objeto SQL do drizzle.
 *
 * RECURSIVO, e essa é a diferença em relação ao helper do `fopag-cliente-inativo.spec.ts`: um
 * `sql.raw(...)` interpolado dentro do template NÃO vira um pedaço de texto, vira outro objeto SQL
 * ANINHADO, com os pedaços dele por dentro. Uma leitura rasa devolveria a consulta com um buraco
 * exatamente onde mora a lista que este arquivo existe para conferir, e o teste passaria verde
 * afirmando o contrário do que quer afirmar.
 */
function textoDaConsulta(q: unknown): string {
  const no = q as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(no?.queryChunks)) return no.queryChunks.map(textoDaConsulta).join("");
  if (Array.isArray(no?.value)) return no.value.join("");
  return no?.value !== undefined ? String(no.value) : "";
}

/** Só o SQL que o banco executa: linhas de comentário (--) fora, espaços colapsados. */
function sqlExecutavel(q: unknown): string {
  return textoDaConsulta(q)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ");
}

async function rodarVarredura(): Promise<string> {
  const consultas: unknown[] = [];
  const db = {
    execute: (q: unknown) => {
      consultas.push(q);
      return Promise.resolve([]);
    },
  } as never;

  const s = new RetencaoCandidatosService(db);
  await s.expurgar();

  expect(consultas).toHaveLength(1);
  return sqlExecutavel(consultas[0]);
}

describe("expurgo por retenção: quem está em processo VIVO nunca é alcançado", () => {
  /**
   * O TESTE DO ITEM QUE ORIGINOU O ARQUIVO: candidato só-ALOCADO fica fora do expurgo.
   *
   * A afirmação é sobre a CLÁUSULA, e ela é suficiente: o `not exists` recusa qualquer candidato que
   * tenha ao menos uma candidatura numa das situações listadas. Com `ALOCADO` na lista, a pessoa
   * alocada tem `not exists` FALSO e a linha dela nunca entra no `update`.
   */
  it("`ALOCADO` está entre as situações que protegem o candidato do expurgo", async () => {
    const q = await rodarVarredura();
    expect(q).toContain("'ALOCADO'");
    expect(q).toMatch(/not exists \(\s*select 1 from as_candidaturas k/);
  });

  /**
   * A LISTA É DERIVADA, e é isso que impede o defeito de voltar por outra porta. O texto esperado é
   * MONTADO a partir de `SITUACOES_VIVAS` em vez de escrito aqui: se alguém redigitar a lista no
   * SQL, ou acrescentar uma situação viva ao vocabulário sem que a consulta a acompanhe, este
   * `expect` cai.
   */
  it("a cláusula é montada a partir de `SITUACOES_VIVAS`, não digitada dentro do SQL", async () => {
    const q = await rodarVarredura();
    const esperado = `k.situacao in (${SITUACOES_VIVAS.map((s) => `'${s}'`).join(", ")})`;
    expect(q).toContain(esperado);
  });

  /**
   * TODA SITUAÇÃO VIVA PROTEGE, uma a uma. Escrito como laço sobre o vocabulário para que a situação
   * NOVA de amanhã já esteja coberta pelo teste no dia em que nascer, sem ninguém lembrar de voltar
   * aqui. É a mesma direção fail-closed da constante: situação nova nasce protegida.
   */
  it("nenhuma situação viva fica de fora da proteção", async () => {
    const q = await rodarVarredura();
    for (const s of SITUACOES_VIVAS) expect(q).toContain(`'${s}'`);
  });

  /**
   * O CONTORNO DA REGRA, para o teste não virar "contém a palavra": quem saiu SEM ÊXITO não protege
   * ninguém, senão o expurgo nunca alcançaria pessoa nenhuma e a retenção da LGPD viraria letra
   * morta. `DESCARTADO` e `DESISTIU` são exatamente os que fazem o prazo começar a correr.
   */
  it("quem saiu sem êxito NÃO protege: é ele que faz o prazo correr", async () => {
    const q = await rodarVarredura();
    const protecao = q.slice(q.indexOf("not exists"));
    expect(protecao).not.toContain("'DESCARTADO'");
    expect(protecao).not.toContain("'DESISTIU'");
  });

  /**
   * A RÉGUA DE "VAGA ENCERRADA" VEM DO FLAG `encerra`, POR JOIN, e nunca de uma lista de códigos.
   *
   * ESTA AFIRMAÇÃO É SOBRE O CABEÇALHO DESTE ARQUIVO DE SERVIÇO, e é por isso que ela mora aqui e
   * não no contrato do `tester` (que cobre a régua em si, em
   * `retencao-candidatos.lgpd.comportamental.spec.ts`): `SITUACOES_VIVAS_SQL` documenta que ali NÃO
   * SE CONCATENA DADO EXTERNO, e o catálogo `as_vaga_status` É EDITÁVEL pelo diretor. Resolver
   * "quais status encerram" por uma lista lida do catálogo e interpolada com `sql.raw` quebraria
   * essa premissa como TEXTO, mesmo que o resultado da consulta continuasse certo.
   */
  it("nenhum código de status da vaga é digitado dentro da consulta", async () => {
    const q = await rodarVarredura();
    for (const codigo of [
      "CANCELADA",
      "FECHADA",
      "ENTREGUE",
      "ABERTA",
      "RASCUNHO",
      /*
       * `PENDENTE_REVISAO` ENTROU NA LISTA com a subtração da fila de revisão: ela é feita pelo
       * PAPEL (`s.papel is distinct from 'REVISAO'`), e o código do status continua proibido aqui
       * pelo motivo de sempre, que o diretor o renomeia pela tela do catálogo. Escrita pelo código,
       * a subtração para de valer no dia do renome, sem nada falhar, e a fila volta a proteger.
       */
      "PENDENTE_REVISAO",
    ]) {
      expect(q).not.toContain(`'${codigo}'`);
    }
  });

  /**
   * O banco de talentos não expira, e o prazo é o do diretor. Guardas do resto da regra.
   *
   * A RÉGUA É `c.banco_talentos = false`, E O TEXTO MUDOU PORQUE A COLUNA MUDOU (migration 0112): a
   * retenção deixou de ser o valor `BANCO_TALENTOS` do enum de origem e virou campo próprio, com
   * cadeado de SUPER_ADMIN. A segunda asserção é a que importa mais: comparar `origem` com um valor
   * que não existe mais no tipo derruba a varredura inteira com `invalid input value for enum`.
   */
  it("candidato de banco não expira, e o prazo é o do diretor: 6 MESES", async () => {
    const q = await rodarVarredura();
    expect(q).toContain("c.banco_talentos = false");
    expect(q).not.toContain("'BANCO_TALENTOS'");
    expect(q).toContain("interval '6 months'");
    expect(
      q,
      "o prazo de 2 anos foi REVOGADO pelo diretor. Enquanto ele estiver no texto, o dado pessoal de quem parou há 6 meses continua retido por mais um ano e meio, e uma reversão parcial (os dois intervalos no mesmo `where`) não falha nada.",
    ).not.toContain("interval '2 years'");
  });

  /**
   * ─ A FILA DE REVISÃO NÃO PROTEGE MAIS, E QUEM FOI PARA A ADMISSÃO PROTEGE SEMPRE ─────────────
   *
   * As duas metades da decisão do diretor, medidas juntas porque uma sem a outra é um caminho de
   * dano: tirar a fila da proteção, sozinho, anonimiza do lado de A&S quem já foi ENVIADO PARA
   * ADMISSÃO assim que um Master devolver a vaga para a fila, enquanto o CPF dessa pessoa segue
   * inteiro na Admissão, que não tem retenção geral.
   */
  it("a fila de REVISAO não abriga mais, e é pelo PAPEL", async () => {
    const protecao = (await rodarVarredura()).toLowerCase();
    expect(protecao).toMatch(/papel\s+is\s+distinct\s+from\s+'revisao'/);
  });

  it("quem já foi para a ADMISSÃO protege pelo FATO, e fora da subtração do papel", async () => {
    const q = (await rodarVarredura()).toLowerCase();
    expect(q).toContain("k.admissao_id is not null");
    expect(
      q,
      "a leitura do fato tem de ser ALTERNATIVA à régua da vaga (`or`), e nunca ficar subordinada à exclusão do papel: subordinada, a vaga devolvida para a fila desliga justamente a proteção que ela existe para dar.",
    ).toMatch(/\(k\.admissao_id is not null\s+or\b/);
  });

  /**
   * O PISO DO RELÓGIO, que é o que impede a subtração de cima de APRESSAR um expurgo irreversível:
   * quem VOLTA para a fila tem `k.atualizado_em` de anos atrás, porque enquanto a vaga esteve
   * aberta a proteção era incondicional e ninguém precisava tocar a linha.
   */
  it("o relógio tem PISO na entrada na fila, lido da trilha de status", async () => {
    const q = (await rodarVarredura()).toLowerCase();
    expect(q).toContain("as_vaga_status_eventos");
    expect(
      q,
      "fora do `greatest`, um nulo do piso (vaga que não é da fila, ou vaga da fila sem evento, que é quem NASCEU nela) muda a queda inteira e o erro passa a cair para o lado de APAGAR.",
    ).toMatch(/greatest\([^;]*as_vaga_status_eventos/);
  });

  /**
   * ─ OS TRÊS INVARIANTES QUE A MUDANÇA DO DIRETOR NÃO PODE TER QUEBRADO ────────────────────────
   *
   * Eles já estavam certos antes desta frente, e é por isso que estão aqui: o que esta frente pode
   * derrubar é justamente o que ninguém estava olhando.
   */
  it("QUEM FOI CONTRATADO continua fora: a vaga que ENTREGOU protege pelo carimbo", async () => {
    const q = (await rodarVarredura()).toLowerCase();
    expect(q).toContain("s.papel = 'fechamento'");
    expect(
      q,
      "sem o carimbo, a exceção protegeria TODA vaga fechada, inclusive a que não entregou ninguém.",
    ).toContain("vagas_fechadas");
    expect(
      q,
      "a vaga CANCELADA também carimba a contagem: sem restringir ao FECHAMENTO, o cancelamento passaria a proteger quem ele nunca protegeu.",
    ).not.toContain("'cancelamento'");
  });

  it("VAGA PAUSADA não é vaga terminada: a régua é `encerra`, nunca `recebe_candidato`", async () => {
    const q = (await rodarVarredura()).toLowerCase();
    expect(q).toContain("s.encerra = false");
    expect(
      q,
      "um status LIVRE como Stand By é `recebe_candidato = false` e `encerra = false`: ler o flag errado torna expurgável todo mundo dentro de uma vaga só PAUSADA.",
    ).not.toContain("recebe_candidato");
  });

  it("a PROTEÇÃO ENTRE VAGAS continua inteira: correlação pela pessoa, sem reduzir a uma candidatura", async () => {
    const protecao = (await rodarVarredura()).toLowerCase();
    const trecho = protecao.slice(protecao.indexOf("not exists"), protecao.indexOf("and coalesce("));
    expect(trecho).toMatch(/k\.candidato_id\s*=\s*c\.id/);
    expect(trecho).not.toMatch(/\blimit\b/);
    expect(trecho).not.toMatch(/\border\s+by\b/);
  });

  /**
   * ─ O PARÊNTESE, QUE NENHUMA OUTRA AFIRMAÇÃO DESTE ARQUIVO PEGA ───────────────────────────────
   *
   * TODO TESTE DAQUI LÊ TEXTO, e texto desbalanceado passa em todos eles. A consulta desta frente
   * ganhou DOIS níveis de aninhamento novos no `not exists`, e a primeira escrita saiu com um
   * parêntese a menos: verde em toda asserção de texto, e `syntax error at or near` no primeiro
   * boot em produção, isto é, a varredura simplesmente PARA DE RODAR e ninguém é expurgado nunca
   * mais, em silêncio (a falha vira uma linha de log, por desenho).
   */
  it("a consulta é balanceada: nenhum parêntese sobra nem falta", async () => {
    const q = (await rodarVarredura()).replace(/'[^']*'/g, "");
    let saldo = 0;
    for (const c of q) {
      if (c === "(") saldo += 1;
      if (c === ")") saldo -= 1;
      expect(saldo, "fechou um parêntese que nunca foi aberto").toBeGreaterThanOrEqual(0);
    }
    expect(saldo, "a consulta tem parêntese aberto sem fechar: ela não é SQL válido.").toBe(0);
  });
});

/**
 * ─ A VARREDURA QUE FALHA NÃO PODE DERRUBAR O BACKEND (o achado bloqueante da auditoria) ─────────
 *
 * O DEFEITO, em duas linhas de código: `onModuleInit` disparava `void this.expurgar()` e
 * `setInterval(() => void this.expurgar())`, os dois SEM captura. Promessa rejeitada sem `catch` é
 * `unhandledRejection`, e no Node 20 desta VM (v20.20.2) isso MATA O PROCESSO. Não existe handler
 * de `unhandledRejection` nem de `uncaughtException` no backend, conferido por varredura.
 *
 * POR QUE ELE ERA GRANDE: `onModuleInit` roda no BOOT, antes da primeira requisição, e o serviço
 * sobe sob `systemd --user`. Uma varredura que falha viraria CRASH-LOOP, levando junto Esteira,
 * Admissões, Clicksign e o tick do cron, que não têm nada a ver com A&S.
 *
 * O TESTE É COMPORTAMENTAL, e é essa a diferença que importa: ele não procura a palavra `catch` no
 * arquivo, ele FAZ a varredura falhar e observa o que escapa. Um `process.on("unhandledRejection")`
 * fica escutando durante o teste, e a asserção é sobre o que ele NÃO recebeu. Com a captura
 * removida do serviço, estes testes ficam vermelhos.
 */

/** Um serviço cuja consulta SEMPRE rejeita, e a lista dos erros que o logger recebeu. */
function servicoQueFalha(err: unknown) {
  const erros: unknown[][] = [];
  vi.spyOn(Logger.prototype, "error").mockImplementation((...args: unknown[]) => {
    erros.push(args);
  });
  const db = { execute: () => Promise.reject(err) } as never;
  return { service: new RetencaoCandidatosService(db), erros };
}

/**
 * Dois ciclos de `setImmediate`. O `unhandledRejection` do Node não é síncrono: ele só é emitido
 * depois que a fila de microtarefas drena, então esperar um ciclo só deixaria o teste passar por
 * falta de tempo, e não por ausência de rejeição.
 */
async function esperarOsCiclosDoNode(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe("a varredura de retenção falha SEM derrubar o processo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * O CENÁRIO REAL, e ele foi reproduzido contra o banco da homologação antes desta correção: a
   * consulta cita valores de enum derivados do vocabulário, e contra um banco ainda não migrado o
   * Postgres devolve `invalid input value for enum`. No BOOT, isso era o backend inteiro no chão.
   */
  it("a falha do BOOT não escapa como rejeição não tratada", async () => {
    const naoTratadas: unknown[] = [];
    const escuta = (e: unknown) => naoTratadas.push(e);
    process.on("unhandledRejection", escuta);

    const { service, erros } = servicoQueFalha(
      new Error('invalid input value for enum candidatura_situacao: "ALOCADO"'),
    );

    try {
      expect(() => service.onModuleInit()).not.toThrow();
      await esperarOsCiclosDoNode();
      expect(naoTratadas).toEqual([]);
      expect(erros).toHaveLength(1);
      expect(String(erros[0][0])).toContain("invalid input value for enum");
    } finally {
      process.off("unhandledRejection", escuta);
      service.onModuleDestroy();
    }
  });

  /**
   * A PASSADA HORÁRIA TAMBÉM, e ela é a metade que se esquece: o gatilho conhecido era o do boot,
   * mas uma queda de conexão às 3h da manhã derrubaria o backend pelo mesmo caminho. As duas
   * chamadas passam pela mesma captura, e este teste é quem garante que continuam passando.
   */
  it("a falha da passada horária também não escapa, e a varredura seguinte continua tentando", async () => {
    vi.useFakeTimers();
    const naoTratadas: unknown[] = [];
    const escuta = (e: unknown) => naoTratadas.push(e);
    process.on("unhandledRejection", escuta);

    const { service, erros } = servicoQueFalha(new Error("connection terminated unexpectedly"));

    try {
      service.onModuleInit();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      vi.useRealTimers();
      await esperarOsCiclosDoNode();

      expect(naoTratadas).toEqual([]);
      // Boot mais duas passadas: o timer NÃO morreu na primeira falha.
      expect(erros).toHaveLength(3);
    } finally {
      process.off("unhandledRejection", escuta);
      service.onModuleDestroy();
    }
  });

  /**
   * §A.6 NO LOG DO ERRO. O erro do driver carrega mais do que a frase: o `detail` do Postgres traz o
   * VALOR que violou a restrição, e num expurgo de candidato esse valor é o CPF. Publicar o objeto
   * inteiro no log seria vazar exatamente o dado que a varredura existe para apagar.
   */
  it("o log leva a mensagem do erro e NENHUM dado pessoal", async () => {
    const erro = Object.assign(new Error("duplicate key value violates unique constraint"), {
      detail: "Key (cpf)=(11122233344) already exists.",
      query: "update as_candidatos c set cpf = null where c.email = 'fulano@exemplo.com'",
      params: ["11122233344"],
    });

    const { service, erros } = servicoQueFalha(erro);
    try {
      service.onModuleInit();
      await esperarOsCiclosDoNode();

      expect(erros).toHaveLength(1);
      // UM argumento só, e ele é STRING: o objeto do erro não é repassado, então nem `detail`, nem
      // `query`, nem `params`, nem o stack chegam ao log.
      expect(erros[0]).toHaveLength(1);
      const linha = erros[0][0];
      expect(typeof linha).toBe("string");
      expect(linha).toContain("duplicate key value violates unique constraint");
      expect(linha).not.toContain("11122233344");
      expect(linha).not.toContain("fulano@exemplo.com");
      expect(linha).not.toContain("Key (cpf)");
    } finally {
      service.onModuleDestroy();
    }
  });
});
