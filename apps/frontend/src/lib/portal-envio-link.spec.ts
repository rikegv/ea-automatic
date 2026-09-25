import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_RECUSA_DE_ENVIO,
  type DestinatarioDoLink,
  type PreviaDoEnvioEmLote,
  type ResultadoDoEnvioDoLink,
} from "@ea/shared-types";
import {
  AVISO_DO_ENVIO_DO_LINK,
  RECUSA_ETIQUETA,
  RECUSA_FRASE,
  ROTA_SEM_LINK,
  destinoVisivel,
  etiquetaDaRecusa,
  fraseDaCienciaDoEnvio,
  fraseDaRecusa,
  fraseDoResultado,
  frasePessoas,
  resumoDaPrevia,
  rotaDaPrevia,
  rotaEnviarLink,
  rotaSemLink,
  separarPrevia,
} from "./portal-envio-link";

function pessoa(p: Partial<DestinatarioDoLink> = {}): DestinatarioDoLink {
  return {
    candidaturaId: "cand-1",
    admissaoId: "adm-1",
    nome: "Fulano De Tal",
    destinoMascarado: "f****o@empresa.com",
    podeEnviar: true,
    motivo: null,
    ...p,
  };
}

describe("as rotas do envio do link", () => {
  it("O ENVIO NÃO MORA SOB portal/: esse prefixo é o que a barreira abre para o candidato", () => {
    expect(rotaEnviarLink("adm-9")).toBe("/esteira/portal/envio/admissao/adm-9");
    // A régua em uma linha: nenhuma rota desta frente começa por `/portal/`, porque uma rota que
    // EMITE E ENTREGA credencial não pode cair numa allowlist escrita por prefixo.
    for (const r of [rotaEnviarLink("adm-9"), ROTA_SEM_LINK, rotaDaPrevia(["a"])!]) {
      expect(r.startsWith("/esteira/portal/")).toBe(true);
    }
  });

  it("a prévia manda os ids separados por vírgula", () => {
    expect(rotaDaPrevia(["a", "b"])).toBe("/esteira/portal/envio/previa?candidaturas=a%2Cb");
  });

  it("SEM NINGUÉM SELECIONADO NÃO HÁ PRÉVIA A PEDIR: a rota é nula, e não uma consulta vazia", () => {
    expect(rotaDaPrevia([])).toBeNull();
    expect(rotaDaPrevia(["", "  "])).toBeNull();
  });

  it("a busca por nome só viaja quando há nome, e o nome vai aparado", () => {
    expect(rotaSemLink("")).toBe(ROTA_SEM_LINK);
    expect(rotaSemLink("   ")).toBe(ROTA_SEM_LINK);
    expect(rotaSemLink("  maria  ")).toBe("/esteira/portal/envio/sem-link?nome=maria");
  });
});

describe("o vocabulário da recusa", () => {
  it("todo motivo do contrato tem etiqueta e frase: motivo novo não chega cru na tela", () => {
    for (const m of MOTIVOS_DE_RECUSA_DE_ENVIO) {
      expect(RECUSA_ETIQUETA[m]).toBeTruthy();
      expect(RECUSA_FRASE[m]).toBeTruthy();
    }
  });

  it("NENHUMA frase da recusa carrega arroba: endereço em frase copiada é vazamento (§A.6)", () => {
    for (const frase of Object.values(RECUSA_FRASE)) expect(frase).not.toContain("@");
  });

  it("nenhum texto deste vocabulário usa travessão (§A.11)", () => {
    const textos = [
      AVISO_DO_ENVIO_DO_LINK,
      ...Object.values(RECUSA_FRASE),
      ...Object.values(RECUSA_ETIQUETA),
    ];
    for (const t of textos) expect(t).not.toContain("—");
  });

  it("A ABSTENÇÃO NÃO SOA COMO FALHA: link vivo é 'ela já entrou', e não 'não foi possível'", () => {
    const f = RECUSA_FRASE.LINK_VIVO_EM_USO;
    // O que esta recusa NÃO pode dizer. Ela era a mais comum das seis e voltava sem motivo, caindo
    // no ramo genérico de erro: a pessoa lia "falhou" onde nada falhou.
    for (const proibido of ["não foi possível", "falha", "falhou", "não vai sair", "erro"]) {
      expect(f.toLowerCase()).not.toContain(proibido);
    }
    // E o que ela PRECISA dizer: o link está valendo, e o candidato já entrou.
    expect(f).toContain("está valendo");
    expect(f).toContain("já entrou");
    expect(RECUSA_ETIQUETA.LINK_VIVO_EM_USO).toBe("Link Ativo");
  });

  it("motivo fora do catálogo vira texto neutro, nunca código cru", () => {
    expect(etiquetaDaRecusa("COISA_NOVA")).toBe("Não Informado");
    expect(etiquetaDaRecusa(null)).toBe("Não Informado");
    expect(fraseDaRecusa("COISA_NOVA")).toContain("não vai sair");
  });
});

describe("o destino", () => {
  it("sem destino a célula diz não informado, nunca o glifo (§A.11)", () => {
    expect(destinoVisivel(null)).toBe("não informado");
    expect(destinoVisivel("  ")).toBe("não informado");
    expect(destinoVisivel("f****o@empresa.com")).toBe("f****o@empresa.com");
  });
});

describe("a ciência do envio individual", () => {
  it("quem pode receber lê a frase do diretor e o destino MASCARADO", () => {
    const f = fraseDaCienciaDoEnvio(pessoa());
    expect(f.startsWith(AVISO_DO_ENVIO_DO_LINK)).toBe(true);
    expect(f).toContain("f****o@empresa.com");
  });

  it("quem NÃO pode receber lê que o link não vai sair, e por quê", () => {
    const f = fraseDaCienciaDoEnvio(pessoa({ podeEnviar: false, motivo: "SEM_EMAIL", destinoMascarado: null }));
    expect(f).toContain("NÃO vai sair");
    expect(f).toContain(RECUSA_FRASE.SEM_EMAIL);
  });

  it("a ciência do LINK VIVO não grita 'NÃO vai sair': nada falhou, o candidato está lá dentro", () => {
    const f = fraseDaCienciaDoEnvio(
      pessoa({ podeEnviar: false, motivo: "LINK_VIVO_EM_USO", destinoMascarado: null }),
    );
    expect(f).not.toContain("NÃO vai sair");
    expect(f).toContain(RECUSA_FRASE.LINK_VIVO_EM_USO);
  });

  it("PRÉVIA QUE NÃO VOLTOU não promete e-mail nem inventa recusa: ela diz que não conferiu", () => {
    const f = fraseDaCienciaDoEnvio(null);
    expect(f).toContain("Não foi possível conferir o destino");
    expect(f).toContain("envio para a admissão acontece do mesmo jeito");
  });
});

describe("o desfecho de um envio avulso", () => {
  const base: ResultadoDoEnvioDoLink = {
    enviado: true,
    motivo: null,
    canal: "EMAIL",
    origem: "MANUAL",
    destinoMascarado: "m****a@empresa.com",
    enviadoEm: "2026-09-21T10:00:00.000Z",
    expiraEm: "2026-09-24T10:00:00.000Z",
  };

  it("diz para qual destino mascarado foi e até quando o link vale", () => {
    const f = fraseDoResultado(base, "24/09/2026 07:00");
    expect(f).toContain("m****a@empresa.com");
    expect(f).toContain("24/09/2026 07:00");
  });

  it("recusa vira a frase do motivo, e não uma falsa confirmação", () => {
    const f = fraseDoResultado(
      { ...base, enviado: false, motivo: "CANAL_INDISPONIVEL", destinoMascarado: null },
      "24/09/2026 07:00",
    );
    expect(f).toBe(RECUSA_FRASE.CANAL_INDISPONIVEL);
  });
});

describe("a prévia do lote", () => {
  const previa: PreviaDoEnvioEmLote = {
    itens: [
      pessoa({ candidaturaId: "c1", nome: "Um" }),
      pessoa({ candidaturaId: "c2", nome: "Dois", podeEnviar: false, motivo: "SEM_EMAIL", destinoMascarado: null }),
      pessoa({ candidaturaId: "c3", nome: "Três" }),
    ],
    enviaveis: 2,
    recusados: 1,
  };

  it("separa quem recebe de quem fica de fora, pelo podeEnviar do SERVIDOR", () => {
    const { recebem, ficamDeFora } = separarPrevia(previa);
    expect(recebem.map((p) => p.nome)).toEqual(["Um", "Três"]);
    expect(ficamDeFora.map((p) => p.nome)).toEqual(["Dois"]);
  });

  it("prévia ausente não quebra a separação", () => {
    expect(separarPrevia(null)).toEqual({ recebem: [], ficamDeFora: [] });
  });

  it("o resumo conta pelos ITENS desenhados, e nomeia os dois grupos", () => {
    const r = resumoDaPrevia(previa);
    expect(r).toContain("2 pessoas");
    expect(r).toContain("1 pessoa");
  });

  it("ninguém enviável é dito em voz alta, e não como silêncio", () => {
    const r = resumoDaPrevia({ itens: [previa.itens[1]], enviaveis: 0, recusados: 1 });
    expect(r).toContain("Ninguém desta seleção recebe o link");
  });

  it("prévia ainda não carregada diz que está conferindo", () => {
    expect(resumoDaPrevia(null)).toContain("Conferindo");
  });

  it("o plural é calculado, sem (s) e sem travessão (§A.11)", () => {
    expect(frasePessoas(1)).toBe("1 pessoa");
    expect(frasePessoas(4)).toBe("4 pessoas");
  });
});
