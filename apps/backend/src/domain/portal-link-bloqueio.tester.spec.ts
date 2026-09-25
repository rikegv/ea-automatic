import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ESTADOS_LINK_PAINEL } from "@ea/shared-types";
import { estadoDoLinkNoPainel } from "./portal-painel";
import { estadoDaLinha } from "./portal-identidade";

/**
 * COBERTURA INDEPENDENTE (§A.38): BLOQUEAR O LINK É REVERSÍVEL, E NÃO É REVOGAR.
 *
 * Escrito ANTES do código (§A.40, regra 2), contra o REQUISITO do diretor:
 *   "CRUD DO LINK: GERAR novo link, BLOQUEAR/DESBLOQUEAR o link. Qualquer usuario emite/gerencia."
 *
 * ┌─ O FURO QUE ESTA FRENTE JÁ PAGOU UMA VEZ, E QUE O BLOQUEIO PODE REABRIR ────────────────────┐
 * │ A sessão do candidato vale 30 minutos e, na primeira versão, NINGUÉM reconsultava a linha do │
 * │ link depois de ela nascer: o consultor revogava às 14h00 e quem tinha sessão das 13h59       │
 * │ continuava pedindo credencial e ESCREVENDO até 14h29. O conserto foi centralizar a pergunta  │
 * │ "o link está vivo?" em `estadoDaLinha`, consultada nas QUATRO portas (identificação, emissão │
 * │ de credencial, confirmação de envio e leitura da trilha).                                     │
 * │                                                                                               │
 * │ O BLOQUEIO NOVO REABRE EXATAMENTE ESSE FURO SE FOR ESCRITO SÓ NO PAINEL. Uma coluna nova, um  │
 * │ estado novo na tela, e as quatro portas continuam entregando documento a quem o time acabou   │
 * │ de bloquear, porque nenhuma delas pergunta pela coluna nova. Este arquivo trava o bloqueio    │
 * │ DENTRO de `estadoDaLinha`, que é o único lugar onde ele fecha as quatro de uma vez.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O NOME DA COLUNA NÃO É PINADO AQUI de propósito (isto é teste de requisito, não de batismo): o
 * arquivo DESCOBRE qual campo produz `BLOQUEADO` no painel e então exige que o MESMO campo feche
 * `estadoDaLinha`. Se nenhum candidato produzir `BLOQUEADO`, o teste vermelho diz a lista.
 *
 * §A.6: só carimbos e booleanos. Nenhum CPF, nenhum token, nenhum id real.
 */

const AGORA = Date.parse("2026-09-20T12:00:00.000Z");
const DEPOIS = new Date(AGORA + 72 * 3600_000);
const ANTES = new Date(AGORA - 3600_000);

/** Os batismos plausíveis da marca de bloqueio, e os valores plausíveis de cada um. */
const CANDIDATOS: { campo: string; valor: unknown }[] = [
  { campo: "bloqueadoEm", valor: ANTES },
  { campo: "bloqueadoAte", valor: DEPOIS },
  { campo: "bloqueadoManualEm", valor: ANTES },
  { campo: "bloqueioEm", valor: ANTES },
  { campo: "bloqueado", valor: true },
  { campo: "bloqueadoPorId", valor: "00000000-0000-4000-8000-000000000001" },
];

type Linha = Record<string, unknown>;

const linhaViva = (extra: Linha = {}): Linha => ({ expiraEm: DEPOIS, ...extra });

/** Descobre o campo que o painel reconhece como bloqueio. */
function acharMarca(): { campo: string; valor: unknown } | null {
  for (const c of CANDIDATOS) {
    const estado = estadoDoLinkNoPainel(
      linhaViva({ [c.campo]: c.valor }) as never,
      AGORA,
    );
    if (estado === ("BLOQUEADO" as never)) return c;
  }
  return null;
}

const MARCA = acharMarca();
const comBloqueio = (extra: Linha = {}) =>
  linhaViva({ ...(MARCA ? { [MARCA.campo]: MARCA.valor } : {}), ...extra });

describe("o estado BLOQUEADO existe, e a marca dele é descobrível", () => {
  it("o contrato tem UMA lista de estados, com os cinco, e BLOQUEADO não é REVOGADO nem SUSPENSO", () => {
    expect([...ESTADOS_LINK_PAINEL].sort()).toEqual(
      ["BLOQUEADO", "REVOGADO", "SUSPENSO", "VENCIDO", "VIVO"],
    );
    // Uma lista SÓ: a segunda deixaria viva a primeira, e o `?? "REVOGADO"` do painel continuaria
    // apontando para a velha. Duas verdades sobre o mesmo estado, com o padrão na errada.
    const contrato = readFileSync(
      join(__dirname, "..", "..", "..", "..", "packages", "shared-types", "src", "index.ts"),
      "utf8",
    );
    expect(contrato, "nasceu uma segunda lista de estados do link").not.toMatch(
      /ESTADOS_LINK_PAINEL_V2/,
    );
  });

  it("um link dentro do prazo, marcado como bloqueado, aparece BLOQUEADO no painel", () => {
    expect(
      MARCA,
      `nenhum campo de bloqueio reconhecido por estadoDoLinkNoPainel. Tentados: ` +
        CANDIDATOS.map((c) => c.campo).join(", "),
    ).not.toBeNull();
  });
});

describe("BLOQUEADO fecha as QUATRO portas, e não só a coluna da tela", () => {
  it("`estadoDaLinha` diz que o link bloqueado NÃO está vivo", () => {
    if (!MARCA) return expect.fail("marca de bloqueio ausente");
    const estado = estadoDaLinha(comBloqueio() as never, AGORA);
    expect(
      estado.vivo,
      "o bloqueio ficou só no painel: identificação, credencial, confirmação e leitura da trilha " +
        "continuam entregando documento a quem o time bloqueou",
    ).toBe(false);
  });

  /**
   * A LEITURA DA TRILHA MUDOU DE ARQUIVO, NÃO SAIU DO CANÁRIO (consolidação, 21/09/2026).
   *
   * `portal-documentos.service.ts` não pergunta mais por conta própria: ele CONSOME
   * `PortalLinkVivoService`, que é a leitura única e é quem chama `estadoDaLinha`. A porta
   * continua sendo conferida, e o canário aponta para onde a conferência passou a morar. Que o
   * serviço da trilha DELEGA (e não voltou a ler `portal_links`) é travado em
   * `portal/portal-documentos.spec.ts`, junto com o teste de comportamento daquela porta.
   */
  it("as quatro portas continuam perguntando a `estadoDaLinha` (canário do conserto anterior)", () => {
    const dir = join(__dirname, "..", "portal");
    for (const arquivo of [
      "portal-identidade.service.ts",
      "portal-credencial.service.ts",
      "portal-link-vivo.service.ts",
    ]) {
      const fonte = readFileSync(join(dir, arquivo), "utf8");
      expect(fonte, `${arquivo} deixou de consultar estadoDaLinha`).toMatch(/estadoDaLinha\s*\(/);
    }
  });

  /**
   * O FURO SILENCIOSO DAS CINCO PROJEÇÕES. `estadoDaLinha` recebe os campos OPCIONAIS e compara com
   * `!= null`, então COLUNA NÃO PROJETADA VIRA "SEM RESTRIÇÃO": a porta que esquecer de pedir a
   * coluna do bloqueio fica ABERTA, e nada falha, nem build nem teste.
   */
  it("toda leitura que chama `estadoDaLinha` projeta a linha pela constante única", () => {
    const suspeitos = arquivosDoBackend().filter((f) => {
      const fonte = semComentarios(readFileSync(f, "utf8"));
      return /estadoDaLinha\s*\(/.test(fonte) && /portalLinks/.test(fonte);
    });
    expect(suspeitos.length, "nenhuma leitura de linha de link encontrada").toBeGreaterThan(0);
    for (const arquivo of suspeitos) {
      const fonte = semComentarios(readFileSync(arquivo, "utf8"));
      const nome = arquivo.split("/").pop();
      expect(fonte, `${nome} lê a linha do link sem espalhar a projeção única`).toMatch(
        /COLUNAS_DO_LINK/,
      );
      // E O IMPORT TEM DE ESTAR LÁ: espalhar a constante sem importá-la compila no editor de quem
      // escreve e estoura `ReferenceError` na porta, em tempo de execução.
      expect(fonte, `${nome} espalha a projeção única sem importá-la`).toMatch(
        /import\s*{[^}]*COLUNAS_DO_LINK[^}]*}\s*from/,
      );
      // E NÃO BASTA IMPORTAR: a projeção à mão ao lado da constante é o furo com outra roupa.
      expect(
        fonte,
        `${nome} projeta coluna do link à mão: é assim que a coluna nova é esquecida em uma porta`,
      ).not.toMatch(/(expiraEm|revogadoEm|suspensoAte)\s*:\s*portalLinks\./);
    }
  });

  it("a projeção única cobre TODOS os campos que a régua do estado consulta", () => {
    const colunas = semComentarios(
      readFileSync(join(__dirname, "..", "portal", "portal-link-colunas.ts"), "utf8"),
    );
    for (const campo of ["expiraEm", "revogadoEm", "suspensoAte"]) {
      expect(colunas, `a projeção única não pede ${campo}`).toMatch(new RegExp(`${campo}\\s*:`));
    }
    if (MARCA) expect(colunas, "a projeção única não pede a coluna do bloqueio").toMatch(
      new RegExp(`${MARCA.campo}\\s*:`),
    );
  });

  it("nenhuma das portas reimplementa o bloqueio por conta própria", () => {
    if (!MARCA) return;
    const dir = join(__dirname, "..", "portal");
    const regra = new RegExp(`${MARCA.campo}\\s*(!=|==|===|!==)`);
    for (const arquivo of [
      "portal-identidade.service.ts",
      "portal-credencial.service.ts",
      "portal-documentos.service.ts",
    ]) {
      const fonte = semComentarios(readFileSync(join(dir, arquivo), "utf8"));
      expect(fonte, `${arquivo} compara a marca de bloqueio à mão: régua repetida diverge`).not.toMatch(
        regra,
      );
    }
  });
});

describe("a PRECEDÊNCIA: desbloquear nunca ressuscita link morto", () => {
  it("REVOGADO vence BLOQUEADO: quem já matou o link não vê promessa de reversão", () => {
    if (!MARCA) return expect.fail("marca de bloqueio ausente");
    expect(estadoDoLinkNoPainel(comBloqueio({ revogadoEm: ANTES }) as never, AGORA)).toBe(
      "REVOGADO",
    );
  });

  it("desbloquear um link REVOGADO não o torna VIVO", () => {
    const desbloqueado = linhaViva({ revogadoEm: ANTES });
    expect(estadoDoLinkNoPainel(desbloqueado as never, AGORA)).toBe("REVOGADO");
    expect(estadoDaLinha(desbloqueado as never, AGORA).vivo).toBe(false);
  });

  it("desbloquear um link VENCIDO não o torna VIVO", () => {
    const desbloqueado = { expiraEm: ANTES };
    expect(estadoDoLinkNoPainel(desbloqueado as never, AGORA)).not.toBe("VIVO");
    expect(estadoDaLinha(desbloqueado as never, AGORA).vivo).toBe(false);
  });

  it("BLOQUEADO vence SUSPENSO e VENCIDO: a precedência auditada é REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO > VIVO", () => {
    if (!MARCA) return expect.fail("marca de bloqueio ausente");
    // Suspenso passa sozinho e vencido se resolve reemitindo. Bloqueado exige uma DECISÃO do time,
    // e é ela que o consultor precisa ver: mostrar o estado mais fraco esconde o botão que resolve.
    expect(estadoDoLinkNoPainel(comBloqueio({ suspensoAte: DEPOIS }) as never, AGORA)).toBe(
      "BLOQUEADO",
    );
    expect(estadoDoLinkNoPainel(comBloqueio({ expiraEm: ANTES }) as never, AGORA)).toBe("BLOQUEADO");
    // E, em qualquer combinação, o link continua MORTO para as portas do candidato.
    for (const extra of [{ suspensoAte: DEPOIS }, { expiraEm: ANTES }, {}]) {
      expect(estadoDaLinha(comBloqueio(extra) as never, AGORA).vivo).toBe(false);
    }
  });

  it("SUSPENSO (do sistema) não vira BLOQUEADO (do time): são ações diferentes", () => {
    const suspenso = linhaViva({ suspensoAte: DEPOIS });
    expect(estadoDoLinkNoPainel(suspenso as never, AGORA)).toBe("SUSPENSO");
  });
});

describe("BLOQUEAR é REVERSÍVEL, e o link é o MESMO", () => {
  it("limpar a marca devolve o link ao estado VIVO, dentro do prazo", () => {
    if (!MARCA) return expect.fail("marca de bloqueio ausente");
    expect(estadoDoLinkNoPainel(comBloqueio() as never, AGORA)).toBe("BLOQUEADO");
    // O DESBLOQUEIO É SÓ ISTO: a mesma linha, sem a marca. Nada de `revogado_em`, nada de linha
    // nova, então o `jti` do bilhete que o candidato tem no WhatsApp continua valendo.
    expect(estadoDoLinkNoPainel(linhaViva() as never, AGORA)).toBe("VIVO");
    expect(estadoDaLinha(linhaViva() as never, AGORA).vivo).toBe(true);
  });

  it("o desbloqueio NÃO emite link novo nem mexe em `revogado_em`", () => {
    const fonte = fonteDoCrudDoLink();
    if (!fonte) return expect.fail(mensagemDoCrudAusente());
    const metodo = trechoDoMetodo(fonte, /desbloq/i);
    expect(metodo, "método de desbloqueio não encontrado").not.toBeNull();
    expect(metodo!, "desbloquear cunhou um link novo: a URL na mão do candidato mudaria").not.toMatch(
      /cunharLink|emitirLink|insert\s*\(\s*portalLinks/,
    );
    expect(metodo!, "desbloquear mexeu em revogado_em: revogação é terminal").not.toMatch(
      /revogadoEm\s*:/,
    );
  });

  it("o BLOQUEIO também não revoga: ele marca, e só", () => {
    const fonte = fonteDoCrudDoLink();
    if (!fonte) return expect.fail(mensagemDoCrudAusente());
    const metodo = trechoDoMetodo(fonte, /bloquearLink|^\s*async\s+bloquear/im);
    expect(metodo, "método de bloqueio não encontrado").not.toBeNull();
    expect(metodo!, "bloquear gravou revogado_em: bloqueio viraria revogação disfarçada").not.toMatch(
      /revogadoEm\s*:\s*(?!null)/,
    );
  });
});

describe("quem pode bloquear: QUALQUER usuário autenticado, e ninguém de fora", () => {
  const CONTROLLER = join(__dirname, "..", "portal", "portal-links.controller.ts");

  it("as rotas de bloquear e desbloquear existem", () => {
    const fonte = readFileSync(CONTROLLER, "utf8");
    expect(fonte, "falta a rota de BLOQUEAR o link").toMatch(/bloquear/i);
    expect(fonte, "falta a rota de DESBLOQUEAR o link").toMatch(/desbloquear/i);
  });

  it("nenhuma rota do CRUD do link é `@Public()`: o candidato não gerencia o próprio link", () => {
    const fonte = semComentarios(readFileSync(CONTROLLER, "utf8"));
    expect(fonte).not.toMatch(/@Public\s*\(/);
  });

  it("o autor vai junto, porque bloqueio sem autor é rastro pela metade", () => {
    const fonte = semComentarios(readFileSync(CONTROLLER, "utf8"));
    const bloqueios = fonte.split("\n").filter((l) => /bloquear/i.test(l) && /\(/.test(l));
    expect(bloqueios.length, "nenhuma linha de bloqueio no controller").toBeGreaterThan(0);
    expect(fonte, "o CRUD do link precisa do @CurrentUser para registrar quem bloqueou").toMatch(
      /@CurrentUser\s*\(/,
    );
  });
});

// ══ APOIO ════════════════════════════════════════════════════════════════════════════════════

/** Onde o CRUD do link foi construído. Aceita o serviço da identidade ou um serviço próprio. */
function fonteDoCrudDoLink(): string | null {
  const dir = join(__dirname, "..", "portal");
  for (const arquivo of [
    "portal-identidade.service.ts",
    "portal-links.service.ts",
    "portal-link-crud.service.ts",
  ]) {
    try {
      const fonte = readFileSync(join(dir, arquivo), "utf8");
      if (/desbloq/i.test(fonte)) return semComentarios(fonte);
    } catch {
      // arquivo ainda não existe: segue para o próximo candidato
    }
  }
  return null;
}

function mensagemDoCrudAusente(): string {
  return (
    "nenhum serviço do portal implementa o desbloqueio do link. Esperado em " +
    "portal-identidade.service.ts, portal-links.service.ts ou portal-link-crud.service.ts"
  );
}

/** Recorta o corpo do método a partir do nome, por contagem de chaves. Suficiente para asserção. */
function trechoDoMetodo(fonte: string, nome: RegExp): string | null {
  const achado = fonte.search(nome);
  if (achado < 0) return null;
  const abre = fonte.indexOf("{", achado);
  if (abre < 0) return null;
  let nivel = 0;
  for (let i = abre; i < fonte.length; i += 1) {
    if (fonte[i] === "{") nivel += 1;
    if (fonte[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return fonte.slice(achado, i + 1);
    }
  }
  return fonte.slice(achado);
}

/** Todo `.ts` de produção do backend. */
function arquivosDoBackend(dir = join(__dirname, "..")): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name === "dist") continue;
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosDoBackend(caminho));
    else if (entrada.name.endsWith(".ts") && !entrada.name.includes(".spec.")) {
      achados.push(caminho);
    }
  }
  return achados;
}

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
