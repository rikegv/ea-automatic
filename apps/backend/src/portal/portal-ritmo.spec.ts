import { CODIGOS_ERRO_IDENTIFICACAO } from "@ea/shared-types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpException, type CanActivate } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";

/** O que o `ThrottlerStorage.increment` devolve. Copiado do contrato da biblioteca. */
interface RegistroDoBalde {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}
import { describe, expect, it, vi } from "vitest";
import {
  BALDES_RITMO_PORTAL,
  BALDES_RITMO_SESSAO,
  LIMITES_RITMO_PORTAL,
  LIMITES_RITMO_SESSAO,
  ipConfiavelDaBorda,
  origemDaRequisicao,
  proxiesEsperadosDaConfiguracao,
  saltosConfiaveisDaConfiguracao,
} from "../domain/portal-ritmo";
import { PortalRitmoContadores } from "./portal-ritmo.contadores";
import { PORTAL_IDENTIFICACAO_BLOQUEADA } from "./portal-identidade.service";
import { PortalRitmoGuard, PortalRitmoSessaoGuard } from "./portal-ritmo.guard";
import { PortalAcessoEmailController } from "./portal-acesso-email.controller";
import { PortalController } from "./portal.controller";
import { PortalDocumentosController } from "./portal-documentos.controller";
import { PortalDadosGiController } from "./portal-dados-gi.controller";
import { PortalTermoController } from "./portal-termo.controller";
import { PortalVtController } from "./portal-vt.controller";

/**
 * O LIMITE DE RITMO DAS CINCO ROTAS ANÔNIMAS DO PORTAL (veto 2 do mapa de acesso público).
 *
 * O que estes testes travam, na ordem em que o veto cobra:
 *  1. de onde sai o IP confiável, e que ele NÃO é forjável pelo visitante;
 *  2. que abaixo da cota passa e acima devolve 429;
 *  3. que IPs diferentes NÃO se atrapalham;
 *  4. que a recusa não vaza NADA (mesmo corpo para as duas regras, mesma frase de sempre);
 *  5. que o resto do sistema não mudou: nada de `trust proxy`, balde global intocado, e as rotas
 *     COM sessão continuam onde estavam.
 */

/** Armazém de teste no molde do `ThrottlerStorageService`: janela fixa por chave, tempo injetado. */
function armazemFake(): ThrottlerStorage & { relogio: { agora: number } } {
  const mapa = new Map<string, { hits: number; expiraEm: number }>();
  const relogio = { agora: 0 };
  return {
    relogio,
    async increment(
      chave: string,
      ttl: number,
      limite: number,
      _bloqueio: number,
      nome: string,
    ): Promise<RegistroDoBalde> {
      const id = `${nome}:${chave}`;
      const atual = mapa.get(id);
      const vivo = atual && atual.expiraEm > relogio.agora ? atual : undefined;
      const linha = vivo ?? { hits: 0, expiraEm: relogio.agora + ttl };
      linha.hits += 1;
      mapa.set(id, linha);
      return {
        totalHits: linha.hits,
        timeToExpire: linha.expiraEm - relogio.agora,
        isBlocked: linha.hits > limite,
        timeToBlockExpire: linha.expiraEm - relogio.agora,
      };
    },
  };
}

const requisicao = (xff?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: xff ? { "x-forwarded-for": xff } : {} }) }),
  }) as never;

/** A topologia de hoje: um salto (só o Caddy), e o Caddy escreve `127.0.0.1` como âncora. */
const TOPOLOGIA_HOJE = { saltos: 1, proxiesEsperados: ["127.0.0.1"] };
/** A topologia com a barreira: dois saltos, e o Apache é o proxy mais à direita. */
const TOPOLOGIA_BARREIRA = { saltos: 2, proxiesEsperados: ["192.168.1.174"] };

function montarGuard(
  saltos: string | undefined,
  trilhaConfigurada = true,
  Classe: typeof PortalRitmoGuard | typeof PortalRitmoSessaoGuard = PortalRitmoGuard,
  proxy: string | undefined = "127.0.0.1",
) {
  const armazem = armazemFake();
  const registrar = vi.fn(
    async (_tipo: string, _cru?: Record<string, unknown>, _ipCompleto?: string | null) => {},
  );
  const contadores = new PortalRitmoContadores();
  const guard = new Classe(
    armazem,
    {
      get: (chave: string) =>
        ({
          PORTAL_RITMO_SALTOS_CONFIAVEIS: saltos,
          PORTAL_RITMO_PROXY_ESPERADO: proxy,
        })[chave],
    } as never,
    { configurada: () => trilhaConfigurada, registrar } as never,
    contadores,
  );
  return { guard, armazem, registrar, contadores };
}

async function bater(guard: CanActivate, xff: string | undefined, vezes: number) {
  let recusas = 0;
  const corpos: unknown[] = [];
  for (let i = 0; i < vezes; i += 1) {
    try {
      await guard.canActivate(requisicao(xff));
    } catch (erro) {
      recusas += 1;
      corpos.push({
        status: (erro as HttpException).getStatus(),
        corpo: (erro as HttpException).getResponse(),
      });
    }
  }
  return { recusas, corpos };
}

describe("DE ONDE SAI O IP CONFIÁVEL, e ele é ANCORADO na topologia declarada", () => {
  it("sem saltos declarados, NÃO existe IP confiável (falha fechado)", () => {
    expect(ipConfiavelDaBorda("203.0.113.9", { saltos: 0, proxiesEsperados: ["127.0.0.1"] })).toBeNull();
    expect(origemDaRequisicao("203.0.113.9", { saltos: 0, proxiesEsperados: [] }).motivo).toBe(
      "DESLIGADO",
    );
    expect(saltosConfiaveisDaConfiguracao(undefined)).toBe(0);
    expect(saltosConfiaveisDaConfiguracao("")).toBe(0);
    expect(saltosConfiaveisDaConfiguracao("nao-e-numero")).toBe(0);
    expect(saltosConfiaveisDaConfiguracao("2")).toBe(2);
  });

  it("sem a ÂNCORA declarada, nada é confiável, mesmo com os saltos certos", () => {
    const r = origemDaRequisicao("203.0.113.9, 127.0.0.1", { saltos: 1, proxiesEsperados: [] });
    expect(r.ip).toBeNull();
    expect(r.motivo).toBe("SEM_ANCORA");
    expect(proxiesEsperadosDaConfiguracao("")).toEqual([]);
    expect(proxiesEsperadosDaConfiguracao(" 127.0.0.1 , 192.168.1.174 ")).toEqual([
      "127.0.0.1",
      "192.168.1.174",
    ]);
  });

  it("um salto (só o Caddy) lê o ÚLTIMO, que é o que o nosso proxy escreveu", () => {
    expect(ipConfiavelDaBorda("127.0.0.1", TOPOLOGIA_HOJE)).toBe("127.0.0.1");
    expect(ipConfiavelDaBorda("1.1.1.1, 127.0.0.1", TOPOLOGIA_HOJE)).toBe("127.0.0.1");
  });

  it("dois saltos (Apache + Caddy) leem o penúltimo, e o forjado à esquerda é IGNORADO", () => {
    // O que o Caddy com `trusted_proxies` entrega: "<forjado pelo cliente>, <real>, <apache>".
    expect(ipConfiavelDaBorda("9.9.9.9, 203.0.113.9, 192.168.1.174", TOPOLOGIA_BARREIRA)).toBe(
      "203.0.113.9",
    );
    expect(
      ipConfiavelDaBorda("1.1.1.1, 2.2.2.2, 203.0.113.9, 192.168.1.174", TOPOLOGIA_BARREIRA),
    ).toBe("203.0.113.9");
  });

  /**
   * OS TRÊS DESVIOS DO VETO 1, e o que muda é que agora os três devolvem NADA em vez de um IP.
   * O sobre-declarado é o mais perigoso dos três: sem a âncora, ele entrega ao atacante a escolha
   * de em qual balde cair, e com isso ele ENVENENA o balde de um terceiro e barra a vítima.
   */
  it("SOBRE-DECLARADO (2 saltos com só o Caddy na frente) devolve null, e não o IP do atacante", () => {
    // O cliente manda "9.9.9.9"; o Caddy sobrescreve e entrega "127.0.0.1". Declarar 2 faria a
    // função ler o elemento que NÃO existe; com uma entrada a mais forjada, leria a do atacante.
    const cadeiaCurta = origemDaRequisicao("127.0.0.1", {
      saltos: 2,
      proxiesEsperados: ["127.0.0.1"],
    });
    expect(cadeiaCurta.ip).toBeNull();
    expect(cadeiaCurta.motivo).toBe("CADEIA_CURTA");

    // E o caso que o `seguranca` provou: o cliente acrescenta uma entrada, a cadeia passa a ter
    // dois elementos, e o sobre-declarado leria "9.9.9.9", que é escolha DELE.
    const comForja = origemDaRequisicao("9.9.9.9, 127.0.0.1", {
      saltos: 2,
      proxiesEsperados: ["192.168.1.174"],
    });
    expect(comForja.ip).toBeNull();
    expect(comForja.motivo).toBe("ANCORA_NAO_BATE");
  });

  it("SUB-DECLARADO (1 salto com o Apache na frente) devolve null, e não colapsa todos num balde", () => {
    const r = origemDaRequisicao("203.0.113.9, 192.168.1.174", {
      saltos: 1,
      proxiesEsperados: ["127.0.0.1"],
    });
    expect(r.ip).toBeNull();
    expect(r.motivo).toBe("ANCORA_NAO_BATE");
  });

  it("cadeia mais curta que a declarada NÃO vira IP, e lixo também não", () => {
    expect(ipConfiavelDaBorda("192.168.1.174", TOPOLOGIA_BARREIRA)).toBeNull();
    expect(origemDaRequisicao(undefined, TOPOLOGIA_HOJE).motivo).toBe("SEM_CABECALHO");
    expect(origemDaRequisicao("", TOPOLOGIA_HOJE).motivo).toBe("SEM_CABECALHO");
    expect(ipConfiavelDaBorda("nao-e-ip", TOPOLOGIA_HOJE)).toBeNull();
    expect(ipConfiavelDaBorda("'; drop table portal_links; --", TOPOLOGIA_HOJE)).toBeNull();
    expect(
      origemDaRequisicao("nao-e-ip, 127.0.0.1", { saltos: 2, proxiesEsperados: ["127.0.0.1"] })
        .motivo,
    ).toBe("VALOR_INVALIDO");
  });

  /**
   * O SEGREDO DA BORDA é o único conserto que fecha o terceiro desvio (barreira apontada para a
   * porta do Next, onde a lista inteira é escolha do visitante). Declarado, ele é OBRIGATÓRIO.
   */
  it("com segredo declarado, requisição sem o segredo NÃO tem IP confiável", () => {
    const base = { saltos: 1, proxiesEsperados: ["127.0.0.1"], segredoEsperado: "s3gr3d0" };
    expect(origemDaRequisicao("203.0.113.9, 127.0.0.1", base).motivo).toBe("SEGREDO_AUSENTE");
    expect(
      origemDaRequisicao("203.0.113.9, 127.0.0.1", { ...base, segredoRecebido: "errado" }).motivo,
    ).toBe("SEGREDO_AUSENTE");
    expect(
      origemDaRequisicao("203.0.113.9, 127.0.0.1", { ...base, segredoRecebido: "s3gr3d0" }).ip,
    ).toBe("127.0.0.1");
  });

  it("normaliza o que a borda costuma escrever (mapeado em IPv6, porta, colchete)", () => {
    const doisSaltosNoCaddy = { saltos: 2, proxiesEsperados: ["127.0.0.1"] };
    expect(ipConfiavelDaBorda("::ffff:203.0.113.9, 127.0.0.1", doisSaltosNoCaddy)).toBe(
      "203.0.113.9",
    );
    expect(ipConfiavelDaBorda("203.0.113.9:54312, 127.0.0.1", doisSaltosNoCaddy)).toBe(
      "203.0.113.9",
    );
    expect(ipConfiavelDaBorda("[2001:db8::1], 127.0.0.1", doisSaltosNoCaddy)).toBe("2001:db8::1");
  });
});

describe("ABAIXO DA COTA PASSA, ACIMA DEVOLVE 429", () => {
  it("o candidato real (menos de 20 chamadas) passa inteiro", async () => {
    const { guard } = montarGuard("2");
    const { recusas } = await bater(guard, "203.0.113.9, 127.0.0.1", 14);
    expect(recusas).toBe(0);
  });

  it("a rajada morde na 16a chamada, e o status é 429", async () => {
    const { guard } = montarGuard("2");
    const { recusas, corpos } = await bater(
      guard,
      "203.0.113.9, 127.0.0.1",
      LIMITES_RITMO_PORTAL.IP_RAJADA_LIMITE + 3,
    );
    expect(recusas).toBe(3);
    expect((corpos[0] as { status: number }).status).toBe(429);
  });

  it("passada a rajada, o sustentado ainda corta o laço em 60 por 5 minutos", async () => {
    const { guard, armazem } = montarGuard("2");
    let passou = 0;
    for (let i = 0; i < 200; i += 1) {
      // O relógio anda 11 segundos por chamada: a rajada nunca enche, e sobra só o sustentado.
      armazem.relogio.agora += 11_000;
      try {
        await guard.canActivate(requisicao("203.0.113.9, 127.0.0.1"));
        passou += 1;
      } catch {
        /* recusado */
      }
    }
    // 200 chamadas em 2200 segundos, que são pouco mais de 7 janelas de 5 minutos.
    expect(passou).toBeLessThanOrEqual(8 * LIMITES_RITMO_PORTAL.IP_LIMITE);
    expect(passou).toBeGreaterThan(0);
  });
});

describe("IPs DIFERENTES NÃO SE ATRAPALHAM", () => {
  it("o vizinho barrado não barra o candidato ao lado", async () => {
    const { guard } = montarGuard("2");
    await bater(guard, "203.0.113.9, 127.0.0.1", LIMITES_RITMO_PORTAL.IP_RAJADA_LIMITE + 5);
    const vizinho = await bater(guard, "198.51.100.4, 127.0.0.1", 10);
    expect(vizinho.recusas).toBe(0);
  });

  it("quem já estourou NÃO consome o balde da SUPERFÍCIE contra os outros", async () => {
    const { guard } = montarGuard("2");
    // 1015 chamadas de um abusador: se elas tocassem a superfície, os 120 por minuto morreriam.
    await bater(guard, "203.0.113.9, 127.0.0.1", 1015);
    const legitimo = await bater(guard, "198.51.100.4, 127.0.0.1", 10);
    expect(legitimo.recusas).toBe(0);
  });

  it("sem IP confiável, o teto da SUPERFÍCIE continua de pé (120 por minuto, isolado)", async () => {
    const { guard } = montarGuard(undefined);
    const { recusas } = await bater(guard, "9.9.9.9, 127.0.0.1", LIMITES_RITMO_PORTAL.SUPERFICIE_LIMITE + 5);
    expect(recusas).toBe(5);
  });
});

describe("A RECUSA NÃO VAZA NADA", () => {
  it("as duas regras devolvem o MESMO corpo, byte a byte", async () => {
    const porIp = await bater(montarGuard("2").guard, "203.0.113.9, 127.0.0.1", 20);
    const porSuperficie = await bater(montarGuard(undefined).guard, undefined, 130);
    const a = (porIp.corpos[0] as { corpo: unknown }).corpo;
    const b = (porSuperficie.corpos[0] as { corpo: unknown }).corpo;
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(
      JSON.stringify({
        codigo: "BLOQUEADO",
        mensagem: PORTAL_IDENTIFICACAO_BLOQUEADA,
        message: PORTAL_IDENTIFICACAO_BLOQUEADA,
      }),
    );
  });

  it("o corpo não carrega IP, nem cota, nem quanto falta, nem qual balde mordeu", async () => {
    const { corpos } = await bater(montarGuard("2").guard, "203.0.113.9, 127.0.0.1", 20);
    const texto = JSON.stringify(corpos[0]);
    for (const proibido of ["203.0.113", "RITMO_IP", "RITMO_SUPERFICIE", "rajada", "60", "120"]) {
      expect(texto).not.toContain(proibido);
    }
  });

  it("§A.11: a frase do teto não tem travessão", () => {
    expect(PORTAL_IDENTIFICACAO_BLOQUEADA).not.toContain("\u2014");
  });

  /**
   * O CÓDIGO É O QUE JÁ EXISTE, e este teste é a trava contra "criar um código novo pareceu mais
   * claro". `CODIGOS_ERRO_IDENTIFICACAO` é lista FECHADA no contrato compartilhado, e a tela do
   * candidato descarta o que não estiver nela: código novo faria o candidato limitado ler "portal
   * indisponível" em vez de "aguarde alguns minutos".
   */
  it("o código do 429 está no vocabulário fechado que a tela conhece", () => {
    expect(CODIGOS_ERRO_IDENTIFICACAO as readonly string[]).toContain("BLOQUEADO");
  });
});

describe("A TRILHA DO ESTOURO É ESTRANGULADA, E NÃO GRAVA IP EM CLARO", () => {
  it("mil recusas geram no máximo UMA linha por regra por minuto", async () => {
    const { guard, registrar } = montarGuard("2");
    await bater(guard, "203.0.113.9, 127.0.0.1", 1000);
    expect(registrar.mock.calls.length).toBe(1);
    expect(registrar.mock.calls[0][0]).toBe("PORTAL_LIMITE_ATINGIDO");
  });

  it("o evento leva regra e janela, e NUNCA o IP completo (nada em portal_eventos_ip)", async () => {
    const { guard, registrar } = montarGuard("2");
    await bater(guard, "203.0.113.9, 127.0.0.1", 20);
    const [, cruTalvez, ipCompleto] = registrar.mock.calls[0];
    const cru = cruTalvez ?? {};
    expect(cru.regra).toBe("RITMO_IP");
    expect(cru.janela).toBe(10);
    expect(cru.motivoCodigo).toBe("RITMO");
    // O terceiro argumento do `registrar` é o que iria para a tabela do IP em claro: não vai nada.
    expect(ipCompleto).toBeUndefined();
  });

  it("sem pepper, a trilha nem é chamada, e a recusa acontece do mesmo jeito", async () => {
    const { guard, registrar } = montarGuard("2", false);
    const { recusas } = await bater(guard, "203.0.113.9, 127.0.0.1", 20);
    expect(recusas).toBe(5);
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe("CONTRA O ARMAZÉM DE VERDADE, e não só contra o falso", () => {
  /**
   * O falso acima é determinístico (relógio injetado), e é ele que prova o COMPORTAMENTO. Este
   * prova o CONTRATO: que o `isBlocked` do `ThrottlerStorageService` da biblioteca chega mesmo
   * quando os hits passam do limite, com os argumentos na ordem em que o guard os passa. Sem ele,
   * uma troca de versão que mudasse a semântica passaria despercebida.
   */
  it("o armazém real barra na 16a chamada do mesmo IP", async () => {
    const real = new ThrottlerStorageService();
    const guard = new PortalRitmoGuard(
      real,
      {
        get: (chave: string) =>
          ({ PORTAL_RITMO_SALTOS_CONFIAVEIS: "2", PORTAL_RITMO_PROXY_ESPERADO: "127.0.0.1" })[
            chave
          ],
      } as never,
      { configurada: () => false, registrar: vi.fn() } as never,
      new PortalRitmoContadores(),
    );
    const { recusas } = await bater(guard, "203.0.113.9, 127.0.0.1", LIMITES_RITMO_PORTAL.IP_RAJADA_LIMITE + 2);
    expect(recusas).toBe(2);
    real.onApplicationShutdown();
  });

  it("no armazém real, dois IPs distintos não se atrapalham", async () => {
    const real = new ThrottlerStorageService();
    const guard = new PortalRitmoGuard(
      real,
      {
        get: (chave: string) =>
          ({ PORTAL_RITMO_SALTOS_CONFIAVEIS: "2", PORTAL_RITMO_PROXY_ESPERADO: "127.0.0.1" })[
            chave
          ],
      } as never,
      { configurada: () => false, registrar: vi.fn() } as never,
      new PortalRitmoContadores(),
    );
    await bater(guard, "203.0.113.9, 127.0.0.1", LIMITES_RITMO_PORTAL.IP_RAJADA_LIMITE + 5);
    const vizinho = await bater(guard, "198.51.100.4, 127.0.0.1", 10);
    expect(vizinho.recusas).toBe(0);
    real.onApplicationShutdown();
  });
});

describe("O PERFIL COM SESSÃO TEM NÚMEROS PRÓPRIOS, e eles cabem o uso legítimo", () => {
  /**
   * A conta vem do próprio domínio, não de estimativa: `LIMITES_PORTAL` permite 25 arquivos por
   * link e 10 emissões de credencial por minuto, então o pior minuto legítimo é ~30 requisições e
   * a sessão inteira ~80. Os tetos ficam ACIMA disso de propósito: quem morde o candidato legítimo
   * tem de ser a régua de negócio, com a mensagem certa, e não o limitador de volume.
   */
  it("o envio completo de um candidato (80 chamadas) passa inteiro", async () => {
    const { guard, armazem } = montarGuard("2", true, PortalRitmoSessaoGuard);
    let recusas = 0;
    for (let i = 0; i < 80; i += 1) {
      // Uma chamada por segundo, que é mais rápido do que qualquer envio real de arquivo.
      armazem.relogio.agora += 1_000;
      try {
        await guard.canActivate(requisicao("203.0.113.9, 127.0.0.1"));
      } catch {
        recusas += 1;
      }
    }
    expect(recusas).toBe(0);
  });

  it("o laço sem token nenhum morde, e é esse o dano do veto 5", async () => {
    const { guard } = montarGuard("2", true, PortalRitmoSessaoGuard);
    const { recusas, corpos } = await bater(
      guard,
      "203.0.113.9, 127.0.0.1",
      LIMITES_RITMO_SESSAO.IP_RAJADA_LIMITE + 4,
    );
    expect(recusas).toBe(4);
    expect((corpos[0] as { status: number }).status).toBe(429);
  });

  it("as duas portas NÃO dividem cota: encher a anônima não barra a de sessão", async () => {
    const anonima = montarGuard("2");
    await bater(anonima.guard, "203.0.113.9, 127.0.0.1", 500);
    const sessao = montarGuard("2", true, PortalRitmoSessaoGuard);
    const { recusas } = await bater(sessao.guard, "203.0.113.9, 127.0.0.1", 10);
    expect(recusas).toBe(0);
  });
});

describe("OS CONTADORES, e eles são a resposta ao veto 2 e à ressalva", () => {
  it("conta as derivações que deram certo", async () => {
    const { guard, contadores } = montarGuard("2");
    await bater(guard, "203.0.113.9, 127.0.0.1", 5);
    expect(contadores.resumo().comIp).toBe(5);
    expect(contadores.resumo().semIp).toEqual({});
  });

  /**
   * O VETO 2 EM UM TESTE: alguém declara a topologia, ela não bate, e HOJE isso era silêncio
   * absoluto. Agora tem número e motivo, e o motivo é rótulo técnico sem endereço dentro (§A.6).
   */
  it("conta e NOMEIA a falha silenciosa: declarado e nenhum IP derivado", async () => {
    const { guard, contadores } = montarGuard("2", true, PortalRitmoGuard, "192.168.1.174");
    await bater(guard, "203.0.113.9, 127.0.0.1", 3);
    const resumo = contadores.resumo();
    expect(resumo.comIp).toBe(0);
    expect(resumo.semIp.ANCORA_NAO_BATE).toBe(3);
  });

  it("o estado de nascença (desligado) conta, e NÃO é tratado como defeito", async () => {
    const { guard, contadores } = montarGuard(undefined);
    await bater(guard, "203.0.113.9, 127.0.0.1", 2);
    expect(contadores.resumo().semIp.DESLIGADO).toBe(2);
  });

  /**
   * A RESSALVA APROVADA: o estrangulamento da trilha grava uma linha por minuto, então ela não
   * distingue UM abusador de QUARENTA legítimos barrados atrás do mesmo CGNAT. O contador sim.
   */
  it("conta TODAS as recusas por regra, mesmo com a trilha estrangulada em uma linha", async () => {
    const { guard, contadores, registrar } = montarGuard("2");
    await bater(guard, "203.0.113.9, 127.0.0.1", 100);
    expect(registrar.mock.calls.length).toBe(1);
    expect(contadores.resumo().recusas.ANONIMA.RITMO_IP).toBe(85);
    expect(contadores.resumo().recusas.SESSAO).toEqual({});
  });

  it("§A.6: o resumo não carrega endereço, hash de endereço, CPF nem token", async () => {
    const { guard, contadores } = montarGuard("2");
    await bater(guard, "203.0.113.9, 127.0.0.1", 30);
    const texto = JSON.stringify(contadores.resumo());
    // Nenhum ENDEREÇO, em nenhuma forma: nem o do cliente, nem o do proxy.
    expect(texto).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    // Nenhum hash (o do IP tem 32 hex), nenhum CPF, nenhum token.
    expect(texto).not.toMatch(/[0-9a-f]{32}/i);
    for (const proibido of ["cpf", "token", "candidato", "email"]) {
      expect(texto.toLowerCase()).not.toContain(proibido);
    }
    // O que ele TEM é contagem e rótulo técnico, e é só isso.
    expect(Object.keys(contadores.resumo()).sort()).toEqual(["comIp", "desde", "recusas", "semIp"]);
  });
});

describe("O RESTO DO SISTEMA NÃO MUDOU", () => {
  const fonte = (caminho: string) =>
    readFileSync(join(__dirname, "..", caminho), "utf8")
      // §A.6 do teste: comentário casa com qualquer coisa. Some antes de asserir.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  /**
   * O ARMAZÉM É COMPARTILHADO, ENTÃO A ISOLAÇÃO É O NOME. E ela não é decorativa: o
   * `ThrottlerStorageService` da biblioteca limpa os temporizadores de TODAS as chaves do MESMO
   * NOME quando uma delas expira (a propriedade 2 já registrada em `portal-identidade.service.ts`).
   * Nome repetido não misturaria só contagem: faria o balde de uma frente acelerar o da outra.
   */
  it("os baldes novos não colidem com nenhum balde que já existia", () => {
    const jaExistiam = [
      "portal-ident-token",
      "portal-ident-cpf",
      "portal-ident-link",
      "portal-ident-estouros",
      "portal-recuperacao",
      "portal-acesso-email",
      "portal-acesso-identidade",
      "vt-cpf",
      "default",
    ];
    for (const nome of Object.values(BALDES_RITMO_PORTAL)) {
      expect(jaExistiam, nome).not.toContain(nome);
    }
  });

  it("o balde GLOBAL continua com o mesmo número, e ninguém o alargou", () => {
    expect(fonte("app.module.ts")).toContain(
      "ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])",
    );
  });

  it("NÃO existe `trust proxy` em lugar nenhum: o req.ip de todo o sistema segue como estava", () => {
    expect(fonte("main.ts")).not.toContain("trust proxy");
    expect(fonte("app.module.ts")).not.toContain("trust proxy");
  });

  it("as CINCO rotas anônimas saíram do balde global e ganharam o guard", () => {
    const anonimas: [object, string][] = [
      [PortalController.prototype, "identificar"],
      [PortalController.prototype, "recuperacao"],
      [PortalAcessoEmailController.prototype, "solicitar"],
      [PortalAcessoEmailController.prototype, "confirmar"],
      [PortalAcessoEmailController.prototype, "identidade"],
    ];
    for (const [alvo, metodo] of anonimas) {
      const guards = Reflect.getMetadata("__guards__", (alvo as never)[metodo]) ?? [];
      expect(guards, metodo).toContain(PortalRitmoGuard);
      // `SkipThrottle()` grava `THROTTLER:SKIP` + o NOME do balde, e o global de `forRoot` é o
      // `default`. É esta chave que o `ThrottlerGuard` lê para pular a rota.
      expect(
        Reflect.getMetadata("THROTTLER:SKIPdefault", (alvo as never)[metodo]),
        metodo,
      ).toBe(true);
    }
  });

  /**
   * VETO 5, E ELE É A CORREÇÃO DE UMA CONCLUSÃO ERRADA DESTA MESMA FRENTE.
   *
   * A primeira versão deixou estas seis de fora, com o argumento de que "quem as alcança já passou
   * pela identificação". O argumento é verdadeiro para o DADO e falso para a COTA: o
   * `ThrottlerGuard` é o primeiro APP_GUARD e conta ANTES de o `PortalSessaoGuard` recusar, então
   * um laço SEM token nenhum contra `portal/credencial` esgotava o balde `default` e devolvia 429
   * aos consultores. Este teste é o que impede a conclusão errada de voltar.
   */
  it("as SEIS rotas com sessão também saíram do balde global, com o perfil de sessão", () => {
    const comSessao: [object, string][] = [
      [PortalController.prototype, "pedirCredencial"],
      [PortalController.prototype, "confirmar"],
      [PortalDocumentosController.prototype, "trilha"],
      [PortalDadosGiController.prototype, "gravar"],
      [PortalTermoController.prototype, "aceitar"],
      [PortalVtController.prototype, "link"],
    ];
    for (const [alvo, metodo] of comSessao) {
      const guards = (Reflect.getMetadata("__guards__", (alvo as never)[metodo]) ??
        []) as unknown[];
      expect(guards, metodo).toContain(PortalRitmoSessaoGuard);
      expect(
        Reflect.getMetadata("THROTTLER:SKIPdefault", (alvo as never)[metodo]),
        metodo,
      ).toBe(true);
      // A ORDEM IMPORTA: o freio vem ANTES da verificação do bilhete, senão o trabalho de
      // verificar aconteceria antes do freio, que é o que o freio existe para evitar.
      expect(guards.indexOf(PortalRitmoSessaoGuard), metodo).toBe(0);
    }
  });

  it("nenhuma rota mistura os dois perfis", () => {
    const anonimas: [object, string][] = [
      [PortalController.prototype, "identificar"],
      [PortalController.prototype, "recuperacao"],
      [PortalAcessoEmailController.prototype, "solicitar"],
    ];
    for (const [alvo, metodo] of anonimas) {
      const guards = (Reflect.getMetadata("__guards__", (alvo as never)[metodo]) ??
        []) as unknown[];
      expect(guards, metodo).not.toContain(PortalRitmoSessaoGuard);
    }
    const comSessao = (Reflect.getMetadata(
      "__guards__",
      (PortalController.prototype as never)["pedirCredencial"],
    ) ?? []) as unknown[];
    expect(comSessao).not.toContain(PortalRitmoGuard);
  });

  it("os baldes do perfil com sessão são OUTROS nomes, e não colidem com os anônimos", () => {
    for (const nome of Object.values(BALDES_RITMO_SESSAO)) {
      expect(Object.values(BALDES_RITMO_PORTAL) as string[], nome).not.toContain(nome);
    }
  });
});
