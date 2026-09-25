import { describe, expect, it } from "vitest";
import { ESTADOS_PASSO_PORTAL } from "@ea/shared-types";
import type { PassoDaTrilhaPortal, TentativasDaPendencia } from "@ea/shared-types";
import {
  estadoDaCasa,
  podeEnviar,
  proximoPasso,
  resumoFinal,
  validarArquivo,
  type Visita,
} from "./portal-trilha";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO E ANTES DO CÓDIGO (§A.40 regra 2).
 *
 * O QUE ESTE ARQUIVO MEDE: a régua PURA que a tela do Portal (a trilha da Sol) vai consumir, em
 * `portal-trilha.ts`. Quem escreve o módulo é outro agente; este arquivo não o cria e não o
 * conserta, ele diz o que o módulo terá de fazer. Rodado agora, FALHA por módulo inexistente, e
 * isso é o esperado.
 *
 * POR QUE A RÉGUA TEM DE SER PURA E TESTADA SOZINHA. O tabuleiro tem três fontes de verdade
 * misturadas na mesma casa: o ESTADO DO SERVIDOR (cinco valores, contrato
 * `ESTADOS_PASSO_PORTAL`), a POSIÇÃO do candidato (qual casa ele está olhando agora) e a MEMÓRIA
 * DA VISITA (o que ele pulou nesta sessão, que o servidor não guarda de propósito). Misturadas
 * dentro do componente, nenhuma das três é afirmável, e o defeito aparece como cor errada na tela
 * do candidato, que é onde ninguém consegue reproduzir.
 *
 * ┌─ A DIVISÃO QUE ORGANIZA TODO ESTE ARQUIVO: QUEM AGE NA CASA ───────────────────────────────┐
 * │ CASAS DO CANDIDATO (ele age agora): `PENDENTE` e `AJUSTAR`. Só elas aceitam envio, só elas  │
 * │ entram no avanço e só elas podem ser puladas.                                               │
 * │ CASAS QUE NÃO SÃO DELE: `ACEITO` (pronto), `EM_ANALISE` (já enviou, ninguém julgou) e        │
 * │ `NO_TIME` (o teto caiu, quem resolve é o consultor). Nenhuma aceita envio, nenhuma entra no  │
 * │ avanço, e nenhuma muda de cor por causa da visita.                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS CINCO DEFEITOS QUE ESTE ARQUIVO EXISTE PARA PEGAR, todos plausíveis em quem implementa:
 *  1. o pulado sobrepor o aceito. O candidato pula uma casa, o documento dela chega a ser aceito
 *     (ou já estava), e a casa volta amarela pedindo envio de um documento que o servidor já tem.
 *     A precedência é do SERVIDOR, sempre, e a visita só pinta o que continua sendo dele.
 *  2. `EM_ANALISE` convidar a enviar. Este é o veto da auditoria prévia, e é o motivo de o enum ter
 *     cinco valores: a régua do arquivo único barra segundo envio enquanto há um em aberto, então
 *     casa que convida a enviar promete o que a emissão recusa no toque.
 *  3. o NO_TIME travar a trilha. A casa que caiu para o time não aceita mais envio do candidato,
 *     e quem a tratar como "a resolver" prende a pessoa numa casa que ela não tem como resolver.
 *  4. pular virar beco. Pular é "não tenho agora", não é desistir: a casa tem de voltar a ser
 *     oferecida quando a trilha dá a volta, e o avanço só devolve nulo quando de fato não resta
 *     nada que o candidato possa fazer.
 *  5. a validação de arquivo divergir do servidor. A tela recusa ANTES de gastar uma credencial,
 *     então ela usa os MESMOS números de `domain/portal-credencial.ts` (10 MB, pdf, jpeg, png).
 *     Recusar a 9 MB é impedir envio legítimo; aceitar a 11 MB é gastar tentativa do candidato
 *     para colher um erro do armazenamento.
 *
 * §A.6: nenhum dado pessoal aqui. Código de tipo de documento, nome de catálogo e bytes.
 * §A.11: nenhum travessão, e a mensagem de recusa também é conferida contra isso.
 */

/** O glifo proibido pela §A.11, escrito por codigo para nao entrar no fonte. */
const TRAVESSAO = String.fromCharCode(0x2014);

const MB = 1024 * 1024;
const BYTES_MAX = 10 * MB;

function tentativas(parcial: Partial<TentativasDaPendencia> = {}): TentativasDaPendencia {
  const teto = parcial.teto ?? 3;
  const usadas = parcial.usadas ?? 0;
  return {
    teto,
    usadas,
    restantes: parcial.restantes ?? Math.max(0, teto - usadas),
    noTime: parcial.noTime ?? false,
    aviso: parcial.aviso ?? null,
  };
}

function casa(
  codigoTipoDocumento: string,
  estado: PassoDaTrilhaPortal["estado"],
  parcial: Partial<PassoDaTrilhaPortal> = {},
): PassoDaTrilhaPortal {
  return {
    codigoTipoDocumento,
    nome: parcial.nome ?? codigoTipoDocumento,
    exigencia: parcial.exigencia ?? "OBRIGATORIO",
    estado,
    tentativas:
      parcial.tentativas ??
      (estado === "NO_TIME"
        ? tentativas({ usadas: 3, restantes: 0, noTime: true })
        : estado === "AJUSTAR"
          ? tentativas({ usadas: 1 })
          : tentativas()),
    // O campo é obrigatório no contrato, e a casa fabricada nasce SEM dica: estes testes são da
    // navegação da trilha, e nenhum deles fala de dica. Quem quiser uma passa pelo `parcial`.
    dica: parcial.dica ?? null,
    // Idem para a conferência da IA: obrigatória no contrato, nula por padrão nestes testes de
    // navegação. Quem exercita "conferir"/"ajustar" a passa pelo `parcial`.
    conferencia: parcial.conferencia ?? null,
  };
}

/** A visita começa vazia sempre: pular não sobrevive ao fechar a aba, por desenho do contrato. */
const visitaNova = (): Visita => ({ pulados: new Set<string>() });
const visitaCom = (...codigos: string[]): Visita => ({ pulados: new Set(codigos) });

describe("O CONTRATO TEM SEIS ESTADOS, e a tela trata os seis", () => {
  it("nenhum estado do contrato cai num caminho não previsto pela régua da tela", () => {
    const permitidos = [
      "ACEITO",
      "EM_ANALISE",
      "AGUARDANDO_VALIDACAO",
      "AJUSTAR",
      "ATUAL",
      "PULADO",
      "NO_TIME",
      "PENDENTE",
    ];
    for (const estado of ESTADOS_PASSO_PORTAL) {
      const pintura = estadoDaCasa(casa("RG", estado), false, visitaNova());
      expect(permitidos, `estado ${estado} pintou como ${pintura}`).toContain(pintura);
    }
  });

  it("só as casas DO CANDIDATO aceitam envio: pendente e ajustar, e mais nenhuma", () => {
    const aceitaEnvio = ESTADOS_PASSO_PORTAL.filter((estado) => podeEnviar(casa("RG", estado)));
    expect([...aceitaEnvio].sort()).toEqual(["AJUSTAR", "PENDENTE"]);
  });
});

describe("ACEITO tem precedência sobre tudo, inclusive sobre o que o candidato fez na visita", () => {
  it("casa aceita não vira ATUAL nem quando a trilha aponta para ela", () => {
    expect(estadoDaCasa(casa("RG", "ACEITO"), true, visitaNova())).toBe("ACEITO");
  });

  it("casa aceita não vira PULADO nem quando ela está na lista de pulados da visita", () => {
    expect(estadoDaCasa(casa("RG", "ACEITO"), false, visitaCom("RG"))).toBe("ACEITO");
  });

  it("casa aceita não pede envio: podeEnviar é falso", () => {
    expect(podeEnviar(casa("RG", "ACEITO"))).toBe(false);
  });

  it("casa aceita não é oferecida pelo avanço, mesmo sendo a única que resta", () => {
    const passos = [casa("RG", "ACEITO"), casa("CPF_DOC", "ACEITO")];
    expect(proximoPasso(passos, 0, visitaNova())).toBeNull();
  });
});

describe("EM_ANALISE não convida a enviar, e não trava a trilha (o veto da auditoria)", () => {
  it("podeEnviar é falso: já há um envio em aberto, e a emissão recusaria o segundo", () => {
    expect(podeEnviar(casa("RG", "EM_ANALISE"))).toBe(false);
  });

  it("nem com tentativa sobrando: o que barra aqui é o envio em aberto, não o teto", () => {
    const comFolga = casa("RG", "EM_ANALISE", { tentativas: tentativas({ usadas: 0 }) });
    expect(podeEnviar(comFolga)).toBe(false);
  });

  it("o estado do servidor vence a posição: casa em análise não vira ATUAL", () => {
    expect(estadoDaCasa(casa("RG", "EM_ANALISE"), true, visitaNova())).toBe("EM_ANALISE");
  });

  it("e não vira PULADO: pular o que já está com a gente é gesto sem efeito", () => {
    expect(estadoDaCasa(casa("RG", "EM_ANALISE"), false, visitaCom("RG"))).toBe("EM_ANALISE");
  });

  it("o avanço PULA a casa em análise e segue para a próxima que é do candidato", () => {
    const passos = [casa("RG", "PENDENTE"), casa("CTPS", "EM_ANALISE"), casa("COMP_RES", "PENDENTE")];
    expect(proximoPasso(passos, 0, visitaNova())).toBe(2);
  });

  it("trilha só com casas que não são dele não tem próximo passo", () => {
    const passos = [casa("RG", "ACEITO"), casa("CTPS", "EM_ANALISE"), casa("CPF_DOC", "NO_TIME")];
    expect(proximoPasso(passos, 0, visitaNova())).toBeNull();
  });
});

describe("AJUSTAR é a casa que PEDE reenvio, e ela é do candidato", () => {
  it("podeEnviar é verdadeiro: é justamente isso que a casa está pedindo", () => {
    expect(podeEnviar(casa("RG", "AJUSTAR"))).toBe(true);
  });

  it("sem visita e sem ser a atual, a casa se mostra como AJUSTAR, e não como pendente comum", () => {
    // A distinção é o que permite à tela dizer "corrija este" em vez de "envie este", e ela vem
    // pronta do servidor: refazer isso na tela seria a segunda verdade que o contrato evita.
    expect(estadoDaCasa(casa("RG", "AJUSTAR"), false, visitaNova())).toBe("AJUSTAR");
  });

  it("sendo a casa atual, a posição vence: ela é a que ele está resolvendo agora", () => {
    expect(estadoDaCasa(casa("RG", "AJUSTAR"), true, visitaNova())).toBe("ATUAL");
  });

  it("pulada, ela vira PULADO como qualquer casa dele: ajustar depois é escolha legítima", () => {
    expect(estadoDaCasa(casa("RG", "AJUSTAR"), false, visitaCom("RG"))).toBe("PULADO");
  });

  it("o avanço a oferece: ela é trabalho aberto do candidato", () => {
    const passos = [casa("RG", "ACEITO"), casa("CTPS", "AJUSTAR")];
    expect(proximoPasso(passos, 0, visitaNova())).toBe(1);
  });
});

describe("NO_TIME não aceita envio e NÃO trava a trilha", () => {
  it("podeEnviar é falso: quem resolve a casa agora é o time, não o candidato", () => {
    expect(podeEnviar(casa("CTPS", "NO_TIME"))).toBe(false);
  });

  it("o estado do servidor vence a posição: casa no time não vira ATUAL", () => {
    expect(estadoDaCasa(casa("CTPS", "NO_TIME"), true, visitaNova())).toBe("NO_TIME");
  });

  it("o avanço PULA a casa no time e segue para a próxima pendente", () => {
    const passos = [casa("RG", "PENDENTE"), casa("CTPS", "NO_TIME"), casa("COMP_RES", "PENDENTE")];
    expect(proximoPasso(passos, 0, visitaNova())).toBe(2);
  });

  it("trilha só com aceito e no time não tem próximo passo: o candidato terminou a parte dele", () => {
    const passos = [casa("RG", "ACEITO"), casa("CTPS", "NO_TIME")];
    expect(proximoPasso(passos, 0, visitaNova())).toBeNull();
  });

  it("pendente com o teto batido no contador também não aceita envio", () => {
    // Estado e contador discordando é inconsistência do servidor, e a tela cai para o lado seguro:
    // oferecer o envio aqui gastaria o gesto do candidato para colher recusa da rota.
    const inconsistente = casa("RG", "PENDENTE", {
      tentativas: tentativas({ usadas: 3, restantes: 0, noTime: true }),
    });
    expect(podeEnviar(inconsistente)).toBe(false);
  });

  it("ajustar sem tentativa restante também não aceita envio", () => {
    const semFolga = casa("RG", "AJUSTAR", {
      tentativas: tentativas({ usadas: 3, restantes: 0, noTime: true }),
    });
    expect(podeEnviar(semFolga)).toBe(false);
  });

  it("pendente com tentativa restante aceita envio", () => {
    expect(podeEnviar(casa("RG", "PENDENTE", { tentativas: tentativas({ usadas: 2 }) }))).toBe(true);
  });
});

describe("PULAR não trava: a casa volta a ser oferecida quando a trilha dá a volta", () => {
  it("pulou a casa atual, o avanço entrega a próxima que é dele", () => {
    const passos = [casa("RG", "PENDENTE"), casa("CPF_DOC", "PENDENTE")];
    expect(proximoPasso(passos, 0, visitaCom("RG"))).toBe(1);
  });

  it("a casa pulada é pintada de pulado enquanto o candidato não volta nela", () => {
    expect(estadoDaCasa(casa("RG", "PENDENTE"), false, visitaCom("RG"))).toBe("PULADO");
  });

  it("dando a volta, a pulada é oferecida de novo em vez de virar beco sem saída", () => {
    const passos = [casa("RG", "PENDENTE"), casa("CPF_DOC", "PENDENTE")];
    // As duas foram puladas. Estando na última, o avanço volta ao começo em vez de devolver nulo.
    expect(proximoPasso(passos, 1, visitaCom("RG", "CPF_DOC"))).toBe(0);
  });

  it("a não pulada tem preferência sobre a pulada: primeiro o que ele ainda não viu", () => {
    const passos = [
      casa("RG", "PENDENTE"),
      casa("CPF_DOC", "AJUSTAR"),
      casa("COMP_RES", "PENDENTE"),
    ];
    // Estando na 2, a 0 foi pulada e a 1 não. A volta oferece a 1 antes de reoferecer a 0.
    expect(proximoPasso(passos, 2, visitaCom("RG"))).toBe(1);
  });

  it("nada restando a fazer, o avanço devolve nulo em vez de girar para sempre", () => {
    const passos = [casa("RG", "ACEITO"), casa("CTPS", "NO_TIME"), casa("CPF_DOC", "EM_ANALISE")];
    expect(proximoPasso(passos, 1, visitaCom("RG", "CTPS", "CPF_DOC"))).toBeNull();
  });

  it("a casa atual e pendente não é pintada de pulado só porque foi pulada antes de voltar nela", () => {
    expect(estadoDaCasa(casa("RG", "PENDENTE"), true, visitaCom("RG"))).toBe("ATUAL");
  });

  it("pendente que ele nunca visitou fica cinza, não amarela", () => {
    expect(estadoDaCasa(casa("RG", "PENDENTE"), false, visitaNova())).toBe("PENDENTE");
  });

  it("trilha vazia não tem próximo passo, e não estoura", () => {
    expect(proximoPasso([], 0, visitaNova())).toBeNull();
  });
});

describe("VOLTAR PELO MESMO LINK preserva o que já foi aceito", () => {
  const passos = [
    casa("RG", "ACEITO"),
    casa("CPF_DOC", "PENDENTE"),
    casa("CTPS", "NO_TIME"),
    casa("COMP_RES", "AJUSTAR"),
  ];

  it("visita nova (aba fechada e reaberta): o aceito continua aceito", () => {
    expect(estadoDaCasa(passos[0], false, visitaNova())).toBe("ACEITO");
  });

  it("visita nova: o aceito não volta para a contagem de pendentes", () => {
    const resumo = resumoFinal(passos, visitaNova());
    expect(resumo.aceitos).toBe(1);
    expect(resumo.pendentes).toBe(2);
  });

  it("visita nova: o pulado zera, porque pular é memória da sessão e não fato do processo", () => {
    expect(resumoFinal(passos, visitaNova()).pulados).toBe(0);
  });

  it("visita nova: o avanço começa pela primeira casa dele, não pela casa zero", () => {
    expect(proximoPasso(passos, 0, visitaNova())).toBe(1);
  });
});

describe("validarArquivo usa os MESMOS números do servidor, e recusa falando com a pessoa", () => {
  const arquivo = (type: string, size: number) => ({ type, size });

  it("aceita os três tipos do contrato", () => {
    expect(validarArquivo(arquivo("application/pdf", 1 * MB))).toEqual({ ok: true });
    expect(validarArquivo(arquivo("image/jpeg", 1 * MB))).toEqual({ ok: true });
    expect(validarArquivo(arquivo("image/png", 1 * MB))).toEqual({ ok: true });
  });

  it("10 MB cravados CABEM: o limite é inclusivo, igual ao do servidor", () => {
    expect(validarArquivo(arquivo("application/pdf", BYTES_MAX))).toEqual({ ok: true });
  });

  it("10 MB mais um byte NÃO cabem", () => {
    expect(validarArquivo(arquivo("application/pdf", BYTES_MAX + 1)).ok).toBe(false);
  });

  it("a recusa por tamanho traz mensagem e ela fala de tamanho, não devolve código seco", () => {
    const r = validarArquivo(arquivo("image/png", 25 * MB));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("esperava recusa");
    expect(r.mensagem.trim().length).toBeGreaterThan(10);
    expect(r.mensagem.toLowerCase()).toMatch(/10\s*mb|tamanho|grande/);
  });

  it("recusa tipo fora da lista, com mensagem", () => {
    for (const tipo of ["application/zip", "image/heic", "text/plain", "application/msword", ""]) {
      const r = validarArquivo(arquivo(tipo, 1 * MB));
      expect(r.ok, `tipo ${tipo || "vazio"} deveria ser recusado`).toBe(false);
      if (r.ok) throw new Error("esperava recusa");
      expect(r.mensagem.trim().length).toBeGreaterThan(10);
    }
  });

  it("arquivo vazio é recusado: zero byte não é documento", () => {
    expect(validarArquivo(arquivo("application/pdf", 0)).ok).toBe(false);
  });

  it("§A.11: nenhuma mensagem de recusa usa travessão", () => {
    const recusas = [
      validarArquivo(arquivo("application/pdf", BYTES_MAX + 1)),
      validarArquivo(arquivo("application/zip", 1 * MB)),
      validarArquivo(arquivo("application/pdf", 0)),
    ];
    for (const r of recusas) {
      if (r.ok) throw new Error("esperava recusa");
      expect(r.mensagem).not.toContain(TRAVESSAO);
    }
  });
});

describe("resumoFinal conta cada casa UMA vez, na mistura real", () => {
  const passos = [
    casa("RG", "ACEITO"),
    casa("CPF_DOC", "ACEITO"),
    casa("CTPS", "NO_TIME"),
    casa("COMP_RES", "PENDENTE"),
    casa("TITULO", "PENDENTE"),
    casa("RESERVISTA", "AJUSTAR", { exigencia: "FACULTATIVO" }),
  ];
  const visita = visitaCom("COMP_RES", "RESERVISTA");

  it("cada balde com o seu número", () => {
    expect(resumoFinal(passos, visita)).toEqual({
      aceitos: 2,
      pulados: 2,
      noTime: 1,
      pendentes: 1,
    });
  });

  it("a soma dos baldes é o total de casas: ninguém é contado duas vezes nem esquecido", () => {
    const r = resumoFinal(passos, visita);
    expect(r.aceitos + r.pulados + r.noTime + r.pendentes).toBe(passos.length);
  });

  it("EM_ANALISE conta como trabalho em aberto, e a soma continua fechando", () => {
    // Ela não é aceita, não caiu para o time e não é pulável: fica no balde do que falta terminar.
    const comAnalise = [casa("RG", "ACEITO"), casa("CTPS", "EM_ANALISE"), casa("CPF_DOC", "PENDENTE")];
    const r = resumoFinal(comAnalise, visitaNova());
    expect(r.aceitos).toBe(1);
    expect(r.noTime).toBe(0);
    expect(r.pulados).toBe(0);
    expect(r.pendentes).toBe(2);
    expect(r.aceitos + r.pulados + r.noTime + r.pendentes).toBe(comAnalise.length);
  });

  it("pular uma casa NO_TIME não a move para o balde de pulados", () => {
    // Pular o que já caiu para o time é gesto sem efeito, e contá-lo como pulado faria o resumo
    // dizer ao candidato que sobrou trabalho dele onde não sobrou.
    const r = resumoFinal(passos, visitaCom("CTPS"));
    expect(r.noTime).toBe(1);
    expect(r.pulados).toBe(0);
  });

  it("pular uma casa ACEITA não a move para o balde de pulados", () => {
    const r = resumoFinal(passos, visitaCom("RG"));
    expect(r.aceitos).toBe(2);
    expect(r.pulados).toBe(0);
  });

  it("pular uma casa EM_ANALISE não a move para o balde de pulados", () => {
    const comAnalise = [casa("RG", "EM_ANALISE"), casa("CPF_DOC", "PENDENTE")];
    const r = resumoFinal(comAnalise, visitaCom("RG"));
    expect(r.pulados).toBe(0);
    expect(r.pendentes).toBe(2);
  });

  it("trilha vazia devolve tudo zerado em vez de estourar", () => {
    expect(resumoFinal([], visitaNova())).toEqual({
      aceitos: 0,
      pulados: 0,
      noTime: 0,
      pendentes: 0,
    });
  });

  it("código pulado que não existe na trilha é ignorado, e não vira contagem fantasma", () => {
    const r = resumoFinal(passos, visitaCom("NAO_EXISTE"));
    expect(r.aceitos + r.pulados + r.noTime + r.pendentes).toBe(passos.length);
    expect(r.pulados).toBe(0);
  });
});

describe("a exigência da régua atravessa sem a tela reinterpretar", () => {
  it("facultativo pendente continua pendente: quem decide a régua é o servidor (§A.3 regra 4)", () => {
    const facultativo = casa("RESERVISTA", "PENDENTE", { exigencia: "FACULTATIVO" });
    expect(estadoDaCasa(facultativo, false, visitaNova())).toBe("PENDENTE");
    expect(podeEnviar(facultativo)).toBe(true);
  });

  it("o avanço não salta o facultativo: pular ou não é escolha do candidato, não da tela", () => {
    const passos = [
      casa("RG", "ACEITO"),
      casa("RESERVISTA", "PENDENTE", { exigencia: "FACULTATIVO" }),
    ];
    expect(proximoPasso(passos, 0, visitaNova())).toBe(1);
  });
});
