/**
 * ─ COBERTURA DO MÓDULO `SOUTALENT`: O TESTE QUE NASCE ANTES DA REDAÇÃO (§A.38, §A.40) ───────────
 *
 * ESCRITO PELO `tester`, QUE NÃO ESCREVE O CONTEÚDO. É a aplicação literal da §A.40: o requisito
 * existe antes do texto, então o teste que cobra o requisito é escrito EM PARALELO à redação, e não
 * depois dela. Quem faz passar são os agentes de conteúdo.
 *
 * ┌─ É ESPERADO E DESEJADO QUE ESTE ARQUIVO NASÇA VERMELHO ──────────────────────────────────────┐
 * │ Vermelho aqui não é defeito: é a LISTA DE COMPRAS da frente, legível, com o nome exato do que  │
 * │ falta. Verde só quando os 29 artigos do módulo existirem, as três telas de A&S tiverem quem as │
 * │ ensine, e nenhum controle daquelas telas ficar sem artigo que o nomeie.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE ARQUIVO **NÃO** COBRE, PORQUE JÁ ESTÁ COBERTO, E REPETIR SERIA PIOR ─────────────┐
 * │ `registro.coerencia.tester.spec.ts` é uma VARREDURA do registro inteiro, então o artigo de     │
 * │ SouTalent número 29 entra nela sozinho, no dia em que nascer. Já estão medidos lá, para TODOS  │
 * │ os módulos, e NÃO são repetidos aqui:                                                          │
 * │   . slug duplicado, slug fora do formato de URL, `relacionados` órfão e auto-relacionado;      │
 * │   . rota morta, artigo sem rota, artigo apontando para a `/kit` antiga;                        │
 * │   . artigo sem `fontes`, fonte inexistente, fonte absoluta;                                    │
 * │   . título, resumo, passo, `termos` e `revisadoEm`;                                            │
 * │   . §A.11 travessão em `titulo`, `resumo`, `preRequisitos`, `gesto`, `detalhe`, `legenda`,      │
 * │     `sintoma`, `acao` e `regras`, e §A.24 title case no `titulo`;                              │
 * │   . print de artigo sem captura, PNG órfão, roteiro sem artigo, `url` do roteiro fora das       │
 * │     `rotas` do artigo, colisão de nome de arquivo dos dois lados.                              │
 * │                                                                                                │
 * │ OS ITENS 4 E 5 DO PEDIDO CAEM AQUI QUASE INTEIROS, e o relatório diz isso em vez de duplicar:  │
 * │ o cruzamento artigo ⇄ roteiro (item 5) já é feito nos DOIS sentidos e para todo módulo, e o     │
 * │ travessão (item 4) já é medido em tudo que o pedido lista MENOS `controles`. Sobraram TRÊS      │
 * │ frestas reais, e só elas viraram teste aqui: `controles`, o texto que vem da FAMÍLIA, e o N1    │
 * │ por ROTA (a varredura mede N1 por MÓDULO, e um módulo de três telas passa com N1 em uma só).   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ELE LÊ `conteudo/registro.gerado` ─────────────────────────────────────────────────┐
 * │ Mesma fonte da varredura de coerência, e de propósito: o barrel é GERADO por                  │
 * │ `pnpm ajuda:registro`, então artigo escrito e barrel não regerado continua invisível para a    │
 * │ tela, para a busca e para a cobertura. Lendo daqui, esquecer o comando também fica VERMELHO,   │
 * │ que é o lado certo do erro.                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: NENHUM nome de pessoa neste arquivo. Ver o bloco dos rótulos nominais, adiante: é a única
 * parte da medição do detector que não pode virar literal, e o motivo é regra, não conveniência.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { chaveDeControle, controlesDeclarados } from "./cobertura";
import { artigoResolvido } from "./registro";
import { artigosDaRotaEm } from "./rotas";
import type { Artigo, FamiliaDeArtigos } from "./tipos";

// ── AS TRÊS TELAS DE A&S QUE ESTA FRENTE TEM DE ENSINAR ────────────────────────────────────────
/** O glifo proibido pela regra de UI, escrito por escape para ele não entrar no arquivo. */
const TRAVESSAO = "\u2014";

const ROTAS_DE_AS = ["/as/vagas", "/as/candidatos", "/as/vagas-pendentes-revisao"] as const;

/**
 * ─ O INVENTÁRIO ESPERADO DO MÓDULO, E ELE É **DADO**, NÃO CÓDIGO ───────────────────────────────
 *
 * FECHADO PELO COORDENADOR: 29 artigos, sendo 1 que já existe e 28 a nascer. A lista é dado do
 * arquivo de propósito, para ser LIDA: a mensagem de falha do teste de presença é a relação exata do
 * que ninguém redigiu ainda, por rota.
 *
 * ┌─ POR QUE ELA É AGRUPADA POR ROTA, E NÃO UMA LISTA CORRIDA ──────────────────────────────────┐
 * │ Porque as outras duas medições desta frente são POR TELA: quem ensina cada rota (bloco 2) e o │
 * │ controle órfão de cada rota (bloco 3). Com o agrupamento, o mesmo dado serve às três, e cai de │
 * │ graça a asserção que uma lista corrida não permite: que cada artigo esperado DECLARE a rota    │
 * │ dele. Artigo escrito com a rota errada some do painel contextual daquela tela sem nada falhar.  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ENTREGA SAI EM ONDAS, e o teste é escrito contra os 29 de qualquer forma: é DESEJADO que ele
 * fique vermelho no que ainda não existe. Onda 1 são 11 artigos, então o esperado nesta rodada é
 * vermelho apontando os 17 restantes, e não um teste ajustado ao que já foi entregue.
 */
export const INVENTARIO_FECHADO = true;

/** Quantos artigos o módulo tem de ter: o piloto que existe mais os 28 novos. */
export const TOTAL_ESPERADO_SOUTALENT = 29;

/** Os artigos esperados, por rota que cada um ensina. */
export const SLUGS_ESPERADOS_POR_ROTA: Record<string, string[]> = {
  "/as/vagas": [
    "abrir-uma-vaga-nova",
    "ler-a-central-de-vagas",
    "abrir-o-painel-da-vaga",
    "adicionar-candidatos-ao-funil-da-vaga",
    "mover-o-candidato-de-etapa",
    "finalizar-a-posicao-da-vaga",
    "registrar-a-saida-do-candidato",
    "enviar-o-candidato-para-a-admissao",
    "agir-em-massa-no-funil-da-vaga",
    "enviar-a-shortlist-ao-cliente",
    "fechar-a-vaga",
    "tratar-os-candidatos-pendentes-antes-de-fechar",
    "cancelar-a-vaga",
    "marcar-a-entrevista-do-candidato",
    "reprovar-o-candidato-pelo-cliente",
    "reabrir-a-vaga-cancelada",
    "mover-o-status-da-vaga",
    "continuar-um-rascunho-de-vaga",
    "clonar-uma-vaga",
  ],
  "/as/vagas-pendentes-revisao": [
    "revisar-uma-vaga-pendente-de-revisao",
    "corrigir-a-liberacao-de-uma-vaga-revisada",
  ],
  "/as/candidatos": [
    "ler-a-central-de-candidatos",
    "cadastrar-um-candidato-novo",
    "importar-candidatos-de-planilha",
    "adicionar-um-candidato-a-uma-vaga",
    "ler-a-ficha-do-candidato",
    "registrar-contato-com-o-candidato",
    "trocar-a-vaga-do-candidato",
    "trazer-o-candidato-de-volta",
  ],
};

export const SLUGS_ESPERADOS_SOUTALENT: string[] = Object.values(SLUGS_ESPERADOS_POR_ROTA).flat();

/** As três famílias de A&S, escritas antes da redação. Todo artigo do módulo declara uma delas. */
export const FAMILIAS_DE_AS = ["as-vagas", "as-funil", "as-candidatos"] as const;

/**
 * ─ OS CONTROLES ÓRFÃOS MEDIDOS PELO DETECTOR, POR ROTA ─────────────────────────────────────────
 *
 * São os rótulos que o detector de cobertura enumerou NA TELA e que artigo NENHUM declara em
 * `passos[].controles`. É a lacuna MEDIDA, não opinada, e é o item mais valioso da frente: o diretor
 * pergunta "o que faz este botão" digitando o rótulo, e rótulo que nenhum artigo declara não é
 * achado nem com o artigo pronto.
 *
 * A COMPARAÇÃO USA A CHAVE DO PRÓPRIO DETECTOR (`chaveDeControle` / `controlesDeclarados`), e não
 * uma comparação de texto escrita aqui. Duas réguas de normalização divergiriam, e o sintoma seria o
 * pior possível: este teste verde e o detector continuando a acusar o mesmo órfão.
 */
export const CONTROLES_ORFAOS_POR_ROTA: Record<string, string[]> = {
  "/as/vagas": [
    "Aberta",
    "Abrir a gestão da vaga",
    "Alocados",
    "Aprovados",
    "Cancelada",
    "Candidatura",
    "CONSULTOR RESPONSÁVEL",
    "Contratado",
    "Descartados Pela Seleção",
    "Desistentes",
    "Entregue",
    "Enviados Para Admissão",
    "Etapa",
    "Etapa Cliente",
    "Fechada",
    "Pendente De Revisão",
    "POSIÇÕES",
    "Rascunho",
    "SLA DE ENTREGA",
    "Stand By",
  ],
  "/as/candidatos": [
    "Adicionar à vaga",
    "Alocados",
    "Aprovados",
    "Candidatura",
    "Contratado",
    "Descartados Pela Seleção",
    "Desistentes",
    "Enviados Para Admissão",
    "Etapa",
    "Etapa Cliente",
    "Histórico",
    "Importar Candidatos",
    "Novo candidato",
    "Sem Vaga",
    "Stand By",
    "Total",
    "ÚLTIMO CONTATO",
  ],
  "/as/vagas-pendentes-revisao": [
    "CANDIDATOS",
    "CIDADE",
    "ENTRADA",
    "Liberadas Recentemente",
    "NOME DE DIVULGAÇÃO",
    "Pendentes De Revisão",
    "POSIÇÕES",
  ],
};

/**
 * ─ OS RÓTULOS NOMINAIS: COBERTOS PELA PARTE ESTÁVEL, E O MOTIVO É §A.6 ─────────────────────────
 *
 * ┌─ POR QUE ELES NÃO ENTRAM COMO LITERAL NA LISTA DE CIMA ─────────────────────────────────────┐
 * │ O detector mediu "Mover <pessoa> de etapa", "Ver a ficha de <pessoa>", "Registrar contato com  │
 * │ <pessoa>" e "Trocar a vaga de <pessoa>": botões de LINHA, cujo nome acessível carrega o nome    │
 * │ da pessoa daquela linha. São DOIS impedimentos somados, e qualquer um deles bastaria:           │
 * │                                                                                                 │
 * │   1. §A.6: escrever o literal aqui seria gravar DADO PESSOAL num arquivo versionado, que o git   │
 * │      guarda para sempre. É exatamente a violação que a poda de nomes do detector existe para    │
 * │      impedir, entrando de volta pela porta do teste.                                            │
 * │   2. O nome é VARIÁVEL: ele muda a cada linha e a cada pessoa nova no banco. Literal fixo aqui  │
 * │      não casaria com nada amanhã, então o teste seria falso de qualquer forma.                   │
 * │                                                                                                 │
 * │ ENTÃO A ASSERÇÃO É SOBRE OS TOKENS ESTÁVEIS: o verbo e o substantivo do rótulo, que é o que o   │
 * │ autor tem como escrever em `controles` e o que sobra do rótulo depois da poda de nomes do        │
 * │ detector. É a parte do rótulo que É o controle; o resto é o dado da linha.                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MEDIDO NO MÓDULO, E NÃO NA ROTA, e a razão é honestidade: o detector entregou estes quatro sem
 * dizer em qual das três telas cada um apareceu, e chutar a rota seria inventar medição. Quando o
 * inventário fechar e a rota de cada um estiver medida, esta asserção pode apertar para por rota.
 */
export const ROTULOS_NOMINAIS_PELA_PARTE_ESTAVEL: Array<{ descricao: string; tokens: string[] }> = [
  { descricao: "Mover <pessoa> de etapa", tokens: ["mover", "etapa"] },
  { descricao: "Ver a ficha de <pessoa>", tokens: ["ficha"] },
  { descricao: "Registrar contato com <pessoa>", tokens: ["registrar", "contato"] },
  { descricao: "Trocar a vaga de <pessoa>", tokens: ["trocar", "vaga"] },
];

let ARTIGOS: Artigo[] = [];
let SOUTALENT: Artigo[] = [];

beforeAll(async () => {
  const mod = (await import("./conteudo/registro.gerado")) as { ARTIGOS?: Artigo[] };
  if (!Array.isArray(mod?.ARTIGOS)) {
    throw new Error("`conteudo/registro.gerado` precisa exportar `ARTIGOS: Artigo[]`.");
  }
  ARTIGOS = mod.ARTIGOS;
  SOUTALENT = ARTIGOS.filter((a) => a.modulo === "SOUTALENT");
});

// ═══ 1. CONTAGEM E PRESENÇA ════════════════════════════════════════════════════════════════════
describe("1. o inventário do módulo SouTalent", () => {
  /**
   * A LISTA ESPERADA É O INSUMO QUE FALTA, e este teste é o que cobra o insumo. Ele fica vermelho
   * enquanto o `arquiteto` não fechar o inventário, e o vermelho é dirigido a QUEM PODE resolver.
   */
  it("a lista de slugs esperados está FECHADA e tem os 29 nomes", () => {
    expect(
      { fechado: INVENTARIO_FECHADO, naListaEsperada: SLUGS_ESPERADOS_SOUTALENT.length },
      "o inventário dos 28 artigos novos ainda não chegou do `arquiteto`. Preencha " +
        "`SLUGS_ESPERADOS_SOUTALENT` e vire `INVENTARIO_FECHADO` para `true`. Nenhum slug foi " +
        "inventado aqui de propósito.",
    ).toEqual({ fechado: true, naListaEsperada: TOTAL_ESPERADO_SOUTALENT });
  });

  it("nenhum slug esperado aparece duas vezes na lista", () => {
    const repetidos = SLUGS_ESPERADOS_SOUTALENT.filter(
      (s, i) => SLUGS_ESPERADOS_SOUTALENT.indexOf(s) !== i,
    );
    expect(repetidos).toEqual([]);
  });

  it("o módulo tem 29 artigos", () => {
    expect(SOUTALENT.length).toBe(TOTAL_ESPERADO_SOUTALENT);
  });

  /** O que falta ESCREVER. A mensagem de falha é a lista dos arquivos que ninguém redigiu ainda. */
  it("todo slug esperado existe no registro", () => {
    const existentes = new Set(ARTIGOS.map((a) => a.slug));
    const faltando = SLUGS_ESPERADOS_SOUTALENT.filter((s) => !existentes.has(s));
    expect(faltando).toEqual([]);
  });

  /**
   * O LADO INVERSO, e ele não é simetria decorativa: artigo de SouTalent fora da lista é artigo que
   * nasceu sem entrar no inventário, e inventário que não conhece o próprio conteúdo deixa de poder
   * medir o que falta. Só cobra depois de a lista fechar, senão seria ruído enquanto o insumo não vem.
   */
  it("nenhum artigo de SouTalent está fora da lista esperada", () => {
    if (!INVENTARIO_FECHADO) return;
    const esperados = new Set(SLUGS_ESPERADOS_SOUTALENT);
    const fora = SOUTALENT.filter((a) => !esperados.has(a.slug)).map((a) => a.slug);
    expect(fora).toEqual([]);
  });

  /**
   * A ROTA DE CADA ARTIGO ESPERADO. Artigo escrito com a rota errada (ou sem ela) EXISTE, aparece no
   * sumário e desaparece do painel contextual da tela que ele ensina, que é o lugar onde alguém de
   * fato o procura. O typecheck não pega, a varredura de coerência só confere se a rota é VIVA.
   */
  it("cada artigo esperado declara a rota que ele ensina", () => {
    const fora: string[] = [];
    for (const [rota, slugs] of Object.entries(SLUGS_ESPERADOS_POR_ROTA)) {
      for (const slug of slugs) {
        const artigo = ARTIGOS.find((a) => a.slug === slug);
        if (!artigo) continue; // já cobrado pela asserção de presença
        if (!artigo.rotas.includes(rota)) fora.push(`${slug}: esperava ${rota}, tem ${artigo.rotas.join(", ") || "(nada)"}`);
      }
    }
    expect(fora).toEqual([]);
  });

  /** Artigo de SouTalent que não ensina nenhuma das três telas de A&S está no módulo errado. */
  it("todo artigo do módulo ensina alguma tela de A&S", () => {
    const fora = SOUTALENT.filter((a) => !a.rotas.some((r) => r.startsWith("/as/"))).map(
      (a) => `${a.slug} -> ${a.rotas.join(", ") || "(sem rota)"}`,
    );
    expect(fora).toEqual([]);
  });
});

// ═══ 2. AS TRÊS ROTAS DE A&S TÊM ARTIGO ════════════════════════════════════════════════════════
describe("2. nenhuma tela de A&S fica SEM_ARTIGO", () => {
  /**
   * `SEM_ARTIGO` é a pior situação do detector de cobertura: a tela não tem quem a ensine, então o
   * botão de ajuda contextual dela não abre nada. A resolução usa `artigosDaRotaEm`, a MESMA do
   * painel e do detector, para não medir a tela contra um artigo que a tela não mostra.
   */
  it.each(ROTAS_DE_AS)("%s tem ao menos um artigo", (rota) => {
    const quemEnsina = artigosDaRotaEm(ARTIGOS, rota).map((a) => a.slug);
    expect(quemEnsina.length, `nenhum artigo ensina ${rota}`).toBeGreaterThan(0);
  });

  /**
   * ─ A ASSERÇÃO ACIMA, SOZINHA, MENTE, E FOI A MEDIÇÃO QUE MOSTROU ISSO ─────────────────────────
   *
   * ┌─ O QUE EU ACHEI MEDINDO, E NÃO ESTAVA NO PEDIDO ───────────────────────────────────────────┐
   * │ A `/as/candidatos` PASSA na asserção de cima hoje, com ZERO artigo de SouTalent. Quem a      │
   * │ "ensina" são cinco artigos de PADRÃO do módulo Começar Aqui, que a declaram entre as rotas    │
   * │ deles: filtrar uma lista, filtrar pelo card, ordenar pelo cabeçalho, virar a página e         │
   * │ importar planilha. Eles estão CERTOS em declará-la, porque o padrão vale mesmo ali.            │
   * │                                                                                               │
   * │ MAS ISSO NÃO É A TELA ENSINADA, e é aqui que a medição vira teste: quem abre a Central De     │
   * │ Candidatos e clica no botão de ajuda recebe "como ordenar uma tabela", e nada sobre o que      │
   * │ aquela tela FAZ. A situação `SEM_ARTIGO` do detector não pega este caso, porque para ele a    │
   * │ rota tem artigo. É um `SEM_ARTIGO` disfarçado, e é o mais caro dos dois: ele parece coberto.   │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it.each(ROTAS_DE_AS)("%s tem artigo DO MÓDULO SouTalent, e não só artigo de padrão", (rota) => {
    const doModulo = artigosDaRotaEm(ARTIGOS, rota).filter((a) => a.modulo === "SOUTALENT");
    expect(
      doModulo.map((a) => a.slug),
      `${rota} só tem artigo de padrão (Começar Aqui) e nenhum artigo de SouTalent: o botão de ` +
        "ajuda daquela tela abre como ordenar tabela, e nada sobre o que a tela faz",
    ).not.toEqual([]);
  });

  /**
   * AS TRÊS FAMÍLIAS DE A&S JÁ EXISTEM E NENHUM ARTIGO AS USA (`as-vagas`, `as-candidatos`,
   * `as-funil`). Bloco compartilhado escrito e não referenciado é pior do que ausente: ele parece
   * que o pré-requisito e os erros comuns daquela tela estão ditos, e eles não chegam a leitor
   * nenhum. Este teste é o que amarra a redação nova nas famílias que já foram escritas para ela, em
   * vez de cada artigo repetir o bloco à mão, que é o defeito que a família existe para eliminar.
   */
  it("as três famílias de A&S são usadas por algum artigo do módulo", () => {
    const usadas = new Set(SOUTALENT.map((a) => a.familia).filter(Boolean));
    const semUso = FAMILIAS_DE_AS.filter((c) => !usadas.has(c));
    expect(semUso).toEqual([]);
  });
});

// ═══ 3. COBERTURA DE CONTROLE ÓRFÃO ════════════════════════════════════════════════════════════
describe("3. todo controle medido na tela é declarado por algum artigo dela", () => {
  /** Todas as chaves que os artigos daquela rota declaram, somadas. */
  const declaradasNaRota = (rota: string): Set<string> => {
    const chaves = new Set<string>();
    for (const artigo of artigosDaRotaEm(ARTIGOS, rota)) {
      for (const chave of controlesDeclarados(artigo)) chaves.add(chave);
    }
    return chaves;
  };

  for (const rota of ROTAS_DE_AS) {
    it(`${rota}: nenhum controle órfão sobra`, () => {
      const declaradas = declaradasNaRota(rota);
      const orfaos = (CONTROLES_ORFAOS_POR_ROTA[rota] ?? []).filter(
        (rotulo) => !declaradas.has(chaveDeControle(rotulo).chave),
      );
      expect(orfaos).toEqual([]);
    });
  }

  /**
   * A LISTA DE ÓRFÃOS NÃO PODE CONTER RÓTULO QUE A PODA COME. Se um rótulo desta lista virar
   * chave-só-valor (só dígito, ou só valor de catálogo), ele é indeclarável por construção e cobrar
   * por ele seria cobrar o impossível. Nenhum dos medidos é assim hoje, e este teste é o canário de
   * quando alguém acrescentar um que seja.
   */
  it("nenhum órfão listado é um rótulo que nenhum artigo pode declarar", () => {
    const impossiveis: string[] = [];
    for (const [rota, rotulos] of Object.entries(CONTROLES_ORFAOS_POR_ROTA)) {
      for (const rotulo of rotulos) {
        const { chave, soValor } = chaveDeControle(rotulo);
        if (!chave || soValor) impossiveis.push(`${rota}: "${rotulo}"`);
      }
    }
    expect(impossiveis).toEqual([]);
  });

  /**
   * OS RÓTULOS NOMINAIS, pela parte estável. Ver o bloco de `ROTULOS_NOMINAIS_PELA_PARTE_ESTAVEL`:
   * o nome da pessoa não entra aqui, e a asserção é sobre os tokens que SÃO o controle.
   */
  it.each(ROTULOS_NOMINAIS_PELA_PARTE_ESTAVEL)(
    "algum artigo do módulo declara o controle de linha $descricao",
    ({ tokens }) => {
      const declaradas = SOUTALENT.flatMap((a) => [...controlesDeclarados(a)]);
      const casou = declaradas.some((chave) => tokens.every((t) => chave.split(" ").includes(t)));
      expect(
        casou,
        `nenhum artigo de SouTalent declara um controle com os tokens [${tokens.join(", ")}]. ` +
          "O rótulo da tela carrega o nome da pessoa e não pode ser escrito literal (§A.6): " +
          "declare a parte estável, que é o que sobra depois da poda do detector.",
      ).toBe(true);
    },
  );
});

// ═══ 4. AS REGRAS DE ESCRITA DA CASA, SÓ NAS FRESTAS QUE A VARREDURA NÃO COBRE ═════════════════
describe("4. §A.11 nas duas frestas que a varredura de coerência não alcança", () => {
  /**
   * FRESTA 1: `controles`. O `textosDe` da varredura de coerência lista título, resumo,
   * pré-requisitos, gesto, detalhe, legenda, sintoma, ação e regras, e NÃO lista `controles`. E
   * `controles` CHEGA AO USUÁRIO: é ele que gera o índice "Nesta Tela" do painel contextual, que não
   * é escrito à mão. Travessão ali aparece na tela como aparece em qualquer outro texto.
   */
  it("nenhum `controles` de SouTalent tem travessão (§A.11)", () => {
    const comTravessao: string[] = [];
    for (const a of SOUTALENT) {
      for (const p of a.passos) {
        for (const c of p.controles ?? []) {
          if (c.includes(TRAVESSAO)) comTravessao.push(`${a.slug}: "${c}"`);
        }
      }
    }
    expect(comTravessao).toEqual([]);
  });

  /**
   * FRESTA 2: O TEXTO QUE VEM DA FAMÍLIA. A varredura de coerência lê `registro.gerado`, que é o
   * artigo CRU: o bloco herdado da família (`preRequisitos` e `seDerErrado` comuns da tela) nunca
   * passa por ela, e nenhum outro spec o mede. Ou seja: hoje um travessão escrito numa família chega
   * ao leitor em TODOS os artigos daquela tela, sem nada falhar. Aqui a medição é sobre o artigo
   * RESOLVIDO, que é o que a tela de fato renderiza.
   */
  it("nenhum texto RESOLVIDO de SouTalent tem travessão, família incluída (§A.11)", () => {
    const comTravessao: string[] = [];
    for (const cru of SOUTALENT) {
      const a = artigoResolvido(cru);
      const textos = [
        ...(a.preRequisitos ?? []),
        ...(a.seDerErrado ?? []).flatMap((s) => [s.sintoma, s.acao]),
      ];
      for (const t of textos) if (t.includes(TRAVESSAO)) comTravessao.push(`${a.slug}: ${t}`);
    }
    expect(comTravessao).toEqual([]);
  });

  /**
   * FAMÍLIA ÓRFÃ. O `tipos.ts` afirma que "família que não existe no registro é erro, conferido por
   * varredura", e a varredura NÃO confere isso: nenhum spec de `src/ajuda` menciona família. O
   * efeito de um código errado é silencioso por desenho, porque `artigoResolvido` devolve o artigo
   * sem o bloco quando não acha a família, para não derrubar a tela do manual. Então o artigo sai
   * SEM o pré-requisito e SEM os erros comuns da tela, e ninguém percebe.
   *
   * Medido só em SouTalent, que é o meu módulo. A varredura geral é lacuna REPORTADA, não consertada
   * aqui: `registro.coerencia.tester.spec.ts` tem outro dono nesta rodada.
   */
  it("toda `familia` declarada por artigo de SouTalent existe no registro de famílias", async () => {
    const { FAMILIA_POR_CODIGO } = (await import("./conteudo/familias.gerado")) as {
      FAMILIA_POR_CODIGO: Record<string, unknown>;
    };
    const orfas = SOUTALENT.filter((a) => a.familia && !FAMILIA_POR_CODIGO[a.familia]).map(
      (a) => `${a.slug} -> ${a.familia}`,
    );
    expect(orfas).toEqual([]);
  });

  /**
   * TODO ARTIGO DO MÓDULO DECLARA UMA DAS TRÊS FAMÍLIAS DE A&S. `familia` é opcional no tipo, e tem
   * de ser, porque artigo de padrão não tem tela dona. Em SouTalent ela não é opcional: as três
   * famílias foram escritas ANTES da redação exatamente para que 29 artigos não nasçam com o mesmo
   * bloco copiado, e artigo que esquece o campo perde o pré-requisito e os erros comuns da tela
   * dele em silêncio, porque `artigoResolvido` não tem como reclamar de um campo ausente.
   *
   * O PILOTO ENTRA AQUI, POR ORDEM EXPLÍCITA DO COORDENADOR ("todo artigo de SOUTALENT"), e vale
   * dizer a consequência em voz alta porque ela não é neutra: `abrir-uma-vaga-nova` nasceu SEM
   * família e passar a declarar `as-vagas` MUDA o texto que o leitor vê, somando os pré-requisitos e
   * os erros comuns da Central De Vagas a um artigo já validado. É mudança desejável (é para isso
   * que a família existe) e é mudança de conteúdo validado, então quem for fazê-la confere a §A.26
   * antes. O outro caminho é o piloto sair desta asserção, como saiu da de print.
   */
  /**
   * ─ A ESCOLHA FOI FEITA: O PILOTO SAI DESTA ASSERÇÃO, COMO SAIU DA DE PRINT ────────────────────
   *
   * O bloco acima oferecia dois caminhos, e o coordenador escolheu o segundo em 30/09/2026, pela
   * §A.26: `abrir-uma-vaga-nova` é conteúdo JÁ VALIDADO pelo diretor, e declarar `as-vagas` nele
   * somaria pré-requisitos e sintomas ao texto que ele aprovou. Mudança de texto validado é dele,
   * não da fábrica, e não se faz para calar um teste.
   *
   * A EXCEÇÃO É NOMINAL E TEM DATA DE SAÍDA, que é o que a separa de uma gaveta: ela vale para UM
   * slug, está escrita aqui e sai no dia em que o diretor disser que o piloto entra na família. Os
   * 28 artigos novos continuam cobrados sem exceção nenhuma, que é onde o teste protege de verdade.
   */
  const PILOTO_FORA_DA_FAMILIA_ATE_O_DIRETOR_DECIDIR = "abrir-uma-vaga-nova";

  it("todo artigo de SouTalent declara uma das três famílias de A&S", () => {
    const fora = SOUTALENT.filter(
      (a) =>
        a.slug !== PILOTO_FORA_DA_FAMILIA_ATE_O_DIRETOR_DECIDIR &&
        (!a.familia || !(FAMILIAS_DE_AS as readonly string[]).includes(a.familia)),
    ).map((a) => `${a.slug} -> ${a.familia ?? "(sem família)"}`);
    expect(fora).toEqual([]);
  });

  /** A contrapartida, para a exceção não virar gaveta: ela vale para UM slug e nenhum outro. */
  it("a exceção da família vale só para o piloto, e ele continua sendo o único sem família", () => {
    const semFamilia = SOUTALENT.filter((a) => !a.familia).map((a) => a.slug);
    expect(semFamilia).toEqual([PILOTO_FORA_DA_FAMILIA_ATE_O_DIRETOR_DECIDIR]);
  });

  /**
   * ─ O ARTIGO NÃO REPETE O QUE JÁ ESTÁ NA FAMÍLIA DELE ──────────────────────────────────────────
   *
   * ┌─ ESTE É O DEFEITO QUE A FAMÍLIA EXISTE PARA IMPEDIR, ENTRANDO DE VOLTA ────────────────────┐
   * │ `artigoResolvido` resolve a repetição de `sintoma` FILTRANDO o da família, com o do artigo    │
   * │ GANHANDO. Isso é a coisa certa na leitura e é péssimo como convite: a duplicação não aparece  │
   * │ na tela, então ela nunca é percebida, e o que fica no disco é o bloco comum copiado dentro do │
   * │ artigo. No primeiro ajuste de regra, alguém corrige a família, os 29 artigos continuam        │
   * │ ensinando o texto antigo do próprio bolso, e a família passa a não governar nada. É o mesmo   │
   * │ modo de falha dos `alvos` duplicados e do `recorte`: dado que dois lugares podem declarar.     │
   * │                                                                                               │
   * │ O `preRequisitos` cai na mesma régua, por igualdade de texto: lá o `Set` de `artigoResolvido` │
   * │ esconde a repetição do mesmo jeito.                                                            │
   * └────────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A REGRA DE ESCRITA JÁ ESTÁ NO `LEIA-ME.md` das famílias ("o artigo escreve SÓ o que é dele"), e
   * regra escrita e não medida é regra que a terceira onda de redação esquece.
   */
  it("nenhum artigo de SouTalent repete sintoma ou pré-requisito da própria família", async () => {
    const { FAMILIA_POR_CODIGO } = (await import("./conteudo/familias.gerado")) as {
      FAMILIA_POR_CODIGO: Record<string, FamiliaDeArtigos | undefined>;
    };
    const repetidos: string[] = [];
    for (const a of SOUTALENT) {
      const familia = a.familia ? FAMILIA_POR_CODIGO[a.familia] : undefined;
      if (!familia) continue; // ausência e código órfão já são cobrados acima
      const sintomasDaFamilia = new Set(familia.seDerErrado.map((s) => s.sintoma));
      for (const s of a.seDerErrado ?? []) {
        if (sintomasDaFamilia.has(s.sintoma)) {
          repetidos.push(`${a.slug}: sintoma já está em "${a.familia}": ${s.sintoma}`);
        }
      }
      const preDaFamilia = new Set(familia.preRequisitos);
      for (const pr of a.preRequisitos ?? []) {
        if (preDaFamilia.has(pr)) {
          repetidos.push(`${a.slug}: pré-requisito já está em "${a.familia}": ${pr}`);
        }
      }
    }
    expect(repetidos).toEqual([]);
  });
});

// ═══ 5. PRINT: VETADO NESTA FRENTE, E É POR ISSO QUE O CRUZAMENTO NÃO SE DUPLICA AQUI ═════════
/*
 * ┌─ O ITEM 5 DO PEDIDO ESTÁ INTEIRO EM `registro.coerencia.tester.spec.ts`, E NÃO É REPETIDO ───┐
 * │ A varredura já casa artigo ⇄ roteiro nos DOIS sentidos, para todo módulo, e lê os roteiros DO │
 * │ DISCO, então o artigo 29 entraria nela sozinho: "print de artigo sem captura", "PNG órfão",    │
 * │ "todo roteiro pertence a um artigo que existe" e "a `url` do roteiro está entre as `rotas` do  │
 * │ artigo". Uma segunda cópia escrita por módulo envelheceria sozinha, e no dia em que a régua     │
 * │ mudasse os dois arquivos discordariam com a divergência escondida atrás de dois verdes.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E NESTA FRENTE NÃO HÁ PRINT NENHUM, POR VETO DO `seguranca`, NÃO POR ATRASO ───────────────┐
 * │ A captura de TODA superfície de A&S está vetada, e o motivo de fundo é medido: `as_candidatos` │
 * │ e `as_candidaturas` têm ZERO linha na homologação, então as listas de A&S estão vazias e não    │
 * │ há o que fotografar. Print de tela vazia PARECE pronto, que é pior do que print faltando, e é  │
 * │ justamente o que a régua de linhas do motor existe para recusar.                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ENTÃO A ASSERÇÃO DESTA FRENTE É A INVERSA, e ela é a única do gênero que faz sentido aqui.
 * ARTIGO SEM ROTEIRO **NÃO** É ERRO, e por isso não existe teste exigindo roteiro para os 29: nada
 * na varredura de coerência cobra roteiro de um artigo, só o contrário. O que PRECISA ser medido é o
 * lado que cobra: `print` declarado num passo sem captura que o produza é exatamente o vermelho que
 * a varredura acusa, e nesta frente ele seria vermelho SEM CONSERTO POSSÍVEL, porque a captura está
 * vetada. Medir aqui faz o vermelho aparecer no arquivo certo, com o motivo escrito, em vez de
 * aparecer na varredura geral parecendo roteiro atrasado.
 */
/**
 * ─ O PILOTO SAI DESTA ASSERÇÃO, E ISSO É UMA PERGUNTA AO COORDENADOR, NÃO UMA GAVETA ───────────
 *
 * `abrir-uma-vaga-nova` é ANTERIOR ao veto e declara QUATRO prints, com roteiro irmão no disco. Hoje
 * ele está coerente (a varredura casa os dois lados) e nenhum PNG foi gravado, porque a execução do
 * motor já estava vetada por outro gate.
 *
 * ENTÃO ELE NÃO ENTRA NO VERMELHO, e o motivo é de método: cobrá-lo aqui pediria a um agente de
 * redação que APAGASSE conteúdo já validado, o que a §A.26 manda perguntar antes de fazer, e o
 * vermelho ficaria sem conserto legítimo. O `tester` não fabrica vermelho que só se conserta
 * violando regra.
 *
 * A DECISÃO É DO COORDENADOR, e ela é real: ou o veto de captura vale RETROATIVAMENTE e os quatro
 * prints do piloto saem (e esta exceção sai junto), ou o veto vale só para os 28 novos e o piloto
 * fica como está. Não dá para ficar nos dois, porque a diferença aparece no dia em que o motor
 * puder rodar: o piloto tentaria fotografar a Central De Vagas, que é a superfície vetada.
 */
export const PILOTO_COM_PRINT_ANTERIOR_AO_VETO = "abrir-uma-vaga-nova";

/**
 * ─ O VETO FOI LEVANTADO EM 30/09/2026, E A ASSERÇÃO VIROU O CONTRÁRIO DELA ─────────────────────
 *
 * ┌─ O QUE ESTE BLOCO AFIRMAVA, E POR QUE ELE ESTAVA CERTO NAQUELE DIA ─────────────────────────┐
 * │ Ele exigia que NENHUM artigo de A&S declarasse `print`, e a razão era dupla: o `seguranca`     │
 * │ vetara a captura de toda superfície do módulo, e as tabelas de A&S da homologação estavam      │
 * │ VAZIAS, então não havia o que fotografar. Print declarado ali seria buraco tracejado           │
 * │ permanente no artigo.                                                                          │
 * │                                                                                                │
 * │ AS DUAS CAUSAS CAÍRAM NO MESMO DIA: o diretor destravou a semeadura de dado sintético, a linha  │
 * │ suja que reprovava a base foi apagada, um arnês de A&S foi semeado, e o motor voltou a aprovar  │
 * │ a base. O veto era sobre a CAPTURA, não sobre o módulo, e ele cumpriu o papel: nenhum PNG com   │
 * │ dado de pessoa entrou no repositório enquanto a homologação estava suja.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ASSERÇÃO NÃO FOI APAGADA, FOI INVERTIDA, e é essa a diferença que importa: apagar deixaria a
 * frente sem nenhuma medida sobre imagem. Agora o teste cobra a COERÊNCIA que continua valendo, e
 * que a varredura geral não alcança por módulo: passo que declara `print` tem `arquivo` e `legenda`
 * preenchidos, e nenhum artigo do módulo declara a imagem da FICHA DO CANDIDATO, que segue VETADA
 * com o veredito "não fotografa" (ela concentra documento, telefone, e-mail e nascimento num bloco
 * só, e há um falso negativo provado no telefone sem máscara).
 */
const ARTIGO_SEM_IMAGEM_POR_VETO_DO_AUDITOR = "ler-a-ficha-do-candidato";

describe("5. a imagem em A&S, depois de a captura ser destravada", () => {
  it("todo print declarado tem arquivo e legenda", () => {
    const frouxos: string[] = [];
    for (const a of SOUTALENT) {
      for (const p of a.passos) {
        if (!p.print) continue;
        if (!p.print.arquivo?.trim() || !p.print.legenda?.trim()) {
          frouxos.push(`${a.slug} -> ${p.print.arquivo || "(sem arquivo)"}`);
        }
      }
    }
    expect(frouxos).toEqual([]);
  });

  /**
   * A TRAVA QUE SOBREVIVE AO DESTRAVAMENTO, e ela é a única do bloco que protege alguém: a ficha do
   * candidato continua vetada NOMINALMENTE. Sem este teste, a próxima onda de roteiros a fotografa
   * sem querer, porque o motivo do veto não está na tela, está no parecer.
   */
  it("a ficha do candidato continua sem imagem, por veto nominal do auditor", () => {
    const ficha = SOUTALENT.find((a) => a.slug === ARTIGO_SEM_IMAGEM_POR_VETO_DO_AUDITOR);
    expect(ficha, `${ARTIGO_SEM_IMAGEM_POR_VETO_DO_AUDITOR} sumiu do módulo`).toBeTruthy();
    expect(ficha!.passos.filter((p) => p.print)).toEqual([]);
  });
});

// ═══ 6. NÍVEL: N1 POR ROTA, QUE É A FRESTA DO N1 POR MÓDULO ════════════════════════════════════
describe("6. cada tela de A&S tem caminho principal (N1)", () => {
  /**
   * A VARREDURA DE COERÊNCIA MEDE N1 POR **MÓDULO**, e para SouTalent isso não basta: o módulo tem
   * TRÊS telas, e o piloto já garante um N1 nele. Ou seja, o módulo inteiro passaria com a Central De
   * Vagas ensinada e as outras duas telas só com artigo N2.
   *
   * E ISSO NÃO É RIGOR DECORATIVO: o corte das fases é por PROFUNDIDADE (`nivel`, no `tipos.ts`), e
   * a promessa do N1 é literal, "quem ler só os N1 consegue trabalhar". Quem lê só os N1 e cai na
   * Central De Candidatos sem nenhum N1 não consegue trabalhar em A&S, e a fase teria sido declarada
   * entregue.
   */
  it.each(ROTAS_DE_AS)("%s tem ao menos um artigo N1", (rota) => {
    const n1 = artigosDaRotaEm(ARTIGOS, rota).filter((a) => a.nivel === "N1");
    expect(n1.map((a) => a.slug).length, `${rota} não tem caminho principal`).toBeGreaterThan(0);
  });

  /**
   * O N1 TEM DE SER DO MÓDULO, pelo mesmo motivo do bloco 2: a `/as/candidatos` tem N1 hoje, e ele é
   * o artigo de ORDENAR TABELA. Caminho principal de uma tela de A&S é o artigo que ensina a tela.
   */
  it.each(ROTAS_DE_AS)("%s tem N1 DO MÓDULO SouTalent", (rota) => {
    const n1 = artigosDaRotaEm(ARTIGOS, rota).filter(
      (a) => a.modulo === "SOUTALENT" && a.nivel === "N1",
    );
    expect(n1.map((a) => a.slug), `${rota} não tem caminho principal de SouTalent`).not.toEqual([]);
  });
});
