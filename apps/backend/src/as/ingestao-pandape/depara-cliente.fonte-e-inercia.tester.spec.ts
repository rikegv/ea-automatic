import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ─ A PROPRIEDADE ESTRUTURAL DO DE/PARA DE CLIENTE: ELE NÃO ALCANÇA `vagas.cod_cliente` ─────────
 *
 * §A.40 REGRA 2: escrito a partir do requisito, antes de o código existir. Parte destes testes está
 * VERDE HOJE de propósito (eles são a trava do que já está certo) e parte está VERMELHA (eles
 * exigem o que a frente ainda vai construir). Cada `it` diz em qual dos dois casos está.
 *
 * ┌─ POR QUE SOBRE A FONTE, E NÃO SOBRE O COMPORTAMENTO ─────────────────────────────────────────┐
 * │ O requisito mudou de forma no meio da frente: de "a planilha não SOBRESCREVE o cliente         │
 * │ escolhido a mão" para "a planilha NÃO ESCREVE AQUELA COLUNA, em caminho nenhum". A primeira é   │
 * │ régua de precedência, e se testa com entrada e saída. A segunda é AUSÊNCIA DE CAMINHO, e        │
 * │ ausência não se prova com dado: por definição, o caminho que não existe não é exercitável.      │
 * │                                                                                                │
 * │ A ÚNICA PROVA DE AUSÊNCIA É SOBRE O TEXTO DO PROGRAMA, e é por isso que estes testes leem       │
 * │ arquivo. É o mesmo molde que a casa já usa em                                                   │
 * │ `auditoria.arquivamento-so-aprovado.tester.spec.ts` (requisito 6), que prova que um service     │
 * │ continua SEM banco injetado lendo o arquivo de produção.                                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTÁ EM JOGO, MEDIDO PELA AUDITORIA E NÃO DEDUZIDO ───────────────────────────────────┐
 * │ `vagas.cod_cliente` é lido por `candidatos.service.ts` com `innerJoin` e SEM FILTRO DE STATUS, │
 * │ e vai direto para `cod_cliente` da pré-admissão (`ingestao-ponte-admissao.ts`). Dali ele decide │
 * │ a RÉGUA DOCUMENTAL e a PASTA DO PRONTUÁRIO no Drive. Um valor digitado numa célula de planilha  │
 * │ chegaria a `admissoes.cod_cliente` sem passar por pessoa nenhuma: cliente errado é CONTROLADOR  │
 * │ errado (§A.6), e arquivamento no Drive não se desfaz (§A.33).                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ARMADILHA DESTE ARQUIVO, E ELA JÁ CUSTOU RODADA NESTA CASA ───────────────────────────────┐
 * │ `ingestao-repositorio.ts` e `ingestao-ciclo.ts` FALAM de `cod_cliente` EM PROSA, em blocos      │
 * │ longos que explicam por que a coluna nasce nula. Uma varredura sobre o texto cru dá FALSO        │
 * │ VERMELHO e manda consertar o que está certo. TODA asserção aqui roda sobre a fonte SEM           │
 * │ COMENTÁRIO, e o teste de canário da própria limpeza é o primeiro do arquivo: sem ele, um         │
 * │ removedor de comentários quebrado tornaria todos os outros vacuamente verdes.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const RAIZ_SRC = join(__dirname, "..", "..");
const RAIZ_REPO = join(RAIZ_SRC, "..", "..", "..");

/** Tira comentário de bloco e de linha. Cru NUNCA é asserido neste arquivo. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

const ler = (caminho: string) => readFileSync(caminho, "utf8");
const codigoDe = (caminho: string) => semComentarios(ler(caminho));

const REPOSITORIO = join(__dirname, "ingestao-repositorio.ts");
const CICLO = join(__dirname, "ingestao-ciclo.ts");

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 0. O CANÁRIO DA PRÓPRIA FERRAMENTA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a limpeza de comentários funciona, senão todo teste deste arquivo é vácuo", () => {
  it("o arquivo FALA de `cod_cliente` em prosa, e o código limpo fala menos", () => {
    /*
     * VERDE HOJE. Este é o teste que torna os outros honestos: ele mede que a prosa EXISTE (logo a
     * armadilha é real) e que a limpeza REMOVE algo (logo ela está funcionando). Uma limpeza que
     * devolvesse string vazia também passaria aqui, e é por isso que o segundo `it` existe.
     */
    const cru = ler(REPOSITORIO);
    const limpo = semComentarios(cru);
    const conta = (t: string) => t.split("cod_cliente").length - 1;

    expect(conta(cru), "a prosa sobre `cod_cliente` desapareceu do arquivo").toBeGreaterThan(1);
    expect(conta(limpo)).toBeLessThan(conta(cru));
  });

  it("e a limpeza não come o código: o que sobra ainda é o repositório", () => {
    const limpo = codigoDe(REPOSITORIO);

    expect(limpo).toContain("escreverVaga");
    expect(limpo).toContain("insert into vagas");
    expect(limpo.length).toBeGreaterThan(5000);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. O UPDATE DA VAGA NÃO TOCA `cod_cliente`. ESTE É O TESTE QUE MATA O MUTANTE DE BOA-FÉ.
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("`cod_cliente` não aparece em NENHUMA atribuição do repositório da ingestão", () => {
  it("nenhum `cod_cliente = ` no código, em lugar nenhum do arquivo", () => {
    /*
     * ┌─ O MUTANTE QUE ESTE TESTE EXISTE PARA MATAR, E ELE É O CONSERTO ERRADO ÓBVIO ─────────────┐
     * │ `cod_cliente = ${codCliente}` acrescentado ao `camposDoAts`. A auditoria mediu o fio morto:  │
     * │ `ingestao-ciclo.ts` CALCULA o cliente e o joga fora, porque o insert grava `null` literal e  │
     * │ o update não nomeia a coluna. Quem for "consertar" o fio morto pelo caminho natural escreve  │
     * │ exatamente este mutante, e HOJE NADA QUEBRARIA: a frente passaria a reescrever, 48 vezes por │
     * │ dia, o cliente que uma pessoa conferiu na liberação, sem autor, sem data e sem trilha.       │
     * │                                                                                             │
     * │ POR QUE A BUSCA É PELA ATRIBUIÇÃO, E NÃO PELO NOME: no `insert` a coluna aparece na LISTA de │
     * │ colunas (`cod_cliente, cargo_id, status`), sem `=`, e precisa continuar aparecendo. É o `=`  │
     * │ que distingue "a coluna é mencionada" de "a coluna é ESCRITA com um valor vindo de fora".    │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * VERDE HOJE, e é uma trava de regressão: ele tem de continuar verde depois da frente.
     */
    const codigo = codigoDe(REPOSITORIO);
    const atribuicoes = codigo.match(/cod_cliente\s*=[^=]/g) ?? [];

    expect(atribuicoes, "o repositório passou a ATRIBUIR `cod_cliente`").toEqual([]);
  });

  it("o `camposDoAts` nomeia as quatro colunas do ATS, e `cod_cliente` não é uma delas", () => {
    /*
     * A ASSERÇÃO PRECISA, sobre o bloco exato que a auditoria apontou (`:855-861`). O teste acima é
     * amplo e pega qualquer atribuição no arquivo; este nomeia o LUGAR, para a mensagem de falha dizer
     * ao próximo o que ele acabou de fazer.
     *
     * A LISTA FECHADA É O CANÁRIO: afirmar só a ausência de `cod_cliente` deixaria passar uma quinta
     * coluna qualquer entrando ali, e a trava de precedência da vaga (30/09) vale para as QUATRO que
     * foram decididas, não para as que alguém acrescentar depois.
     */
    const codigo = codigoDe(REPOSITORIO);
    const bloco = codigo.match(/camposDoAts\s*=([\s\S]*?);\n/)?.[1] ?? "";

    expect(bloco, "o bloco `camposDoAts` não foi encontrado: o arquivo mudou de forma").not.toBe("");
    expect(bloco).not.toContain("cod_cliente");
    for (const coluna of ["codigo", "nome_divulgacao", "cidade_id", "posicoes_oficiais"]) {
      expect(bloco, `o ATS deixou de escrever ${coluna}`).toContain(coluna);
    }
    // A CONTAGEM É PELA ATRIBUIÇÃO INTERPOLADA (`coluna = ${valor}`), e não por início de linha: a
    // primeira coluna mora na mesma linha do `sql\``, e contar por linha devolve 3 de 4. Foi o que
    // este teste me mostrou na primeira execução, e é o lembrete de que teste de fonte tem de ser
    // medido contra o arquivo, nunca contra a lembrança da forma dele.
    const colunas = bloco.match(/([a-z_]+)\s*=\s*\$\{/g) ?? [];
    expect(colunas, "entrou coluna nova no `set` do ATS").toHaveLength(4);
  });

  it("o `comparaAntes` do ciclo também não cita `cod_cliente`", () => {
    /*
     * POR QUE ESTE PONTO IMPORTA MESMO SEM ESCREVER NADA: `comparaAntes` é o que decide "algo mudou?".
     * Com `cod_cliente` dentro, a vaga JÁ LIBERADA passaria a "mudar" em toda volta, e cada volta
     * empurraria `atualizado_em`, que é o RELÓGIO DO EXPURGO de quem está dentro da vaga. 48 voltas
     * por dia renovando a retenção de todo mundo é violação de §A.6 por efeito colateral, e nada fica
     * vermelho. É a mesma razão pela qual `cargo_id` já está de fora, escrita no próprio arquivo.
     *
     * VERDE HOJE.
     */
    const codigo = codigoDe(CICLO);
    const bloco = codigo.match(/comparaAntes:\s*\[([^\]]*)\]/)?.[1] ?? "";

    expect(bloco, "o `comparaAntes` não foi encontrado").not.toBe("");
    expect(bloco).not.toContain("cod_cliente");
    expect(bloco).not.toContain("cargo_id");
  });

  it("o ciclo manda `cod_cliente: null` LITERAL, e o fio morto é cortado", () => {
    /*
     * ┌─ VERMELHO HOJE, DE PROPÓSITO, E É O ÚNICO PEDIDO DE MUDANÇA DESTE ARQUIVO ────────────────┐
     * │ Hoje a linha é `cod_cliente: codCliente`, com o valor vindo de `clientePorVaga()`, que       │
     * │ devolve `null` por enquanto. O resultado é correto POR ACIDENTE: ele depende de uma função    │
     * │ remota continuar devolvendo nulo, e esta frente é exatamente a frente que vai ensinar aquela  │
     * │ função a devolver um cliente.                                                                │
     * │                                                                                             │
     * │ No desenho novo, o cliente resolvido vira PROPOSTA e a coluna continua nula. Então a linha    │
     * │ tem de dizer `null` LITERAL, como `cargo_id: null` já diz no mesmo objeto. Mantê-la ligada a  │
     * │ uma variável é deixar armada a arma que a auditoria achou: no dia em que `clientePorVaga`      │
     * │ passar a responder, o insert começa a gravar sem que nenhuma linha do insert tenha mudado.    │
     * │                                                                                             │
     * │ MUTANTE QUE ISTO MATA: manter `cod_cliente: codCliente` e "resolver" a frente fazendo          │
     * │ `clientePorVaga` devolver o código da planilha. Zero arquivos tocados no insert, e a planilha  │
     * │ passa a escrever direto na coluna que decide o Drive.                                         │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const codigo = codigoDe(CICLO);

    expect(codigo).toMatch(/cod_cliente:\s*null/);
    const atribuicoesVivas = (codigo.match(/cod_cliente:\s*([A-Za-z_$][\w$]*)/g) ?? []).filter(
      (m) => !/null/.test(m),
    );
    expect(
      atribuicoesVivas,
      "o insert da vaga está ligado a uma VARIÁVEL de cliente, e o fio morto continua armado",
    ).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. A PROPOSTA É INERTE: NINGUÉM A LÊ PARA DECIDIR
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * O NOME DO CAMPO É O CONTRATO DESTE BLOCO.
 *
 * Eu não construo, então eu declaro: a proposta vive em campo(s) cujo nome contém `clienteProposto`
 * (camel) ou `cliente_proposto` (snake). Se a construção escolher outro nome, é ESTA constante que
 * muda, e o aviso está no meu retorno. Um nome compartilhado é o que torna a varredura possível:
 * campo com nome genérico (`sugestao`, `proposta`) não é rastreável numa base deste tamanho.
 */
const MARCAS_DA_PROPOSTA = ["clienteProposto", "cliente_proposto"] as const;

/**
 * AS QUATRO COLUNAS, com o nome CONGELADO pelo coordenador.
 *
 * As marcas acima são PREFIXO de todas elas, o que é o que faz a varredura de inércia alcançar as
 * quatro de uma vez. Elas estão nomeadas aqui porque um nome congelado que ninguém confere é um
 * nome combinado, não congelado: se a construção gravar `cliente_sugerido`, a varredura de inércia
 * fica VERDE por não ter sujeito, e a trava inteira vira decoração.
 */
const COLUNAS_DA_PROPOSTA = [
  "cliente_proposto",
  "cliente_proposto_nome",
  "cliente_proposto_origem",
  "cliente_proposto_estado",
] as const;

/** Quem PODE falar da proposta: o de/para, o schema, e a tela de revisão. Fail-closed. */
const PODEM_FALAR = [
  "domain/as-depara-cliente",
  "as/depara-cliente",
  "as/ingestao-pandape/ingestao-depara-cliente",
  "db/schema/tables.ts",
  "as/vagas/vagas-revisao",
];

/**
 * Quem NÃO PODE, nomeadamente, porque é por aqui que o dano se propaga.
 *
 * ┌─ UM ITEM SAIU EM 02/10/2026, E A SAÍDA É UM REFORÇO DA TRAVA, NÃO UMA RENÚNCIA ─────────────┐
 * │ A lista citava `as/ingestao-pandape/ingestao-ponte-admissao.ts`, o adaptador que levava        │
 * │ `vagas.cod_cliente` até `admissoes.cod_cliente`. AQUELE ARQUIVO FOI APAGADO: a varredura não   │
 * │ cria admissão, porque o único gatilho que envia para admissão é o da esteira, e não o das ATS. │
 * │ A propriedade que o item guardava passou a ser garantida de forma MAIS FORTE, pela ausência do │
 * │ caminho inteiro: não há arquivo para ler a proposta, nem admissão para a proposta alcançar.    │
 * │                                                                                               │
 * │ O item não podia FICAR, e é por isso que ele saiu em vez de ser deixado para trás: com a       │
 * │ asserção de existência abaixo, caminho que não existe é VERMELHO, de propósito.                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const NAO_PODEM_FALAR = [join(RAIZ_SRC, "as", "candidatos", "candidatos.service.ts")];

function arquivosTs(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosTs(caminho, achados);
    else if (nome.endsWith(".ts") && !nome.includes(".spec.")) achados.push(caminho);
  }
  return achados;
}

describe("nada no backend lê a proposta para decidir coisa alguma", () => {
  const citam = () =>
    arquivosTs(RAIZ_SRC)
      .filter((caminho) => {
        const codigo = semComentarios(ler(caminho));
        return MARCAS_DA_PROPOSTA.some((m) => codigo.includes(m));
      })
      .map((caminho) => caminho.slice(RAIZ_SRC.length + 1).replace(/\\/g, "/"));

  it("VERMELHO HOJE: a proposta existe em algum lugar, senão esta varredura é vácuo", () => {
    /*
     * O TESTE DE NÃO-VACUIDADE, e ele é obrigatório num teste de ausência: "nenhum arquivo proibido
     * cita a proposta" é trivialmente verdadeiro enquanto a proposta não existe, e continuaria verde
     * se a construção a chamasse de outra coisa. Este `it` é o que faz a suíte notar a diferença entre
     * "a regra vale" e "a regra não tem sujeito".
     */
    expect(citam().length, `nenhum arquivo cita ${MARCAS_DA_PROPOSTA.join(" nem ")}`).toBeGreaterThan(
      0,
    );
  });

  it("quem cita a proposta está na lista de quem PODE", () => {
    /*
     * ┌─ ESTA É A FORMA FORTE DA REGRA 2 DO REQUISITO ANTIGO ─────────────────────────────────────┐
     * │ Antes: "a planilha não vence o humano no empate". Agora: "não existe empate, porque não há    │
     * │ caminho". A lista branca é o que mantém isso verdadeiro DEPOIS da frente, quando a próxima    │
     * │ sessão precisar de "só uma leitura rápida da proposta, para a fila de pendências" e descobrir │
     * │ que a leitura vira decisão em três telas.                                                    │
     * │                                                                                             │
     * │ MUTANTE QUE ISTO MATA: `coalesce(v.cod_cliente, v.cliente_proposto_cod)` em qualquer consulta │
     * │ que alimente a pré-admissão, a régua documental ou a pasta do Drive. É um `coalesce` de boa-fé │
     * │ ("se não tem cliente, usa o proposto") e é o furo inteiro, com o agravante de ser invisível    │
     * │ na revisão de código.                                                                        │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const fora = citam().filter((rel) => !PODEM_FALAR.some((ok) => rel.startsWith(ok)));

    expect(fora, "a proposta vazou para arquivo fora da lista branca").toEqual([]);
  });

  /*
   * ─ A NÃO-VACUIDADE DOS CAMINHOS, e ela faltava (dívida fechada em 02/10/2026) ───────────────
   *
   * A asserção de ausência abaixo pula o que não existe (`if (!existsSync) continue`), e o pulo é
   * CERTO: nomear um arquivo apagado não deve derrubar a suíte por acidente de ordem de frentes. O
   * preço era que a lista podia ficar INTEIRA obsoleta por um rename e o teste seguir verde, sem
   * sujeito nenhum, exatamente como o teste de não-vacuidade das MARCAS já previne do outro lado.
   *
   * ENTÃO O CAMINHO QUE NÃO EXISTE É VERMELHO AQUI, e não lá: quem mover ou apagar um dos arquivos
   * nomeados é obrigado a vir decidir se o item ainda tem sujeito, em vez de perder a trava em
   * silêncio. É a mesma disciplina da lista de SETE tabelas da ingestão: lista fail-closed que
   * perde um item convence de que a busca terminou.
   */
  it("todo caminho da lista EXISTE, senão a asserção de ausência não tem sujeito", () => {
    expect(NAO_PODEM_FALAR.length).toBeGreaterThan(0);
    for (const caminho of NAO_PODEM_FALAR) {
      expect(
        existsSync(caminho),
        `${caminho} não existe mais: a trava ficou sem sujeito. Reveja a lista NAO_PODEM_FALAR.`,
      ).toBe(true);
    }
  });

  it("o service de candidatos NÃO cita a proposta", () => {
    /*
     * A ASSERÇÃO NOMINAL, que sobrevive a alguém editar a lista branca de cima: este é o caminho
     * MEDIDO pelo qual `vagas.cod_cliente` chega a `admissoes.cod_cliente`, e é ali que o valor
     * passa a decidir régua documental e pasta do Drive. ERAM DOIS: o outro era a ponte da
     * varredura, apagada em 02/10/2026 (a varredura não cria admissão), e hoje o envio manual do
     * funil é o único caminho de A&S que leva o cliente da vaga até a pré-admissão.
     */
    for (const caminho of NAO_PODEM_FALAR) {
      if (!existsSync(caminho)) continue;
      const codigo = semComentarios(ler(caminho));
      for (const marca of MARCAS_DA_PROPOSTA) {
        expect(codigo, `${caminho} passou a ler a proposta`).not.toContain(marca);
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. O LADO DO `ai-service`: SÓ EXPORTA, E O CSV NÃO TOCA O DISCO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("o módulo que lê a planilha no Drive não escreve no Drive nem no disco", () => {
  const RAIZ_AI = join(RAIZ_REPO, "apps", "ai-service", "app");

  /** Quem exporta a planilha: achado pela CHAMADA, não pelo nome do arquivo. */
  const fontesDaPlanilha = (): { caminho: string; codigo: string }[] => {
    if (!existsSync(RAIZ_AI)) return [];
    const achados: { caminho: string; codigo: string }[] = [];
    const ande = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        if (nome === "__pycache__") continue;
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) ande(caminho);
        else if (nome.endsWith(".py")) {
          const cru = ler(caminho);
          // O comentário é tirado ANTES de decidir se o arquivo é da planilha, pela mesma razão do
          // bloco 0: a prosa de outra rota pode citar `export` e `text/csv` ao explicar esta.
          const codigo = cru.replace(/"""[\s\S]*?"""/g, " ").replace(/^[ \t]*#.*$/gm, " ");
          if (codigo.includes("text/csv")) achados.push({ caminho, codigo });
        }
      }
    };
    ande(RAIZ_AI);
    return achados;
  };

  it("VERMELHO HOJE: existe exatamente UM lugar que exporta a planilha como CSV", () => {
    /*
     * NÃO-VACUIDADE DE NOVO, e aqui ela também fixa a CARDINALIDADE: dois lugares exportando a mesma
     * planilha é como nasce a segunda porta que a auditoria achou em `posicoes_oficiais`, e a segunda
     * porta é sempre a que não tem a trava.
     */
    expect(fontesDaPlanilha().map((f) => f.caminho)).toHaveLength(1);
  });

  it("o módulo da planilha NÃO tem verbo de escrita do Drive", () => {
    /*
     * ┌─ O ESCOPO DA CREDENCIAL É DE ESCRITA, E ISSO NÃO É ESCOLHA ──────────────────────────────┐
     * │ Só `auth/drive` está autorizado nesta delegação (medido): `drive.readonly` devolve           │
     * │ `unauthorized_client`. Então a leitura da planilha roda com uma credencial que PODE APAGAR o │
     * │ Drive da empresa, e a única mitigação possível é de CÓDIGO: o módulo só exporta.             │
     * │                                                                                             │
     * │ A PROIBIÇÃO EXISTE HOJE EM PROSA, SEM TESTE, e prosa não sobrevive a uma refatoração. Este é │
     * │ o teste que a auditoria pediu, e a armadilha é a mesma do bloco 0: o PRÓPRIO COMENTÁRIO que  │
     * │ explica a proibição contém as palavras proibidas, então a varredura roda sem comentário.     │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    for (const { caminho, codigo } of fontesDaPlanilha()) {
      for (const verbo of [".delete(", ".update(", "trashed", ".move(", "rename", "permissions"]) {
        expect(codigo, `${caminho} pode escrever no Drive: ${verbo}`).not.toContain(verbo);
      }
    }
  });

  it("o CSV de 1,9 MB não vai para o disco, nem para cache, nem para `/tmp`", () => {
    /*
     * §A.6, risco 4 do mapa: dado operacional da empresa, com salário e nome de candidato dentro, não
     * pode virar arquivo. Cache em disco é a forma que isso toma de boa-fé ("evita baixar 1,9 MB a
     * cada volta"), e o arquivo cacheado é dado da empresa fora de qualquer rotina de expurgo.
     */
    for (const { caminho, codigo } of fontesDaPlanilha()) {
      for (const proibido of ["open(", "/tmp", "NamedTemporary", "to_csv", "pickle", "cache"]) {
        expect(codigo, `${caminho} escreve em disco: ${proibido}`).not.toContain(proibido);
      }
    }
  });

  /**
   * AS ROTAS QUE EXPÕEM A LEITURA, achadas pelo IMPORT da biblioteca, nunca pelo nome do arquivo.
   *
   * ┌─ ESTA SEPARAÇÃO FOI MEDIDA, E A PRIMEIRA VERSÃO DO TESTE ESTAVA ERRADA ───────────────────┐
   * │ Eu exigia `require_internal_token` no arquivo que exporta o CSV, e ele ficou VERMELHO contra │
   * │ um código CORRETO: quem exporta é a BIBLIOTECA (`planilha_viva.py`), que não tem rota, e o    │
   * │ guard mora no ROUTER (`routers/planilha_viva.py`), que tem. Biblioteca pedindo token seria    │
   * │ erro de camada, e eu estaria mandando consertar o que está certo.                            │
   * │                                                                                             │
   * │ AS DUAS PERGUNTAS CONTINUAM VALENDO, em arquivos diferentes: a BIBLIOTECA não pode escrever   │
   * │ (Drive, disco) nem chamar IA; a ROTA não pode nascer sem guard. Juntá-las num arquivo só é o  │
   * │ que produziu o falso vermelho.                                                               │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const rotasDaPlanilha = (): { caminho: string; codigo: string }[] => {
    const modulos = fontesDaPlanilha().map((f) => {
      const partes = f.caminho.split(/[\\/]/);
      return (partes[partes.length - 1] ?? "").replace(/\.py$/, "");
    });
    const dir = join(RAIZ_AI, "routers");
    if (!existsSync(dir) || modulos.length === 0) return [];
    return readdirSync(dir)
      .filter((nome) => nome.endsWith(".py"))
      .map((nome) => {
        const cru = ler(join(dir, nome));
        return {
          caminho: join(dir, nome),
          codigo: cru.replace(/"""[\s\S]*?"""/g, " ").replace(/^[ \t]*#.*$/gm, " "),
        };
      })
      .filter(({ codigo }) =>
        codigo
          .split("\n")
          /*
           * A LINHA DE IMPORT É RECONHECIDA PELO INÍCIO DELA, e não por "import antes do nome": em
           * Python a ordem é a INVERSA (`from app.planilha_viva import (...)`), e a primeira versão
           * deste filtro exigia `import` antes do módulo. Resultado: a rota EXISTIA, com o guard no
           * lugar, e o meu teste jurava que não havia rota. Falso vermelho de ferramenta, pela
           * terceira vez neste arquivo, e sempre pelo mesmo motivo: a forma do código real não é a
           * que eu lembrava.
           */
          .some((l) => /^\s*(from|import)\s/.test(l) && modulos.some((m) => l.includes(m))),
      );
  };

  it("VERMELHO HOJE: existe a ROTA que expõe a leitura, e ela é uma só", () => {
    /*
     * A CARDINALIDADE DE NOVO, e aqui ela guarda o mesmo risco da biblioteca: duas rotas para a
     * mesma leitura é a segunda porta, e a segunda porta é sempre a que esqueceu o guard.
     */
    expect(rotasDaPlanilha().map((r) => r.caminho)).toHaveLength(1);
  });

  it("a ROTA é protegida pelo token interno, além do loopback", () => {
    /*
     * A RESSALVA DA AUDITORIA, e ela é de fail-closed: rota sem o guard nasce aberta a QUALQUER COISA
     * que rode na VM, e o molde já existe no vizinho `planilha.py` (`require_internal_token`).
     *
     * A ASSERÇÃO É SOBRE O `Depends` NA ASSINATURA, e não sobre o `import`: importar o guard e
     * esquecer de pendurá-lo no handler é precisamente o descuido que ele existe para cobrir, e um
     * teste que só procure o nome do símbolo passa verde com a rota aberta.
     */
    for (const { caminho, codigo } of rotasDaPlanilha()) {
      expect(codigo, `${caminho} não pendura o guard no handler`).toMatch(
        /Depends\(\s*require_internal_token\s*\)/,
      );
    }
  });

  it("a BIBLIOTECA não pede token, porque guard em biblioteca é erro de camada", () => {
    /*
     * O PAR NEGATIVO do teste acima, e ele é o que me impede de "consertar" o falso vermelho pelo
     * caminho errado (pendurar o guard na biblioteca para o teste ficar verde). Camada de leitura
     * não conhece HTTP: quem conhece é o router.
     */
    for (const { caminho, codigo } of fontesDaPlanilha()) {
      expect(codigo, `${caminho} é biblioteca e virou dependente de HTTP`).not.toContain("Depends(");
    }
  });

  it("NENHUMA linha da planilha vai para o Vertex: a rota não chama IA", () => {
    /*
     * BLOQUEIO 6 DA AUDITORIA. O `ai-service` é onde a IA mora, então a rota nova nasce rodeada de
     * clientes de IA, e mandar o CSV para um modelo "para ele casar os nomes" é a tentação mais
     * natural que existe neste arquivo. Seriam 3.533 linhas com salário e nome de candidato saindo
     * para fora da casa, de uma vez.
     */
    for (const { caminho, codigo } of fontesDaPlanilha()) {
      for (const ia of ["gemini", "vertexai", "generative", "GenerativeModel"]) {
        expect(codigo.toLowerCase(), `${caminho} manda planilha para a IA: ${ia}`).not.toContain(
          ia.toLowerCase(),
        );
      }
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. O NOME CONGELADO É CONFERIDO, E `vagas.codigo` NÃO VIRA UMA TERCEIRA CHAVE
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("as quatro colunas da proposta existem com o nome que foi congelado", () => {
  it("VERMELHO HOJE: o schema declara as quatro", () => {
    /*
     * A CONTRAPARTIDA DA VARREDURA DE INÉRCIA. Aquela prova que ninguém LÊ a proposta; esta prova
     * que ela EXISTE com o nome acordado. As duas juntas é que fecham a regra, porque uma varredura
     * sobre um nome que não existe passa verde para sempre.
     */
    const schema = semComentarios(ler(join(RAIZ_SRC, "db", "schema", "tables.ts")));

    /*
     * ┌─ A ASSERÇÃO É PELA DECLARAÇÃO DE COLUNA, E NÃO PELA PRESENÇA DO TEXTO ───────────────────┐
     * │ A primeira versão era `toContain(coluna)`, e eu PROVEI POR MUTAÇÃO que ela passava com a    │
     * │ coluna renomeada: o nome `cliente_proposto_origem` também aparece dentro do nome do CHECK   │
     * │ (`ck_vagas_cliente_proposto_origem`), então renomear a COLUNA para `cliente_sugerido_origem` │
     * │ deixava o teste VERDE. É o mesmo modo de falha da regra J que esta casa já documentou: a     │
     * │ asserção passava por um motivo LATERAL, e eu só descobri porque matei o mutante em vez de    │
     * │ confiar no verde.                                                                            │
     * │                                                                                             │
     * │ O NOME TEM DE VIR LOGO DEPOIS DO PARÊNTESE (`varchar("cliente_proposto_origem"`), que é como │
     * │ o drizzle declara o nome físico. O nome do CHECK não casa, porque lá a string começa com     │
     * │ `ck_`.                                                                                       │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    for (const coluna of COLUNAS_DA_PROPOSTA) {
      expect(schema, `o schema não DECLARA a coluna ${coluna}`).toMatch(
        new RegExp(`\\(\\s*"${coluna}"`),
      );
    }
  });

  it("a proposta NÃO é a coluna `cod_cliente` disfarçada", () => {
    /*
     * A CONFUSÃO QUE ISTO IMPEDE, e ela é de uma letra: `cliente_proposto` e `cod_cliente` são duas
     * colunas, e o desenho inteiro depende disso. Um `cliente_proposto` declarado como ALIAS,
     * `generated` ou `default` da outra devolveria o furo pela porta do schema, onde nenhum teste de
     * comportamento olha.
     */
    const schema = semComentarios(ler(join(RAIZ_SRC, "db", "schema", "tables.ts")));
    const linhasDaProposta = schema
      .split("\n")
      .filter((l) => MARCAS_DA_PROPOSTA.some((m) => l.includes(m)));

    for (const linha of linhasDaProposta) {
      expect(linha, "a proposta foi declarada em cima de `cod_cliente`").not.toContain("cod_cliente");
    }
  });
});

describe("GAP 5: `vagas.codigo` não entra como terceira chave do de/para", () => {
  /**
   * ┌─ POR QUE ESTA ASSERÇÃO EXISTE, E POR QUE ELA NÃO É PARANOIA ───────────────────────────────┐
   * │ Eu REJEITO a família `SL...` na entrada do de/para, com motivo próprio, e isso cobre o valor  │
   * │ que VEM DA PLANILHA. Não cobre o movimento seguinte, que é o natural para quem ler o meu       │
   * │ motivo: "se `SL...` é código interno e `vagas.codigo` guarda `SL...`, então casa por ali".     │
   * │                                                                                               │
   * │ `vagas.codigo` É REPETÍVEL DE PROPÓSITO (está escrito no schema) e é DIGITADO por gente. Casar │
   * │ por ele juntaria vagas diferentes, e a vaga de um cliente receberia a proposta do cliente de    │
   * │ outro. O repositório já guarda o aviso para a identidade da LINHA (`vagaPorCodigo` existe e o  │
   * │ comentário dele diz "o `reference` REPETE, e casar por ele junta vagas diferentes"); o que      │
   * │ faltava era a trava para o caminho do CLIENTE.                                                 │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const TERCEIRA_CHAVE = ["vagaPorCodigo", "vagas.codigo", "v.codigo", "from vagas"];

  it("o `clientePorVaga` resolve pelo de/para, e não consultando `vagas`", () => {
    /*
     * O PONTO DE ENCAIXE EXATO desta frente. Hoje o corpo é `return null`, então o teste é VERDE e
     * passa a ser a trava de quem for escrever ali: o cliente se resolve pelo de/para em memória,
     * nunca por uma segunda consulta à tabela de vagas.
     */
    const codigo = codigoDe(REPOSITORIO);
    const i = codigo.indexOf("clientePorVaga");
    expect(i, "`clientePorVaga` não foi encontrado no repositório").toBeGreaterThan(-1);

    const resto = codigo.slice(i);
    const fim = resto.search(/\n  (async |private |public |\/\*)/);
    const corpo = fim === -1 ? resto : resto.slice(0, fim);

    expect(corpo).toContain("clientePorVaga");
    for (const chave of TERCEIRA_CHAVE) {
      expect(corpo, `o \`clientePorVaga\` passou a casar por ${chave}`).not.toContain(chave);
    }
  });

  it("nenhum arquivo do de/para consulta a tabela de vagas", () => {
    /*
     * A MESMA TRAVA, pela outra ponta: o de/para é domínio puro mais um repositório de LEITURA DA
     * PLANILHA. Ele não tem o que perguntar à tabela de vagas, e no dia em que tiver, a pergunta
     * passa a ser "por qual coluna?", que é exatamente a conversa que esta asserção força.
     *
     * NÃO-VACUIDADE: coberta pelo `it` da seção 2 que exige a proposta existir em algum lugar. Sem
     * arquivo de de/para, este laço não roda, e é o outro teste que fica vermelho.
     */
    const arquivos = arquivosTs(RAIZ_SRC).filter((caminho) => {
      const rel = caminho.slice(RAIZ_SRC.length + 1).replace(/\\/g, "/");
      return rel.startsWith("domain/as-depara-cliente") || rel.includes("ingestao-depara-cliente");
    });

    for (const caminho of arquivos) {
      const codigo = semComentarios(ler(caminho));
      for (const chave of TERCEIRA_CHAVE) {
        expect(codigo, `${caminho} casa por ${chave}`).not.toContain(chave);
      }
    }
  });
});
