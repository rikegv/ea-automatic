import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { RelatorioXlsxDto } from "./relatorio.dto";

/**
 * REGRESSÃO (P0 16/10/2026): a exportação em Excel de Auditoria/Exame/Cadastro/Integração parou de
 * funcionar depois da Onda 3 (seleção de colunas). O frontend passou a marcar Nome/Telefone/E-mail
 * como `obrigatoria: true` (`ColunaExport`) e manda o objeto INTEIRO da coluna neste corpo. O
 * `ValidationPipe` global roda com `forbidNonWhitelisted: true` (`main.ts`), e `obrigatoria` não
 * existia no `ColunaXlsxDto` aninhado: o pipe rejeitava com 400 ("property obrigatoria should not
 * exist") e o botão "Exportar Excel" não gerava arquivo nenhum (o front engole o erro em silêncio).
 *
 * As opções aqui espelham EXATAMENTE o pipe de produção (`whitelist` + `forbidNonWhitelisted`), que
 * é o único jeito de o teste provar a causa e travar a volta do bug.
 */
const OPCOES_DO_PIPE = { whitelist: true, forbidNonWhitelisted: true } as const;

/** O corpo que a aba Auditoria manda hoje: as três colunas obrigatórias + uma opcional. */
const CORPO_DA_TELA = {
  aba: "Auditoria",
  nomeArquivo: "esteira-auditoria-2026-10-16.xlsx",
  colunas: [
    { chave: "candidato", rotulo: "Nome Completo", largura: 28, obrigatoria: true },
    { chave: "telefone", rotulo: "Telefone", largura: 16, obrigatoria: true },
    { chave: "email", rotulo: "E-mail", largura: 26, obrigatoria: true },
    { chave: "cpf", rotulo: "CPF", largura: 16 },
  ],
  linhas: [{ candidato: "FULANO DE TAL", telefone: "11999990000", email: "f@ex.com", cpf: "" }],
};

describe("RelatorioXlsxDto sob o pipe de produção (forbidNonWhitelisted)", () => {
  it("ACEITA coluna com `obrigatoria` (as abas da Esteira) sem erro de whitelist", () => {
    const inst = plainToInstance(RelatorioXlsxDto, CORPO_DA_TELA);
    const erros = validateSync(inst, OPCOES_DO_PIPE);
    expect(erros).toHaveLength(0);
  });

  it("ACEITA coluna SEM `obrigatoria` (o IFractal, que nunca quebrou)", () => {
    const corpo = {
      ...CORPO_DA_TELA,
      aba: "iFractal",
      colunas: CORPO_DA_TELA.colunas.map(({ obrigatoria: _obrigatoria, ...c }) => c),
    };
    const erros = validateSync(plainToInstance(RelatorioXlsxDto, corpo), OPCOES_DO_PIPE);
    expect(erros).toHaveLength(0);
  });

  it("`obrigatoria` tem de ser booleano: um valor estranho ainda é recusado", () => {
    const corpo = {
      ...CORPO_DA_TELA,
      colunas: [{ chave: "candidato", rotulo: "Nome", obrigatoria: "sim" }],
    };
    const erros = validateSync(plainToInstance(RelatorioXlsxDto, corpo), OPCOES_DO_PIPE);
    expect(erros.length).toBeGreaterThan(0);
  });

  it("campo REALMENTE desconhecido continua barrado (a whitelist não afrouxou)", () => {
    const corpo = {
      ...CORPO_DA_TELA,
      colunas: [{ chave: "candidato", rotulo: "Nome", obrigatoria: true, inventado: 1 }],
    };
    const erros = validateSync(plainToInstance(RelatorioXlsxDto, corpo), OPCOES_DO_PIPE);
    expect(erros.length).toBeGreaterThan(0);
  });
});
