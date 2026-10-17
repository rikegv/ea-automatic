import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { SOLICITACAO_DESCRICAO_MIN } from "@ea/shared-types";
import { AcaoGestaoDto, CriarSolicitacaoDto } from "./central-solicitacoes.dto";

/**
 * ─ VALIDAÇÃO DE FORMA DO CREATE E DA AÇÃO DA GESTÃO (cobertura independente, §A.38) ─────────────
 *
 * O que é regra de FORMA mora no DTO e é o que este arquivo mede: o tipo dentro do enum, a descrição
 * com o mínimo de caracteres NÃO brancos, a ação dentro do enum. O que é regra de DOMÍNIO (imagem
 * obrigatória, o par tela+seção existir no catálogo, dúvida exigir corpo) mora no SERVICE, e está
 * provado no arquivo de service desta mesma pasta, não aqui.
 *
 * O método: `plainToInstance` + `validateSync`, o mesmo idioma de `vagas.reabrir-rota.spec.ts`.
 * Reunimos as propriedades que falharam para afirmar QUAL campo barrou, não só que barrou.
 */

function propsComErro(classe: new () => object, corpo: Record<string, unknown>): string[] {
  const inst = plainToInstance(classe, corpo) as object;
  return validateSync(inst, { forbidUnknownValues: true }).map((e) => e.property);
}

describe("CriarSolicitacaoDto: a descrição tem mínimo de 50 caracteres (req.1)", () => {
  const baseValida = {
    tipo: "BUG",
    menuCodigo: "esteira-admissional",
    submenu: "Auditoria",
  };

  it("EXATAMENTE 50 caracteres é aceito", () => {
    const descricao = "x".repeat(SOLICITACAO_DESCRICAO_MIN); // 50
    expect(propsComErro(CriarSolicitacaoDto, { ...baseValida, descricao })).not.toContain(
      "descricao",
    );
  });

  it("49 caracteres é REJEITADO", () => {
    const descricao = "x".repeat(SOLICITACAO_DESCRICAO_MIN - 1); // 49
    expect(propsComErro(CriarSolicitacaoDto, { ...baseValida, descricao })).toContain("descricao");
  });

  it("50 ESPAÇOS não é descrição: a apara vem antes do mínimo, então é rejeitada", () => {
    const descricao = " ".repeat(SOLICITACAO_DESCRICAO_MIN);
    expect(propsComErro(CriarSolicitacaoDto, { ...baseValida, descricao })).toContain("descricao");
  });

  it("49 caracteres úteis cercados de espaços ainda é rejeitado (conta o não branco)", () => {
    const descricao = "   " + "y".repeat(SOLICITACAO_DESCRICAO_MIN - 1) + "   ";
    expect(propsComErro(CriarSolicitacaoDto, { ...baseValida, descricao })).toContain("descricao");
  });
});

describe("CriarSolicitacaoDto: tipo tem de estar no enum (req.1)", () => {
  const baseValida = {
    menuCodigo: "esteira-admissional",
    submenu: "Auditoria",
    descricao: "x".repeat(SOLICITACAO_DESCRICAO_MIN),
  };

  it("tipo FUNCIONALIDADE é aceito", () => {
    expect(propsComErro(CriarSolicitacaoDto, { ...baseValida, tipo: "FUNCIONALIDADE" })).not.toContain(
      "tipo",
    );
  });

  it("tipo BUG é aceito", () => {
    expect(propsComErro(CriarSolicitacaoDto, { ...baseValida, tipo: "BUG" })).not.toContain("tipo");
  });

  it("tipo fora do enum (MELHORIA) é REJEITADO", () => {
    expect(propsComErro(CriarSolicitacaoDto, { ...baseValida, tipo: "MELHORIA" })).toContain("tipo");
  });

  it("tipo ausente é REJEITADO", () => {
    expect(propsComErro(CriarSolicitacaoDto, baseValida)).toContain("tipo");
  });
});

describe("AcaoGestaoDto: a ação tem de estar no enum (req.4, parte de forma)", () => {
  it("cada ação do contrato é aceita na forma", () => {
    for (const acao of ["APROVAR", "REPROVAR", "ENVIAR_DUVIDA", "EM_ANDAMENTO", "CONCLUIR"]) {
      expect(propsComErro(AcaoGestaoDto, { acao }), acao).not.toContain("acao");
    }
  });

  it("ação fora do enum é REJEITADA", () => {
    expect(propsComErro(AcaoGestaoDto, { acao: "ARQUIVAR" })).toContain("acao");
  });

  /**
   * O corpo é OPCIONAL no DTO de propósito: a obrigatoriedade do corpo para ENVIAR_DUVIDA é regra
   * de DOMÍNIO e mora no service. Aqui só provamos que a forma não exige corpo, para o teste de
   * service ter o que distinguir (a forma passa, o domínio recusa).
   */
  it("ENVIAR_DUVIDA SEM corpo passa na FORMA (a trava real é do service)", () => {
    expect(propsComErro(AcaoGestaoDto, { acao: "ENVIAR_DUVIDA" })).not.toContain("corpo");
  });
});
