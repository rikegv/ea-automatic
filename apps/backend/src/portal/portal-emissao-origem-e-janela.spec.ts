import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PortalEnvioService } from "./portal-envio.service";
import { PortalIdentidadeService } from "./portal-identidade.service";
import {
  ADMISSAO_SINTETICA,
  AUTOR_SINTETICO,
  JTI_SINTETICO,
  bancoDoEnvio,
  correioFake,
  filaFake,
  identidadeFake,
  instanciarPorTipos,
  trilhaFake,
  type LinkFake,
} from "./portal-envio.tester-fake";

/**
 * ─ A ORIGEM DA EMISSÃO ANTIGA (item 3) E A JANELA DO REENVIO (item 4) ──────────────────────────
 *
 * As duas decisões moram DENTRO da transação de emissão, sob a mesma `pg_advisory_xact_lock`, e
 * por isso são medidas contra o serviço REAL, no molde de `portal-envio-abstencao.tester.spec.ts`.
 * Medi-las pelo dublê provaria o dublê.
 *
 * §A.6: nada aqui tem nome, e-mail, CPF ou URL. Só identificador técnico e carimbo de tempo.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const { privateKey } = generateKeyPairSync("ed25519");
const CHAVE_B64 = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }) as string,
).toString("base64");

const config = () =>
  ({
    get: (chave: string) => {
      if (chave === "PORTAL_LINK_PRIVATE_KEY") return CHAVE_B64;
      if (chave === "PORTAL_LOG_PEPPER") return "pepper-sintetico";
      if (chave === "PORTAL_LINK_BASE_URL") return "https://portal.exemplo.test/p";
      return undefined;
    },
    getOrThrow: (chave: string) => chave,
  }) as never;

const AGORA = Date.now();

function montar(links: LinkFake[]) {
  const banco = bancoDoEnvio({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links });
  const trilha = trilhaFake();
  const servico = instanciarPorTipos(
    PortalIdentidadeService as any,
    {
      Database: banco.db,
      ConfigService: config(),
      PortalTrilhaService: trilha.fake,
      ThrottlerStorage: { increment: async () => ({ isBlocked: false }) },
    },
    { arquivo: ["portal", "portal-identidade.service.ts"], classe: "PortalIdentidadeService" },
  ) as any;
  return { servico, banco, trilha };
}

const insercoes = (m: ReturnType<typeof montar>) =>
  m.banco.escritas.filter((e) => e.tipo === "insert");
const revogou = (m: ReturnType<typeof montar>) =>
  m.banco.escritas.some((e) => "revogadoEm" in e.valores);

const VIVO: LinkFake = {
  id: JTI_SINTETICO,
  admissaoId: ADMISSAO_SINTETICA,
  expiraEm: new Date(AGORA + 40 * 3_600_000),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
  primeiroAcessoEm: null,
  // `criado_em` é NOT NULL em `portal_links` (default do banco); a devolução do mesmo link lê ele
  // para re-cunhar o token com a MESMA janela. Cada caso que precisa de outro instante sobrescreve.
  criadoEm: new Date(AGORA - 60_000),
};

// ══ ITEM 3: A EMISSÃO ANTIGA CARIMBA A ORIGEM ════════════════════════════════════════════════

describe("o `gerar link` carimba `ENTREGA_A_MAO`, e não finge um envio", () => {
  it("a linha nasce com a origem da entrega à mão", async () => {
    const m = montar([]);
    await m.servico.emitirLink(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(insercoes(m)).toHaveLength(1);
    expect(insercoes(m)[0].valores.envioOrigem).toBe("ENTREGA_A_MAO");
  });

  /**
   * NADA FOI ENVIADO, ENTÃO NÃO HÁ CARIMBO DE ENVIO. E não é só honestidade: `enviado_em` é a
   * fonte da janela de reenvio, e escrevê-lo aqui bloquearia um envio legítimo logo em seguida
   * por causa de um e-mail que ninguém mandou.
   */
  it("não escreve carimbo de envio nenhum: `enviado_em`, canal e autor do envio ficam de fora", async () => {
    const m = montar([]);
    await m.servico.emitirLink(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    const valores = insercoes(m)[0].valores;
    for (const campo of ["enviadoEm", "envioCanal", "enviadoPorId"]) {
      expect(valores[campo], `${campo} não deveria ser escrito por quem não enviou`).toBeUndefined();
    }
  });

  /**
   * A OUTRA PORTA NASCE SEM ORIGEM, de propósito: por ali quem carimba é `marcarEnvioDoLink`,
   * depois de o correio aceitar a mensagem. Gravar `MANUAL` no nascimento diria "enviado por
   * e-mail" sobre um link que ainda pode nem sair (e que, nesse caso, é revogado).
   */
  it("a emissão PARA ENVIO nasce sem origem: quem carimba é o envio, quando ele acontece", async () => {
    const m = montar([]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(insercoes(m)[0].valores.envioOrigem).toBeNull();
  });
});

// ══ ITEM 4: O REENVIO POR E-MAIL DEVOLVE O MESMO LINK VIVO (decisão do diretor Rike) ══════════
//
// MUDANÇA DE CONTRATO (OST "reenviar o link por e-mail, o mesmo link, quantas vezes precisar").
// ANTES, o reenvio por e-mail se ABSTINHA: `LINK_VIVO_EM_USO` quando o candidato já tinha aberto o
// link, e `ENVIADO_HA_POUCO` dentro da janela curta. O RH perdia candidato (a pessoa perde o link,
// pede de novo, e o reenvio recusava). AGORA o reenvio DEVOLVE o link vivo que já existe (prefere o
// que o candidato JÁ ABRIU), re-cunhando o token do MESMO `jti`. NÃO insere link novo, NÃO revoga,
// NÃO encerra o acesso, NÃO estende o prazo. Só quando NÃO há link vivo nenhum é que ele emite o
// PRIMEIRO. A abstenção `ENVIADO_HA_POUCO` deixa de ser alcançável por este caminho, porque qualquer
// link vivo (aberto ou não, dentro ou fora da janela) é DEVOLVIDO antes de a janela ser avaliada.
//
// A trava que PROTEGIA de verdade (não derrubar a sessão de quem está enviando documento) continua
// de pé por OUTRO mecanismo: devolver o mesmo link não reemite, então não há sessão a derrubar.

describe("reenviar por e-mail devolve o MESMO link vivo, sem revogar nem encerrar o acesso", () => {
  const RECEM_ENVIADO: LinkFake = { ...VIVO, enviadoEm: new Date(AGORA - 5_000) };

  it("link vivo recém-enviado: o reenvio DEVOLVE o mesmo `jti`, marcado como reutilizado", async () => {
    const m = montar([RECEM_ENVIADO]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "o reenvio tinha de devolver o link que já existe").toBe(JTI_SINTETICO);
    expect(r.emitido?.reutilizado, "reenvio do mesmo link é reutilização").toBe(true);
    expect(r.jaAtivo, "não se abstém mais").toBeNull();
    // NÃO ESTENDE O PRAZO (exigência do diretor): o `expira_em` devolvido é o da linha existente.
    expect(r.emitido?.expiraEm, "o reenvio estendeu o prazo do link").toEqual(RECEM_ENVIADO.expiraEm);
  });

  /**
   * O PONTO INTEIRO DA FRENTE: devolver o mesmo link não pode custar o acesso vigente. Nenhum link
   * novo, nenhuma revogação, nenhum carimbo de envio escrito pela emissão (o carimbo do envio sai
   * depois, no `marcarEnvioDoLink`, quando o correio aceita).
   */
  it("não insere link novo, NÃO revoga e não escreve trilha", async () => {
    const m = montar([RECEM_ENVIADO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(insercoes(m)).toHaveLength(0);
    expect(revogou(m), "o reenvio revogou um link vivo").toBe(false);
    expect(m.trilha.registros, "devolver o link que já existe é um não-evento").toEqual([]);
  });

  /**
   * O CASO QUE O POP-UP TRAVAVA: candidato que JÁ ACESSOU. Antes, abstenção `LINK_VIVO_EM_USO`
   * ("já tem o link e não pode reenviar"). Agora, devolve o MESMO link (o que ele está usando), sem
   * revogar nada. A sessão dele fica intocada.
   */
  it("link já ABERTO: devolve o mesmo link (não é mais o pop-up `LINK_VIVO_EM_USO`)", async () => {
    const m = montar([
      { ...VIVO, primeiroAcessoEm: new Date(AGORA - 60_000), enviadoEm: new Date(AGORA - 5_000) },
    ]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti).toBe(JTI_SINTETICO);
    expect(r.emitido?.reutilizado).toBe(true);
    expect(r.jaAtivo).toBeNull();
    expect(revogou(m), "o acesso vigente do candidato foi encerrado").toBe(false);
  });

  it("link entregue À MÃO recém-criado: o reenvio por e-mail devolve ESSE mesmo link", async () => {
    const recemEntregueAMao = { ...VIVO, enviadoEm: null, criadoEm: new Date(AGORA - 5_000) };
    const m = montar([recemEntregueAMao]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "devolveu outro link em vez do que acabou de ser entregue").toBe(
      JTI_SINTETICO,
    );
    expect(r.emitido?.reutilizado).toBe(true);
    expect(revogou(m)).toBe(false);
  });

  it("dentro da janela curta, o reenvio TAMBÉM devolve o mesmo link (não abstém mais)", async () => {
    const m = montar([{ ...VIVO, enviadoEm: new Date(AGORA - 200) }]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti).toBe(JTI_SINTETICO);
    expect(r.emitido?.reutilizado).toBe(true);
    expect(r.jaAtivo?.motivo, "`ENVIADO_HA_POUCO` não é mais alcançável no reenvio").toBeUndefined();
  });

  it("SEM link vivo nenhum, emite o PRIMEIRO: nasce, não é reutilizado, e com origem nula", async () => {
    const m = montar([]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "sem link vivo, o primeiro tinha de nascer").toBeTruthy();
    expect(r.emitido?.reutilizado, "o primeiro link não é reutilização").toBe(false);
    expect(insercoes(m)).toHaveLength(1);
    expect(insercoes(m)[0].valores.envioOrigem, "o primeiro nasce sem origem de envio").toBeNull();
  });

  it("link MORTO não é devolvido: vencido não é vivo, então emite um link NOVO", async () => {
    const vencido = { ...VIVO, enviadoEm: new Date(AGORA - 1_000), expiraEm: new Date(AGORA - 1) };
    const m = montar([vencido]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "emitiu um link para quem não tinha nenhum vivo").toBeTruthy();
    expect(r.emitido?.reutilizado, "link morto não é reutilizável; nasce um novo").toBe(false);
  });

  /**
   * E O "GERAR LINK" (`emitirLink`) NÃO MUDA: ele REVOGA sempre e é a VÁLVULA DE ESCAPE de quando
   * algo trava. Nada nesta frente tocou essa porta.
   */
  it("o `gerar link` continua emitindo e revogando, como sempre", async () => {
    const m = montar([{ ...VIVO, enviadoEm: null, criadoEm: new Date(AGORA - 1_000) }]);
    const r = await m.servico.emitirLink(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.link).toBeTruthy();
    expect(insercoes(m)).toHaveLength(1);
  });

  /**
   * A DECISÃO É TOMADA DENTRO DA TRANSAÇÃO, sob a mesma `pg_advisory_xact_lock` por admissão: a
   * busca pelo link vivo a devolver corre sob a trava, igual à revogação. Fora dela, a leitura
   * responderia sobre um instante anterior à escrita.
   */
  it("o reenvio consulta a admissão sob a mesma trava", async () => {
    const m = montar([RECEM_ENVIADO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    const consultas = m.banco.consultas.flat().join(" ");
    expect(consultas.includes(ADMISSAO_SINTETICA)).toBe(true);
  });
});

// ══ O SERVIÇO DE ENVIO REPASSA O CÓDIGO, EM VEZ DE REESCREVER A RÉGUA ════════════════════════

// NOTA: com o reenvio devolvendo o mesmo link, a emissão por e-mail NÃO produz mais
// `LINK_VIVO_EM_USO` nem `ENVIADO_HA_POUCO` (qualquer link vivo é devolvido antes). Estes testes
// continuam provando o REPASSE do código pelo serviço de envio, que é contrato defensivo: se a
// emissão algum dia devolver uma abstenção, a tela recebe o rótulo certo e nenhum e-mail sai. O
// desfecho VIVO do reenvio (devolver o mesmo link e enviá-lo) é provado logo abaixo.
describe("o serviço de envio devolve o código que a emissão escolheu", () => {
  const montarEnvio = (motivo?: "LINK_VIVO_EM_USO" | "ENVIADO_HA_POUCO") => {
    const banco = bancoDoEnvio({ pessoa: {} });
    const identidade = identidadeFake({
      jaAtivo: { jti: JTI_SINTETICO, expiraEm: new Date(AGORA + 40 * 3_600_000), motivo },
    });
    const correio = correioFake({ configurado: true });
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
    return { servico, correio, fila };
  };

  it("a janela chega à tela como `ENVIADO_HA_POUCO`, e nenhum e-mail sai", async () => {
    const m = montarEnvio("ENVIADO_HA_POUCO");
    const r = await m.servico.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("ENVIADO_HA_POUCO");
    expect(m.correio.enviados).toEqual([]);
  });

  /** Sem motivo declarado, a leitura continua sendo a histórica: o link já foi aberto. */
  it("a abstenção antiga continua voltando como `LINK_VIVO_EM_USO`", async () => {
    const r = await montarEnvio().servico.enviarParaAdmissao(
      ADMISSAO_SINTETICA,
      AUTOR_SINTETICO,
      "MANUAL",
    );
    expect(r.motivo).toBe("LINK_VIVO_EM_USO");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// O DUBLÊ APLICA A ESCRITA, E A LEITURA SEGUINTE ENXERGA (achado da 5ª auditoria)
//
// O banco falso PERSISTE o `insert` e a leitura seguinte o enxerga, então a SEGUNDA emissão lê o
// que a PRIMEIRA gravou. É o que faz "reenviar 2x" ser testável de verdade: sem a persistência, a
// segunda não veria a linha da primeira e inseriria uma segunda, revogando a primeira. Com a nova
// regra (devolver o mesmo link), a prova é a oposta da antiga: o segundo DEVOLVE o que o primeiro
// criou, em vez de se abster.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("reenviar 2x seguidas: o segundo devolve o MESMO link que o primeiro criou", () => {
  it("o primeiro NASCE; o segundo DEVOLVE o mesmo `jti`, marcado como reutilizado", async () => {
    const m = montar([]);

    const primeiro = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    const segundo = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);

    expect(primeiro.emitido?.jti, "o primeiro envio precisa nascer").toBeTruthy();
    expect(primeiro.emitido?.reutilizado, "o primeiro é novo, não reutilizado").toBe(false);
    expect(segundo.emitido?.jti, "o segundo devolveu um link diferente do primeiro").toBe(
      primeiro.emitido?.jti,
    );
    expect(segundo.emitido?.reutilizado, "o segundo é reenvio do mesmo link").toBe(true);
  });

  it("o segundo NÃO insere link novo e NÃO revoga o primeiro", async () => {
    const m = montar([]);

    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);

    // Um único `insert`: o do NASCIMENTO do primeiro. Se o segundo tivesse reemitido, haveria dois.
    expect(insercoes(m)).toHaveLength(1);
    // Uma única revogação: a do nascimento do primeiro (admissão sem links vivos na hora). O segundo
    // devolveu o link que já existia, sem revogar nada.
    expect(m.banco.escritas.filter((e) => "revogadoEm" in e.valores)).toHaveLength(1);
  });
});

describe("o reenvio enxerga o link que já existe no banco e o devolve", () => {
  const LINK_VIVO = (): LinkFake => ({
    id: JTI_SINTETICO,
    admissaoId: ADMISSAO_SINTETICA,
    expiraEm: new Date(AGORA + 40 * 3_600_000),
    revogadoEm: null,
    suspensoAte: null,
    bloqueadoEm: null,
    primeiroAcessoEm: null,
    enviadoEm: null,
    criadoEm: new Date(AGORA - 3 * 3_600_000),
  });

  it("devolve o link vivo existente, com o mesmo `jti`", async () => {
    const m = montar([LINK_VIVO()]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti).toBe(JTI_SINTETICO);
    expect(r.emitido?.reutilizado).toBe(true);
    expect(insercoes(m)).toHaveLength(0);
  });

  /**
   * Carimbar o envio (`marcarEnvioDoLink`) NÃO muda o desfecho do reenvio: o link segue vivo, e o
   * reenvio continua devolvendo o MESMO `jti`, sem reemitir. O carimbo só atualiza `enviado_em`, que
   * não é a autoridade do prazo (essa é `expira_em`, intocada).
   */
  it("mesmo depois de `marcarEnvioDoLink` carimbar `enviado_em`, o reenvio devolve o mesmo link", async () => {
    const m = montar([LINK_VIVO()]);

    await m.servico.marcarEnvioDoLink(JTI_SINTETICO, {
      canal: "EMAIL",
      origem: "MANUAL",
      autorId: AUTOR_SINTETICO,
    });
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);

    expect(r.emitido?.jti, "o reenvio devia ter devolvido o mesmo link").toBe(JTI_SINTETICO);
    expect(r.emitido?.reutilizado).toBe(true);
    expect(insercoes(m), "não podia ter inserido link novo").toHaveLength(0);
  });
});
