import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  admissaoConcluidaSql,
  admissaoEmAndamentoExclusivoSql,
  admissaoEmAndamentoSql,
} from "./expressoes-admissao";

/**
 * AS EXPRESSÕES COMPARTILHADAS, que são a régua de contagem de TODA superfície (Gerenciador, análise
 * do Alto Volume e o que vier).
 *
 * O QUE ESTES TESTES PROTEGEM: um card de contagem erra em silêncio. Ninguém vê stack trace, vê um
 * número plausível e errado, e quem descobre é a diretoria olhando a tela. Aqui trava-se o que a
 * apuração de 12/08/2026 custou para descobrir.
 *
 * O DEFEITO REAL: "concluída" olha as FRENTES e "em andamento" olha o FAROL. Uma admissão que fechou
 * o Cadastro com o farol ainda em EM_ADMISSAO satisfazia as DUAS, e a mesma pessoa era contada duas
 * vezes em cards que a tela apresenta como opostos. Eram 56 admissões.
 */

const render = (expr: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  new PgDialect().sqlToQuery(expr).sql.replace(/\s+/g, " ");

describe("em andamento EXCLUSIVO", () => {
  it("é o em andamento MAIS a negação do concluída (não pode contar ninguém duas vezes)", () => {
    const exclusivo = render(admissaoEmAndamentoExclusivoSql);

    expect(exclusivo).toContain(render(admissaoEmAndamentoSql));
    expect(exclusivo).toContain("NOT");
    expect(exclusivo).toContain(render(admissaoConcluidaSql));
  });

  it("CONCLUÍDA MANDA: quem terminou não conta como andando", () => {
    // A ordem importa para a leitura: o balde de andamento é que cede, o de conclusão é intacto.
    expect(render(admissaoConcluidaSql)).not.toContain("NOT (");
    expect(render(admissaoEmAndamentoExclusivoSql).indexOf("NOT")).toBeGreaterThan(0);
  });
});

/**
 * O CARIMBO DA FILA DE BENEFÍCIOS NÃO CONTA NADA (§A.17 etapa 4, desenho de menor impacto da §A.27).
 *
 * A coluna `beneficios_entrou_em` existe para uma tela só, e a promessa feita ao diretor foi que ela
 * não participa de régua de conclusão, farol nem KPI. Este teste é essa promessa escrita: se um dia
 * alguém tentar usar o carimbo para decidir quem está concluído ou andando, ele quebra aqui.
 */
describe("a fila de Benefícios não contamina a contagem", () => {
  it("nenhum balde olha `beneficios_entrou_em`", () => {
    for (const expr of [
      admissaoConcluidaSql,
      admissaoEmAndamentoSql,
      admissaoEmAndamentoExclusivoSql,
    ]) {
      expect(render(expr)).not.toContain("beneficios_entrou_em");
    }
  });
});

describe("as definições de cada balde continuam sendo as de sempre", () => {
  /**
   * "Concluída" exige o Cadastro fechado E nenhuma integração pendente. As duas metades já custaram
   * um incidente cada: sem a primeira o balde conta quem não fechou, sem a segunda ele conta como
   * pronto quem ainda está na última etapa da esteira.
   */
  it("concluída = Cadastro fechado E sem integração pendente", () => {
    const s = render(admissaoConcluidaSql);
    expect(s).toContain("CADASTRO_CONTRATO");
    expect(s).toContain("INTEGRACAO");
    expect(s).toContain("concluida = true");
    expect(s).toContain("concluida = false");
  });

  it("em andamento = farol vivo E não pausada", () => {
    const s = render(admissaoEmAndamentoSql);
    expect(s).toContain("EM_ADMISSAO");
    expect(s).toContain("BANCO_AGUARDAR");
    expect(s).toContain("pausada_em");
    // Pausada não está andando: ela tem balde próprio, e some daqui de propósito.
    expect(s).toContain("IS NULL");
  });
});
