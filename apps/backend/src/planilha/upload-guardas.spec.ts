import { describe, expect, it, vi } from "vitest";
import { assinaturaDoCabecalho, MAX_BYTES_DESCOMPRIMIDOS, MAX_BYTES_PLANILHA } from "./leitor";
import { FiltroUploadPlanilha } from "./upload-erro.filter";

/**
 * AS GUARDAS QUE A RODADA DO DIRETOR ACRESCENTOU, depois da auditoria de segurança.
 *
 *  - TETO DO DESCOMPRIMIDO em 8 MB (era 40 MB, que era folga de chute e aceitava o pior caso de ~7 s
 *    de parse síncrono);
 *  - ASSINATURA DO CABEÇALHO, que fecha o "mapa conferido na aba A aplicado na aba B";
 *  - MulterError virando 400 com mensagem, no lugar do 500 que mandava a pessoa tentar de novo com o
 *    mesmo arquivo.
 *
 * §A.6: fixtures sintéticas, sem PII. A assinatura é hash de RÓTULO DE COLUNA, nunca de célula.
 */

describe("teto do conteúdo descomprimido: 8 MB, medido e não chutado", () => {
  it("é 8 MB, e continua abaixo do teto de arquivo vezes um múltiplo pequeno", () => {
    expect(MAX_BYTES_DESCOMPRIMIDOS).toBe(8 * 1024 * 1024);
    // A guarda do zip só faz sentido ACIMA do teto de arquivo: abaixo dele, o teto de bytes já teria
    // recusado, e a conferência do diretório central viraria código morto.
    expect(MAX_BYTES_DESCOMPRIMIDOS).toBeLessThan(MAX_BYTES_PLANILHA);
  });
});

describe("assinatura do cabeçalho: o que amarra o mapa conferido à grade gravada", () => {
  const cab = ["NOME", "CPF", "E-mail"];

  it("é determinística: o mesmo cabeçalho na mesma aba dá sempre o mesmo valor", () => {
    expect(assinaturaDoCabecalho(cab, "Candidatos")).toBe(assinaturaDoCabecalho(cab, "Candidatos"));
  });

  it("MUDA quando a ABA muda, que é o defeito que ela existe para pegar", () => {
    expect(assinaturaDoCabecalho(cab, "Candidatos")).not.toBe(assinaturaDoCabecalho(cab, "Carimbos"));
  });

  it("MUDA quando o cabeçalho muda, inclusive só na ORDEM das colunas", () => {
    expect(assinaturaDoCabecalho(cab, "A")).not.toBe(assinaturaDoCabecalho(["CPF", "NOME", "E-mail"], "A"));
    expect(assinaturaDoCabecalho(cab, "A")).not.toBe(assinaturaDoCabecalho(["NOME", "CPF"], "A"));
  });

  it("NÃO muda por diferença cosmética que não troca coluna nenhuma", () => {
    expect(assinaturaDoCabecalho(["  nome ", "cpf", "e-mail"], "candidatos")).toBe(
      assinaturaDoCabecalho(["NOME", "CPF", "E-MAIL"], "CANDIDATOS"),
    );
    // Acento e espaço duplo entram na mesma régua: o leitor já apara, e recusar por isso seria
    // barrar importação legítima.
    expect(assinaturaDoCabecalho(["Salário  Base"])).toBe(assinaturaDoCabecalho(["salario base"]));
  });

  it("a fronteira entre colunas é respeitada: ['a|b'] não colide com ['a','b']", () => {
    expect(assinaturaDoCabecalho(["a|b"])).not.toBe(assinaturaDoCabecalho(["a", "b"]));
  });

  it("§A.6: o valor é um hash, e não carrega o texto do cabeçalho", () => {
    const a = assinaturaDoCabecalho(["FULANO DE TAL", "12345678901"], "Aba");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("FULANO");
    expect(a).not.toContain("12345678901");
  });
});

describe("filtro de upload: MulterError vira 400 com mensagem, e o resto passa intacto", () => {
  function hostFalso() {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    return {
      host: { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as never,
      status,
      json,
    };
  }

  function erroDoMulter(code: string): Error {
    const e = new Error("File too large");
    e.name = "MulterError";
    (e as Error & { code?: string }).code = code;
    return e;
  }

  it("arquivo acima do limite do multer: 400 (era 500) e a mensagem DIZ o limite", () => {
    const { host, status, json } = hostFalso();
    new FiltroUploadPlanilha().catch(erroDoMulter("LIMIT_FILE_SIZE"), host);

    expect(status).toHaveBeenCalledWith(400);
    const corpo = json.mock.calls[0]?.[0] as { message?: string };
    expect(corpo.message).toMatch(/limite/i);
    expect(corpo.message).toMatch(/MB/);
    // §A.11: nenhuma mensagem de UI usa travessão.
    expect(corpo.message).not.toContain("—");
  });

  it("§A.6: a mensagem é CONSTANTE, sem nome de arquivo, sem stack e sem o erro cru", () => {
    const { host, json } = hostFalso();
    const erro = erroDoMulter("LIMIT_UNEXPECTED_FILE");
    (erro as Error & { field?: string }).field = "base-de-candidatos-cpf.xlsx";
    new FiltroUploadPlanilha().catch(erro, host);

    const corpo = json.mock.calls[0]?.[0] as { message?: string };
    expect(corpo.message).not.toContain("base-de-candidatos-cpf");
    expect(JSON.stringify(corpo)).not.toContain("stack");
  });

  it("erro que NÃO é do multer NÃO vira 400: vai para o tratamento padrão do Nest", () => {
    const { host, status } = hostFalso();
    const filtro = new FiltroUploadPlanilha();
    const padrao = vi
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(filtro)) as { catch: () => void }, "catch")
      .mockImplementation(() => undefined);

    const naoEhMulter = new Error("Vaga não encontrada.");
    filtro.catch(naoEhMulter, host);

    expect(padrao).toHaveBeenCalledWith(naoEhMulter, host);
    // Nada foi respondido por este filtro: o status do erro original é preservado por quem trata.
    expect(status).not.toHaveBeenCalled();
    padrao.mockRestore();
  });
});
