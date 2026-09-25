import { describe, expect, it } from "vitest";
import { PORTAL_MOTIVOS } from "./portal-evento";
import { estadoDaLinha, motivoDoLinkMorto } from "./portal-identidade";

/**
 * ══ POR QUE O LINK MORREU: A RÉGUA, E ELA É UMA SÓ (achado S28) ══════════════════════════════
 *
 * ┌─ O DEFEITO QUE ESTE ARQUIVO TRAVA ──────────────────────────────────────────────────────────┐
 * │ `PortalLinkVivoService` gravava `motivoCodigo: "EXPIRADA"` FIXO em toda recusa. Link         │
 * │ REVOGADO, BLOQUEADO à mão ou SUSPENSO pelo teto chegava à Sala De Segurança como "expirada". │
 * │ §A.6 não era violado (só `jti` e código, zero PII); o que se perdia era FIDELIDADE, e trilha │
 * │ que descreve errado é pior que trilha ausente, porque é lida como verdade.                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AQUI SE PROVA A FUNÇÃO PURA; as duas PORTAS que gravam o evento (a da trilha, em
 * `portal/portal-documentos.spec.ts`, e a do VT, em `portal/portal-vt-link.spec.ts`) pinam o
 * VALOR cada uma na sua. Era dessa terceira prova que faltava metade: a porta da trilha afirmava
 * só o CONJUNTO de chaves do evento, nunca o conteúdo.
 *
 * §A.6: aqui não há CPF, nome nem token. Só datas sintéticas e códigos de catálogo.
 */

const AGORA = Date.UTC(2026, 8, 21, 12, 0, 0);
const HORA = 3_600_000;

const VIVA = () => ({
  expiraEm: new Date(AGORA + HORA),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
});

describe("motivoDoLinkMorto: os quatro estados mortos, cada um com o seu nome", () => {
  const CASOS: Array<[string, Record<string, Date | null>, string]> = [
    ["REVOGADO à mão", { revogadoEm: new Date(AGORA - 1) }, "REVOGADO_MANUAL"],
    ["BLOQUEADO à mão", { bloqueadoEm: new Date(AGORA - 1) }, "LINK_BLOQUEADO"],
    ["SUSPENSO pelo teto", { suspensoAte: new Date(AGORA + HORA) }, "SUSPENSO"],
    ["VENCIDO pelo prazo", { expiraEm: new Date(AGORA - 1) }, "EXPIRADA"],
    // Prazo AUSENTE é link vencido, nunca link eterno: dado quebrado fecha.
    ["sem prazo nenhum", { expiraEm: null }, "EXPIRADA"],
  ];

  for (const [rotulo, campos, esperado] of CASOS) {
    it(`link ${rotulo} diz ${esperado}`, () => {
      const estado = estadoDaLinha({ ...VIVA(), ...campos }, AGORA);
      expect(estado.vivo).toBe(false);
      expect(estado.motivoCodigo).toBe(esperado);
    });
  }

  it("linha AUSENTE é revogação, e não um quinto código", () => {
    // Um bilhete que fecha assinatura e não tem linha é uma linha que sumiu, não um forjado.
    expect(estadoDaLinha(undefined, AGORA).motivoCodigo).toBe("REVOGADO_MANUAL");
    expect(estadoDaLinha(null, AGORA).motivoCodigo).toBe("REVOGADO_MANUAL");
  });

  it("link VIVO não tem motivo: recusa sempre tem código, sucesso nunca tem", () => {
    const estado = estadoDaLinha(VIVA(), AGORA);
    expect(estado.vivo).toBe(true);
    expect(estado.motivoCodigo).toBeNull();
  });
});

describe("a precedência, que responde O QUE SE FAZ AGORA", () => {
  /**
   * REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO, a MESMA do painel (`estadoDoLinkNoPainel`). Um
   * link pode estar nos quatro ao mesmo tempo, e dizer o mais fraco mandaria o consultor reemitir
   * um link que ele mesmo matou.
   */
  const TODOS = {
    expiraEm: new Date(AGORA - 1),
    revogadoEm: new Date(AGORA - 1),
    suspensoAte: new Date(AGORA + HORA),
    bloqueadoEm: new Date(AGORA - 1),
  };

  it("nos quatro estados ao mesmo tempo, vence REVOGADO", () => {
    expect(estadoDaLinha(TODOS, AGORA).motivoCodigo).toBe("REVOGADO_MANUAL");
  });

  it("sem a revogação, vence BLOQUEADO (volta por botão, não por relógio)", () => {
    expect(estadoDaLinha({ ...TODOS, revogadoEm: null }, AGORA).motivoCodigo).toBe("LINK_BLOQUEADO");
  });

  it("sem revogação nem bloqueio, vence SUSPENSO (passa sozinho, o vencido não)", () => {
    expect(
      estadoDaLinha({ ...TODOS, revogadoEm: null, bloqueadoEm: null }, AGORA).motivoCodigo,
    ).toBe("SUSPENSO");
  });
});

describe("a régua é PURA e mora no domínio, e todo código dela é de CATÁLOGO", () => {
  it("nenhum motivo escapa de `PORTAL_MOTIVOS`: fora do catálogo, o evento vira motivo NULO", () => {
    // `montarEventoPortal` DESCARTA em silêncio o código desconhecido, e a Sala De Segurança
    // passa a ler uma recusa sem motivo. É a cicatriz do `TENTATIVAS_ESGOTADAS`.
    for (const codigo of ["REVOGADO_MANUAL", "LINK_BLOQUEADO", "SUSPENSO", "EXPIRADA"]) {
      expect(PORTAL_MOTIVOS as readonly string[], `${codigo} saiu do catálogo`).toContain(codigo);
    }
  });

  it("a função é chamável sem banco e sem linha, só com o estado", () => {
    expect(
      motivoDoLinkMorto({
        existe: true,
        revogado: false,
        bloqueado: false,
        suspenso: false,
        vivo: true,
      }),
    ).toBeNull();
    expect(
      motivoDoLinkMorto({
        existe: true,
        revogado: false,
        bloqueado: false,
        suspenso: true,
        vivo: false,
      }),
    ).toBe("SUSPENSO");
  });
});
