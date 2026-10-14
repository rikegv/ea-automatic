import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MOTIVOS_DE_RECUSA_DE_ENVIO } from "@ea/shared-types";
import { verificarLink } from "../domain/portal-identidade";
import { PortalEnvioService } from "./portal-envio.service";
import { PortalIdentidadeService } from "./portal-identidade.service";
import {
  ADMISSAO_SINTETICA,
  AUTOR_SINTETICO,
  CPF_SINTETICO,
  EMAIL_SINTETICO,
  JTI_SINTETICO,
  bancoDoEnvio,
  correioFake,
  fonteOuNulo,
  instanciarPorTipos,
  corpoDoMetodo,
  textoDeTudo,
  trilhaFake,
  type CenarioDoEnvio,
  type LinkFake,
} from "./portal-envio.tester-fake";

/**
 * ─ O LINK PARA COPIAR, COBERTURA INDEPENDENTE (§A.38 / §A.40, regra 2) ─────────────────────────
 *
 * Escrito a partir do REQUISITO, por quem NÃO implementa a rota, ENQUANTO ela está sendo
 * construída. Enquanto `PortalEnvioService.gerarLinkParaCopiar` não existir, este arquivo falha,
 * e isso é o desenho, não o defeito.
 *
 * ┌─ O QUE A FRENTE EXISTE PARA RESOLVER ────────────────────────────────────────────────────────┐
 * │ O correio do Portal NÃO está configurado em lugar nenhum. Todo envio por e-mail recusa com   │
 * │ `CANAL_INDISPONIVEL` e NADA é emitido, então o consultor não tem NENHUMA saída para o        │
 * │ candidato que nasce fora do funil (o do "+ Nova Admissão"). Copiar a URL e mandar pelo canal │
 * │ que o time já usa é o gesto que não depende de infraestrutura nenhuma.                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ══ POR QUE ELE MEDE CONTRA OS DOIS SERVIÇOS REAIS, e não contra um dublê de emissor ══════════
 *
 * As três regras mais caras desta frente (a abstenção, a revogação do anterior e a NÃO aplicação
 * da janela de 3 minutos) são decididas DENTRO da transação de `emitirComTrava`, no serviço de
 * IDENTIDADE. Um dublê de emissor provaria apenas o que o serviço de envio faz DEPOIS que a
 * decisão já foi tomada, ou seja, provaria o dublê. Aqui o `PortalEnvioService` é montado sobre o
 * `PortalIdentidadeService` DE VERDADE, e só o banco é de mentirinha.
 *
 * Efeito colateral bem-vindo: nenhum teste deste arquivo supõe COMO o serviço de envio pede o
 * link ao de identidade (método novo, parâmetro novo, o que for). O que se afirma é o
 * COMPORTAMENTO observável, que é o que o requisito descreve.
 *
 * §A.6: todo e-mail, CPF e URL daqui são SINTÉTICOS, e existem para serem caçados nos escritos e
 * na trilha.
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

interface Montagem {
  envio: any;
  identidade: any;
  banco: ReturnType<typeof bancoDoEnvio>;
  trilha: ReturnType<typeof trilhaFake>;
  correio: ReturnType<typeof correioFake>;
}

/**
 * Monta a pilha REAL (envio sobre identidade) com banco, correio e trilha de mentirinha.
 *
 * `correioLigado` é falso POR PADRÃO, e o padrão é o retrato da produção: o caminho do link para
 * copiar tem de funcionar exatamente nesse estado, senão a frente não resolve nada.
 */
function montar(
  cenario: CenarioDoEnvio = {},
  opcoes: { correioLigado?: boolean } = {},
): Montagem {
  const banco = bancoDoEnvio(cenario);
  const trilha = trilhaFake();
  const correio = correioFake({ configurado: opcoes.correioLigado === true });

  const identidade = instanciarPorTipos(
    PortalIdentidadeService as any,
    {
      Database: banco.db,
      ConfigService: config(),
      PortalTrilhaService: trilha.fake,
      ThrottlerStorage: { increment: async () => ({ isBlocked: false }) },
    },
    { arquivo: ["portal", "portal-identidade.service.ts"], classe: "PortalIdentidadeService" },
  ) as any;

  const envio = instanciarPorTipos(
    PortalEnvioService as any,
    {
      Database: banco.db,
      PortalIdentidadeService: identidade,
      PortalCorreioService: correio.fake,
      PortalTrilhaService: trilha.fake,
    },
    { arquivo: ["portal", "portal-envio.service.ts"], classe: "PortalEnvioService" },
  ) as any;

  return { envio, identidade, banco, trilha, correio };
}

const inseriu = (m: Montagem) => m.banco.escritas.some((e) => e.tipo === "insert");
const revogou = (m: Montagem) => m.banco.escritas.some((e) => "revogadoEm" in e.valores);
const copiar = (m: Montagem, admissaoId = ADMISSAO_SINTETICA) =>
  m.envio.gerarLinkParaCopiar(admissaoId, AUTOR_SINTETICO);

/**
 * OS LINKS DE CENÁRIO SÃO FÁBRICAS, E NÃO CONSTANTES, e o motivo é um defeito medido neste mesmo
 * arquivo: `bancoDoEnvio` APLICA as escritas (`Object.assign` na linha), então um `LinkFake`
 * declarado no topo e passado direto a dois cenários chega ao segundo JÁ REVOGADO pelo primeiro.
 * O teste seguinte passa a medir outra coisa e falha por motivo errado, só na suíte completa.
 */
const vivoEAberto = (extra: Partial<LinkFake> = {}): LinkFake => ({
  id: JTI_SINTETICO,
  admissaoId: ADMISSAO_SINTETICA,
  expiraEm: new Date(AGORA + 40 * 3_600_000),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
  primeiroAcessoEm: new Date(AGORA - 5 * 60_000),
  criadoEm: new Date(AGORA - 60 * 60_000),
  enviadoEm: null,
  ...extra,
});

/** Vivo, nunca aberto, e ENTREGUE HÁ MUITO (fora de qualquer janela): o caso da regra 4. */
const vivoNuncaAberto = (extra: Partial<LinkFake> = {}): LinkFake =>
  vivoEAberto({
    primeiroAcessoEm: null,
    enviadoEm: new Date(AGORA - 60 * 60_000),
    criadoEm: new Date(AGORA - 60 * 60_000),
    ...extra,
  });

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 1. FUNCIONA SEM E-MAIL E SEM CORREIO, e este é o ponto inteiro da frente
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("regra 1: gera o link com o correio DESLIGADO e o candidato SEM e-mail", () => {
  /**
   * O ESTADO REAL DA PRODUÇÃO, e é por isso que ele é o cenário padrão deste bloco. Se alguém um
   * dia acoplar a checagem de e-mail ou a de canal a este caminho, é AQUI que quebra, e o
   * consultor volta a não ter saída nenhuma para o candidato do "+ Nova Admissão".
   */
  it("candidato sem e-mail e correio desligado: `gerado` é verdadeiro e o link vem junto", async () => {
    const m = montar({ pessoa: { email: null, admissaoId: ADMISSAO_SINTETICA } });
    const r = await copiar(m);
    expect(r.motivo, "o caminho do link para copiar recusou por causa do e-mail ou do canal").toBeNull();
    expect(r.gerado).toBe(true);
    expect(typeof r.link).toBe("string");
    expect(String(r.link)).toContain("#");
    expect(r.expiraEm, "sem prazo a tela não tem o que dizer ao consultor").toBeTruthy();
  });

  it("e-mail em branco e e-mail inválido também geram: nenhum dos dois é condição aqui", async () => {
    for (const email of ["", "   ", "fulano.detal@"]) {
      const m = montar({ pessoa: { email, admissaoId: ADMISSAO_SINTETICA } });
      const r = await copiar(m);
      expect(r.gerado, `recusou com o e-mail "${email}"`).toBe(true);
    }
  });

  it("NÃO manda e-mail nenhum: esta porta entrega a URL à tela, e mais nada", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { correioLigado: true });
    await copiar(m);
    expect(m.correio.enviados, "a porta de copiar disparou e-mail pelas costas").toEqual([]);
  });

  it("com o correio LIGADO o desfecho é o mesmo: o canal não manda neste caminho", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { correioLigado: true });
    const r = await copiar(m);
    expect(r.gerado).toBe(true);
    expect(r.link).toBeTruthy();
  });

  it("o link nasce de verdade: insere linha em `portal_links` e registra a emissão na trilha", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await copiar(m);
    expect(inseriu(m), "devolveu URL sem gravar o link: credencial que ninguém consegue revogar").toBe(true);
    expect(m.trilha.registros.map((r) => r.tipo)).toContain("PORTAL_LINK_EMITIDO");
  });

  /** O contrato é fechado: `gerado` verdadeiro implica motivo nulo, e vice-versa. */
  it("o par (`gerado`, `motivo`) é coerente e o motivo pertence ao catálogo do contrato", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    const r = await copiar(m);
    expect(Object.keys(r).sort()).toEqual(["expiraEm", "gerado", "link", "motivo"]);
    if (r.gerado) {
      expect(r.motivo).toBeNull();
    } else {
      expect(MOTIVOS_DE_RECUSA_DE_ENVIO).toContain(r.motivo);
      expect(r.link).toBeNull();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 2. O RECORTE DE FAROL, e a exigência dura é que NADA seja emitido fora dele
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("regra 2: farol fora do recorte recusa com SEM_ADMISSAO e NÃO emite", () => {
  /**
   * Declínio e rescisão estão encerrados (§A.16) e a pré-admissão do funil
   * (`AGUARDANDO_LIBERACAO`, `LIBERACAO_RECUSADA`) chega sem cliente, sem cargo e sem régua: não
   * há o que o candidato enviar, e a credencial chamaria a pessoa para uma coleta inexistente.
   *
   * Aqui a admissão simplesmente NÃO É ENCONTRADA pelo recorte, que é como as outras portas já se
   * comportam. O dublê do banco devolve vazio, que é exatamente o que a consulta com
   * `notInArray(farol, FAROIS_FORA_DO_PAINEL)` devolveria.
   */
  it("admissão fora do recorte: `gerado` falso, motivo SEM_ADMISSAO, link nulo", async () => {
    const m = montar({ pessoa: null });
    const r = await copiar(m);
    expect(r.gerado).toBe(false);
    expect(r.motivo).toBe("SEM_ADMISSAO");
    expect(r.link).toBeNull();
    expect(r.expiraEm).toBeNull();
  });

  /**
   * ELA RECUSA, NÃO EXPLODE. `enviarParaAdmissao` lança `NotFoundException` neste caso, e o
   * contrato desta rota tem um motivo próprio para isso: a tela precisa dizer "esta admissão não
   * recebe link", e não cair no ramo de erro genérico.
   */
  it("não lança: a recusa é DADO, e não exceção", async () => {
    const m = montar({ pessoa: null });
    await expect(copiar(m)).resolves.toBeTruthy();
  });

  it("NADA é emitido: nenhuma linha nova e nenhuma revogação", async () => {
    const m = montar({ pessoa: null, links: [vivoNuncaAberto()] });
    await copiar(m);
    expect(inseriu(m), "emitiu credencial para admissão fora do recorte").toBe(false);
    expect(revogou(m), "revogou o link de uma admissão que nem deveria ter sido alcançada").toBe(false);
    expect(m.trilha.registros, "abstenção por recorte é não evento").toEqual([]);
  });

  /*
   * ┌─ AQUI HAVIA UM TESTE QUE NÃO MEDIA NADA, E ELE FOI REMOVIDO ────────────────────────────────┐
   * │ Ele afirmava "os quatro faróis do recorte aparecem na consulta" varrendo                    │
   * │ `banco.consultas` atrás de `DECLINOU`, `RESCISAO` e companhia. A varredura anda pelo OBJETO │
   * │ DA TABELA `admissoes`, e o pgEnum `farol_global` carrega os quatro valores dentro do        │
   * │ próprio schema: a asserção passava COM filtro e SEM filtro, medido contra o código anterior │
   * │ ao recorte. Falso verde é pior que ausência de teste, porque compra confiança sem entregar. │
   * │                                                                                             │
   * │ O recorte É medido, pelos DOIS lados (farol barrado recusa, farol vivo emite), em           │
   * │ `portal-links-rota-antiga.tester.spec.ts`, com um envelope de banco que devolve a linha com │
   * │ o farol pedido. Achado do tester independente da rodada da rota antiga.                     │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 3. COPIAR DEVOLVE O MESMO LINK, inclusive quando o candidato JÁ ACESSOU
// (decisão do diretor Rike: copiar nunca gera link novo nem encerra o acesso vigente)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("regra 3: link VIVO e JÁ ACESSADO: copiar DEVOLVE O MESMO LINK, sem abster e sem encerrar o acesso", () => {
  it("devolve `gerado: true` com o MESMO link, e nenhum motivo de abstenção", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    const r = await copiar(m);
    expect(r.gerado).toBe(true);
    expect(r.motivo, "copiar devolveu uma abstenção em vez do link que o candidato já tem").toBeNull();
    expect(r.link, "copiar não devolveu a URL do link existente").toBeTruthy();
  });

  /**
   * O PONTO DA MUDANÇA: copiar deixou de REVOGAR. O consultor perde candidato quando a pessoa já
   * acessou, perde o link e pede de novo: antes a rota se abstinha e ele não conseguia reenviar.
   * Agora devolve o MESMO link, então nada é revogado e a sessão de quem está no upload segue viva.
   */
  it("NÃO encerra o acesso vigente: nada é revogado", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    await copiar(m);
    expect(revogou(m), "copiar derrubou o link que o candidato está usando").toBe(false);
    const anterior = m.banco.escritas.find((e) => e.tipo === "update");
    expect(anterior, "copiar escreveu um update (revogação) quando devia só ler o link existente").toBeUndefined();
  });

  it("NÃO gera link novo: nenhuma linha inserida em `portal_links`", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    await copiar(m);
    expect(inseriu(m), "copiar cunhou um link novo em vez de devolver o existente").toBe(false);
  });

  it("devolver o mesmo link é NÃO EVENTO: nada vai para a trilha", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    await copiar(m);
    expect(m.trilha.registros).toEqual([]);
  });

  /**
   * VENCIDO, BLOQUEADO ou REVOGADO NÃO é "o mesmo link" a devolver: não há link vivo, então copiar
   * emite o primeiro/renovado normalmente (é a mesma válvula de escape de antes).
   */
  it("acessado porém VENCIDO, BLOQUEADO ou REVOGADO não há o que devolver: copiar emite um novo", async () => {
    const fora: Array<[string, LinkFake]> = [
      ["vencido", vivoEAberto({ expiraEm: new Date(AGORA - 60_000) })],
      ["bloqueado", vivoEAberto({ bloqueadoEm: new Date(AGORA - 60_000) })],
      ["revogado", vivoEAberto({ revogadoEm: new Date(AGORA - 60_000) })],
      ["suspenso", vivoEAberto({ suspensoAte: new Date(AGORA + 60_000) })],
    ];
    for (const [rotulo, link] of fora) {
      const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [link] });
      const r = await copiar(m);
      expect(r.gerado, `link ${rotulo}: copiar não emitiu o novo`).toBe(true);
      expect(inseriu(m), `link ${rotulo}: copiar não cunhou o novo link`).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 4. LINK VIVO NUNCA ABERTO TAMBÉM É DEVOLVIDO COMO O MESMO (copiar NUNCA substitui)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("regra 4: copiar devolve o link vivo existente (aberto ou não), sem substituir", () => {
  it("link vivo NUNCA aberto: devolve o existente, sem emitir novo e sem revogar", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoNuncaAberto()] });
    const r = await copiar(m);
    expect(r.gerado).toBe(true);
    expect(r.link).toBeTruthy();
    expect(inseriu(m), "copiar cunhou um link novo para quem já tinha um vivo").toBe(false);
    expect(revogou(m), "copiar revogou o link vivo em vez de devolvê-lo").toBe(false);
  });

  it("devolver o existente NÃO vai para a trilha (não houve emissão nem revogação)", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoNuncaAberto()] });
    await copiar(m);
    expect(m.trilha.registros).toEqual([]);
  });

  it("admissão SEM link vivo nenhum emite o PRIMEIRO link normalmente", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [] });
    const r = await copiar(m);
    expect(r.gerado).toBe(true);
    expect(inseriu(m)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 5. COPIAR DUAS VEZES DEVOLVE O MESMO LINK (não há janela, não há link novo)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("regra 5: copiar o mesmo candidato duas vezes devolve a MESMA URL", () => {
  /**
   * O token do link é DETERMINÍSTICO (HMAC do mesmo `jti` + mesma janela), então devolver o link
   * existente duas vezes produz a URL idêntica, sem cunhar nada. É o oposto do comportamento antigo,
   * em que a segunda chamada revogava a primeira e gerava outra URL.
   */
  it("copiar DUAS VEZES um link que já existe devolve a MESMA URL, sem emitir novo", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoNuncaAberto()] });
    const primeiro = await copiar(m);
    const segundo = await copiar(m);
    expect(primeiro.gerado).toBe(true);
    expect(segundo.gerado).toBe(true);
    expect(segundo.motivo, "copiar devolveu abstenção ou janela na segunda vez").toBeNull();
    expect(String(segundo.link), "a segunda cópia devolveu um link DIFERENTE da primeira").toBe(
      String(primeiro.link),
    );
    expect(inseriu(m), "copiar emitiu link novo em vez de devolver o existente").toBe(false);
  });

  it("link recém-ENTREGUE à mão (nunca aberto) é devolvido como está, sem janela que trave", async () => {
    const recem = vivoNuncaAberto({ enviadoEm: null, criadoEm: new Date(AGORA - 5_000) });
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [recem] });
    const r = await copiar(m);
    expect(r.motivo).not.toBe("ENVIADO_HA_POUCO");
    expect(r.gerado).toBe(true);
    expect(inseriu(m), "copiar emitiu novo em vez de devolver o recém-entregue").toBe(false);
  });

  it("link recém-ENVIADO por e-mail (nunca aberto) também é devolvido, sem travar", async () => {
    const recem = vivoNuncaAberto({
      enviadoEm: new Date(AGORA - 5_000),
      criadoEm: new Date(AGORA - 5_000),
    });
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [recem] });
    const r = await copiar(m);
    expect(r.motivo).not.toBe("ENVIADO_HA_POUCO");
    expect(r.gerado).toBe(true);
  });

  /**
   * O RECORTE PELO OUTRO LADO: copiar NÃO abstém mais pelo "já acessou". O acessado é DEVOLVIDO como
   * o mesmo link (gerado verdadeiro, sem motivo), que é exatamente a correção desta OST.
   */
  it("acessado NÃO segura mais a cópia: é devolvido como o mesmo link", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    const r = await copiar(m);
    expect(r.gerado).toBe(true);
    expect(r.motivo).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 6. O LINK DEVOLVIDO É O MESMO: verifica para o MESMO `jti` e a MESMA janela
// (fecha o buraco que o `tester` apontou: a URL era só string, "mesmo link" não era medido)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("regra 6: a URL devolvida resolve para o MESMO link (jti) e preserva a janela", () => {
  const PUB = createPublicKey(privateKey);
  // A URL é `base#<frag>=<token>` (o fragmento carrega `l=` por contrato); o token em si é base64url
  // (sem `=`), então pega tudo depois do PRIMEIRO `=` do fragmento.
  const tokenDe = (link: string | null | undefined) => {
    const frag = String(link ?? "").split("#")[1] ?? "";
    return frag.slice(frag.indexOf("=") + 1);
  };

  it("a URL devolvida VERIFICA e resolve para o MESMO jti e admissão (não é uma string qualquer)", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    const r = await copiar(m);
    const v = verificarLink(tokenDe(r.link), PUB, AGORA);
    expect(v.ok, "o token devolvido não verifica com a chave do Portal").toBe(true);
    if (v.ok) {
      expect(v.jti, "copiar devolveu um jti diferente do link que o candidato já tem").toBe(JTI_SINTETICO);
      expect(v.admissaoId).toBe(ADMISSAO_SINTETICA);
    }
  });

  it("a cópia PRESERVA a janela do link existente, não estende para agora+TTL", async () => {
    const link = vivoEAberto(); // expira em AGORA + 40h
    const expiraEm = link.expiraEm as Date;
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [link] });
    const r = await copiar(m);
    expect(r.expiraEm, "o prazo devolvido não é o do link existente").toBe(expiraEm.toISOString());
    const v = verificarLink(tokenDe(r.link), PUB, AGORA);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(
        Math.abs(v.expMs - expiraEm.getTime()),
        "o `exp` do token re-cunhado saiu da janela original do link",
      ).toBeLessThanOrEqual(1_100);
    }
  });

  /*
   * A PREFERÊNCIA "entre vários vivos, devolve o que o candidato JÁ ABRIU" (impl
   * `portal-identidade.service.ts`, `vivos.find(primeiroAcessoEm!==null) ?? mais recente`) é um EDGE:
   * depois que emitir passou a revogar o anterior, uma admissão tem normalmente UM link vivo. O banco
   * de mentirinha desta casa modela UM link por cenário (a consulta de link devolve um conjunto único),
   * então o desempate entre MÚLTIPLOS vivos não é exercitável aqui sem reescrever o fake compartilhado.
   * Fica REPORTADO como resíduo de cobertura (baixo risco: múltiplos vivos é raro), e o comportamento de
   * UM link acessado (o caso real) está provado acima (devolve o mesmo jti, não abstém, não revoga).
   */

  it("duas cópias do MESMO link ACESSADO devolvem a MESMA URL (determinismo no caso principal)", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] });
    const a = await copiar(m);
    const b = await copiar(m);
    expect(String(b.link)).toBe(String(a.link));
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 6. REGRESSÃO: O CAMINHO DO E-MAIL NÃO PODE TER MUDADO
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("regra 6: `enviarParaAdmissao` continua exatamente como foi auditado", () => {
  const enviar = (m: Montagem) =>
    m.envio.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");

  it("sem e-mail: recusa SEM_EMAIL e NÃO emite (a regra do diretor)", async () => {
    const m = montar({ pessoa: { email: null, admissaoId: ADMISSAO_SINTETICA } }, { correioLigado: true });
    const r = await enviar(m);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("SEM_EMAIL");
    expect(inseriu(m), "emitiu link para um envio que não podia sair").toBe(false);
  });

  it("e-mail inválido: recusa EMAIL_INVALIDO, e é recusa DISTINTA de SEM_EMAIL", async () => {
    const m = montar(
      { pessoa: { email: "fulano.detal@", admissaoId: ADMISSAO_SINTETICA } },
      { correioLigado: true },
    );
    const r = await enviar(m);
    expect(r.motivo).toBe("EMAIL_INVALIDO");
    expect(inseriu(m)).toBe(false);
  });

  /** A inércia fail-closed: sem correio configurado, recusa E NÃO EMITE. */
  it("correio desligado: recusa CANAL_INDISPONIVEL e NÃO emite", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    const r = await enviar(m);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("CANAL_INDISPONIVEL");
    expect(inseriu(m), "link vivo e órfão por um e-mail que nunca sairia").toBe(false);
  });

  it("continua se abstendo por LINK_VIVO_EM_USO", async () => {
    const m = montar(
      { pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [vivoEAberto()] },
      { correioLigado: true },
    );
    const r = await enviar(m);
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("LINK_VIVO_EM_USO");
    expect(revogou(m)).toBe(false);
  });

  /**
   * A JANELA CONTINUA VALENDO LÁ, e é este o teste que prova que a mudança da regra 5 não vazou
   * para o caminho do e-mail. Sem ele, "dispensar a janela" viraria "apagar a janela".
   */
  it("continua se abstendo por ENVIADO_HA_POUCO", async () => {
    const recem = vivoNuncaAberto({
      enviadoEm: new Date(AGORA - 5_000),
      criadoEm: new Date(AGORA - 5_000),
    });
    const m = montar(
      { pessoa: { admissaoId: ADMISSAO_SINTETICA }, links: [recem] },
      { correioLigado: true },
    );
    const r = await enviar(m);
    expect(
      r.motivo,
      "a janela de reenvio sumiu do caminho do e-mail: um segundo clique mata a mensagem na caixa do candidato",
    ).toBe("ENVIADO_HA_POUCO");
    expect(r.enviado).toBe(false);
    expect(revogou(m)).toBe(false);
  });

  it("caminho feliz: envia, carimba e NÃO devolve a URL na resposta", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { correioLigado: true });
    const r = await enviar(m);
    expect(r.enviado).toBe(true);
    expect(m.correio.enviados.length).toBe(1);
    expect(Object.keys(r), "a credencial voltou pela rota do e-mail").not.toContain("link");
    expect(r.destinoMascarado, "o endereço voltou em claro").not.toBe(EMAIL_SINTETICO);
    expect(String(r.destinoMascarado)).toContain("*");
  });

  /** Admissão fora do recorte continua sendo 404 no caminho do e-mail, e não um desfecho de dado. */
  it("admissão fora do recorte continua lançando NotFound no caminho do e-mail", async () => {
    const m = montar({ pessoa: null }, { correioLigado: true });
    await expect(enviar(m)).rejects.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// O CARIMBO DA LINHA: a origem diz a verdade, e o `enviado_em` NÃO é falsificado
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("o link nasce carimbado como ENTREGA_A_MAO e sem carimbo de envio", () => {
  const insercao = (m: Montagem) => m.banco.escritas.find((e) => e.tipo === "insert")?.valores ?? {};

  /**
   * A COLUNA DE ORIGEM É O QUE RESPONDE AO ITEM 4 DA OST ("todo link aparece no Gerenciador,
   * INDEPENDENTE da origem"), e `MANUAL` já quer dizer outra coisa: "o RH mandou por e-mail pelo
   * Gerenciador". Aqui ninguém mandou nada, o sistema gerou e uma pessoa entrega por fora.
   */
  it("a origem gravada é `ENTREGA_A_MAO`, e não `MANUAL` nem `AUTOMATICO`", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await copiar(m);
    expect(insercao(m).envioOrigem).toBe("ENTREGA_A_MAO");
  });

  /**
   * ══ E ESTE É UM TESTE DE CRUZAMENTO, não de cosmética ══════════════════════════════════════
   *
   * `enviado_em` é o carimbo que LIGA a janela de reenvio do caminho do e-mail (`entregueHaPouco`
   * olha `enviado_em` antes de `criado_em`). Escrevê-lo aqui diria "enviado por e-mail" sobre um
   * e-mail que ninguém mandou e bloquearia, por três minutos, um envio legítimo logo em seguida,
   * com os dois botões lado a lado na tela. É a fresta do achado 14, pela porta nova.
   */
  it("NÃO escreve `enviado_em`, `envio_canal` nem `enviado_por_id`: nada foi enviado", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await copiar(m);
    for (const campo of ["enviadoEm", "envioCanal", "enviadoPorId"]) {
      expect(
        insercao(m)[campo],
        `${campo} carimbado por quem não enviou: a janela do e-mail liga sozinha`,
      ).toBeUndefined();
    }
  });

  /** A prova do cruzamento, pelo comportamento: copiar agora não impede enviar por e-mail agora. */
  it("copiar o link NÃO bloqueia o envio por e-mail logo em seguida por `ENVIADO_HA_POUCO`", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } }, { correioLigado: true });
    const copiado = await copiar(m);
    expect(copiado.gerado).toBe(true);
    const enviado = await m.envio.enviarParaAdmissao(ADMISSAO_SINTETICA, AUTOR_SINTETICO, "MANUAL");
    /*
     * ┌─ E AQUI O DESFECHO CERTO É A ABSTENÇÃO, não o envio ──────────────────────────────────────┐
     * │ A janela DEVE segurar: o consultor acabou de receber a URL para entregar à mão, e o envio │
     * │ por e-mail revogaria justamente esse link. O que este teste afirma é que a abstenção vem  │
     * │ da ENTREGA (`criado_em`), que é o critério do achado 14, e NÃO de um `enviado_em` falso   │
     * │ escrito pela porta de copiar. As duas coisas dariam o mesmo código aqui, então a          │
     * │ distinção é feita pelo teste de cima, que olha a escrita.                                 │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    expect(enviado.motivo).toBe("ENVIADO_HA_POUCO");
    expect(enviado.enviado).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 7. §A.6: A URL É CREDENCIAL E NÃO SOBRA EM LUGAR NENHUM
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("regra 7 (§A.6): o token não é persistido, não entra na trilha e não é logado", () => {
  const tokenDe = (link: unknown) => String(link ?? "").split("#").pop() ?? "";

  it("o token da URL devolvida não aparece em escrita de banco nem na trilha", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    const r = await copiar(m);
    const token = tokenDe(r.link);
    expect(token.length, "o token não foi lido do link: o teste estaria passando por acidente").toBeGreaterThan(20);
    const ficou = textoDeTudo([m.banco.escritas, m.trilha.registros]);
    expect(ficou, "a credencial foi persistida ou registrada").not.toContain(token);
  });

  it("nem o CPF nem o e-mail do candidato atravessam para a trilha desta emissão", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await copiar(m);
    const ficou = textoDeTudo([m.banco.escritas, m.trilha.registros]);
    expect(ficou).not.toContain(CPF_SINTETICO);
    expect(ficou).not.toContain(EMAIL_SINTETICO);
  });

  /** O evento de emissão leva jti, autor e exp. Nada além, e nada a menos. */
  it("`PORTAL_LINK_EMITIDO` carrega jti, autor e exp, e nenhum campo de credencial", async () => {
    const m = montar({ pessoa: { admissaoId: ADMISSAO_SINTETICA } });
    await copiar(m);
    const evento = m.trilha.registros.find((e) => e.tipo === "PORTAL_LINK_EMITIDO");
    expect(evento, "a emissão não deixou rastro nenhum").toBeTruthy();
    const dados = (evento?.dados ?? {}) as Record<string, unknown>;
    expect(dados.jtiLink).toBeTruthy();
    expect(dados.autorId).toBe(AUTOR_SINTETICO);
    expect(typeof dados.exp).toBe("number");
    for (const proibido of ["link", "url", "token", "email", "cpf", "destino"]) {
      expect(Object.keys(dados).map((k) => k.toLowerCase()), `campo ${proibido} na trilha`).not.toContain(
        proibido,
      );
    }
  });

  /**
   * O LOG É A PORTA QUE MAIS ESCAPA, porque ele não falha nunca. A prova é de FONTE: nenhum
   * `this.log.*` dentro do método novo pode interpolar a URL, o link ou o e-mail.
   */
  it("o método novo não loga link, url nem e-mail", () => {
    const fonte = fonteOuNulo("portal", "portal-envio.service.ts");
    expect(fonte, "a fonte do serviço de envio sumiu").toBeTruthy();
    const corpo = corpoDoMetodo(fonte as string, "gerarLinkParaCopiar");
    expect(corpo, "`gerarLinkParaCopiar` não existe em `portal-envio.service.ts`").toBeTruthy();
    const logs = (corpo as string).match(/this\.log\.\w+\([^)]*\)/g) ?? [];
    for (const linha of logs) {
      expect(linha, "log com credencial dentro").not.toMatch(/\blink\b|\burl\b|email|token|cpf/i);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// A PORTA HTTP: a rota existe, é POST, não recebe corpo e não nasce sob `portal/`
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("a rota `POST esteira/portal/envio/admissao/:admissaoId/link`", () => {
  const fonte = () => fonteOuNulo("portal", "portal-envio.controller.ts") ?? "";

  it("existe, e é POST no caminho do contrato", () => {
    expect(fonte(), "a rota do link para copiar não foi declarada").toMatch(
      /@Post\(\s*["'`]admissao\/:admissaoId\/link["'`]\s*\)/,
    );
  });

  it("chama `gerarLinkParaCopiar` e passa o AUTOR: emissão sem autor é rastro pela metade", () => {
    expect(fonte()).toMatch(/gerarLinkParaCopiar\(\s*admissaoId\s*,\s*user\.id/);
    expect(fonte()).toContain("@CurrentUser()");
  });

  /** O id vem de parâmetro validado, como na irmã: id malformado não chega ao banco. */
  it("o `admissaoId` passa pelo `ParseUUIDPipe`", () => {
    expect(fonte()).toMatch(/@Post\(\s*["'`]admissao\/:admissaoId\/link["'`]\s*\)[\s\S]{0,300}ParseUUIDPipe/);
  });

  /**
   * SEM CORPO. O contrato diz "sem corpo", e a razão é a mesma que apagou o DTO de origem da irmã:
   * campo que o cliente escreve é campo que o cliente forja, e aqui não há nada para ele dizer.
   */
  it("não aceita corpo: nenhum `@Body` no handler novo", () => {
    const trecho = fonte().split(/@Post\(\s*["'`]admissao\/:admissaoId\/link["'`]\s*\)/)[1] ?? "";
    const handler = trecho.slice(0, trecho.indexOf("}"));
    expect(handler, "a rota aceita corpo, e corpo é superfície de forjar").not.toContain("@Body");
  });
});
