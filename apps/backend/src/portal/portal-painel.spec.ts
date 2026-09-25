import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ORIGENS_DE_ENVIO_DO_LINK, SEM_ORIGEM_DE_ENVIO } from "@ea/shared-types";
import { menuDaOperacao } from "../domain/menus";
import {
  contarPainel,
  estadoDoLinkNoPainel,
  PAGINA_MAXIMA_INDICE_PAINEL,
  PAGINA_MAXIMA_PAINEL,
  PAGINA_PADRAO_PAINEL,
  recorteDaPagina,
  type FatoDaAdmissaoNoPainel,
} from "../domain/portal-painel";
import { PortalPainelController } from "./portal-painel.controller";
import {
  FAROIS_FORA_DO_PAINEL,
  PortalPainelService,
  SEM_DOCUMENTO_PENDENTE,
} from "./portal-painel.service";

/**
 * O GERENCIADOR DO PORTAL. Cinco contadores, uma lista, e quatro condições que a auditoria de mapa
 * impôs ANTES de existir código.
 *
 * §A.6: todos os fixtures deste arquivo são identificador técnico, contagem e carimbo de tempo. O
 * único nome que aparece é o de um candidato SINTÉTICO, e não há CPF em lugar nenhum.
 */

const ARQUIVO_SERVICO = readFileSync(join(__dirname, "portal-painel.service.ts"), "utf8");
/**
 * O CÓDIGO SEM OS COMENTÁRIOS. As asserções da condição 4 procuram campo PROIBIDO, e este arquivo
 * é comentado justamente com o nome dos campos que ele não usa ("sem `ua_hash`, sem geografia").
 * Varrer o texto inteiro reprovaria a explicação de por que a coisa não está lá.
 */
const CODIGO_SERVICO = semComentarios(ARQUIVO_SERVICO);
const ARQUIVO_CONTROLLER = readFileSync(join(__dirname, "portal-painel.controller.ts"), "utf8");
const ARQUIVO_IDENTIDADE = readFileSync(join(__dirname, "portal-identidade.service.ts"), "utf8");

// ══ CONDIÇÃO 1: A ROTA NÃO NASCE SOB `portal/` ═══════════════════════════════════════════════

describe("CONDIÇÃO 1: território autenticado, nunca o prefixo da barreira", () => {
  it("a controller mora sob `esteira/`, no molde da de pendências", () => {
    expect(ARQUIVO_CONTROLLER).toContain('@Controller("esteira/portal-painel")');
  });

  /**
   * O ERRO QUE ESTA ASSERÇÃO IMPEDE: uma allowlist de barreira escrita por PREFIXO exporia à
   * internet tudo que estiver sob `portal/`. Nas rotas de pendência isso exporia dois POST que
   * ainda exigem adivinhar dois UUID; AQUI exporia um GET com a lista nominal de candidatos, que é
   * o enumerador pronto, sem nada para adivinhar.
   */
  it("nenhum `@Controller` deste arquivo começa por `portal/`", () => {
    const prefixos = [...ARQUIVO_CONTROLLER.matchAll(/@Controller\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(prefixos).not.toHaveLength(0);
    for (const prefixo of prefixos) expect(prefixo.startsWith("portal/")).toBe(false);
  });

  it("não é `@Public()`: esta tela é do TIME, e exige sessão do EA", () => {
    expect(ARQUIVO_CONTROLLER).not.toContain("@Public()");
  });
});

describe("CONDIÇÃO 1: a controller nova é REIVINDICADA por menu", () => {
  const HANDLERS = Object.getOwnPropertyNames(PortalPainelController.prototype).filter(
    (n) => n !== "constructor",
  );

  it("a controller tem os três handlers esperados", () => {
    // `filtros` é o catálogo das opções (§A.37), que nasceu na segunda rodada. Ele lista cliente,
    // cargo e documento do recorte inteiro: se ficasse fora do menu, qualquer sessão autenticada
    // leria o catálogo de clientes e cargos com link emitido, que é meia lista nominal.
    expect(HANDLERS.sort()).toEqual(["candidatos", "contadores", "filtros"]);
  });

  /**
   * O coringa `PortalLinksController.*` NÃO alcança classe nova: o índice é por
   * `Controller.handler`. Operação não reivindicada passa LIVRE pelo `MenuGuard`, e o que passaria
   * aqui é a lista nominal de candidatos.
   */
  it.each(HANDLERS)("`%s` é reivindicada, e não fica aberta a qualquer sessão", (handler) => {
    expect(
      menuDaOperacao("PortalPainelController", handler),
      "operação não reivindicada por menu nenhum: qualquer sessão autenticada a alcança",
    ).toBeTruthy();
  });

  it("o menu é o MESMO da emissão do link: quem emite é quem acompanha", () => {
    expect(menuDaOperacao("PortalPainelController", "contadores")).toBe(
      menuDaOperacao("PortalLinksController", "emitir"),
    );
  });
});

// ══ CONDIÇÃO 2: O ACESSO É CARIMBO NA LINHA, NÃO CONTAGEM DE EVENTO ══════════════════════════

describe("CONDIÇÃO 2: o contador de acesso não se apoia na trilha", () => {
  it("o painel NÃO lê `portal_eventos` em lugar nenhum", () => {
    expect(ARQUIVO_SERVICO).not.toMatch(/portalEventos|portal_eventos/);
  });

  it("o carimbo é escrito na identificação BEM-SUCEDIDA, depois da recusa por não casar", () => {
    const recusa = ARQUIVO_IDENTIDADE.indexOf('corpoDoErro("NAO_CASOU"');
    const carimbo = ARQUIVO_IDENTIDADE.indexOf("await this.carimbarAcesso(");
    expect(recusa).toBeGreaterThan(0);
    expect(carimbo).toBeGreaterThan(recusa);
  });

  /**
   * FORA DO `try/catch` DA TRILHA, e é isto que separa o carimbo do log: `registrar` engole falha
   * de propósito, e um contador que engole falha fabrica o falso "não acessou" que faz o consultor
   * REEMITIR o link, revogando o link vivo de quem está enviando documento naquele instante.
   */
  it("a chamada do carimbo não está embrulhada em `try`", () => {
    const corpo = ARQUIVO_IDENTIDADE.slice(
      ARQUIVO_IDENTIDADE.indexOf("await this.carimbarAcesso(") - 400,
      ARQUIVO_IDENTIDADE.indexOf("await this.carimbarAcesso(") + 60,
    );
    expect(corpo).not.toMatch(/\btry\s*{/);
  });

  it("o primeiro acesso é imutável no BANCO (`coalesce`), não por um `if` do serviço", () => {
    expect(ARQUIVO_IDENTIDADE).toMatch(/primeiroAcessoEm: sql`coalesce\(/);
    expect(ARQUIVO_IDENTIDADE).toMatch(/ultimoAcessoEm: agora/);
  });

  it("o carimbo usa o `jti` VERIFICADO, nunca o declarado", () => {
    expect(ARQUIVO_IDENTIDADE).toContain("this.carimbarAcesso(bilhete.jti");
  });
});

// ══ CONDIÇÃO 3: PAGINAÇÃO COM TETO NO SERVIDOR ═══════════════════════════════════════════════

describe("CONDIÇÃO 3: o teto da página é do servidor", () => {
  it("sem parâmetro, a página é a cheia padrão e começa do início", () => {
    expect(recorteDaPagina({})).toEqual({ limite: PAGINA_PADRAO_PAINEL, deslocamento: 0 });
  });

  it("`tamanho` gigante é CORTADO no teto, e não obedecido", () => {
    expect(recorteDaPagina({ tamanho: 100000 }).limite).toBe(PAGINA_MAXIMA_PAINEL);
    expect(recorteDaPagina({ tamanho: "100000" }).limite).toBe(PAGINA_MAXIMA_PAINEL);
  });

  it("entrada inválida cai na direção segura, sem lançar", () => {
    for (const valor of ["", "abc", "-5", "0", "1e9999", null, undefined, Number.NaN]) {
      const r = recorteDaPagina({ pagina: valor as never, tamanho: valor as never });
      expect(r.limite).toBeGreaterThan(0);
      expect(r.limite).toBeLessThanOrEqual(PAGINA_MAXIMA_PAINEL);
      expect(r.deslocamento).toBeGreaterThanOrEqual(0);
    }
  });

  it("o deslocamento acompanha a página pedida", () => {
    expect(recorteDaPagina({ pagina: 3, tamanho: 10 })).toEqual({ limite: 10, deslocamento: 20 });
  });

  /**
   * ACHADO L1: O ÍNDICE DA PÁGINA TAMBÉM TEM TETO.
   *
   * O teto do TAMANHO protege o volume da resposta e deixava o `OFFSET` livre: a auditoria
   * reproduziu `bigint out of range` no banco com `?pagina=1e19`, ou seja, 500 em rota autenticada
   * causado por entrada do cliente. Cortar aqui é mais barato que tratar erro de driver lá.
   */
  it("`pagina` absurda é CORTADA, e o deslocamento nunca estoura a faixa do inteiro", () => {
    for (const absurda of ["1e19", "99999999999999999999", 1e19]) {
      const r = recorteDaPagina({ pagina: absurda as never, tamanho: 100 });
      expect(r.deslocamento).toBe((PAGINA_MAXIMA_INDICE_PAINEL - 1) * 100);
      expect(r.deslocamento).toBeLessThan(2_147_483_647);
      expect(Number.isSafeInteger(r.deslocamento)).toBe(true);
    }
  });

  it("o `LIMIT` e o `OFFSET` estão na CONSULTA, não numa fatia em memória", () => {
    expect(ARQUIVO_SERVICO).toMatch(/\.limit\(limite\)/);
    expect(ARQUIVO_SERVICO).toMatch(/\.offset\(deslocamento\)/);
  });

  it("as TRÊS rotas mandam `no-store, private`, como a rota do candidato", () => {
    const cabecalhos = ARQUIVO_CONTROLLER.match(/"Cache-Control": "no-store, private"/g) ?? [];
    expect(cabecalhos).toHaveLength(3);
  });

  /**
   * NENHUM PARÂMETRO DE ADMISSÃO, nem opcional: o recorte é do servidor. Um `?admissaoId=` aqui
   * viraria consulta dirigida a qualquer admissão da base, inclusive as que o recorte exclui.
   */
  it("a controller não aceita parâmetro de admissão", () => {
    const parametros = [...ARQUIVO_CONTROLLER.matchAll(/@Query\("([^"]+)"\)/g)].map((m) => m[1]);
    // OS FILTROS RECORTAM, NENHUM DELES ESCOLHE UMA LINHA. Esta lista é fechada de propósito: o
    // dia em que `admissaoId` (ou `cpf`) entrar aqui, a tela de acompanhamento vira consulta
    // dirigida a qualquer admissão da base, que é a condição 1 da auditoria de mapa.
    expect(parametros.sort()).toEqual([
      "aba",
      "cargos",
      "clientes",
      "dataAdmissaoAte",
      "dataAdmissaoDe",
      "documentos",
      "estadosLink",
      "nome",
      // O CARD deixou de ser filtro de tela e virou parâmetro de SERVIDOR (`recorte`), e a origem
      // do envio nasceu com o filtro junto (§A.37). Nenhum dos dois ESCOLHE uma linha: os dois
      // recortam o que o servidor já decidiu mostrar, que é a régua desta lista fechada.
      "origens",
      "pagina",
      "recorte",
      "situacoes",
      "tamanho",
      "ultimoAcessoAte",
      "ultimoAcessoDe",
    ]);
    expect(parametros).not.toContain("admissaoId");
    expect(ARQUIVO_CONTROLLER).not.toMatch(/@Param\(/);
  });
});

// ══ CONDIÇÃO 4: O QUE NÃO PODE APARECER NESTA TELA ═══════════════════════════════════════════

describe("CONDIÇÃO 4: a Sala De Segurança não vaza para a tela operacional", () => {
  it.each(["ipHash", "ip_hash", "uaHash", "ua_hash", "portalEventosIp", "geo"])(
    "o serviço não projeta `%s`",
    (proibido) => {
      expect(CODIGO_SERVICO).not.toContain(proibido);
    },
  );

  /**
   * CONTAGEM DE TENTATIVA FALHA É ORÁCULO, e foi ela que o catálogo de log fechou ao forçar
   * `NAO_CASOU` em toda recusa. Devolvê-la numa tela operacional a reabriria por outra porta.
   */
  it("não sai contagem de tentativa de identificação", () => {
    expect(CODIGO_SERVICO).not.toMatch(/tentativas/);
  });

  it("a data de fim da suspensão não é projetada para fora: só o binário", () => {
    // `suspensoAte` é LIDO (é o que decide o estado), e não pode ser DEVOLVIDO. A leitura passou a
    // vir da projeção única (`COLUNAS_DO_LINK`), que é o que impede a próxima coluna de estado de
    // ser esquecida numa das cinco portas; o que esta asserção guarda continua sendo a SAÍDA.
    expect(CODIGO_SERVICO).toContain("...COLUNAS_DO_LINK");
    expect(CODIGO_SERVICO).not.toMatch(/suspensoAte:\s*(linha|l)\./);
    expect(CODIGO_SERVICO).not.toMatch(/suspensoAteEm|suspensoAte\.toISOString/);
  });

  /**
   * O CPF aparece no serviço UMA vez e por um motivo só: ele é a chave estrangeira que liga
   * `admissoes` a `candidatos` (`eq(candidatos.cpf, admissoes.candidatoCpf)`). Ler a chave num
   * `join` não é projetar, não é filtrar e não é buscar. O que esta asserção proíbe é o CPF sair
   * numa projeção ou entrar como parâmetro de busca, que é o oráculo de existência.
   */
  it("o CPF só aparece como chave de junção: nunca projetado, nunca buscado", () => {
    const linhasComCpf = CODIGO_SERVICO.split("\n").filter((l) => /cpf/i.test(l));
    expect(linhasComCpf).toHaveLength(1);
    expect(linhasComCpf[0]).toContain("eq(candidatos.cpf, admissoes.candidatoCpf)");
    expect(CODIGO_SERVICO).not.toMatch(/\bcpf\b\s*[:=]/i);
    expect(semComentarios(ARQUIVO_CONTROLLER)).not.toMatch(/cpf/i);
  });
});

// ══ CONDIÇÃO 5: §A.16, DECLÍNIO FORA DA FILA E DE TODOS OS CONTADORES ════════════════════════

describe("CONDIÇÃO 5: o declínio sai EM CÓDIGO, não por filtro de tela", () => {
  it("DECLINOU e RESCISAO estão na lista de exclusão", () => {
    expect(FAROIS_FORA_DO_PAINEL).toContain("DECLINOU");
    expect(FAROIS_FORA_DO_PAINEL).toContain("RESCISAO");
  });

  /**
   * A lista é aplicada nas TRÊS consultas que definem o universo: o recorte do funil, o total da
   * lista e a página. Uma delas sem o filtro faria os números divergirem entre o card e a tabela.
   */
  it("toda consulta que define o universo aplica o filtro de farol", () => {
    // QUATRO desde a segunda rodada: o recorte do funil, o total da lista, a página e o CATÁLOGO
    // dos filtros. O catálogo entrou na conta porque oferecer um cliente que só tem declínio
    // criaria uma opção que nunca traz linha, e a pessoa filtraria por ela achando que a fila
    // esvaziou.
    const universo = (CODIGO_SERVICO.match(/notInArray\(admissoes\.farolGlobal/g) ?? []).length;
    expect(universo).toBe(4);
  });
});

// ══ OS CINCO CONTADORES ══════════════════════════════════════════════════════════════════════

/**
 * O padrão é uma admissão com RÉGUA DE VERDADE (10 obrigatórios) e nada pendente: régua vazia é
 * caso EXCEPCIONAL e tem teste próprio, porque a auditoria mostrou que ela se disfarça de coleta
 * completa (achado M1).
 */
const fato = (f: Partial<FatoDaAdmissaoNoPainel> = {}): FatoDaAdmissaoNoPainel => ({
  acessou: false,
  obrigatorios: 10,
  obrigatoriosPendentes: 0,
  noTime: false,
  ...f,
});

describe("os cinco contadores", () => {
  it("ENCAMINHADOS é o tamanho do recorte; NÃO ACESSARAM é DERIVADO, e a soma fecha", () => {
    const c = contarPainel([fato({ acessou: true }), fato(), fato()]);
    expect(c.encaminhados).toBe(3);
    expect(c.acessaram).toBe(1);
    expect(c.naoAcessaram).toBe(2);
    expect(c.acessaram + c.naoAcessaram).toBe(c.encaminhados);
  });

  /**
   * A DEFINIÇÃO CORRIGIDA, e a versão anterior media a coisa errada: "zero obrigatório pendente"
   * sozinho fecha IGUAL quando o CONSULTOR subiu tudo pela Esteira e o candidato nunca abriu o
   * link. O painel exibiria conclusão de uma coleta que não houve.
   */
  it("CONCLUÍRAM exige acesso: régua completa sem acesso NÃO conta", () => {
    const c = contarPainel([fato({ acessou: false, obrigatoriosPendentes: 0 })]);
    expect(c.concluiram).toBe(0);
  });

  it("CONCLUÍRAM exige régua zerada: acesso com pendência NÃO conta", () => {
    const c = contarPainel([fato({ acessou: true, obrigatoriosPendentes: 2 })]);
    expect(c.acessaram).toBe(1);
    expect(c.concluiram).toBe(0);
  });

  it("acessou E zero pendente conta uma vez", () => {
    const c = contarPainel([fato({ acessou: true, obrigatoriosPendentes: 0 })]);
    expect(c.concluiram).toBe(1);
  });

  /**
   * ACHADO M1: RÉGUA VAZIA NÃO É COLETA COMPLETA.
   *
   * São 6 admissões vivas na produção (de 1.963) cujo par cliente+cargo não tem NENHUMA linha
   * obrigatória, e `emitirLink` não checa régua nenhuma. Sem esta distinção, bastaria o candidato
   * abrir o link para o painel cravar "concluiu, 0 de 0" sobre quem não enviou um documento.
   */
  it("RÉGUA VAZIA com acesso NÃO conclui, e continua contando como acesso", () => {
    const c = contarPainel([fato({ acessou: true, obrigatorios: 0, obrigatoriosPendentes: 0 })]);
    expect(c.encaminhados).toBe(1);
    expect(c.acessaram).toBe(1);
    expect(c.concluiram).toBe(0);
    // Ela não some do funil: fica onde dá para enxergar, como acesso que não fechou.
    expect(c.naoAcessaram).toBe(0);
  });

  it("régua vazia SEM acesso também não conclui, pelos dois motivos ao mesmo tempo", () => {
    expect(contarPainel([fato({ acessou: false, obrigatorios: 0 })]).concluiram).toBe(0);
  });

  it("INTERVENÇÃO HUMANA é ortogonal: quem caiu para o time e concluiu conta nos dois", () => {
    const c = contarPainel([fato({ acessou: true, obrigatoriosPendentes: 0, noTime: true })]);
    expect(c.concluiram).toBe(1);
    expect(c.intervencaoHumana).toBe(1);
  });

  it("recorte vazio devolve cinco zeros, e não `NaN`", () => {
    expect(contarPainel([])).toEqual({
      encaminhados: 0,
      acessaram: 0,
      naoAcessaram: 0,
      concluiram: 0,
      intervencaoHumana: 0,
    });
  });
});

// ══ O ESTADO DO LINK ═════════════════════════════════════════════════════════════════════════

const AGORA = Date.parse("2026-09-20T12:00:00.000Z");
const daqui = (ms: number) => new Date(AGORA + ms);

describe("o estado do link na coluna do painel", () => {
  it("vivo é prazo no futuro, sem revogação e sem suspensão", () => {
    expect(estadoDoLinkNoPainel({ expiraEm: daqui(3_600_000) }, AGORA)).toBe("VIVO");
  });

  it("prazo vencido é VENCIDO", () => {
    expect(estadoDoLinkNoPainel({ expiraEm: daqui(-1) }, AGORA)).toBe("VENCIDO");
  });

  it("revogado VENCE tudo: reemitir é a ação, e não esperar", () => {
    expect(
      estadoDoLinkNoPainel(
        { expiraEm: daqui(3_600_000), revogadoEm: daqui(-1), suspensoAte: daqui(3_600_000) },
        AGORA,
      ),
    ).toBe("REVOGADO");
  });

  it("suspenso vence vencido, porque a ação é diferente (esperar, não reemitir)", () => {
    expect(
      estadoDoLinkNoPainel({ expiraEm: daqui(-1), suspensoAte: daqui(3_600_000) }, AGORA),
    ).toBe("SUSPENSO");
  });

  it("suspensão já passada não suspende mais", () => {
    expect(
      estadoDoLinkNoPainel({ expiraEm: daqui(3_600_000), suspensoAte: daqui(-1) }, AGORA),
    ).toBe("VIVO");
  });

  it("linha ausente é link morto, a mesma direção segura das portas do candidato", () => {
    expect(estadoDoLinkNoPainel(undefined, AGORA)).toBe("REVOGADO");
  });

  it("prazo ausente é link vencido, nunca link eterno", () => {
    expect(estadoDoLinkNoPainel({}, AGORA)).toBe("VENCIDO");
  });
});

/**
 * O RELÓGIO DOS TESTES DE SERVIÇO É O REAL, e não o `AGORA` fixo dos testes de domínio: o serviço
 * lê `Date.now()` para decidir o estado do link, então fixtures presas a uma data literal nasceriam
 * vencidas e o arquivo passaria a mentir conforme o calendário andasse.
 */
const HOJE = Date.now();
const relativo = (ms: number) => new Date(HOJE + ms);

// ══ O SERVIÇO, CONTRA UM BANCO DE MENTIRINHA ═════════════════════════════════════════════════

interface LinhaLinkFake {
  /** O `jti`, que é o `id` da LINHA. É ele que a tela manda de volta nas ações por link. */
  id?: string;
  admissaoId: string;
  criadoEm: Date;
  expiraEm: Date;
  revogadoEm?: Date | null;
  suspensoAte?: Date | null;
  primeiroAcessoEm?: Date | null;
  ultimoAcessoEm?: Date | null;
  /** `portal_links.envio_origem` (migration 0122). Ausente é o link antigo, sem carimbo. */
  envioOrigem?: string | null;
}


/**
 * O `inArray(portalLinks.admissaoId, ...)` DE DENTRO DO `where`, lido da árvore do Drizzle.
 *
 * Existe porque o banco de mentirinha precisa OBEDECER ao recorte derivado, e não só recebê-lo:
 * um fake que descarta o `where` passaria verde num serviço que esquecesse o filtro, e o defeito
 * (aba que não recorta, filtro que não filtra) só apareceria na tela. A leitura é estrutural, e
 * não por texto do SQL: procura-se a coluna `admissao_id` seguida de " in " e da lista de
 * parâmetros. Devolve `null` quando não há esse recorte (o caso do funil, que é do universo
 * inteiro) e `[]` quando a lista veio vazia (o Drizzle troca isso por `false`, e "nada passa" é
 * exatamente o que se espera de um recorte que não sobrou ninguém).
 */
function idsExigidos(condicao: unknown): string[] | null {
  const chunks = (no: unknown): unknown[] | null => {
    const alvo = no as { queryChunks?: unknown[] } | null;
    return alvo && Array.isArray(alvo.queryChunks) ? alvo.queryChunks : null;
  };
  const textoDoChunk = (no: unknown): string | null => {
    const alvo = no as { value?: unknown } | null;
    if (alvo && Array.isArray(alvo.value) && typeof alvo.value[0] === "string") return alvo.value[0];
    return null;
  };
  const nomeDaColuna = (no: unknown): string | null => {
    const alvo = no as { name?: unknown; columnType?: unknown } | null;
    return alvo && typeof alvo.name === "string" && alvo.columnType ? alvo.name : null;
  };

  const visitar = (no: unknown): string[] | null => {
    const filhos = chunks(no);
    if (!filhos) return null;
    for (let i = 0; i < filhos.length; i += 1) {
      if (textoDoChunk(filhos[i]) === "false") return [];
      if (
        nomeDaColuna(filhos[i]) === "admissao_id" &&
        textoDoChunk(filhos[i + 1]) === " in " &&
        Array.isArray(filhos[i + 2])
      ) {
        return (filhos[i + 2] as { value?: unknown }[])
          .map((p) => p.value)
          .filter((v): v is string => typeof v === "string");
      }
    }
    for (const filho of filhos) {
      const achado = visitar(filho);
      if (achado !== null) return achado;
    }
    return null;
  };
  return visitar(condicao);
}

/**
 * Banco de mentirinha no molde da casa: responde pela PROJEÇÃO da consulta, e não pela ordem das
 * chamadas. Ele guarda os links e agrega como o Postgres agregaria, que é o que permite provar o
 * `bool_or`/`max` sobre TODOS os links da admissão sem subir banco.
 */
function banco(dados: {
  links: LinhaLinkFake[];
  cabecalhos?: {
    admissaoId: string;
    nome: string;
    cargo: string;
    cliente: string;
    dataAdmissao?: string | null;
  }[];
  noTime?: string[];
  /** O que a consulta do CATÁLOGO (§A.37) devolveria: pares distintos do recorte. */
  catalogo?: { codCliente: string; cliente: string; cargoId: string; cargo: string }[];
}) {
  const links = dados.links;
  const admissoesComLink = [...new Set(links.map((l) => l.admissaoId))];

  const resolver = (projecao?: Record<string, unknown>, condicao?: unknown): unknown[] => {
    const chaves = Object.keys(projecao ?? {});
    const tem = (c: string) => chaves.includes(c);
    // O RECORTE DERIVADO (aba, situação, documento, estado do link, intervalo de acesso) chega às
    // consultas como `inArray(portalLinks.admissaoId, ...)`. Um banco de mentirinha que ignora o
    // `where` daria verde para um serviço que esqueceu o filtro, então aqui ele é LIDO.
    const exigidos = idsExigidos(condicao);
    const noRecorte = (id: string) => exigidos === null || exigidos.includes(id);
    const visiveis = admissoesComLink.filter(noRecorte);

    if (tem("total")) return [{ total: visiveis.length }];
    if (tem("codCliente")) return dados.catalogo ?? [];
    if (tem("acessou")) {
      return admissoesComLink.map((admissaoId) => {
        const meus = links.filter((l) => l.admissaoId === admissaoId);
        const acessos = meus.map((l) => l.ultimoAcessoEm).filter((d): d is Date => d instanceof Date);
        return {
          admissaoId,
          acessou: meus.some((l) => l.primeiroAcessoEm != null),
          // O MESMO `max` da página: o recorte que alimenta os filtros derivados precisa do
          // carimbo, senão o intervalo de último acesso não teria o que comparar.
          ultimoAcessoEm: acessos.length
            ? new Date(Math.max(...acessos.map((d) => d.getTime())))
            : null,
        };
      });
    }
    if (tem("encaminhadoEm")) {
      return visiveis
        .map((admissaoId) => {
          const meus = links.filter((l) => l.admissaoId === admissaoId);
          const acessos = meus
            .map((l) => l.ultimoAcessoEm)
            .filter((d): d is Date => d instanceof Date);
          return {
            admissaoId,
            ultimoAcessoEm: acessos.length
              ? new Date(Math.max(...acessos.map((d) => d.getTime())))
              : null,
            encaminhadoEm: new Date(Math.max(...meus.map((l) => l.criadoEm.getTime()))),
          };
        })
        .sort((a, b) => b.encaminhadoEm.getTime() - a.encaminhadoEm.getTime());
    }
    if (tem("nome")) return dados.cabecalhos ?? [];
    if (tem("expiraEm")) return links;
    if (tem("admissaoId")) return (dados.noTime ?? []).map((admissaoId) => ({ admissaoId }));
    return [];
  };

  const cadeia = (projecao?: Record<string, unknown>): unknown => {
    let condicao: unknown;
    const proxy: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(resolver(projecao, condicao)).then(ok, erro);
          }
          // O `where` é GUARDADO, e não descartado: é nele que mora o recorte derivado.
          if (prop === "where") {
            return (c: unknown) => {
              condicao = c;
              return proxy;
            };
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };

  return {
    select: (projecao?: Record<string, unknown>) => cadeia(projecao),
    selectDistinct: (projecao?: Record<string, unknown>) => cadeia(projecao),
  } as never;
}

/**
 * Régua de mentirinha: o painel CONSOME o dono do número, nunca recalcula (§A.19).
 *
 * O PADRÃO É UMA RÉGUA DE VERDADE, com 10 obrigatórios e nada entregue. O padrão anterior era
 * `{ entregues: 0, total: 0 }`, que é justamente a RÉGUA VAZIA do achado M1: deixá-lo como padrão
 * faria todo cenário deste arquivo passar pelo caso excepcional sem querer.
 */
function regua(dados: {
  progresso?: Record<string, { entregues: number; total: number }>;
  proximo?: Record<string, string | null>;
}) {
  return {
    progressoObrigatoriosMap: async (ids: string[]) =>
      new Map(ids.map((id) => [id, dados.progresso?.[id] ?? { entregues: 0, total: 10 }])),
    proximoObrigatorioPendenteMap: async (ids: string[]) =>
      new Map(ids.map((id) => [id, dados.proximo?.[id] ?? null])),
  } as never;
}

describe("o resumo, ponta a ponta contra o banco de mentirinha", () => {
  /**
   * O CASO QUE O `bool_or` EXISTE PARA PEGAR: o consultor reemitiu o link, o novo nasceu SEM
   * carimbo, e o candidato já tinha entrado pelo antigo. Olhar só o link vigente devolveria um
   * falso "não acessou", e é esse falso que faz reemitir de novo, matando a sessão de quem está
   * enviando documento naquele instante.
   */
  it("acesso pelo link ANTIGO continua contando depois da reemissão", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          {
            admissaoId: "adm-1",
            criadoEm: relativo(-200_000),
            expiraEm: relativo(-100_000),
            revogadoEm: relativo(-100_000),
            primeiroAcessoEm: relativo(-150_000),
            ultimoAcessoEm: relativo(-140_000),
          },
          { admissaoId: "adm-1", criadoEm: relativo(0), expiraEm: relativo(1_000) },
        ],
      }),
      regua({}),
    );

    const r = await s.resumo();
    expect(r.encaminhados).toBe(1);
    expect(r.acessaram).toBe(1);
    expect(r.naoAcessaram).toBe(0);
  });

  it("quem nunca abriu entra em NÃO ACESSARAM e NÃO conclui, mesmo com a régua zerada", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          { admissaoId: "adm-2", criadoEm: relativo(0), expiraEm: relativo(1_000) },
        ],
      }),
      regua({ progresso: { "adm-2": { entregues: 10, total: 10 } } }),
    );

    const r = await s.resumo();
    expect(r.naoAcessaram).toBe(1);
    expect(r.concluiram).toBe(0);
  });

  it("INTERVENÇÃO HUMANA conta a pendência que caiu e não foi reaberta", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          { admissaoId: "adm-3", criadoEm: relativo(0), expiraEm: relativo(1_000) },
        ],
        noTime: ["adm-3"],
      }),
      regua({}),
    );

    expect((await s.resumo()).intervencaoHumana).toBe(1);
  });

  /**
   * ACHADO M1, PONTA A PONTA: o caso REAL que a produção tem seis vezes. Par (cliente + cargo) sem
   * nenhuma linha obrigatória, link emitido (a emissão não checa régua) e candidato que ABRIU.
   * Antes da correção, esta admissão saía do serviço marcada como CONCLUÍDA.
   */
  it("admissão SEM RÉGUA que foi acessada NÃO entra em CONCLUÍRAM", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          {
            admissaoId: "adm-sem-regua",
            criadoEm: relativo(-10_000),
            expiraEm: relativo(3_600_000),
            primeiroAcessoEm: relativo(-5_000),
            ultimoAcessoEm: relativo(-5_000),
          },
        ],
      }),
      regua({ progresso: { "adm-sem-regua": { entregues: 0, total: 0 } } }),
    );

    const r = await s.resumo();
    expect(r.encaminhados).toBe(1);
    expect(r.acessaram).toBe(1);
    expect(r.concluiram).toBe(0);
  });

  it("a admissão COM régua completa e acesso continua concluindo", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          {
            admissaoId: "adm-ok",
            criadoEm: relativo(-10_000),
            expiraEm: relativo(3_600_000),
            primeiroAcessoEm: relativo(-5_000),
            ultimoAcessoEm: relativo(-5_000),
          },
        ],
      }),
      regua({ progresso: { "adm-ok": { entregues: 10, total: 10 } } }),
    );

    expect((await s.resumo()).concluiram).toBe(1);
  });

  it("sem nenhum link emitido, o funil devolve zeros sem consultar régua", async () => {
    const s = new PortalPainelService(banco({ links: [] }), regua({}));
    expect(await s.resumo()).toMatchObject({ encaminhados: 0, concluiram: 0 });
  });
});

describe("a lista, ponta a ponta contra o banco de mentirinha", () => {
  it("devolve a linha completa, com o estado do link VIGENTE e o progresso da régua", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          {
            admissaoId: "adm-9",
            criadoEm: relativo(-10_000),
            expiraEm: relativo(3_600_000),
            primeiroAcessoEm: relativo(-5_000),
            ultimoAcessoEm: relativo(-4_000),
          },
        ],
        cabecalhos: [
          {
            admissaoId: "adm-9",
            nome: "Candidato Sintético",
            cargo: "Auxiliar",
            cliente: "Loja 1",
            dataAdmissao: "2026-10-01",
          },
        ],
        noTime: ["adm-9"],
      }),
      regua({
        progresso: { "adm-9": { entregues: 7, total: 10 } },
        proximo: { "adm-9": "Comprovante De Residência" },
      }),
    );

    const pagina = await s.listar({});
    expect(pagina.tamanho).toBe(PAGINA_PADRAO_PAINEL);
    expect(pagina.pagina).toBe(1);
    expect(pagina.itens).toHaveLength(1);
    expect(pagina.itens[0]).toEqual({
      admissaoId: "adm-9",
      nome: "Candidato Sintético",
      cargo: "Auxiliar",
      cliente: "Loja 1",
      dataAdmissao: "2026-10-01",
      documentoAtual: "Comprovante De Residência",
      aceitos: 7,
      obrigatorios: 10,
      noTime: true,
      ultimoAcessoEm: relativo(-4_000).toISOString(),
      estadoLink: "VIVO",
      // A ORIGEM do link VIGENTE. O banco de mentirinha não projeta `envioOrigem` nesta linha,
      // então aqui ela é nula, que é exatamente o retrato do link antigo (anterior à 0122).
      origemEnvio: null,
      // O `jti` da LINHA vigente, que é o que a tela manda de volta em revogar, bloquear e
      // desbloquear. O banco de mentirinha não projeta `id`, então aqui ele é nulo.
      linkJti: null,
    });
  });

  it("a linha NÃO carrega campo nenhum da Sala De Segurança", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          {
            admissaoId: "adm-9",
            criadoEm: relativo(0),
            expiraEm: relativo(1_000),
            suspensoAte: relativo(3_600_000),
          },
        ],
        cabecalhos: [{ admissaoId: "adm-9", nome: "Sintético", cargo: "Aux", cliente: "Loja" }],
      }),
      regua({}),
    );

    const [linha] = (await s.listar({})).itens;
    // O bloqueio vira ESTADO, e a data de fim não atravessa.
    expect(linha.estadoLink).toBe("SUSPENSO");
    for (const proibido of ["ip", "ipHash", "uaHash", "cpf", "tentativas", "suspensoAte", "eventos"]) {
      expect(Object.keys(linha)).not.toContain(proibido);
    }
  });

  it("nunca acessou sai como `null`, e não como uma data inventada", async () => {
    const s = new PortalPainelService(
      banco({
        links: [{ admissaoId: "adm-9", criadoEm: relativo(0), expiraEm: relativo(-1) }],
        cabecalhos: [{ admissaoId: "adm-9", nome: "Sintético", cargo: "Aux", cliente: "Loja" }],
      }),
      regua({}),
    );

    const [linha] = (await s.listar({})).itens;
    expect(linha.ultimoAcessoEm).toBeNull();
    expect(linha.estadoLink).toBe("VENCIDO");
  });

  it("o tamanho pedido acima do teto volta CORTADO na própria resposta", async () => {
    const s = new PortalPainelService(banco({ links: [] }), regua({}));
    const pagina = await s.listar({ tamanho: "5000" });
    expect(pagina.tamanho).toBe(PAGINA_MAXIMA_PAINEL);
    expect(pagina.itens).toEqual([]);
  });
});

// ══ SEGUNDA RODADA: A COLUNA NOVA, AS DUAS ABAS, OS FILTROS E O CATÁLOGO ════════════════════

/** Uma admissão que CONCLUIU a coleta: acessou e a régua obrigatória fechou. */
const LINK_CONCLUIDO: LinhaLinkFake = {
  admissaoId: "adm-fim",
  criadoEm: relativo(-20_000),
  expiraEm: relativo(3_600_000),
  primeiroAcessoEm: relativo(-15_000),
  ultimoAcessoEm: relativo(-15_000),
};

/** Uma admissão que ainda dá trabalho: acessou e falta documento. */
const LINK_ANDAMENTO: LinhaLinkFake = {
  admissaoId: "adm-meio",
  criadoEm: relativo(-10_000),
  expiraEm: relativo(3_600_000),
  primeiroAcessoEm: relativo(-5_000),
  ultimoAcessoEm: relativo(-5_000),
};

const CABECALHOS_DOIS = [
  { admissaoId: "adm-fim", nome: "Sintético A", cargo: "Aux", cliente: "Loja 1", dataAdmissao: "2026-10-01" },
  { admissaoId: "adm-meio", nome: "Sintético B", cargo: "Aux", cliente: "Loja 2", dataAdmissao: null },
];

const REGUA_DOIS = () =>
  regua({
    progresso: { "adm-fim": { entregues: 10, total: 10 }, "adm-meio": { entregues: 3, total: 10 } },
    proximo: { "adm-meio": "Comprovante De Residência" },
  });

const servicoDois = () =>
  new PortalPainelService(
    banco({ links: [LINK_CONCLUIDO, LINK_ANDAMENTO], cabecalhos: CABECALHOS_DOIS }),
    REGUA_DOIS(),
  );

describe("a coluna nova: data de admissão", () => {
  it("a data vem da consulta como texto ISO, sem passar por fuso", async () => {
    const itens = (await servicoDois().listar({ aba: "CONCLUIDO" })).itens;
    expect(itens[0].dataAdmissao).toBe("2026-10-01");
  });

  /**
   * ADMISSÃO DE BANCO NÃO TEM DATA (§A.3), e isso NÃO é pendência. O `null` tem de atravessar
   * inteiro: inventar uma data aqui (hoje, ou a da criação) faria a tela cobrar quem não deve.
   */
  it("sem data, a linha devolve `null`, e não uma data inventada", async () => {
    const itens = (await servicoDois().listar({})).itens;
    expect(itens[0].dataAdmissao).toBeNull();
  });

  it("cabeçalho ausente também é `null`, e não `undefined` atravessando para o JSON", async () => {
    const s = new PortalPainelService(
      banco({ links: [LINK_ANDAMENTO] }),
      regua({ progresso: { "adm-meio": { entregues: 1, total: 10 } } }),
    );
    const [linha] = (await s.listar({})).itens;
    expect(linha.dataAdmissao).toBeNull();
    expect(Object.keys(linha)).toContain("dataAdmissao");
  });
});

/**
 * A ABA É RECORTE DO SERVIDOR, e a régua dela é a MESMA do card.
 *
 * Era esse o achado da auditoria: "concluiu" estava escrito duas vezes, no domínio (o card) e na
 * tela. Agora as duas saem de `concluiuAColeta`, e estes testes provam a concordância pelo
 * COMPORTAMENTO, não pelo texto do arquivo: a admissão que o card conta em CONCLUÍRAM é
 * exatamente a que aparece na aba CONCLUIDO, e ela some da aba de trabalho.
 */
describe("as duas abas, recortadas no servidor", () => {
  it("sem parâmetro, a aba é a de trabalho: quem concluiu NÃO aparece", async () => {
    const pagina = await servicoDois().listar({});
    expect(pagina.itens.map((i) => i.admissaoId)).toEqual(["adm-meio"]);
    // O TOTAL ACOMPANHA A ABA, e tem de acompanhar: contando os dois, a tela diria "1 de 2"
    // mostrando 1, e ofereceria uma segunda página que não existe.
    expect(pagina.total).toBe(1);
  });

  it("a aba CONCLUIDO traz só quem terminou a entrega", async () => {
    const pagina = await servicoDois().listar({ aba: "CONCLUIDO" });
    expect(pagina.itens.map((i) => i.admissaoId)).toEqual(["adm-fim"]);
  });

  it("aba desconhecida cai na de trabalho, e não em lista vazia", async () => {
    const pagina = await servicoDois().listar({ aba: "QUALQUER_COISA" });
    expect(pagina.itens.map((i) => i.admissaoId)).toEqual(["adm-meio"]);
  });

  /**
   * OS CONTADORES SÃO DO UNIVERSO INTEIRO, e é por isso que o funil soma igual nas duas abas. Card
   * que muda quando se troca de aba deixa de ser o funil da coleta e vira o tamanho da fila.
   */
  it("o funil NÃO muda com a aba: os cinco números são do recorte inteiro", async () => {
    const funil = await servicoDois().resumo();
    expect(funil).toEqual({
      encaminhados: 2,
      acessaram: 2,
      naoAcessaram: 0,
      concluiram: 1,
      intervencaoHumana: 0,
    });
    // E a conta fecha com as duas abas somadas: 1 concluído + 1 em andamento = 2 encaminhados.
    const emAndamento = (await servicoDois().listar({})).itens.length;
    const concluidos = (await servicoDois().listar({ aba: "CONCLUIDO" })).itens.length;
    expect(emAndamento + concluidos).toBe(funil.encaminhados);
    expect(concluidos).toBe(funil.concluiram);
  });

  /**
   * RÉGUA VAZIA (achado M1) NÃO CONCLUI, então ela fica na aba de TRABALHO. É a direção certa: sem
   * régua não há o que cobrar, mas há o que consertar, e o conserto é do cadastro do par.
   */
  it("régua vazia fica na aba de trabalho, nunca na de concluídos", async () => {
    const s = new PortalPainelService(
      banco({ links: [LINK_CONCLUIDO] }),
      regua({ progresso: { "adm-fim": { entregues: 0, total: 0 } } }),
    );
    expect((await s.listar({})).itens).toHaveLength(1);
    expect((await s.listar({ aba: "CONCLUIDO" })).itens).toHaveLength(0);
  });
});

describe("os filtros derivados, que o banco não sabe responder", () => {
  it("SITUAÇÃO recorta pela mesma régua da tela", async () => {
    const itens = (await servicoDois().listar({ situacoes: ["EM_ANDAMENTO"] })).itens;
    expect(itens.map((i) => i.admissaoId)).toEqual(["adm-meio"]);
    expect((await servicoDois().listar({ situacoes: ["NAO_ACESSOU"] })).itens).toHaveLength(0);
  });

  it("SITUAÇÃO aceita mais de um valor ao mesmo tempo (§A.28)", async () => {
    const itens = (
      await servicoDois().listar({ aba: "CONCLUIDO", situacoes: ["CONCLUIU", "NAO_ACESSOU"] })
    ).itens;
    expect(itens.map((i) => i.admissaoId)).toEqual(["adm-fim"]);
  });

  it("DOCUMENTO ATUAL recorta por nome do tipo, que é o que a célula mostra", async () => {
    const itens = (await servicoDois().listar({ documentos: ["Comprovante De Residência"] })).itens;
    expect(itens.map((i) => i.admissaoId)).toEqual(["adm-meio"]);
  });

  /**
   * O VALOR ESPECIAL DA COLUNA VIRA OPÇÃO DO FILTRO (§A.37): sem ele não há como perguntar "quem
   * já não tem o que enviar", que é metade da pergunta que a coluna cria.
   */
  it("`__SEM_DOCUMENTO` acha quem não tem obrigatório pendente", async () => {
    const itens = (
      await servicoDois().listar({ aba: "CONCLUIDO", documentos: [SEM_DOCUMENTO_PENDENTE] })
    ).itens;
    expect(itens.map((i) => i.admissaoId)).toEqual(["adm-fim"]);
  });

  it("ESTADO DO LINK recorta pelo estado do link VIGENTE", async () => {
    expect((await servicoDois().listar({ estadosLink: ["VIVO"] })).itens).toHaveLength(1);
    expect((await servicoDois().listar({ estadosLink: ["REVOGADO"] })).itens).toHaveLength(0);
  });

  it("INTERVALO DE ÚLTIMO ACESSO recorta pelo dia do carimbo", async () => {
    const hoje = new Date(HOJE);
    const dia = `${hoje.getFullYear()}-${`${hoje.getMonth() + 1}`.padStart(2, "0")}-${`${hoje.getDate()}`.padStart(2, "0")}`;
    expect(
      (await servicoDois().listar({ ultimoAcessoDe: dia, ultimoAcessoAte: dia })).itens,
    ).toHaveLength(1);
    expect((await servicoDois().listar({ ultimoAcessoDe: "2020-01-01", ultimoAcessoAte: "2020-01-02" })).itens).toHaveLength(0);
  });

  /**
   * QUEM NUNCA ACESSOU FICA DE FORA de um intervalo de último acesso. Carimbo ausente não cai em
   * data nenhuma, e tratá-lo como "dentro" encheria o recorte justamente de quem o filtro exclui.
   */
  it("carimbo ausente não entra em intervalo nenhum", async () => {
    const s = new PortalPainelService(
      banco({ links: [{ admissaoId: "adm-sem", criadoEm: relativo(0), expiraEm: relativo(1_000) }] }),
      regua({}),
    );
    expect((await s.listar({ ultimoAcessoDe: "2000-01-01" })).itens).toHaveLength(0);
    expect((await s.listar({})).itens).toHaveLength(1);
  });

  /**
   * DATA INVÁLIDA É 400, NÃO SILÊNCIO. Ignorar a ponta devolveria a lista inteira como se o
   * recorte tivesse sido aplicado, que é a mentira que a §A.28 chama de pior que filtro nenhum.
   */
  it.each(["20/10/2026", "2026-13-99", "ontem", "2026-10"])(
    "`%s` como ponta de intervalo é recusado, e não ignorado",
    async (ruim) => {
      await expect(servicoDois().listar({ dataAdmissaoDe: ruim })).rejects.toThrow(
        BadRequestException,
      );
      await expect(servicoDois().listar({ ultimoAcessoAte: ruim })).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it("ponta vazia é ausência de filtro, e não erro", async () => {
    await expect(
      servicoDois().listar({ dataAdmissaoDe: "", ultimoAcessoAte: "   " }),
    ).resolves.toBeTruthy();
  });
});

/**
 * OS FILTROS QUE O BANCO RESPONDE não passam pelo banco de mentirinha (ele ignora o `where`), então
 * a prova aqui é de que a CLÁUSULA existe e é `IN`. Sem isso, um filtro que a tela oferece e a
 * consulta ignora devolveria a lista inteira como se tivesse recortado.
 */
describe("os filtros de SQL viram `IN`, e a busca vira `ilike`", () => {
  it("cliente e cargo viram `inArray`, que é o `IN` de múltipla seleção", () => {
    expect(CODIGO_SERVICO).toContain("inArray(admissoes.codCliente, clientesPedidos)");
    expect(CODIGO_SERVICO).toContain("inArray(admissoes.cargoId, cargosPedidos)");
  });

  it("a busca por nome é por PEDAÇO, no molde da Esteira", () => {
    expect(CODIGO_SERVICO).toContain("ilike(candidatos.nome, `%${busca}%`)");
  });

  it("a busca NÃO alcança o CPF, nem por acidente de `or`", () => {
    expect(CODIGO_SERVICO).not.toMatch(/ilike\(candidatos\.cpf/);
  });

  it("a data de admissão vira intervalo fechado nas duas pontas", () => {
    expect(CODIGO_SERVICO).toContain("gte(admissoes.dataAdmissao, de)");
    expect(CODIGO_SERVICO).toContain("lte(admissoes.dataAdmissao, ate)");
  });

  /**
   * O RECORTE DERIVADO ENTRA NAS DUAS CONSULTAS DO UNIVERSO (o total e a página). Só na página, o
   * total contaria gente que a aba escondeu, e a tela diria "1 de 30" mostrando 1.
   */
  it("o `inArray` dos ids filtrados está no TOTAL e na PÁGINA", () => {
    const ocorrencias =
      (CODIGO_SERVICO.match(/inArray\(portalLinks\.admissaoId, derivados\.ids\)/g) ?? []).length;
    expect(ocorrencias).toBe(2);
  });
});

describe("o catálogo dos filtros (§A.37)", () => {
  const comCatalogo = () =>
    new PortalPainelService(
      banco({
        links: [LINK_CONCLUIDO, LINK_ANDAMENTO],
        catalogo: [
          { codCliente: "C2", cliente: "Loja 2", cargoId: "cg-1", cargo: "Auxiliar" },
          { codCliente: "C1", cliente: "Loja 1", cargoId: "cg-1", cargo: "Auxiliar" },
        ],
      }),
      REGUA_DOIS(),
    );

  it("cliente e cargo saem do RECORTE, sem repetição e em ordem", async () => {
    const c = await comCatalogo().catalogoDeFiltros();
    expect(c.clientes).toEqual([
      { valor: "C1", rotulo: "Loja 1" },
      { valor: "C2", rotulo: "Loja 2" },
    ]);
    expect(c.cargos).toEqual([{ valor: "cg-1", rotulo: "Auxiliar" }]);
  });

  it("o documento sai da régua, com o valor especial de quem não tem pendente", async () => {
    const c = await comCatalogo().catalogoDeFiltros();
    expect(c.documentos).toEqual([
      { valor: "Comprovante De Residência", rotulo: "Comprovante De Residência" },
      { valor: SEM_DOCUMENTO_PENDENTE, rotulo: "Sem Documento Pendente" },
    ]);
  });

  it("situação e estado do link são catálogo fechado, com rótulo em title case (§A.24)", async () => {
    const c = await comCatalogo().catalogoDeFiltros();
    expect(c.situacoes.map((s) => s.valor)).toEqual([
      "SEM_REGUA",
      "CONCLUIU",
      "INTERVENCAO_HUMANA",
      "NAO_ACESSOU",
      "EM_ANDAMENTO",
    ]);
    expect(c.estadosLink.map((e) => e.valor).sort()).toEqual([
      // BLOQUEADO entrou com o bloqueio manual: estado que a coluna mostra e o filtro não oferece
      // é filtro que mente, porque não há como perguntar "quais links o time fechou".
      "BLOQUEADO",
      "REVOGADO",
      "SUSPENSO",
      "VENCIDO",
      "VIVO",
    ]);
    for (const opcao of [...c.situacoes, ...c.estadosLink]) {
      // §A.11: o travessão é proibido em texto que chega ao usuário.
      expect(opcao.rotulo).not.toContain("—");
      expect(opcao.rotulo[0]).toBe(opcao.rotulo[0].toUpperCase());
    }
  });

  /** §A.6: o catálogo é de cliente, cargo e tipo de documento. Nada de pessoa, nada de CPF. */
  it("o catálogo não carrega nome de candidato nem CPF", async () => {
    const serializado = JSON.stringify(await comCatalogo().catalogoDeFiltros());
    for (const proibido of ["cpf", "Sintético", "ip", "uaHash"]) {
      expect(serializado.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });
});


describe("o `linkJti` da linha, que é o alvo das ações por link", () => {
  /**
   * O CAMPO EXISTE PORQUE AS AÇÕES SÃO POR LINHA E A TABELA É POR ADMISSÃO. Sem ele, a tela mandaria
   * o `admissaoId` num parâmetro lido como `jti`: os dois são UUID, os dois passam pelo
   * `ParseUUIDPipe`, e o erro seria silencioso (nenhuma linha atualizada, resposta de sucesso).
   */
  it("o `jti` sai da MESMA linha que decidiu o estado, nunca de outra", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          {
            id: "link-antigo",
            admissaoId: "adm-9",
            criadoEm: relativo(-20_000),
            expiraEm: relativo(-10_000),
            revogadoEm: relativo(-10_000),
          },
          {
            id: "link-novo",
            admissaoId: "adm-9",
            criadoEm: relativo(-1_000),
            expiraEm: relativo(3_600_000),
          },
        ],
        cabecalhos: [{ admissaoId: "adm-9", nome: "Sintético", cargo: "Aux", cliente: "Loja" }],
      }),
      regua({}),
    );
    const [linha] = (await s.listar({})).itens;
    expect(linha.estadoLink).toBe("VIVO");
    expect(linha.linkJti, "o estado é de um link e o botão agiria em outro").toBe("link-novo");
  });

  /**
   * EMPATE DE `criado_em` RESOLVE SEMPRE IGUAL, e agora isso importa de verdade: enquanto daí saía
   * só o rótulo da coluna, o pior caso era um estado trocado; com o `linkJti` na tela, o mesmo
   * empate viraria BOTÃO AGINDO NO LINK ERRADO. O critério não depende da ordem de chegada.
   */
  it("empate de `criado_em` é resolvido de forma determinística, nas duas ordens", async () => {
    const mesmo = relativo(-1_000);
    const a = { id: "link-a", admissaoId: "adm-9", criadoEm: mesmo, expiraEm: relativo(3_600_000) };
    const b = { id: "link-b", admissaoId: "adm-9", criadoEm: mesmo, expiraEm: relativo(3_600_000) };
    const cabecalhos = [{ admissaoId: "adm-9", nome: "Sintético", cargo: "Aux", cliente: "Loja" }];
    const numaOrdem = new PortalPainelService(banco({ links: [a, b], cabecalhos }), regua({}));
    const naOutra = new PortalPainelService(banco({ links: [b, a], cabecalhos }), regua({}));
    const primeiro = (await numaOrdem.listar({})).itens[0].linkJti;
    const segundo = (await naOutra.listar({})).itens[0].linkJti;
    expect(primeiro).toBe(segundo);
    expect(primeiro).toBe("link-b");
  });

  it("sem link projetado, o campo é `null`, e não `undefined` atravessando para o JSON", async () => {
    const s = new PortalPainelService(
      banco({
        links: [{ admissaoId: "adm-9", criadoEm: relativo(0), expiraEm: relativo(3_600_000) }],
        cabecalhos: [{ admissaoId: "adm-9", nome: "Sintético", cargo: "Aux", cliente: "Loja" }],
      }),
      regua({}),
    );
    const [linha] = (await s.listar({})).itens;
    expect(linha.linkJti).toBeNull();
  });
});

/**
 * ══ O RECORTE DO CARD, AGORA DO SERVIDOR, E A COLUNA DE ORIGEM ═════════════════════════════════
 *
 * ┌─ O DEFEITO, MEDIDO NA HOMOLOGAÇÃO EM 21/09 ─────────────────────────────────────────────────┐
 * │ Contadores CERTOS e tabela vazia ao clicar no card. O contador conta as duas abas; a tabela  │
 * │ vinha cortada pela ABA (padrão "Em Andamento") e o card filtrava NO CLIENTE o que a aba já   │
 * │ tinha cortado. Os que tinham acessado estavam na aba CONCLUÍDO, então "Acessaram 2" zerava   │
 * │ a tabela. Depois que o coordenador se identificou de verdade no portal, os TRÊS              │
 * │ encaminhados passaram a estar na aba CONCLUÍDO, e a aba padrão passou a devolver ZERO com o  │
 * │ card dizendo 3. É esse retrato que o cenário abaixo reproduz.                                │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const VIVO = { criadoEm: relativo(-10_000), expiraEm: relativo(3_600_000) };

/**
 * O POVO DO CENÁRIO: dois concluíram (acessaram e fecharam a régua) e um nunca entrou, apesar de
 * ter a régua completa pela Esteira, que é exatamente o caso do Candidato 304 da homologação.
 */
function povoDoRecorte() {
  return new PortalPainelService(
    banco({
      links: [
        {
          ...VIVO,
          id: "link-a1",
          admissaoId: "a1",
          primeiroAcessoEm: relativo(-9_000),
          ultimoAcessoEm: relativo(-8_000),
          envioOrigem: "AUTOMATICO",
        },
        {
          ...VIVO,
          id: "link-a2",
          admissaoId: "a2",
          primeiroAcessoEm: relativo(-7_000),
          ultimoAcessoEm: relativo(-6_000),
          envioOrigem: "MANUAL",
        },
        { ...VIVO, id: "link-b1", admissaoId: "b1" },
      ],
      cabecalhos: ["a1", "a2", "b1"].map((admissaoId) => ({
        admissaoId,
        nome: `Sintético ${admissaoId}`,
        cargo: "Auxiliar",
        cliente: "Loja 1",
      })),
      noTime: ["a2"],
    }),
    regua({
      progresso: {
        a1: { entregues: 10, total: 10 },
        a2: { entregues: 10, total: 10 },
        b1: { entregues: 10, total: 10 },
      },
    }),
  );
}

const ids = async (p: Promise<{ itens: { admissaoId: string }[] }>) =>
  (await p).itens.map((i) => i.admissaoId).sort();

describe("o recorte do card é do SERVIDOR e ATRAVESSA a aba", () => {
  it("o cenário reproduz o defeito: a aba padrão esconde quem acessou", async () => {
    const s = povoDoRecorte();
    expect(await s.resumo()).toMatchObject({ encaminhados: 3, acessaram: 2, concluiram: 2 });
    // Sem recorte, a aba de trabalho continua mandando, e ela só tem quem não acessou.
    expect(await ids(s.listar({}))).toEqual(["b1"]);
  });

  it("clicar em ACESSARAM traz os dois, mesmo estando na outra aba", async () => {
    const s = povoDoRecorte();
    const pagina = await s.listar({ recorte: "acessaram" });
    expect(pagina.itens.map((i) => i.admissaoId).sort()).toEqual(["a1", "a2"]);
    // O TOTAL ACOMPANHA O RECORTE: paginar sobre um número e mostrar outro é o defeito irmão.
    expect(pagina.total).toBe(2);
  });

  it("o recorte vence a aba pedida explicitamente, e não se anula com ela", async () => {
    const s = povoDoRecorte();
    expect(await ids(s.listar({ aba: "EM_ANDAMENTO", recorte: "concluiram" }))).toEqual([
      "a1",
      "a2",
    ]);
    expect(await ids(s.listar({ aba: "CONCLUIDO", recorte: "naoAcessaram" }))).toEqual(["b1"]);
  });

  it("INTERVENÇÃO HUMANA recorta por queda para o time, inclusive quem já concluiu", async () => {
    expect(await ids(povoDoRecorte().listar({ recorte: "intervencaoHumana" }))).toEqual(["a2"]);
  });

  it("recorte vazio é `todos`, e a aba volta a mandar", async () => {
    const s = povoDoRecorte();
    expect(await ids(s.listar({ recorte: "" }))).toEqual(["b1"]);
    expect(await ids(s.listar({ recorte: "  ", aba: "CONCLUIDO" }))).toEqual(["a1", "a2"]);
  });

  /**
   * VALOR FORA DO CATÁLOGO É 400, e não "todos": cair em "todos" devolveria MAIS linhas do que o
   * pedido, com a tela apresentando o resultado como se o recorte tivesse sido aplicado (§A.28).
   */
  it("recorte desconhecido é recusado, e não descartado em silêncio", async () => {
    await expect(povoDoRecorte().listar({ recorte: "acessou" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /**
   * A PROVA QUE IMPORTA: o número do card e o tamanho do recorte saem da MESMA régua (`noCard`).
   * Era a divergência entre os dois que o diretor viu na tela.
   */
  it.each(["acessaram", "naoAcessaram", "concluiram", "intervencaoHumana"] as const)(
    "o total de `%s` é exatamente o que o card diz",
    async (card) => {
      const s = povoDoRecorte();
      const funil = await s.resumo();
      const pagina = await s.listar({ recorte: card });
      expect(pagina.total).toBe(funil[card]);
      expect(pagina.itens).toHaveLength(funil[card]);
    },
  );

  /**
   * O SEGUNDO DEFEITO, que ninguém tinha reportado: com o recorte no cliente, o card só enxergava
   * a página. Resolvido no servidor, ele enxerga o recorte inteiro e a PÁGINA é que fica pequena.
   */
  it("o recorte é do universo, e não da página: o total não encolhe com `tamanho`", async () => {
    const pagina = await povoDoRecorte().listar({ recorte: "acessaram", tamanho: 1 });
    // O `LIMIT`/`OFFSET` é do banco (e o banco de mentirinha deste arquivo não os aplica), então
    // o que se mede aqui é o que a tela usa para paginar: o TOTAL, que é do recorte inteiro.
    expect(pagina.tamanho).toBe(1);
    expect(pagina.total, "o card voltaria a mentir sobre a primeira página").toBe(2);
  });
});

describe("a coluna de ORIGEM do envio (§A.37: coluna, filtro e catálogo juntos)", () => {
  it("a origem sai do link VIGENTE, nunca de um `max` sobre os links revogados", async () => {
    const s = new PortalPainelService(
      banco({
        links: [
          {
            id: "velho",
            admissaoId: "adm-1",
            criadoEm: relativo(-200_000),
            expiraEm: relativo(-100_000),
            revogadoEm: relativo(-100_000),
            // `MANUAL` > `AUTOMATICO` alfabeticamente: um `max` devolveria o link MORTO.
            envioOrigem: "MANUAL",
          },
          { ...VIVO, id: "novo", admissaoId: "adm-1", envioOrigem: "AUTOMATICO" },
        ],
        cabecalhos: [{ admissaoId: "adm-1", nome: "Sintético", cargo: "Aux", cliente: "Loja" }],
      }),
      regua({}),
    );
    const [linha] = (await s.listar({})).itens;
    expect(linha.origemEnvio).toBe("AUTOMATICO");
    expect(linha.linkJti, "a origem e o `jti` têm de sair da MESMA linha").toBe("novo");
  });

  it("link antigo, sem carimbo, vem com origem nula (e isso não é erro)", async () => {
    const [linha] = (await povoDoRecorte().listar({ aba: "EM_ANDAMENTO" })).itens;
    expect(linha.origemEnvio).toBeNull();
  });

  it("valor fora do catálogo cai em nulo, e não vaza para o contrato", async () => {
    const s = new PortalPainelService(
      banco({
        links: [{ ...VIVO, id: "x", admissaoId: "adm-1", envioOrigem: "SEI_LA" }],
        cabecalhos: [{ admissaoId: "adm-1", nome: "Sintético", cargo: "Aux", cliente: "Loja" }],
      }),
      regua({}),
    );
    expect((await s.listar({})).itens[0].origemEnvio).toBeNull();
  });

  it("o filtro de origem aceita LISTA (§A.28) e atravessa a aba junto do card", async () => {
    const s = povoDoRecorte();
    expect(await ids(s.listar({ recorte: "acessaram", origens: ["MANUAL"] }))).toEqual(["a2"]);
    expect(await ids(s.listar({ recorte: "acessaram", origens: ["MANUAL", "AUTOMATICO"] }))).toEqual(
      ["a1", "a2"],
    );
  });

  it("o valor especial pergunta pelos links SEM origem, que o catálogo fechado não alcançaria", async () => {
    const s = povoDoRecorte();
    expect(await ids(s.listar({ origens: [SEM_ORIGEM_DE_ENVIO] }))).toEqual(["b1"]);
  });

  it("o catálogo traz os três códigos do contrato e o valor especial quando ele tem gente", async () => {
    const catalogo = await povoDoRecorte().catalogoDeFiltros();
    expect(catalogo.origens.map((o) => o.valor)).toEqual([
      ...ORIGENS_DE_ENVIO_DO_LINK,
      SEM_ORIGEM_DE_ENVIO,
    ]);
    // Rótulo em title case (§A.24) e sem travessão (§A.11).
    expect(catalogo.origens.every((o) => o.rotulo.length > 0 && !o.rotulo.includes("—"))).toBe(true);
  });

  it("sem ninguém sem origem, a opção especial não aparece: opção vazia é ruído", async () => {
    const s = new PortalPainelService(
      banco({
        links: [{ ...VIVO, id: "x", admissaoId: "adm-1", envioOrigem: "MANUAL" }],
        cabecalhos: [{ admissaoId: "adm-1", nome: "Sintético", cargo: "Aux", cliente: "Loja" }],
      }),
      regua({}),
    );
    const catalogo = await s.catalogoDeFiltros();
    expect(catalogo.origens.map((o) => o.valor)).not.toContain(SEM_ORIGEM_DE_ENVIO);
  });
});

/**
 * Tira comentário de bloco e de linha. Serve às asserções de campo proibido: este projeto documenta
 * em prosa exatamente os campos que NÃO usa, e varrer o texto inteiro reprovaria a explicação.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
