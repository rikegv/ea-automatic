import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { expect, it } from "vitest";
import {
  AS_CANDIDATO_ORIGEM,
  AS_CANDIDATO_ORIGEM_LABEL,
  consomePosicao,
  type CandidaturaSituacao,
} from "@ea/shared-types";
import { asCandidatoOrigemEnum } from "../../db/schema/enums";
import { BuscarCandidatosDto } from "../candidatos/candidatos.dto";
import {
  CPF_SINTETICO,
  describeSuspenso,
  exigirExport,
  resultadoDigaiFingido,
  sentinelaDoDigai,
} from "./digai.tester-fake";

/**
 * ┌─ SUITE SUSPENSA: A IMPLEMENTACAO DO DIGAI AINDA NAO EXISTE ─────────────────────────────────┐
 * │ Nada aqui foi apagado. Cada assercao, cada caso e cada `it` continua escrito, palavra por   │
 * │ palavra: este arquivo e o CONTRATO que a construcao vai ter de satisfazer, escrito antes do │
 * │ codigo de proposito (secao A.38 e secao A.40, regra 2). A frente esta parada por insumo do  │
 * │ diretor (o token do Digai, docs/PLATAFORMA-UNIFICADORA-DECISOES.md, secao 5).               │
 * │                                                                                             │
 * │ O QUE MUDA E SO QUANDO RODA. Os blocos abaixo usam `describeSuspenso`, que e `describe.skip` │
 * │ enquanto NENHUMA peca do Digai existir no disco, e vira `describe` de verdade sozinho no     │
 * │ minuto em que a primeira peca nascer. Nao ha interruptor para alguem esquecer de virar: a    │
 * │ suspensao e DERIVADA da ausencia medida (`pecasPresentes`, em digai.tester-fake.ts).         │
 * │                                                                                             │
 * │ A SENTINELA ABAIXO RODA SEMPRE, e e ela que impede este trabalho de dormir para sempre: no   │
 * │ dia em que a implementacao chegar, ela FICA VERMELHA dizendo o que fazer. `skip` puro        │
 * │ ninguem lembra de reativar, e cobertura esquecida e pior do que cobertura que nao existe,    │
 * │ porque parece que existe.                                                                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
sentinelaDoDigai("digai.funil-e-contagem.tester.spec.ts");


/**
 * ─ O FUNIL E AS CONTAGENS (secao A.27: o que quebra de LADO) ────────────────────────────────────
 *
 * ESTE ARQUIVO E DO `tester`, escrito ANTES do codigo (secao A.38, secao A.40 regra 2), a partir do
 * `docs/MAPA-ALCANCE-DIGAI.md`.
 *
 * ┌─ O DANO QUE ELE EXISTE PARA IMPEDIR, e ele e SILENCIOSO ─────────────────────────────────────┐
 * │ A OCUPACAO da vaga e DERIVADA, contando `APROVADO` mais `ENVIADO_PARA_ADMISSAO`. Trazer      │
 * │ 13.248 candidatos de TRIAGEM com a situacao errada de nascimento nao gera erro nenhum: ele   │
 * │ apenas TRANCA todas as vagas, porque o numero que decide se ainda cabe alguem passa a contar │
 * │ quem so foi triado. Foi exatamente esse o modo de falha da secao A.27 (a frente de           │
 * │ integracao que quebrou a contagem de TRES telas de uma vez).                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SECAO A.6: os registros fingidos aqui usam CPF sintetico com digito valido e nome de fantasia.
 */

/**
 * O travessao (em dash) escrito por CODIGO, e nunca digitado: a secao A.11 proibe o GLIFO em todo
 * texto do sistema, e um teste que o digita para proibi-lo seria o unico lugar do repositorio a
 * conter exatamente o que ele existe para barrar.
 */
const TRAVESSAO = String.fromCharCode(0x2014);

// ── 1. A ORIGEM: valor novo no enum, e a consulta o respeita ───────────────

describeSuspenso("a origem `DIGAI` existe no vocabulario, no banco e no filtro", () => {
  it("o vocabulario compartilhado conhece `DIGAI`", () => {
    expect(
      AS_CANDIDATO_ORIGEM as readonly string[],
      "a plataforma sabe de onde puxou. A origem e NOSSA: `partnerUserId` e ZERO em 13.248 registros, nao ha marcador de origem no Digai.",
    ).toContain("DIGAI");
  });

  it("o rotulo existe, esta em Title Case (secao A.24) e nao usa travessao (secao A.11)", () => {
    const rotulo = (AS_CANDIDATO_ORIGEM_LABEL as Record<string, string>).DIGAI;
    expect(rotulo, "sem rotulo, a tela imprime o codigo cru do enum.").toBeTruthy();
    expect(rotulo.includes(TRAVESSAO), "o travessao e PROIBIDO em todo texto de UI (secao A.11).").toBe(false);
    for (const palavra of rotulo.split(" ")) {
      expect(
        palavra[0] === palavra[0].toUpperCase(),
        `tag e titulo usam a primeira letra de cada palavra em maiuscula (secao A.24). '${rotulo}' nao segue.`,
      ).toBe(true);
    }
  });

  it("o enum do banco tambem conhece `DIGAI`", () => {
    expect(
      asCandidatoOrigemEnum.enumValues as readonly string[],
      "o vocabulario e o banco tem de contar a mesma historia, senao a gravacao estoura em producao com o typecheck verde.",
    ).toContain("DIGAI");
  });

  it("o FILTRO oferece e a CONSULTA aceita: o DTO de busca valida `DIGAI`", () => {
    /**
     * SECAO A.28: filtro que a tela oferece e a consulta ignora e PIOR que filtro nenhum, porque
     * mente. O `@IsIn(AS_CANDIDATO_ORIGEM)` do DTO e o elo: se o valor nao entrar na lista unica, a
     * tela mostra a opcao (ela le a MESMA lista) e o backend recusa a chamada com 400.
     */
    const dto = plainToInstance(BuscarCandidatosDto, { origem: "DIGAI" });
    expect(
      validateSync(dto),
      "a tela le `AS_CANDIDATO_ORIGEM` para montar o filtro. Se o DTO recusar o valor, a opcao existe na tela e a busca devolve 400.",
    ).toEqual([]);
  });

  it("a migration do VALOR do enum e SEPARADA de qualquer migration que o utilize", () => {
    /**
     * ┌─ O ERRO DE POSTGRES QUE SO APARECE EM PRODUCAO ────────────────────────────────────────┐
     * │ Enum e APPEND-ONLY, e valor novo NAO PODE SER USADO na mesma transacao em que nasce. A  │
     * │ migration que faz `ADD VALUE 'DIGAI'` e depois `INSERT ... 'DIGAI'` passa no `generate` │
     * │ e falha no `migrate`, com o banco a meio caminho.                                       │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const pasta = join(__dirname, "../../../drizzle");
    const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql"));
    const comAddValue = arquivos.filter((f) => {
      const t = readFileSync(join(pasta, f), "utf8");
      return /add\s+value\s+'DIGAI'/i.test(t) || /add\s+value\s+if\s+not\s+exists\s+'DIGAI'/i.test(t);
    });
    expect(
      comAddValue.length,
      "FALTA IMPLEMENTAR: a migration que acrescenta `DIGAI` ao enum `as_candidato_origem`.",
    ).toBeGreaterThan(0);

    for (const f of comAddValue) {
      const corpo = readFileSync(join(pasta, f), "utf8");
      const usos = corpo.replace(/add\s+value[^;]*;/gi, "");
      expect(
        /'DIGAI'/.test(usos),
        `a migration ${f} usa 'DIGAI' na MESMA transacao em que o cria. Enum do Postgres nao permite, e o erro so aparece no \`migrate\`, com o banco a meio caminho.`,
      ).toBe(false);
    }
  });
});

// ── 2. AS ETAPAS DE TRIAGEM: linha de catalogo, e NUNCA a inicial ──────────

describeSuspenso("as etapas de triagem sao LINHAS do catalogo, e nenhuma delas e a inicial", () => {
  interface EtapaProposta {
    codigo: string;
    rotulo: string;
    ordem: number;
    tom: string;
    inicial?: boolean;
  }

  async function etapas(): Promise<readonly EtapaProposta[]> {
    return exigirExport<readonly EtapaProposta[]>("dominio", "ETAPAS_DIGAI");
  }

  it("sao duas: quem NAO finalizou a triagem e quem finalizou", async () => {
    const lista = await etapas();
    expect(
      lista.length,
      "a varredura fechou a regra: sem CPF = nao finalizou, com CPF = finalizou. Sao dois estagios, entao sao duas etapas.",
    ).toBe(2);
  });

  it("NENHUMA delas nasce marcada `inicial`", async () => {
    /**
     * ┌─ POR QUE ISTO E O TESTE MAIS PERIGOSO DE TODO O GRUPO ───────────────────────────────────┐
     * │ `as_etapas_funil_inicial_unica` e um INDICE PARCIAL UNICO: existe UMA inicial. Marcar     │
     * │ uma etapa nova como inicial nao gera duas iniciais, gera uma TROCA, e a troca muda onde   │
     * │ TODA candidatura nova nasce, inclusive as do Pandape e as manuais. Mexer em `inicial`     │
     * │ esta FORA desta frente, por decisao registrada no mapa de alcance.                        │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    for (const e of await etapas()) {
      expect(
        e.inicial ?? false,
        `a etapa '${e.codigo}' nasceu marcada inicial. Isso DESMARCA a inicial de hoje e muda onde toda candidatura nova nasce.`,
      ).toBe(false);
    }
  });

  it("os rotulos respeitam o Title Case (secao A.24) e nao usam travessao (secao A.11)", async () => {
    for (const e of await etapas()) {
      expect(e.rotulo.includes(TRAVESSAO), `travessao no rotulo '${e.rotulo}' (secao A.11).`).toBe(false);
      for (const p of e.rotulo.split(" ")) {
        if (["de", "da", "do", "e", "em", "para", "a", "o"].includes(p)) continue;
        expect(p[0] === p[0].toUpperCase(), `rotulo de etapa e TAG: '${e.rotulo}' (secao A.24).`).toBe(true);
      }
    }
  });

  it("a etapa e escolhida pelo ESTAGIO: sem CPF nao finalizou, com CPF finalizou", async () => {
    const escolher = await exigirExport<(r: unknown) => string>("dominio", "etapaDoResultadoDigai");
    const naoFinalizou = await exigirExport<string>("dominio", "ETAPA_DIGAI_NAO_FINALIZOU");
    const finalizou = await exigirExport<string>("dominio", "ETAPA_DIGAI_FINALIZOU");

    expect(escolher(resultadoDigaiFingido({ cpf: null }))).toBe(naoFinalizou);
    expect(escolher(resultadoDigaiFingido({ cpf: "" }))).toBe(naoFinalizou);
    expect(escolher(resultadoDigaiFingido({ cpf: CPF_SINTETICO.finalizou }))).toBe(finalizou);
    expect(
      escolher(resultadoDigaiFingido({ cpf: "000.000.000-00" })),
      "CPF invalido NAO e CPF: tratar lixo como finalizacao carimba conclusao em quem nao concluiu.",
    ).toBe(naoFinalizou);
  });

  it("as duas etapas apontam para codigos DISTINTOS", async () => {
    const naoFinalizou = await exigirExport<string>("dominio", "ETAPA_DIGAI_NAO_FINALIZOU");
    const finalizou = await exigirExport<string>("dominio", "ETAPA_DIGAI_FINALIZOU");
    expect(naoFinalizou).not.toBe(finalizou);
    const codigos = (await etapas()).map((e) => e.codigo);
    expect(codigos, "os codigos declarados tem de ser os mesmos do catalogo, senao a FK recusa a gravacao.").toContain(naoFinalizou);
    expect(codigos).toContain(finalizou);
  });
});

// ── 3. A CONTAGEM DE POSICOES NAO PODE SE MEXER ────────────────────────────

describeSuspenso("candidato de triagem NAO consome posicao da vaga", () => {
  it("a situacao de nascimento nao consome posicao", async () => {
    const situacao = await exigirExport<CandidaturaSituacao>("dominio", "SITUACAO_NASCIMENTO_DIGAI");
    expect(
      consomePosicao(situacao),
      `nascer em '${situacao}' TRANCA a vaga: a ocupacao conta APROVADO mais ENVIADO_PARA_ADMISSAO, e uma triagem de 300 pessoas passaria a ocupar 300 posicoes. Triagem nao e entrega.`,
    ).toBe(false);
  });

  it("importar N candidatos de triagem NAO altera a ocupacao da vaga", async () => {
    const situacao = await exigirExport<CandidaturaSituacao>("dominio", "SITUACAO_NASCIMENTO_DIGAI");

    /** A ocupacao, derivada como o sistema a deriva: contando quem `consomePosicao`. */
    const ocupacao = (situacoes: CandidaturaSituacao[]) => situacoes.filter(consomePosicao).length;

    const antes: CandidaturaSituacao[] = ["APROVADO", "ENVIADO_PARA_ADMISSAO", "ATIVO"];
    const depois = [...antes, ...Array.from({ length: 300 }, () => situacao)];

    expect(
      ocupacao(depois),
      "a ocupacao mudou com a chegada da triagem. O numero que decide se ainda cabe alguem passou a contar quem so foi triado.",
    ).toBe(ocupacao(antes));
  });
});

// ── 4. IDEMPOTENCIA DA IMPORTACAO ──────────────────────────────────────────

describeSuspenso("a importacao e idempotente, e a idempotencia e EXPLICITA", () => {
  interface Plano {
    criar: Array<{ chave: string }>;
    ignorar: Array<{ chave: string }>;
  }

  async function planejar(): Promise<
    (e: { registros: unknown[]; jaImportados: readonly string[] }) => Plano
  > {
    return exigirExport("dominio", "planoDaImportacao");
  }

  const REGISTROS = [
    resultadoDigaiFingido({ userId: "usr-a" }),
    resultadoDigaiFingido({ userId: "usr-b", cpf: CPF_SINTETICO.finalizou }),
    resultadoDigaiFingido({ userId: "usr-c" }),
  ];

  it("a primeira passada cria os tres", async () => {
    const plano = (await planejar())({ registros: REGISTROS, jaImportados: [] });
    expect(plano.criar.length).toBe(3);
    expect(plano.ignorar.length).toBe(0);
  });

  it("a SEGUNDA passada sobre o mesmo payload nao cria nada", async () => {
    /**
     * `as_candidaturas` tem UNIQUE PARCIAL `(candidato_id, vaga_id)` sobre as situacoes VIVAS.
     * Reprocessar o mesmo par BATE no unique, e o que se ganha ao planejar antes e a diferenca
     * entre "nao duplicou" e "estourou a transacao no meio do lote e perdeu as linhas boas".
     */
    const fn = await planejar();
    const primeira = fn({ registros: REGISTROS, jaImportados: [] });
    const segunda = fn({
      registros: REGISTROS,
      jaImportados: primeira.criar.map((c) => c.chave),
    });
    expect(
      segunda.criar,
      "rodar o job duas vezes sobre o mesmo payload NAO pode criar candidato nem candidatura de novo.",
    ).toEqual([]);
    expect(segunda.ignorar.length).toBe(3);
  });

  it("a chave e o `userId`, que a varredura provou ser ESTAVEL", async () => {
    const chave = await exigirExport<(r: unknown) => string>("dominio", "chaveDoRegistroDigai");
    expect(
      chave(resultadoDigaiFingido({ userId: "usr-a", cpf: null })),
      "a chave NAO pode ser o CPF: 88% dos registros nao tem CPF, e o CPF APARECE DEPOIS no MESMO registro. Chave que muda quando a pessoa finaliza duplica exatamente quem finalizou.",
    ).toBe(chave(resultadoDigaiFingido({ userId: "usr-a", cpf: CPF_SINTETICO.finalizou })));
  });

  it("o mesmo `userId` reaparecendo COM CPF atualiza, e nao duplica", async () => {
    const fn = await planejar();
    const chave = await exigirExport<(r: unknown) => string>("dominio", "chaveDoRegistroDigai");
    const antes = resultadoDigaiFingido({ userId: "usr-a", cpf: null });
    const depois = resultadoDigaiFingido({ userId: "usr-a", cpf: CPF_SINTETICO.finalizou });
    const plano = fn({ registros: [depois], jaImportados: [chave(antes)] });
    expect(
      plano.criar,
      "o CPF ATUALIZA NO MESMO REGISTRO (medido: 100 userIds distintos em 100 registros, zero repetidos). Criar de novo cria uma segunda pessoa para a mesma pessoa.",
    ).toEqual([]);
  });

  it("registro sem `partnerJobId` nao vira candidatura orfa", async () => {
    const fn = await planejar();
    const plano = fn({ registros: [resultadoDigaiFingido({ partnerJobId: null })], jaImportados: [] });
    expect(
      plano.criar,
      "o elo com a vaga e o `partnerJobId` (96% preenchido, nunca 100%). Sem elo, a importacao e ADIADA, nunca inventada, pelo mesmo motivo do `cod_cliente` do Pandape (secao A.5).",
    ).toEqual([]);
  });
});
