// @vitest-environment happy-dom
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { rotuloDoStatusDoPandape, type VagaListItem } from "@ea/shared-types";

import { CodigoDaVaga } from "./CodigoDaVaga";
import {
  AJUDA_DO_NUMERO_NO_ATS,
  AVISO_DA_VAGA_ENCERRADA_NO_ATS,
  codigoDaVagaNaTela,
  tagDoStatusNoAts,
  textoDoCodigoDaVaga,
  vagaEncerradaNoAts,
} from "@/lib/as-vaga-codigo";

/**
 * ─ A VAGA DO DIGAI NÃO APARECE COMO LINHA EM BRANCO ────────────────────────────────────────────
 *
 * O QUE ESTE ARQUIVO TRAVA: a ingestão do Digai cria a vaga-espelho só com o número do Pandapé (o
 * `partnerJobId`, único campo de vaga do contrato dele), então `vagas.codigo` nasce NULO. Medido em
 * produção em 08/10/2026: TREZE vagas assim, com 223 candidaturas de 223 pessoas penduradas, e na
 * tela elas apareciam sem número nenhum na coluna do código.
 *
 * O MODO DE FALHA QUE ISTO MATA é alguém "simplificar" a célula de volta para `v.codigo ?? "não
 * informado"`: a suíte continuaria verde em tudo o mais e a linha fantasma voltaria.
 *
 * §A.11: nenhum travessão no texto novo, em dash nem en dash.
 * §A.6: número de vaga e id de ATS, nenhum dado pessoal.
 */

const VAZIA = {
  codigo: null,
  idVacancyPandape: null,
  statusPandape: null,
} as unknown as VagaListItem;

function vaga(
  p: Partial<Pick<VagaListItem, "codigo" | "idVacancyPandape" | "statusPandape">>,
): VagaListItem {
  return { ...VAZIA, ...p } as VagaListItem;
}

afterEach(() => cleanup());

describe("1. a régua do código da vaga na tela", () => {
  it("com código do EA, mostra o código e NÃO fala de ATS", () => {
    const c = codigoDaVagaNaTela(vaga({ codigo: "PS-2026-001", idVacancyPandape: "3498580" }));
    expect(c.tipo).toBe("CODIGO");
    expect(c.texto).toBe("PS-2026-001");
    expect(c.ajuda).toBeNull();
  });

  it("SEM código e com número do ATS, mostra o número do ATS e nunca fica vazia", () => {
    const c = codigoDaVagaNaTela(vaga({ idVacancyPandape: "3498580" }));
    expect(c.tipo).toBe("ATS");
    expect(c.numero).toBe("3498580");
    expect(c.texto).toBe("ATS 3498580");
    expect(c.texto.trim()).not.toBe("");
    expect(c.ajuda).toBe(AJUDA_DO_NUMERO_NO_ATS);
  });

  it('sem NENHUM dos dois, escreve "não informado" (§A.11)', () => {
    const c = codigoDaVagaNaTela(vaga({}));
    expect(c.tipo).toBe("AUSENTE");
    expect(c.texto).toBe("não informado");
  });

  /** Campo em branco no banco é tão vazio quanto nulo, e cai no mesmo caminho. */
  it("string vazia ou só espaço conta como ausente", () => {
    expect(codigoDaVagaNaTela(vaga({ codigo: "   ", idVacancyPandape: "3498580" })).tipo).toBe(
      "ATS",
    );
    expect(codigoDaVagaNaTela(vaga({ codigo: "", idVacancyPandape: " " })).tipo).toBe("AUSENTE");
  });

  it("a busca e a ordenação leem o MESMO texto da célula", () => {
    expect(textoDoCodigoDaVaga(vaga({ idVacancyPandape: "3498580" }))).toBe("ATS 3498580");
    expect(textoDoCodigoDaVaga(vaga({ codigo: "PS-1" }))).toBe("PS-1");
  });
});

describe("2. a célula desenhada", () => {
  it("sem código, desenha o número do ATS com o prefixo que o qualifica", () => {
    render(<CodigoDaVaga vaga={vaga({ idVacancyPandape: "3498580" })} />);
    expect(screen.getByText("3498580")).toBeTruthy();
    expect(screen.getByText("ATS")).toBeTruthy();
    expect(screen.getByTitle(AJUDA_DO_NUMERO_NO_ATS)).toBeTruthy();
  });

  it("com código, desenha o código e nenhum prefixo de ATS", () => {
    render(<CodigoDaVaga vaga={vaga({ codigo: "PS-2026-001", idVacancyPandape: "3498580" })} />);
    expect(screen.getByText("PS-2026-001")).toBeTruthy();
    expect(screen.queryByText("ATS")).toBeNull();
  });

  it('sem os dois, desenha "não informado"', () => {
    render(<CodigoDaVaga vaga={vaga({})} />);
    expect(screen.getByText("não informado")).toBeTruthy();
  });
});

/**
 * AS DUAS TELAS SÃO AFIRMADAS NA FONTE, e não renderizadas: são páginas do App Router, que buscam a
 * própria lista na montagem (o mesmo caminho que `rotulos-da-vaga.spec.tsx` já usa). O que se mede é
 * que elas CONSOMEM o componente, e não a condição crua que deixava a linha em branco.
 */
const SRC = [join(process.cwd(), "src"), join(process.cwd(), "apps", "frontend", "src")].find((c) =>
  existsSync(c),
) as string;
function fonte(caminho: string): string {
  return readFileSync(join(SRC, caminho), "utf8");
}

const TELAS = [
  ["a Central de Vagas", "app/(app)/as/vagas/page.tsx"],
  ["a fila de Vagas Pendentes De Revisão", "app/(app)/as/vagas-pendentes-revisao/page.tsx"],
] as const;

describe("3. as duas telas que mostram a vaga do Digai", () => {
  it.each(TELAS)("%s desenha a célula pelo componente compartilhado", (_nome, caminho) => {
    expect(fonte(caminho)).toContain("<CodigoDaVaga vaga={v} />");
  });

  it.each(TELAS)("%s não tem mais a condição crua que deixava a linha em branco", (_n, caminho) => {
    expect(
      fonte(caminho),
      'a célula do código voltou a ser `v.codigo ?? "não informado"`: a vaga do Digai perde o número do ATS e volta a aparecer como linha em branco.',
    ).not.toContain('{v.codigo ?? "não informado"}');
  });
});

/**
 * ─ A TAG DO STATUS NO ATS ──────────────────────────────────────────────────────────────────────
 *
 * O RÓTULO É O DO CONTRATO (`rotuloDoStatusDoPandape`, em `packages/shared-types`), e o teste o
 * importa de lá: afirmar a string literal aqui criaria o SEGUNDO dicionário, que é exatamente o que
 * se quer impedir. O que esta camada decide é o TOM, e é ele que se mede.
 */
describe("6. a tag do status da vaga no ATS", () => {
  it("status 3 vira a tag de ENCERRADA, com o tom de alerta e a frase de apoio", () => {
    const tag = tagDoStatusNoAts(3);
    expect(tag?.rotulo).toBe(rotuloDoStatusDoPandape(3));
    expect(tag?.rotulo).toBe("Encerrada No ATS");
    expect(tag?.tom, "o amarelo de alerta é o que diz que há gente pendurada ali").toBe("wn");
    expect(tag?.ajuda).toBe(AVISO_DA_VAGA_ENCERRADA_NO_ATS);
    expect(vagaEncerradaNoAts(3)).toBe(true);
  });

  it("status 2 é a vaga viva no ATS, e NÃO é alerta", () => {
    const tag = tagDoStatusNoAts(2);
    expect(tag?.rotulo).toBe("Ativa No ATS");
    expect(tag?.tom).toBe("ok");
    expect(tag?.ajuda).toBeNull();
    expect(vagaEncerradaNoAts(2)).toBe(false);
  });

  it.each([null, undefined])("status %s NÃO vira tag: ela some", (status) => {
    expect(tagDoStatusNoAts(status)).toBeNull();
    expect(vagaEncerradaNoAts(status)).toBe(false);
  });

  /** O vocabulário é do fornecedor e pode crescer: número novo mostra o número, e não quebra. */
  it("status desconhecido (7) atravessa como Status 7 No ATS, em tom neutro", () => {
    const tag = tagDoStatusNoAts(7);
    expect(tag?.rotulo).toBe(rotuloDoStatusDoPandape(7));
    expect(tag?.rotulo).toBe("Status 7 No ATS");
    expect(tag?.tom).toBe("nt");
    expect(tag?.ajuda).toBeNull();
  });
});

describe("7. a tag desenhada na célula", () => {
  it("a vaga encerrada no ATS desenha a tag com a frase de apoio no title", () => {
    render(<CodigoDaVaga vaga={vaga({ idVacancyPandape: "3498580", statusPandape: 3 })} />);
    expect(screen.getByText("Encerrada No ATS")).toBeTruthy();
    expect(screen.getByTitle(AVISO_DA_VAGA_ENCERRADA_NO_ATS)).toBeTruthy();
  });

  it("status nulo NÃO desenha tag nenhuma", () => {
    const { container } = render(
      <CodigoDaVaga vaga={vaga({ idVacancyPandape: "3498580", statusPandape: null })} />,
    );
    expect(container.querySelector(".pill")).toBeNull();
    expect(screen.queryByText(/No ATS$/)).toBeNull();
  });

  it("status desconhecido desenha a tag e não derruba a linha", () => {
    render(<CodigoDaVaga vaga={vaga({ codigo: "PS-1", statusPandape: 7 })} />);
    expect(screen.getByText("PS-1")).toBeTruthy();
    expect(screen.getByText("Status 7 No ATS")).toBeTruthy();
  });
});

describe("8. o aviso da fila de revisão", () => {
  const fila = fonte("app/(app)/as/vagas-pendentes-revisao/page.tsx");

  it("conta as encerradas pela régua compartilhada, e não comparando com o número 3", () => {
    expect(fila).toContain("vagaEncerradaNoAts(v.statusPandape)");
    expect(fila).not.toContain("statusPandape === 3");
  });

  it("mostra a frase de apoio do contrato, e só quando há alguma", () => {
    expect(fila).toContain("AVISO_DA_VAGA_ENCERRADA_NO_ATS");
    expect(fila).toContain("encerradasNoAts > 0");
  });
});

/**
 * ─ O CAMINHO DE EDIÇÃO DA VAGA SEM NOME ────────────────────────────────────────────────────────
 *
 * ELE JÁ EXISTE E NÃO FOI CRIADO NESTA FRENTE (§A.31): quem completa a vaga do Digai é o "Revisar
 * vaga" da fila, que abre a TRILHA INTEIRA no modo `liberacao` e grava por
 * `PATCH /as/vagas/:id/editar` pelo botão "Salvar sem liberar". O que se afirma aqui é que ele NÃO
 * depende de a vaga ter nome, código, cargo ou cliente: o botão é da linha, de toda linha pendente.
 */
describe("5. a vaga sem nome tem caminho de edição", () => {
  const fila = fonte("app/(app)/as/vagas-pendentes-revisao/page.tsx");

  it("a fila oferece o Revisar vaga em toda linha pendente", () => {
    expect(fila).toContain("Revisar vaga");
    expect(fila).toContain('aba === "pendentes" ?');
  });

  it("e ele abre a trilha no modo liberação, que é quem grava o nome da vaga", () => {
    expect(fila).toContain('modo={{ tipo: "liberacao", vaga: revisarAlvo }}');
  });

  /** Se alguém condicionar o botão ao nome ou ao código, a vaga em branco fica sem saída. */
  it("o botão NÃO é condicionado a ter nome nem código", () => {
    expect(fila).not.toMatch(/nomeDivulgacao\s*&&[\s\S]{0,200}Revisar vaga/);
    expect(fila).not.toMatch(/v\.codigo\s*&&[\s\S]{0,200}Revisar vaga/);
  });
});

/** §A.11: o travessão é proibido em texto de UI, e o en dash entra na mesma trava. */
describe("4. nenhum travessão no texto novo (§A.11)", () => {
  it.each([
    ["a régua", "lib/as-vaga-codigo.ts"],
    ["a célula", "components/as/vagas/CodigoDaVaga.tsx"],
  ])("%s não usa em dash nem en dash em texto apresentável", (_nome, caminho) => {
    /* AS MOLDURAS DE COMENTÁRIO FICAM DE FORA: elas são desenhadas com `─` (box drawing, U+2500),
       que não é travessão e não chega ao usuário. O que se procura é o em dash e o en dash. */
    expect(fonte(caminho)).not.toMatch(/[–—]/);
  });

  it("e a frase de apoio do ATS também não", () => {
    expect(AJUDA_DO_NUMERO_NO_ATS).not.toMatch(/[–—]/);
  });
});
