import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as contrato from "@ea/shared-types";
import * as painel from "./portal-painel";
import { contarPainel, type FatoDaAdmissaoNoPainel } from "./portal-painel";

/**
 * COBERTURA INDEPENDENTE (§A.38), SEGUNDA RODADA DO GERENCIADOR DO PORTAL: A RÉGUA DE "CONCLUIU".
 *
 * Escrito ANTES do código (§A.40, regra 2), a partir do REQUISITO do diretor:
 *   "ABA CONCLUIDO: quando o candidato TERMINA a entrega, ele SAI da frente de trabalho e vai pra
 *    uma aba Concluido. A frente de trabalho mostra so os EM ANDAMENTO."
 *
 * ┌─ O RISCO QUE ESTE ARQUIVO ATACA, E ELE JÁ FOI APONTADO PELA AUDITORIA ───────────────────────┐
 * │ A mesma régua ("concluiu a coleta") passa a decidir DUAS coisas: o card `concluiram` e QUEM  │
 * │ sai da fila de trabalho. Hoje ela está escrita DUAS VEZES: em `contarPainel` (domínio) e em  │
 * │ `concluiu()` dentro de `admin/portal-links/page.tsx` (tela). Duas cópias da mesma régua       │
 * │ divergem no primeiro ajuste, e aqui a divergência tem consequência operacional direta: a      │
 * │ pessoa SOME da fila e o card continua contando, ou o contrário, e ninguém percebe porque as   │
 * │ duas telas parecem certas separadamente.                                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE SE EXIGE: UMA função exportada, consumida pelo contador, pela aba e pela tela. Onde ela
 * mora é escolha de quem constrói (domínio do backend ou `shared-types`, que já exporta função),
 * e por isso este arquivo DESCOBRE a régua em vez de fixar o caminho. O que ele NÃO admite é que
 * ela não exista, ou que exista e o contador não a use.
 *
 * §A.6: só contagem e booleano. Nenhum CPF, nenhum nome.
 */

// ══ A DESCOBERTA DA RÉGUA ══════════════════════════════════════════════════════════════════════

/**
 * Os nomes aceitos, em ordem de preferência. A lista existe para não travar a construção num
 * batismo: qualquer um deles serve, desde que seja UM só e que o contador o use.
 */
const NOMES_ACEITOS = [
  "concluiuAColeta",
  "concluiuColeta",
  "concluiu",
  "coletaConcluida",
  "concluiuAEntrega",
] as const;

type ReguaDeConclusao = (fato: {
  acessou?: boolean;
  ultimoAcessoEm?: string | null;
  obrigatorios: number;
  obrigatoriosPendentes?: number;
  aceitos?: number;
}) => boolean;

function acharRegua(): { nome: string; onde: string; fn: ReguaDeConclusao } | null {
  const fontes: [string, Record<string, unknown>][] = [
    ["domain/portal-painel", painel as unknown as Record<string, unknown>],
    ["shared-types", contrato as unknown as Record<string, unknown>],
  ];
  for (const [onde, mod] of fontes) {
    for (const nome of NOMES_ACEITOS) {
      const valor = mod[nome];
      if (typeof valor === "function") {
        return { nome, onde, fn: valor as ReguaDeConclusao };
      }
    }
  }
  return null;
}

const ACHADA = acharRegua();

/**
 * O FATO, nos dois vocabulários. A régua pode receber o FATO do contador (`acessou`,
 * `obrigatoriosPendentes`) ou a LINHA da tela (`ultimoAcessoEm`, `aceitos`), e as duas são a mesma
 * pergunta escrita com outras palavras. Passar os dois conjuntos é o que permite que a mesma
 * função sirva ao backend e ao frontend, que é justamente o ponto da unificação.
 */
function entrada(f: { acessou: boolean; obrigatorios: number; aceitos: number }) {
  return {
    acessou: f.acessou,
    ultimoAcessoEm: f.acessou ? new Date().toISOString() : null,
    obrigatorios: f.obrigatorios,
    aceitos: f.aceitos,
    // SEM PISO EM ZERO, de propósito: a sobre-entrega chega ao serviço como pendentes NEGATIVO
    // (`total - entregues`), e é exatamente esse número que a régua tem de julgar. Aparar aqui
    // esconderia o caso que o requisito manda concluir.
    obrigatoriosPendentes: f.obrigatorios - f.aceitos,
  };
}

describe("a régua de CONCLUIU existe, e é UMA só", () => {
  it("há exatamente uma função de conclusão exportada, e ela é encontrável", () => {
    expect(
      ACHADA,
      `nenhuma régua de conclusão exportada. Esperado UM de [${NOMES_ACEITOS.join(", ")}] em ` +
        `domain/portal-painel.ts ou em shared-types, consumido pelo contador, pela aba e pela tela.`,
    ).not.toBeNull();
  });

  /**
   * DUAS EXPORTAÇÕES SÓ SÃO ACEITAS SE FOREM A MESMA RÉGUA (reexportação). O frontend não alcança
   * `apps/backend/src/domain`, então é legítimo que a casa da função seja `shared-types` e o
   * domínio a reexporte. Ilegítimo é haver DUAS implementações, que é o defeito desta rodada.
   */
  it("se a régua aparece nos dois módulos, ela é a MESMA, e não duas implementações", () => {
    const doDominio = NOMES_ACEITOS.map(
      (n) => (painel as unknown as Record<string, unknown>)[n],
    ).find((v) => typeof v === "function") as ReguaDeConclusao | undefined;
    const doContrato = NOMES_ACEITOS.map(
      (n) => (contrato as unknown as Record<string, unknown>)[n],
    ).find((v) => typeof v === "function") as ReguaDeConclusao | undefined;
    if (!doDominio || !doContrato || doDominio === doContrato) return;
    for (const acessou of [true, false]) {
      for (let obrigatorios = 0; obrigatorios <= 3; obrigatorios += 1) {
        for (let aceitos = 0; aceitos <= 4; aceitos += 1) {
          const e = entrada({ acessou, obrigatorios, aceitos });
          expect(doDominio(e), `divergência em ${acessou}/${obrigatorios}/${aceitos}`).toBe(
            doContrato(e),
          );
        }
      }
    }
  });
});

describe("os quatro casos que a régua tem de acertar (requisito, não código)", () => {
  const regua = () => {
    if (!ACHADA) throw new Error("régua de conclusão ausente");
    return ACHADA.fn;
  };

  it("RÉGUA VAZIA (zero obrigatórios) NÃO conclui, mesmo com acesso", () => {
    expect(regua()(entrada({ acessou: true, obrigatorios: 0, aceitos: 0 }))).toBe(false);
  });

  it("ACESSO SEM ENTREGA não conclui", () => {
    expect(regua()(entrada({ acessou: true, obrigatorios: 5, aceitos: 0 }))).toBe(false);
    expect(regua()(entrada({ acessou: true, obrigatorios: 5, aceitos: 4 }))).toBe(false);
  });

  it("ENTREGA SEM ACESSO não conclui: o painel mede a COLETA, e sem acesso não houve coleta", () => {
    expect(regua()(entrada({ acessou: false, obrigatorios: 5, aceitos: 5 }))).toBe(false);
  });

  it("SOBRE-ENTREGA (aceitos maior que obrigatórios) CONCLUI", () => {
    expect(regua()(entrada({ acessou: true, obrigatorios: 5, aceitos: 9 }))).toBe(true);
  });

  it("o caso normal conclui: acessou e fechou a régua exata", () => {
    expect(regua()(entrada({ acessou: true, obrigatorios: 5, aceitos: 5 }))).toBe(true);
  });

  it("régua vazia sem acesso também não conclui (nenhuma porta dos fundos)", () => {
    expect(regua()(entrada({ acessou: false, obrigatorios: 0, aceitos: 0 }))).toBe(false);
  });
});

describe("o CONTADOR e a RÉGUA concordam, e não por coincidência", () => {
  /**
   * 400 recortes gerados. Se `contarPainel` mantiver a condição escrita à mão em vez de chamar a
   * régua, basta um ajuste em um dos dois lados para este teste abrir.
   */
  it("`concluiram` é exatamente a contagem dos fatos que a régua aprova", () => {
    if (!ACHADA) return expect.fail("régua de conclusão ausente");
    let semente = 20260920;
    const proximo = (teto: number) => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente % teto;
    };
    for (let caso = 0; caso < 400; caso += 1) {
      const fatos: FatoDaAdmissaoNoPainel[] = [];
      const quantos = 1 + proximo(8);
      for (let i = 0; i < quantos; i += 1) {
        const obrigatorios = proximo(4); // inclui ZERO de propósito: é o caso M1
        const aceitos = proximo(6); // pode passar do total: é a sobre-entrega
        fatos.push({
          acessou: proximo(2) === 1,
          obrigatorios,
          obrigatoriosPendentes: obrigatorios - aceitos, // pode ficar NEGATIVO, e isso é o ponto
          noTime: proximo(2) === 1,
        });
      }
      const esperado = fatos.filter((f) =>
        ACHADA.fn({
          acessou: f.acessou,
          ultimoAcessoEm: f.acessou ? new Date().toISOString() : null,
          obrigatorios: f.obrigatorios,
          obrigatoriosPendentes: f.obrigatoriosPendentes,
          aceitos: f.obrigatorios - f.obrigatoriosPendentes,
        }),
      ).length;
      expect(contarPainel(fatos).concluiram, `caso ${caso}`).toBe(esperado);
    }
  });

  it("o contador CHAMA a régua, e não repete a aritmética dela", () => {
    const fonte = semComentarios(readFileSync(join(__dirname, "portal-painel.ts"), "utf8"));
    // SÓ O CORPO DE `contarPainel`: a régua nova mora no mesmo arquivo e tem a aritmética legítima.
    const inicio = fonte.indexOf("export function contarPainel");
    const corpo = fonte.slice(inicio, fonte.indexOf("\n}", inicio));
    // A condição antiga era `fato.acessou && fato.obrigatorios > 0 && fato.obrigatoriosPendentes === 0`.
    // Sobrevivendo ela, a régua tem duas donas outra vez.
    expect(corpo).not.toMatch(/obrigatoriosPendentes\s*===\s*0/);
    expect(corpo).not.toMatch(/obrigatorios\s*>\s*0\s*&&/);
  });
});

describe("a TELA não escreve a régua de novo (§A.19: régua unificada, consumida)", () => {
  const PAGINA = join(
    __dirname,
    "..","..","..",
    "frontend","src","app","(app)","admin","portal-links","page.tsx",
  );

  it("a página do painel não define a sua própria função de conclusão", () => {
    const fonte = semComentarios(readFileSync(PAGINA, "utf8"));
    expect(
      fonte,
      "a tela ainda define `function concluiu(`: é a segunda cópia da régua que esta rodada existe para apagar",
    ).not.toMatch(/function\s+concluiu\s*\(/);
  });

  it("a página não recalcula `aceitos >= obrigatorios` por conta própria", () => {
    const fonte = semComentarios(readFileSync(PAGINA, "utf8"));
    expect(fonte).not.toMatch(/aceitos\s*>=\s*l?\.?obrigatorios/);
  });
});

/** Tira comentário de bloco e de linha, para a asserção não casar com o texto que explica a régua. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
