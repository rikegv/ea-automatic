import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalEnvioService } from "./portal-envio.service";
import {
  ADMISSAO_SINTETICA,
  AUTOR_SINTETICO,
  CPF_SINTETICO,
  EMAIL_SINTETICO,
  coletarStrings,
  correioFake,
  identidadeFake,
  instanciarPorTipos,
  textoDeTudo,
} from "./portal-envio.tester-fake";

/**
 * ─ TRAVA DO FLUXO 2 (PANDAPÉ DIRETO, SEM PORTAL), E SÓ NO AUTOMÁTICO (`tester` §A.38/§A.40) ──────
 *
 * Verificação INDEPENDENTE, por quem NÃO escreveu a guarda. Prova o COMPORTAMENTO de
 * `PortalEnvioService.enviarParaAdmissao` em volta do recorte adicionado no topo do método
 * (`ehFluxoDoisSemPortal`): QUANDO a origem do envio é `AUTOMATICO` e a admissão é FLUXO 2 (NÃO tem
 * `as_candidaturas` E `admissoes.origem = 'PANDAPE'`), o método NÃO emite, devolve `enviado:false`
 * sem lançar (best-effort), e NÃO chega a resolver o destinatário nem a chamar a emissão.
 *
 * ┌─ O QUE SE PERDE EM PRODUÇÃO SE ISTO CAIR ───────────────────────────────────────────────────┐
 * │ A liberação (`AdmissoesService.liberar`/`liberarEmLote`) chama este método com `AUTOMATICO`  │
 * │ para TODA admissão liberada. A que nasceu pelo webhook do Pandapé sem passar pelo funil (o   │
 * │ "fluxo 2") entrega documento pela própria liberação admissional e NÃO usa o Portal. Emitir   │
 * │ link automático para ela chamaria o candidato para uma coleta que aquele fluxo não tem, e     │
 * │ emitir REVOGA os links vivos da admissão (§A.5 do Portal). A asserção central aqui é, como    │
 * │ na família da §A.33, NEGATIVA: `identidade.emitidos` continua vazio.                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ COMO O BANCO DE MENTIRINHA MODELA `as_candidaturas` + `admissoes.origem` ───────────────────┐
 * │ `bancoDoEnvio` (o dublê compartilhado) não projeta o `bloqueia` da guarda, então, no molde   │
 * │ de `bancoComFarol` (portal-envio.ponte-pre-admissao), este arquivo traz um dublê PRÓPRIO que │
 * │ distingue as DUAS consultas de `enviarParaAdmissao` pela PROJEÇÃO, nunca pela ordem:          │
 * │   - a guarda projeta `{ bloqueia }` (um `sql` booleano);                                      │
 * │   - `destinatarioDaAdmissao` projeta `{ admissaoId, nome, email }`.                           │
 * │ O valor de `bloqueia` é derivado do REQUISITO (FLUXO 2 = origem 'PANDAPE' E SEM candidatura), │
 * │ a partir dos dados do cenário (`origem`, `temCandidatura`), e NÃO copiado do SQL do serviço:  │
 * │ o dublê modela a RESPOSTA do banco àquele predicado, que é o que a guarda lê.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: todo e-mail, CPF e id aqui é sintético, e existe para ser caçado no log da trava.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CenarioFluxo {
  /** A origem da ADMISSÃO (não a do envio): define, com `temCandidatura`, se é FLUXO 2. */
  origem: "PANDAPE" | "MANUAL";
  /** EXISTE linha em `as_candidaturas` ligada a esta admissão? (A&S = true.) */
  temCandidatura: boolean;
  /** O destinatário que `destinatarioDaAdmissao` resolve, quando a guarda não barra. */
  destinatario?: { admissaoId: string; nome: string; email: string | null };
}

const DESTINATARIO_PADRAO = {
  admissaoId: ADMISSAO_SINTETICA,
  nome: "Candidato Sintetico",
  email: EMAIL_SINTETICO,
};

/**
 * O banco próprio, que responde às duas consultas da `enviarParaAdmissao` pela PROJEÇÃO e conta
 * quantas vezes cada uma foi disparada. É a contagem que prova "a guarda não roda fora do
 * AUTOMATICO" e "o destinatário nem é resolvido quando a guarda barra".
 */
function bancoFluxoDois(cenario: CenarioFluxo) {
  const chamadas = { guarda: 0, destinatario: 0 };
  // DERIVADO DO REQUISITO, não do SQL do serviço: FLUXO 2 = origem 'PANDAPE' E sem candidatura.
  const bloqueia = cenario.origem === "PANDAPE" && !cenario.temCandidatura;
  const destinatario = cenario.destinatario ?? DESTINATARIO_PADRAO;

  const resolver = (keys: string[]): unknown[] => {
    if (keys.includes("bloqueia")) {
      chamadas.guarda += 1;
      return [{ bloqueia }];
    }
    if (keys.includes("nome") && keys.includes("admissaoId")) {
      chamadas.destinatario += 1;
      return [destinatario];
    }
    return [];
  };

  const cadeia = (projecao?: Record<string, unknown>): any => {
    const keys = Object.keys(projecao ?? {});
    const p: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
              Promise.resolve(resolver(keys)).then(ok, err);
          }
          return () => p;
        },
      },
    );
    return p;
  };

  return { db: { select: (projecao?: Record<string, unknown>) => cadeia(projecao) }, chamadas };
}

function montar(cenario: CenarioFluxo) {
  const identidade = identidadeFake();
  const correio = correioFake({ configurado: true });
  const banco = bancoFluxoDois(cenario);
  const servico = instanciarPorTipos(
    PortalEnvioService as any,
    {
      Database: banco.db,
      PortalIdentidadeService: identidade.fake,
      PortalCorreioService: correio.fake,
    },
    { arquivo: ["portal", "portal-envio.service.ts"], classe: "PortalEnvioService" },
  ) as any;
  return { servico, identidade, correio, banco };
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
// REQUISITO 1 — FLUXO 2 + AUTOMATICO: NÃO EMITE
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("FLUXO 2 (sem as_candidaturas + origem PANDAPE) + AUTOMATICO: a trava barra", () => {
  const cenario: CenarioFluxo = { origem: "PANDAPE", temCandidatura: false };

  it("devolve enviado:false sem lançar (best-effort)", async () => {
    const m = montar(cenario);
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(r.enviado).toBe(false);
    // O código devolve `motivo: null` (o catálogo fechado vive em shared-types); o código
    // `FLUXO_SEM_PORTAL` vai só para o log, provado no requisito 5.
    expect(r.motivo).toBeNull();
    expect(r.destinoMascarado, "§A.6: não se resolve nem se mascara destino de quem não emite").toBeNull();
  });

  it("NENHUM link é emitido: nem a emissão nem o correio são chamados", async () => {
    const m = montar(cenario);
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(m.identidade.emitidos, "credencial viva que ninguém recebeu").toEqual([]);
    expect(m.correio.enviados).toEqual([]);
    expect(m.identidade.revogados, "a trava não pode matar link vivo anterior").toEqual([]);
  });

  it("a guarda roda UMA vez e o destinatário NÃO é sequer resolvido", async () => {
    const m = montar(cenario);
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(m.banco.chamadas.guarda).toBe(1);
    expect(m.banco.chamadas.destinatario, "resolver o destino leria o e-mail à toa (§A.6)").toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 2 — ATRAÇÃO E SELEÇÃO (TEM as_candidaturas), MESMO PANDAPE, AUTOMATICO: EMITE
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("A&S (tem as_candidaturas) + origem PANDAPE + AUTOMATICO: NÃO é barrado, emite", () => {
  const cenario: CenarioFluxo = { origem: "PANDAPE", temCandidatura: true };

  it("emite o link normalmente", async () => {
    const m = montar(cenario);
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(r.enviado).toBe(true);
    expect(m.identidade.emitidos).toHaveLength(1);
    expect(m.identidade.emitidos[0]?.admissaoId).toBe(ADMISSAO_SINTETICA);
    expect(m.correio.enviados).toHaveLength(1);
  });

  it("a guarda roda (AUTOMATICO) mas deixa passar, e o destinatário É resolvido", async () => {
    const m = montar(cenario);
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(m.banco.chamadas.guarda).toBe(1);
    expect(m.banco.chamadas.destinatario).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 3 — ADMISSÃO PLATAFORMA (SEM as_candidaturas + origem MANUAL), AUTOMATICO: EMITE
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("Admissão Plataforma (sem as_candidaturas + origem MANUAL) + AUTOMATICO: emite", () => {
  const cenario: CenarioFluxo = { origem: "MANUAL", temCandidatura: false };

  it("não é FLUXO 2 (origem <> PANDAPE), então emite mesmo sem candidatura", async () => {
    const m = montar(cenario);
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(r.enviado).toBe(true);
    expect(m.identidade.emitidos).toHaveLength(1);
    expect(m.banco.chamadas.guarda).toBe(1);
    expect(m.banco.chamadas.destinatario).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 4 — MANUAL E AUTOATENDIMENTO NÃO SÃO AFETADOS (a guarda só roda em AUTOMATICO)
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("MANUAL e AUTOATENDIMENTO: a trava não se aplica (emite mesmo sendo FLUXO 2)", () => {
  // O cenário é FLUXO 2 (PANDAPE, sem candidatura): se a guarda rodasse, barraria. Ela NÃO roda.
  const cenarioFluxo2: CenarioFluxo = { origem: "PANDAPE", temCandidatura: false };

  it.each(["MANUAL", "AUTOATENDIMENTO"] as const)(
    "origem de envio %s: a guarda NÃO roda e o link é emitido",
    async (origemEnvio) => {
      const m = montar(cenarioFluxo2);
      const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, origemEnvio);
      expect(r.enviado).toBe(true);
      expect(m.identidade.emitidos).toHaveLength(1);
      expect(m.identidade.emitidos[0]?.admissaoId).toBe(ADMISSAO_SINTETICA);
      // A PROVA de que a trava só vive no AUTOMATICO: a consulta da guarda nem foi disparada.
      expect(m.banco.chamadas.guarda, "a guarda do fluxo 2 rodou fora do AUTOMATICO").toBe(0);
      expect(m.banco.chamadas.destinatario).toBe(1);
    },
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 5 — §A.6: O LOG DA TRAVA LEVA SÓ O CÓDIGO, NUNCA PII
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("§A.6: o log da trava carrega só FLUXO_SEM_PORTAL, sem e-mail/CPF/nome/id de pessoa", () => {
  const cenario: CenarioFluxo = {
    origem: "PANDAPE",
    temCandidatura: false,
    // Dados sintéticos disponíveis no banco: se qualquer um vazar para o log, o teste cai.
    destinatario: { admissaoId: ADMISSAO_SINTETICA, nome: "Candidato Sintetico", email: EMAIL_SINTETICO },
  };

  it("o log avisa com o código fixo FLUXO_SEM_PORTAL", async () => {
    const m = montar(cenario);
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    const texto = textoDeTudo([logs]);
    expect(texto).toContain("FLUXO_SEM_PORTAL");
  });

  it("o log NÃO carrega e-mail, CPF, nome do candidato nem o id da admissão", async () => {
    const m = montar(cenario);
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    const texto = coletarStrings([logs]).join("\n");
    expect(texto, "e-mail vazou para o log").not.toContain(EMAIL_SINTETICO);
    expect(texto, "CPF vazou para o log").not.toContain(CPF_SINTETICO);
    expect(texto, "nome do candidato vazou para o log").not.toContain("Candidato Sintetico");
    expect(texto, "id da admissão vazou para o log").not.toContain(ADMISSAO_SINTETICA);
  });

  it("nenhuma frase logada usa travessão (§A.11)", async () => {
    const m = montar(cenario);
    await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "AUTOMATICO");
    expect(coletarStrings([logs]).join("\n")).not.toContain("—");
  });
});
