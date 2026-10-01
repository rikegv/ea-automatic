import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SALARIO_UNIDADES } from "./salario-unidade";

/**
 * ─ A UNIDADE EXISTE NAS TRÊS TELAS QUE ESCREVEM SALÁRIO ────────────────────────────────────────
 *
 * ┌─ POR QUE VARREDURA DE FONTE, E QUAL É O LIMITE DELA ─────────────────────────────────────────┐
 * │ As três superfícies são páginas de milhares de linhas, clientes, com dezenas de chamadas de    │
 * │ rede e estado de sessão. Montá-las no `happy-dom` exigiria dublar meia aplicação, e o teste    │
 * │ mediria os dublês. O que esta frente muda é ESTRUTURAL: o campo existe ou não existe, o valor  │
 * │ entra no corpo ou não entra, e isso se mede na fonte com honestidade.                          │
 * │                                                                                               │
 * │ NÃO substitui a prova visual (§A.13/§A.20), que é do coordenador. Os comentários são removidos │
 * │ antes de asserir, porque comentário que fala do assunto já fez varredura mentir aqui.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RISCO QUE ELE COBRE é o de a frente nascer PELA METADE: uma porta de escrita de salário sem o
 * seletor continua gravando valor sem unidade, e o selo de auditoria nasce ausente justamente onde
 * ninguém está olhando. Foi o caso das 7 admissões de R$ 9,34.
 */

const RAIZ = join(__dirname, "..");

/** As TRÊS portas de escrita. O lápis é UM componente, e cobre Gerenciador e Esteira pelos dois usos. */
const PORTAS: { nome: string; arquivo: string }[] = [
  { nome: "wizard de Nova Admissão", arquivo: join(RAIZ, "app", "(app)", "nova", "page.tsx") },
  { nome: "Liberação", arquivo: join(RAIZ, "app", "(app)", "liberacao", "page.tsx") },
  {
    nome: "lápis (Gerenciador e Esteira)",
    arquivo: join(RAIZ, "components", "gerenciador", "EditAdmissaoModal.tsx"),
  },
];

function fonte(arquivo: string): string {
  return readFileSync(arquivo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("as três portas que escrevem salário declaram a unidade", () => {
  for (const porta of PORTAS) {
    describe(porta.nome, () => {
      const src = fonte(porta.arquivo);

      it("usa o vocabulário COMPARTILHADO, e não uma lista própria de unidades", () => {
        expect(src).toContain("OPCOES_SALARIO_UNIDADE");
        // Lista reescrita na tela é a divergência que o `lib` existe para impedir.
        for (const u of SALARIO_UNIDADES) {
          expect(src.includes(`"${u}"`), `${porta.nome} escreveu ${u} na mão`).toBe(false);
        }
      });

      it("usa o Select do design system, e nunca o `<select>` nativo (§A.35)", () => {
        expect(src).toContain("<Select");
        expect(/<select[\s>]/.test(src)).toBe(false);
      });

      it("manda a unidade no corpo, para o valor não chegar ao banco sem ela", () => {
        expect(src).toContain("salarioUnidade");
      });

      it("pede a jornada SÓ sob HORA, pela régua compartilhada", () => {
        expect(src).toContain("exigeJornada");
        expect(src).toContain("jornadaHorasMes");
        expect(src).toContain("jornadaHorasSem");
      });

      it("barra a jornada inválida antes do envio, pela régua compartilhada", () => {
        expect(src).toContain("problemaDaJornada");
        expect(src).toContain("jornadaImpedeSalvar");
      });

      it("não introduz travessão no texto da tela (§A.11)", () => {
        expect(src).not.toContain("—");
      });
    });
  }
});

describe("o gate da Liberação cobra a unidade", () => {
  it("a lista dos obrigatórios-para-liberar nomeia a Unidade do salário", () => {
    const src = fonte(PORTAS[1].arquivo);
    const m = /obrigatoriosLiberar[^=]*=\s*\[([\s\S]*?)\n\s*\];/.exec(src);
    expect(m, "não achei a lista dos obrigatórios da liberação").toBeTruthy();
    expect(m![1]).toContain("Unidade do salário");
  });
});
