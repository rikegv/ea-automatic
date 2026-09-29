import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  AS_CANDIDATO_ORIGEM,
  AS_CANDIDATO_ORIGEM_LABEL,
  consomePosicao,
  ETAPAS_FUNIL_SEMENTE,
  type CandidaturaSituacao,
} from "@ea/shared-types";
import { asCandidatoOrigemEnum } from "../../db/schema/enums";
import { BuscarCandidatosDto } from "../candidatos/candidatos.dto";
import { normalizarChaveExterna } from "../../domain/as-etapa-externa";
import {
  CPF_SINTETICO,
  exigirExport,
  fonteExigida,
  resultadoDigaiFingido,
  semComentario,
  sentinelaDasPecas,
  suspensoSem,
} from "./digai.tester-fake";

/**
 * ┌─ SUSPENSO POR PECA, E NAO PELO MODULO INTEIRO (ajuste de 29/09/2026) ───────────────────────┐
 * │ Nada aqui foi apagado. Cada assercao continua escrita palavra por palavra: este arquivo e o │
 * │ CONTRATO que a construcao tem de satisfazer, escrito antes do codigo de proposito (secao    │
 * │ A.38 e secao A.40, regra 2).                                                                │
 * │                                                                                             │
 * │ CADA BLOCO DECLARA DE QUE PECAS PRECISA (`suspensoSem`), e acorda sozinho quando elas        │
 * │ existirem no disco. A medida global de 21/09 (`describeSuspenso`) acordava TUDO quando a     │
 * │ PRIMEIRA peca nascesse, e isso acenderia junto as assercoes de pecas que a OST de hoje NAO   │
 * │ pede (o `reengajar`), cobrando arquivo que ninguem mandou construir (secao A.31).            │
 * │                                                                                             │
 * │ A SENTINELA ABAIXO RODA SEMPRE e diz, em toda rodada, qual peca falta a ESTE arquivo. `skip` │
 * │ que ninguem lembra de reativar e pior do que teste nenhum, porque parece que existe.         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
sentinelaDasPecas("digai.funil-e-contagem.tester.spec.ts", ["dominio", "importacao"]);

/** O bloco do funil precisa do dominio puro E do fonte do modulo (a varredura anti-escrita). */
const comFunil = suspensoSem("dominio", "importacao");
/** Os blocos de contagem e de idempotencia vivem so do dominio puro. */
const comDominio = suspensoSem("dominio");


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

describe("a origem `DIGAI` existe no vocabulario, no banco e no filtro", () => {
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

  it("o enum do banco CONHECE `DIGAI`, e nenhuma migration usa o valor na transacao em que o cria", () => {
    /**
     * ┌─ PREMISSA CORRIGIDA EM 29/09/2026, E ELA ESTAVA ERRADA DESDE 21/09 ─────────────────────┐
     * │ O texto anterior deste `it` exigia encontrar uma migration com `ADD VALUE 'DIGAI'`, e    │
     * │ chamava a ausencia dela de "FALTA IMPLEMENTAR". MEDIDO no repositorio: ela NAO EXISTE e  │
     * │ NAO VAI EXISTIR, porque o valor ja entrou pelo `CREATE TYPE`:                            │
     * │                                                                                          │
     * │   apps/backend/drizzle/0112_as_retencao_campo_proprio.sql:59                              │
     * │     CREATE TYPE "as_candidato_origem" AS ENUM('PANDAPE', 'DIGAI', 'MANUAL', 'INDICACAO'); │
     * │                                                                                          │
     * │ e o valor ja esta em packages/shared-types/src/index.ts:2680 e em                         │
     * │ apps/backend/src/db/schema/enums.ts:403. Exigir um arquivo que nao existe nao protege     │
     * │ nada: obriga a construcao a criar uma migration INUTIL so para o teste ficar verde, e     │
     * │ `ALTER TYPE ... ADD VALUE 'DIGAI'` num tipo que ja o tem e ruido no `migrate`.            │
     * │                                                                                          │
     * │ O QUE ESTE `it` QUERIA PROTEGER DE VERDADE continua inteiro, e sao duas coisas:           │
     * │  1. o banco CONHECE o valor (por `CREATE TYPE` ou por `ADD VALUE`, tanto faz);            │
     * │  2. nenhuma migration USA 'DIGAI' na MESMA transacao em que o cria por `ADD VALUE`, que e │
     * │     o erro do Postgres que passa no `generate` e so aparece no `migrate`, com o banco a   │
     * │     meio caminho (a casa ja pisou nele em 0059, 0086, 0094 e 0095).                        │
     * │ NAO "CONSERTAR" DE VOLTA para a exigencia do arquivo: ela foi medida e esta errada.       │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const pasta = join(__dirname, "../../../drizzle");
    const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql"));

    // (1) O banco conhece o valor, por um dos dois caminhos.
    const nasce = arquivos.filter((f) => {
      const t = readFileSync(join(pasta, f), "utf8");
      const porAddValue = /add\s+value\s+(?:if\s+not\s+exists\s+)?'DIGAI'/i.test(t);
      const porCreateType =
        /create\s+type\s+"?as_candidato_origem"?\s+as\s+enum\s*\([^)]*'DIGAI'/i.test(t);
      return porAddValue || porCreateType;
    });
    expect(
      nasce,
      "nenhuma migration faz o tipo `as_candidato_origem` conhecer 'DIGAI'. O vocabulario e o enum do Drizzle o declaram, e a gravacao estouraria em producao com o typecheck verde.",
    ).not.toEqual([]);

    // (2) Quem cria por ADD VALUE nao usa o valor no mesmo arquivo. Quem cria por CREATE TYPE pode:
    //     tipo criado com o valor dentro ja esta completo na mesma transacao, e a restricao do
    //     Postgres so vale para o ADD VALUE.
    for (const f of arquivos) {
      const corpo = readFileSync(join(pasta, f), "utf8");
      if (!/add\s+value\s+(?:if\s+not\s+exists\s+)?'DIGAI'/i.test(corpo)) continue;
      const usos = semComentario(corpo).replace(/add\s+value[^;]*;/gi, "");
      expect(
        /'DIGAI'/.test(usos),
        `a migration ${f} usa 'DIGAI' na MESMA transacao em que o cria por ADD VALUE. O Postgres nao permite, e o erro so aparece no \`migrate\`, com o banco a meio caminho.`,
      ).toBe(false);
    }
  });
});

// ── 2. O DE/PARA DAS ETAPAS: LINHA EM `as_depara_etapa_externa`, NUNCA ETAPA NOVA ─────────────

/**
 * ┌─ DESENHO CORRIGIDO EM 29/09/2026 PELA OST DO DIRETOR. NAO VOLTAR AO DE 21/09 ───────────────┐
 * │ O contrato de 21/09 tratava `ETAPAS_DIGAI` como ETAPAS NOVAS DO FUNIL (codigo, rotulo,      │
 * │ ordem, tom), ou seja, linhas de `as_etapas_funil`. A OST de 29/09 diz outra coisa, e ela e  │
 * │ mais recente e mais restrita:                                                                │
 * │                                                                                              │
 * │   "O de/para das ETAPAS do Digai PRAS ETAPAS DA PLATAFORMA (como foi feito com as 10 pastas  │
 * │    do Pandape). INVESTIGUEM quais sao as etapas do Digai e proponham o de/para pro Rike      │
 * │    validar."                                                                                 │
 * │                                                                                              │
 * │ Entao o Digai ganha LINHAS em `as_depara_etapa_externa` com `fonte = 'DIGAI'`, apontando     │
 * │ para etapas que JA EXISTEM no catalogo, no molde exato da semente do Pandape na migration    │
 * │ 0110 (`lead` -> CAPTACAO, `triados` -> TRIAGEM). ZERO etapa nova: criar etapa de catalogo    │
 * │ mexe no funil que todo mundo ve e e decisao do diretor (secao A.31, propoe, nao constroi).   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ MEDIDO NOS DOIS BANCOS EM 29/09, e e isto que fixa o alvo ──────────────────────────────────┐
 * │ `ea_automatic` (producao, 118 migrations) e `ea_automatic_homolog` (132) TEM CATALOGOS       │
 * │ DIFERENTES: `CANDIDATURA` so existe na homologacao (e la e a inicial), e `TRIAGEM` esta      │
 * │ ATIVA em producao e INATIVA na homologacao. A FK de `as_depara_etapa_externa` e RESTRICT,    │
 * │ entao semear para `CANDIDATURA` DERRUBA A MIGRATION EM PRODUCAO, e semear para `TRIAGEM`     │
 * │ estaciona a pessoa numa etapa que a homologacao nao mostra: ela entra e ninguem a ve.        │
 * │                                                                                              │
 * │ O UNICO CONJUNTO PRESENTE E ATIVO NOS DOIS e o `ETAPAS_SEGURAS` abaixo, e as duas linhas do  │
 * │ Digai apontam para `CAPTACAO`. Duas chaves externas para a MESMA etapa ja e o padrao da casa │
 * │ (`lead` e `inscritos` do Pandape, 0110). Para qual etapa vai quem FINALIZOU a triagem e      │
 * │ DECISAO DO DIRETOR, e esta no relatorio como item de validacao.                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const ETAPAS_SEGURAS = [
  "CAPTACAO",
  "ENTREVISTA_SOULAN",
  "ENTREVISTA_CLIENTE",
  "APROVACAO",
  "STAND_BY",
] as const;

/** Os dois codigos que NAO podem ser alvo, e o motivo de cada um, medido em 29/09. */
const ETAPAS_PROIBIDAS: ReadonlyArray<[string, string]> = [
  ["CANDIDATURA", "so existe na HOMOLOGACAO. A FK e RESTRICT: em producao a migration cai."],
  ["TRIAGEM", "existe nos dois, mas esta INATIVA na homologacao: a pessoa entra e ninguem a ve."],
];

comFunil("o de/para das etapas do Digai aponta para o catalogo, e NAO cria etapa nova", () => {
  /**
   * A LINHA DO DE/PARA, no molde das colunas da 0110: `chave_externa` (normalizada),
   * `rotulo_externo` (o nome como o Digai o escreve) e `etapa_codigo` (o destino no catalogo).
   * NAO tem `ordem` nem `tom`, porque nao e linha de funil.
   */
  interface DeParaDigai {
    chaveExterna: string;
    rotuloExterno: string;
    etapaCodigo: string;
    situacao?: string;
  }

  async function linhas(): Promise<readonly DeParaDigai[]> {
    return exigirExport<readonly DeParaDigai[]>("dominio", "ETAPAS_DIGAI");
  }

  /**
   * Os alvos, lidos do SQL da semente quando ela ja existir, mais o alvo unico da proposta de hoje
   * (`CAPTACAO`). O teste da marca `entrega_ao_cliente` e SINCRONO (ele varre migration), entao ele
   * nao pode esperar o `import()` do dominio: a lista vem daqui.
   */
  const ALVOS_DO_DEPARA: string[] = (() => {
    const pasta = join(__dirname, "../../../drizzle");
    const achados = new Set<string>(["CAPTACAO"]);
    for (const f of readdirSync(pasta).filter((n) => n.endsWith(".sql"))) {
      const corpo = readFileSync(join(pasta, f), "utf8");
      if (!/\(\s*'DIGAI'\s*,/i.test(corpo)) continue;
      for (const m of corpo.matchAll(/\(\s*'DIGAI'\s*,[^)]*?'([A-Z_]+)'\s*\)/g)) achados.add(m[1]);
    }
    return [...achados];
  })();

  it("sao dois estagios externos: quem NAO finalizou a triagem e quem finalizou", async () => {
    expect(
      (await linhas()).length,
      "a varredura fechou a regra: sem CPF = nao finalizou, com CPF = finalizou. Sao dois estagios, entao sao duas linhas de de/para.",
    ).toBe(2);
  });

  it("a chave externa e a forma NORMALIZADA do rotulo externo", async () => {
    /**
     * A chave e o nome normalizado (`normalizarChaveExterna`), nunca o cru, pelo mesmo motivo do
     * Pandape: nome externo e texto livre, com caixa irregular e pontuacao, e casar por texto cru
     * faz o de/para funcionar num lugar e falhar no do lado, em silencio.
     */
    for (const l of await linhas()) {
      expect(
        l.chaveExterna,
        `a chave '${l.chaveExterna}' nao e a normalizacao de '${l.rotuloExterno}'. O unique da tabela e (fonte, chave_externa), e uma chave crua nunca casaria com a consulta, que normaliza.`,
      ).toBe(normalizarChaveExterna(l.rotuloExterno));
    }
  });

  it("os dois destinos existem no catalogo E estao ATIVOS nos DOIS ambientes", async () => {
    for (const l of await linhas()) {
      expect(
        [...ETAPAS_SEGURAS] as string[],
        `'${l.etapaCodigo}' nao esta no conjunto medido como presente E ativo em producao e homologacao. A FK de \`as_depara_etapa_externa\` e RESTRICT: alvo ausente derruba o \`migrate\` com o banco a meio caminho, e alvo inativo esconde a pessoa da tela.`,
      ).toContain(l.etapaCodigo);
      for (const [proibida, porque] of ETAPAS_PROIBIDAS) {
        expect(l.etapaCodigo, `'${proibida}' nao pode ser alvo: ${porque}`).not.toBe(proibida);
      }
    }
  });

  it("os codigos alvo tambem existem na semente do catalogo, quando ela os declara", async () => {
    /**
     * `ETAPAS_FUNIL_SEMENTE` e a fonte unica que a 0110 copia. `STAND_BY` nao esta nela (nasceu
     * depois, por gesto do diretor), entao a assercao vale para quem a semente declara: o que ela
     * declara tem de bater, e o que ela nao declara ja foi coberto pelo conjunto medido acima.
     */
    const daSemente = ETAPAS_FUNIL_SEMENTE.map((e) => e.codigo as string);
    for (const l of await linhas()) {
      if (!daSemente.includes(l.etapaCodigo) && (ETAPAS_SEGURAS as readonly string[]).includes(l.etapaCodigo)) {
        continue;
      }
      expect(daSemente, `'${l.etapaCodigo}' nao esta na semente nem no conjunto seguro.`).toContain(l.etapaCodigo);
    }
  });

  it("NENHUMA etapa de catalogo e criada, e `inicial` nao e tocada EM LUGAR NENHUM", async () => {
    /**
     * ┌─ ESTE CONTINUA SENDO O TESTE MAIS PERIGOSO DO GRUPO, E O DESENHO NOVO O DEIXA MAIS FORTE ┐
     * │ `as_etapas_funil_inicial_unica` e um INDICE PARCIAL UNICO: existe UMA inicial. Marcar     │
     * │ uma etapa nova como inicial nao gera duas iniciais, gera uma TROCA, e a troca muda onde   │
     * │ TODA candidatura nova nasce, inclusive as do Pandape e as manuais.                        │
     * │                                                                                           │
     * │ Antes se cobrava so um campo `inicial: false` numa lista. Agora se cobra o que importa: o │
     * │ modulo do Digai NAO ESCREVE em `as_etapas_funil`, nem insert, nem update, nem da coluna   │
     * │ `inicial`. A varredura olha o FONTE do modulo e a migration do de/para.                   │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const fonte = semComentario(fonteExigida());
    const escritas = [
      ...fonte.matchAll(/(?:insert\s+into|update|delete\s+from)[^;\n]{0,80}as_etapas_funil/gi),
    ].map((m) => m[0]);
    expect(
      escritas,
      "o modulo do Digai escreve em `as_etapas_funil`. Etapa de catalogo e decisao do diretor (secao A.31), e mexer em `inicial` muda onde toda candidatura nova nasce.",
    ).toEqual([]);
    expect(
      /asEtapasFunil\b[\s\S]{0,120}\b(?:insert|update|set)\b|\binicial\s*:/i.test(fonte),
      "ha escrita no catalogo de etapas (ou na coluna `inicial`) pelo ORM dentro do modulo do Digai.",
    ).toBe(false);
  });

  it("a migration do de/para do Digai, se existir, nao escreve no catalogo nem foge do conjunto seguro", () => {
    /**
     * A migration pode ainda nao existir (a semente espera a validacao do diretor). O teste nao a
     * EXIGE: ele governa a que houver. Foi exatamente a exigencia de um arquivo inexistente que
     * tornou errado o `it` da migration de enum, corrigido neste mesmo arquivo em 29/09.
     */
    const pasta = join(__dirname, "../../../drizzle");
    const doDigai = readdirSync(pasta)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => [f, readFileSync(join(pasta, f), "utf8")] as const)
      // Uma tupla de VALUES que COMECA com 'DIGAI' e semente do de/para. O `IN ('PANDAPE','DIGAI')`
      // dos CHECK das 0109, 0110 e 0113 nao casa com este padrao, e e por isso que ele e este.
      .filter(([, t]) => /\(\s*'DIGAI'\s*,/i.test(t));

    for (const [nome, texto] of doDigai) {
      const corpo = semComentario(texto);
      expect(
        /(?:insert\s+into|update|delete\s+from)\s+"?as_etapas_funil"?/i.test(corpo),
        `a migration ${nome} escreve em "as_etapas_funil". A semente do Digai so acrescenta linhas de de/para.`,
      ).toBe(false);

      const alvos = [...corpo.matchAll(/\(\s*'DIGAI'\s*,[^)]*?'([A-Z_]+)'\s*\)/g)].map((m) => m[1]);
      expect(alvos, `a migration ${nome} tem tupla de 'DIGAI' sem codigo de etapa alvo.`).not.toEqual([]);
      for (const alvo of alvos) {
        expect(
          [...ETAPAS_SEGURAS] as string[],
          `a migration ${nome} aponta para '${alvo}', que NAO esta presente e ativo nos dois ambientes (medido em 29/09). A FK e RESTRICT, e migration que derruba producao so aparece no \`migrate\`, com o banco a meio caminho.`,
        ).toContain(alvo);
      }
    }
  });

  it("NENHUMA etapa alvo do Digai tem a marca `entrega_ao_cliente`", () => {
    /**
     * ┌─ UMA MARCA DE CATALOGO QUE MUDA O STATUS DA VAGA SOZINHA (achado do `seguranca`, 29/09) ┐
     * │ `as/vagas/derivar-status-da-vaga.ts:118` muda o status da vaga QUANDO ha candidatura     │
     * │ VIVA numa etapa marcada `entrega_ao_cliente` (a coluna nasceu na 0130). Semear o de/para │
     * │ do Digai para uma etapa marcada assim faria a chegada de um candidato de TRIAGEM mexer   │
     * │ no status de uma vaga que ninguem entregou a cliente nenhum, e o efeito apareceria numa  │
     * │ tela que nao tem nada a ver com o Digai.                                                 │
     * │                                                                                          │
     * │ MEDIDO: hoje so `ENTREVISTA_CLIENTE` tem a marca, entao `CAPTACAO` esta segura. Mas a    │
     * │ marca e EDITAVEL pelo diretor, e por isso a regra fica travada em teste: o alvo e lido   │
     * │ do SQL que semeia a coluna, e nao de um literal deste arquivo.                            │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const pasta = join(__dirname, "../../../drizzle");
    const marcadas = new Set<string>(["ENTREVISTA_CLIENTE"]);
    for (const f of readdirSync(pasta).filter((f) => f.endsWith(".sql"))) {
      const corpo = semComentario(readFileSync(join(pasta, f), "utf8"));
      if (!/entrega_ao_cliente/i.test(corpo)) continue;
      for (const m of corpo.matchAll(
        /entrega_ao_cliente"?\s*=\s*true[\s\S]{0,200}?codigo"?\s*(?:=|in)\s*\(?\s*'([A-Z_]+)'/gi,
      )) {
        marcadas.add(m[1]);
      }
    }
    for (const codigo of ALVOS_DO_DEPARA) {
      expect(
        [...marcadas],
        `'${codigo}' e etapa de ENTREGA AO CLIENTE. Candidatura de triagem entrando nela muda o status da vaga sozinha (as/vagas/derivar-status-da-vaga.ts:118).`,
      ).not.toContain(codigo);
    }
  });

  it("o rotulo externo respeita o Title Case (secao A.24) e nao usa travessao (secao A.11)", async () => {
    for (const l of await linhas()) {
      expect(l.rotuloExterno.includes(TRAVESSAO), `travessao no rotulo '${l.rotuloExterno}' (secao A.11).`).toBe(false);
      for (const palavra of l.rotuloExterno.split(" ")) {
        if (["de", "da", "do", "e", "em", "para", "a", "o", "nao"].includes(palavra.toLowerCase())) continue;
        expect(
          palavra[0] === palavra[0].toUpperCase(),
          `rotulo externo e TAG, e aparece na tela do de/para: '${l.rotuloExterno}' (secao A.24).`,
        ).toBe(true);
      }
    }
  });

  it("o estagio e escolhido pelo CPF: sem CPF nao finalizou, com CPF finalizou", async () => {
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

  it("os dois estagios sao CHAVES EXTERNAS distintas, e as duas estao na lista do de/para", async () => {
    /**
     * ┌─ QUAL VALOR OS DOIS CONSTANTES CARREGAM, E POR QUE ─────────────────────────────────────┐
     * │ Eles carregam a CHAVE EXTERNA do Digai, e nao o codigo da etapa do catalogo. E a escolha │
     * │ honesta no desenho novo: as duas linhas do de/para apontam HOJE para a MESMA etapa        │
     * │ (`CAPTACAO`, unico alvo seguro nos dois ambientes), entao constantes que carregassem o    │
     * │ codigo da etapa seriam IGUAIS entre si, e o estagio da pessoa deixaria de ser             │
     * │ distinguivel. A chave externa e estavel, e distinta, e e ela que o de/para resolve.      │
     * │ (Se o diretor escolher etapas diferentes para os dois estagios, NADA aqui muda.)         │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const naoFinalizou = await exigirExport<string>("dominio", "ETAPA_DIGAI_NAO_FINALIZOU");
    const finalizou = await exigirExport<string>("dominio", "ETAPA_DIGAI_FINALIZOU");
    expect(naoFinalizou).not.toBe(finalizou);

    const chaves = (await linhas()).map((l) => l.chaveExterna);
    expect(
      chaves,
      "a constante tem de ser uma CHAVE do de/para, senao o resolvedor devolve NAO MAPEADA e a ingestao fica fail-closed para sempre.",
    ).toContain(naoFinalizou);
    expect(chaves).toContain(finalizou);
  });
});

// ── 3. A CONTAGEM DE POSICOES NAO PODE SE MEXER ────────────────────────────

comDominio("candidato de triagem NAO consome posicao da vaga", () => {
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

comDominio("a importacao e idempotente, e a idempotencia e EXPLICITA", () => {
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
