import { describe, expect, it } from "vitest";
import type { LinhaDoPainelPortal } from "@ea/shared-types";
import { SEM_ORIGEM_DE_ENVIO } from "@ea/shared-types";
import {
  ROTULO_DA_ORIGEM,
  ROTULO_DO_LINK,
  acaoDoLink,
  concluiu,
  contarFiltros,
  formatarDataAdmissao,
  formatarDataHora,
  identificadorDoLink,
  camposDoDetalhe,
  linkDaLinha,
  queryDoPainel,
  rankSituacao,
  rotaBloquear,
  rotaDesbloquear,
  rotuloDaOrigem,
  semRegua,
  situacaoDaLinha,
  tituloDoProgresso,
} from "./portal-painel";

function linha(p: Partial<LinhaDoPainelPortal> = {}): LinhaDoPainelPortal {
  return {
    admissaoId: "adm-1",
    nome: "fulano de tal",
    cargo: "Operador",
    cliente: "Cliente A",
    dataAdmissao: "2026-09-20",
    // O `jti` do link vigente entrou no contrato como obrigatório (pode ser `null`, nunca ausente):
    // é ele que as ações de bloquear e desbloquear endereçam, e o campo ausente faria a tela mandar
    // o `admissaoId` num parâmetro lido como `jti`, que passa no `ParseUUIDPipe` e erra calado.
    linkJti: "lnk-1",
    documentoAtual: "RG",
    aceitos: 2,
    obrigatorios: 7,
    noTime: false,
    ultimoAcessoEm: "2026-09-19T12:00:00.000Z",
    estadoLink: "VIVO",
    origemEnvio: "AUTOMATICO",
    ...p,
  };
}

describe("estado do link", () => {
  it("BLOQUEADO e SUSPENSO são etiquetas DIFERENTES: uma o time desfaz, a outra passa sozinha", () => {
    expect(ROTULO_DO_LINK.BLOQUEADO.label).toBe("Bloqueado");
    expect(ROTULO_DO_LINK.SUSPENSO.label).toBe("Acesso Bloqueado Temporariamente");
    expect(ROTULO_DO_LINK.BLOQUEADO.label).not.toBe(ROTULO_DO_LINK.SUSPENSO.label);
  });

  it("estado fora do catálogo vira etiqueta neutra em vez de derrubar a tabela", () => {
    expect(linkDaLinha("ALGO_NOVO").label).toBe("Não Informado");
    expect(linkDaLinha("ALGO_NOVO").rank).toBe(9);
  });

  it("nenhum rótulo de link tem travessão (§A.11)", () => {
    for (const r of Object.values(ROTULO_DO_LINK)) expect(r.label).not.toContain("—");
  });

  it("só VIVO bloqueia e só BLOQUEADO desbloqueia", () => {
    expect(acaoDoLink("VIVO")).toBe("bloquear");
    expect(acaoDoLink("BLOQUEADO")).toBe("desbloquear");
  });

  it("link morto ou suspenso NÃO oferece botão: bloquear o que não abre é teatro", () => {
    expect(acaoDoLink("VENCIDO")).toBeNull();
    expect(acaoDoLink("REVOGADO")).toBeNull();
    // SUSPENSO é do sistema e passa sozinho: não se desfaz por botão.
    expect(acaoDoLink("SUSPENSO")).toBeNull();
  });
});

describe("identificador do link", () => {
  it("é o `jti` do link vigente, e SÓ ele", () => {
    expect(identificadorDoLink(linha({ linkJti: "lnk-9" }))).toBe("lnk-9");
  });

  it("sem link vivo devolve nulo: NÃO cai no admissaoId", () => {
    // Os dois são UUID e o `ParseUUIDPipe` aceitaria o `admissaoId`: a reserva antiga agiria em
    // silêncio sobre um link que não é aquele. Sem `jti`, não há o que bloquear.
    expect(identificadorDoLink(linha({ linkJti: null }))).toBeNull();
  });
});

describe("situação da linha", () => {
  it("régua vazia NÃO é coleta concluída: ela tem rótulo próprio", () => {
    const l = linha({ aceitos: 0, obrigatorios: 0 });
    expect(semRegua(l)).toBe(true);
    expect(concluiu(l)).toBe(false);
    expect(situacaoDaLinha(l).label).toBe("Sem Régua");
    // E o título não afirma entrega nenhuma.
    expect(tituloDoProgresso(l)).toContain("não exige nenhum documento");
  });

  it("entregou tudo mas nunca acessou NÃO é concluído (mesma régua do card)", () => {
    const l = linha({ aceitos: 7, obrigatorios: 7, ultimoAcessoEm: null });
    expect(concluiu(l)).toBe(false);
    expect(situacaoDaLinha(l).label).toBe("Não Acessou");
  });

  it("acessou e entregou tudo é Concluiu, com check", () => {
    const l = linha({ aceitos: 7, obrigatorios: 7 });
    expect(situacaoDaLinha(l)).toMatchObject({ label: "Concluiu", icone: "check" });
  });

  it("quem espera gente vai para o topo da fila de trabalho", () => {
    expect(rankSituacao(linha({ noTime: true }))).toBe(0);
    expect(rankSituacao(linha({ aceitos: 7, obrigatorios: 7 }))).toBe(3);
    expect(rankSituacao(linha({ aceitos: 0, obrigatorios: 0 }))).toBe(4);
  });

  it("o título do progresso conta a régua, e a porcentagem bate", () => {
    expect(tituloDoProgresso(linha({ aceitos: 1, obrigatorios: 4 }))).toContain("25% da régua");
  });
});

describe("o recorte do card foi para o SERVIDOR", () => {
  // Estes testes substituem os do `noRecorte`, que foi APAGADO. Ele filtrava no cliente sobre o
  // que a aba já tinha cortado (o card dizia "Acessaram 2" e a tabela zerava) e, acima de 100
  // encaminhados, passaria a recortar só a primeira página em silêncio (§A.28).
  it("o card VIAJA como parâmetro `recorte`", () => {
    const q = new URLSearchParams(queryDoPainel({ recorte: "acessaram" }));
    expect(q.get("recorte")).toBe("acessaram");
  });

  it("COM RECORTE A ABA NÃO VIAJA: mandar os dois devolveria a interseção, que era o defeito", () => {
    const q = new URLSearchParams(queryDoPainel({ aba: "EM_ANDAMENTO", recorte: "acessaram" }));
    expect(q.has("aba")).toBe(false);
    expect(q.get("recorte")).toBe("acessaram");
  });

  it("sem recorte, a aba volta a mandar", () => {
    const q = new URLSearchParams(queryDoPainel({ aba: "CONCLUIDO", recorte: "" }));
    expect(q.get("aba")).toBe("CONCLUIDO");
    expect(q.has("recorte")).toBe(false);
  });

  it("o recorte NÃO conta no badge de filtros: ele tem indicação própria e sai no próprio card", () => {
    expect(contarFiltros({ recorte: "concluiram" })).toBe(0);
  });
});

describe("a origem do envio (a coluna nova)", () => {
  it("cada origem tem rótulo em Title Case (§A.24)", () => {
    expect(rotuloDaOrigem("AUTOMATICO")).toBe("Automático");
    expect(rotuloDaOrigem("MANUAL")).toBe("Manual");
    expect(rotuloDaOrigem("ENTREGA_A_MAO")).toBe("Entrega À Mão");
  });

  it('link antigo, SEM origem, diz "não informado" e NUNCA traço (§A.11)', () => {
    expect(rotuloDaOrigem(null)).toBe("não informado");
    expect(rotuloDaOrigem(undefined)).toBe("não informado");
    for (const r of Object.values(ROTULO_DA_ORIGEM)) expect(r).not.toContain("—");
  });

  it("a opção do filtro para quem está sem origem DIZ O MESMO que a célula", () => {
    // Duas palavras para o mesmo estado ("Sem Origem" no filtro, "não informado" na célula) é o
    // começo de uma pergunta de suporte: quem lê a célula procura o filtro com aquela palavra.
    expect(ROTULO_DA_ORIGEM[SEM_ORIGEM_DE_ENVIO].toLowerCase()).toBe("não informado");
  });

  it("código fora do catálogo aparece cru em vez de sumir da célula", () => {
    expect(rotuloDaOrigem("ALGO_NOVO")).toBe("ALGO_NOVO");
  });

  it("o filtro de origem viaja como lista, e vazio NÃO viaja (§A.28)", () => {
    expect(
      new URLSearchParams(queryDoPainel({ origens: ["MANUAL", "__SEM_ORIGEM"] })).get("origens"),
    ).toBe("MANUAL,__SEM_ORIGEM");
    expect(new URLSearchParams(queryDoPainel({ origens: [] })).has("origens")).toBe(false);
  });

  it("ele conta no badge de filtros, como os demais", () => {
    expect(contarFiltros({ origens: ["MANUAL"] })).toBe(1);
  });
});

describe("a ficha do olho (o modal de leitura)", () => {
  it("são os NOVE campos da linha, e o nome NÃO entra na lista (ele é o título)", () => {
    const rotulos = camposDoDetalhe(linha()).map((c) => c.rotulo);
    expect(rotulos).toEqual([
      "Cliente",
      "Cargo",
      "Data De Admissão",
      "Situação",
      "Documento Atual",
      "Progresso Da Régua",
      "Último Acesso",
      "Estado Do Link",
      "Origem Do Envio",
    ]);
    expect(rotulos).not.toContain("Candidato");
  });

  it("§A.6: NUNCA CPF, NUNCA e-mail, NUNCA telefone, NUNCA a URL do link", () => {
    // A varredura é sobre o resultado INTEIRO, rótulos e valores, e é ela que pega o dia em que
    // alguém acrescentar "só mais um campinho" à ficha.
    const texto = JSON.stringify(
      camposDoDetalhe(
        linha({
          // Campos que NÃO existem no contrato, postos aqui de propósito: se um dia alguém os
          // acrescentar à linha e a ficha começar a copiá-los, este teste cai.
          ...({
            cpf: "123.456.789-09",
            email: "fulano@empresa.com",
            telefone: "11999998888",
          } as object),
        }),
      ),
    ).toLowerCase();
    expect(texto).not.toContain("cpf");
    expect(texto).not.toContain("@");
    expect(texto).not.toContain("telefone");
    expect(texto).not.toContain("http");
    expect(texto).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  });

  it("régua vazia diz 'nada a enviar' e NÃO '0 de 0 aceitos', que afirmaria entrega", () => {
    const vazia = camposDoDetalhe(linha({ aceitos: 0, obrigatorios: 0 }));
    expect(vazia.find((c) => c.rotulo === "Progresso Da Régua")?.valor).toBe("nada a enviar");
    expect(camposDoDetalhe(linha()).find((c) => c.rotulo === "Progresso Da Régua")?.valor).toBe(
      "2 de 7 aceitos",
    );
  });

  it("quem nunca acessou mostra 'não informado', e isso não é defeito (§A.11)", () => {
    const f = camposDoDetalhe(linha({ ultimoAcessoEm: null }));
    expect(f.find((c) => c.rotulo === "Último Acesso")?.valor).toBe("não informado");
  });

  it("só Situação e Estado Do Link são etiqueta: o resto é texto", () => {
    const comTom = camposDoDetalhe(linha())
      .filter((c) => c.tom)
      .map((c) => c.rotulo);
    expect(comTom).toEqual(["Situação", "Estado Do Link"]);
  });

  it("nenhum rótulo nem valor da ficha tem travessão (§A.11)", () => {
    for (const c of camposDoDetalhe(linha({ origemEnvio: null }))) {
      expect(c.rotulo).not.toContain("—");
      expect(c.valor).not.toContain("—");
    }
  });
});

describe("a query da lista", () => {
  it("manda a aba e os filtros múltiplos separados por vírgula", () => {
    const q = new URLSearchParams(
      queryDoPainel({
        aba: "CONCLUIDO",
        clientes: ["C1", "C2"],
        estadosLink: ["VIVO", "BLOQUEADO"],
        nome: "  maria  ",
        dataAdmissaoDe: "2026-09-01",
        pagina: 2,
        tamanho: 100,
      }),
    );
    expect(q.get("aba")).toBe("CONCLUIDO");
    expect(q.get("clientes")).toBe("C1,C2");
    expect(q.get("estadosLink")).toBe("VIVO,BLOQUEADO");
    expect(q.get("nome")).toBe("maria");
    expect(q.get("dataAdmissaoDe")).toBe("2026-09-01");
    expect(q.get("pagina")).toBe("2");
    expect(q.get("tamanho")).toBe("100");
  });

  it("FILTRO VAZIO NÃO VIAJA: parâmetro vazio vira um IN () que não casa com nada", () => {
    const q = new URLSearchParams(queryDoPainel({ clientes: [], nome: "   ", cargos: ["  "] }));
    expect(q.has("clientes")).toBe(false);
    expect(q.has("nome")).toBe(false);
    expect(q.has("cargos")).toBe(false);
  });

  it("NÃO existe parâmetro de CPF nesta tela (§A.6)", () => {
    const q = queryDoPainel({ aba: "EM_ANDAMENTO", nome: "maria" });
    expect(q.toLowerCase()).not.toContain("cpf");
  });
});

describe("contagem de filtros ativos (o badge)", () => {
  it("a ABA não conta: ela é onde a pessoa está, não um filtro", () => {
    expect(contarFiltros({ aba: "CONCLUIDO" })).toBe(0);
  });

  it("cada intervalo de data conta UMA vez, mesmo com as duas pontas", () => {
    expect(contarFiltros({ dataAdmissaoDe: "2026-09-01", dataAdmissaoAte: "2026-09-30" })).toBe(1);
  });

  it("soma lista, busca e os dois intervalos", () => {
    expect(
      contarFiltros({
        nome: "ana",
        clientes: ["C1"],
        cargos: ["X"],
        ultimoAcessoDe: "2026-09-01",
        dataAdmissaoAte: "2026-09-30",
      }),
    ).toBe(5);
  });
});

describe("datas", () => {
  it("data de admissão NÃO passa por new Date: aaaa-mm-dd não pode virar o dia anterior", () => {
    expect(formatarDataAdmissao("2026-09-20")).toBe("20/09/2026");
    expect(formatarDataAdmissao("2026-01-01")).toBe("01/01/2026");
  });

  it('sem data, o marcador é "não informado" e nunca o traço (§A.11)', () => {
    expect(formatarDataAdmissao(null)).toBe("não informado");
    expect(formatarDataAdmissao("")).toBe("não informado");
    expect(formatarDataAdmissao("lixo")).toBe("não informado");
    expect(formatarDataHora(null)).toBe("não informado");
    expect(formatarDataHora("lixo")).toBe("não informado");
  });
});

describe("as rotas do bloqueio", () => {
  // Elas são montadas em um lugar só, com o `jti`, e o teste existe para o dia em que alguém
  // "simplificar" trocando o parâmetro: o backend lê `:jti`, e `admissaoId` também é UUID.
  it("bloquear e desbloquear endereçam o LINK, pelo jti", () => {
    expect(rotaBloquear("lnk-9")).toBe("/portal/links/lnk-9/bloquear");
    expect(rotaDesbloquear("lnk-9")).toBe("/portal/links/lnk-9/desbloquear");
  });
});
