import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { asCandidaturaEntrevistas, asCandidaturas } from "../../db/schema";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ DATA E HORÁRIO DA ENTREVISTA (Frente E, ponto 8) ─────────────────────────────────────────────
 *
 * ┌─ A PROPRIEDADE QUE DECIDIU O DESENHO, E É A QUE MAIS IMPORTA AQUI ───────────────────────────┐
 * │ A OST manda considerar que PODE HAVER ENTREVISTA TAMBÉM NA ETAPA CLIENTE. Com um par de      │
 * │ colunas em `as_candidaturas`, marcar a entrevista do cliente APAGARIA a da Soulan, e a        │
 * │ pergunta "que dia foi a entrevista interna desta pessoa" deixaria de ter resposta. O caso     │
 * │ "as duas convivem" é o que prova que a tabela por etapa foi a escolha certa, e é o primeiro   │
 * │ caso deste arquivo.                                                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E A SEGUNDA: ONDE CABE ENTREVISTA VEM DO CATÁLOGO, NUNCA DE UM LITERAL ─────────────────────┐
 * │ A lista é do diretor (`as_etapas_funil.tem_entrevista`), e um `etapa === "ENTREVISTA_SOULAN"`│
 * │ no service pararia de valer no dia em que ele marcasse uma terceira etapa. O caso do         │
 * │ catálogo sem etapa marcada prova o FAIL-CLOSED: sem marca, nada é gravado em lugar nenhum.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids técnicos, códigos de etapa e instantes. Nenhum CPF, nenhum nome de candidato.
 */

const AUTOR = "user-1";
const QUINTA_AS_15H = "2026-10-01T18:00:00.000Z";
const SEXTA_AS_10H = "2026-10-02T13:00:00.000Z";

interface CenarioEntrevista {
  situacao?: string;
  /** As etapas do catálogo fingido. Padrão: a semente (Soulan e Cliente têm entrevista). */
  etapas?: readonly string[];
  /** Sem etapa NENHUMA marcada com entrevista: o caso fail-closed. */
  semEtapaComEntrevista?: boolean;
  /** A candidatura não existe: a linha apagada entre a tela carregar e o clique. */
  semCandidatura?: boolean;
  /**
   * O STATUS DA VAGA da candidatura. `ABERTA` (papel ABERTURA) é o caso normal de quem marca
   * entrevista; `FECHADA` e `CANCELADA` são os processos que acabaram e não recebem compromisso
   * novo (achado do `tester`, cobertura independente).
   */
  vagaStatus?: string;
}

/**
 * O BANCO FINGIDO DESTE ARQUIVO. Ele modela o que o gesto toca e MAIS NADA: a candidatura lida, o
 * `insert ... on conflict do update` e a leitura de volta. Escrito aqui e não num `*.tester-fake`
 * compartilhado porque só este arquivo exercita `as_candidatura_entrevistas`.
 */
function banco(cenario: CenarioEntrevista = {}) {
  const candidatura = {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "TRIAGEM",
    situacao: cenario.situacao ?? "ATIVO",
  };
  /** O estado da tabela, com a CHAVE do unique `(candidatura, etapa)` como chave do mapa. */
  const entrevistas = new Map<string, Record<string, unknown>>();
  const conflitos: unknown[] = [];

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.leftJoin = () => b;
    b.where = () => b;
    b.orderBy = () => {
      if (tabela !== asCandidaturaEntrevistas) return Promise.resolve([]);
      /*
       * A ORDEM É POR `agendada_em` ASCENDENTE, e o fake ORDENA DE VERDADE em vez de devolver a
       * ordem de inserção: é a ordem que a ficha exibe, e um dublê que devolvesse o que recebeu
       * deixaria passar um `desc` trocado no service.
       */
      const linhas = [...entrevistas.values()].sort(
        (a, z) => (a.agendadaEm as Date).getTime() - (z.agendadaEm as Date).getTime(),
      );
      return Promise.resolve(linhas.map((e) => ({ e, autor: "Consultor" })));
    };
    return b;
  });

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      const encadeado = {
        onConflictDoUpdate: (args: { target: unknown; set: Record<string, unknown> }) => {
          conflitos.push(args.target);
          const chave = `${valores.candidaturaId as string}|${valores.etapa as string}`;
          const existente = entrevistas.get(chave);
          // A SEMÂNTICA DO BANCO, imitada: existindo a linha, o `set` do conflito manda; não
          // existindo, o `values` entra inteiro. Um fake que sempre inserisse esconderia a
          // remarcação, que é metade do gesto.
          entrevistas.set(chave, {
            id: existente?.id ?? `ent-${entrevistas.size + 1}`,
            ...(existente ?? valores),
            ...(existente ? args.set : {}),
            candidaturaId: valores.candidaturaId,
            etapa: valores.etapa,
            atualizadoEm: (existente ? args.set.atualizadoEm : valores.atualizadoEm) ?? new Date(),
          });
          return Promise.resolve(undefined);
        },
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
      };
      void tabela;
      return encadeado;
    },
  }));

  const query = {
    asCandidaturas: {
      findFirst: async () => (cenario.semCandidatura ? undefined : { ...candidatura }),
    },
    /*
     * A VAGA DA CANDIDATURA, que a guarda de "vaga em processo" lê. Ela NÃO existia neste dublê, e
     * essa ausência era o que deixava a fresta invisível aqui: um fake que não modela o estado da
     * vaga não consegue medir uma guarda sobre o estado da vaga.
     */
    vagas: { findFirst: async () => ({ id: "vaga-1", status: cenario.vagaStatus ?? "ABERTA" }) },
  };

  const etapas = catalogoDeEtapasFingido(cenario.etapas);
  if (cenario.semEtapaComEntrevista) {
    /*
     * O CATÁLOGO SEM NENHUMA ETAPA DE ENTREVISTA, e ele é montado SOBRESCREVENDO as duas leituras
     * do dublê em vez de inventar um terceiro objeto: é a mesma régua que o serviço de verdade
     * aplica (a recusa nasce de `codigosComEntrevista` vir vazio), e é isso que o caso mede.
     */
    etapas.codigosComEntrevista = async () => new Set<string>();
    etapas.exigirEtapaComEntrevista = async (codigo: string) => {
      const linha = (await etapas.listar()).find((e) => e.codigo === codigo);
      if (!linha) throw new BadRequestException("Esta etapa não existe no funil. Recarregue a página.");
      throw new BadRequestException(`A etapa "${linha.rotulo}" não tem entrevista.`);
    };
  }

  const db = { select, insert, query };

  return {
    service: new CandidatosService(
      db as never,
      etapas as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    ),
    entrevistas,
    conflitos,
    insert,
    asCandidaturas,
  };
}

describe("1. a entrevista mora por ETAPA: as duas convivem, e é isso que a tabela existe para permitir", () => {
  it("marca a entrevista da Soulan e a do Cliente sem uma apagar a outra", async () => {
    const b = banco();

    await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H },
      AUTOR,
    );
    const lista = await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_CLIENTE", agendadaEm: SEXTA_AS_10H },
      AUTOR,
    );

    expect(lista).toHaveLength(2);
    expect(lista.map((e) => e.etapa)).toEqual(["ENTREVISTA_SOULAN", "ENTREVISTA_CLIENTE"]);
    expect(lista.map((e) => e.agendadaEm)).toEqual([QUINTA_AS_15H, SEXTA_AS_10H]);
  });

  /** A leitura é a AGENDA: a mais próxima primeiro, independentemente da ordem em que foi marcada. */
  it("a lista sai na ordem da agenda, e não na ordem em que foi digitada", async () => {
    const b = banco();

    await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_CLIENTE", agendadaEm: SEXTA_AS_10H },
      AUTOR,
    );
    await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H },
      AUTOR,
    );

    const lista = await b.service.listarEntrevistas("cand-1");
    expect(lista.map((e) => e.agendadaEm)).toEqual([QUINTA_AS_15H, SEXTA_AS_10H]);
  });
});

describe("2. remarcar é o MESMO gesto, e ele reescreve a linha em vez de criar a segunda", () => {
  it("remarcar troca a data e NÃO duplica a entrevista daquela etapa", async () => {
    const b = banco();

    await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H },
      AUTOR,
    );
    const lista = await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_SOULAN", agendadaEm: SEXTA_AS_10H },
      AUTOR,
    );

    expect(lista).toHaveLength(1);
    expect(lista[0]!.agendadaEm).toBe(SEXTA_AS_10H);
  });

  /**
   * O ALVO DO CONFLITO É O PAR `(candidatura, etapa)`, E ISSO PRECISA SER MEDIDO: um alvo só na
   * candidatura faria a entrevista do Cliente sobrescrever a da Soulan, que é exatamente o defeito
   * que a tabela por etapa existe para não ter. O teste lê o alvo declarado, e não o efeito, porque
   * o efeito só apareceria num cenário que já tivesse as duas.
   */
  it("o conflito é resolvido pelo par (candidatura, etapa), e não só pela candidatura", async () => {
    const b = banco();

    await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H },
      AUTOR,
    );

    const alvo = b.conflitos[0] as unknown[];
    expect(alvo).toHaveLength(2);
  });
});

describe("3. onde cabe entrevista vem do CATÁLOGO, e o vazio é fail-closed", () => {
  it("recusa etapa que existe e NÃO é de entrevista, dizendo o que configurar", async () => {
    const b = banco();

    const erro = await b.service
      .marcarEntrevista("cand-1", { etapa: "TRIAGEM", agendadaEm: QUINTA_AS_15H }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String((erro as BadRequestException).message)).toMatch(/entrevista/i);
    expect(b.entrevistas.size).toBe(0);
  });

  it("recusa etapa inexistente, com a frase do catálogo", async () => {
    const b = banco();

    const erro = await b.service
      .marcarEntrevista("cand-1", { etapa: "ETAPA_QUE_NAO_EXISTE", agendadaEm: QUINTA_AS_15H }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String((erro as BadRequestException).message)).toMatch(/não existe no funil/i);
  });

  /**
   * FAIL-CLOSED: catálogo sem NENHUMA etapa marcada não aceita entrevista em lugar nenhum. O erro
   * cai para o lado de não gravar sobre uma etapa que ninguém declarou ter entrevista, que é o
   * mesmo lado que a derivação de status da vaga escolhe para o conjunto vazio dela.
   */
  it("com o catálogo sem etapa de entrevista, NADA é aceito", async () => {
    const b = banco({ semEtapaComEntrevista: true });

    const erro = await b.service
      .marcarEntrevista("cand-1", { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.entrevistas.size).toBe(0);
  });
});

describe("4. as guardas da candidatura", () => {
  it("recusa marcar entrevista para candidatura ENCERRADA, e não grava nada", async () => {
    const b = banco({ situacao: "DESCARTADO" });

    const erro = await b.service
      .marcarEntrevista("cand-1", { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(b.entrevistas.size).toBe(0);
    expect(b.insert).not.toHaveBeenCalled();
  });

  it("recusa candidatura inexistente com 404", async () => {
    // A candidatura NÃO EXISTE: é o caso da linha apagada entre a tela carregar e o clique.
    const b = banco({ semCandidatura: true });

    const erro = await b.service
      .marcarEntrevista("cand-1", { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(NotFoundException);
  });
});

describe("5. a marcação PASSADA é aceita, porque registrar depois é o caso normal", () => {
  /**
   * A OPERAÇÃO REGISTRA HOJE A ENTREVISTA QUE ACONTECEU ONTEM, e recusar o passado faria o time
   * inventar uma data futura para conseguir salvar. É a mesma régua do `as_contatos.ocorrido_em`.
   */
  it("aceita data no passado", async () => {
    const b = banco();

    const lista = await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_SOULAN", agendadaEm: "2020-01-02T12:00:00.000Z" },
      AUTOR,
    );

    expect(lista[0]!.agendadaEm).toBe("2020-01-02T12:00:00.000Z");
  });
});

describe("6. a vaga precisa estar EM PROCESSO (achado do `tester`, §A.38)", () => {
  /**
   * ┌─ O CAMINHO É O FELIZ DA FRENTE B, e não uma borda inventada ────────────────────────────────┐
   * │ A vaga fica ENTREGUE com alguém na Entrevista Cliente, a pessoa é contratada e a vaga FECHA │
   * │ a partir da entrega. A trava do fechamento NÃO barra um `ALOCADO` (para ela, ALOCADO é      │
   * │ TRATADO), então ele continua VIVO na Entrevista Cliente de uma vaga FECHADA.                 │
   * │                                                                                              │
   * │ SEM A GUARDA, um clique marcava entrevista PARA O FUTURO num processo terminado, e ela       │
   * │ entrava na agenda da semana chamando o time para um compromisso que não existe mais.         │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it.each(["FECHADA", "CANCELADA"])("recusa marcar entrevista em vaga %s, e não grava nada", async (status) => {
    const b = banco({ vagaStatus: status });

    const erro = await b.service
      .marcarEntrevista("cand-1", { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(b.entrevistas.size).toBe(0);
    expect(b.insert).not.toHaveBeenCalled();
  });

  /**
   * A RECUSA DIZ QUE A **VAGA** ACABOU, e não que a etapa não tem entrevista. A ordem das guardas é
   * o que garante isso: mandar configurar catálogo para resolver um problema que não é de catálogo
   * faria o consultor mexer na lista de etapas do sistema inteiro por causa de uma vaga fechada.
   */
  it("a frase fala da VAGA, e não do catálogo de etapas", async () => {
    const b = banco({ vagaStatus: "FECHADA" });

    const erro = await b.service
      .marcarEntrevista("cand-1", { etapa: "TRIAGEM", agendadaEm: QUINTA_AS_15H }, AUTOR)
      .catch((e: unknown) => e);

    const frase = String((erro as ConflictException).message);
    expect(frase).toMatch(/processo em andamento/i);
    expect(frase).not.toMatch(/Etapas Do Funil/i);
  });

  /** O CONTRASTE, sem o qual os casos acima seriam satisfeitos por um método que recusa tudo. */
  it.each(["ABERTA", "ENTREGUE"])("aceita normalmente na vaga %s", async (status) => {
    const b = banco({ vagaStatus: status });

    const lista = await b.service.marcarEntrevista(
      "cand-1",
      { etapa: "ENTREVISTA_SOULAN", agendadaEm: QUINTA_AS_15H },
      AUTOR,
    );

    expect(lista).toHaveLength(1);
  });
});
