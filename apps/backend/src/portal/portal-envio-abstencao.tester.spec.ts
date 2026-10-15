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
  // `criado_em` é NOT NULL (default do banco): a devolução do mesmo link o lê para re-cunhar o token.
  criadoEm: new Date(AGORA - 10 * 60_000),
};

// MUDANÇA DE CONTRATO (OST do reenvio do mesmo link): ANTES, link vivo e JÁ ABERTO fazia a emissão
// por e-mail se ABSTER (`LINK_VIVO_EM_USO`, o pop-up "já tem o link e não pode reenviar"). AGORA ela
// DEVOLVE esse mesmo link (o que o candidato está usando), sem reemitir. A proteção da S15 continua
// inteira por outro mecanismo: devolver o mesmo link NÃO reemite, então NÃO há sessão de upload a
// derrubar, que era o dano que a abstenção existia para evitar.
describe("link VIVO e JÁ ABERTO: a emissão DEVOLVE o mesmo link, sem reemitir (S15)", () => {
  it("devolve o link que já existe (mesmo `jti`), marcado como reutilizado", async () => {
    const m = montar([VIVO_E_ABERTO]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "tinha de devolver o link que o candidato já usa").toBe(JTI_SINTETICO);
    expect(r.emitido?.reutilizado).toBe(true);
    expect(r.jaAtivo, "não se abstém mais com o pop-up").toBeNull();
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

  /** Devolver o link que já existe é NÃO EVENTO: registrá-lo encheria a trilha a cada clique. */
  it("não registra nada na trilha", async () => {
    const m = montar([VIVO_E_ABERTO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(m.trilha.registros).toEqual([]);
  });
});

describe("o recorte é ESTREITO: sem link vivo, emite; com link vivo, devolve o mesmo", () => {
  /**
   * O CASO MAIS COMUM DA OPERAÇÃO: o link foi enviado e a pessoa NUNCA abriu. ANTES, isto era
   * reemitido (link novo). AGORA o reenvio DEVOLVE o mesmo link vivo (o que já está na caixa do
   * candidato), sem inserir outro: reenviar o MESMO link é o pedido do dia a dia, e não há por que
   * cunhar um segundo e revogar o primeiro, que deixaria a pessoa com a mensagem antiga quebrada.
   */
  it("link vivo NUNCA aberto: o reenvio devolve o MESMO link, sem inserir outro", async () => {
    const m = montar([{ ...VIVO_E_ABERTO, primeiroAcessoEm: null }]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "o reenvio para quem não recebeu ficou impossível").toBe(JTI_SINTETICO);
    expect(r.emitido?.reutilizado).toBe(true);
    expect(inseriu(m), "cunhou um segundo link em vez de devolver o que já existe").toBe(false);
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

  /**
   * ENTRE VÁRIOS VIVOS, DEVOLVE O QUE O CANDIDATO JÁ ABRIU, não o mais recente. É o link que ele
   * está usando AGORA; devolver outro o mandaria para uma sessão diferente. Sem este teste, trocar
   * `vivos.find(primeiroAcessoEm !== null)` por "o mais recente" passaria despercebido.
   */
  it("entre dois links vivos, devolve o JÁ ACESSADO mesmo sendo o mais VELHO", async () => {
    // IDs distintos de ADMISSAO_SINTETICA/JTI_SINTETICO de propósito: o dublê casa link por id, e um
    // id igual ao da admissão faria a consulta devolver só aquele link.
    const JTI_ACESSADO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const JTI_NAO_ACESSADO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const acessadoVelho: LinkFake = {
      ...VIVO_E_ABERTO,
      id: JTI_ACESSADO,
      criadoEm: new Date(AGORA - 3 * 3_600_000),
      primeiroAcessoEm: new Date(AGORA - 2 * 3_600_000),
    };
    const naoAcessadoNovo: LinkFake = {
      ...VIVO_E_ABERTO,
      id: JTI_NAO_ACESSADO,
      criadoEm: new Date(AGORA - 60_000),
      primeiroAcessoEm: null,
    };
    const m = montar([naoAcessadoNovo, acessadoVelho]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "devolveu o mais recente em vez do que o candidato já abriu").toBe(
      JTI_ACESSADO,
    );
    expect(r.emitido?.reutilizado).toBe(true);
    expect(inseriu(m)).toBe(false);
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
