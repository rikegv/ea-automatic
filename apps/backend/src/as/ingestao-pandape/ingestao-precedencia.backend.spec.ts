import { describe, expect, it } from "vitest";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import { bancoFingido, consultaQueCasa } from "./ingestao-repositorio.tester-fake";

/**
 * ─ A TRAVA DE PRECEDENCIA MEDIDA NO PONTO QUE ESCREVE ──────────────────────────────────────────
 *
 * A RÉGUA é domínio puro e tem teste próprio (`domain/as-precedencia-ingestao.spec.ts`). O que se
 * prova AQUI é o que só existe no adaptador: que a instrução que chega ao Postgres deixou de citar as
 * colunas protegidas, que a divergência é emitida com `on conflict` de incremento, e que a duplicata
 * por transferência não vira candidatura nova.
 *
 * O BANCO RESPONDE POR SENTIDO, e não por ordem de chamada (`bancoFingido`): o repositório pode passar
 * a fazer uma leitura a mais amanhã, e um fake posicional entregaria a resposta errada para a consulta
 * certa, deixando o teste verde com o defeito aberto.
 *
 * ┌─ O QUE ESTE ARQUIVO NAO PROVA, DECLARADO PARA NINGUEM SE ENGANAR ───────────────────────────┐
 * │ `ocorrencias = 2` é efeito do ÍNDICE ÚNICO PARCIAL da migration 0136, e índice não existe num  │
 * │ banco fingido. O que se afirma aqui é a outra metade, que é a que pode regredir em código: o   │
 * │ `on conflict` cita o alvo com o MESMO predicado do índice e o `do update` INCREMENTA em vez de │
 * │ inserir, e a volta emite UMA instrução por divergência (duas voltas = duas instruções          │
 * │ idênticas, que o índice colapsa numa linha com `ocorrencias = 2`). O `EXCEPTION` do índice em   │
 * │ si é do Postgres, e a migration é que responde por ele.                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de dado real. O que se lê é o TEXTO da instrução, já com os valores reduzidos a `$1`
 * pelo driver, e as linhas sintéticas não têm dono.
 */

const CANDIDATO = "00000000-0000-4000-8000-0000000000c0";
const CANDIDATURA = "00000000-0000-4000-8000-0000000000c1";
const VAGA = "00000000-0000-4000-8000-0000000000a1";

/** A régua de status, no formato que `escreverVaga` consome. `papel` decide a trava da vaga. */
function reguaFingida(papelDoStatus: string) {
  return {
    regua: () => ({
      codigoDoPapel: (papel: string) => `COD_${papel}`,
      ehDoPapel: (_status: string, papel: string) => papel === papelDoStatus,
      existe: () => true,
      linha: () => ({ encerra: false }),
    }),
    codigoDoPapel: () => "COD_FECHAMENTO",
  };
}

function repositorio(db: never, papelDoStatus = "REVISAO"): IngestaoRepositorio {
  return new IngestaoRepositorio(db, reguaFingida(papelDoStatus) as never, {
    etapaInicial: () => Promise.resolve({ codigo: "CAPTACAO" }),
  } as never);
}

/** As instruções emitidas contra `as_ingestao_divergencias`, em caixa baixa. */
function divergenciasEmitidas(consultas: string[]): string[] {
  return consultas
    .map((c) => c.toLowerCase())
    .filter((c) => /insert\s+into\s+as_ingestao_divergencias/.test(c));
}

// ── 1. A CANDIDATURA QUE JA EXISTE ─────────────────────────────────────────────────────────────

describe("candidatura que JA EXISTE: o ATS não escreve, e a diferença vira divergência", () => {
  /** Um banco com a candidatura já gravada nos valores dados. */
  function comCandidatura(linha: Record<string, unknown>) {
    return bancoFingido([
      { quando: /from as_candidaturas\s*$|from as_candidaturas\n/, devolve: [] },
      { quando: /select id, etapa, situacao, motivo_descarte, admissao_id/, devolve: [linha] },
      { quando: /insert into as_ingestao_divergencias/, devolve: [{ id: "id-da-divergencia" }] },
    ]);
  }

  it("etapa divergente NAO sobrescreve, e gera UMA divergência", async () => {
    const banco = comCandidatura({
      id: CANDIDATURA,
      etapa: "ENTREVISTA_CLIENTE",
      situacao: "ATIVO",
      motivo_descarte: null,
      admissao_id: null,
    });
    const r = await repositorio(banco.db).escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      valores: { candidato_id: CANDIDATO, vaga_id: VAGA, etapa: "CAPTACAO" },
    });

    /*
     * O QUE ISTO PROVA, e é o defeito medido em 30/09: NENHUM `update as_candidaturas` é emitido. O
     * que havia era `set etapa = ... where (atuais) is distinct from (novos)`, e aquele `is distinct
     * from` era o GATILHO, não a proteção: valor diferente era justamente o caso que ele autorizava.
     * O time avançava a pessoa e em até 30 minutos ela voltava, em 24 das 27 pastas do de/para.
     */
    expect(consultaQueCasa(banco.consultas, /update\s+as_candidaturas/)).toBeNull();
    expect(r.linhasAfetadas).toBe(0);
    expect(r.criada).toBe(false);
    expect(r.divergencias).toBe(1);
    expect(divergenciasEmitidas(banco.consultas)).toHaveLength(1);
  });

  it("`situacao` divergente NUNCA escreve, inclusive DESCARTADO", async () => {
    const banco = comCandidatura({
      id: CANDIDATURA,
      etapa: "CAPTACAO",
      situacao: "ATIVO",
      motivo_descarte: null,
      admissao_id: null,
    });
    const r = await repositorio(banco.db).escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      valores: {
        candidato_id: CANDIDATO,
        vaga_id: VAGA,
        etapa: "CAPTACAO",
        situacao: "DESCARTADO",
        motivo_descarte: "Reprovado no processo",
      },
    });

    /*
     * O QUE ISTO PROVA: a decisão 2 do diretor, "situacao NUNCA é sobrescrita, INCLUSIVE DESCARTADO".
     * O ATS descartando alguém que o EA tem como ATIVO encerraria a candidatura, liberaria a posição
     * da vaga e tiraria a pessoa das filas, tudo sem autor e sem trilha.
     *
     * UMA DIVERGENCIA, E NAO DUAS, e a diferença é o veto do `seguranca` de 30/09/2026:
     * `motivo_descarte` continua PROTEGIDO (o ATS não o escreve, e é por isso que nenhum `update`
     * sai daqui) mas NAO VIRA LINHA DE FILA, porque ele é PROSA no `ENVIADO_PARA_ADMISSAO` e a fila
     * guarda os valores EM CLARO, fora do alcance do expurgo. A etapa IGUAL também não diverge, o que
     * prova que a comparação vem antes da proteção.
     */
    expect(consultaQueCasa(banco.consultas, /update\s+as_candidaturas/)).toBeNull();
    expect(r.divergencias).toBe(1);
    expect(divergenciasEmitidas(banco.consultas)).toHaveLength(1);
  });

  it("`motivo_descarte` divergente NAO escreve E NAO abre linha de fila (veto de §A.6)", async () => {
    const banco = comCandidatura({
      id: CANDIDATURA,
      etapa: "CAPTACAO",
      situacao: "ATIVO",
      motivo_descarte: "Frase que uma PESSOA digitou sobre este caso",
      admissao_id: null,
    });
    const r = await repositorio(banco.db).escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      valores: {
        candidato_id: CANDIDATO,
        vaga_id: VAGA,
        etapa: "CAPTACAO",
        situacao: "ATIVO",
        motivo_descarte: "Motivo padrao generico da pasta do ATS",
      },
    });

    /*
     * O QUE ISTO PROVA, e são DUAS propriedades opostas na mesma linha (veto do `seguranca`, 30/09):
     *
     * 1. A TRAVA FICOU. Nenhum `update as_candidaturas` sai, então a frase que uma pessoa digitou NÃO
     *    é trocada pelo `motivo_padrao` genérico do de/para (uma linha de configuração igual para toda
     *    a pasta). Sem a trava, informação específica viraria rótulo de lote a cada 30 minutos.
     *
     * 2. A LINHA DE FILA SAIU. A fila guarda `valor_ea`/`valor_ats` EM CLARO, e aquele campo é PROSA
     *    no `ENVIADO_PARA_ADMISSAO` (`candidatos.dto.ts`, teto de 500). O expurgo NULA a coluna na
     *    candidatura, mas ele ANONIMIZA sem DELETAR a candidatura, então o `on delete cascade` da
     *    tabela da fila NUNCA dispararia: a frase ficaria lá, em claro, para sempre.
     *
     * O PRECO ACEITO, escrito para ninguém "consertar" isto depois: a divergência de motivo é
     * SILENCIOSA. O EA vence e o time não é avisado.
     */
    expect(consultaQueCasa(banco.consultas, /update\s+as_candidaturas/)).toBeNull();
    expect(r.divergencias).toBe(0);
    expect(divergenciasEmitidas(banco.consultas)).toEqual([]);
    // E A FRASE NAO VIAJA NO TEXTO DE NENHUMA INSTRUCAO: nem a do EA, nem a do ATS.
    const tudo = banco.consultas.join(" ");
    expect(tudo).not.toContain("Frase que uma PESSOA digitou");
    expect(tudo).not.toContain("Motivo padrao generico");
  });

  it("os DOIS lados iguais não abrem linha nenhuma", async () => {
    // O QUE ISTO PROVA: a fila não vira log. A maioria das voltas concorda com o EA, e concordar não é
    // trabalho a fazer.
    const banco = comCandidatura({
      id: CANDIDATURA,
      etapa: "CAPTACAO",
      situacao: "ATIVO",
      motivo_descarte: null,
      admissao_id: null,
    });
    const r = await repositorio(banco.db).escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      valores: { candidato_id: CANDIDATO, vaga_id: VAGA, etapa: "CAPTACAO", situacao: "ATIVO" },
    });
    expect(r.divergencias).toBe(0);
    expect(divergenciasEmitidas(banco.consultas)).toEqual([]);
  });

  it("devolve o insumo da RETENTATIVA da ponte: a situação do EA e se já há admissão", async () => {
    /*
     * O QUE ISTO PROVA: o item 6. A ponte deixou de disparar só no nascimento, e a condição nova
     * (`ENVIADO_PARA_ADMISSAO` com `admissao_id` nulo) depende destes dois campos subirem do
     * adaptador. Sem eles, `ponteDeveDisparar` cai no fail-closed e a ponte adiada nunca é retentada.
     */
    const banco = comCandidatura({
      id: CANDIDATURA,
      etapa: "CAPTACAO",
      situacao: "ENVIADO_PARA_ADMISSAO",
      motivo_descarte: null,
      admissao_id: null,
    });
    const r = await repositorio(banco.db).escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      valores: { candidato_id: CANDIDATO, vaga_id: VAGA, etapa: "CAPTACAO" },
    });
    expect(r.situacaoNoEa).toBe("ENVIADO_PARA_ADMISSAO");
    expect(r.jaTemAdmissao).toBe(false);
  });

  it("a divergência é emitida com `on conflict` de INCREMENTO, e não com insert cego", async () => {
    const banco = comCandidatura({
      id: CANDIDATURA,
      etapa: "ENTREVISTA_CLIENTE",
      situacao: "ATIVO",
      motivo_descarte: null,
      admissao_id: null,
    });
    await repositorio(banco.db).escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      valores: { candidato_id: CANDIDATO, vaga_id: VAGA, etapa: "CAPTACAO" },
    });
    const instrucao = divergenciasEmitidas(banco.consultas)[0];
    /*
     * O QUE ISTO PROVA: sem o `on conflict`, a MESMA divergência viraria 48 linhas por dia (a
     * varredura roda de 30 em 30 minutos) e a fila de trabalho viraria log. O alvo repete o predicado
     * do índice PARCIAL porque é assim que o Postgres infere qual índice é o árbitro, e o predicado
     * inclui `candidatura_id is not null` porque nulo não colide com nulo num índice único.
     */
    expect(instrucao).toContain("on conflict");
    expect(instrucao).toContain("resolvido_em is null");
    expect(instrucao).toContain("candidatura_id is not null");
    expect(instrucao).toContain("ocorrencias = as_ingestao_divergencias.ocorrencias + 1");
    expect(instrucao).toContain("ultima_em = now()");
    // `primeira_em` NAO É TOCADA: "desde quando isto acontece" é a informação mais útil da fila, e a
    // única que o incremento poderia destruir.
    expect(instrucao).not.toContain("primeira_em =");
  });
});

// ── 2. A DUPLICATA POR TRANSFERENCIA ───────────────────────────────────────────────────────────

describe("o candidato TRANSFERIDO para outra vaga não ganha candidatura nova", () => {
  it("NAO insere, e registra divergência de `vaga_do_candidato`", async () => {
    const banco = bancoFingido([
      // Não há candidatura em (candidato, ESTA vaga): a troca MOVEU a linha para a vaga nova.
      { quando: /select id, etapa, situacao, motivo_descarte, admissao_id/, devolve: [] },
      // Mas a TRILHA tem o evento de troca, com `vaga_de` apontando para esta vaga.
      {
        quando: /from as_candidatura_etapas/,
        devolve: [
          { candidatura_id: CANDIDATURA, rotulo_atual: "VAGA-NOVA", rotulo_origem: "VAGA-ANTIGA" },
        ],
      },
      { quando: /insert into as_ingestao_divergencias/, devolve: [{ id: "id-da-divergencia" }] },
    ]);
    const r = await repositorio(banco.db).escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      valores: { candidato_id: CANDIDATO, vaga_id: VAGA, etapa: "CAPTACAO" },
    });

    /*
     * O QUE ISTO PROVA: o item 4. O time troca a pessoa de vaga, o ATS continua com ela na vaga
     * ANTIGA, e a volta seguinte não encontrava candidatura naquele par e INSERIA: a pessoa passava a
     * estar nas DUAS vagas, consumindo DUAS posições, e a transferência era desfeita por acréscimo.
     *
     * E O CONSERTO NAO RESSUSCITA `as_candidaturas.id_match_pandape`: a migration 0112 o derrubou por
     * LGPD registrada (segunda gaveta de identificador de terceiro, fora do alcance do expurgo). O
     * sinal usado é a TRILHA (`vaga_de`), que já existe e que já nasce dentro do expurgo.
     */
    expect(consultaQueCasa(banco.consultas, /insert\s+into\s+as_candidaturas/)).toBeNull();
    expect(r.criada).toBe(false);
    expect(r.divergencias).toBe(1);
    expect(divergenciasEmitidas(banco.consultas)).toHaveLength(1);
  });

  it("sem evento de transferência, a candidatura NASCE normalmente", async () => {
    // O QUE ISTO PROVA: a guarda é cirúrgica. Sem este caso verde, a trava poderia estar recusando
    // TODA entrada nova, e o teste de cima ficaria verde do mesmo jeito.
    const banco = bancoFingido([
      { quando: /select id, etapa, situacao, motivo_descarte, admissao_id/, devolve: [] },
      { quando: /from as_candidatura_etapas/, devolve: [] },
      { quando: /insert into as_candidaturas/, devolve: [{ id: CANDIDATURA }] },
    ]);
    const r = await repositorio(banco.db).escrever({
      tabela: "as_candidaturas",
      acao: "upsert",
      valores: { candidato_id: CANDIDATO, vaga_id: VAGA, etapa: "CAPTACAO" },
    });
    expect(r.criada).toBe(true);
    expect(r.divergencias).toBe(0);
    expect(divergenciasEmitidas(banco.consultas)).toEqual([]);
  });
});

// ── 3. A VAGA ──────────────────────────────────────────────────────────────────────────────────

describe("a vaga: os quatro campos do ATS só entram ENQUANTO ela está em revisão", () => {
  /** Um banco com a vaga espelhada já gravada, matriculada e não encerrada. */
  function comVaga() {
    return bancoFingido([
      {
        quando: /left join as_varredura_vagas m on m\.vaga_id = v\.id/,
        devolve: [
          {
            id: VAGA,
            status: "QUALQUER",
            codigo: "CODIGO-DO-EA",
            nome_divulgacao: "Nome Conferido Por Gente",
            cidade_id: 3550308,
            posicoes_oficiais: 5,
            status_antes: null,
            da_varredura: true,
            encerrou: false,
          },
        ],
      },
      { quando: /insert into as_ingestao_divergencias/, devolve: [{ id: "id-da-divergencia" }] },
      { quando: /update vagas/, devolve: [{ id: VAGA }] },
    ]);
  }

  const doAts = {
    id_vacancy_pandape: "9001",
    codigo: "CODIGO-DO-ATS",
    nome_divulgacao: "Nome Do ATS",
    cidade_id: "Sao Paulo - SP",
    posicoes_oficiais: 9,
  };

  it("vaga EM REVISAO RECEBE os quatro campos", async () => {
    const banco = comVaga();
    await repositorio(banco.db, "REVISAO").escrever({
      tabela: "vagas",
      acao: "upsert",
      valores: doAts,
    });
    const update = consultaQueCasa(banco.consultas, /update\s+vagas/);
    /*
     * O QUE ISTO PROVA: a trava é cirúrgica. Na fila de revisão ninguém conferiu nada ainda, e o
     * espelho do ATS é a melhor informação que existe: travar aqui congelaria a vaga espelhada no
     * primeiro retrato e ninguém veria a correção que o recrutador fez no ATS.
     */
    expect(update).not.toBeNull();
    expect(update).toContain("codigo =");
    expect(update).toContain("nome_divulgacao =");
    expect(update).toContain("cidade_id =");
    expect(update).toContain("posicoes_oficiais =");
    expect(divergenciasEmitidas(banco.consultas)).toEqual([]);
  });

  it("vaga JA LIBERADA NAO recebe nenhum dos quatro, e gera divergência para cada um", async () => {
    const banco = comVaga();
    const r = await repositorio(banco.db, "ABERTURA").escrever({
      tabela: "vagas",
      acao: "upsert",
      valores: doAts,
    });
    /*
     * O QUE ISTO PROVA: a decisão 3 do diretor. Depois da liberação, cada um dos quatro campos foi
     * olhado por gente, e reescrevê-los de 30 em 30 minutos desfaz a conferência sem autor, sem data
     * e sem trilha. Medido antes desta trava: o `codigo` e o `nome_divulgacao` digitados eram
     * sobrescritos pelo ATS a cada volta.
     *
     * E NENHUM `update vagas` É EMITIDO: sem reabertura e sem campo a escrever, o único efeito da
     * instrução seria empurrar `atualizado_em`, que é o relógio do expurgo de quem está DENTRO da
     * vaga. Um `set atualizado_em = now()` sozinho, 48 vezes por dia, é o defeito da trava do DIARIO
     * com outro nome.
     */
    expect(consultaQueCasa(banco.consultas, /update\s+vagas/)).toBeNull();
    expect(r.linhasAfetadas).toBe(0);
    expect(r.divergencias).toBe(4);
    expect(divergenciasEmitidas(banco.consultas)).toHaveLength(4);
  });

  it("a divergência da VAGA usa o outro índice: sem candidatura na chave", async () => {
    const banco = comVaga();
    await repositorio(banco.db, "ABERTURA").escrever({
      tabela: "vagas",
      acao: "upsert",
      valores: doAts,
    });
    const instrucao = divergenciasEmitidas(banco.consultas)[0];
    /*
     * O QUE ISTO PROVA: são DOIS índices únicos parciais, e não um. Em Postgres, nulo não colide com
     * nulo num índice único, então a chave da linha de escopo VAGA (que não tem candidatura) precisa
     * do índice em que `candidatura_id IS NULL` é o predicado. Com um índice só, a reincidência da
     * divergência de vaga criaria linha nova em toda volta.
     */
    expect(instrucao).toContain("candidatura_id is null");
    expect(instrucao).toContain("ocorrencias = as_ingestao_divergencias.ocorrencias + 1");
  });
});
