import { describe, expect, it } from "vitest";
import {
  FRASE_CODIGO_NAO_CONFERE,
  FRASE_DA_RECUSA,
  mensagemDaRecusa,
  FRASE_DESTRAVE_RECUSADO,
  FRASE_TRAVA_SUMIU,
  FRASE_PEDIDO_NO_TETO,
  OPCOES_DE_MOTIVO_DA_TRAVA,
  OPCOES_DE_SITUACAO_DA_TRAVA,
  OPCOES_DO_DESTRAVE,
  ROTA_CONFIRMAR_CODIGO,
  ROTA_IDENTIDADE_DO_ACESSO,
  ROTA_SOLICITAR_CODIGO,
  ROTA_TRAVAS,
  ROTULO_DA_SITUACAO,
  TAMANHO_DO_CODIGO,
  codigoCompleto,
  contagemRegressiva,
  contarFiltrosDasTravas,
  contarTravadas,
  desfechoDaRecusa,
  digitosDoCodigo,
  emailAparentaValido,
  normalizarEmail,
  prazoVencido,
  queryDasTravas,
  rotaDestravar,
  rotuloDaSituacao,
  rotuloDoMotivo,
  situacaoDaTrava,
} from "./portal-acesso-email";

/**
 * A RÉGUA DO ACESSO POR E-MAIL, testada fora da tela.
 *
 * O que estes testes TRAVAM não é aparência: são as proibições da auditoria escritas em forma de
 * asserção. Nenhuma frase pode dizer se o e-mail existe, nenhuma pode dizer qual campo divergiu e
 * nenhuma pode dizer quantas tentativas restam. Texto de tela é o lugar mais fácil de vazar isso, e
 * é o que ninguém relê depois do primeiro ajuste de redação.
 *
 * §A.11: nenhum travessão em texto de tela.
 */

const TRAVESSAO = String.fromCharCode(0x2014);

describe("rotas do contrato", () => {
  it("bate com o contrato, e a fila do time fica FORA do prefixo que a barreira allowlista", () => {
    expect(ROTA_SOLICITAR_CODIGO).toBe("/portal/acesso-email/solicitar");
    expect(ROTA_CONFIRMAR_CODIGO).toBe("/portal/acesso-email/confirmar");
    expect(ROTA_IDENTIDADE_DO_ACESSO).toBe("/portal/acesso-email/identidade");
    expect(ROTA_TRAVAS).toBe("/esteira/portal-painel/travas");
    expect(rotaDestravar("abc")).toBe("/esteira/portal-painel/travas/abc/destravar");
    // A fila NÃO pode morar sob `portal/`: ali a barreira allowlista caminhos para a internet.
    expect(ROTA_TRAVAS.startsWith("/portal/")).toBe(false);
  });
});

describe("o código", () => {
  it("tem 6 dígitos, e o campo aceita só dígito, recortando no tamanho", () => {
    expect(TAMANHO_DO_CODIGO).toBe(6);
    expect(digitosDoCodigo("12 34-56")).toBe("123456");
    expect(digitosDoCodigo("1234567890")).toBe("123456");
    expect(digitosDoCodigo("abc")).toBe("");
    expect(codigoCompleto("12345")).toBe(false);
    expect(codigoCompleto("123456")).toBe(true);
  });
});

describe("o e-mail", () => {
  it("é conferido SÓ na forma, e a normalização não é Gmail-aware", () => {
    expect(emailAparentaValido("pessoa@empresa.com")).toBe(true);
    expect(emailAparentaValido("pessoa@empresa.com.br")).toBe(true);
    expect(emailAparentaValido("pessoa")).toBe(false);
    expect(emailAparentaValido("pessoa@empresa")).toBe(false);
    expect(emailAparentaValido("pes soa@empresa.com")).toBe(false);
    expect(emailAparentaValido("")).toBe(false);
    // Ponto e "+" NÃO são removidos: o domínio puro faz o mesmo, e divergir daria dois baldes.
    expect(normalizarEmail("  Pes.Soa+Um@Empresa.COM ")).toBe("pes.soa+um@empresa.com");
  });
});

describe("o prazo à vista", () => {
  it("conta em mm:ss e nunca desce abaixo de zero", () => {
    expect(contagemRegressiva(10 * 60_000)).toBe("10:00");
    expect(contagemRegressiva(61_000)).toBe("01:01");
    expect(contagemRegressiva(999)).toBe("00:00");
    expect(contagemRegressiva(-5000)).toBe("00:00");
    expect(prazoVencido(1)).toBe(false);
    expect(prazoVencido(0)).toBe(true);
    expect(prazoVencido(-1)).toBe(true);
  });
});

describe("o desfecho da recusa: DOIS desfechos de erro, e só dois", () => {
  it("a recusa é UMA só, e a porta desligada é o outro desfecho", () => {
    // 401 é A recusa (código errado, bilhete morto, CPF inválido, trava: tudo a mesma coisa) e 400 é
    // a validação de forma, mantida pobre de propósito. Nenhum dos dois é um desfecho novo.
    expect(desfechoDaRecusa(400)).toBe("RECUSADO");
    expect(desfechoDaRecusa(401)).toBe("RECUSADO");
    expect(desfechoDaRecusa(503)).toBe("INDISPONIVEL");
    expect(desfechoDaRecusa(429)).toBe("MUITAS_TENTATIVAS");
    expect(desfechoDaRecusa(500)).toBe("FALHA");
    expect(desfechoDaRecusa(0)).toBe("FALHA");
    // Reservado: o servidor NÃO distingue a trava hoje, e é isto que mantém o oráculo fechado. A
    // linha existe para ser a única a mexer no dia em que existir um sinal.
    expect(desfechoDaRecusa(403)).toBe("TRAVADO");
    expect(desfechoDaRecusa(409)).toBe("TRAVADO");
  });
});

describe("a mensagem que a pessoa lê vem do SERVIDOR", () => {
  it("no 401, lê o `mensagem` do CORPO, porque o cliente HTTP reescreve o `message`", () => {
    // Este é o defeito que a função existe para evitar: o `lib/api` troca o `message` de todo 401
    // por "Sua sessão expirou...", que é a frase do operador do EA e não do candidato.
    expect(
      mensagemDaRecusa({
        status: 401,
        message: "Sua sessão expirou. Entre novamente para continuar.",
        data: { mensagem: "Não foi possível continuar. Confira os dados e tente de novo." },
      }),
    ).toBe("Não foi possível continuar. Confira os dados e tente de novo.");
  });

  it("sem o campo do corpo, cai na frase neutra do catálogo, NUNCA na do 401 reescrito", () => {
    const lida = mensagemDaRecusa({ status: 401, message: "Sua sessão expirou.", data: null });
    expect(lida).toBe(FRASE_DA_RECUSA.RECUSADO);
    expect(lida.toLowerCase()).not.toContain("sessão");
  });

  it("no 400 a orientação de FORMA do servidor serve, e é pobre de propósito", () => {
    expect(mensagemDaRecusa({ status: 400, message: "Informe um CPF válido", data: {} })).toBe(
      "Informe um CPF válido",
    );
  });

  it("no 503 e no 500 a frase é a do catálogo", () => {
    expect(mensagemDaRecusa({ status: 503, message: "Portal indisponível" })).toBe(
      FRASE_DA_RECUSA.INDISPONIVEL,
    );
    expect(mensagemDaRecusa({ status: 500, message: "Internal Server Error" })).toBe(
      FRASE_DA_RECUSA.FALHA,
    );
  });
});

describe("AS FRASES NÃO PODEM VAZAR NADA, e é isto que a auditoria fixou", () => {
  const todas = [...Object.values(FRASE_DA_RECUSA), FRASE_CODIGO_NAO_CONFERE, FRASE_PEDIDO_NO_TETO];

  it("nenhuma diz se o e-mail está cadastrado (o oráculo de enumeração)", () => {
    for (const f of todas) {
      expect(f.toLowerCase()).not.toContain("não cadastrado");
      expect(f.toLowerCase()).not.toContain("nao cadastrado");
      expect(f.toLowerCase()).not.toContain("não encontramos o e-mail");
      expect(f.toLowerCase()).not.toContain("não existe");
    }
  });

  it("nenhuma diz QUAL campo divergiu, nem que o CPF é de outra pessoa", () => {
    for (const f of todas) {
      const min = f.toLowerCase();
      expect(min).not.toContain("divergente");
      expect(min).not.toContain("já cadastrado");
      expect(min).not.toContain("outro candidato");
      expect(min).not.toContain("pertence a");
    }
    // A frase da trava manda falar com o RH e NÃO explica o que houve.
    expect(FRASE_DA_RECUSA.TRAVADO).toContain("Fale com o RH");
  });

  it("nenhuma diz quantas tentativas restam (isso ajudaria quem está chutando)", () => {
    for (const f of todas) {
      expect(f).not.toMatch(/\d+\s*(tentativa|tentativas)/i);
      expect(f.toLowerCase()).not.toContain("restam");
    }
  });

  it("código errado e código vencido têm a MESMA frase, uma só", () => {
    expect(FRASE_CODIGO_NAO_CONFERE).toContain("inválido ou vencido");
  });

  it("nenhuma frase tem travessão (§A.11)", () => {
    for (const f of todas) expect(f).not.toContain(TRAVESSAO);
  });
});

describe("a fila de travas", () => {
  const linha = (over: Partial<Parameters<typeof situacaoDaTrava>[0]> = {}) => ({
    destravadoEm: null,
    ...over,
  });

  it("a situação é DERIVADA do carimbo, e usa o vocabulário da rota (ABERTA/DESTRAVADA)", () => {
    expect(situacaoDaTrava(linha())).toBe("ABERTA");
    expect(situacaoDaTrava(linha({ destravadoEm: "2026-09-29T10:00:00Z" }))).toBe("DESTRAVADA");
    // O valor viaja para o servidor em `situacao`, então divergir de palavra aqui seria um filtro
    // que a tela oferece e a consulta ignora.
    expect(OPCOES_DE_SITUACAO_DA_TRAVA.map((o) => o.value)).toEqual(["ABERTA", "DESTRAVADA"]);
  });

  it("o ícone acompanha o estado real, nunca é fixo (§A.12)", () => {
    expect(ROTULO_DA_SITUACAO.ABERTA.icone).toBe("alert");
    expect(ROTULO_DA_SITUACAO.ABERTA.tone).toBe("wn");
    expect(ROTULO_DA_SITUACAO.DESTRAVADA.icone).toBe("check");
    expect(ROTULO_DA_SITUACAO.DESTRAVADA.tone).toBe("ok");
    // O rank é a ordem da fila de trabalho: quem está preso vem antes de quem já foi resolvido.
    expect(ROTULO_DA_SITUACAO.ABERTA.rank).toBeLessThan(ROTULO_DA_SITUACAO.DESTRAVADA.rank);
    // Situação desconhecida não derruba a célula: lê como fila aberta, o estado mais conservador.
    expect(rotuloDaSituacao("COISA_NOVA").label).toBe("Aberta");
  });

  it("o badge conta SÓ quem continua travado", () => {
    expect(
      contarTravadas([
        { destravadoEm: null },
        { destravadoEm: "2026-09-29T10:00:00Z" },
        { destravadoEm: null },
      ]),
    ).toBe(2);
  });

  it("o motivo viaja como LISTA, e a cláusula do servidor vira IN", () => {
    expect(queryDasTravas({})).toBe("");
    expect(queryDasTravas({ motivos: ["EMAIL_AMBIGUO", "TRAVA_ANTERIOR"] })).toBe(
      "motivos=EMAIL_AMBIGUO%2CTRAVA_ANTERIOR",
    );
    // Vazio e espaço não viram parâmetro: filtro que viaja para ser ignorado é divergência futura.
    expect(queryDasTravas({ motivos: ["", "  "] })).toBe("");
    expect(contarFiltrosDasTravas({})).toBe(0);
    expect(contarFiltrosDasTravas({ motivos: ["X"], situacoes: ["ABERTA"] })).toBe(2);
  });

  it("A SITUAÇÃO É MULTISELECT NA TELA e UM VALOR NA ROTA, e a tradução é esta", () => {
    // Uma escolhida: viaja.
    expect(queryDasTravas({ situacoes: ["ABERTA"] })).toBe("situacao=ABERTA");
    expect(queryDasTravas({ situacoes: ["DESTRAVADA"] })).toBe("situacao=DESTRAVADA");
    // As DUAS escolhidas: é o universo inteiro, então não viaja nada. Mandar as duas num parâmetro
    // de valor único faria o servidor honrar uma e descartar a outra em silêncio.
    expect(queryDasTravas({ situacoes: ["ABERTA", "DESTRAVADA"] })).toBe("");
    // Repetição não engana a contagem.
    expect(queryDasTravas({ situacoes: ["ABERTA", "ABERTA"] })).toBe("situacao=ABERTA");
    // Nenhuma: também não viaja.
    expect(queryDasTravas({ situacoes: [] })).toBe("");
  });

  it("a busca por NOME viaja, e a fila nunca busca por CPF", () => {
    expect(queryDasTravas({ nome: " Maria " })).toBe("nome=Maria");
    expect(queryDasTravas({ nome: "   " })).toBe("");
  });

  it("as opções do filtro vêm do CATÁLOGO do contrato, com os 4 motivos, nunca das linhas (§A.37)", () => {
    expect(OPCOES_DE_MOTIVO_DA_TRAVA.map((o) => o.value)).toEqual([
      "DIVERGENCIA_CADASTRO",
      "CPF_DE_OUTRO_CANDIDATO",
      "EMAIL_AMBIGUO",
      "TRAVA_ANTERIOR",
    ]);
    for (const o of OPCOES_DE_MOTIVO_DA_TRAVA) expect(o.label).not.toContain(TRAVESSAO);
  });

  it("motivo fora do catálogo não derruba a célula", () => {
    expect(rotuloDoMotivo("EMAIL_AMBIGUO")).toBe("E-mail Ambíguo");
    expect(rotuloDoMotivo("MOTIVO_QUE_NAO_EXISTE")).toBe("MOTIVO_QUE_NAO_EXISTE");
  });
});

describe("o destrave", () => {
  it("o motivo é o da PRÓPRIA trava, de lista fechada, e os quatro são oferecidos", () => {
    // O servidor exige que o motivo declarado seja o MESMO da linha: o gesto é de reconhecimento do
    // que está sendo desfeito. Oferecer só o da linha faria o reconhecimento virar carimbo.
    expect(OPCOES_DO_DESTRAVE).toEqual(OPCOES_DE_MOTIVO_DA_TRAVA);
    expect(OPCOES_DO_DESTRAVE).toHaveLength(4);
    for (const o of OPCOES_DO_DESTRAVE) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.label).not.toContain(TRAVESSAO);
    }
  });

  it("a RECUSA com status 200 tem frase própria: não deu erro não quer dizer que destravou", () => {
    expect(FRASE_DESTRAVE_RECUSADO).toContain("Não destravamos");
    expect(FRASE_DESTRAVE_RECUSADO).not.toContain(TRAVESSAO);
    expect(FRASE_TRAVA_SUMIU).not.toContain(TRAVESSAO);
  });

  it("a recusa é explicada como TELA VELHA, não como erro de quem clicou", () => {
    // Os três casos de recusa têm a mesma causa prática: a fila mudou depois do carregamento. Dizer
    // "motivo inválido" jogaria em quem clicou a culpa de um dado que a tela entregou desatualizado.
    expect(FRASE_DESTRAVE_RECUSADO).toContain("a fila mudou");
    expect(FRASE_DESTRAVE_RECUSADO).toContain("atualizar");
    expect(FRASE_DESTRAVE_RECUSADO.toLowerCase()).not.toContain("inválido");
    expect(FRASE_TRAVA_SUMIU).toContain("não está mais na fila");
  });
});
