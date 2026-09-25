import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PortalEnvioService } from "./portal-envio.service";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { JANELA_DE_REENVIO_MS } from "../domain/portal-envio";
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

// ══ ITEM 4: A JANELA CURTA ═══════════════════════════════════════════════════════════════════

describe("janela curta: dois cliques seguidos não mandam dois e-mails (item b da S15)", () => {
  const RECEM_ENVIADO: LinkFake = { ...VIVO, enviadoEm: new Date(AGORA - 5_000) };

  it("o segundo clique se ABSTÉM, com código próprio", async () => {
    const m = montar([RECEM_ENVIADO]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido).toBeNull();
    expect(r.jaAtivo?.motivo).toBe("ENVIADO_HA_POUCO");
    expect(r.jaAtivo?.jti).toBe(JTI_SINTETICO);
  });

  /**
   * O DANO QUE ISTO EVITA: o segundo link REVOGA o primeiro, então o candidato fica com duas
   * mensagens e a primeira, a que ele provavelmente abre, não funciona mais.
   */
  it("não insere link novo e NÃO revoga o que acabou de ser mandado", async () => {
    const m = montar([RECEM_ENVIADO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(insercoes(m)).toHaveLength(0);
    expect(revogou(m), "a mensagem que está na caixa do candidato foi invalidada").toBe(false);
  });

  it("abstenção é NÃO EVENTO: nada vai para a trilha", async () => {
    const m = montar([RECEM_ENVIADO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(m.trilha.registros).toEqual([]);
  });

  it("passada a janela, o reenvio legítimo volta a funcionar", async () => {
    const m = montar([{ ...VIVO, enviadoEm: new Date(AGORA - JANELA_DE_REENVIO_MS - 1_000) }]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "o reenvio de quem não recebeu ficou impossível").toBeTruthy();
  });

  it("link ANTIGO nunca enviado continua sendo reemitido na hora (é o caminho comum)", async () => {
    // Nascido fora da janela: reenviar para quem não recebeu continua sendo o gesto mais comum da
    // operação, e a correção do achado 14 não podia custá-lo.
    const m = montar([{ ...VIVO, criadoEm: new Date(AGORA - 3 * 3_600_000) }]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti).toBeTruthy();
  });

  /**
   * ══ A FRESTA DO ACHADO 14, FECHADA ═══════════════════════════════════════════════════════
   *
   * O link entregue À MÃO ("gerar link") nasce com `ENTREGA_A_MAO` e SEM `enviado_em`, porque
   * nada foi enviado. Enquanto a janela olhava só `enviado_em`, clicar em "enviar por e-mail"
   * segundos depois (os dois botões ficam lado a lado na coluna de Ações) reemitia e REVOGAVA a
   * URL que o consultor tinha acabado de mandar pelo WhatsApp. Ninguém via nada falhar; quem
   * ficava com o link morto na mão era o candidato.
   */
  it("link ENTREGUE À MÃO agora há pouco também segura o envio por e-mail", async () => {
    const recemEntregueAMao = { ...VIVO, enviadoEm: null, criadoEm: new Date(AGORA - 5_000) };
    const m = montar([recemEntregueAMao]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido, "reemitiu e matou o link que acabou de ser entregue à mão").toBeNull();
    expect(r.jaAtivo?.motivo).toBe("ENVIADO_HA_POUCO");
    expect(revogou(m)).toBe(false);
  });

  it("passada a janela, o link entregue à mão não segura mais o envio por e-mail", async () => {
    const m = montar([
      { ...VIVO, enviadoEm: null, criadoEm: new Date(AGORA - JANELA_DE_REENVIO_MS - 1_000) },
    ]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti).toBeTruthy();
  });

  /**
   * A SEGUNDA CORRIDA QUE `criado_em` FECHA, e ela é a que a auditoria tinha deixado como "meio
   * cumprida": entre o `insert` e o `marcarEnvioDoLink` existe um vão (o correio aceitando a
   * mensagem) em que a linha está viva, não aberta e AINDA SEM `enviado_em`. Um segundo envio
   * nesse vão lia a linha do primeiro, não via carimbo, reemitia e matava o link do e-mail que
   * estava saindo naquele instante.
   */
  it("o vão entre emitir e carimbar o envio também está coberto", async () => {
    const emVoo = { ...VIVO, enviadoEm: null, criadoEm: new Date(AGORA - 200) };
    const r = await montar([emVoo]).servico.emitirLinkParaEnvio(
      ADMISSAO_SINTETICA,
      AUTOR_SINTETICO,
    );
    expect(r.emitido).toBeNull();
  });

  /**
   * E O "GERAR LINK" NÃO GANHA A JANELA, de propósito: ele passa com `recusarSeJaAcessado = false`
   * e é a VÁLVULA DE ESCAPE de quando alguma coisa trava. É essa porta que sustenta a afirmação da
   * auditoria de que não existe estado em que o time fique sem conseguir entregar um link.
   */
  it("o `gerar link` continua emitindo mesmo com entrega recentíssima", async () => {
    const m = montar([{ ...VIVO, enviadoEm: null, criadoEm: new Date(AGORA - 1_000) }]);
    const r = await m.servico.emitirLink(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.link).toBeTruthy();
    expect(insercoes(m)).toHaveLength(1);
  });

  it("link MORTO não segura ninguém, por mais recente que seja o envio", async () => {
    const vencido = { ...VIVO, enviadoEm: new Date(AGORA - 1_000), expiraEm: new Date(AGORA - 1) };
    expect(
      (await montar([vencido]).servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO))
        .emitido?.jti,
    ).toBeTruthy();
  });

  /** A precedência: quem JÁ ENTROU é o caso mais grave, e tem frase própria. */
  it("link já ABERTO e recém-enviado se abstém como `LINK_VIVO_EM_USO`, não como janela", async () => {
    const m = montar([
      { ...VIVO, primeiroAcessoEm: new Date(AGORA - 60_000), enviadoEm: new Date(AGORA - 5_000) },
    ]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.jaAtivo?.motivo).toBe("LINK_VIVO_EM_USO");
  });

  /**
   * A DECISÃO É TOMADA DENTRO DA TRANSAÇÃO, e é isso que a torna correta: fora dela, a pergunta
   * responderia sobre um instante anterior à escrita, e dois cliques simultâneos passariam os dois
   * antes de qualquer um carimbar. É o mesmo furo que a trava fechou para a revogação.
   */
  it("a janela é decidida sob a mesma trava por admissão", async () => {
    const m = montar([RECEM_ENVIADO]);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    const consultas = m.banco.consultas.flat().join(" ");
    expect(consultas.includes(ADMISSAO_SINTETICA)).toBe(true);
  });
});

// ══ O SERVIÇO DE ENVIO REPASSA O CÓDIGO, EM VEZ DE REESCREVER A RÉGUA ════════════════════════

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
// Enquanto o banco falso só REGISTRAVA a escrita, a janela de reenvio só era testável semeando
// `enviado_em` à mão: nunca se provava que a SEGUNDA emissão lê o que a PRIMEIRA gravou. Estes
// testes fecham a corrida real (retry / duplo-clique / dois cliques em "enviar"): o segundo envio
// dentro da janela mataria a sessão que o candidato acabou de abrir e dispararia um segundo e-mail.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("a segunda emissão lê a linha que a primeira INSERIU, e se abstém", () => {
  it("emitir para envio duas vezes seguidas: o segundo se abstém como `ENVIADO_HA_POUCO`", async () => {
    const m = montar([]);

    const primeiro = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    const segundo = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);

    expect(primeiro.emitido?.jti, "o primeiro envio precisa nascer").toBeTruthy();
    expect(segundo.emitido, "o segundo reemitiu, sem enxergar o link recém-criado").toBeNull();
    expect(segundo.jaAtivo?.motivo).toBe("ENVIADO_HA_POUCO");
  });

  it("o segundo envio NÃO insere link novo e NÃO revoga o primeiro (a régua que ele mataria)", async () => {
    const m = montar([]);

    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);

    // Um único `insert`: se a escrita do primeiro não fosse aplicada, o segundo não enxergaria a
    // linha e inseriria a segunda, revogando a primeira, que é exatamente o dano da corrida.
    expect(insercoes(m)).toHaveLength(1);
    // Uma única revogação (a do NASCIMENTO do primeiro, sobre uma admissão sem links vivos). O
    // segundo se absteve antes de revogar; se tivesse reemitido, haveria uma segunda revogação.
    expect(m.banco.escritas.filter((e) => "revogadoEm" in e.valores)).toHaveLength(1);
  });
});

describe("a emissão lê o `enviado_em` que `marcarEnvioDoLink` GRAVOU na linha", () => {
  const LINK_ANTIGO = (): LinkFake => ({
    id: JTI_SINTETICO,
    admissaoId: ADMISSAO_SINTETICA,
    expiraEm: new Date(AGORA + 40 * 3_600_000),
    revogadoEm: null,
    suspensoAte: null,
    bloqueadoEm: null,
    primeiroAcessoEm: null,
    enviadoEm: null,
    // Fora da janela por criação: sem o carimbo do envio, este link é reemitido na hora.
    criadoEm: new Date(AGORA - JANELA_DE_REENVIO_MS - 10_000),
  });

  it("CONTROLE: sem o carimbo do envio, o link antigo é reemitido (a decisão SEM a escrita)", async () => {
    const m = montar([LINK_ANTIGO()]);
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);
    expect(r.emitido?.jti, "sem `enviado_em`, o antigo deveria reemitir").toBeTruthy();
  });

  it("depois de `marcarEnvioDoLink` carimbar `enviado_em`, a emissão seguinte se abstém", async () => {
    const m = montar([LINK_ANTIGO()]);

    await m.servico.marcarEnvioDoLink(JTI_SINTETICO, {
      canal: "EMAIL",
      origem: "MANUAL",
      autorId: AUTOR_SINTETICO,
    });
    const r = await m.servico.emitirLinkParaEnvio(ADMISSAO_SINTETICA, AUTOR_SINTETICO);

    // A ESCRITA MUDOU A DECISÃO SEGUINTE: o `enviado_em` recém-gravado trouxe o link para dentro da
    // janela. Com o dublê que só registrava, esta leitura continuaria vendo `enviado_em` nulo.
    expect(r.emitido, "a emissão não enxergou o `enviado_em` gravado").toBeNull();
    expect(r.jaAtivo?.motivo).toBe("ENVIADO_HA_POUCO");
  });
});
