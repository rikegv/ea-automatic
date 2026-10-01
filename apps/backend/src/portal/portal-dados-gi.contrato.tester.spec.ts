import { describe, expect, it, vi } from "vitest";

/**
 * PORTAL PARA GI, PECAS 1 e 2: O CONTRATO DE COMPORTAMENTO (`tester` independente, §A.38/§A.40).
 *
 * Escrito ANTES do codigo, a partir do REQUISITO, em paralelo a construcao (regra 2 da §A.40). O
 * modulo de dominio `../domain/portal-dados-gi` ainda NAO existe: enquanto ele nao existir, este
 * arquivo FALHA na importacao. Isso e o desenho, nao o defeito (mesma nota de
 * `portal-envio.tester-fake.ts`): quem testa (§A.38) nao e quem escreve, e o teste entra junto com
 * a construcao para nao virar caminho critico.
 *
 * ESTE ARQUIVO E A CONTRAPARTE EXECUTAVEL DO DESENHO `docs/DESENHO-PORTAL-PARA-GI.md` (pecas 1 e 2)
 * e do parecer `docs/PARECER-PORTAL-DOCUMENTOS-CANDIDATO.md`. A SESSAO QUE CONSTROI deve implementar
 * o modulo de dominio com as assinaturas abaixo, OU avisar o coordenador para reconciliar os nomes
 * (dono do vocabulario compartilhado e o coordenador, §A.39).
 *
 * SEAM PROPOSTO (a construir em `apps/backend/src/domain/portal-dados-gi.ts`):
 *   - montarGravacaoDadosGi(entrada): decide O QUE persiste e O QUE vai para a trilha do aceite.
 *   - dadoGiExpirado(expurgarEm, agora): predicado do expurgo (peca 1 / B3).
 *   - montarFuncionarioSelecao(pessoa): monta SO dado de pessoa para o GI (peca 3, inerte).
 *   - executarGatilhoGi(portas, contexto): no-op fail-closed sem credencial do GI.
 *
 * §A.6: todo valor de pessoa aqui e SINTETICO e existe para ser CACADO nos rastros. Nenhum dado
 * real entra em teste. §A.11: sem travessao.
 */

import {
  montarGravacaoDadosGi,
  dadoGiExpirado,
  montarFuncionarioSelecao,
  executarGatilhoGi,
  type EntradaDadosGi,
} from "../domain/portal-dados-gi";

// ── PII SINTETICA, para ser procurada nos rastros que NAO podem carrega-la ──────────────────────
const NOME_SINTETICO = "Fulano De Tal";
const NOME_MAE_SINTETICO = "Maria Das Dores";
const CPF_SINTETICO = "39053344705";
const NASCIMENTO_SINTETICO = "1990-03-14";
const RG_SINTETICO = "12.345.678-9";
const VALORES_PII = [NOME_SINTETICO, NOME_MAE_SINTETICO, CPF_SINTETICO, NASCIMENTO_SINTETICO, RG_SINTETICO];

const ADMISSAO_DA_SESSAO = "22222222-2222-4222-8222-222222222222";
const ADMISSAO_DE_OUTRA_PESSOA = "99999999-9999-4999-8999-999999999999";
const JTI_LINK = "11111111-1111-4111-8111-111111111111";

function entradaBase(over: Partial<EntradaDadosGi> = {}): EntradaDadosGi {
  return {
    admissaoDaSessao: ADMISSAO_DA_SESSAO,
    jtiLink: JTI_LINK,
    campos: [
      { campo: "nomeCompleto", rotulo: "Nome completo", valor: NOME_SINTETICO, confirmadoPorHumano: true },
      { campo: "nomeMae", rotulo: "Nome da mae", valor: NOME_MAE_SINTETICO, confirmadoPorHumano: true },
      // A SUGESTAO CRUA DA IA: chegou marcada como NAO confirmada. Nao pode virar dado final (V12).
      { campo: "cpf", rotulo: "CPF", valor: CPF_SINTETICO, confirmadoPorHumano: false },
      { campo: "dataNascimento", rotulo: "Data de nascimento", valor: NASCIMENTO_SINTETICO, confirmadoPorHumano: false },
    ],
    agora: new Date("2026-09-23T12:00:00Z"),
    ...over,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 1: SO O VALOR CONFIRMADO PELO CANDIDATO PERSISTE (veto V12)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("R1: so o confirmado pelo humano persiste, a sugestao crua da IA e descartada (V12)", () => {
  it("os campos confirmados entram em `valores`", () => {
    const g = montarGravacaoDadosGi(entradaBase());
    expect(g.valores.nomeCompleto).toBe(NOME_SINTETICO);
    expect(g.valores.nomeMae).toBe(NOME_MAE_SINTETICO);
  });

  it("o campo NAO confirmado (confirmadoPorHumano:false) NAO persiste, e vai para `descartados`", () => {
    const g = montarGravacaoDadosGi(entradaBase());
    expect(g.valores.cpf).toBeUndefined();
    expect(g.valores.dataNascimento).toBeUndefined();
    expect(g.descartados).toContain("cpf");
    expect(g.descartados).toContain("dataNascimento");
  });

  it("gravar SEM nenhuma confirmacao humana nao persiste valor nenhum", () => {
    const semConfirmacao = entradaBase({
      campos: [
        { campo: "nomeCompleto", rotulo: "Nome completo", valor: NOME_SINTETICO, confirmadoPorHumano: false },
        { campo: "cpf", rotulo: "CPF", valor: CPF_SINTETICO, confirmadoPorHumano: false },
      ],
    });
    const g = montarGravacaoDadosGi(semConfirmacao);
    expect(Object.keys(g.valores)).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 2: A GRAVACAO E DA ADMISSAO DO BILHETE, NUNCA DA DO CORPO
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("R2: a admissao gravada e a da SESSAO (bilhete), nunca a do corpo do pedido", () => {
  it("sem admissao no corpo, grava na admissao da sessao", () => {
    const g = montarGravacaoDadosGi(entradaBase());
    expect(g.admissaoId).toBe(ADMISSAO_DA_SESSAO);
  });

  it("um corpo que aponta para admissao IGUAL a da sessao e aceito (nao muda nada)", () => {
    const g = montarGravacaoDadosGi(entradaBase({ admissaoNoCorpo: ADMISSAO_DA_SESSAO }));
    expect(g.admissaoId).toBe(ADMISSAO_DA_SESSAO);
  });

  it("um corpo que tenta gravar em admissao DIFERENTE e RECUSADO: ninguem grava dado de outra pessoa", () => {
    expect(() => montarGravacaoDadosGi(entradaBase({ admissaoNoCorpo: ADMISSAO_DE_OUTRA_PESSOA }))).toThrow();
  });

  it("mesmo recusando, o valor nunca vaza na mensagem do erro (§A.6)", () => {
    try {
      montarGravacaoDadosGi(entradaBase({ admissaoNoCorpo: ADMISSAO_DE_OUTRA_PESSOA }));
      throw new Error("deveria ter recusado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const pii of VALORES_PII) expect(msg).not.toContain(pii);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 3: A TRILHA DO ACEITE GUARDA SO OS ROTULOS + QUANDO + SESSAO, NUNCA O VALOR
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("R3: o rastro do aceite carrega rotulos e sessao, jamais o valor (§A.6)", () => {
  it("os rotulos dos campos ACEITOS entram no rastro, os valores NAO", () => {
    const g = montarGravacaoDadosGi(entradaBase());
    expect(g.rotulosAceitos).toContain("Nome completo");
    expect(g.rotulosAceitos).toContain("Nome da mae");
    const rastro = JSON.stringify(g.rotulosAceitos);
    for (const pii of VALORES_PII) expect(rastro).not.toContain(pii);
  });

  it("NENHUM valor de pessoa aparece em nada que nao seja `valores` (o unico campo que persiste dado)", () => {
    const g = montarGravacaoDadosGi(entradaBase());
    // Tudo menos `valores` (que É o dado a persistir) tem de estar limpo de PII.
    const { valores: _valores, ...semOsValores } = g as unknown as Record<string, unknown>;
    const rastro = JSON.stringify(semOsValores);
    for (const pii of VALORES_PII) expect(rastro).not.toContain(pii);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 4: EXPURGO (B3) DO DADO VALIDADO POR TTL, COMO A STAGING
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("R4: o predicado do expurgo apaga so a linha VENCIDA (peca 1 / B3)", () => {
  const agora = new Date("2026-09-23T12:00:00Z");

  it("expurgar_em no passado: vencido", () => {
    expect(dadoGiExpirado(new Date("2026-09-20T12:00:00Z"), agora)).toBe(true);
  });

  it("expurgar_em no futuro: NAO vencido", () => {
    expect(dadoGiExpirado(new Date("2026-09-30T12:00:00Z"), agora)).toBe(false);
  });

  it("sem relogio (expurgar_em nulo): nao expurga por engano", () => {
    expect(dadoGiExpirado(null, agora)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 5: O GATILHO DO GI E INERTE, MONTA SO DADO DE PESSOA E FALHA FECHADO SEM CREDENCIAL
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O INVARIANTE DESTA CASA FOI REESCRITO EM 01/10/2026, por autorizacao do diretor. LEIA ANTES DE
 * MEXER, porque o titulo do `describe` abaixo ficou mais estreito do que a regra de hoje.
 *
 * ANTES: "so dado de PESSOA atravessa; salario e situacao trabalhista NUNCA".
 * AGORA: "dado de PESSOA, MAIS seis campos de CONTRATACAO nomeados, e NADA MAIS".
 *
 * OS SEIS: `salario`, `dataAdmissao`, `vinculo`, `tipoContrato` (o PRAZO `D`/`I` do GI, DERIVADO do
 * vinculo), `codigoEmpresa` e `codigoFilial`.
 *
 * O QUE MUDOU NESTE ARQUIVO: **nenhuma expectativa foi enfraquecida, e nenhum teste abaixo foi tocado.**
 * Isso NAO e sorte: a contratacao entra por um SEGUNDO PARAMETRO NOMEADO de `montarFuncionarioSelecao`,
 * nunca por dentro do objeto de pessoa, entao a garantia que os testes do R5 provam continua VERDADEIRA
 * e continua necessaria: uma chave `salario` DENTRO do objeto de PESSOA NAO atravessa. O salario tem uma
 * porta, e ela tem nome. Uma interface so, alargada, teria obrigado a enfraquecer o R5, e e por isso que
 * sao DUAS allowlists.
 *
 * O QUE FOI ACRESCENTADO: o `describe` R5b, logo depois, que afirma o lado NOVO do invariante (o que
 * passa a atravessar, e o que continua barrado mesmo agora).
 */
describe("R5: `montarFuncionarioSelecao` monta SO dado de pessoa, nunca arquivo/folha/salario/situacao", () => {
  const pessoa = {
    nome: NOME_SINTETICO,
    cpf: CPF_SINTETICO,
    nascimento: NASCIMENTO_SINTETICO,
    rg: RG_SINTETICO,
  };
  // Campos que o GI recebe do TIME na tela dele, nunca desta integracao (DESENHO-PORTAL-PARA-GI §3.3).
  const contaminado = {
    ...pessoa,
    salario: "9999.99",
    situacaoTrabalhista: "PRIMEIRO_EMPREGO",
    arquivo: "s3://kit/cru.pdf",
    folha: { centroDeCusto: "CC-1" },
  };

  it("os dados de pessoa atravessam", () => {
    const f = montarFuncionarioSelecao(pessoa);
    const texto = JSON.stringify(f);
    expect(texto).toContain(CPF_SINTETICO);
  });

  it("salario, situacao trabalhista, arquivo e folha NAO atravessam, mesmo se vierem no objeto", () => {
    const f = montarFuncionarioSelecao(contaminado as never);
    const texto = JSON.stringify(f);
    expect(texto).not.toContain("9999.99");
    expect(texto).not.toContain("PRIMEIRO_EMPREGO");
    expect(texto).not.toContain("s3://kit/cru.pdf");
    expect(texto).not.toContain("CC-1");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 5b: A ALLOWLIST 2 (CONTRATACAO) ATRAVESSA, E CONTINUA SENDO FECHADA
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("R5b: os SEIS campos de contratacao atravessam pela porta NOMEADA, e so eles", () => {
  const SALARIO_SINTETICO = 2000;
  const CONTRATACAO = {
    salario: SALARIO_SINTETICO,
    dataAdmissao: "2026-11-03",
    vinculo: "4",
    tipoContrato: null,
    codigoEmpresa: 1,
    codigoFilial: 4,
  } as const;

  it("os seis atravessam quando vem pela porta nomeada (o que o diretor autorizou)", () => {
    const f = montarFuncionarioSelecao({ cpf: CPF_SINTETICO }, undefined, { ...CONTRATACAO });
    expect(f.salario).toBe(SALARIO_SINTETICO);
    expect(f.dataAdmissao).toBe("2026-11-03");
    expect(f.vinculo).toBe("4");
    expect(f.codigoEmpresa).toBe(1);
    expect(f.codigoFilial).toBe(4);
    expect(f).toHaveProperty("tipoContrato");
  });

  it("a porta da contratacao TAMBEM e fechada: chave de folha a mais nela NAO atravessa", () => {
    // O invariante nao e "agora folha passa", e sim "passam SEIS campos nomeados". Centro de custo,
    // beneficio, escala, gestor BP, motivo e os dados do SUBSTITUIDO continuam fora do envio.
    const contaminada = {
      ...CONTRATACAO,
      centroCusto: "CC-1",
      beneficios: "VT+VR",
      escala: "12x36",
      gestorBp: "Gestor Sintetico",
      motivo: "Substituicao",
      substituidoCpf: "09988877766",
      situacaoTrabalhista: "PRIMEIRO_EMPREGO",
    };
    const texto = JSON.stringify(montarFuncionarioSelecao({ cpf: CPF_SINTETICO }, undefined, contaminada as never));
    for (const proibido of ["CC-1", "VT+VR", "12x36", "Gestor Sintetico", "Substituicao", "09988877766", "PRIMEIRO_EMPREGO"]) {
      expect(texto, `"${proibido}" atravessou para o GI`).not.toContain(proibido);
    }
  });

  it("sem a porta nomeada, os seis saem NULOS: o comportamento de antes desta rodada", () => {
    const f = montarFuncionarioSelecao({ cpf: CPF_SINTETICO });
    for (const campo of ["salario", "dataAdmissao", "vinculo", "tipoContrato", "codigoEmpresa", "codigoFilial"] as const) {
      expect(f[campo], campo).toBeNull();
    }
  });
});

describe("R5: sem cliente/credencial do GI, o gatilho e no-op fail-closed e nao chama nada", () => {
  function portas() {
    const logs: string[] = [];
    const p = {
      enviarAoGi: vi.fn(async () => ({ ok: true })),
      log: vi.fn((msg: string) => logs.push(msg)),
    };
    return { p, logs };
  }

  it("GI nao configurado: nao chama o cliente do GI", async () => {
    const { p } = portas();
    await executarGatilhoGi(p, { giConfigurado: false, pessoa: { cpf: CPF_SINTETICO } });
    expect(p.enviarAoGi).not.toHaveBeenCalled();
  });

  it("GI nao configurado: devolve nao enviado", async () => {
    const { p } = portas();
    const r = await executarGatilhoGi(p, { giConfigurado: false, pessoa: { cpf: CPF_SINTETICO } });
    expect(r.enviado).toBe(false);
  });

  it("GI nao configurado: loga o motivo SEM nenhuma PII", async () => {
    const { p, logs } = portas();
    await executarGatilhoGi(p, { giConfigurado: false, pessoa: { cpf: CPF_SINTETICO, nome: NOME_SINTETICO } });
    const texto = logs.join("\n");
    expect(texto).toMatch(/gi\s+nao\s+configurado/i);
    for (const pii of VALORES_PII) expect(texto).not.toContain(pii);
  });

  // O ENVIO REAL (peca 3) esta PAUSADO por insumo do fornecedor (DESENHO-PORTAL-PARA-GI §3, §0).
  // Quando destravar, o gatilho configurado chama o GI UMA vez com o payload so-de-pessoa.
  it.todo("GI configurado: chama enviarAoGi UMA vez com payload so-de-pessoa (peca 3, PAUSADA)");
  it.todo("GI configurado: idempotencia por admissao/CPF, nao reenvia o mesmo registro (peca 3)");
});
