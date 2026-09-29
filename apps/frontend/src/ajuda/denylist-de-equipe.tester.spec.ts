/**
 * ─ A DENYLIST DE EQUIPE: A FIAÇÃO, O ALCANCE E A SUBTRAÇÃO (§A.6, §A.38) ────────────────────────
 *
 * ESCRITO PELO `tester`, que não escreveu o motor nem a correção (§A.38).
 *
 * ┌─ O QUE MUDOU, E POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────────┐
 * │ Os usuários da homologação são REAIS: é o time do diretor testando, eles permanecem na base e  │
 * │ não podem aparecer em print. A asserção de arranque original exigia zero linha fora do padrão  │
 * │ em `candidatos` E em `usuarios`, e com gente real permanente ela NUNCA passaria. A correção     │
 * │ separou as duas réguas: `candidatos` segue estrito; `usuarios` deixa de barrar o lote e passa a │
 * │ alimentar uma DENYLIST de nomes e e-mails, lida do banco, que o gate procura em CADA imagem.    │
 * │                                                                                                │
 * │ A TROCA É BOA E TEM UM PREÇO NOVO: a proteção deixou de ser uma propriedade da POPULAÇÃO (que  │
 * │ vale sozinha) e passou a ser uma propriedade da FIAÇÃO (que só vale se alguém entregar a lista  │
 * │ adiante). Proteção que depende de entrega tem um jeito novo de falhar, e ele é silencioso.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O TESTE DE FIAÇÃO É O MAIS IMPORTANTE DESTE ARQUIVO ────────────────────────────────┐
 * │ O `seguranca` mediu a mesma tela, com nome e e-mail de colega real, sendo RECUSADA pelo        │
 * │ caminho de conferência e APROVADA, com zero achado, pelo caminho que GRAVA. A regra estava      │
 * │ certa, a função estava certa, e o gate estava cego porque a lista não chegava nele.            │
 * │                                                                                                │
 * │ NÃO BASTA TESTAR QUE A FUNÇÃO RECUSA QUANDO RECEBE A LISTA: isso é o que já estava verde        │
 * │ enquanto o furo existia. O que se mede aqui é que quem grava ENTREGA a lista. Testar a regra    │
 * │ sem testar a entrega é o formato exato desse defeito.                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from "vitest";
import {
  conferirBaseAntesDoLote,
  executarLote,
  type LinhaPessoa,
  montarNegadosDeEquipe,
  nomeExibidoDoEmail,
  type TabelaDePessoas,
} from "./lote";
import {
  auditarDom,
  auditarTelaDoManual,
  auditarTexto,
  type AllowlistArnes,
  type NegadosDeEquipe,
  variantesDeNomeDeUsuario,
} from "./pii";

/**
 * A CONTA QUE CAPTURA está declarada no arnês, e é a única subtração legítima da denylist: ela
 * aparece na saudação, no avatar e na autoria de tudo o que a sessão de captura fizer. Sem a
 * subtração, o gate recusaria a própria conta que tira o print.
 */
const ALLOWLIST: AllowlistArnes = {
  nomes: ["Manual Do Sistema", "Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["manual@homolog.local", "mariana.alves@exemplo.invalid"],
};

const CANDIDATOS: LinhaPessoa[] = [
  { nome: "Mariana Alves Ribeiro", cpf: "99900000191", email: "mariana.alves@exemplo.invalid" },
];

/** O time de verdade: nome completo, e-mail da casa, e um com e-mail `@homolog.local`. */
const USUARIOS_REAIS: LinhaPessoa[] = [
  { nome: "Manual Do Sistema", email: "manual@homolog.local" },
  { nome: "Henrique Vieira Santana", email: "henrique.vieira@soulan.com.br" },
  { nome: "Ana Ribeiro", email: "ana.ribeiro@homolog.local" },
];

/**
 * ─ `comerciais` É A TERCEIRA TABELA DE GENTE, E ELA NÃO É UM APÊNDICE DE `usuarios` ─────────────
 *
 * O menu `clientes` entrega uma rota que LISTA o time comercial, e nenhuma dessas pessoas está em
 * `usuarios`: elas não têm login. Antes desta fonte, elas eram protegidas SÓ pelo léxico de nome, que
 * é a defesa mais fraca do desenho, e `Kelvin Okamoto` (nenhuma das duas palavras no léxico) passava.
 *
 * ┌─ NÃO "SIMPLIFIQUE" ESTE `Record` DE VOLTA PARA UM TERNÁRIO, E O MOTIVO FOI MEDIDO AQUI ──────┐
 * │ Três listas onde caberia `t === "candidatos" ? X : Y` parece cerimônia, e é o contrário. O stub  │
 * │ ternário foi o que existiu até 28/09/2026, e quando `comerciais` nasceu ele passou a devolver a  │
 * │ lista de `usuarios` para a tabela nova, POR ACIDENTE, pelo galho do `else`. Resultado: 28 testes  │
 * │ verdes sem que nenhum deles provasse que a terceira tabela é LIDA. Bastaria o código consultar    │
 * │ duas tabelas e nunca perguntar pela terceira, e a denylist sairia sem as 3 pessoas do comercial,  │
 * │ com a suíte inteira aprovando.                                                                   │
 * │                                                                                                 │
 * │ É O MESMO DEFEITO QUE ESTA FRENTE PERSEGUE DESDE O PRIMEIRO DIA: dado declarado num lado e não   │
 * │ consumido no outro, com tudo verde (o `docsPendentes` da §A.22, o `controles` que a busca não     │
 * │ indexava, a denylist que não chegava ao caminho que grava). Aqui ele apareceu DENTRO do próprio   │
 * │ teste, que é o lugar mais difícil de olhar, porque teste verde não se desconfia.                  │
 * │                                                                                                 │
 * │ O `Record<TabelaDePessoas, ...>` é a trava: tabela nova não compila até ganhar a sua lista, e a   │
 * │ lista é distinta das outras, então "a tabela foi perguntada?" passa a ser uma pergunta com        │
 * │ resposta. É o que o teste "as TRÊS tabelas são consultadas" mede, pelas CHAMADAS e não pelo       │
 * │ resultado.                                                                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const COMERCIAIS: LinhaPessoa[] = [
  { nome: "Kelvin Okamoto", email: "kelvin.okamoto@soulan.com.br" },
  { nome: "Priscila Yamaguchi" },
];

const POPULACAO: Record<TabelaDePessoas, LinhaPessoa[]> = {
  candidatos: CANDIDATOS,
  usuarios: USUARIOS_REAIS,
  comerciais: COMERCIAIS,
};

function deps(over: Record<string, unknown> = {}) {
  return {
    allowlist: ALLOWLIST,
    reguaDeUsuarios: "DETECCAO_POR_IMAGEM" as const,
    /**
     * ─ OBRIGATÓRIO NO TIPO, E ESTA É A TERCEIRA VEZ NA MESMA FRENTE ────────────────────────────
     *
     * PARÂMETRO OPCIONAL EM CONTROLE DE SEGURANÇA É FAIL-OPEN SILENCIOSO. Foi assim com o
     * `negados`: enquanto era `negados?`, o caminho que GRAVA descartava a denylist e nada
     * quebrava, nem typecheck nem os testes. Depois com o `contarLinhasDaArea`. Agora aqui.
     *
     * E o motivo de ele ter nascido opcional NÃO foi desenho, foi PROCESSO: torná-lo obrigatório
     * quebraria este stub, e quem constrói não pode editar os meus specs (§A.38). Então a linha
     * abaixo é o que destrava a obrigatoriedade, e é por isso que ela existe mesmo nos testes que
     * não medem coluna nenhuma.
     */
    amostrarColunaDePessoa: vi.fn(async () => []),
    amostrarPessoas: vi.fn(async (t: TabelaDePessoas) => POPULACAO[t]),
    ...over,
  };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A FIAÇÃO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("FIAÇÃO: quem recebe licença para capturar RECEBE a denylist no mesmo ato", () => {
  it("a asserção de arranque devolve a denylist junto da aprovação", async () => {
    const v = await conferirBaseAntesDoLote(deps());
    expect(v.aprovado).toBe(true);
    expect(v.negados.nomes.length).toBeGreaterThan(0);
    expect(v.negados.emails.length).toBeGreaterThan(0);
  });

  /**
   * O TESTE QUE TERIA PEGO A FRESTA. A licença de capturar e o conjunto que o gate precisa procurar
   * chegam pelo MESMO caminho: o segundo argumento de `capturar`. Não há como receber uma sem a
   * outra, e é isso que se afirma aqui, roteiro por roteiro.
   */
  it("`executarLote` ENTREGA a denylist ao `capturar`, em TODOS os roteiros", async () => {
    const recebidos: NegadosDeEquipe[] = [];
    const capturar = vi.fn(async (_r: { slug: string }, negados: NegadosDeEquipe) => {
      recebidos.push(negados);
    });
    await executarLote([{ slug: "um" }, { slug: "dois" }, { slug: "tres" }], {
      ...deps(),
      capturar,
    });
    expect(recebidos).toHaveLength(3);
    for (const n of recebidos) {
      expect(n.nomes).toContain("Henrique Vieira Santana");
      expect(n.emails).toContain("henrique.vieira@soulan.com.br");
    }
  });

  it("a denylist entregue é a MESMA que a asserção montou, sem reconstrução pelo caminho", async () => {
    const v = await conferirBaseAntesDoLote(deps());
    let recebido: NegadosDeEquipe | undefined;
    await executarLote([{ slug: "um" }], {
      ...deps(),
      capturar: async (_r, negados) => {
        recebido = negados;
      },
    });
    expect(recebido?.nomes.sort()).toEqual(v.negados.nomes.sort());
    expect(recebido?.emails.sort()).toEqual(v.negados.emails.sort());
  });

  /**
   * ─ O AFROUXAMENTO É UM ATO DECLARADO, E ESQUECER DE DECLARAR FALHA FECHADO ────────────────────
   *
   * Sem `DETECCAO_POR_IMAGEM`, `usuarios` volta à régua estrita e o time real REPROVA o lote. É a
   * ordem certa das duas defesas: ou a população é sintética, ou a denylist está em pé. Nunca
   * nenhuma das duas.
   */
  it("sem declarar a régua nova, usuário real REPROVA o lote e nada é capturado", async () => {
    const capturar = vi.fn(async () => {});
    await expect(
      executarLote([{ slug: "um" }], { ...deps({ reguaDeUsuarios: undefined }), capturar }),
    ).rejects.toThrow();
    expect(capturar).not.toHaveBeenCalled();
  });

  /**
   * O QUE A RÉGUA NOVA **NÃO** AFROUXA: o CPF. Manter o time na base não exige CPF de ninguém em
   * `usuarios`, e CPF é o único dado que a detecção por imagem teria de achar sem folga nenhuma.
   */
  it("mesmo na régua nova, CPF real em `usuarios` reprova o lote", async () => {
    const capturar = vi.fn(async () => {});
    const comCpf = [...USUARIOS_REAIS, { nome: "Ana Ribeiro", cpf: "12345678909" }];
    await expect(
      executarLote([{ slug: "um" }], {
        ...deps({
          amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
            t === "usuarios" ? comCpf : POPULACAO[t],
          ),
        }),
        capturar,
      }),
    ).rejects.toThrow();
    expect(capturar).not.toHaveBeenCalled();
  });

  /**
   * A TERCEIRA TABELA É LIDA, E ISSO SE PROVA PELA PERGUNTA, não pelo resultado: se ninguém
   * consultar `comerciais`, a denylist fica sem as 3 pessoas e nada falha em lugar nenhum.
   */
  it("as TRÊS tabelas são consultadas, e `comerciais` é uma delas", async () => {
    const d = deps();
    await conferirBaseAntesDoLote(d);
    const perguntadas = (d.amostrarPessoas as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(perguntadas).toContain("candidatos");
    expect(perguntadas).toContain("usuarios");
    expect(perguntadas).toContain("comerciais");
  });

  it("o comercial entra na denylist e chega ao `capturar`, mesmo sem ter login", async () => {
    let recebido: NegadosDeEquipe | undefined;
    await executarLote([{ slug: "um" }], {
      ...deps(),
      capturar: async (_r, negados) => {
        recebido = negados;
      },
    });
    expect(recebido?.nomes).toContain("Kelvin Okamoto");
    expect(recebido?.emails).toContain("kelvin.okamoto@soulan.com.br");
  });

  /**
   * O CASO QUE MEDE O GANHO: `Kelvin Okamoto` não tem nenhuma palavra no léxico de prenome ou
   * sobrenome, então o detector de nome comum NUNCA dispararia com ele. Sem a terceira tabela, esta
   * tela seria gravada. Comercial sem e-mail cadastrado também entra, pelo nome.
   */
  it("nome que o léxico não reconhece passa a RECUSAR a tela, que era o furo", async () => {
    const v = await conferirBaseAntesDoLote(deps());
    expect(auditarTexto("Comercial: Kelvin Okamoto", ALLOWLIST).aprovado).toBe(true);
    expect(auditarTexto("Comercial: Kelvin Okamoto", ALLOWLIST, v.negados).aprovado).toBe(false);
    expect(auditarTexto("Responsavel Priscila Yamaguchi", ALLOWLIST, v.negados).aprovado).toBe(false);
  });

  /**
   * E A RÉGUA DE `comerciais` É A DE `usuarios`, NUNCA A DE `candidatos`: eles são reais e
   * PERMANECEM, então não podem BARRAR o lote por população. Barrar mandaria alguém "anonimizar" uma
   * tabela que não tem o que anonimizar, e o caminho de menor resistência dali é desligar a régua.
   */
  it("o comercial real NÃO barra o lote: ele vira busca por imagem, como o usuário", async () => {
    const capturar = vi.fn(async () => {});
    await executarLote([{ slug: "um" }], { ...deps(), capturar });
    expect(capturar).toHaveBeenCalledTimes(1);
  });

  it("`candidatos` continua ESTRITO: uma pessoa real ali reprova, com a régua nova ligada", async () => {
    const capturar = vi.fn(async () => {});
    await expect(
      executarLote([{ slug: "um" }], {
        ...deps({
          amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
            t === "candidatos"
              ? [{ nome: "Juliana Petrocelli Barbosa", cpf: "12345678909" }]
              : POPULACAO[t],
          ),
        }),
        capturar,
      }),
    ).rejects.toThrow();
    expect(capturar).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. O QUE A DENYLIST PEGA
// ────────────────────────────────────────────────────────────────────────────────────────────────

const NEGADOS: NegadosDeEquipe = {
  nomes: ["Henrique Vieira Santana", "Ana Ribeiro"],
  emails: ["henrique.vieira@soulan.com.br", "ana.ribeiro@homolog.local"],
};

describe("ALCANCE: o que a denylist PEGA", () => {
  const achou = (texto: string, tipo = "NOME_DE_USUARIO") =>
    auditarTexto(texto, ALLOWLIST, NEGADOS).achados.some((a) => a.tipo === tipo);

  it("nome completo, como o cadastro o escreve", () => {
    expect(achou("Responsável: Henrique Vieira Santana")).toBe(true);
  });

  /**
   * PRENOME MAIS SOBRENOME DE UM CADASTRO DE TRÊS PALAVRAS. É a forma que a coluna estreita e o
   * seletor de responsável desenham, e procurar só a forma completa a deixaria passar.
   */
  it("prenome mais último sobrenome, de um cadastro de três palavras", () => {
    expect(achou("Criado por Henrique Santana")).toBe(true);
  });

  it("prenome mais sobrenome do meio, que é a outra forma abreviada comum", () => {
    expect(achou("Henrique Vieira aprovou")).toBe(true);
  });

  it("no `title` e no `aria-label`, que o pixel não mostra e o tooltip revela", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `
      <button title="Abrir ficha de Henrique Vieira Santana">Ver</button>
      <span aria-label="Responsável Ana Ribeiro">resp</span>
    `;
    const v = auditarDom(raiz, ALLOWLIST, NEGADOS);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "NOME_DE_USUARIO")).toBe(true);
  });

  /**
   * O NOME DENTRO DO E-MAIL, que é a forma MAIS onipresente: a barra lateral e o painel derivam o
   * nome exibido do pedaço antes do `@`. Um print de qualquer tela logada carrega essa forma.
   */
  it("o nome derivado do e-mail, que é o que a barra lateral desenha", () => {
    expect(nomeExibidoDoEmail("henrique.vieira@soulan.com.br")).toBe("Henrique Vieira");
    const negados = montarNegadosDeEquipe(USUARIOS_REAIS, ALLOWLIST);
    expect(negados.nomes).toContain("Henrique Vieira");
    expect(auditarTexto("Olá, Henrique Vieira", ALLOWLIST, negados).aprovado).toBe(false);
  });

  it("o e-mail literal, com tipo próprio", () => {
    expect(achou("Contato: henrique.vieira@soulan.com.br", "EMAIL_DE_USUARIO")).toBe(true);
  });

  /**
   * NOME QUEBRADO EM DUAS LINHAS. A tabela quebra o nome dentro da célula, e o texto auditado vem
   * com a quebra no meio. Procurar a forma com um espaço só deixaria passar exatamente o print da
   * tabela, que é a tela mais fotografada do manual.
   */
  it("nome quebrado em duas linhas dentro da mesma célula", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<td><span>Henrique Vieira</span><br /><span>Santana</span></td>`;
    expect(auditarDom(raiz, ALLOWLIST, NEGADOS).aprovado).toBe(false);
  });

  it("nome com ligação no meio, escrito de um lado e sem ela do outro", () => {
    // O cadastro diz "Ana Ribeiro"; a tela escreve "Ana De Ribeiro".
    expect(achou("Ana De Ribeiro")).toBe(true);
  });

  /**
   * A DENYLIST PASSA POR FORA DE TODA PERMISSÃO, e é isso que a distingue do detector de nome comum:
   * nem a allowlist, nem o léxico de prenome, nem a família `@homolog.local` tiram um colega daqui.
   * O e-mail `@homolog.local` é dispensado pelo gate comum por ser família sintética declarada, e
   * mesmo assim a pessoa continua recusada.
   */
  it("família de e-mail sintética NÃO dispensa o colega real", () => {
    const v = auditarTexto("Ana Ribeiro · ana.ribeiro@homolog.local", ALLOWLIST, NEGADOS);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "NOME_DE_USUARIO")).toBe(true);
    expect(v.achados.some((a) => a.tipo === "EMAIL_DE_USUARIO")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. AS TRÊS LACUNAS CONHECIDAS
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ─ O QUE A DENYLIST NÃO PEGA, ESCRITO DE PROPÓSITO ──────────────────────────────────────────────
 *
 * ┌─ POR QUE AS LACUNAS TÊM TESTE EM VEZ DE COMENTÁRIO ──────────────────────────────────────────┐
 * │ Sem estes três casos escritos, a próxima sessão "descobre" a lacuna, acha que é defeito, e a    │
 * │ fecha do único jeito aparente: procurar nome de uma palavra só, ou casar por inicial. Qualquer │
 * │ um dos dois RECUSA A BASE SINTÉTICA INTEIRA, porque "Ana", "Carlos" e "F." aparecem em toda    │
 * │ tela, inclusive nos candidatos do arnês. O gate para de gravar, e a pressão que isso cria é o   │
 * │ que faz alguém afrouxar o gate de verdade, que é o extremo oposto e o pior dos dois.           │
 * │                                                                                                │
 * │ Então a lacuna é DECISÃO, e o teste é o registro dela. Mudar qualquer uma destas três é mudar   │
 * │ uma decisão, e aí o teste vermelho é a conversa que tem de acontecer, não um estorvo.          │
 * │                                                                                                │
 * │ O QUE COBRE O QUE ELAS DEIXAM PASSAR: o print é conferido por olho humano na validação (§A.13),│
 * │ e a régua do conteúdo é não fotografar tela que mostre autoria de colega quando o recorte pode  │
 * │ evitá-la (§3.4 item 4).                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("LACUNAS CONHECIDAS: o que a denylist deixa passar, por decisão", () => {
  /** A lacuna é da DENYLIST: ausência de `NOME_DE_USUARIO`. O gate tem outras camadas, ver abaixo. */
  const denylistPassou = (texto: string) =>
    !auditarTexto(texto, ALLOWLIST, NEGADOS).achados.some((a) => a.tipo === "NOME_DE_USUARIO");
  /**
   * O GATE AQUI É O **DA IMAGEM** (`auditarTelaDoManual`), e a distinção nasceu no veto do `seguranca`
   * da rodada 5: a chave do diretor vale para o print do manual, e `auditarTexto` passou a ser a régua
   * COMPLETA, que a asserção de população usa. Estas lacunas são sobre o que vai para o PNG.
   */
  const gateAprovou = (texto: string) => auditarTelaDoManual(texto, ALLOWLIST, NEGADOS).aprovado;

  it("LACUNA 1, só o primeiro nome: procurar `Henrique` isolado recusaria meia interface", () => {
    expect(denylistPassou("Aprovado por Henrique")).toBe(true);
    expect(variantesDeNomeDeUsuario("Henrique")).toEqual([]);
    // E aqui NENHUMA camada pega: a tela seria gravada. É a lacuna de verdade das três.
    expect(gateAprovou("Aprovado por Henrique")).toBe(true);
  });

  /**
   * ─ LACUNA 2 REABRIU, E ESTA ASSERÇÃO FOI INVERTIDA PARA DIZER ISSO (rodada 4, 28/09/2026) ─────
   *
   * A redação anterior dizia que a lacuna era MENOR do que o mapa afirmava: a denylist não casa a
   * forma abreviada (as variantes são de palavras inteiras), mas o DETECTOR DE NOME COMUM casava, e o
   * gate recusava a tela por outra camada. Essa segunda camada foi DESLIGADA pelo diretor.
   *
   * Resultado medido: "Henrique V. Santana" e "Ana R." passam por TODAS as camadas. A lacuna voltou
   * ao tamanho que o mapa original dizia, e ela está aqui AFIRMADA em vez de descrita, porque foi
   * justamente uma descrição desatualizada que quase fez alguém "consertar" a denylist pagando o
   * preço da lacuna 1. Se o diretor quiser fechá-la, o caminho é a denylist casar forma abreviada, e
   * este teste é o que vira verde quando isso acontecer.
   */
  it("LACUNA 2 REABERTA, nome abreviado do time: passa por todas as camadas", () => {
    expect(denylistPassou("Henrique V. Santana")).toBe(true);
    expect(denylistPassou("Ana R.")).toBe(true);
    expect(gateAprovou("Henrique V. Santana")).toBe(true);
    expect(gateAprovou("Ana R.")).toBe(true);
  });

  it("LACUNA 3, iniciais: `H.V.S.` e o avatar de duas letras passam por TODAS as camadas", () => {
    expect(denylistPassou("H.V.S.")).toBe(true);
    expect(denylistPassou("HV")).toBe(true);
    expect(gateAprovou("H.V.S.")).toBe(true);
    expect(gateAprovou("HV")).toBe(true);
  });

  /**
   * A RAZÃO DAS TRÊS, MEDIDA EM VEZ DE ARGUMENTADA: o primeiro nome dos colegas colide com o dos
   * candidatos do arnês. Fechar a lacuna 1 recusaria a tela sintética legítima, que é o cenário que
   * o manual precisa fotografar 400 vezes.
   */
  it("a prova de que fechar a lacuna 1 quebraria a frente: o sintético legítimo passa hoje", () => {
    const negados = montarNegadosDeEquipe([{ nome: "Mariana Costa", email: "m@homolog.local" }], {
      ...ALLOWLIST,
      nomes: ["Manual Do Sistema"],
    });
    // "Mariana" é prenome de colega E do candidato do arnês. Só a forma de duas palavras é buscada.
    expect(negados.nomes).toContain("Mariana Costa");
    expect(auditarTexto("Mariana Alves Ribeiro · 999.000.001-91", ALLOWLIST, negados).aprovado).toBe(
      true,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. A SUBTRAÇÃO DA CONTA DE CAPTURA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("SUBTRAÇÃO: a conta de captura sai da denylist, e SÓ ela", () => {
  // 36 usuários: a conta declarada no arnês mais 35 pessoas. E-mail de um token só de propósito,
  // para a derivação de nome não acrescentar linha e a contagem medir o que diz medir.
  const TRINTA_E_CINCO: LinhaPessoa[] = Array.from({ length: 35 }, (_, i) => ({
    nome: `Colega Numero ${String(i + 1).padStart(2, "0")}`,
    email: `u${String(i + 1).padStart(2, "0")}@homolog.local`,
  }));
  const TRINTA_E_SEIS = [{ nome: "Manual Do Sistema", email: "manual@homolog.local" }, ...TRINTA_E_CINCO];

  it("a conta declarada no arnês NÃO entra na denylist, e os outros 35 entram", () => {
    const negados = montarNegadosDeEquipe(TRINTA_E_SEIS, ALLOWLIST);
    expect(negados.nomes).not.toContain("Manual Do Sistema");
    expect(negados.emails).not.toContain("manual@homolog.local");
    expect(negados.nomes).toHaveLength(35);
    expect(negados.emails).toHaveLength(35);
    for (const u of TRINTA_E_CINCO) expect(negados.nomes).toContain(u.nome!);
  });

  it("o gate aprova a tela que mostra a conta de captura, que aparece em TODO print logado", () => {
    const negados = montarNegadosDeEquipe(TRINTA_E_SEIS, ALLOWLIST);
    const v = auditarTexto("Olá, Manual Do Sistema · manual@homolog.local", ALLOWLIST, negados);
    expect(v.achados).toEqual([]);
    expect(v.aprovado).toBe(true);
  });

  /**
   * ─ A SUBTRAÇÃO É LITERAL, VALOR A VALOR, E NUNCA POR FAMÍLIA ─────────────────────────────────
   *
   * Subtrair por família (o domínio `@homolog.local`, o prefixo "Manual") tiraria da proteção 27 dos
   * 33 usuários reais da homologação de uma vez, porque é justamente esse o domínio deles. A
   * subtração por família não é uma versão mais generosa da mesma regra: é a regra invertida.
   */
  it("mesma FAMÍLIA de e-mail não subtrai: o colega com `@homolog.local` continua na lista", () => {
    const negados = montarNegadosDeEquipe(TRINTA_E_SEIS, ALLOWLIST);
    expect(negados.emails).toContain("u01@homolog.local");
    expect(negados.nomes).toContain("Colega Numero 01");
  });

  it("nome que CONTÉM o declarado não é subtraído: `Manual Do Sistema Dois` continua na lista", () => {
    const negados = montarNegadosDeEquipe(
      [{ nome: "Manual Do Sistema Dois", email: "manual2@homolog.local" }],
      ALLOWLIST,
    );
    expect(negados.nomes).toContain("Manual Do Sistema Dois");
    expect(auditarTexto("Editado por Manual Do Sistema Dois", ALLOWLIST, negados).aprovado).toBe(
      false,
    );
  });

  it("a subtração não depende de caixa nem de acento do cadastro", () => {
    const negados = montarNegadosDeEquipe(
      [{ nome: "manual do sistema", email: "MANUAL@homolog.local" }],
      ALLOWLIST,
    );
    expect(negados.nomes).toEqual([]);
    expect(negados.emails).toEqual([]);
  });
});
