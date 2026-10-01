import "reflect-metadata";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * ─ GATE DOS OBRIGATORIOS DA LIBERACAO ADMISSIONAL (item 6, `tester` independente §A.38/§A.40) ─
 *
 * O NOME DESTE ARQUIVO NAO TRAZ A CONTAGEM, E ISSO E DELIBERADO. Ele nasceu
 * `admissoes.liberar-obrigatorios-seis.tester.spec.ts`, a regua virou SETE por decisao do diretor, e o
 * nome passou a mentir. Nome com numero envelhece a cada decisao e faz a proxima sessao contar errado
 * pelo nome do arquivo em vez de pela lista. A contagem vive na lista abaixo e em
 * `domain/liberacao-obrigatorios.ts`, que e a fonte.
 *
 * O REQUISITO. Na Liberacao Admissional, SETE campos sao obrigatorios para LIBERAR:
 *   1. Cargo
 *   2. Sexo            (individual; no LOTE nao e cobrado, Sexo e confirmado por pessoa)
 *   3. Tipo de contrato
 *   4. Data de admissao
 *   5. Pacote de beneficios
 *   6. Escala
 *   7. UNIDADE DO SALARIO  <- entrou por decisao do diretor (ver o fundamento abaixo)
 *
 * Faltando qualquer um deles:
 *  . usuario COMUM: a liberacao RECUSA (403/400/409), com a lista dos que faltam nos ROTULOS, sem PII;
 *  . MASTER/SUPER_ADMIN sem `aceiteObrigatoriosFaltantes`: tambem RECUSA;
 *  . MASTER/SUPER_ADMIN COM `aceiteObrigatoriosFaltantes: true`: LIBERA, e grava um RASTRO
 *    consultavel (quem, quando, quais faltavam), §A.6 (id do usuario + chaves + timestamp, nada de
 *    CPF/nome/valor).
 * As DEMAIS pendencias da esteira (VALOR do salario, Setor, Gestor/BP, Uniforme, Centro de custo) NAO
 * travam a liberacao: so os sete travam.
 *
 * ┌─ POR QUE A UNIDADE DO SALARIO ENTROU (fundamento medido, nao preferencia) ────────────────────┐
 * │ Medido na producao: 7 admissoes vivas tem salario `9,34` e `10,90`, que sao valores de HORA. O │
 * │ campo correspondente no GI (`tipoSalario`) tem DEFAULT "Mes". Sem a unidade DECLARADA, aquelas │
 * │ 7 entrariam na folha como salario MENSAL de R$ 9,34, em silencio. Dai a regra permanente do    │
 * │ diretor (nenhum salario vai para a folha sem auditoria do time) e a decisao de cobrar a unidade │
 * │ no gate da Liberacao. Ver `domain/portal-dados-gi.ts` (`tipoSalarioGi`, recusa                 │
 * │ `GI_SALARIO_SEM_UNIDADE`): a unidade NUNCA e deduzida do valor e NUNCA cai no default.         │
 * │ Risco de ligar, medido: 2 admissoes em AGUARDANDO_LIBERACAO na producao, as duas JA barradas   │
 * │ hoje pelas outras chaves. A setima chave muda o comportamento de ZERO admissoes.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A UNIDADE E COBRADA SEM CONDICAO, E ISSO E ESCOLHA EXPLICITA DESTA REGUA. A decisao do diretor foi
 * "de SEIS para SETE: entra a unidade do salario", sem ressalva, e o dominio do envio diz que declarar
 * a unidade E o ato de auditoria. Entao a unidade e exigida mesmo quando o VALOR do salario esta vazio
 * (o valor continua sendo pendencia de esteira, que nao trava). O caso esta travado em teste abaixo,
 * nomeado, para a escolha ficar VISIVEL: se o diretor quiser a unidade exigida so quando ha valor, e
 * este teste que muda, e muda de propria boca dele.
 *
 * VERIFICACAO INDEPENDENTE. Este arquivo NAO escreveu o gate; o produto esta em outra sessao
 * (`obrigatoriosFaltantesParaLiberar` + os dois call sites da `liberar`). Ele afirma o COMPORTAMENTO
 * do requisito: enquanto a setima chave nao existir no produto, os casos da unidade FALHAM, e isso e o
 * desenho (§A.40 regra 2: a regua primeiro, a construcao faz passar). Nenhum caso foi afrouxado para
 * ficar verde.
 *
 * §A.11: sem travessao no texto. §A.6: nenhuma asercao expoe CPF/nome como esperado.
 */

const CPF_OK = "52998224725"; // digito valido (mesmo dos demais specs de liberacao)
const NOME = "Fulano Sintetico";
const CARGO = "11111111-1111-4111-8111-111111111111";

const COMUM: AuthUser = { id: "u-comum", email: "comum@ea.local", papel: "COMUM", senhaTemporaria: false };
const MASTER: AuthUser = { id: "u-master", email: "master@ea.local", papel: "MASTER", senhaTemporaria: false };
const SUPER: AuthUser = { id: "u-super", email: "super@ea.local", papel: "SUPER_ADMIN", senhaTemporaria: false };

/**
 * O rotulo da setima chave e cobrado por FORMA, nao por string exata: a recusa tem de nomear a
 * UNIDADE e o SALARIO, para o usuario saber o que preencher. Assim a regua nao briga com a sessao do
 * produto por maiuscula ou preposicao ("Unidade do salario" / "Unidade do Salario"), e continua
 * barrando uma mensagem que fale so de "Salario" (que e OUTRO campo, o valor, e esse nao trava).
 */
const ROTULO_UNIDADE = /unidade[^"]{0,12}sal[áa]rio/i;

type Opts = {
  admTipoContrato?: string | null;
  admDataAdmissao?: string | null;
  candidatoSexo?: string | null;
  /** Outras admissoes vivas do mesmo CPF (trava de duplicidade). Vazio = sem duplicata. */
  vivas?: Record<string, unknown>[];
};

/**
 * Fake do Drizzle para o caminho da `liberar`, no molde de `admissoes.duplicidade-cpf.spec.ts`.
 * O `select` sem join responde `[]` (regua vazia, catalogo vazio, vinculos vazios, grupo vazio); o
 * `select` com `leftJoin` responde `vivas` (a trava de duplicidade). Todo `insert` (na tx e no db) e
 * CAPTURADO, para as asercoes de rastro e de ausencia de PII olharem exatamente o que foi persistido.
 */
function montar(opts: Opts = {}) {
  const { admTipoContrato = null, admDataAdmissao = null, candidatoSexo = null, vivas = [] } = opts;
  const transacoes = { n: 0 };
  const inserts: unknown[] = [];
  const capturarInsert = () => ({ values: async (v: unknown) => { inserts.push(v); } });

  const selectComeco = () => {
    const from = () => {
      const comJoin: {
        leftJoin: () => typeof comJoin;
        where: (...a: unknown[]) => Promise<unknown[]>;
        limit: () => Promise<unknown[]>;
      } = {
        leftJoin: () => comJoin,
        where: async () => vivas,
        limit: async () => vivas,
      };
      return { ...comJoin, where: async () => [], limit: async () => [] };
    };
    return { from };
  };

  const tx = {
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: capturarInsert,
    select: () => ({ from: () => ({ where: async () => [] }) }),
  };

  const db = {
    query: {
      admissoes: {
        findFirst: async () => ({
          id: "a1",
          candidatoCpf: CPF_OK,
          farolGlobal: "AGUARDANDO_LIBERACAO",
          isBanco: false,
          possivelDuplicata: false,
          tipoContrato: admTipoContrato,
          dataAdmissao: admDataAdmissao,
        }),
      },
      clientes: { findFirst: async () => ({ codCliente: "100" }) },
      cargos: { findFirst: async () => ({ id: CARGO }) },
      candidatos: { findFirst: async () => ({ nome: NOME, cpf: CPF_OK, sexo: candidatoSexo }) },
      integracaoPandape: { findFirst: async () => null },
      beneficiosCatalogo: { findMany: async () => [] },
    },
    select: selectComeco,
    insert: capturarInsert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      transacoes.n += 1;
      return fn(tx);
    },
  };

  return { service: new AdmissoesService(db as never), transacoes, inserts };
}

/** DTO base: passa por tudo que NAO e o gate (CPF valido, uniforme respondido, sem duplicata). */
const base = { codCliente: "100", cargoId: CARGO, uniforme: { possui: false } };

/**
 * DTO com os SETE obrigatorios preenchidos pela tela. `salarioUnidade` e um valor da lista FECHADA
 * `SALARIO_UNIDADES_EA` (`domain/portal-dados-gi.ts`), que o DTO da vaga/folha ja valida com `@IsIn`.
 * Repare que NAO ha `salario` aqui: o VALOR continua fora do gate, so a unidade entrou.
 */
const seteCompletos = {
  ...base,
  sexo: "MASCULINO" as const,
  tipoContrato: "Interno",
  dataAdmissao: "2026-10-01",
  pacoteBeneficios: [{ beneficioId: "b1" }],
  vagaFolha: { escala: "12x36", salarioUnidade: "MENSAL" },
};

describe("Liberacao Admissional: gate dos obrigatorios para liberar (item 6, sete chaves)", () => {
  // ── Cenario 1: os sete preenchidos liberam normal, nascendo as frentes (nao-regressao) ──
  it("com os SETE preenchidos, LIBERA e nasce as frentes (como hoje)", async () => {
    const { service, transacoes, inserts } = montar();

    const r = await service.liberar("a1", seteCompletos, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
    // Nascimento paralelo (regra 1 / F12): um insert de frentes, com `tipo` em cada linha.
    const nasceuFrentes = inserts.some(
      (v) => Array.isArray(v) && v.length >= 2 && v.every((x) => x && typeof x === "object" && "tipo" in x),
    );
    expect(nasceuFrentes).toBe(true);
  });

  // ── Cenario 2: COMUM faltando algum RECUSA, com a lista nos rotulos, sem PII ──
  it("COMUM faltando 6 dos 7: RECUSA, lista os rotulos (a unidade inclusive), sem PII, nada nasce", async () => {
    // Faltam Sexo, Tipo de contrato, Data de admissao, Pacote de beneficios, Escala e a UNIDADE do
    // salario. Cargo presente.
    const { service, inserts } = montar();

    const err = await service.liberar("a1", base, COMUM).catch((e: Error) => e);

    // RBAC-fail do COMUM e 403 ForbiddenException (refinamento do coordenador: papel primeiro,
    // independente do flag). A recusa por FALTA de aceite (Master/Super) segue 409. Aceitos os tres.
    expect(
      err instanceof ForbiddenException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException,
    ).toBe(true);
    const corpo = JSON.stringify((err as BadRequestException).getResponse());
    // A lista dos que faltam, pelos ROTULOS (nao pelas chaves canonicas).
    for (const rotulo of ["Sexo", "Tipo de contrato", "Data de admissão", "Pacote de benefícios", "Escala"]) {
      expect(corpo).toContain(rotulo);
    }
    // A SETIMA: a mensagem nomeia a unidade do salario, nao so "Salario" (que e o valor, e nao trava).
    expect(corpo).toMatch(ROTULO_UNIDADE);
    // §A.6: a recusa nao repete CPF nem nome do candidato.
    expect(corpo).not.toContain(CPF_OK);
    expect(corpo).not.toContain(NOME);
    // Nada foi persistido com a autoria do usuario (a admissao nao nasceu).
    expect(JSON.stringify(inserts)).not.toContain(COMUM.id);
  });

  it("COMUM: o aceite NAO abre excecao para ele (segue recusando mesmo com o flag)", async () => {
    const { service } = montar();

    const err = await service
      .liberar("a1", { ...base, aceiteObrigatoriosFaltantes: true } as never, COMUM)
      .catch((e: Error) => e);

    // COMUM nao escapa nem com o flag: 403 ForbiddenException (papel checado antes do aceite).
    expect(
      err instanceof ForbiddenException ||
        err instanceof BadRequestException ||
        err instanceof ConflictException,
    ).toBe(true);
  });

  // ── Cenario 3: MASTER/SUPER sem aceite, faltando algum, tambem RECUSA ──
  it("MASTER faltando algum, SEM aceite: RECUSA (o gate nao e so para COMUM)", async () => {
    const { service } = montar();

    const err = await service.liberar("a1", base, MASTER).catch((e: Error) => e);

    expect(err instanceof BadRequestException || err instanceof ConflictException).toBe(true);
    const corpo = JSON.stringify((err as BadRequestException).getResponse());
    expect(corpo).toContain("Escala");
    expect(corpo).not.toContain(CPF_OK);
  });

  it("SUPER_ADMIN faltando algum, SEM aceite: tambem RECUSA", async () => {
    const { service } = montar();

    const err = await service.liberar("a1", base, SUPER).catch((e: Error) => e);

    expect(err instanceof BadRequestException || err instanceof ConflictException).toBe(true);
  });

  // ── Cenario 4: MASTER/SUPER COM aceite, faltando algum, LIBERA e grava o rastro sem PII ──
  it("MASTER COM aceite, faltando algum: LIBERA (nasce a admissao)", async () => {
    const { service, transacoes } = montar();

    const r = await service.liberar("a1", { ...base, aceiteObrigatoriosFaltantes: true } as never, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  it("o aceite grava um RASTRO com a AUTORIA e SEM PII (§A.6: id do usuario, nunca CPF/nome)", async () => {
    const { service, inserts } = montar();

    await service.liberar("a1", { ...base, aceiteObrigatoriosFaltantes: true } as never, MASTER);

    const persistido = JSON.stringify(inserts);
    // Quem: o id do usuario que aceitou aparece no que foi persistido (a autoria do rastro).
    expect(persistido).toContain(MASTER.id);
    // §A.6: o rastro nao carrega CPF nem nome do candidato.
    expect(persistido).not.toContain(CPF_OK);
    expect(persistido).not.toContain(NOME);
  });

  // ────────────────────────────────────────────────────────────────────────────────────────────────
  // Cenario 6: A SETIMA CHAVE, a unidade do salario. E o motivo da frente, e e o unico bloco que
  // PROVA que ela entrou: sem ele, os demais casos provam apenas que o gate das seis continua de pe.
  // ────────────────────────────────────────────────────────────────────────────────────────────────
  describe("a setima chave: UNIDADE DO SALARIO", () => {
    /** Tudo o que o gate pede, MENOS a unidade. Unica diferenca em relacao a `seteCompletos`. */
    const tudoMenosAUnidade = {
      ...base,
      sexo: "MASCULINO" as const,
      tipoContrato: "Interno",
      dataAdmissao: "2026-10-01",
      pacoteBeneficios: [{ beneficioId: "b1" }],
      vagaFolha: { escala: "12x36" },
    };

    it("MASTER com TUDO preenchido menos a UNIDADE, SEM aceite: BARRADA, e a mensagem nomeia a unidade", async () => {
      const { service, transacoes } = montar();

      const err = await service.liberar("a1", tudoMenosAUnidade, MASTER).catch((e: Error) => e);

      expect(err instanceof BadRequestException || err instanceof ConflictException).toBe(true);
      const corpo = JSON.stringify((err as BadRequestException).getResponse());
      expect(corpo).toMatch(ROTULO_UNIDADE);
      // A mensagem nao pode cobrar o que ESTA preenchido: a unidade e a UNICA faltante aqui.
      for (const outro of ["Sexo", "Tipo de contrato", "Data de admissão", "Pacote de benefícios", "Escala"]) {
        expect(corpo).not.toContain(outro);
      }
      // §A.6 e nao-escrita: nada nasceu, nenhuma transacao abriu.
      expect(corpo).not.toContain(CPF_OK);
      expect(corpo).not.toContain(NOME);
      expect(transacoes.n).toBe(0);
    });

    it("COMUM com TUDO preenchido menos a UNIDADE: BARRADA (nao e privilegio de papel)", async () => {
      const { service, transacoes } = montar();

      const err = await service.liberar("a1", tudoMenosAUnidade, COMUM).catch((e: Error) => e);

      expect(
        err instanceof ForbiddenException ||
          err instanceof BadRequestException ||
          err instanceof ConflictException,
      ).toBe(true);
      expect(transacoes.n).toBe(0);
    });

    it("unidade em BRANCO nao preenche: espaco nao e declaracao, BARRADA igual a ausente", async () => {
      const { service, transacoes } = montar();

      const err = await service
        .liberar("a1", { ...tudoMenosAUnidade, vagaFolha: { escala: "12x36", salarioUnidade: "   " } }, MASTER)
        .catch((e: Error) => e);

      expect(err instanceof BadRequestException || err instanceof ConflictException).toBe(true);
      expect(transacoes.n).toBe(0);
    });

    it("so a UNIDADE faltando, MASTER COM aceite: LIBERA e grava o rastro (a via do aceite nao fecha)", async () => {
      const { service, transacoes, inserts } = montar();

      const r = await service.liberar(
        "a1",
        { ...tudoMenosAUnidade, aceiteObrigatoriosFaltantes: true } as never,
        MASTER,
      );

      expect(r.admissaoId).toBe("a1");
      expect(transacoes.n).toBe(1);
      const persistido = JSON.stringify(inserts);
      expect(persistido).toContain(MASTER.id);
      expect(persistido).not.toContain(CPF_OK);
      expect(persistido).not.toContain(NOME);
    });

    it("a unidade NAO e deduzida do valor: salario de HORA (9,34) sem unidade declarada e BARRADO", async () => {
      // O caso medido na producao, que e o motivo da regra. Valor de hora, campo do GI com default
      // "Mes": heuristica por faixa de valor esta PROIBIDA (`domain/portal-dados-gi.ts`), entao a
      // presenca do valor NAO supre a unidade.
      const { service, transacoes } = montar();

      const err = await service
        .liberar("a1", { ...tudoMenosAUnidade, vagaFolha: { escala: "12x36", salario: "9,34" } }, MASTER)
        .catch((e: Error) => e);

      expect(err instanceof BadRequestException || err instanceof ConflictException).toBe(true);
      expect(JSON.stringify((err as BadRequestException).getResponse())).toMatch(ROTULO_UNIDADE);
      expect(transacoes.n).toBe(0);
    });

    it("unidade declarada e VALOR ausente: LIBERA (o valor do salario segue fora do gate)", async () => {
      // A outra metade da regra: entrou a UNIDADE, nao o VALOR. Quem declarou a unidade e nao digitou
      // o valor nao e barrado aqui, o valor continua sendo pendencia de esteira.
      const { service, transacoes } = montar();

      const r = await service.liberar("a1", seteCompletos, MASTER);

      expect(r.admissaoId).toBe("a1");
      expect(transacoes.n).toBe(1);
    });

    it("a unidade e cobrada MESMO sem valor de salario (escolha explicita desta regua, ver o cabecalho)", async () => {
      // Sem `salario` e sem `salarioUnidade`: a regua cobra a unidade de qualquer forma, porque
      // declarar a unidade E o ato de auditoria. Se o diretor decidir cobrar so quando houver valor,
      // e ESTE teste que muda, e muda por decisao dele, nao por conveniencia de implementacao.
      const { service, transacoes } = montar();

      const err = await service.liberar("a1", tudoMenosAUnidade, MASTER).catch((e: Error) => e);

      expect(err instanceof BadRequestException || err instanceof ConflictException).toBe(true);
      expect(JSON.stringify((err as BadRequestException).getResponse())).toMatch(ROTULO_UNIDADE);
      expect(transacoes.n).toBe(0);
    });
  });

  // ── Cenario 5: as DEMAIS pendencias nao travam. So os sete travam. ──
  it("os SETE presentes e SO as demais faltando (Salario, Setor, Gestor/BP, Centro de custo): LIBERA", async () => {
    const { service, transacoes } = montar();

    // vagaFolha traz so a Escala e a unidade (dois dos sete). VALOR do salario, Setor, Gestor/BP e
    // Centro de custo ausentes, e nenhum deles trava.
    const r = await service.liberar("a1", seteCompletos, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  it("Sexo herdado do candidato (sem dto.sexo) conta como preenchido: nao trava", async () => {
    const { service, transacoes } = montar({ candidatoSexo: "FEMININO" });

    // Os outros seis vem no dto; o Sexo ja esta no candidato. O gate nao deve cobrar o que ja existe.
    const dto = {
      ...base,
      tipoContrato: "Interno",
      dataAdmissao: "2026-10-01",
      pacoteBeneficios: [{ beneficioId: "b1" }],
      vagaFolha: { escala: "12x36", salarioUnidade: "MENSAL" },
    };
    const r = await service.liberar("a1", dto, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  // ── O que exige contrato/DB real, deixado como TODO honesto para o coordenador ──
  it.todo(
    "o rastro e CONSULTAVEL (endpoint/tabela de trilha) com quem+quando+quais dos sete: exige a tabela real e um leitor, fora do fake puro",
  );
  it.todo(
    "o rastro registra as CHAVES canonicas exatas dos campos que faltavam (SEXO, ESCALA, SALARIO_UNIDADE, ...): depende do contrato do log que a outra sessao definir",
  );
  it.todo(
    "o LOTE cobra a unidade do salario por linha (incluirSexo: false, mas a unidade E do lote): precisa do fake do caminho do lote, que este arquivo nao monta",
  );
});
