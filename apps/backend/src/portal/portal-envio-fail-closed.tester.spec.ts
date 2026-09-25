import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalCorreioService } from "./portal-correio.service";
import { PortalEnvioService } from "./portal-envio.service";
import {
  ADMISSAO_SINTETICA,
  AUTOR_SINTETICO,
  CANDIDATURA_SINTETICA,
  CPF_SINTETICO,
  EMAIL_INVALIDO_SINTETICO,
  EMAIL_SINTETICO,
  JTI_SINTETICO,
  SEGREDOS,
  URL_SINTETICA,
  bancoDoEnvio,
  correioFake,
  filaFake,
  identidadeFake,
  instanciarPorTipos,
  textoDeTudo,
  trilhaFake,
  type CenarioDoEnvio,
} from "./portal-envio.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE (§A.38/§A.40) DO SERVIÇO DE ENVIO DO LINK ────────────────────────────
 *
 * Escrito ANTES do código, contra o REQUISITO. Enquanto `portal-envio.service.ts` e
 * `portal-correio.service.ts` não existirem, este arquivo falha na IMPORTAÇÃO: é o desenho.
 *
 * ┌─ A REGRA QUE ESTE ARQUIVO EXISTE PARA PROTEGER ──────────────────────────────────────────────┐
 * │ EMITIR E NÃO ENTREGAR É O PIOR DESFECHO, e ele é silencioso: nada falha. Sobra uma            │
 * │ CREDENCIAL VIVA de acesso ao prontuário que NINGUÉM recebeu, e a emissão ainda REVOGA o link  │
 * │ anterior, matando a sessão de quem estava enviando documento naquele instante. Por isso a     │
 * │ asserção central de quase todo teste aqui é NEGATIVA: `identidade.emitidos` continua vazio.   │
 * │ É a família da §A.33 (abster-se é o comportamento seguro).                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NOTA DE ASSINATURA: o contrato de tipos fixou os NOMES (`enviarParaAdmissao`,
 * `previaDeCandidaturas`, `enviarParaCandidaturas`, `admissoesSemLink`), não a ordem dos
 * parâmetros nem a do construtor. O construtor é montado por TIPO (`instanciarPorTipos`), e as
 * chamadas usam `(alvo, autor, origem)`. Se a ordem final for outra, ajuste ESTE auxiliar e NADA
 * MAIS: o que o arquivo afirma é o comportamento.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const config = (valores: Record<string, string> = {}) =>
  ({
    get: (chave: string) => valores[chave],
    getOrThrow: (chave: string) => {
      const v = valores[chave];
      if (v === undefined) throw new Error(`config ausente: ${chave}`);
      return v;
    },
  }) as never;

function montar(
  cenario: CenarioDoEnvio,
  opcoes: {
    correio?: { configurado?: boolean; falhaAoEnviar?: boolean; lancaAoEnviar?: boolean };
    jaAtivo?: { jti: string; expiraEm: Date } | null;
  } = {},
) {
  const banco = bancoDoEnvio(cenario);
  const identidade = identidadeFake({ jaAtivo: opcoes.jaAtivo ?? null });
  const correio = correioFake(opcoes.correio ?? {});
  const trilha = trilhaFake();
  const fila = filaFake();

  const servico = instanciarPorTipos(
    PortalEnvioService as any,
    {
      Database: banco.db,
      PortalIdentidadeService: identidade.fake,
      PortalEmissorService: identidade.fake,
      PortalCorreioService: correio.fake,
      PortalTrilhaService: trilha.fake,
      ConfigService: config(),
    },
    { arquivo: ["portal", "portal-envio.service.ts"], classe: "PortalEnvioService" },
  ) as any;

  return { servico, banco, identidade, correio, trilha, fila };
}

/** Tudo o que o sistema GUARDOU, LOGOU ou ENFILEIROU. O que o correio recebeu fica de fora: é o destino. */
function oQueFicou(m: ReturnType<typeof montar>, logs: unknown[]) {
  return textoDeTudo([m.banco.escritas, m.trilha.registros, m.fila.jobs, logs]);
}

const logs: unknown[] = [];
beforeEach(() => {
  logs.length = 0;
  for (const metodo of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, metodo).mockImplementation(((...a: unknown[]) => {
      logs.push(a);
    }) as never);
  }
});
afterEach(() => vi.restoreAllMocks());

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 1 — E-MAIL VAZIO: AVISA, NÃO ENVIA E NÃO EMITE
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("e-mail vazio: avisa, não envia e NÃO EMITE (regra 3 da OST, decisão do diretor)", () => {
  it("recusa com SEM_EMAIL", async () => {
    const m = montar({ pessoa: { email: null } });
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("SEM_EMAIL");
  });

  /** O TESTE MAIS IMPORTANTE DA FRENTE. Link emitido sem entrega é credencial órfã. */
  it("NENHUM link é emitido", async () => {
    const m = montar({ pessoa: { email: null } });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(m.identidade.emitidos, "credencial viva que ninguém recebeu").toEqual([]);
  });

  it("nenhuma linha nova entra em `portal_links`", async () => {
    const m = montar({ pessoa: { email: null } });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(m.banco.escritas.filter((e) => e.tipo === "insert")).toEqual([]);
  });

  /**
   * E O LINK VIVO ANTERIOR CONTINUA VIVO. Este é o dano invisível do achado 4 do mapa: a recusa
   * "sem e-mail" não pode, como efeito colateral, derrubar a sessão de quem está enviando
   * documento naquele exato instante.
   */
  it("nenhum link vivo anterior é revogado", async () => {
    const m = montar({
      pessoa: { email: null },
      links: [{ id: JTI_SINTETICO, admissaoId: ADMISSAO_SINTETICA, primeiroAcessoEm: new Date() }],
    });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(m.identidade.revogados).toEqual([]);
    const revogacoes = m.banco.escritas.filter((e) => "revogadoEm" in e.valores);
    expect(revogacoes, "a recusa matou a sessão de quem estava enviando documento").toEqual([]);
  });

  it("o correio não é sequer chamado", async () => {
    const m = montar({ pessoa: { email: null } });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(m.correio.enviados).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 2 — E-MAIL INVÁLIDO É RECUSA DISTINTA
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("e-mail inválido é recusa DISTINTA de e-mail vazio", () => {
  it("devolve EMAIL_INVALIDO, e não SEM_EMAIL", async () => {
    const m = montar({ pessoa: { email: EMAIL_INVALIDO_SINTETICO } });
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(r.motivo).toBe("EMAIL_INVALIDO");
  });

  it("também não emite: o endereço errado não justifica credencial órfã", async () => {
    const m = montar({ pessoa: { email: EMAIL_INVALIDO_SINTETICO } });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(m.identidade.emitidos).toEqual([]);
    expect(m.correio.enviados).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 3 — CANAL INERTE (S8, fail-closed provado)
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("canal inerte: sem credencial, recusa, e o link NÃO nasce", () => {
  it("nada lança no boot: o serviço se constrói com a configuração VAZIA", () => {
    expect(() =>
      instanciarPorTipos(
        PortalCorreioService as any,
        { ConfigService: config() },
        { arquivo: ["portal", "portal-correio.service.ts"], classe: "PortalCorreioService" },
      ),
    ).not.toThrow();
  });

  it("`configurado()` é falso quando a credencial está vazia", () => {
    const correio = instanciarPorTipos(
      PortalCorreioService as any,
      { ConfigService: config() },
      { arquivo: ["portal", "portal-correio.service.ts"], classe: "PortalCorreioService" },
    ) as any;
    expect(correio.configurado()).toBe(false);
  });

  it("o envio recusa com CANAL_INDISPONIVEL", async () => {
    const m = montar({ pessoa: {} }, { correio: { configurado: false } });
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("CANAL_INDISPONIVEL");
  });

  /**
   * A METADE QUE COSTUMA FALTAR: recusar depois de emitir é o mesmo dano da regra 1, e é o modo de
   * falha natural de quem só põe a guarda do canal na hora de despachar o e-mail.
   */
  it("e o link NÃO é emitido, nem o anterior revogado", async () => {
    const m = montar(
      {
        pessoa: {},
        links: [{ id: JTI_SINTETICO, admissaoId: ADMISSAO_SINTETICA, primeiroAcessoEm: new Date() }],
      },
      { correio: { configurado: false } },
    );
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(m.identidade.emitidos).toEqual([]);
    expect(m.identidade.revogados).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 4 — FALHA NO ENVIO DEPOIS DA EMISSÃO: O LINK É REVOGADO
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("falha no envio depois da emissão: a credencial não fica órfã", () => {
  const cenario = { pessoa: {} } satisfies CenarioDoEnvio;

  it("o resultado é FALHA_NO_ENVIO, e não um sucesso silencioso", async () => {
    const m = montar(cenario, { correio: { falhaAoEnviar: true } });
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("FALHA_NO_ENVIO");
  });

  /**
   * A COMPENSAÇÃO. O link JÁ nasceu quando o correio recusou, então abster-se não basta: é preciso
   * DESFAZER. Sem isso sobra exatamente a credencial viva que ninguém recebeu, com 72 horas de
   * vida, e a admissão ainda aparece no Gerenciador como "encaminhada".
   */
  it("o link recém-emitido é REVOGADO", async () => {
    const m = montar(cenario, { correio: { falhaAoEnviar: true } });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(m.identidade.emitidos.length, "o cenário não chegou a emitir").toBe(1);
    const revogouPelaPorta = m.identidade.revogados.length > 0;
    const revogouNoBanco = m.banco.escritas.some((e) => "revogadoEm" in e.valores);
    expect(revogouPelaPorta || revogouNoBanco, "credencial órfã de 72 horas").toBe(true);
  });

  /**
   * ┌─ A OUTRA FORMA DE FALHAR, e ela não está coberta pelo desenho atual ─────────────────────┐
   * │ O serviço trata o correio que DEVOLVE falso, e o `enviarLink` promete devolver falso em   │
   * │ toda falha prevista (rede, tempo limite, token recusado, resposta de erro). Mas a chamada │
   * │ NÃO está dentro de um `try`: um erro NÃO previsto (um `undefined` de uma refatoração, um  │
   * │ `JSON.parse` que estoure antes do `catch` interno) sobe, e o link recém-emitido fica VIVO │
   * │ e órfão, com 72 horas, tendo matado o anterior no caminho. E o gancho do caminho 1        │
   * │ ENGOLE essa exceção de propósito (regra 9), então nada aparece em lugar nenhum.           │
   * │                                                                                          │
   * │ A promessa "toda falha volta como falso" é um contrato ENTRE DOIS ARQUIVOS, sustentado    │
   * │ por um `catch` no outro. Este teste é o que o prende.                                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("mesmo se o correio LANÇAR, o link não fica órfão", async () => {
    const m = montar(cenario, { correio: { lancaAoEnviar: true } });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL").catch(() => {});
    expect(m.identidade.emitidos.length, "o cenário não chegou a emitir").toBe(1);
    expect(
      m.identidade.revogados.length > 0,
      "exceção inesperada do correio deixa credencial viva de 72 horas",
    ).toBe(true);
  });

  it("a falha do correio não vaza o endereço nem a URL para log, banco ou fila (§A.6)", async () => {
    const m = montar(cenario, { correio: { falhaAoEnviar: true } });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    const ficou = oQueFicou(m, logs);
    for (const segredo of SEGREDOS) expect(ficou).not.toContain(segredo);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 5 — IDEMPOTÊNCIA (S15): O AUTOMÁTICO NÃO MATA A SESSÃO DE QUEM ESTÁ ENVIANDO
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("idempotência: link vivo JÁ ACESSADO não é reemitido (S15)", () => {
  /**
   * A ABSTENÇÃO É DECIDIDA NO SERVIÇO DE IDENTIDADE, dentro da transação, e por isso quem a MEDE é
   * `portal-envio-abstencao.tester.spec.ts`, contra o serviço REAL. Aqui se prova a outra metade,
   * que é dele: o que o serviço de ENVIO faz quando a emissão se absteve.
   */
  const abstido = { jti: JTI_SINTETICO, expiraEm: new Date(Date.now() + 40 * 3_600_000) };

  it("não manda e-mail nenhum: o link vivo não é reenviado por um link que não existe", async () => {
    const m = montar({ pessoa: {} }, { jaAtivo: abstido });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(m.correio.enviados).toEqual([]);
  });

  it("não carimba envio nenhum: nada saiu, e o painel não pode dizer que saiu", async () => {
    const m = montar({ pessoa: {} }, { jaAtivo: abstido });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(m.identidade.carimbos).toEqual([]);
  });

  it("não revoga o que está em uso", async () => {
    const m = montar({ pessoa: {} }, { jaAtivo: abstido });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(m.identidade.revogados).toEqual([]);
    expect(m.banco.escritas.some((e) => "revogadoEm" in e.valores)).toBe(false);
  });

  /**
   * ┌─ GAP DE CONTRATO, e ele é de REQUISITO, não de implementação ───────────────────────────────┐
   * │ A abstenção volta como `enviado: false` com `motivo: null`. O contrato de tipos diz, na      │
   * │ linha do campo, que `motivo` é "nulo quando `enviado` é verdadeiro": um `false` com motivo   │
   * │ nulo é, pela letra do contrato, um estado que não existe. A tela que decidir pelo CÓDIGO     │
   * │ (que é o que o contrato manda fazer, e a razão de o motivo ser código e não frase) cai no    │
   * │ ramo de "não sei o que houve" numa recusa que é a mais comum das cinco.                      │
   * │                                                                                             │
   * │ O conserto é do COORDENADOR (§A.39, dono único de `shared-types`): um sexto código na lista  │
   * │ `MOTIVOS_DE_RECUSA_DE_ENVIO`. O autor documentou a escolha e ela é honesta, mas ela deixa o  │
   * │ contrato dizendo uma coisa e o código devolvendo outra.                                      │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a recusa é LEGÍVEL por código, e não só por frase", async () => {
    const m = montar({ pessoa: {} }, { jaAtivo: abstido });
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(r.enviado).toBe(false);
    expect(
      r.motivo,
      "recusa sem código: a tela não tem como distinguir abstenção de defeito",
    ).not.toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 6 — SEM_ADMISSAO: "AINDA NÃO", E NÃO ERRO
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("candidatura sem admissão: recusa sem erro e sem emitir nada", () => {
  const semAdmissao: CenarioDoEnvio = {
    pessoa: { id: CANDIDATURA_SINTETICA, admissaoId: null },
  };

  it("não lança: a ponte A&S para a Esteira é outra frente, e isto é 'ainda não'", async () => {
    const m = montar(semAdmissao);
    await expect(
      m.servico.enviarParaCandidaturas([CANDIDATURA_SINTETICA], AUTOR_SINTETICO),
    ).resolves.toBeTruthy();
  });

  it("devolve SEM_ADMISSAO na lista de recusados, nominalmente", async () => {
    const m = montar(semAdmissao);
    const r = await m.servico.enviarParaCandidaturas([CANDIDATURA_SINTETICA], AUTOR_SINTETICO);
    expect(r.enviados).toBe(0);
    expect(r.recusados.map((x: any) => x.motivo)).toEqual(["SEM_ADMISSAO"]);
  });

  it("não emite, não envia e não escreve nada", async () => {
    const m = montar(semAdmissao);
    await m.servico.enviarParaCandidaturas([CANDIDATURA_SINTETICA], AUTOR_SINTETICO);
    expect(m.identidade.emitidos).toEqual([]);
    expect(m.correio.enviados).toEqual([]);
    expect(m.banco.escritas.filter((e) => e.tipo === "insert")).toEqual([]);
  });

  it("a prévia já avisa, ANTES do clique que dispara (decisão 3 do diretor)", async () => {
    const m = montar(semAdmissao);
    const previa = await m.servico.previaDeCandidaturas([CANDIDATURA_SINTETICA]);
    expect(previa.enviaveis).toBe(0);
    expect(previa.recusados).toBe(1);
    expect(previa.itens[0].podeEnviar).toBe(false);
    expect(previa.itens[0].motivo).toBe("SEM_ADMISSAO");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A PRÉVIA DO LOTE, E O §A.6 DELA
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("prévia do lote: nome e destino MASCARADO, e quem fica de fora aparece separado", () => {
  const tres: CenarioDoEnvio = {
    pessoas: [
      { id: "c-1", nome: "Um", email: EMAIL_SINTETICO },
      { id: "c-2", nome: "Dois", email: null },
      { id: "c-3", nome: "Três", email: EMAIL_INVALIDO_SINTETICO },
    ],
  };

  it("o endereço NUNCA aparece em claro na prévia", async () => {
    const m = montar(tres);
    const previa = await m.servico.previaDeCandidaturas(["c-1", "c-2", "c-3"]);
    expect(JSON.stringify(previa)).not.toContain(EMAIL_SINTETICO);
  });

  it("separa enviáveis de recusados, e diz o porquê de cada recusa", async () => {
    const m = montar(tres);
    const previa = await m.servico.previaDeCandidaturas(["c-1", "c-2", "c-3"]);
    expect(previa.enviaveis).toBe(1);
    expect(previa.recusados).toBe(2);
    const motivos = previa.itens
      .filter((i: any) => !i.podeEnviar)
      .map((i: any) => i.motivo)
      .sort();
    expect(motivos).toEqual(["EMAIL_INVALIDO", "SEM_EMAIL"]);
  });

  /** A prévia é LEITURA: ela não pode, sozinha, emitir credencial nenhuma. */
  it("a prévia não emite nada, e é só isso que a torna segura de abrir", async () => {
    const m = montar(tres);
    await m.servico.previaDeCandidaturas(["c-1", "c-2", "c-3"]);
    expect(m.identidade.emitidos).toEqual([]);
    expect(m.banco.escritas).toEqual([]);
  });

  it("o lote não envia para quem está sem e-mail, e devolve os recusados nominalmente", async () => {
    const m = montar(tres);
    const r = await m.servico.enviarParaCandidaturas(["c-1", "c-2", "c-3"], AUTOR_SINTETICO);
    expect(r.enviados).toBe(1);
    expect(r.recusados.length).toBe(2);
    expect(JSON.stringify(r.recusados)).not.toContain(EMAIL_SINTETICO);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// O CAMINHO 2: A PORTA QUE FALTAVA (`admissoesSemLink`)
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("admissoesSemLink: a busca que dá origem ao PRIMEIRO link, sem oráculo de CPF", () => {
  it("devolve o destino MASCARADO, nunca o endereço", async () => {
    const m = montar({ pessoa: { nome: "Candidato Sintético" } });
    const achados = await m.servico.admissoesSemLink("Candidato");
    expect(JSON.stringify(achados)).not.toContain(EMAIL_SINTETICO);
  });

  /**
   * §A.6: busca por CPF em tela operacional é o ORÁCULO DE EXISTÊNCIA que a identificação do
   * candidato fecha desde o primeiro dia. A busca desta porta é por NOME.
   */
  it("não busca por CPF, e não devolve CPF", async () => {
    const m = montar({ pessoa: {} });
    const achados = await m.servico.admissoesSemLink(CPF_SINTETICO);
    expect(JSON.stringify(achados ?? [])).not.toContain(CPF_SINTETICO);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §A.6 NO CAMINHO FELIZ: O QUE FICA GUARDADO
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("envio bem-sucedido: guarda carimbo, e NADA de pessoal (S2/S3/S4/S6)", () => {
  it("nem endereço, nem URL, nem token, nem CPF em banco, trilha, fila ou log", async () => {
    const m = montar({ pessoa: {} });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    const ficou = oQueFicou(m, logs);
    for (const segredo of SEGREDOS) {
      expect(ficou, `vazou em escrita, trilha, fila ou log: ${segredo}`).not.toContain(segredo);
    }
  });

  it("o correio, esse sim, recebe o endereço e a URL: é o destino, e ele não persiste", async () => {
    const m = montar({ pessoa: {} });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    const paraOCorreio = JSON.stringify(m.correio.enviados);
    expect(paraOCorreio).toContain(EMAIL_SINTETICO);
    expect(paraOCorreio).toContain(URL_SINTETICA);
  });

  it("o resultado devolve o destino MASCARADO, e nunca o endereço", async () => {
    const m = montar({ pessoa: {} });
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(r.enviado).toBe(true);
    expect(r.motivo).toBeNull();
    expect(r.destinoMascarado).not.toBe(EMAIL_SINTETICO);
    expect(String(r.destinoMascarado)).toContain("*");
  });

  /**
   * S5/S7: o registro OPERACIONAL do envio mora em `portal_links` (carimbo, canal, origem, autor),
   * e não só na trilha, que tem retenção e sumiria do Gerenciador. Sem isso, o item 4 da OST
   * ("todo link aparece no Gerenciador, com a origem") não tem de onde sair.
   */
  it("carimba o envio na linha do link, com canal e origem", async () => {
    const m = montar({ pessoa: {} });
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(
      m.identidade.carimbos.length,
      "o envio não deixou registro operacional em `portal_links`",
    ).toBe(1);
    const envio = m.identidade.carimbos[0].envio;
    expect(Object.keys(envio).join(","), "o carimbo diz canal, origem e autor").toMatch(
      /canal.*origem|origem.*canal/i,
    );
    expect(JSON.stringify(envio)).not.toContain(EMAIL_SINTETICO);
    expect(JSON.stringify(envio)).not.toContain(URL_SINTETICA);
  });
});
