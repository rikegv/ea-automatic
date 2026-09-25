import { describe, expect, it } from "vitest";
import { estadoDaLinha } from "../domain/portal-identidade";
import { TETO_REPROVACOES_POR_PENDENCIA } from "../domain/portal-tentativas";
import { PortalCredencialService } from "./portal-credencial.service";


/**
 * DUAS COISAS QUE A FRENTE DA IDENTIDADE ENCOSTOU NO CAMINHO DO ARQUIVO, e as duas mexem em código
 * que já estava validado, então as duas ganham teste próprio (§A.26).
 *
 *  1. A RÉGUA DO LINK MORTO (`estadoDaLinha`), que passou a decidir em TRÊS lugares: a
 *     identificação, a emissão de credencial e a confirmação. Régua repetida diverge no primeiro
 *     ajuste, e a divergência aqui seria "a identificação recusa e a emissão aceita", que é o furo
 *     de 30 minutos que a auditoria achou.
 *  2. A LEITURA EM LOTE das situações, que virou o caminho da tela do candidato. O risco dela não
 *     é ser lenta, é DIVERGIR do unitário: são dois caminhos para o número que TRANCA a pessoa
 *     fora do documento, e a divergência só apareceria no dia em que ele estivesse errado.
 *
 * §A.6: só número, data e booleano. Nada aqui é dado pessoal.
 */

const AGORA = Date.UTC(2026, 8, 20, 12, 0, 0);
const HORA = 3_600_000;

describe("A RÉGUA DO LINK MORTO é uma só, e ela fecha por omissão", () => {
  const viva = () => ({
    expiraEm: new Date(AGORA + 10 * HORA),
    revogadoEm: null,
    suspensoAte: null,
  });

  it("linha viva é o caso feliz, e ela devolve o prazo para a sessão se encurtar nele", () => {
    const e = estadoDaLinha(viva(), AGORA);
    expect(e.vivo).toBe(true);
    expect(e.motivoCodigo).toBeNull();
    expect(e.expiraEmMs).toBe(AGORA + 10 * HORA);
  });

  it("LINHA AUSENTE É LINK MORTO, nunca link sem restrição", () => {
    // É o que faz um bilhete assinado cuja linha sumiu parar de valer. A direção contrária seria
    // um token auto-suficiente de novo, que é exatamente o furo do link do VT.
    for (const ausente of [undefined, null]) {
      const e = estadoDaLinha(ausente, AGORA);
      expect(e.existe).toBe(false);
      expect(e.vivo).toBe(false);
    }
  });

  it("PRAZO AUSENTE também é morto: dado quebrado fecha, não abre", () => {
    expect(estadoDaLinha({ revogadoEm: null, suspensoAte: null }, AGORA).vivo).toBe(false);
  });

  it("revogado mata, mesmo com o prazo inteiro pela frente", () => {
    const e = estadoDaLinha({ ...viva(), revogadoEm: new Date(AGORA - 1000) }, AGORA);
    expect(e.vivo).toBe(false);
    expect(e.revogado).toBe(true);
    expect(e.motivoCodigo).toBe("REVOGADO_MANUAL");
  });

  it("vencido mata, e o limite é o instante exato", () => {
    expect(estadoDaLinha({ ...viva(), expiraEm: new Date(AGORA + 1) }, AGORA).vivo).toBe(true);
    expect(estadoDaLinha({ ...viva(), expiraEm: new Date(AGORA) }, AGORA).vivo).toBe(false);
  });

  it("SUSPENSO mata enquanto durar, e volta sozinho depois", () => {
    // A suspensão é da LINHA e vale para qualquer CPF que tente por aquele link, que é o que barra
    // quem varre datas de nascimento trocando de CPF sem trocar de link.
    expect(estadoDaLinha({ ...viva(), suspensoAte: new Date(AGORA + HORA) }, AGORA).vivo).toBe(false);
    expect(estadoDaLinha({ ...viva(), suspensoAte: new Date(AGORA - 1) }, AGORA).vivo).toBe(true);
  });

  it("COLUNA NÃO PROJETADA (undefined) NÃO é suspensão, e esta é a armadilha do `!== null`", () => {
    // Uma projeção que não peça `suspenso_ate` devolve `undefined`, e a comparação estrita
    // transformaria a coluna ausente em "suspensão ativa", ou seja, portal fechado por um campo
    // que ninguém pediu. Medido: foi assim que os fakes dos vizinhos quebraram.
    expect(estadoDaLinha({ expiraEm: new Date(AGORA + HORA) }, AGORA).vivo).toBe(true);
  });
});

/** Junta toda string alcançável, com guarda de ciclo e teto. Ver o comentário em `where`. */
function textoDe(valor: unknown): string {
  const vistos = new WeakSet<object>();
  const partes: string[] = [];
  const anda = (v: unknown, profundidade: number) => {
    if (profundidade > 10 || v == null || partes.length > 5000) return;
    if (typeof v === "string") return void partes.push(v);
    if (typeof v !== "object") return;
    if (vistos.has(v as object)) return;
    vistos.add(v as object);
    for (const item of Object.values(v as Record<string, unknown>)) anda(item, profundidade + 1);
  };
  anda(valor, 0);
  return partes.join(" ");
}

/** Banco de mentirinha: só as duas leituras que as duas versões fazem. */
function banco(dados: {
  /** Por tipo: quantas reprovações carimbadas DEPOIS do marco. */
  reprovacoes: Record<string, number>;
  /** Por tipo: o marco de reabertura, quando houver. */
  marcos?: Record<string, { liberadoEm: Date; liberadoTipo: string }>;
}) {
  const marcos = dados.marcos ?? {};

  const resolver = (chaves: string[], clausula: string): unknown[] => {
    // A leitura AGRUPADA do lote.
    if (chaves.includes("tipoDocumentoId") && chaves.includes("reprovacoes")) {
      return Object.entries(dados.reprovacoes).map(([tipoDocumentoId, reprovacoes]) => ({
        tipoDocumentoId,
        reprovacoes,
      }));
    }
    // A contagem UNITÁRIA, que chega filtrada pelo tipo.
    if (chaves.includes("reprovacoes")) {
      const tipo = Object.keys(dados.reprovacoes).find((t) => clausula.includes(t));
      return [{ reprovacoes: (tipo && dados.reprovacoes[tipo]) ?? 0 }];
    }
    // Os marcos, em lote (com `tipoDocumentoId`) ou unitário.
    if (chaves.includes("liberadoEm")) {
      const emLote = chaves.includes("tipoDocumentoId");
      const entradas = Object.entries(marcos);
      if (emLote) return entradas.map(([tipoDocumentoId, m]) => ({ tipoDocumentoId, ...m }));
      const tipo = entradas.find(([t]) => clausula.includes(t));
      return tipo ? [tipo[1]] : [];
    }
    return [];
  };

  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    let clausula = "";
    const b: Record<string, unknown> = {};
    const fim = () => Promise.resolve(resolver(chaves, clausula));
    b.from = () => b;
    b.leftJoin = () => b;
    b.where = (c: unknown) => {
      // SERIALIZAÇÃO COM GUARDA DE CICLO, e ela é obrigatória: o argumento de uma consulta Drizzle
      // é um grafo de objetos de coluna que aponta de volta para a tabela, e um `JSON.stringify`
      // ingênuo estoura em estrutura circular. Só as strings interessam, que é onde o id do tipo
      // aparece.
      clausula += ` ${textoDe(c)}`;
      return b;
    };
    b.groupBy = () => b;
    b.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => fim().then(ok, erro);
    return b;
  };

  return { select } as never;
}

function servico(b: unknown) {
  const Classe = PortalCredencialService as unknown as new (...a: unknown[]) => PortalCredencialService;
  return new Classe(b);
}

const RG = "11111111-1111-4111-8111-111111111111";
const CTPS = "22222222-2222-4222-8222-222222222222";

describe("O LOTE E O UNITÁRIO DÃO O MESMO NÚMERO, sempre", () => {
  it("sem reabertura: cada tipo recebe a contagem dele", async () => {
    const s = servico(banco({ reprovacoes: { [RG]: 0, [CTPS]: 2 } }));

    const mapa = await s.situacoesParaATela("adm-1");

    expect(s.situacaoDe(mapa, RG).usadas).toBe(0);
    expect(s.situacaoDe(mapa, CTPS).usadas).toBe(2);
    expect(s.situacaoDe(mapa, CTPS).restantes).toBe(TETO_REPROVACOES_POR_PENDENCIA - 2);
  });

  it("o lote bate com o unitário, tipo a tipo", async () => {
    // É ESTA A ASSERÇÃO QUE IMPORTA, e não os valores: o unitário é o caminho de ESCRITA (lido sob
    // a trava, dentro da transação) e continua sendo a verdade. O lote existe para a TELA, e no
    // dia em que os dois divergirem a tela promete o que a emissão nega.
    const b = banco({
      reprovacoes: { [RG]: 1, [CTPS]: 3 },
      marcos: { [CTPS]: { liberadoEm: new Date(AGORA - HORA), liberadoTipo: "SOLICITACAO_REENVIO" } },
    });
    const s = servico(b);

    const mapa = await s.situacoesParaATela("adm-1");

    for (const tipo of [RG, CTPS]) {
      expect(s.situacaoDe(mapa, tipo)).toEqual(await s.situacaoParaATela("adm-1", tipo));
    }
  });

  it("TIPO SEM HISTÓRICO NENHUM é zero reprovação, e não é erro nem ausência", () => {
    // O mapa só tem quem apareceu nas duas consultas. Quem não apareceu nunca enviou nada, e a
    // casa dele tem o teto inteiro na mão. Deixar isso para o chamador decidir seria convidar cada
    // um a inventar o seu próprio padrão.
    const s = servico(banco({ reprovacoes: {} }));
    const vazia = s.situacaoDe(new Map(), "tipo-que-nunca-apareceu");
    expect(vazia.usadas).toBe(0);
    expect(vazia.noTime).toBe(false);
    expect(vazia.restantes).toBe(TETO_REPROVACOES_POR_PENDENCIA);
    expect(vazia.aviso).toBeNull();
  });

  it("o teto atingido vira `noTime` no lote também, com o aviso do domínio", async () => {
    const s = servico(banco({ reprovacoes: { [RG]: TETO_REPROVACOES_POR_PENDENCIA } }));

    const situacao = s.situacaoDe(await s.situacoesParaATela("adm-1"), RG);

    expect(situacao.noTime).toBe(true);
    expect(situacao.restantes).toBe(0);
    expect(situacao.aviso).toBeTruthy();
  });
});
