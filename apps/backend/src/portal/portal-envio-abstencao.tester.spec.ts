import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PortalIdentidadeService } from "./portal-identidade.service";
import {
  ADMISSAO_SINTETICA,
  AUTOR_SINTETICO,
  JTI_SINTETICO,
  bancoDoEnvio,
  instanciarPorTipos,
  textoDeTudo,
  trilhaFake,
  type LinkFake,
} from "./portal-envio.tester-fake";

/**
 * ─ A ABSTENÇÃO DA S15, MEDIDA CONTRA O SERVIÇO REAL (§A.38/§A.40) ──────────────────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE SEPARADO ───────────────────────────────────────────────────────┐
 * │ A decisão de NÃO reemitir mora DENTRO da transação de `emitirLinkParaEnvio`, no serviço de    │
 * │ IDENTIDADE, e não no serviço de envio. O arquivo do envio, por construção, só consegue medir  │
 * │ o que ele faz DEPOIS que a abstenção aconteceu: se a prova parasse ali, estaria provando o    │
 * │ dublê, e o requisito mais caro da frente ficaria sem cobertura independente nenhuma.          │
 * │                                                                                              │
 * │ O QUE ACONTECE NA PRODUÇÃO SE ISTO CAIR: `emitirLink` REVOGA todos os links vivos da          │
 * │ admissão. Um envio automático disparado sobre quem está enviando documento NAQUELE INSTANTE   │
 * │ mata a sessão dele no meio do upload. Nada falha, nada loga, e o candidato vê a tela morrer.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E ELE MEDE O RECORTE PELOS DOIS LADOS, que é onde a régua costuma errar: abster-se DEMAIS trava
 * o reenvio de quem nunca recebeu (o gesto mais comum da operação) e abster-se DE MENOS é o dano
 * de cima. Vivo E já aberto se abstém; qualquer outra combinação emite.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const { privateKey } = generateKeyPairSync("ed25519");
const CHAVE_B64 = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }) as string,
).toString("base64");

const config = (comChave = true) =>
  ({
    get: (chave: string) => {
      if (chave === "PORTAL_LINK_PRIVATE_KEY") return comChave ? CHAVE_B64 : "";
      if (chave === "PORTAL_LOG_PEPPER") return comChave ? "pepper-sintetico" : "";
      if (chave === "PORTAL_LINK_BASE_URL") return "https://portal.exemplo.test/p";
      return undefined;
    },
    getOrThrow: (chave: string) => chave,
  }) as never;

const AGORA = Date.now();

function montar(links: LinkFake[], comChave = true) {
  const banco = bancoDoEnvio({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links });
  const trilha = trilhaFake();
  const servico = instanciarPorTipos(
    PortalIdentidadeService as any,
    {
      Database: banco.db,
      ConfigService: config(comChave),
      PortalTrilhaService: trilha.fake,
      ThrottlerStorage: { increment: async () => ({ isBlocked: false }) },
    },
    { arquivo: ["portal", "portal-identidade.service.ts"], classe: "PortalIdentidadeService" },
  ) as any;
  return { servico, banco, trilha };
}

const inseriu = (m: ReturnType<typeof montar>) =>
  m.banco.escritas.some((e) => e.tipo === "insert");
const revogou = (m: ReturnType<typeof montar>) =>
  m.banco.escritas.some((e) => "revogadoEm" in e.valores);

const VIVO_E_ABERTO: LinkFake = {
  id: JTI_SINTETICO,
  admissaoId: ADMISSAO_SINTETICA,
  expiraEm: new Date(AGORA + 40 * 3_600_000),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
  primeiroAcessoEm: new Date(AGORA - 5 * 60_000),
};

describe("link VIVO e JÁ ABERTO: a emissão se ABSTÉM (S15)", () => {
  it("devolve o link que já existe, em vez de um novo", async () => {
    const m = montar([VIVO_E_ABERTO]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido).toBeNull();
    expect(r.jaAtivo?.jti).toBe(JTI_SINTETICO);
  });

  it("NÃO insere linha nova em `portal_links`", async () => {
    const m = montar([VIVO_E_ABERTO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(inseriu(m), "credencial nova para quem já está usando a antiga").toBe(false);
  });

  it("NÃO revoga o link que está em uso: a sessão do upload sobrevive", async () => {
    const m = montar([VIVO_E_ABERTO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(revogou(m), "a sessão de quem estava enviando documento foi derrubada").toBe(false);
  });

  /** Abstenção é NÃO EVENTO: registrá-la encheria a trilha de "não fiz nada" a cada clique. */
  it("não registra nada na trilha", async () => {
    const m = montar([VIVO_E_ABERTO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(m.trilha.registros).toEqual([]);
  });
});

describe("o recorte é ESTREITO: fora dele, emite (senão o reenvio morre)", () => {
  /**
   * O CASO MAIS COMUM DA OPERAÇÃO: o link foi enviado e a pessoa NUNCA abriu. Abster-se aqui
   * deixaria o RH sem nenhuma forma de reenviar, que é exatamente o pedido do dia a dia, e não há
   * sessão nenhuma a proteger: ninguém entrou.
   */
  it("link vivo NUNCA aberto é reemitido", async () => {
    const m = montar([{ ...VIVO_E_ABERTO, primeiroAcessoEm: null }]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "o reenvio para quem não recebeu ficou impossível").toBeTruthy();
    expect(inseriu(m)).toBe(true);
  });

  it("link já aberto mas VENCIDO é reemitido: não há sessão viva a proteger", async () => {
    const m = montar([{ ...VIVO_E_ABERTO, expiraEm: new Date(AGORA - 60_000) }]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti).toBeTruthy();
  });

  it("link já aberto mas BLOQUEADO é reemitido", async () => {
    const m = montar([{ ...VIVO_E_ABERTO, bloqueadoEm: new Date(AGORA - 60_000) }]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti).toBeTruthy();
  });

  it("admissão sem link nenhum emite normalmente", async () => {
    const m = montar([]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.link).toContain("#");
    expect(inseriu(m)).toBe(true);
  });
});

describe("inércia e §A.6 da emissão para envio", () => {
  /** Sem chave, recusa, e NÃO deixa linha para trás: é a mesma família da regra do canal. */
  it("sem chave configurada, recusa e NÃO insere nada", async () => {
    const m = montar([], false);
    await expect(
      m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO),
    ).rejects.toThrow();
    expect(inseriu(m)).toBe(false);
    expect(revogou(m)).toBe(false);
  });

  it("a URL e o token NÃO vão para a trilha nem para o banco", async () => {
    const m = montar([]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    const credencial = String(r.emitido?.link ?? "").split("=").pop() ?? "sem-token";
    const ficou = textoDeTudo([m.banco.escritas, m.trilha.registros]);
    expect(credencial.length, "o token não foi lido do link").toBeGreaterThan(20);
    expect(ficou, "a credencial foi persistida ou registrada").not.toContain(credencial);
  });
});
