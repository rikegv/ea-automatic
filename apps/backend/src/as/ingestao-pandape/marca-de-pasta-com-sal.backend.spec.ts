import { describe, expect, it } from "vitest";
import { marcaDeChaveExterna, normalizarChaveExterna } from "../../domain/as-etapa-externa";
import { executarCicloDeIngestao, novoResumo, varrerPaginaDaVaga } from "./ingestao-ciclo";
import { VARIAVEL_DO_SAL_DA_MARCA } from "./ingestao-portas";
import { SAL_DE_TESTE, criarMatch, criarMundo } from "./ingestao-varredura.tester-fake";

/**
 * ─ A MARCA DA PASTA É PSEUDONIMIZADA COM CHAVE, E A VARREDURA NÃO SOBE SEM O SAL ───────────────
 *
 * ┌─ O QUE A AUDITORIA CONTESTOU NA VERSÃO ANTERIOR DA MARCA ─────────────────────────────────────┐
 * │ A marca era `sha256` SEM CHAVE, truncado em 8 hex, e o comentário afirmava que não era         │
 * │ reversível na prática. Digesto sem chave é CONFIRMÁVEL: quem já suspeita do nome da pasta      │
 * │ calcula o digesto do palpite e compara, e o universo de nomes é da ordem de 15. O comprimento  │
 * │ nunca foi a fraqueza, então truncar mais não consertaria nada; a chave é que conserta.         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS TESTES USAM UM SAL DE TESTE EXPLÍCITO (`SAL_DE_TESTE`), passado por parâmetro. A suíte NÃO lê
 * a variável real do ambiente, e nenhum valor de sal de instalação aparece aqui: um teste que
 * lesse o segredo poderia imprimi-lo numa mensagem de falha, que é log permanente (§A.6).
 *
 * §A.6: dado sintético do começo ao fim. §A.11: sem travessão.
 */

const OUTRO_SAL = "outro-sal-de-teste-igualmente-inventado";
const CHAVE = normalizarChaveExterna("Short List, Encaminhados Cliente");

describe("a marca da pasta é pseudonimizada COM CHAVE", () => {
  it("a MESMA chave com sais DIFERENTES dá marcas diferentes, que é o que o sal compra", () => {
    expect(
      marcaDeChaveExterna(CHAVE, SAL_DE_TESTE),
      "a marca não mudou ao trocar o sal: o sal não está entrando no digesto, e a marca continua confirmável por quem suspeita do nome da pasta.",
    ).not.toBe(marcaDeChaveExterna(CHAVE, OUTRO_SAL));
  });

  it("a mesma chave com o MESMO sal é estável entre passadas, que é o requisito de quem opera", () => {
    const primeira = marcaDeChaveExterna(CHAVE, SAL_DE_TESTE);
    const segunda = marcaDeChaveExterna(CHAVE, SAL_DE_TESTE);
    expect(
      segunda,
      "a marca mudou entre duas chamadas com o mesmo sal. Marca instável faz as mesmas 15 pastas aparecerem como novidade a cada passada, e quem opera aprende a ignorar o aviso.",
    ).toBe(primeira);
  });

  it("chaves diferentes não colapsam numa marca só, e a marca continua 8 hex legíveis", () => {
    const a = marcaDeChaveExterna(normalizarChaveExterna("Short List"), SAL_DE_TESTE);
    const b = marcaDeChaveExterna(normalizarChaveExterna("Reservados"), SAL_DE_TESTE);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(b).toMatch(/^[0-9a-f]{8}$/);
  });

  it("SEM SAL, a marca não sai degradada: ela LANÇA", () => {
    for (const vazio of ["", "   "]) {
      expect(
        () => marcaDeChaveExterna(CHAVE, vazio),
        "a marca aceitou sal vazio. Seguir sem sal é degradação silenciosa para o estado inseguro, no exato momento em que a configuração falhou.",
      ).toThrow();
    }
  });

  it("a mensagem da recusa não carrega o sal, nem pedaço dele", () => {
    let mensagem = "";
    try {
      marcaDeChaveExterna(CHAVE, "");
    } catch (err) {
      mensagem = String(err);
    }
    expect(mensagem).not.toContain(SAL_DE_TESTE);
    expect(mensagem).not.toContain(SAL_DE_TESTE.slice(0, 4));
  });
});

/** O mundo do cenário: uma vaga, uma pasta SEM de/para, uma inscrição nova. */
function mundoDeUmaPastaSemDePara() {
  return criarMundo({
    vagas: [{ idVacancy: 9201, reference: "PS-2", job: "Cargo", city: "SP", numberVacancies: 1 }],
    pastas: { 9201: [{ idVacancyFolder: 61, name: "Short List" }] },
    matches: {
      9201: [
        criarMatch({
          idCandidate: 2,
          idMatch: 2,
          idVacancy: 9201,
          idVacancyFolder: 61,
          insertDate: "2026-09-16T10:00:00Z",
        }),
      ],
    },
    dePara: {},
  });
}

describe("a varredura RECUSA subir sem o sal", () => {
  it("sem sal, o ciclo não lê a primeira página e não escreve nada", async () => {
    const mundo = mundoDeUmaPastaSemDePara();
    mundo.deps.salDaMarca = undefined;

    const resumo = await mundo.rodar(executarCicloDeIngestao);

    expect(
      mundo.obs.requisicoes,
      "a varredura sem sal chegou a chamar a API. A recusa é na PARTIDA, antes da primeira página: começar a ler e decidir depois já gastou cota compartilhada e já trouxe dado de gente para a memória.",
    ).toEqual([]);
    expect(mundo.obs.escritas, "a varredura sem sal escreveu no banco").toEqual([]);
    expect(
      resumo.etapasNaoMapeadas,
      "a recusa por falta de sal não pode virar registro de pasta: sem sal não há marca que possa ser escrita.",
    ).toEqual([]);
    expect(resumo.erros, "a recusa tem de ser contada como erro, e não passar por volta normal").toBe(1);
  });

  it("um job de PÁGINA também recusa sozinho, porque em produção ele é uma partida própria", async () => {
    const mundo = mundoDeUmaPastaSemDePara();
    mundo.deps.salDaMarca = undefined;
    const resumo = novoResumo();

    const r = await varrerPaginaDaVaga(
      mundo.deps,
      { idVacancy: 9201, vagaId: "vaga-sintetica" },
      1,
      resumo,
    );

    expect(r.proximaPagina, "a página sem sal pediu a próxima, então a volta seguiria").toBe(null);
    expect(mundo.obs.requisicoes).toEqual([]);
    expect(resumo.paginasLidas).toBe(0);
  });

  it("a recusa NOMEIA A VARIÁVEL que falta, e jamais o valor dela", async () => {
    const mundo = mundoDeUmaPastaSemDePara();
    mundo.deps.salDaMarca = undefined;
    await mundo.rodar(executarCicloDeIngestao);

    const registrado = JSON.stringify(mundo.obs.logs);
    expect(
      registrado,
      "a recusa não diz qual variável falta. Sem o nome, quem opera vê a varredura parada e não tem como saber o que configurar.",
    ).toContain(VARIAVEL_DO_SAL_DA_MARCA);
    expect(
      registrado.includes(SAL_DE_TESTE),
      "o sal apareceu no log da recusa. O valor do sal nunca vai a log, nem truncado.",
    ).toBe(false);
  });

  it("COM o sal, o mesmo cenário volta a andar, então a recusa não é a varredura desligada", async () => {
    const mundo = mundoDeUmaPastaSemDePara();
    const resumo = await mundo.rodar(executarCicloDeIngestao);

    expect(mundo.obs.requisicoes.length).toBeGreaterThan(0);
    expect(
      resumo.etapasNaoMapeadas,
      "com o sal, a pasta sem de/para volta a ser registrada pela marca dela",
    ).toEqual([marcaDeChaveExterna(normalizarChaveExterna("Short List"), SAL_DE_TESTE)]);
    expect(resumo.erros).toBe(0);
  });
});
