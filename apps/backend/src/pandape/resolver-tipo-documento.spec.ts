import { describe, expect, it } from "vitest";
import { normalizarLabel, resolverTipoDocumento } from "./resolver-tipo-documento";

describe("resolverTipoDocumento (Pandapé → catálogo §A.3)", () => {
  it("normaliza acento, caixa e pontuação", () => {
    expect(normalizarLabel("Comprovante de Residência")).toBe("comprovante de residencia");
    expect(normalizarLabel("  PIS/PASEP  ")).toBe("pis pasep");
  });

  it("descarta a decoração entre parênteses e o espaço à direita da API", () => {
    expect(normalizarLabel("CTPS (Carteira de Trabalho e Previdência Social)")).toBe("ctps");
    expect(normalizarLabel("FOTO DO ROSTO PARA CRACHA (A FOTO PODE SER TIRADA DO CELULAR) ")).toBe(
      "foto do rosto para cracha",
    );
  });

  it("mapeia rótulos conhecidos ao código do catálogo", () => {
    expect(resolverTipoDocumento("RG")).toBe("RG");
    expect(resolverTipoDocumento("Comprovante de Residência")).toBe("COMPROVANTE_RESIDENCIA");
    expect(resolverTipoDocumento("Atestado de Saúde Ocupacional")).toBe("ASO");
  });

  it("devolve undefined para rótulo não mapeado (chamador pula — não-bloqueio)", () => {
    expect(resolverTipoDocumento("Documento Estranho XYZ")).toBeUndefined();
    expect(resolverTipoDocumento(undefined)).toBeUndefined();
    expect(resolverTipoDocumento("")).toBeUndefined();
  });
});

/**
 * Formulários REAIS da API do Pandapé (nome exato de `forms[].name`, inclusive o espaço à direita
 * que a API manda na foto). Trava o de/para consolidado com o diretor (§A.9): se o resultado mudar,
 * o teste denuncia.
 */
describe("de/para dos 23 formulários reais do Pandapé", () => {
  const ESPERADO: [string, string | undefined][] = [
    ["CTPS (Carteira de Trabalho e Previdência Social)", "CTPS"],
    ["CPF", "CPF"],
    ["Cartão de Inscrição no PIS", "PIS_PASEP"],
    ["Cartão SUS", "CARTAO_SUS"],
    ["Comprovante de Escolaridade", "COMPROVANTE_ESCOLARIDADE"],
    ["Comprovante de Estado Civil ou Certidão de Nascimento", "CERTIDAO_NASC_CASAMENTO"],
    ["Comprovante de Residência", "COMPROVANTE_RESIDENCIA"],
    ["Conta Bancária (anexo de comprovação de agencia e conta obrigatório)", "DADOS_BANCARIOS"],
    ["FOTO DO ROSTO PARA CRACHA (A FOTO PODE SER TIRADA DO CELULAR) ", "FOTO_CRACHA"],
    ["Título de Eleitor", "TITULO_ELEITOR"],
    ["RG", "RG"],
    [
      "Carteira de Vacinação dos filhos até 06 anos de idade - pg do nome e vacinas",
      "VACINA_FILHOS",
    ],
    ["Certidão de Nascimento dos filhos até 21 anos de idade", "CERTIDAO_NASCIMENTO_FILHOS"],
    ["Certificado de Reservista", "RESERVISTA"],
    ["CNH (Carteira Nacional de Habilitação)", "CNH"],
    [
      "Comprovante de frequência escolar dos dependentes de 7 a 14 anos de idade",
      "FREQUENCIA_ESCOLAR_DEPENDENTES",
    ],
    // Exclusões DELIBERADAS (Bloco 4): a ausência de destino é decisão registrada, não esquecimento.
    ["Informações de Vale Transporte", undefined],
    ["Consulta de Qualificação Cadastral - eSocial", undefined],
    ["Atestado Médico Admissional", undefined],
    ["Dados Contratuais", undefined],
    ["Dados Pessoais", undefined],
    ["Dependentes", undefined],
    // Sem decisão do diretor até aqui: a fábrica NÃO mapeia por conta própria (§A.14).
    ["Comprovante de Vacina - Funcionário Admitido", undefined],
  ];

  it.each(ESPERADO)("%s", (formulario, codigo) => {
    expect(resolverTipoDocumento(formulario)).toBe(codigo);
  });

  it("a âncora mais específica vence a genérica", () => {
    expect(resolverTipoDocumento("Certidão de Nascimento dos filhos até 21 anos de idade")).toBe(
      "CERTIDAO_NASCIMENTO_FILHOS",
    );
    expect(resolverTipoDocumento("Comprovante de Estado Civil ou Certidão de Nascimento")).toBe(
      "CERTIDAO_NASC_CASAMENTO",
    );
    // O genérico segue valendo quando o rótulo é ele mesmo.
    expect(resolverTipoDocumento("Certidão de Nascimento")).toBe("CERTIDAO_NASCIMENTO");
    expect(resolverTipoDocumento("Foto 3x4")).toBe("FOTO_3X4");
  });

  it("casa por palavra INTEIRA, nunca por pedaço de palavra", () => {
    expect(resolverTipoDocumento("Documento de Pispiscina")).toBeUndefined();
  });
});
