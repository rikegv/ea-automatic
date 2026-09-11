import { describe, expect, it } from "vitest";
import {
  CANDIDATURA_SITUACOES,
  VAGA_STATUS_SEMENTE,
  ehSaidaSemExito,
  finalizaPosicao,
} from "@ea/shared-types";
import {
  POSICAO_LADOS,
  fraseDoAceite,
  rotuloDoLado,
  ladoDoCilindro,
  metaDoLado,
  oficiaisAbertas,
  podeAprovar,
  podeDecidir,
  podeFinalizarPosicao,
  podeMoverNoFunil,
  podeReverterEnvio,
  preenchidasDoLado,
  vagaRecebeCandidato,
  type VagaAcoes,
} from "@/lib/as-vaga-acoes";

/**
 * A VAGA DE TESTE: 5 posições oficiais e 20 de banco, que é a vaga real da homologação e o caso em que
 * a contagem única errava dos dois jeitos ao mesmo tempo.
 */
function vaga(over: Partial<VagaAcoes> = {}): VagaAcoes {
  return {
    status: "ABERTA",
    posicoesOficiais: 5,
    posicoesBanco: 20,
    vagasFechadas: null,
    vagasFechadasBanco: null,
    ocupacao: {
      vagaId: "v1",
      posicoesOficiais: 5,
      ocupadas: 0,
      finalizadas: 0,
      finalizadasOficial: 0,
      finalizadasBanco: 0,
      livres: 5,
      emSelecao: 0,
      fora: 0,
      excedida: false,
      // Contagem do funil: a fixture não a exercita, e o mapa vazio é o estado real da vaga sem ninguém.
      porEtapa: {},
      porDesfecho: {},
    },
    ...over,
  };
}

describe("os dois lados da posição", () => {
  it("são exatamente OFICIAL e BANCO, na ordem do backend", () => {
    expect([...POSICAO_LADOS]).toEqual(["OFICIAL", "BANCO"]);
  });

  it("traduz para o nome que a régua do cilindro usa, sem cada chamada traduzir na mão", () => {
    expect(ladoDoCilindro("OFICIAL")).toBe("oficial");
    expect(ladoDoCilindro("BANCO")).toBe("banco");
  });

  it("cada lado lê a META dele: a do oficial pode ser nula, a de banco é sempre número", () => {
    expect(metaDoLado(vaga(), "OFICIAL")).toBe(5);
    expect(metaDoLado(vaga(), "BANCO")).toBe(20);
    expect(metaDoLado(vaga({ posicoesOficiais: null }), "OFICIAL")).toBeNull();
  });

  it("cada lado lê a CONTAGEM dele, e não o total somado", () => {
    const v = vaga({
      ocupacao: { ...vaga().ocupacao, finalizadas: 4, finalizadasOficial: 1, finalizadasBanco: 3 },
    });
    expect(preenchidasDoLado(v, "OFICIAL")).toBe(1);
    expect(preenchidasDoLado(v, "BANCO")).toBe(3);
  });

  it("na vaga ENCERRADA a contagem congela no número do fechamento, como no cilindro da tabela", () => {
    const v = vaga({ status: "FECHADA", vagasFechadas: 3, vagasFechadasBanco: 2 });
    expect(preenchidasDoLado(v, "OFICIAL")).toBe(3);
    expect(preenchidasDoLado(v, "BANCO")).toBe(2);
  });
});

describe("oficiaisAbertas (o aviso do banco dito antes do 409, com o MESMO número)", () => {
  it("é o `livres` do contrato, que é a meta oficial menos quem ocupa posição oficial", () => {
    expect(oficiaisAbertas(vaga())).toBe(5);
    expect(oficiaisAbertas(vaga({ ocupacao: { ...vaga().ocupacao, livres: 2 } }))).toBe(2);
  });

  it("é nulo na vaga sem meta oficial: não há posição oficial aberta a defender", () => {
    expect(oficiaisAbertas(vaga({ ocupacao: { ...vaga().ocupacao, livres: null } }))).toBeNull();
  });

  it("não quebra contra um backend antigo, que ainda não serve a ocupação", () => {
    expect(oficiaisAbertas(vaga({ ocupacao: undefined as unknown as VagaAcoes["ocupacao"] }))).toBeNull();
  });
});

describe("vagaRecebeCandidato (espelho da trava 2 do backend)", () => {
  /*
   * A LISTA SAIU DO VOCABULÁRIO E VIROU CATÁLOGO (onda B2), então os casos passam a ser escritos
   * contra a SEMENTE, que é a descrição do comportamento de hoje. Sem catálogo explícito a função
   * responde pelo catálogo corrente, que nasce sendo essa mesma semente: os dois modos concordam, e
   * é isso que faz a troca ser de FORMA e não de comportamento.
   */
  it("rascunho e aberta recebem: captar antes de publicar é trabalho legítimo", () => {
    expect(vagaRecebeCandidato("RASCUNHO")).toBe(true);
    expect(vagaRecebeCandidato("ABERTA")).toBe(true);
  });

  it("os três encerramentos NÃO recebem, inclusive ENTREGUE", () => {
    expect(vagaRecebeCandidato("ENTREGUE")).toBe(false);
    expect(vagaRecebeCandidato("FECHADA")).toBe(false);
    expect(vagaRecebeCandidato("CANCELADA")).toBe(false);
  });

  it("todo status do catálogo tem resposta: status novo não deixa a tela sem decisão", () => {
    for (const s of VAGA_STATUS_SEMENTE) {
      expect(typeof vagaRecebeCandidato(s.codigo)).toBe("boolean");
    }
  });

  /**
   * O CÓDIGO QUE A TELA NÃO CONHECE NÃO RECEBE, e o lado do erro é escolhido: esconder um botão que
   * o backend recusaria é barato; oferecer alocação numa vaga que talvez esteja pausada não é.
   */
  it("código fora do catálogo não recebe: o desconhecido erra para o lado seguro", () => {
    expect(vagaRecebeCandidato("STATUS_QUE_NAO_EXISTE")).toBe(false);
  });
});

describe("podeMoverNoFunil (a régua do diretor: O ALOCADO CONTINUA NO FUNIL)", () => {
  /*
   * ESTE BLOCO AFIRMAVA O CONTRÁRIO, e o registro fica: ele exigia
   * `podeMoverNoFunil(s) === (s === "ATIVO")`, cimentando como REQUISITO o que o próprio autor
   * documentou como DEFEITO do backend. Teste assim não protege a régua, protege o bug: quando a
   * régua certa chegasse, quem quebraria seria ele, e alguém "consertaria" a régua para o teste
   * passar. Ele passa a ser escrito contra a régua do DIRETOR, não contra o backend de ontem.
   */
  it("o ALOCADO se move: quem preencheu a posição não saiu do processo", () => {
    expect(podeMoverNoFunil("ALOCADO")).toBe(true);
  });

  it("o APROVADO se move: ele nem desfecho teve", () => {
    expect(podeMoverNoFunil("APROVADO")).toBe(true);
  });

  it("quem saiu SEM ÊXITO não se move: o caminho dele é a reentrada", () => {
    expect(podeMoverNoFunil("DESCARTADO")).toBe(false);
    expect(podeMoverNoFunil("DESISTIU")).toBe(false);
  });

  it("é o complemento exato da saída sem êxito, e não uma lista nova escrita aqui", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      expect(podeMoverNoFunil(s)).toBe(!ehSaidaSemExito(s));
    }
  });
});

describe("podeAprovar (a trava que continua exigindo EM SELEÇÃO)", () => {
  it("aprovar é oferecido só EM SELEÇÃO: aprovar um ALOCADO desfaria a posição entregue", () => {
    expect(podeAprovar("ATIVO")).toBe(true);
    expect(podeAprovar("ALOCADO")).toBe(false);
    expect(podeAprovar("APROVADO")).toBe(false);
    expect(podeAprovar("ENVIADO_PARA_ADMISSAO")).toBe(false);
  });

  it("aprovar NÃO acompanhou o funil, e a diferença é de propósito", () => {
    // O movimento de etapa é reversível clicando em outro card; aprovar por cima de um ALOCADO
    // DESFAZ a entrega da posição. As duas perguntas se separaram aqui, e continuam separadas.
    expect(podeMoverNoFunil("ALOCADO")).toBe(true);
    expect(podeAprovar("ALOCADO")).toBe(false);
  });
});

/*
 * ─ A LISTA DA PUBLICAÇÃO SAIU DAQUI (onda B2) ─────────────────────────────────────────────────
 *
 * `VAGA_STATUS_PUBLICACAO` era uma constante montada por EXCLUSÃO sobre o vocabulário fixo, e virou
 * `statusDePublicacao(catalogo)`, uma consulta ao flag `daTrilha`. Os casos que estavam aqui (não
 * oferece Fechada, não oferece Cancelada, não oferece Rascunho, oferece Aberta, é derivada e não
 * escrita à mão) NÃO foram perdidos: eles vivem agora em
 * `as-vaga-status-fonte-unica.comportamental.spec.ts`, escrito pelo `tester` ANTES do código, que
 * ainda acrescenta os dois casos que a lista fixa não tinha como cobrir (o status LIVRE novo marcado
 * `daTrilha` entra sozinho, e o `daTrilha` inativo sai).
 */

describe("podeDecidir (a porta do desfecho, que NÃO é a porta do movimento)", () => {
  it("o ALOCADO ainda decide, e é assim que ele chega em Enviado Para Admissão", () => {
    expect(podeDecidir("ALOCADO")).toBe(true);
    // AS DUAS CONCORDAM HOJE, e o par continua separado: elas espelham travas DIFERENTES do backend
    // (`registrarSaida` e `moverEtapa`), e concordar não é ser a mesma pergunta.
    expect(podeMoverNoFunil("ALOCADO")).toBe(true);
  });

  it("quem saiu sem êxito não decide mais nada: o caminho dele é a reentrada", () => {
    expect(podeDecidir("DESCARTADO")).toBe(false);
    expect(podeDecidir("DESISTIU")).toBe(false);
  });

  it("é o complemento exato da saída sem êxito, e não uma lista nova", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      expect(podeDecidir(s)).toBe(!ehSaidaSemExito(s));
    }
  });
});

describe("podeFinalizarPosicao (quem entrega posição, e quem já entregou)", () => {
  it("quem está em seleção ou aprovado entrega a posição", () => {
    expect(podeFinalizarPosicao("ATIVO")).toBe(true);
    expect(podeFinalizarPosicao("APROVADO")).toBe(true);
  });

  it("quem JÁ entregou não entrega de novo, e a régua é `finalizaPosicao`, não uma lista nova", () => {
    for (const s of CANDIDATURA_SITUACOES) {
      if (finalizaPosicao(s)) expect(podeFinalizarPosicao(s)).toBe(false);
    }
    expect(podeFinalizarPosicao("ALOCADO")).toBe(false);
    expect(podeFinalizarPosicao("ENVIADO_PARA_ADMISSAO")).toBe(false);
  });

  it("quem saiu sem êxito NÃO entrega posição: o caminho dele é a reentrada, com o motivo à vista", () => {
    expect(podeFinalizarPosicao("DESCARTADO")).toBe(false);
    expect(podeFinalizarPosicao("DESISTIU")).toBe(false);
  });

  it("toda situação do catálogo tem resposta, sem estado ficar sem régua", () => {
    for (const s of CANDIDATURA_SITUACOES) expect(typeof podeFinalizarPosicao(s)).toBe("boolean");
  });
});

describe("rotuloDoLado (o campo solto do histórico, que o contrato não tipa)", () => {
  it("traduz os dois lados conhecidos", () => {
    expect(rotuloDoLado("OFICIAL")).toBe("Posição Oficial");
    expect(rotuloDoLado("BANCO")).toBe("Posição De Banco");
  });

  it("valor desconhecido some da tela em vez de vazar em caixa alta", () => {
    expect(rotuloDoLado("RESERVA_TECNICA")).toBeNull();
    expect(rotuloDoLado(null)).toBeNull();
    expect(rotuloDoLado(undefined)).toBeNull();
  });

  it("todo lado do catálogo tem rótulo: lado novo não sai da tela em silêncio", () => {
    for (const l of POSICAO_LADOS) expect(rotuloDoLado(l)).not.toBeNull();
  });
});

describe("fraseDoAceite (a trilha que a tela PROMETIA e não mostrava)", () => {
  it("diz a guarda, o número e o TEMPO: o número é do instante da decisão", () => {
    const frase = fraseDoAceite("BANCO_COM_OFICIAIS_ABERTAS", 3);
    expect(frase).toContain("3 posições oficiais abertas");
    expect(frase).toContain("naquele momento");
  });

  it("concorda no singular", () => {
    expect(fraseDoAceite("BANCO_COM_OFICIAIS_ABERTAS", 1)).toContain("1 posição oficial aberta");
  });

  it("número ausente NÃO apaga o aceite: some só o pedaço que não foi guardado", () => {
    const frase = fraseDoAceite("BANCO_COM_OFICIAIS_ABERTAS", null);
    expect(frase).not.toBeNull();
    expect(frase).toContain("posição oficial aberta");
  });

  it("a reentrada tem frase própria, e ela nomeia a outra guarda", () => {
    expect(fraseDoAceite("REENTRADA", null)).toContain("já tinha sido encerrado");
  });

  /**
   * ─ A REABERTURA SEM ORIGEM, E ESTE TESTE NASCEU DE UM VETO DA AUDITORIA ──────────────────────
   *
   * O DEFEITO ERA INVISÍVEL E O TESTE ANTIGO O CARIMBAVA: `REABERTURA_SEM_ORIGEM` caía no
   * `return null`, e a asserção do "valor desconhecido" usava justamente esse valor, com o nome
   * `GUARDA_QUE_AINDA_NAO_EXISTE`. Ou seja, a suíte AFIRMAVA como correto o aceite que a onda
   * passou a gravar não aparecer em lugar nenhum. O valor desconhecido volta a ser um valor que de
   * fato não existe, e o aceite real ganha asserção própria.
   *
   * SEM A LINHA NOVA EM `fraseDoAceite`, os dois testes abaixo falham.
   */
  it("a reabertura sem origem tem frase, e sem ela o aceite fica invisível na ficha", () => {
    const frase = fraseDoAceite("REABERTURA_SEM_ORIGEM", null);
    expect(frase).not.toBeNull();
    expect(frase).toContain("não sabia");
  });

  /* A FRASE PRECISA DIZER QUE FOI UMA ESCOLHA, e não uma reversão: é a diferença entre os dois
     caminhos da reabertura, e é o que quem abrir a ficha daqui a seis meses tem de entender sem
     consultar o banco. */
  it("a frase diz que a volta foi ESCOLHA de quem reabriu, nunca reversão de um registro", () => {
    const frase = fraseDoAceite("REABERTURA_SEM_ORIGEM", null) as string;
    expect(frase).toContain("escolha nova");
    expect(frase).toContain("não a reversão");
    // Ela não pode prometer o que só o caminho COM origem entrega.
    expect(frase).not.toContain("exatamente");
  });

  /* O NÚMERO NÃO MUDA ESTA GUARDA: ela não tem contagem a congelar, ao contrário da do banco. */
  it("a reabertura ignora o número, que nesta guarda nasce nulo", () => {
    expect(fraseDoAceite("REABERTURA_SEM_ORIGEM", 7)).toBe(
      fraseDoAceite("REABERTURA_SEM_ORIGEM", null),
    );
  });

  it("linha SEM aceite não inventa frase, que é o caso da esmagadora maioria", () => {
    expect(fraseDoAceite(null, null)).toBeNull();
    expect(fraseDoAceite(undefined, 5)).toBeNull();
    // Um valor que REALMENTE não existe, e não mais o que a onda B3 passou a gravar.
    expect(fraseDoAceite("GUARDA_QUE_NUNCA_FOI_GRAVADA", 2)).toBeNull();
  });

  it("§A.11: nenhuma frase daqui usa travessão", () => {
    expect(fraseDoAceite("BANCO_COM_OFICIAIS_ABERTAS", 2)).not.toContain("—");
    expect(fraseDoAceite("REENTRADA", null)).not.toContain("—");
    expect(fraseDoAceite("REABERTURA_SEM_ORIGEM", null)).not.toContain("—");
  });
});

describe("podeReverterEnvio (o alvo ESTREITO do desfazer, espelho da régua do backend)", () => {
  it("quem está enviado para a admissão pode voltar: é o único caso que existe", () => {
    expect(podeReverterEnvio("ENVIADO_PARA_ADMISSAO")).toBe(true);
  });

  it("o ALOCADO não reverte, e é o erro caro que esta régua impede", () => {
    // Ele FINALIZA POSIÇÃO igual ao enviado, então uma régua escrita com `finalizaPosicao` diria
    // SIM aqui e abriria na tela uma segunda porta para desfazer alocação, sem motivo e sem passar
    // por lugar nenhum que conte posição.
    expect(finalizaPosicao("ALOCADO")).toBe(true);
    expect(podeReverterEnvio("ALOCADO")).toBe(false);
  });

  it("ninguém mais reverte: não foi um envio que pôs os outros onde estão", () => {
    expect(podeReverterEnvio("ATIVO")).toBe(false);
    expect(podeReverterEnvio("APROVADO")).toBe(false);
    expect(podeReverterEnvio("DESCARTADO")).toBe(false);
    expect(podeReverterEnvio("DESISTIU")).toBe(false);
  });

  it("toda situação do catálogo tem resposta, sem estado ficar sem régua", () => {
    for (const s of CANDIDATURA_SITUACOES) expect(typeof podeReverterEnvio(s)).toBe("boolean");
  });

  it("UMA situação só responde SIM: a régua é estreita por construção, e continua sendo", () => {
    // Situação nova nasce FORA do desfazer, que é o lado seguro: quem quiser incluí-la precisa
    // dizer o nome dela aqui e no backend, e este teste é o que cobra a decisão explícita.
    expect(CANDIDATURA_SITUACOES.filter(podeReverterEnvio)).toEqual(["ENVIADO_PARA_ADMISSAO"]);
  });
});
