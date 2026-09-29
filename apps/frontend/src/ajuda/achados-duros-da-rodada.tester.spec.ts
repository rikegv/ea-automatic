/**
 * ─ OS TRÊS ACHADOS DUROS DA MESMA RODADA, MEDIDOS PELO `tester` (§A.38, §A.40) ───────────────────
 *
 * ESCRITO POR QUEM NÃO ESCREVEU A CORREÇÃO. Os três entraram junto com a dispensa por span, e cada um
 * tem um lado que o autor mede naturalmente (funciona?) e um lado que só um segundo par de olhos mede
 * (o que ele não alcança? o que ele passou a alcançar sem querer?).
 *
 *   1. `LISTA_VAZIA`: print de lista vazia é achado duro, e a régua é fail-closed POR DECLARAÇÃO.
 *   2. `as_comerciais.rotulo` na DENYLIST (hoje aqueles nomes são pegos só pelo léxico, que é a
 *      proteção mais fraca), mais o efeito de segunda ordem: cliente ou loja batizado com nome de
 *      comercial sai sozinho da dispensa, por contenção.
 *   3. `\b` nos rótulos sensíveis: `conta` casava dentro de "contagem".
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  conferirListaPovoada,
  executarCaptura,
  FalhaDeCaptura,
  type CapturaComLinhas,
  type ContagemDaArea,
  type DependenciasCaptura,
} from "./captura";
import {
  conferirBaseAntesDoLote,
  montarNegadosDeEquipe,
  type LinhaPessoa,
  type TabelaDePessoas,
} from "./lote";
import {
  auditarTexto,
  montarVocabularioDoSistema,
  type AllowlistArnes,
  type NegadosDeEquipe,
} from "./pii";

const ALLOWLIST: AllowlistArnes = {
  nomes: ["Manual Do Sistema", "Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["manual@homolog.local"],
  contasBancarias: ["00000000-0"],
  matriculas: ["999001"],
};

const SEM_NEGADOS: NegadosDeEquipe = { nomes: [], emails: [] };

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1. `LISTA_VAZIA`
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ┌─ O ARGUMENTO QUE FAZ DISTO UM ACHADO DE GATE, E NÃO DE ESTÉTICA ─────────────────────────────┐
 * │ A tela vazia é o ÚNICO estado que passa no gate de dado pessoal POR CONSTRUÇÃO: lista sem linha  │
 * │ não tem PII, então o gate aprova porque está certo. É a armadilha do `TELA_VAZIA` disfarçada,     │
 * │ porque "Nenhuma admissão com os filtros atuais" É texto, e `TELA_VAZIA` nunca dispara.           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const PRINT: CapturaComLinhas = { arquivo: "01-lista.png", legenda: "A fila", alvos: [] };
const PRINT_VAZIO_DECLARADO: CapturaComLinhas = {
  ...PRINT,
  arquivo: "02-vazio.png",
  linhasEsperadas: "PODE_SER_VAZIA",
};

const conferir = (print: CapturaComLinhas, texto: string, contagem: ContagemDaArea) => () =>
  conferirListaPovoada("um-artigo", print, texto, contagem);

describe("LISTA_VAZIA: os dois lados da régua", () => {
  it("SEM declaração, lista PRESENTE e sem linha RECUSA (fail-closed por ausência)", () => {
    expect(conferir(PRINT, "Candidato Cliente Cargo", { listas: 1, linhas: 0 })).toThrow(
      FalhaDeCaptura,
    );
  });

  it("SEM declaração, o vazio ESCRITO em palavras RECUSA, mesmo sem tabela renderizada", () => {
    // A casa troca a tabela pela frase, então zero lista e zero linha é o estado NORMAL do vazio.
    expect(conferir(PRINT, "Nenhuma admissão com os filtros atuais.", { listas: 0, linhas: 0 })).toThrow(
      FalhaDeCaptura,
    );
    expect(conferir(PRINT, "Nenhum cliente neste filtro.", { listas: 0, linhas: 0 })).toThrow(
      FalhaDeCaptura,
    );
  });

  it("COM pelo menos uma linha, passa (é o caso normal do manual)", () => {
    expect(conferir(PRINT, "Mariana Alves Ribeiro", { listas: 1, linhas: 1 })).not.toThrow();
  });

  it("DECLARANDO zero explicitamente, passa: é o artigo que ENSINA o estado vazio", () => {
    expect(
      conferir(PRINT_VAZIO_DECLARADO, "Nenhuma admissão com os filtros atuais.", {
        listas: 1,
        linhas: 0,
      }),
    ).not.toThrow();
  });

  /**
   * A BORDA QUE MANTÉM O GATE USÁVEL: print de FORMULÁRIO (Nova Admissão, ficha, modal) tem zero
   * linha legitimamente, e não escreve o vazio em palavras. Exigir linha dele recusaria metade do
   * manual, e gate que recusa tudo é o que gera pressão para afrouxar o gate.
   */
  it("print de FORMULÁRIO (zero lista, zero linha, sem vazio escrito) passa", () => {
    expect(conferir(PRINT, "Nova Admissão Cliente Cargo Salvar", { listas: 0, linhas: 0 })).not.toThrow();
  });

  /**
   * "Nenhum" SOZINHO é opção de seletor ("Grupo: Nenhum") e aparece em tela cheia. A régua exige uma
   * palavra depois, e este é o contra-caso que prova que a exigência está em pé.
   */
  it("`Nenhum` como VALOR de um seletor não é estado vazio", () => {
    expect(conferir(PRINT, "Grupo: Nenhum", { listas: 0, linhas: 0 })).not.toThrow();
    expect(conferir(PRINT, "Projeto Nenhum", { listas: 0, linhas: 0 })).not.toThrow();
  });
});

/**
 * ─ O TRAP DOMINANTE: O ESTADO VAZIO RENDERIZADO COMO **UMA LINHA DE TABELA** ────────────────────
 *
 * ┌─ MEDIDO NO REPOSITÓRIO, 28/09/2026, E NÃO DEDUZIDO ──────────────────────────────────────────┐
 * │ O idioma DOMINANTE das tabelas da casa desenha o vazio DENTRO do `<tbody>`:                      │
 * │   `<tr><td colSpan={10}>Nenhum cliente neste filtro.</td></tr>`                                  │
 * │ (`app/(app)/admin/clientes/page.tsx:740-745`, e o mesmo padrão em 24 arquivos, 30 ocorrências;   │
 * │ o "Carregando…" idêntico em 30 arquivos, 34 ocorrências).                                        │
 * │                                                                                                │
 * │ `CONTAR` (`tools/ajuda/src/coleta.ts:82-90`) conta `tbody tr`, então essa ÚNICA linha do estado   │
 * │ vazio devolve `{ listas: 1, linhas: 1 }`. E `conferirListaPovoada` sai no                        │
 * │ `if (contagem.linhas > 0) return;` ANTES de olhar o vazio escrito. Ou seja: o achado duro novo é  │
 * │ contornado justamente pelo jeito que a maior parte das telas escreve o vazio.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CONTAGEM AQUI NÃO É INVENTADA: é o que `CONTAR` devolve para aquele DOM. O teste é do REQUISITO
 * ("lista vazia não vira print"), e por isso ele não se importa com qual das duas peças conserta:
 * pode ser a contagem (não contar a linha de colspan único como linha de dado) ou a régua (o vazio
 * escrito vencer a contagem). Qualquer das duas o deixa verde.
 */
describe("LISTA_VAZIA: o estado vazio desenhado COMO LINHA (o idioma dominante da casa)", () => {
  it("uma linha cujo conteúdo é o vazio ESCRITO não pode contar como linha de dado", () => {
    expect(
      conferir(PRINT, "Candidato Cliente Nenhum cliente neste filtro.", { listas: 1, linhas: 1 }),
    ).toThrow(FalhaDeCaptura);
  });

  it("o mesmo para `Carregando…`, que é a captura que aconteceu antes da tela carregar", () => {
    // É a causa realista do print mudo, e a mesma que justifica o `TELA_VAZIA` existir.
    expect(conferir(PRINT, "Candidato Cliente Carregando…", { listas: 1, linhas: 1 })).toThrow(
      FalhaDeCaptura,
    );
  });

  it("e a declaração explícita continua sendo a única saída", () => {
    expect(
      conferir(PRINT_VAZIO_DECLARADO, "Nenhum cliente neste filtro.", { listas: 1, linhas: 1 }),
    ).not.toThrow();
  });
});

/**
 * ─ A CONTAGEM NASCE DA **ÁREA RECORTADA**, NÃO DA PÁGINA ───────────────────────────────────────
 *
 * ┌─ POR QUE ISTO É A METADE QUE IMPORTA ────────────────────────────────────────────────────────┐
 * │ Print recortado é a medida de privacidade das telas que mostram gente (ver `Captura.recorte`), e │
 * │ o recorte típico é UM card de uma página cheia. Contando na PÁGINA, a tabela de outra região      │
 * │ satisfaz a régua e o card fotografado sai vazio com carimbo verde. Contar na CAIXA é o que faz a  │
 * │ régua medir o que a imagem realmente mostra, do mesmo jeito que o gate de PII audita a caixa.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("LISTA_VAZIA: a contagem é da CAIXA, e a recusa vem ANTES de existir imagem", () => {
  const pedidos: string[] = [];
  const deps = (contagem: ContagemDaArea, texto: string): DependenciasCaptura => ({
    allowlist: ALLOWLIST,
    negados: SEM_NEGADOS,
    resolverAlvo: async () => ({ x: 0, y: 0, largura: 10, altura: 10 }),
    lerTextoDaTela: async () => {
      pedidos.push("texto");
      return texto;
    },
    contarLinhasDaArea: async () => {
      pedidos.push("contagem");
      return contagem;
    },
    anotar: async () => {
      pedidos.push("anotar");
    },
    capturarPng: async () => {
      pedidos.push("png");
      return Buffer.from("");
    },
    gravar: async () => {
      pedidos.push("gravar");
    },
  });

  it("a área recortada vazia RECUSA, e nada é anotado, fotografado ou gravado", async () => {
    pedidos.length = 0;
    await expect(
      executarCaptura("um-artigo", PRINT, deps({ listas: 1, linhas: 0 }, "Candidato Cliente")),
    ).rejects.toThrow(FalhaDeCaptura);
    expect(pedidos).not.toContain("png");
    expect(pedidos).not.toContain("gravar");
    expect(pedidos).not.toContain("anotar");
  });

  it("a contagem é pedida ANTES do PNG, e a área povoada segue o caminho normal", async () => {
    pedidos.length = 0;
    await executarCaptura(
      "um-artigo",
      PRINT,
      deps({ listas: 1, linhas: 3 }, "Mariana Alves Ribeiro"),
    );
    expect(pedidos.indexOf("contagem")).toBeLessThan(pedidos.indexOf("png"));
    expect(pedidos).toContain("gravar");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2. `as_comerciais.rotulo` NA DENYLIST
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ┌─ POR QUE A DENYLIST, E NÃO O LÉXICO ─────────────────────────────────────────────────────────┐
 * │ `as_comerciais.rotulo` é 100% nome de pessoa por natureza (é o comercial responsável), e hoje     │
 * │ aqueles nomes só são pegos pelo LÉXICO, que é a proteção mais fraca do gate: ele depende de o     │
 * │ prenome ou o sobrenome estar na lista interna. Comercial com nome fora do léxico ("Kelvin Okamoto"│
 * │ ) passa batido, e nada falha.                                                                   │
 * │                                                                                                │
 * │ Na DENYLIST a proteção deixa de depender do léxico: a fonte é a TABELA, e o nome é PROCURADO em   │
 * │ cada imagem, antes e por fora de toda permissão (allowlist, catálogo, família de e-mail).         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const COMERCIAIS: LinhaPessoa[] = [
  { nome: "Kelvin Okamoto" }, // nenhuma das duas palavras está no léxico: hoje ele PASSA
  { nome: "Barbara Santos" },
];

describe("COMERCIAIS: o léxico não basta, a fonte tem de ser a tabela", () => {
  it("MEDIDO: nome de comercial fora do léxico passa quando a proteção é só o léxico", () => {
    // Este teste documenta o DEFEITO que motiva a mudança, e ele fica verde de propósito: é a
    // fotografia do estado sem denylist. Se um dia o léxico crescer e pegá-lo, ótimo, mas a proteção
    // não pode DEPENDER disso.
    expect(auditarTexto("Comercial Kelvin Okamoto", ALLOWLIST, SEM_NEGADOS).aprovado).toBe(true);
  });

  it("na DENYLIST, o mesmo nome recusa a imagem, sem o léxico ter opinião", () => {
    const negados = montarNegadosDeEquipe(COMERCIAIS, ALLOWLIST);
    expect(negados.nomes).toContain("Kelvin Okamoto");
    const v = auditarTexto("Comercial Kelvin Okamoto", ALLOWLIST, negados);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "NOME_DE_USUARIO")).toBe(true);
  });

  /**
   * ─ O EFEITO DE SEGUNDA ORDEM QUE O `seguranca` APONTOU, e ele é o mais valioso da mudança ──────
   *
   * `montarVocabularioDoSistema` subtrai por CONTENÇÃO: entrada de catálogo que CONTENHA um nome da
   * denylist é descartada na montagem. Logo, cliente ou loja batizado com nome de comercial sai
   * SOZINHO da dispensa, e a tela que o mostra volta a ser recusada. É rigor de graça, e vem pelo
   * mesmo ato de pôr o comercial na denylist.
   */
  it("EFEITO DE 2ª ORDEM: cliente batizado com nome de comercial SAI da dispensa", () => {
    const negados = montarNegadosDeEquipe(COMERCIAIS, ALLOWLIST);
    const catalogo = ["KELVIN OKAMOTO SERVICOS LTDA", "Loja Barbara Santos", "Sao Paulo"];
    const vocabulario = montarVocabularioDoSistema(catalogo, negados);
    expect(vocabulario.valores).not.toContain("KELVIN OKAMOTO SERVICOS LTDA");
    expect(vocabulario.valores).not.toContain("Loja Barbara Santos");
    expect(vocabulario.valores).toContain("Sao Paulo"); // o descarte é CIRÚRGICO
    const v = auditarTexto("Cliente KELVIN OKAMOTO SERVICOS LTDA", ALLOWLIST, negados, vocabulario);
    expect(v.aprovado).toBe(false);
  });

  /**
   * O RESIDUAL, DECLARADO PARA NINGUÉM CONFIAR NO QUE NÃO EXISTE: comercial com rótulo de UMA palavra
   * não gera variante (`variantesDeNomeDeUsuario` exige duas, senão "Fernando" isolado recusaria meia
   * interface). Ele NÃO é protegido pela denylist, e também não subtrai catálogo.
   */
  it("RESIDUAL: rótulo de comercial com UMA palavra não entra na busca", () => {
    const negados = montarNegadosDeEquipe([{ nome: "Kelvin" }], ALLOWLIST);
    expect(auditarTexto("Comercial Kelvin Okamoto", ALLOWLIST, negados).aprovado).toBe(true);
  });
});

/**
 * ─ A FIAÇÃO, QUE É O QUE FALTA DE VERDADE ──────────────────────────────────────────────────────
 *
 * Os testes acima provam a REGRA com as linhas injetadas. O que ainda não existe é o motor PEDIR a
 * tabela dos comerciais no arranque do lote, e sem isso a regra nunca é exercitada em produção: a
 * denylist continua sendo montada só de `usuarios`.
 *
 * O TESTE NÃO FIXA O NOME DA TABELA (`as_comerciais` ou `comerciais`): ele exige que ALGUMA tabela de
 * comercial seja pedida, porque o nome é decisão de quem constrói e o requisito é a proteção existir.
 */
describe("COMERCIAIS: a fiação do arranque do lote", () => {
  const pedidas: string[] = [];
  const linhas: Record<string, LinhaPessoa[]> = {
    candidatos: [
      { nome: "Mariana Alves Ribeiro", cpf: "99900000191", email: "mariana@homolog.local" },
    ],
    usuarios: [{ nome: "Manual Do Sistema", email: "manual@homolog.local" }],
  };

  const deps = {
    allowlist: ALLOWLIST,
    reguaDeUsuarios: "DETECCAO_POR_IMAGEM" as const,
    amostrarPessoas: async (tabela: TabelaDePessoas) => {
      pedidas.push(tabela);
      if (/comercia/i.test(tabela)) return COMERCIAIS;
      return linhas[tabela] ?? [];
    },
  };

  it("o arranque PEDE a tabela dos comerciais", async () => {
    pedidas.length = 0;
    await conferirBaseAntesDoLote(deps);
    expect(pedidas.some((t) => /comercia/i.test(t))).toBe(true);
  });

  it("e os comerciais chegam na DENYLIST que o lote devolve", async () => {
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.negados.nomes).toContain("Kelvin Okamoto");
  });

  /**
   * ─ A ARMADILHA DA FIAÇÃO, E ELA DERRUBA O LOTE INTEIRO SE FOR FEITA DO JEITO ÓBVIO ────────────
   *
   * Acrescentar a tabela à lista e deixá-la na régua ESTRITA reprova a base no arranque: o rótulo do
   * comercial é nome de pessoa de verdade, então `linhaForaDoPadrao` o recusa, e NENHUMA captura
   * acontece. O comercial é como o usuário do time: ele PERMANECE, e a régua dele é detecção por
   * IMAGEM, não trava de população. O sintoma do erro é o lote nunca começar, com a mensagem
   * mandando "anonimizar" uma tabela que não tem o que anonimizar.
   */
  it("a base continua APROVADA: comercial é detecção por imagem, não trava de população", async () => {
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(true);
    expect(v.totalForaDoPadrao).toBe(0);
  });

  /**
   * E A AMOSTRA VAZIA CONTINUA REPROVANDO, pelo mesmo motivo das outras duas tabelas: zero linha não é
   * prova de limpeza, é consulta que falhou. Aqui, pior: falha de leitura viraria denylist SEM os
   * comerciais, ou seja, exatamente a proteção que se está construindo, desligada em silêncio.
   */
  it("amostra vazia da tabela de comerciais REPROVA o lote (consulta torta não é base limpa)", async () => {
    const vazia = {
      ...deps,
      amostrarPessoas: async (tabela: TabelaDePessoas) => {
        if (/comercia/i.test(tabela)) return [];
        return linhas[tabela] ?? [];
      },
    };
    const v = await conferirBaseAntesDoLote(vazia);
    expect(v.aprovado).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3. `\b` NOS RÓTULOS SENSÍVEIS
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ┌─ O DEFEITO MEDIDO ───────────────────────────────────────────────────────────────────────────┐
 * │ `/ag[eê]ncia|conta|pix/gi` casa "conta" DENTRO de "contagem", e um roteiro do manual fotografa   │
 * │ exatamente "a contagem das linhas marcadas": qualquer número de 4 dígitos na vizinhança virava    │
 * │ `CONTA_BANCARIA` e a tela era recusada por um rótulo que não está ali.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E O LADO QUE NÃO PODE TER SIDO PAGO PELA CORREÇÃO: `\bconta\b` estrito trocaria o falso positivo
 * por um falso NEGATIVO, porque a tela escreve "Contas" no plural e "Agências" também. Falso negativo
 * em gate de PII é dado no repositório, para sempre (§A.6). É este par que os dois blocos medem.
 */
describe("RÓTULO É PALAVRA INTEIRA: o que deixa de disparar", () => {
  const tipos = (t: string) => auditarTexto(t, ALLOWLIST, SEM_NEGADOS).achados.map((a) => a.tipo);

  it("`contagem` não é `conta` (o caso real do roteiro)", () => {
    expect(tipos("A contagem das linhas marcadas é 1812")).not.toContain("CONTA_BANCARIA");
    expect(tipos("Contagem: 1812 auditorias finalizadas")).not.toContain("CONTA_BANCARIA");
  });

  it("as outras palavras que continham um rótulo por acidente", () => {
    expect(tipos("Pixel Ratio 2048")).not.toContain("CONTA_BANCARIA");
    expect(tipos("Contabilidade 4021")).not.toContain("CONTA_BANCARIA");
    expect(tipos("Agenciamento 3841")).not.toContain("CONTA_BANCARIA");
    expect(tipos("Renascimento 15/03/1988")).not.toContain("NASCIMENTO");
    expect(tipos("Descontar 4021")).not.toContain("CONTA_BANCARIA");
  });

  it("a tela inteira do roteiro que era recusada passa a passar", () => {
    const v = auditarTexto(
      ["Auditoria Documental", "A contagem das linhas marcadas é 1812", "Vaga: SIM-2026-0501"].join("\n"),
      ALLOWLIST,
      SEM_NEGADOS,
    );
    expect(v.achados).toEqual([]);
    expect(v.aprovado).toBe(true);
  });
});

describe("RÓTULO É PALAVRA INTEIRA: o que NÃO pode ter deixado de disparar", () => {
  const tipos = (t: string) => auditarTexto(t, ALLOWLIST, SEM_NEGADOS).achados.map((a) => a.tipo);

  it("o rótulo de verdade, no singular", () => {
    expect(tipos("Conta: 87421-6")).toContain("CONTA_BANCARIA");
    expect(tipos("Agência: 3841")).toContain("CONTA_BANCARIA");
    expect(tipos("Chave Pix: 41998765")).toContain("CONTA_BANCARIA");
    expect(tipos("Matrícula: 40871")).toContain("MATRICULA");
    expect(tipos("Nascimento: 04/11/1979")).toContain("NASCIMENTO");
    expect(tipos("Salário: R$ 7.320,45")).toContain("SALARIO");
  });

  /**
   * O PLURAL É O PREÇO QUE A CORREÇÃO PODERIA TER COBRADO SEM NINGUÉM VER: a tela escreve "Contas
   * Bancárias", "Agências", "Matrículas", "Salários" (§A.24, title case), e `\bconta\b` puro deixaria
   * de casar todos eles. Falso negativo aqui é CPF, conta e salário indo para o PNG versionado.
   */
  it("o rótulo no PLURAL, que é como a casa escreve o título da coluna", () => {
    expect(tipos("Contas: 87421-6")).toContain("CONTA_BANCARIA");
    expect(tipos("Agências: 3841")).toContain("CONTA_BANCARIA");
    expect(tipos("Matrículas: 40871")).toContain("MATRICULA");
    expect(tipos("Salários: R$ 7.320,45")).toContain("SALARIO");
    expect(tipos("Endereços: Avenida Paulista, 1578")).toContain("ENDERECO");
  });

  it("o rótulo com acento e sem, e em caixa alta, que é o que a tabela desenha", () => {
    expect(tipos("AGENCIA: 3841")).toContain("CONTA_BANCARIA");
    expect(tipos("AGÊNCIA: 3841")).toContain("CONTA_BANCARIA");
    expect(tipos("MATRICULA: 40871")).toContain("MATRICULA");
    expect(tipos("NASC. 04/11/1979")).toContain("NASCIMENTO");
  });

  it("o rótulo colado no valor, sem espaço nem dois-pontos", () => {
    // A tabela parte a célula em dois nós e o `textoAuditavel` os concatena: o rótulo chega colado.
    expect(tipos("Conta87421-6")).toContain("CONTA_BANCARIA");
    expect(tipos("Matrícula40871")).toContain("MATRICULA");
  });

  it("e o valor do ARNÊS continua dispensado (o gate não pode recusar o cenário sintético)", () => {
    expect(tipos("Conta: 00000000-0")).not.toContain("CONTA_BANCARIA");
    expect(tipos("Matrícula: 999001")).not.toContain("MATRICULA");
  });
});
