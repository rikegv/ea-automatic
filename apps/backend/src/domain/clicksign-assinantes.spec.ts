import { describe, expect, it } from "vitest";
import {
  montarAssinantes,
  resumoAssinaturas,
  type EventoAssinatura,
  type SignerBruto,
} from "./clicksign-assinantes";

/**
 * QUEM ASSINOU E QUEM ESTÁ DEVENDO. As fixtures abaixo são os DADOS REAIS da conta, levantados
 * contra a API de produção em 03/08/2026 (nomes preservados, chaves preservadas, PII fora):
 *
 *  - envelope `bad9bc42…` (assinado): dois assinantes, dois eventos `sign`;
 *  - envelope `c0383791…` (aguardando): dois assinantes, ZERO eventos `sign`.
 *
 * É o cruzamento dessas duas listas que produz o status por pessoa, porque a Clicksign não expõe
 * esse status em campo nenhum (nem em `/signers`, nem em `/requirements`).
 */

const FUNCIONARIO: SignerBruto = {
  id: "80c4cb8a-7369-4c78-b7e8-b91d92bfd6c1",
  nome: "GABRIEL PIRES VALENTE",
  grupo: 1,
};
const EMPRESA: SignerBruto = {
  id: "2a772deb-dec7-4fe5-890f-fb29b377f9f0",
  nome: "Edilaine Carvalho",
  grupo: 2,
};

const ASSINOU_FUNCIONARIO: EventoAssinatura = {
  signerKey: FUNCIONARIO.id,
  em: "2026-07-30T17:16:13.410-03:00",
};
const ASSINOU_EMPRESA: EventoAssinatura = {
  signerKey: EMPRESA.id,
  em: "2026-07-30T18:13:11.817-03:00",
};

describe("status por assinante", () => {
  it("ninguém assinou: os dois saem pendentes (o envelope real que está aguardando)", () => {
    const r = montarAssinantes([FUNCIONARIO, EMPRESA], []);
    expect(r.map((a) => [a.nome, a.assinou])).toEqual([
      ["GABRIEL PIRES VALENTE", false],
      ["Edilaine Carvalho", false],
    ]);
    expect(r.every((a) => a.assinadoEm === null)).toBe(true);
  });

  it("todos assinaram: cada um com o SEU instante (o envelope real já fechado)", () => {
    const r = montarAssinantes([FUNCIONARIO, EMPRESA], [ASSINOU_EMPRESA, ASSINOU_FUNCIONARIO]);
    expect(r).toEqual([
      {
        nome: "GABRIEL PIRES VALENTE",
        assinou: true,
        assinadoEm: "2026-07-30T17:16:13.410-03:00",
        ordem: 1,
      },
      {
        nome: "Edilaine Carvalho",
        assinou: true,
        assinadoEm: "2026-07-30T18:13:11.817-03:00",
        ordem: 2,
      },
    ]);
  });

  it("O CASO QUE MOTIVOU A OST: um assinou, o outro não, e dá para saber QUEM cobrar", () => {
    const r = montarAssinantes([FUNCIONARIO, EMPRESA], [ASSINOU_FUNCIONARIO]);

    const devendo = r.filter((a) => !a.assinou).map((a) => a.nome);
    expect(devendo).toEqual(["Edilaine Carvalho"]);
    expect(r.find((a) => a.nome === "GABRIEL PIRES VALENTE")?.assinou).toBe(true);
  });

  it("pendente vem PRIMEIRO: a tela existe para cobrar, não para celebrar", () => {
    const r = montarAssinantes([FUNCIONARIO, EMPRESA], [ASSINOU_FUNCIONARIO]);
    expect(r[0].nome).toBe("Edilaine Carvalho");
    expect(r[0].assinou).toBe(false);
  });

  it("casa por CHAVE, não por nome: homônimo não herda a assinatura do outro", () => {
    const xara: SignerBruto = { id: "outra-chave", nome: "GABRIEL PIRES VALENTE", grupo: 2 };
    const r = montarAssinantes([FUNCIONARIO, xara], [ASSINOU_FUNCIONARIO]);

    expect(r.filter((a) => a.assinou)).toHaveLength(1);
    expect(r.find((a) => a.assinou)?.ordem).toBe(1);
  });

  it("evento de assinante que não está mais na lista é ignorado, não inventa linha", () => {
    const r = montarAssinantes([FUNCIONARIO], [ASSINOU_FUNCIONARIO, ASSINOU_EMPRESA]);
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe("GABRIEL PIRES VALENTE");
  });

  it("reassinatura: vale o PRIMEIRO instante, que é quando a pessoa assinou", () => {
    const depois: EventoAssinatura = { signerKey: FUNCIONARIO.id, em: "2026-07-31T09:00:00.000-03:00" };
    const r = montarAssinantes([FUNCIONARIO], [depois, ASSINOU_FUNCIONARIO]);
    expect(r[0].assinadoEm).toBe("2026-07-30T17:16:13.410-03:00");
  });

  it("envelope sem ordem definida não quebra: ordem vira null e a lista sai por nome", () => {
    const a: SignerBruto = { id: "a", nome: "ZULEIDE", grupo: null };
    const b: SignerBruto = { id: "b", nome: "ANA", grupo: null };
    const r = montarAssinantes([a, b], []);
    expect(r.map((x) => x.nome)).toEqual(["ANA", "ZULEIDE"]);
    expect(r.every((x) => x.ordem === null)).toBe(true);
  });

  it("§A.6: só nome, status, instante e ordem atravessam", () => {
    const r = montarAssinantes([FUNCIONARIO], [ASSINOU_FUNCIONARIO]);
    expect(Object.keys(r[0]).sort()).toEqual(["assinadoEm", "assinou", "nome", "ordem"]);
  });
});

describe("resumo das assinaturas", () => {
  it("conta quantos assinaram e quantos faltam", () => {
    const r = montarAssinantes([FUNCIONARIO, EMPRESA], [ASSINOU_FUNCIONARIO]);
    expect(resumoAssinaturas(r)).toEqual({ total: 2, assinaram: 1, pendentes: 1 });
  });

  it("envelope sem assinante devolve zeros, sem dividir por nada", () => {
    expect(resumoAssinaturas([])).toEqual({ total: 0, assinaram: 0, pendentes: 0 });
  });
});
