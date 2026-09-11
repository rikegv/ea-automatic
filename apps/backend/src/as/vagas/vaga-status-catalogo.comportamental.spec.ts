import { describe, expect, it } from "vitest";
import {
  VAGA_STATUS_PAPEIS,
  VAGA_STATUS_PAPEIS_DE_SISTEMA,
  VAGA_STATUS_SEMENTE,
  type VagaStatusPapel,
} from "@ea/shared-types";
import {
  STAND_BY,
  bancoDeStatus,
  erroDe,
  instanciar,
  metodoDe,
  modulosQueMencionam,
  portadoresDe,
  semOPapel,
  statusSemente,
  type LinhaStatus,
} from "./vaga-status.tester-fake";

/**
 * ─ O CATÁLOGO DE STATUS DA VAGA (B2): O REQUISITO, ESCRITO ANTES DO CÓDIGO (§A.40, regra 2) ─────
 *
 * ESTE ARQUIVO É DO `tester`, E NÃO DE QUEM CONSTRUIU (§A.38). A régua é essa: teste do próprio
 * autor pega REGRESSÃO bem e pega MAL-ENTENDIDO DE REQUISITO mal, porque ele codifica exatamente a
 * suposição que gerou o código. O que está afirmado aqui é o REQUISITO do diretor; nada do que a
 * implementação vier a fazer é lido como definição.
 *
 * ┌─ A ARMADILHA CENTRAL, E ELA CABE EM DOIS CARACTERES ────────────────────────────────────────┐
 * │ `codigoDoPapel("ENTREGA")` tem UM jeito certo de falhar e dois jeitos convidativos de mentir:│
 * │                                                                                             │
 * │   1. `?? "ENTREGUE"`, o literal de segurança. Parece prudência e é o oposto: no dia em que a │
 * │      linha do papel sumir do catálogo, o sistema volta a gravar o código à mão, que é        │
 * │      exatamente o que esta onda inteira existe para acabar. E some em silêncio.              │
 * │   2. `linhas.find(...) ?? linhas[0]`, a primeira da lista. FK válida, desfecho FALSO e        │
 * │      PERMANENTE: gravar o código do CANCELAMENTO onde ia o do FECHAMENTO carimba a vaga com  │
 * │      `vagas_fechadas` e `data_fechamento` de um cancelamento, e nada fica vermelho.          │
 * │                                                                                             │
 * │ O CERTO É LANÇAR. Catálogo sem a linha de um papel de sistema é banco inconsistente, e o     │
 * │ modo de falha seguro é o alto e visível, não o palpite.                                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O NOME DO ARQUIVO E DA CLASSE NÃO SÃO AFIRMADOS EM LUGAR NENHUM (ver o cabeçalho do
 * `vaga-status.tester-fake.ts`): eles são escolha de quem constrói, e um teste que morresse por
 * causa deles estaria medindo desenho em vez de propriedade.
 */

// ── A CHAMADA DE `codigoDoPapel`, SEM SABER O DESENHO DELA ──────────────────

type Forma = { rotulo: string; chamar: (catalogo: LinhaStatus[], papel: unknown) => Promise<unknown> };

/**
 * A CONVENÇÃO DE CHAMADA É DESCOBERTA UMA VEZ, CONTRA UM CASO CONHECIDO, e depois reusada.
 *
 * POR QUE NÃO "TENTAR TODAS AS ORDENS EM CADA TESTE": porque metade dos testes daqui afirma que a
 * função LANÇA, e um laço que tentasse outra ordem de argumentos depois de uma exceção mascararia
 * justamente a exceção que se quer medir. Descobrindo a forma UMA vez, com um caso que tem resposta
 * conhecida (`ENTREGA` na semente vale `ENTREGUE`), todo lançamento posterior é lançamento de
 * verdade.
 */
let formaConhecida: Forma | null = null;

async function formasCandidatas(): Promise<Forma[]> {
  const portadores = await portadoresDe("codigoDoPapel");
  const normalizar = (r: unknown): unknown =>
    r && typeof r === "object" && "codigo" in (r as object)
      ? (r as { codigo: unknown }).codigo
      : r;
  const formas: Forma[] = [];

  for (const portador of portadores) {
    if (portador.funcaoSolta) {
      const f = portador.funcaoSolta;
      formas.push(
        { rotulo: `${portador.nomeDoExport}(papel)`, chamar: async (_c, p) => normalizar(await f(p)) },
        { rotulo: `${portador.nomeDoExport}(papel, catalogo)`, chamar: async (c, p) => normalizar(await f(p, c)) },
        { rotulo: `${portador.nomeDoExport}(catalogo, papel)`, chamar: async (c, p) => normalizar(await f(c, p)) },
      );
      continue;
    }
    const classe = portador.classe as new (...a: never[]) => object;
    const nome = portador.metodo as string;
    const chamarEm = async (alvo: object, p: unknown) =>
      normalizar(await (alvo as Record<string, (x: unknown) => unknown>)[nome](p));
    formas.push(
      {
        // A RÉGUA CONSTRUÍDA COM AS LINHAS: catálogo lido uma vez, métodos síncronos depois.
        rotulo: `new ${portador.nomeDoExport}(catalogo).${nome}(papel)`,
        chamar: async (c, p) =>
          chamarEm(new (classe as new (...a: unknown[]) => object)(c as unknown), p),
      },
      {
        // O SERVIÇO INJETADO COM O BANCO, que lê o catálogo por conta própria.
        rotulo: `${portador.nomeDoExport}(db).${nome}(papel)`,
        chamar: async (c, p) => chamarEm(instanciar(classe, bancoDeStatus({ status: c }).db), p),
      },
    );
  }
  return formas;
}

/** Chama `codigoDoPapel` contra o catálogo dado, na forma que a descoberta fixou. */
async function codigoDoPapel(catalogo: LinhaStatus[], papel: unknown): Promise<unknown> {
  if (!formaConhecida) {
    const candidatas = await formasCandidatas();
    const tentativas: string[] = [];
    for (const forma of candidatas) {
      try {
        const r = await forma.chamar(statusSemente(), "ENTREGA");
        if (r === "ENTREGUE") {
          formaConhecida = forma;
          break;
        }
        tentativas.push(`${forma.rotulo} devolveu ${JSON.stringify(r)}`);
      } catch (e) {
        tentativas.push(`${forma.rotulo} lançou ${(e as Error).message}`);
      }
    }
    if (!formaConhecida) {
      throw new Error(
        `\`codigoDoPapel("ENTREGA")\` precisa devolver "ENTREGUE" com o catálogo semente. Tentativas: ${tentativas.join(" | ")}`,
      );
    }
  }
  return formaConhecida.chamar(catalogo, papel);
}

// ── 1. OS PAPÉIS DE SISTEMA, E O ÚNICO JEITO CERTO DE FALHAR ────────────────

describe("a semente descreve o comportamento de hoje, e não inventa status novo", () => {
  /**
   * §A.27, CONTAGENS INTACTAS: nenhuma vaga muda de status por efeito da migração. A garantia
   * começa aqui, no vocabulário: os cinco códigos que a base já usa continuam sendo esses cinco,
   * com essas letras. Um `ENTREGA` no lugar de `ENTREGUE` deixaria 126 vagas órfãs da FK.
   */
  it("os cinco códigos da base continuam idênticos", () => {
    expect(VAGA_STATUS_SEMENTE.map((s) => s.codigo)).toEqual([
      "RASCUNHO",
      "ABERTA",
      "ENTREGUE",
      "FECHADA",
      "CANCELADA",
    ]);
  });

  it("existe EXATAMENTE UM status por papel de sistema", () => {
    for (const papel of VAGA_STATUS_PAPEIS_DE_SISTEMA) {
      const linhas = VAGA_STATUS_SEMENTE.filter((s) => s.papel === papel);
      expect(linhas.map((l) => l.codigo), `o papel ${papel} precisa de uma linha, e uma só`).toHaveLength(1);
    }
  });

  it("`LIVRE` fica de fora dos papéis de sistema (dele pode haver zero ou muitos)", () => {
    expect(VAGA_STATUS_PAPEIS_DE_SISTEMA).not.toContain("LIVRE");
    expect(VAGA_STATUS_PAPEIS).toContain("LIVRE");
  });

  /**
   * O CAMINHO DE VOLTA, e é a armadilha mais cara desta onda (item 6 do requisito).
   *
   * SEM `ABERTURA` COMO DESTINO MANUAL, uma vaga movida para um status LIVRE fica IMPOSSÍVEL de
   * fechar e IMPOSSÍVEL de cancelar, porque as duas portas exigem o status de abertura como ORIGEM.
   * Ela vira zumbi permanente, segurando candidatura viva, e nenhuma tela mostra que isso aconteceu:
   * a vaga simplesmente nunca mais termina. O `true` abaixo é o que impede o beco sem saída.
   */
  it("`ABERTURA` é destino manual, senão a vaga que sai para um status LIVRE nunca volta", () => {
    const abertura = VAGA_STATUS_SEMENTE.find((s) => s.papel === "ABERTURA");
    expect(abertura?.movivelManualmente, "sem isto, mover para um LIVRE é caminho sem volta").toBe(true);
    expect(abertura?.encerra).toBe(false);
    expect(abertura?.ativo).toBe(true);
  });

  it("nenhum status que ENCERRA é destino manual (encerrar tem duas portas, e as duas têm régua)", () => {
    for (const s of VAGA_STATUS_SEMENTE.filter((x) => x.encerra)) {
      expect(s.movivelManualmente, `${s.codigo} encerra: mover para ele seria uma TERCEIRA porta`).toBe(false);
    }
  });
});

describe("`codigoDoPapel`: o único jeito certo de falhar é LANÇAR", () => {
  it("resolve os cinco papéis de sistema no catálogo semente", async () => {
    const esperado: Record<VagaStatusPapel, string> = {
      LIVRE: "",
      RASCUNHO: "RASCUNHO",
      ABERTURA: "ABERTA",
      ENTREGA: "ENTREGUE",
      FECHAMENTO: "FECHADA",
      CANCELAMENTO: "CANCELADA",
    };
    for (const papel of VAGA_STATUS_PAPEIS_DE_SISTEMA) {
      await expect(codigoDoPapel(statusSemente(), papel)).resolves.toBe(esperado[papel]);
    }
  });

  /**
   * A MUTAÇÃO 1 MORRE AQUI. Com `?? "ENTREGUE"` no lugar do lançamento, este teste fica verde na
   * primeira linha e vermelho nesta: a resposta viria mesmo com a linha do papel AUSENTE.
   */
  it.each([...VAGA_STATUS_PAPEIS_DE_SISTEMA])(
    "LANÇA quando falta a linha do papel %s (nunca cai em literal, nunca escolhe a primeira)",
    async (papel) => {
      const catalogo = semOPapel(papel);
      const erro = await erroDe(() => codigoDoPapel(catalogo, papel));
      expect(
        erro,
        `catálogo sem a linha de ${papel}: a resposta certa é uma exceção alta, não um palpite`,
      ).not.toBeNull();
    },
  );

  /**
   * `codigoDoPapel(undefined)` TEM DE ESTOURAR, e o caso é real, não teórico: basta uma variável de
   * papel chegar `undefined` de uma refatoração para uma implementação por `find` devolver a
   * PRIMEIRA linha do catálogo, calada. Seria o status de RASCUNHO gravado como desfecho.
   */
  it("estoura com o papel `undefined` (não devolve a primeira linha do catálogo)", async () => {
    const erro = await erroDe(() => codigoDoPapel(statusSemente(), undefined));
    expect(erro, "papel `undefined` precisa estourar").not.toBeNull();
  });

  it("estoura com um papel que não existe", async () => {
    const erro = await erroDe(() => codigoDoPapel(statusSemente(), "INVENTADO"));
    expect(erro).not.toBeNull();
  });

  /**
   * `LIVRE` NÃO SE RESOLVE POR PAPEL, e a razão é a mesma do lançamento: dele pode haver muitos, e
   * ESCOLHER é justamente o que esta função não pode fazer. Um catálogo com "Stand By" e "Em
   * Análise" faria a resposta depender da ordem em que o Postgres devolvesse as linhas.
   */
  it("estoura ao perguntar pelo papel `LIVRE`, que não identifica linha nenhuma", async () => {
    const catalogo = [...statusSemente(), STAND_BY];
    const erro = await erroDe(() => codigoDoPapel(catalogo, "LIVRE"));
    expect(erro, "há N linhas LIVRE: escolher uma delas é o que a função não pode fazer").not.toBeNull();
  });

  /**
   * A RESPOSTA NÃO DEPENDE DA POSIÇÃO DA LINHA NA LISTA, e é isso que separa uma busca por CHAVE de
   * um `find` com comparação frouxa ou de um `[0]` disfarçado. Embaralhado o catálogo, as cinco
   * respostas continuam idênticas.
   *
   * ┌─ O QUE ESTE TESTE NÃO COBRE, e está escrito para virar decisão e não descoberta ───────────┐
   * │ DUAS linhas do mesmo papel de sistema. A garantia de unicidade mora no BANCO (índice único   │
   * │ parcial, conferido no `vaga-status-migracao.comportamental.spec.ts`), e a régua em memória    │
   * │ CONFIA nela: recebendo duas, ela escolhe uma em silêncio em vez de gritar. É delegação        │
   * │ legítima, e fica registrada aqui como delegação, não como esquecimento.                       │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("não depende da ordem das linhas do catálogo", async () => {
    const embaralhado = [...statusSemente()].reverse();
    for (const papel of VAGA_STATUS_PAPEIS_DE_SISTEMA) {
      const naOrdem = await codigoDoPapel(statusSemente(), papel);
      await expect(codigoDoPapel(embaralhado, papel)).resolves.toBe(naOrdem);
    }
  });
});

// ── 2 e 3. O QUE O DIRETOR PODE E O QUE ELE NÃO PODE ────────────────────────

/**
 * O SERVIÇO DE ESCRITA DO CATÁLOGO, ACHADO PELA TABELA QUE ELE TOCA.
 *
 * A busca é por quem menciona `as_vaga_status` / `asVagaStatus` e expõe um método de criação. Se a
 * construção resolver isso por outro caminho (um repositório, uma função solta), o vermelho abaixo
 * diz o que foi procurado, e essa conversa é o valor do teste enquanto o código não existe.
 */
async function servicoDoCatalogo(status: LinhaStatus[]): Promise<{
  alvo: object;
  banco: ReturnType<typeof bancoDeStatus>;
}> {
  const banco = bancoDeStatus({ status });
  const { achados, candidatos } = await modulosQueMencionam("asVagaStatus");
  const nomesDeEscrita = ["criar", "create", "atualizar", "editar", "update", "remover", "apagar", "excluir"];
  for (const { mod } of achados) {
    for (const [nome, valor] of Object.entries(mod)) {
      const proto = (valor as { prototype?: Record<string, unknown> })?.prototype;
      const ehServico =
        typeof valor === "function" && /status/i.test(nome) && proto &&
        nomesDeEscrita.some((n) => typeof proto[n] === "function");
      if (ehServico) {
        return { alvo: instanciar(valor as new (...a: never[]) => object, banco.db), banco };
      }
    }
  }
  throw new Error(
    `Nenhum serviço de escrita do catálogo de status foi encontrado. Arquivos que mencionam \`asVagaStatus\`: ${candidatos.join(", ") || "nenhum"}.`,
  );
}

const linhaDe = (banco: ReturnType<typeof bancoDeStatus>, codigo: string) =>
  banco.status.find((s) => s.codigo === codigo);

const NOVA_LIVRE = {
  codigo: "STAND_BY",
  rotulo: "Stand By",
  ordem: 6,
  tom: "wn",
  ativo: true,
  papel: "LIVRE",
  encerra: false,
  recebeCandidato: false,
  daTrilha: false,
  movivelManualmente: true,
};

describe("o que o diretor NÃO pode fazer com uma linha de papel de sistema", () => {
  it.each([...VAGA_STATUS_PAPEIS_DE_SISTEMA])("não APAGA a linha do papel %s", async (papel) => {
    const { alvo, banco } = await servicoDoCatalogo(statusSemente());
    const linha = banco.status.find((s) => s.papel === papel) as LinhaStatus;
    await erroDe(() => metodoDe(alvo, ["remover", "apagar", "excluir", "delete"])(linha.id));
    expect(
      linhaDe(banco, linha.codigo),
      `apagar a linha de ${papel} deixaria \`codigoDoPapel\` sem resposta, e vagas órfãs da FK`,
    ).toBeDefined();
  });

  /**
   * A MUTAÇÃO 6 TEM UM IRMÃO AQUI: o CHECK do banco (`papel = 'LIVRE' OR ativo`) é a trava que vale
   * para quem escreve por SQL cru; esta é a que dá a mensagem boa para quem clica na tela. As duas
   * precisam existir, e a do banco é conferida no `vaga-status-migracao.comportamental.spec.ts`.
   */
  it.each([...VAGA_STATUS_PAPEIS_DE_SISTEMA])("não INATIVA a linha do papel %s", async (papel) => {
    const { alvo, banco } = await servicoDoCatalogo(statusSemente());
    const linha = banco.status.find((s) => s.papel === papel) as LinhaStatus;
    /*
     * O VERBO PRÓPRIO VEM PRIMEIRO, e a ordem desta lista é o que separa teste que morde de teste
     * que passa por engano: "tirar de circulação" tende a ter método próprio (`inativar`), e medir
     * só o `atualizar({ ativo: false })` deixaria a porta de verdade sem cobertura, verde, porque o
     * campo simplesmente não existe naquele corpo.
     */
    await erroDe(() => metodoDe(alvo, ["inativar", "desativar"])(linha.id));
    await erroDe(() => metodoDe(alvo, ["atualizar", "editar", "update"])(linha.id, { ativo: false }));
    expect(linhaDe(banco, linha.codigo)?.ativo, `${papel} inativo é o mesmo dano do apagado`).toBe(true);
  });

  /**
   * MUDAR O PAPEL É A MESMA COISA QUE TROCAR O DESFECHO DE TODAS AS VAGAS DE UMA VEZ. O papel é a
   * pergunta que o código faz (`codigoDoPapel("FECHAMENTO")`); reapontá-lo para outra linha faz o
   * fechamento passar a gravar outro código, retroativamente, para sempre.
   *
   * A ASSERÇÃO É SOBRE O ESTADO, e não sobre a exceção, de propósito: recusar e ignorar o campo são
   * duas implementações legítimas do mesmo requisito.
   */
  it("não muda o `papel` de uma linha de sistema", async () => {
    const { alvo, banco } = await servicoDoCatalogo(statusSemente());
    const entregue = linhaDe(banco, "ENTREGUE") as LinhaStatus;
    await erroDe(() => metodoDe(alvo, ["atualizar", "editar", "update"])(entregue.id, { papel: "LIVRE" }));
    expect(linhaDe(banco, "ENTREGUE")?.papel).toBe("ENTREGA");
  });

  it("não muda o `papel` de uma linha LIVRE para um papel de sistema", async () => {
    const { alvo, banco } = await servicoDoCatalogo([...statusSemente(), { ...STAND_BY }]);
    const standBy = linhaDe(banco, "STAND_BY") as LinhaStatus;
    await erroDe(() => metodoDe(alvo, ["atualizar", "editar", "update"])(standBy.id, { papel: "ENTREGA" }));
    expect(linhaDe(banco, "STAND_BY")?.papel).toBe("LIVRE");
    expect(banco.status.filter((s) => s.papel === "ENTREGA")).toHaveLength(1);
  });

  it("não CRIA linha com papel de sistema (o segundo dono do papel)", async () => {
    const { alvo, banco } = await servicoDoCatalogo(statusSemente());
    await erroDe(() =>
      metodoDe(alvo, ["criar", "create"])({ ...NOVA_LIVRE, codigo: "ENTREGUE_2", papel: "ENTREGA" }),
    );
    expect(
      banco.status.filter((s) => s.papel === "ENTREGA"),
      "dois donos do mesmo papel é o estado que faz `codigoDoPapel` ter de escolher",
    ).toHaveLength(1);
  });

  /**
   * STATUS LIVRE QUE ENCERRA SERIA A TERCEIRA PORTA DO ENCERRAMENTO, cadastrada pela tela: sem
   * trava de candidato tratado, sem a de posição oficial, sem gate de Master, sem carimbo de
   * contagem e sem data de fechamento. Encerrar vaga tem duas portas, e as duas têm régua.
   */
  it("não CRIA status LIVRE que encerra vaga", async () => {
    const { alvo, banco } = await servicoDoCatalogo(statusSemente());
    await erroDe(() =>
      metodoDe(alvo, ["criar", "create"])({ ...NOVA_LIVRE, codigo: "ARQUIVADA", encerra: true }),
    );
    expect(banco.status.filter((s) => s.papel === "LIVRE" && s.encerra)).toHaveLength(0);
  });
});

describe("o que o diretor PODE fazer, e o código gravado na vaga não se mexe", () => {
  /**
   * RENOMEAR É O CASO DE USO INTEIRO DESTA ONDA: o diretor chama "Entregue" do que quiser, e o
   * `fechar` continua achando a linha pelo PAPEL. O que não pode acontecer é o `codigo` mudar
   * junto, porque ele é o que está gravado em 126 vagas e em toda a trilha.
   */
  it("renomeia até uma linha de sistema, e o `codigo` continua o mesmo", async () => {
    const { alvo, banco } = await servicoDoCatalogo(statusSemente());
    const entregue = linhaDe(banco, "ENTREGUE") as LinhaStatus;
    await metodoDe(alvo, ["atualizar", "editar", "update"])(entregue.id, { rotulo: "Preenchida" });
    expect(linhaDe(banco, "ENTREGUE")?.rotulo).toBe("Preenchida");
    expect(linhaDe(banco, "ENTREGUE")?.codigo).toBe("ENTREGUE");
    expect(
      banco.escritas.filter((e) => e.tabela === "vagas"),
      "renomear é cosmético: nenhuma vaga pode ser tocada",
    ).toHaveLength(0);
  });

  it("muda ordem e tom de uma linha de sistema", async () => {
    const { alvo, banco } = await servicoDoCatalogo(statusSemente());
    const fechada = linhaDe(banco, "FECHADA") as LinhaStatus;
    await metodoDe(alvo, ["atualizar", "editar", "update"])(fechada.id, { ordem: 9, tom: "in" });
    expect(linhaDe(banco, "FECHADA")?.ordem).toBe(9);
    expect(linhaDe(banco, "FECHADA")?.tom).toBe("in");
  });

  it("cria um status LIVRE", async () => {
    const { alvo, banco } = await servicoDoCatalogo(statusSemente());
    await metodoDe(alvo, ["criar", "create"])({ ...NOVA_LIVRE });
    expect(linhaDe(banco, "STAND_BY"), "o catálogo é do diretor: status LIVRE novo entra").toBeDefined();
    expect(linhaDe(banco, "STAND_BY")?.papel).toBe("LIVRE");
  });

  it("apaga um status LIVRE que ninguém está usando", async () => {
    const { alvo, banco } = await servicoDoCatalogo([...statusSemente(), { ...STAND_BY }]);
    const standBy = linhaDe(banco, "STAND_BY") as LinhaStatus;
    await metodoDe(alvo, ["remover", "apagar", "excluir", "delete"])(standBy.id);
    expect(linhaDe(banco, "STAND_BY")).toBeUndefined();
  });
});
